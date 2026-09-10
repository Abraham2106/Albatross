import { afterEach, describe, expect, it, vi } from 'vitest';
import { QvacInferenceEngine } from '../../src/adapters/inference/qvac';
import type { QvacClient, RequestRun } from '../../src/adapters/inference/qvac/sdk-client';
import { candidate } from '../helpers/inference';
import { pcmToWav, wavToPcm } from '../../src/application/audio';
import { validateExtraction } from '../../src/application/validation';
import { coerceExtraction } from '../../src/adapters/inference/qvac/parse-output';

const transcript = 'Vi dos CT.';
const payload = () => ({ mentionedHospital: { name: null, city: null, country: null, evidence: null }, candidates: [candidate('CT', 2, 'dos CT')] });
function resolved<T>(final: T, requestId = 'request'): RequestRun<T> { return { requestId, final: Promise.resolve(final) }; }
function clientMock() {
  return {
    load: vi.fn((kind: string) => resolved(kind + '-model', 'load-' + kind)),
    complete: vi.fn((_id: string, _history: { role: string; content: string }[], _schema: Record<string, unknown>) => resolved(JSON.stringify(payload()))),
    transcribe: vi.fn((_id: string, _pcm: Uint8Array) => resolved(transcript)),
    cancel: vi.fn(async () => {}), unload: vi.fn(async (_id: string) => {}), close: vi.fn(async () => {}),
  } satisfies QvacClient;
}
afterEach(() => vi.useRealTimers());

describe('QVAC adapter without a real runtime or models', () => {
  it('unloads Qwen before warming Whisper, then swaps back without overlapping models', async () => {
    const client = clientMock();
    const resident = new Set<string>();
    client.load.mockImplementation(kind => {
      expect(resident.size).toBe(0);
      resident.add(kind + '-model');
      return resolved(kind + '-model');
    });
    client.unload.mockImplementation(async (id: string) => { resident.delete(id); });
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    await engine.extractObservations({ hospitalId: 'a', transcript });
    expect(await engine.warm(['stt'])).toEqual({ stt: true, llm: false });
    expect(client.unload).toHaveBeenCalledWith('llm-model');
    await engine.warm(['stt']);
    expect(client.load).toHaveBeenCalledTimes(2);
    const run = await engine.transcribe({ audio: pcmToWav(new Float32Array(16000), 16000), mimeType: 'audio/wav' });
    expect(run.timing?.coldStart).toBe(false);
    await engine.extractObservations({ hospitalId: 'a', transcript });
    expect(client.unload).toHaveBeenCalledWith('stt-model');
    expect(engine.loaded()).toEqual({ stt: false, llm: true });
    await engine.close();
  });
  it('waits for in-flight warm before transcription without loading twice', async () => {
    const client = clientMock();
    let release!: (id: string) => void;
    client.load.mockImplementation(() => ({ requestId: 'warm', final: new Promise<string>(resolve => { release = resolve; }) }));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const warming = engine.warm(['stt']);
    const run = engine.transcribe({ audio: pcmToWav(new Float32Array(16000), 16000), mimeType: 'audio/wav' });
    await vi.waitFor(() => expect(client.load).toHaveBeenCalledOnce());
    expect(client.transcribe).not.toHaveBeenCalled();
    release('stt-model');
    await warming;
    expect((await run).timing?.coldStart).toBe(false);
    expect(client.load).toHaveBeenCalledOnce();
    await engine.close();
  });
  it('rejects a joint preload without allocating either model', async () => {
    const client = clientMock();
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    await expect(engine.warm(['stt', 'llm'])).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(client.load).not.toHaveBeenCalled();
    await engine.close();
  });
  it('never constructs the SDK when models are disabled', async () => {
    const factory = vi.fn(async () => clientMock());
    const engine = new QvacInferenceEngine({ clientFactory: factory });
    await expect(engine.extractObservations({ hospitalId: 'a', transcript })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await engine.close(); expect(factory).not.toHaveBeenCalled();
  });
  it('validates constrained output, reuses models and unloads on close', async () => {
    const client = clientMock();
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const output = await engine.extractObservations({ hospitalId: 'a', transcript });
    expect(output.data.candidates[0].quantity).toBe(2);
    expect(output.provenance).toEqual({ execution: 'local', model: 'QWEN3_4B_INST_Q4_K_M' });
    await engine.extractObservations({ hospitalId: 'a', transcript });
    expect(client.load).toHaveBeenCalledTimes(1);
    expect(client.complete.mock.calls[0]?.[2]).toMatchObject({ additionalProperties: false });
    await engine.close(); expect(client.unload).toHaveBeenCalledWith('llm-model'); expect(client.close).toHaveBeenCalled();
  });
  it('passes raw PCM without WAV headers to SDK transcription', async () => {
    const client = clientMock();
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const audio = pcmToWav(new Float32Array([0, .1, -.1, .3]), 16000);
    await engine.transcribe({ audio, mimeType: 'audio/wav' });
    expect(client.transcribe.mock.calls[0]?.[1]).toEqual(wavToPcm(audio));
    await engine.close();
  });
  it('splits model load from transcription time and marks a warm second run', async () => {
    const client = clientMock();
    client.load.mockImplementation((kind: string) => ({
      requestId: 'load-' + kind,
      final: new Promise<string>(resolve => setTimeout(() => resolve(kind + '-model'), 25)),
    }));
    client.transcribe.mockImplementation(() => ({
      requestId: 'stt',
      final: new Promise<string>(resolve => setTimeout(() => resolve(transcript), 20)),
    }));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const audio = pcmToWav(new Float32Array(16000), 16000);
    const first = await engine.transcribe({ audio, mimeType: 'audio/wav' });
    const second = await engine.transcribe({ audio, mimeType: 'audio/wav' });
    expect(first.timing?.coldStart).toBe(true);
    expect(first.timing!.loadMs).toBeGreaterThanOrEqual(20);
    expect(first.timing!.inferMs).toBeGreaterThanOrEqual(15);
    expect(second.timing?.coldStart).toBe(false);
    expect(second.timing!.loadMs).toBeLessThan(first.timing!.loadMs);
    await engine.close();
  });
  it('keeps Whisper loaded after warm so the next transcription is not a cold start', async () => {
    const client = clientMock();
    client.load.mockImplementation((kind: string) => ({
      requestId: 'load-' + kind,
      final: new Promise<string>(resolve => setTimeout(() => resolve(kind + '-model'), 20)),
    }));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const audio = pcmToWav(new Float32Array(16000), 16000);
    expect(await engine.warm(['stt'])).toEqual({ stt: true, llm: false });
    const run = await engine.transcribe({ audio, mimeType: 'audio/wav' });
    expect(client.load).toHaveBeenCalledTimes(1);
    expect(run.timing?.coldStart).toBe(false);
    await engine.transcribe({ audio, mimeType: 'audio/wav' });
    expect(client.load).toHaveBeenCalledTimes(1);
    await engine.close();
  });
  it('rejects output that is not JSON', async () => {
    const client = clientMock(); client.complete.mockImplementation(() => resolved('not JSON'));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    await expect(engine.extractObservations({ hospitalId: 'a', transcript })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    await engine.close();
  });
  it('repairs extra keys, aliases and inexact evidence from small models', async () => {
    const client = clientMock();
    client.complete.mockImplementation(() => resolved('```json\n' + JSON.stringify({
      mentionedHospital: { name: null, city: null, country: null, evidence: null }, extra: true,
      candidates: [{ modality: 'MRI', scope: 'total', quantity: '2', brand: null, model: null, ageYears: null, ageDescription: null, quantityApproximate: false, ageApproximate: false, unknownFields: [], evidence: 'DOS ct' }],
    }) + '\n```'));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const output = await engine.extractObservations({ hospitalId: 'a', transcript });
    expect(output.data.candidates[0]).toMatchObject({ modality: 'MR', quantity: 2 });
    expect(transcript.toLocaleLowerCase()).toContain(output.data.candidates[0].evidence.toLocaleLowerCase());
    await engine.close();
  });
  it('keeps "Unknown" only where the speaker declared it', async () => {
    const client = clientMock();
    client.complete.mockImplementation(() => resolved(JSON.stringify({
      mentionedHospital: { name: 'Clinica', city: 'Unknown', country: 'Unknown', evidence: 'Vi dos CT.' },
      candidates: [{
        modality: 'CT', scope: 'total', quantity: 2, brand: 'Unknown', model: 'Unknown', ageYears: null,
        ageDescription: null, quantityApproximate: false, ageApproximate: false, unknownFields: ['model'], evidence: 'dos CT',
      }],
    })));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const output = await engine.extractObservations({ hospitalId: 'a', transcript });
    expect(output.data.candidates[0]).toMatchObject({ brand: null, model: 'Unknown' });
    expect(output.data.mentionedHospital).toMatchObject({ city: null, country: null });
    await engine.close();
  });
  it('never converts qualitative age to years or marks an absent age approximate', () => {
    const result = coerceExtraction({ mentionedHospital: {}, candidates: [{
      modality: 'CT', scope: 'group', quantity: null, brand: null, model: null,
      ageYears: 9, ageDescription: 'old', quantityApproximate: true,
      ageApproximate: true, unknownFields: [], evidence: 'CT viejo',
    }] }, 'a', 'CT viejo');
    expect(result.candidates[0]).toMatchObject({ quantity: null, quantityApproximate: false, ageYears: null, ageDescription: 'old', ageApproximate: false });
  });
  it('retries a failed load without caching its failure', async () => {
    const client = clientMock();
    client.load.mockImplementationOnce(() => ({ requestId: 'failed-load', final: Promise.reject(new Error('offline')) }));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    await expect(engine.extractObservations({ hospitalId: 'a', transcript })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await engine.extractObservations({ hospitalId: 'a', transcript });
    expect(client.load).toHaveBeenCalledTimes(2); await engine.close();
  });
  it('cancels the native request and rejects additional work while busy', async () => {
    const client = clientMock();
    let rejectRun!: (e: Error) => void;
    client.complete.mockImplementation(() => ({ requestId: 'slow', final: new Promise((_, reject) => { rejectRun = reject; }) }));
    client.cancel.mockImplementation(async () => { rejectRun(new Error('cancelled')); });
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const controller = new AbortController();
    const pending = engine.extractObservations({ hospitalId: 'a', transcript }, { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.waitFor(() => expect(client.complete).toHaveBeenCalled());
    await expect(engine.extractObservations({ hospitalId: 'a', transcript })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    controller.abort(); await assertion;
    expect(client.cancel).toHaveBeenCalledWith('slow'); await engine.close();
  });
  it('enforces a deadline and cancels real work', async () => {
    vi.useFakeTimers();
    const client = clientMock();
    let rejectRun!: (e: Error) => void;
    client.complete.mockImplementation(() => ({ requestId: 'slow', final: new Promise((_, reject) => { rejectRun = reject; }) }));
    client.cancel.mockImplementation(async () => { rejectRun(new Error('cancelled')); });
    const engine = new QvacInferenceEngine({ enabled: true, timeoutMs: 100, clientFactory: async () => client });
    const assertion = expect(engine.extractObservations({ hospitalId: 'a', transcript })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(101); await assertion;
    expect(client.cancel).toHaveBeenCalledWith('slow'); await engine.close();
  });
  it('cancels a hanging model load before any completion starts', async () => {
    const client = clientMock();
    let rejectRun!: (e: Error) => void;
    client.load.mockImplementation(() => ({ requestId: 'load-slow', final: new Promise((_, reject) => { rejectRun = reject; }) }));
    client.cancel.mockImplementation(async () => { rejectRun(new Error('cancelled')); });
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    const controller = new AbortController();
    const pending = engine.extractObservations({ hospitalId: 'a', transcript }, { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.waitFor(() => expect(client.load).toHaveBeenCalled());
    controller.abort(); await assertion;
    expect(client.cancel).toHaveBeenCalledWith('load-slow');
    expect(client.complete).not.toHaveBeenCalled();
    await engine.close();
  });
  it('retires the runtime when a cancelled request does not drain', async () => {
    vi.useFakeTimers();
    const client = clientMock();
    client.complete.mockImplementation(() => ({ requestId: 'stuck', final: new Promise(() => {}) }));
    const engine = new QvacInferenceEngine({ enabled: true, timeoutMs: 100, clientFactory: async () => client });
    const assertion = expect(engine.extractObservations({ hospitalId: 'a', transcript })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(101);
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(client.close).toHaveBeenCalled();
    await expect(engine.extractObservations({ hospitalId: 'a', transcript })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('rejects follow-up IDs fabricated by the model', async () => {
    const client = clientMock(); client.complete.mockImplementation(() => resolved(JSON.stringify({ questions: [{ gapId: 'wrong', text: 'x' }] })));
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: async () => client });
    await expect(engine.generateFollowUps({ hospitalId: 'a', gaps: [{ id: 'right', description: 'Edad' }] })).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    await engine.close();
  });
});
describe('audio and extraction boundaries', () => {
  it('rejects malformed, non-PCM and wrong-rate WAV before loading any model', async () => {
    const factory = vi.fn(async () => clientMock());
    const engine = new QvacInferenceEngine({ enabled: true, clientFactory: factory });
    const wav = pcmToWav(new Float32Array(100), 16000);
    new DataView(wav.buffer).setUint32(24, 44100, true);
    await expect(engine.transcribe({ audio: wav, mimeType: 'audio/wav' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(engine.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(factory).not.toHaveBeenCalled();
  });
  it('preserves multiple groups and unknown values without merging them by modality', () => {
    const raw = { ...payload(), candidates: [
      { ...candidate('MR', 2, 'dos viejos'), scope: 'group', ageDescription: 'viejos' },
      { ...candidate('MR', 1, 'uno nuevo'), scope: 'group', ageDescription: 'nuevo' },
      { ...candidate('CT', null, 'no sé cuántos CT'), unknownFields: ['quantity'] },
    ] };
    const result = validateExtraction(raw, 'a', 'Vi dos viejos, uno nuevo y no sé cuántos CT.');
    expect(result.candidates).toHaveLength(3); expect(result.candidates[2].quantity).toBeNull();
  });
});

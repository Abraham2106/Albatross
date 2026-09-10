import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSdkClient } from '../../src/adapters/inference/qvac/sdk-client';
import { QvacInferenceEngine } from '../../src/adapters/inference/qvac';
import { candidate } from '../helpers/inference';

const { completion, profiler } = vi.hoisted(() => ({ completion: vi.fn(), profiler: { enable: vi.fn(), disable: vi.fn(), onRecord: vi.fn(() => () => {}) } }));
vi.mock('@qvac/sdk', () => ({
  completion,
  profiler,
  loadModel: vi.fn(() => Object.assign(Promise.resolve('llm-model'), { requestId: 'load' })),
  unloadModel: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
}));
beforeEach(() => { completion.mockReset(); profiler.enable.mockClear(); profiler.disable.mockClear(); });

describe('profiler opt-in', () => {
  it('stays off for the default client and the engine default factory', async () => {
    await createSdkClient(() => {});
    const payload = { mentionedHospital: { name: null, city: null, country: null, evidence: null }, candidates: [candidate('CT', 2, 'dos CT')] };
    completion.mockReturnValue({ requestId: 'r', final: Promise.resolve({ contentText: JSON.stringify(payload) }) });
    const engine = new QvacInferenceEngine({ enabled: true });
    await engine.extractObservations({ hospitalId: 'a', transcript: 'Vi dos CT.' });
    await engine.close();
    expect(profiler.enable).not.toHaveBeenCalled();
    expect(profiler.disable).not.toHaveBeenCalled();
  });
  it('enables verbose profiling only when the client opts in', async () => {
    const client = await createSdkClient(() => {}, undefined, undefined, { profiler: true });
    expect(profiler.enable).toHaveBeenCalledExactlyOnceWith({ mode: 'verbose', includeServerBreakdown: true });
    await client.close();
    expect(profiler.disable).toHaveBeenCalledOnce();
  });
});

describe('optional completion diagnostics', () => {
  it('preserves original output and stop reason before parser coercion', async () => {
    const result = { contentText: '{"unexpected":true}', raw: { fullText: '<think>reason</think>{"unexpected":true}' }, thinkingText: 'reason', stopReason: 'length', stats: {} };
    completion.mockReturnValue({ requestId: 'trace-1', final: Promise.resolve(result) });
    const observe = vi.fn();
    const client = await createSdkClient(() => {}, observe);
    const history = [{ role: 'user', content: 'Original dictation' }];
    const run = client.complete('local-model', history, { type: 'object' });
    expect(run.requestId).toBe('trace-1');
    await expect(run.final).resolves.toBe(result.contentText);
    expect(observe).toHaveBeenCalledExactlyOnceWith({ requestId: 'trace-1', params: expect.objectContaining({ history, generationParams: { temp: 0, predict: 4096, seed: 42 } }), result });
  });
  it('retains the existing string contract without diagnostics', async () => {
    completion.mockReturnValue({ requestId: 'normal', final: Promise.resolve({ contentText: '{}' }) });
    const client = await createSdkClient(() => {});
    await expect(client.complete('model', [], {}).final).resolves.toBe('{}');
  });
  it('does not report a successful completion when inference rejects', async () => {
    completion.mockReturnValue({ requestId: 'failed', final: Promise.reject(new Error('runtime failed')) });
    const observe = vi.fn();
    const client = await createSdkClient(() => {}, observe);
    await expect(client.complete('model', [], {}).final).rejects.toThrow('runtime failed');
    expect(observe).not.toHaveBeenCalled();
  });
});

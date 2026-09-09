import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockInferenceEngine, MOCK_SCENARIOS } from '../../src/adapters/inference/mock';
import type { InferenceEngine, ObservationCandidate } from '../../src/application/ports/inference-engine';

afterEach(() => vi.useRealTimers());

describe('mock inference boundary', () => {
  it.each(Object.keys(MOCK_SCENARIOS) as (keyof typeof MOCK_SCENARIOS)[])(
    'supports the infrastructure flow for %s without confirming observations', async (scenario) => {
      const engine: InferenceEngine = new MockInferenceEngine({ scenario });
      const transcript = await engine.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' });
      const result = await engine.extractObservations({ hospitalId: 'alpha', transcript: transcript.data.text });
      expect(result.provenance).toEqual({ execution: 'mock', scenario });
      expect(result.data.hospitalId).toBe('alpha');
      expect(result.data.candidates).toEqual(MOCK_SCENARIOS[scenario].candidates);
      for (const candidate of result.data.candidates) {
        expect(transcript.data.text).toContain(candidate.evidence);
        expect(candidate).not.toHaveProperty('status');
        expect(candidate).not.toHaveProperty('authorId');
      }
    },
  );

  it('preserves conflicting values for domain reconciliation', async () => {
    const engine = new MockInferenceEngine({ scenario: 'conflicting-count' });
    const result = await engine.extractObservations({ hospitalId: 'alpha', transcript: MOCK_SCENARIOS['conflicting-count'].transcript });
    expect(result.data.candidates.map((candidate) => candidate.value)).toEqual([3, 4]);
  });

  it('does not turn an unknown transcript into fabricated findings', async () => {
    await expect(new MockInferenceEngine().extractObservations({ hospitalId: 'alpha', transcript: 'Something else' }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_INPUT' });
  });

  it('phrases only supplied gaps, retaining order and IDs', async () => {
    const engine = new MockInferenceEngine();
    const result = await engine.generateFollowUps({ hospitalId: 'alpha', gaps: [
      { id: 'mr-count', description: 'cantidad de MR' }, { id: 'ct-age', description: 'edad del CT' },
    ] });
    expect(result.data.map((question) => question.gapId)).toEqual(['mr-count', 'ct-age']);
    expect((await engine.generateFollowUps({ hospitalId: 'alpha', gaps: [] })).data).toEqual([]);
  });

  it('rejects invalid inputs before simulating inference', async () => {
    const engine = new MockInferenceEngine();
    await expect(engine.transcribe({ audio: new Uint8Array(), mimeType: 'audio/webm' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(engine.transcribe({ audio: new Uint8Array([1]), mimeType: 'text/plain' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(engine.extractObservations({ hospitalId: '', transcript: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(engine.generateFollowUps({ hospitalId: 'alpha', gaps: [{ id: 'a', description: 'x' }, { id: 'a', description: 'y' }] }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(() => new MockInferenceEngine({ latencyMs: NaN })).toThrow();
  });

  it.each(['transcribe', 'extractObservations', 'generateFollowUps'] as const)('simulates %s unavailability', async (operation) => {
    const engine = new MockInferenceEngine({ failures: { [operation]: 'UNAVAILABLE' } });
    const calls = {
      transcribe: () => engine.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' }),
      extractObservations: () => engine.extractObservations({ hospitalId: 'alpha', transcript: MOCK_SCENARIOS['post-visit'].transcript }),
      generateFollowUps: () => engine.generateFollowUps({ hospitalId: 'alpha', gaps: [] }),
    };
    await expect(calls[operation]()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('simulates a delayed timeout without real waiting', async () => {
    vi.useFakeTimers();
    const engine = new MockInferenceEngine({ latencyMs: 500, failures: { transcribe: 'TIMEOUT' } });
    const pending = engine.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('does not share mutable results across requests or instances', async () => {
    const request = { hospitalId: 'alpha', transcript: MOCK_SCENARIOS['post-visit'].transcript };
    const engine = new MockInferenceEngine();
    const result = await engine.extractObservations(request);
    (result.data.candidates as ObservationCandidate[]).pop();
    expect((await engine.extractObservations(request)).data.candidates).toHaveLength(2);
    expect((await new MockInferenceEngine().extractObservations(request)).data.candidates).toHaveLength(2);
  });
});

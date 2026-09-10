import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSdkClient } from '../../src/adapters/inference/qvac/sdk-client';

const { completion } = vi.hoisted(() => ({ completion: vi.fn() }));
vi.mock('@qvac/sdk', () => ({
  completion,
  profiler: {
    enable: vi.fn(),
    disable: vi.fn(),
    onRecord: vi.fn(() => () => {}),
  },
}));
beforeEach(() => completion.mockReset());

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

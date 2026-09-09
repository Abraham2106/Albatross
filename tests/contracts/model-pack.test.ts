import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectModels, MODEL_TARGETS, modelsDir } from '../../src/adapters/inference/qvac/model-pack';

describe('model pack inventory', () => {
  it('reports missing weights in an empty folder', () => {
    const dir = join(tmpdir(), 'philips-models-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const status = inspectModels(dir);
    expect(status.ready).toBe(false);
    expect(status.items).toHaveLength(MODEL_TARGETS.length);
    expect(status.totalBytes).toBe(MODEL_TARGETS.reduce((sum, item) => sum + item.expected, 0));
    expect(status.items.every(item => !item.ready && item.bytes === 0)).toBe(true);
  });
  it('marks a file ready only when the size matches', () => {
    const dir = join(tmpdir(), 'philips-models-partial-' + Date.now());
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, MODEL_TARGETS[0].file), Buffer.alloc(8));
    const status = inspectModels(dir);
    expect(status.items[0]?.ready).toBe(false);
    expect(modelsDir().endsWith('models')).toBe(true);
  });
});

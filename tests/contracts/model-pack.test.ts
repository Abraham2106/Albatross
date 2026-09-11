import { closeSync, ftruncateSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeLlm, inspectModels, LLM_VARIANTS, STT_TARGET, writeLlmChoice, modelsDir } from '../../src/adapters/inference/qvac/model-pack';

function placeholder(path: string, bytes: number) {
  const fd = openSync(path, 'w');
  ftruncateSync(fd, bytes);
  closeSync(fd);
}

describe('model pack inventory', () => {
  it('reports missing weights in an empty folder', () => {
    const dir = join(tmpdir(), 'philips-models-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const status = inspectModels(dir);
    expect(status.ready).toBe(false);
    expect(status.llm).toBe('4b');
    expect(status.items).toHaveLength(3);
    expect(status.items[2]?.optional).toBe(true);
    expect(status.totalBytes).toBe(STT_TARGET.expected + LLM_VARIANTS['4b'].expected + LLM_VARIANTS['1.7b'].expected);
    expect(status.items.every(item => !item.ready && item.bytes === 0)).toBe(true);
  });
  it('marks a file ready only when the size matches', () => {
    const dir = join(tmpdir(), 'philips-models-partial-' + Date.now());
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, STT_TARGET.file), Buffer.alloc(8));
    const status = inspectModels(dir);
    expect(status.items[0]?.ready).toBe(false);
    expect(modelsDir().endsWith('models')).toBe(true);
  });
  it('is ready with Whisper plus optional 1.7B when 4B is missing', () => {
    const dir = join(tmpdir(), 'philips-models-small-' + Date.now());
    mkdirSync(dir, { recursive: true });
    placeholder(join(dir, STT_TARGET.file), STT_TARGET.expected);
    placeholder(join(dir, LLM_VARIANTS['1.7b'].file), LLM_VARIANTS['1.7b'].expected);
    const status = inspectModels(dir);
    expect(status.ready).toBe(true);
    expect(status.llm).toBe('1.7b');
    expect(activeLlm(dir).name).toBe('QWEN3_1_7B_INST_Q4');
  });
  it('keeps the chosen 1.7B once both weights exist', () => {
    const dir = join(tmpdir(), 'philips-models-both-' + Date.now());
    mkdirSync(dir, { recursive: true });
    placeholder(join(dir, STT_TARGET.file), STT_TARGET.expected);
    placeholder(join(dir, LLM_VARIANTS['4b'].file), LLM_VARIANTS['4b'].expected);
    placeholder(join(dir, LLM_VARIANTS['1.7b'].file), LLM_VARIANTS['1.7b'].expected);
    writeLlmChoice('1.7b', dir);
    expect(inspectModels(dir).llm).toBe('1.7b');
    expect(activeLlm(dir).variant).toBe('1.7b');
  });
});

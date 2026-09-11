import { describe, expect, it } from 'vitest';
import { DEMO_LAPTOP, evaluateFit, fitLevel } from '../../src/application/qvac-fit';
import { parseNvidiaSmiCsv, probeHardware, vendorOf } from '../../src/adapters/inference/qvac/hardware-probe';
import type { HardwareSnapshot } from '../../src/application/ports/qvac-fit';

const GiB = 1024 ** 3;

describe('qvac-fit', () => {
  it('scores utilization bands', () => {
    expect(fitLevel(0.5)).toBe('perfect');
    expect(fitLevel(0.79)).toBe('good');
    expect(fitLevel(0.9)).toBe('marginal');
    expect(fitLevel(0.96)).toBe('tooTight');
  });

  it('keeps sequential allowed and blocks hot on the demo RTX 2050', () => {
    const report = evaluateFit(DEMO_LAPTOP);
    const byId = (id: string) => report.policies.find(item => item.id === id);
    expect(byId('sequential_local')?.allowed).toBe(true);
    expect(byId('sequential_local')?.fit).toBe('good');
    expect(byId('hot_stt_llm')).toMatchObject({ allowed: false, fit: 'tooTight' });
    expect(byId('hot_all')).toMatchObject({ allowed: false, fit: 'tooTight' });
    expect(byId('vision_delegated')?.allowed).toBe(true);
    expect(report.recommendation).toBe('vision_delegated');
    expect(report.llm).toBe('4b');
    expect(report.recommendedLlm).toBe('4b');
    expect(report.roles.map(role => role.model)).toEqual([
      'WHISPER_LARGE_V3_TURBO',
      'QWEN3_4B_INST_Q4_K_M',
      'VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M',
    ]);
  });

  it('recommends Qwen 1.7B when 4B does not fit VRAM', () => {
    const tight: HardwareSnapshot = { ...DEMO_LAPTOP, vramBytes: 3 * GiB, vramStatus: 'supported', vramSource: 'nvidia-smi' };
    const report = evaluateFit(tight);
    expect(report.llmChoices.find(item => item.variant === '4b')?.fit).toBe('tooTight');
    expect(report.llmChoices.find(item => item.variant === '1.7b')?.fit).not.toBe('tooTight');
    expect(report.recommendedLlm).toBe('1.7b');
    const small = evaluateFit(tight, { llm: '1.7b' });
    expect(small.roles.find(role => role.role === 'llm')?.model).toBe('QWEN3_1_7B_INST_Q4');
    expect(small.policies.find(item => item.id === 'sequential_local')?.allowed).toBe(true);
  });

  it('allows hot_stt_llm on a machine with 16 GiB VRAM and 32 GiB RAM', () => {
    const fat: HardwareSnapshot = {
      ...DEMO_LAPTOP,
      ramBytes: 32 * GiB,
      ramUsedBytes: 8 * GiB,
      gpuName: 'NVIDIA GeForce RTX 4080',
      vramBytes: 16 * GiB,
      vramStatus: 'supported',
      vramSource: 'nvidia-smi',
    };
    const report = evaluateFit(fat);
    expect(report.policies.find(item => item.id === 'hot_stt_llm')?.allowed).toBe(true);
    expect(report.policies.find(item => item.id === 'hot_all')?.allowed).toBe(true);
    expect(report.recommendation).toBe('hot_all');
  });

  it('does not allow hot when VRAM is unverified', () => {
    const report = evaluateFit({ ...DEMO_LAPTOP, vramBytes: null, vramStatus: 'unverified', vramSource: 'qvac-unverified' });
    expect(report.policies.find(item => item.id === 'hot_stt_llm')?.allowed).toBe(false);
    expect(report.policies.find(item => item.id === 'sequential_local')?.allowed).toBe(true);
  });
});

describe('hardware probe parsers', () => {
  it('reads nvidia-smi CSV and skips N/A rows', () => {
    expect(parseNvidiaSmiCsv('AMD Radeon Graphics, [N/A]\nNVIDIA GeForce RTX 2050, 4096\n')).toEqual([
      { name: 'NVIDIA GeForce RTX 2050', vramBytes: 4096 * 1024 * 1024 },
    ]);
  });

  it('classifies GPU vendors', () => {
    expect(vendorOf('NVIDIA GeForce RTX 2050')).toBe('nvidia');
    expect(vendorOf('AMD Radeon(TM) Graphics')).toBe('amd');
  });

  it('prefers nvidia-smi over WMI when both exist', () => {
    const snapshot = probeHardware({
      pin: () => ({ index: 1, name: 'NVIDIA GeForce RTX 2050' }),
      cpus: () => [{ model: 'AMD Ryzen 5 7535HS' }],
      totalmem: () => 16 * GiB,
      freemem: () => 2 * GiB,
      platform: 'win32',
      execFile: (file, args) => {
        if (String(file).includes('nvidia-smi') || file === 'nvidia-smi') {
          if (args.includes('--query-gpu=name,memory.total')) return 'NVIDIA GeForce RTX 2050, 4096\n';
        }
        throw new Error('unexpected ' + file);
      },
    });
    expect(snapshot.vramSource).toBe('nvidia-smi');
    expect(snapshot.vramStatus).toBe('supported');
    expect(snapshot.vramBytes).toBe(4096 * 1024 * 1024);
  });
});

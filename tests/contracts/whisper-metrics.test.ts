import { describe, expect, it } from 'vitest';
import { pcm16ToWav, pcmToWav, Pcm16Downsampler, resolveCaptureRate, SAMPLE_RATE, wavToPcm } from '../../src/application/audio';
import { countWords, pcmDurationMs, summarizeWhisperSpeed } from '../../src/application/whisper-metrics';

describe('whisper speed metrics', () => {
  it('converts PCM16 bytes at 16 kHz into milliseconds', () => {
    expect(pcmDurationMs(32000)).toBe(1000);
    expect(pcmDurationMs(0)).toBe(0);
  });

  it('reports realtime factor and speed against audio duration', () => {
    const result = summarizeWhisperSpeed({
      text: 'Vi dos CT en el hospital.',
      model: 'WHISPER_LARGE_V3_TURBO',
      pcmBytes: 32000,
      loadMs: 1200,
      inferMs: 250,
      totalMs: 1450,
      coldStart: false,
      backend: { device: 'gpu', name: 'whispercpp', graphicsApi: 'vulkan' },
    });
    expect(result.audioMs).toBe(1000);
    expect(result.rtf).toBeCloseTo(0.25);
    expect(result.xRealtime).toBeCloseTo(4);
    expect(result.words).toBe(countWords('Vi dos CT en el hospital.'));
    expect(result.device).toBe('gpu');
    expect(result.backend).toBe('whispercpp');
    expect(result.graphicsApi).toBe('vulkan');
  });

  it('omits ratios when inference did not run', () => {
    const result = summarizeWhisperSpeed({
      text: '',
      model: 'WHISPER_LARGE_V3_TURBO',
      pcmBytes: 0,
      loadMs: 10,
      inferMs: 0,
      totalMs: 10,
      coldStart: true,
    });
    expect(result.rtf).toBeNull();
    expect(result.xRealtime).toBeNull();
    expect(result.words).toBe(0);
  });
});

describe('capture rate vs 16 kHz WAV tests', () => {
  it('detects 48 kHz capture when AudioContext still reports 16 kHz', () => {
    expect(resolveCaptureRate(48000 * 40, 16000, 40)).toBeCloseTo(48000, 0);
    expect(resolveCaptureRate(16000 * 40, 16000, 40)).toBe(16000);
  });

  it('downsamples 40 s at 48 kHz to 40 s at 16 kHz, not 120 s', () => {
    const wav = pcmToWav(new Float32Array(48000 * 40), 48000);
    expect(wavToPcm(wav).byteLength).toBe(SAMPLE_RATE * 40 * 2);
    expect(pcmDurationMs(wavToPcm(wav).byteLength)).toBe(40000);
  });

  it('round-trips PCM16 into a WAV that Whisper file tests can read', () => {
    const pcm = wavToPcm(pcmToWav(new Float32Array(16000), 16000));
    const wav = pcm16ToWav(pcm);
    expect(wavToPcm(wav)).toEqual(pcm);
  });

  it('downsamples live 48 kHz chunks to 16 kHz PCM16', () => {
    const down = new Pcm16Downsampler(48000);
    const chunk = new Float32Array(4800);
    for (let i = 0; i < chunk.length; i++) chunk[i] = i % 2 ? 0.5 : -0.5;
    const pcm = down.push(chunk);
    expect(pcm.byteLength).toBe(1600 * 2);
  });
});

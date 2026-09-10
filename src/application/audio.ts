import { invalid } from './validation';
export const MAX_AUDIO_SECONDS = 120;
export const SAMPLE_RATE = 16000;
export const MAX_AUDIO_BYTES = SAMPLE_RATE * 2 * MAX_AUDIO_SECONDS + 4096;

export function asAudioBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value.byteOffset === 0 && value.byteLength === value.buffer.byteLength ? value : value.slice();
  }
  if (value && typeof value === 'object' && ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
  }
  invalid('Audio inválido.');
}

/**
 * Electron often ignores AudioContext({ sampleRate: 16000 }) and captures at 44.1/48 kHz.
 * If the context still reports 16 kHz, 40 s of speech become ~120 s of PCM and Whisper
 * looks ~3× slower than a real 16 kHz WAV used in direct tests.
 */
export function resolveCaptureRate(sampleCount: number, reportedRate: number, elapsedSec: number): number {
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) return reportedRate;
  if (!Number.isFinite(reportedRate) || reportedRate < SAMPLE_RATE) return SAMPLE_RATE;
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0.25) return reportedRate;
  const implied = sampleCount / elapsedSec;
  if (implied > reportedRate * 1.25) return implied;
  return reportedRate;
}

/** Accept a real RIFF/WAVE PCM16 mono 16kHz file; return samples, excluding headers. */
export function wavToPcm(audio: Uint8Array): Uint8Array {
  if (!(audio instanceof Uint8Array) || audio.byteLength < 44 || audio.byteLength > MAX_AUDIO_BYTES) invalid('Audio vacío o mayor de dos minutos.');
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const ascii = (at: number, count: number) => String.fromCharCode(...audio.subarray(at, at + count));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE' || view.getUint32(4, true) + 8 !== audio.length) invalid('Se requiere un archivo WAV completo.');
  let pcm: Uint8Array | undefined;
  let format = false;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > audio.length) invalid('Archivo WAV truncado.');
    const tag = ascii(offset, 4);
    if (tag === 'fmt ') {
      if (format || size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 ||
        view.getUint32(start + 4, true) !== SAMPLE_RATE || view.getUint16(start + 14, true) !== 16 ||
        view.getUint16(start + 12, true) !== 2 || view.getUint32(start + 8, true) !== SAMPLE_RATE * 2) invalid('Usa WAV PCM de 16 bits, mono, 16 kHz.');
      format = true;
    }
    if (tag === 'data') { if (pcm) invalid('WAV con m?ltiples bloques de audio.'); pcm = audio.slice(start, start + size); }
    offset = start + size + (size % 2);
  }
  if (!format || !pcm?.length || pcm.length % 2 || pcm.length > SAMPLE_RATE * 2 * MAX_AUDIO_SECONDS) invalid('Muestras PCM inválidas o audio demasiado largo.');
  return pcm;
}
export function pcmToWav(samples: Float32Array, inputRate: number): Uint8Array {
  if (!Number.isFinite(inputRate) || inputRate < SAMPLE_RATE || samples.length / inputRate > MAX_AUDIO_SECONDS) invalid('Duración o frecuencia de audio inválida.');
  const length = Math.floor(samples.length * SAMPLE_RATE / inputRate);
  const bytes = new Uint8Array(44 + length * 2);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, length * 2, true);
  if (Math.abs(inputRate - SAMPLE_RATE) < 0.5) {
    for (let i = 0; i < length; i++) {
      const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
      view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
    return bytes;
  }
  for (let i = 0; i < length; i++) {
    const first = Math.floor(i * inputRate / SAMPLE_RATE);
    const last = Math.max(first + 1, Math.floor((i + 1) * inputRate / SAMPLE_RATE));
    let sum = 0;
    for (let j = first; j < last; j++) sum += samples[j] ?? 0;
    const value = Math.max(-1, Math.min(1, sum / (last - first)));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}

function floatToInt16(view: DataView, index: number, sample: number) {
  const value = Math.max(-1, Math.min(1, sample));
  view.setInt16(index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
}

/** Downsample capture rate to 16 kHz PCM16 as chunks arrive. */
export class Pcm16Downsampler {
  private pending = new Float32Array(0);
  constructor(public inputRate: number) {}
  reset(inputRate = this.inputRate) {
    this.inputRate = inputRate;
    this.pending = new Float32Array(0);
  }
  push(samples: Float32Array): Uint8Array {
    if (!samples.length) return new Uint8Array(0);
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending);
    merged.set(samples, this.pending.length);
    const ratio = Math.max(this.inputRate / SAMPLE_RATE, 1);
    const outCount = Math.floor(merged.length / ratio);
    if (outCount <= 0) {
      this.pending = merged;
      return new Uint8Array(0);
    }
    const pcm = new Uint8Array(outCount * 2);
    const view = new DataView(pcm.buffer);
    for (let i = 0; i < outCount; i++) {
      const first = Math.floor(i * ratio);
      const last = Math.max(first + 1, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = first; j < last; j++) sum += merged[j] ?? 0;
      floatToInt16(view, i, sum / (last - first));
    }
    this.pending = merged.subarray(Math.floor(outCount * ratio));
    return pcm;
  }
}

export function pcm16ToWav(pcm: Uint8Array): Uint8Array {
  if (pcm.byteLength % 2) invalid('Muestras PCM inválidas.');
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, pcm.byteLength, true);
  bytes.set(pcm, 44);
  return bytes;
}

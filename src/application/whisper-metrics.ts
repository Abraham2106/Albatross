export interface WhisperSpeedInput {
  text: string;
  model: string;
  pcmBytes: number;
  loadMs: number;
  inferMs: number;
  totalMs: number;
  coldStart: boolean;
  backend?: { device: 'cpu' | 'gpu'; name: string; graphicsApi?: string };
}

export interface WhisperSpeedResult {
  text: string;
  model: string;
  audioMs: number;
  loadMs: number;
  inferMs: number;
  wallMs: number;
  rtf: number | null;
  xRealtime: number | null;
  coldStart: boolean;
  words: number;
  device?: 'cpu' | 'gpu';
  backend?: string;
  graphicsApi?: string;
}

export function pcmDurationMs(pcmBytes: number, sampleRate = 16000): number {
  if (!Number.isFinite(pcmBytes) || pcmBytes <= 0) return 0;
  return (pcmBytes / 2) * (1000 / sampleRate);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** RTF = inferencia / audio. Menor que 1 es más rápido que tiempo real. */
export function summarizeWhisperSpeed(input: WhisperSpeedInput): WhisperSpeedResult {
  const audioMs = pcmDurationMs(input.pcmBytes);
  const inferMs = Math.max(0, input.inferMs);
  return {
    text: input.text,
    model: input.model,
    audioMs,
    loadMs: Math.max(0, input.loadMs),
    inferMs,
    wallMs: Math.max(0, input.totalMs),
    rtf: audioMs > 0 ? inferMs / audioMs : null,
    xRealtime: inferMs > 0 ? audioMs / inferMs : null,
    coldStart: input.coldStart,
    words: countWords(input.text),
    ...(input.backend?.device ? { device: input.backend.device } : {}),
    ...(input.backend?.name ? { backend: input.backend.name } : {}),
    ...(input.backend?.graphicsApi ? { graphicsApi: input.backend.graphicsApi } : {}),
  };
}

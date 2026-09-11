import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LlmVariant } from '../../../application/ports/qvac-fit';

export type { LlmVariant };

export const STT_FILE = 'ggml-large-v3-turbo.bin';
export const LLM_FILE = 'Qwen3-4B-Q4_K_M.gguf';
export const LLM_SMALL_FILE = 'Qwen3-1.7B-Q4_0.gguf';

export interface ModelTarget {
  readonly name: string;
  readonly label: string;
  readonly file: string;
  readonly url: string;
  readonly expected: number;
}

export const STT_TARGET: ModelTarget = {
  name: 'WHISPER_LARGE_V3_TURBO',
  label: 'Whisper Turbo F16',
  file: STT_FILE,
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo.bin',
  expected: 1624555275,
};

export const LLM_VARIANTS: Record<LlmVariant, ModelTarget & { variant: LlmVariant; quant: string }> = {
  '4b': {
    variant: '4b',
    name: 'QWEN3_4B_INST_Q4_K_M',
    label: 'Qwen3 4B',
    file: LLM_FILE,
    quant: 'Q4_K_M',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/22c9fc8a8c7700b76a1789366280a6a5a1ad1120/Qwen3-4B-Q4_K_M.gguf',
    expected: 2497281312,
  },
  '1.7b': {
    variant: '1.7b',
    name: 'QWEN3_1_7B_INST_Q4',
    label: 'Qwen3 1.7B',
    file: LLM_SMALL_FILE,
    quant: 'Q4_0',
    url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/ff7d5e87ccacec820d2a15d2d609a40dee35488c/Qwen3-1.7B-Q4_0.gguf',
    expected: 1056782912,
  },
};

/** Default pack: Whisper + Qwen 4B. 1.7B is optional. */
export const MODEL_TARGETS = [STT_TARGET, LLM_VARIANTS['4b']] as const;

export interface ModelPackItem {
  name: string;
  label: string;
  file: string;
  ready: boolean;
  bytes: number;
  expected: number;
  optional?: boolean;
}
export interface ModelPackStatus {
  ready: boolean;
  totalBytes: number;
  llm: LlmVariant;
  items: ModelPackItem[];
}

export function modelsDir(root = process.cwd()) {
  return join(root, 'models');
}

function choicePath(dir: string) {
  return join(dir, 'llm-variant.txt');
}

export function readLlmChoice(dir = modelsDir()): LlmVariant {
  try {
    const raw = readFileSync(choicePath(dir), 'utf8').trim();
    if (raw === '1.7b' || raw === '4b') return raw;
  } catch { /* default */ }
  return '4b';
}

export function writeLlmChoice(variant: LlmVariant, dir = modelsDir()) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(choicePath(dir), variant + '\n');
}

export function activeLlm(dir = modelsDir()) {
  const chosen = readLlmChoice(dir);
  const four = inspectOne(LLM_VARIANTS['4b'], dir);
  const small = inspectOne(LLM_VARIANTS['1.7b'], dir);
  let variant: LlmVariant = chosen;
  if (chosen === '4b' && !four.ready && small.ready) variant = '1.7b';
  if (chosen === '1.7b' && !small.ready && four.ready) variant = '4b';
  const target = LLM_VARIANTS[variant];
  const path = join(dir, target.file);
  return { ...target, path: existsSync(path) ? path : undefined, ready: inspectOne(target, dir).ready };
}

function inspectOne(target: ModelTarget, dir: string): ModelPackItem {
  const path = join(dir, target.file);
  const bytes = existsSync(path) ? statSync(path).size : 0;
  return { name: target.name, label: target.label, file: target.file, ready: bytes === target.expected, bytes, expected: target.expected };
}

export function inspectModels(dir = modelsDir()): ModelPackStatus {
  const stt = inspectOne(STT_TARGET, dir);
  const large = inspectOne(LLM_VARIANTS['4b'], dir);
  const small = { ...inspectOne(LLM_VARIANTS['1.7b'], dir), optional: true };
  const items = [stt, large, small];
  return {
    ready: stt.ready && (large.ready || small.ready),
    totalBytes: items.reduce((sum, item) => sum + item.expected, 0),
    llm: activeLlm(dir).variant,
    items,
  };
}

export async function downloadAll(options: { dir?: string; llm?: LlmVariant; onProgress?: (message: string) => void; signal?: AbortSignal } = {}): Promise<ModelPackStatus> {
  const dir = options.dir ?? modelsDir();
  mkdirSync(dir, { recursive: true });
  const llm = options.llm ?? readLlmChoice(dir);
  const targets: ModelTarget[] = [STT_TARGET, LLM_VARIANTS[llm]];
  for (const target of targets) {
    const dest = join(dir, target.file);
    if (existsSync(dest) && statSync(dest).size === target.expected) {
      options.onProgress?.(target.label + ': ya está');
      continue;
    }
    await downloadOne(target, dest, options.onProgress, options.signal);
  }
  if (options.llm) writeLlmChoice(options.llm, dir);
  const status = inspectModels(dir);
  if (!status.ready) throw new Error('La descarga de modelos quedó incompleta.');
  return status;
}

async function downloadOne(
  target: ModelTarget,
  dest: string,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
) {
  const part = dest + '.part';
  try { unlinkSync(part); } catch { /* no leftover */ }
  const response = await fetch(target.url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error('No se pudo descargar ' + target.label + ' (' + response.status + ').');
  const total = Number(response.headers.get('content-length')) || target.expected;
  const file = createWriteStream(part);
  const reader = response.body.getReader();
  let received = 0;
  let last = -1;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      await writeChunk(file, value);
      const percent = Math.min(100, Math.floor((received / total) * 100));
      if (percent !== last) {
        last = percent;
        onProgress?.(target.label + ': ' + percent + '%');
      }
    }
    await closeStream(file);
    if (!existsSync(part) || statSync(part).size !== target.expected) {
      throw new Error(target.label + ' incompleto: ' + (existsSync(part) ? statSync(part).size : 0) + ' vs ' + target.expected);
    }
    renameSync(part, dest);
    onProgress?.(target.label + ': listo');
  } catch (error) {
    file.destroy();
    try { unlinkSync(part); } catch { /* ignore */ }
    throw error;
  }
}

function writeChunk(file: ReturnType<typeof createWriteStream>, chunk: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    file.write(chunk, error => error ? reject(error) : resolve());
  });
}

function closeStream(file: ReturnType<typeof createWriteStream>) {
  return new Promise<void>((resolve, reject) => {
    file.end((error: Error | null | undefined) => error ? reject(error) : resolve());
  });
}

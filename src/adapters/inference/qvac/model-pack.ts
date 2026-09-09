import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const STT_FILE = 'ggml-large-v3-turbo.bin';
export const LLM_FILE = 'Qwen3-4B-Q4_K_M.gguf';

export const MODEL_TARGETS = [
  {
    name: 'WHISPER_LARGE_V3_TURBO',
    label: 'Whisper Turbo F16',
    file: STT_FILE,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo.bin',
    expected: 1624555275,
  },
  {
    name: 'QWEN3_4B_INST_Q4_K_M',
    label: 'Qwen3 4B',
    file: LLM_FILE,
    url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/22c9fc8a8c7700b76a1789366280a6a5a1ad1120/Qwen3-4B-Q4_K_M.gguf',
    expected: 2497281312,
  },
] as const;

export interface ModelPackItem {
  name: string;
  label: string;
  file: string;
  ready: boolean;
  bytes: number;
  expected: number;
}
export interface ModelPackStatus {
  ready: boolean;
  totalBytes: number;
  items: ModelPackItem[];
}

export function modelsDir(root = process.cwd()) {
  return join(root, 'models');
}

export function inspectModels(dir = modelsDir()): ModelPackStatus {
  const items = MODEL_TARGETS.map(target => {
    const path = join(dir, target.file);
    const bytes = existsSync(path) ? statSync(path).size : 0;
    return { name: target.name, label: target.label, file: target.file, ready: bytes === target.expected, bytes, expected: target.expected };
  });
  return { ready: items.every(item => item.ready), totalBytes: items.reduce((sum, item) => sum + item.expected, 0), items };
}

export async function downloadAll(options: { dir?: string; onProgress?: (message: string) => void; signal?: AbortSignal } = {}): Promise<ModelPackStatus> {
  const dir = options.dir ?? modelsDir();
  mkdirSync(dir, { recursive: true });
  for (const target of MODEL_TARGETS) {
    const dest = join(dir, target.file);
    if (existsSync(dest) && statSync(dest).size === target.expected) {
      options.onProgress?.(target.label + ': ya está');
      continue;
    }
    await downloadOne(target, dest, options.onProgress, options.signal);
  }
  const status = inspectModels(dir);
  if (!status.ready) throw new Error('La descarga de modelos quedó incompleta.');
  return status;
}

async function downloadOne(
  target: (typeof MODEL_TARGETS)[number],
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

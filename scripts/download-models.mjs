import { mkdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'models');
mkdirSync(dir, { recursive: true });

const targets = [
  {
    name: 'WHISPER_LARGE_V3_TURBO_Q8_0',
    file: 'ggml-large-v3-turbo-q8_0.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q8_0.bin',
    expected: 874188075,
  },
  {
    name: 'QWEN3_4B_INST_Q4_K_M',
    file: 'Qwen3-4B-Q4_K_M.gguf',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/22c9fc8a8c7700b76a1789366280a6a5a1ad1120/Qwen3-4B-Q4_K_M.gguf',
    expected: 2497281312,
  },
];

function ok(path, expected) {
  return existsSync(path) && statSync(path).size === expected;
}

for (const t of targets) {
  const dest = join(dir, t.file);
  if (ok(dest, t.expected)) {
    console.log('Ya existe', t.name, dest);
    continue;
  }
  console.log('Descargando', t.name, '→', dest);
  const result = spawnSync('curl.exe', ['-L', '--fail', '--retry', '3', '--retry-all-errors', '-o', dest, t.url], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('Fallo al descargar ' + t.name);
  if (!ok(dest, t.expected)) throw new Error(t.name + ' incompleto: ' + (existsSync(dest) ? statSync(dest).size : 0) + ' vs ' + t.expected);
  console.log('Listo', t.name);
}

console.log('Descarga completa en', dir);
console.log('STT:', join(dir, 'ggml-large-v3-turbo-q8_0.bin'));
console.log('LLM:', join(dir, 'Qwen3-4B-Q4_K_M.gguf'));

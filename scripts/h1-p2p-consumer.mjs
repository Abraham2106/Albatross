/** H1 1.3 consumer: delegate a completion (optional image) to a QVAC provider. fallbackToLocal is false. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = join(root, 'reports/h1');
const imagePath = join(root, 'fixtures/h1/placa-sintetica.png');
mkdirSync(outDir, { recursive: true });

const providerPublicKey = process.env.QVAC_PROVIDER_PUBLIC_KEY
  ?? (existsSync(join(outDir, '1.3-provider.json'))
    ? JSON.parse(readFileSync(join(outDir, '1.3-provider.json'), 'utf8')).publicKey
    : undefined);
if (!providerPublicKey) {
  console.error('Falta QVAC_PROVIDER_PUBLIC_KEY o reports/h1/1.3-provider.json');
  process.exit(1);
}

const withImage = process.argv.includes('--image');
if (withImage && !existsSync(imagePath)) {
  console.error('Falta fixtures/h1/placa-sintetica.png');
  process.exit(1);
}

const started = performance.now();
const report = {
  package: '1.3',
  at: new Date().toISOString(),
  sdk: '0.18.2',
  providerPublicKey,
  fallbackToLocal: false,
  withImage,
  ok: false,
};
if (withImage) {
  const bytes = readFileSync(imagePath);
  report.image = { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), path: imagePath };
}

const sdk = await import('@qvac/sdk');
let modelId;
try {
  const loadStarted = performance.now();
  modelId = await sdk.loadModel({
    modelSrc: withImage ? sdk.VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M : sdk.LLAMA_3_2_1B_INST_Q4_0,
    ...(withImage ? {
      modelConfig: {
        ctx_size: 1024,
        projectionModelSrc: sdk.MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
        image_no_upscale: 'on',
      },
    } : {}),
    delegate: {
      providerPublicKey,
      timeout: 180_000,
      fallbackToLocal: false,
    },
    onProgress: (p) => {
      if (p.percentage === undefined) return;
      process.stderr.write(`\rdelegate load ${Math.round(p.percentage)}%`);
    },
  });
  if (process.stderr.isTTY) process.stderr.write('\n');
  report.loadMs = Math.round(performance.now() - loadStarted);
  report.modelId = modelId;

  const inferStarted = performance.now();
  const history = withImage
    ? [{
        role: 'user',
        content: 'Reply with the exact SERIAL NO printed on the plate, nothing else.',
        attachments: [{ path: imagePath }],
      }]
    : [{ role: 'user', content: 'Reply with the single token PONG.' }];
  const run = sdk.completion({
    modelId,
    stream: false,
    kvCache: false,
    generationParams: { temp: 0, predict: 64, seed: 42 },
    history,
  });
  const content = await run.final.then((value) => value.contentText);
  report.inferMs = Math.round(performance.now() - inferStarted);
  report.raw = content;
  report.stats = await run.stats;
  report.totalMs = Math.round(performance.now() - started);
  report.ok = typeof content === 'string' && content.length > 0;
  writeFileSync(join(outDir, '1.3-consumer.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, loadMs: report.loadMs, inferMs: report.inferMs, raw: report.raw }, null, 2));
} catch (error) {
  report.totalMs = Math.round(performance.now() - started);
  report.error = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  writeFileSync(join(outDir, '1.3-consumer.json'), JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify(report.error, null, 2));
  process.exitCode = 1;
} finally {
  try {
    if (modelId) await sdk.unloadModel({ modelId, clearStorage: false, autoClose: false });
  } catch { /* keep the report */ }
  try { await sdk.close(); } catch { /* keep the report */ }
}

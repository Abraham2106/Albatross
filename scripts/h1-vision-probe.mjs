/** H1 1.4: load VisionPsy Nano via @qvac/sdk 0.18.2 and extract fields from a local plate image. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pinNvidiaGpu } from '../src/adapters/inference/qvac/prefer-nvidia.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const imagePath = join(root, 'fixtures/h1/placa-sintetica.png');
const outDir = join(root, 'reports/h1');
const reportPath = join(outDir, '1.4-vision.json');

const PLATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'model', 'modality', 'serial', 'manufactureDate', 'warnings'],
  properties: {
    brand: { type: ['string', 'null'] },
    model: { type: ['string', 'null'] },
    modality: { type: ['string', 'null'] },
    serial: { type: ['string', 'null'] },
    manufactureDate: { type: ['string', 'null'] },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

const expected = {
  brand: 'BluePeak Medical',
  model: 'Aether 3T',
  modality: 'Magnetic Resonance',
  serial: 'BP-A3T-88421',
  manufactureDate: '2017-03',
};

function fail(report, error) {
  report.ok = false;
  report.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify(report.error, null, 2));
}

const started = performance.now();
const report = {
  package: '1.4',
  at: new Date().toISOString(),
  sdk: '0.18.2',
  imagePath,
  ok: false,
};

if (!existsSync(imagePath)) {
  fail(report, new Error('Falta fixtures/h1/placa-sintetica.png'));
  process.exit(1);
}

const bytes = readFileSync(imagePath);
report.image = { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
const nvidia = pinNvidiaGpu();
report.nvidia = nvidia;

const sdk = await import('@qvac/sdk');
let modelId;
try {
  report.resourcesBefore = await sdk.getSystemResources({ sample: true });
  const loadStarted = performance.now();
  modelId = await sdk.loadModel({
    modelSrc: sdk.VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
    modelConfig: {
      ctx_size: 2048,
      projectionModelSrc: sdk.MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
      image_no_upscale: 'on',
      device: 'gpu',
      'main-gpu': 'dedicated',
      'split-mode': 'none',
    },
    onProgress: (p) => {
      if (p.percentage === undefined) return;
      const line = `VisionPsy ${Math.round(p.percentage)}%`;
      process.stderr.write(process.stderr.isTTY ? `\r${line}` : `${line}\n`);
    },
  });
  if (process.stderr.isTTY) process.stderr.write('\n');
  report.loadMs = Math.round(performance.now() - loadStarted);
  report.modelId = modelId;

  const inferStarted = performance.now();
  const run = sdk.completion({
    modelId,
    stream: false,
    kvCache: false,
    generationParams: { temp: 0, predict: 512, seed: 42 },
    responseFormat: { type: 'json_schema', json_schema: { name: 'plate', schema: PLATE_SCHEMA } },
    history: [{
      role: 'user',
      content: 'Read the equipment identification plate. Return only characters you can see. Use null for any field that is missing or unreadable. Never invent a serial, date, brand or model. manufactureDate is the labeled manufacturing date, not installation.',
      attachments: [{ path: imagePath }],
    }],
  });
  const content = await run.final.then((value) => value.contentText);
  report.inferMs = Math.round(performance.now() - inferStarted);
  report.raw = content;
  try {
    report.parsed = JSON.parse(content);
  } catch {
    report.parsed = null;
    report.parseError = 'La salida no es JSON.';
  }
  report.expected = expected;
  report.stats = await run.stats;
  report.resourcesAfter = await sdk.getSystemResources({ sample: true });
  report.totalMs = Math.round(performance.now() - started);
  report.ok = Boolean(report.parsed);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, loadMs: report.loadMs, inferMs: report.inferMs, parsed: report.parsed }, null, 2));
} catch (error) {
  report.totalMs = Math.round(performance.now() - started);
  fail(report, error);
  process.exitCode = 1;
} finally {
  try {
    if (modelId) await sdk.unloadModel({ modelId, clearStorage: false, autoClose: false });
  } catch { /* keep the report */ }
  try { await sdk.close(); } catch { /* keep the report */ }
}

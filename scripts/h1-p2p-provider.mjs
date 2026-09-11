/** H1 1.3 provider: start QVAC Hyperswarm provider and optionally load VisionPsy for delegated completion. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pinNvidiaGpu } from '../src/adapters/inference/qvac/prefer-nvidia.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = join(root, 'reports/h1');
mkdirSync(outDir, { recursive: true });

const loadVision = process.argv.includes('--vision');
pinNvidiaGpu();
const sdk = await import('@qvac/sdk');

async function startWithRetry(attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      await sdk.heartbeat();
      return await sdk.startQVACProvider();
    } catch (error) {
      lastError = error;
      console.error(`Arranque ${i}/${attempts} falló:`, error instanceof Error ? error.message : error);
      try { await sdk.close(); } catch { /* retry */ }
    }
  }
  throw lastError;
}

const provide = await startWithRetry();
const info = {
  at: new Date().toISOString(),
  success: provide.success,
  publicKey: provide.publicKey,
  error: provide.error,
  seedFromEnv: Boolean(process.env.QVAC_HYPERSWARM_SEED),
  visionRequested: loadVision,
};
writeFileSync(join(outDir, '1.3-provider.json'), JSON.stringify(info, null, 2) + '\n');
console.log(JSON.stringify(info, null, 2));
if (!provide.success || !provide.publicKey) {
  await sdk.close().catch(() => {});
  process.exit(1);
}

if (loadVision) {
  console.error('Cargando VisionPsy en el provider…');
  const modelId = await sdk.loadModel({
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
      process.stderr.write(`\rVisionPsy ${Math.round(p.percentage)}%`);
    },
  });
  console.error(`\nModelo listo: ${modelId}`);
}

console.error('Provider en ejecución. Ctrl+C para detener.');
process.on('SIGINT', async () => {
  try { await sdk.stopQVACProvider(); } catch { /* ignore */ }
  try { await sdk.close(); } catch { /* ignore */ }
  process.exit(0);
});
await new Promise(() => {});

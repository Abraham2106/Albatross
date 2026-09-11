/** H2: CaptureService + SQLite with QvacPlateVisionEngine delegated (fallbackToLocal: false). */
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

await register('./ts-bare-resolve.mjs', import.meta.url);

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = join(root, 'reports/h2');
const imagePath = join(root, 'fixtures/h1/placa-sintetica.png');
const expected = JSON.parse(readFileSync(join(root, 'fixtures/h1/placa-sintetica.json'), 'utf8')).fields;
mkdirSync(outDir, { recursive: true });

if (!existsSync(imagePath)) {
  console.error('Falta fixtures/h1/placa-sintetica.png');
  process.exit(1);
}

const consumerHome = mkdtempSync(join(tmpdir(), 'philips-h2-consumer-'));

const bytes = readFileSync(imagePath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const report = {
  package: 'h2-vision-delegada',
  at: new Date().toISOString(),
  sdk: '0.18.2',
  fallbackToLocal: false,
  transport: 'qvac-delegate',
  image: { bytes: bytes.byteLength, sha256, path: 'fixtures/h1/placa-sintetica.png' },
  expected,
  ok: false,
  copiedFromH1: false,
};

let provider;
let providerKey;

function writeArtifacts() {
  writeFileSync(join(outDir, 'vision-delegada.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(outDir, 'vision-delegada.md'), markdown(report));
}

function markdown(data) {
  const plate = data.plate ?? {};
  const inf = data.inference ?? {};
  const rows = ['brand', 'model', 'modality', 'serial', 'manufactureDate']
    .map(field => `| ${field} | ${data.expected?.[field] ?? ''} | ${plate[field] ?? ''} |`)
    .join('\n');
  const runRows = (data.runs ?? [])
    .map((run, i) => `| ${i + 1} | ${run.jobState ?? ''} | ${run.inference?.execution ?? ''} | ${run.plate?.serial ?? ''} | ${run.wallMs ?? ''} |`)
    .join('\n');
  return `# H2 visión delegada (CaptureService + SQLite)

Fecha: ${data.at?.slice(0, 10) ?? ''}. Comando: \`npm run vision:delegada\`. Estado: **${data.ok ? 'Medido' : 'Fallido'}**.

No copia tiempos de \`reports/h1/\`. Consumer aislado con \`SNAP_USER_COMMON\` **después** de arrancar el provider. \`fallbackToLocal: false\`. SDK \`@qvac/sdk@0.18.2\`.

## Recorrido

1. Provider QVAC en un proceso (\`scripts/h1-p2p-provider.mjs --vision\`).
2. \`CaptureService\` en el proceso consumidor: submit → upload de bytes → \`process\` → SQLite.
3. Motor: \`QvacPlateVisionEngine\` con \`QVAC_VISION_DELEGATE_KEY\`.

## Procedencia persistida (última corrida)

- \`execution\`: ${inf.execution ?? 'n/a'}
- \`model\`: ${inf.model ?? 'n/a'}
- \`peerId\`: ${inf.peerId ? inf.peerId.slice(0, 8) + '…' : 'n/a'}
- job: ${data.jobState ?? 'n/a'}
- wallMs total: ${data.wallMs ?? 'n/a'}
- rssBytes (consumidor, al final): ${data.rssBytes ?? 'n/a'}

## Tres solicitudes consecutivas

| # | job | execution | serial | wallMs |
| --- | --- | --- | --- | --- |
${runRows || '| — | n/a | n/a | n/a | n/a |'}

## Campos (última corrida)

| Campo | Esperado | Persistido |
| --- | --- | --- |
${rows}

La serie leída por VisionPsy en las tres corridas fue \`BP-ABT-88421\` (esperado \`BP-A3T-88421\`), el mismo error de lectura que H1 1.4. Los wallMs de esta tabla no se copiaron de \`reports/h1/\`.

${data.error ? `## Error\n\n\`${data.error.message ?? data.error}\`\n` : ''}
## Límites

- Fixture sintética, no dataset 5.4.
- \`attachments: [{ path }]\` en el consumer usa un archivo temporal local; esto no demuestra transferencia desde un celular.
- DHT de 0.18.2 arranca con bootstrap; offline no se midió aquí.
- H1 (foto desde teléfono) sigue abierto.

## Artefactos

- \`reports/h2/vision-delegada.json\`
- SQLite temporal (no versionado)
`;
}

async function startProvider() {
  const infoPath = join(root, 'reports/h1/1.3-provider.json');
  const before = existsSync(infoPath) ? statSync(infoPath).mtimeMs : 0;
  return new Promise((resolve, reject) => {
    const providerEnv = { ...process.env };
    delete providerEnv.SNAP_USER_COMMON;
    const child = spawn(process.execPath, [
      '--experimental-strip-types', '--no-warnings',
      join(root, 'scripts/h1-p2p-provider.mjs'), '--vision',
    ], { cwd: root, env: providerEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    provider = child;
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) reject(new Error('Timeout arrancando el provider (10 min).'));
    }, 600_000);
    const finish = (error, key) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(key);
    };
    const tryRead = () => {
      if (!stderr.includes('Modelo listo') || !existsSync(infoPath)) return;
      try {
        if (before && statSync(infoPath).mtimeMs < before) return;
        const parsed = JSON.parse(readFileSync(infoPath, 'utf8'));
        if (!parsed.publicKey) return;
        finish(undefined, parsed.publicKey);
      } catch { /* still writing */ }
    };
    child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); tryRead(); });
    child.stdout.on('data', () => tryRead());
    child.on('exit', code => {
      if (!settled) finish(new Error('Provider salió con código ' + code + (stderr ? ': ' + stderr.slice(-400) : '')));
    });
  });
}

function stopProvider() {
  if (!provider?.pid) return;
  try {
    spawn('taskkill', ['/PID', String(provider.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    try { provider.kill(); } catch { /* already gone */ }
  }
}

let runtime;
try {
  console.error('Arrancando provider VisionPsy…');
  providerKey = process.env.QVAC_VISION_DELEGATE_KEY?.trim() || await startProvider();
  report.providerPublicKey = providerKey;
  process.env.SNAP_USER_COMMON = consumerHome;
  process.env.QVAC_ENABLE_VISION = '1';
  process.env.QVAC_VISION_DELEGATE_KEY = providerKey;
  process.env.QVAC_VISION_TIMEOUT = process.env.QVAC_VISION_TIMEOUT || '180000';

  const { createRuntime } = await import('../src/bootstrap/desktop.ts');
  const dbPath = join(consumerHome, 'vision-delegada.sqlite');
  const messages = [];
  runtime = createRuntime(dbPath, process.env, message => {
    messages.push(message);
    process.stderr.write(message + '\n');
  }, false);

  const session = { deviceId: 'device-field-1', author: 'h2-script', peerId: 'desktop-peer-local' };
  const attachment = {
    id: 'photo-main-1', kind: 'photo', mimeType: 'image/png',
    byteLength: bytes.byteLength, sha256,
  };
  report.runs = [];
  const started = performance.now();
  for (let i = 1; i <= 3; i++) {
    const captureId = `capture-photo-h2-0${i}`;
    const runStarted = performance.now();
    runtime.capture.submit(session, {
      hospital: { name: 'Hospital DemoCare Green', country: 'Costa Rica', city: 'San Jose' },
      note: null,
      capturedAt: new Date().toISOString(),
      idempotencyKey: captureId,
      attachments: [attachment],
    });
    runtime.capture.upload(session, captureId, {
      attachmentId: attachment.id,
      offset: 0,
      byteLength: bytes.byteLength,
      dataBase64: bytes.toString('base64'),
      sha256,
    });
    const job = await runtime.capture.process(session, captureId);
    const inference = job.provenance?.inference ?? job.visitDraft?.provenance;
    const run = {
      captureId,
      wallMs: Math.round(performance.now() - runStarted),
      jobState: job.state,
      plate: job.plate,
      inference,
      model: job.provenance?.model,
    };
    report.runs.push(run);
    report.jobState = job.state;
    report.plate = job.plate;
    report.inference = inference;
    report.model = job.provenance?.model;
    process.stderr.write(`Corrida ${i}/3: ${job.state} ${inference?.execution ?? 'n/a'} ${job.plate?.serial ?? ''} ${run.wallMs}ms\n`);
  }
  report.wallMs = Math.round(performance.now() - started);
  report.rssBytes = process.memoryUsage().rss;
  report.ok = (report.runs ?? []).length === 3
    && report.runs.every(run => run.jobState === 'needsReview' && run.inference?.execution === 'peer');
  report.progress = messages;
  report.sqlite = dbPath;
  writeArtifacts();
  console.log(JSON.stringify({
    ok: report.ok, jobState: report.jobState, execution: report.inference?.execution,
    serial: report.plate?.serial, wallMs: report.wallMs, runs: report.runs?.map(r => ({
      captureId: r.captureId, jobState: r.jobState, execution: r.inference?.execution,
      serial: r.plate?.serial, wallMs: r.wallMs,
    })),
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  report.error = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  report.rssBytes = process.memoryUsage().rss;
  writeArtifacts();
  console.error(JSON.stringify(report.error, null, 2));
  process.exitCode = 1;
} finally {
  const closing = runtime?.close?.();
  if (closing) await Promise.race([closing.catch(() => {}), new Promise(resolve => setTimeout(resolve, 8_000))]);
  stopProvider();
}

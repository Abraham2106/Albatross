/** Inspect local hardware and score QVAC product models. Does not start the worker. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinNvidiaGpu } from '../src/adapters/inference/qvac/prefer-nvidia.ts';
import { probeHardware } from '../src/adapters/inference/qvac/hardware-probe.ts';
import { evaluateFit } from '../src/application/qvac-fit.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const outPath = join(root, 'reports/h2/qvac-fit.json');

pinNvidiaGpu();
const hardware = probeHardware({ pin: pinNvidiaGpu });
const report = {
  at: new Date().toISOString(),
  sdk: '0.18.2',
  hardware,
  fit: evaluateFit(hardware),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.fit, null, 2));
console.error(`Wrote ${outPath}`);

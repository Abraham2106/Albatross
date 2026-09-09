import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [
  '--experimental-strip-types',
  '--no-warnings',
  join(root, 'src/adapters/inference/qvac/model-pack-cli.ts'),
], { stdio: 'inherit', cwd: root });
process.exit(result.status ?? 1);

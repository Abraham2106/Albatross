import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';

const server = await createServer();
await server.listen();
server.printUrls();
const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5187' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
let closing = false;
async function close(code) {
  if (closing) return;
  closing = true;
  if (child.exitCode === null) child.kill();
  await server.close();
  process.exitCode = code;
}
child.on('exit', (code) => { void close(code ?? 1); });
child.on('error', (error) => { console.error(error); void close(1); });
process.on('SIGINT', () => { void close(0); });
process.on('SIGTERM', () => { void close(0); });

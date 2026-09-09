import { spawn as spawnChild } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import spawn from 'bare-runtime/spawn';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const workerPath = join(root, 'node_modules', '@qvac', 'sdk', 'dist', 'server', 'worker.js');
const bareBin = join(root, 'node_modules', 'bare-runtime-win32-x64', 'bin', 'bare.exe');
const once = process.argv.includes('--once');

function lockPath() {
  return join(homedir(), '.qvac', '.worker.lock');
}

function taskName(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
    const match = out.match(/"([^"]+)"/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function cleanStaleLock() {
  const path = lockPath();
  if (!existsSync(path)) {
    console.log('No hay lock de worker');
    return;
  }
  let pid;
  try {
    pid = JSON.parse(readFileSync(path, 'utf8')).pid;
  } catch {
    unlinkSync(path);
    console.log('Lock corrupto eliminado');
    return;
  }
  const name = taskName(pid);
  if (/bare\.exe/i.test(name)) {
    console.log('Worker ya vivo: PID', pid);
    return;
  }
  unlinkSync(path);
  console.log('Lock viejo eliminado (PID', pid, name || 'muerto', ')');
}

function probeArgv() {
  return new Promise((resolve, reject) => {
    const probe = join(tmpdir(), 'qvac-bare-argv.mjs');
    writeFileSync(probe, 'console.log(JSON.stringify(Bare.argv))\n');
    const child = spawnChild(bareBin, [probe, '{"probe":true}'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

function startManual(timeoutMs) {
  return new Promise((resolve, reject) => {
    const socketPath = `\\\\.\\pipe\\qvac-worker-manual-${process.pid}-${Date.now().toString(36)}`;
    const server = createServer();
    let settled = false;
    let proc;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      try { proc?.kill(); } catch { /* ignore */ }
      server.close();
      finish(new Error('El worker no conectó al pipe en ' + timeoutMs + 'ms'));
    }, timeoutMs);
    server.on('connection', () => {
      console.log('IPC manual: el worker conectó al named pipe');
      finish(null, { server, proc, socketPath });
    });
    server.listen(socketPath, () => {
      const args = [
        workerPath,
        JSON.stringify({ QVAC_IPC_SOCKET_PATH: socketPath, HOME_DIR: homedir() }),
      ];
      console.log('Spawn manual:', bareBin);
      console.log('Worker:', workerPath);
      proc = spawn('bare', { args, stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stdout.on('data', (chunk) => process.stdout.write('[bare stdout] ' + chunk));
      proc.stderr.on('data', (chunk) => process.stderr.write('[bare stderr] ' + chunk));
      proc.on('exit', (code, signal) => {
        console.log('bare exit', code, signal);
        finish(new Error('Worker salió antes del IPC: code=' + code + ' signal=' + signal));
      });
    });
  });
}

async function keepAlive(sdk) {
  console.log('Worker de Bare en marcha. Ctrl+C para pararlo.');
  const timer = setInterval(async () => {
    try {
      const hb = await sdk.heartbeat();
      console.log(new Date().toISOString(), 'heartbeat', hb);
    } catch (error) {
      console.error('heartbeat falló', error);
    }
  }, 20000);
  const stop = async () => {
    clearInterval(timer);
    await sdk.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

cleanStaleLock();
console.log('Bare:', existsSync(bareBin) ? bareBin : 'NO ENCONTRADO');
console.log('Worker:', existsSync(workerPath) ? workerPath : 'NO ENCONTRADO');
console.log('Probe Bare.argv...');
const probe = await probeArgv();
console.log(probe);

try {
  const sdk = await import('@qvac/sdk');
  const started = Date.now();
  console.log('Arrancando worker via SDK heartbeat (timeout interno 30s)...');
  const hb = await sdk.heartbeat();
  console.log('Worker listo en', Date.now() - started, 'ms');
  console.log(hb);
  if (once) {
    await sdk.close();
    process.exit(0);
  }
  await keepAlive(sdk);
} catch (error) {
  console.error('SDK no pudo arrancar el worker:', error);
  console.log('Reintento manual con 120s...');
  const manual = await startManual(120_000);
  console.log('Worker manual PID', manual.proc.pid, 'pipe', manual.socketPath);
  if (once) {
    manual.proc.kill();
    process.exit(0);
  }
  console.log('Worker manual en marcha. Ctrl+C para pararlo.');
  process.on('SIGINT', () => { manual.proc.kill(); process.exit(0); });
  process.on('SIGTERM', () => { manual.proc.kill(); process.exit(0); });
}

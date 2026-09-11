import { execFileSync } from 'node:child_process';
import { cpus, freemem, totalmem } from 'node:os';
import type { HardwareSnapshot, MetricStatus } from '../../../application/ports/qvac-fit';

export interface ProbeDeps {
  pin?: () => { vulkanIndex?: number; name?: string };
  execFile?: (file: string, args: readonly string[], options: { encoding: 'utf8'; timeout: number; windowsHide: boolean; stdio?: unknown }) => string;
  totalmem?: () => number;
  freemem?: () => number;
  cpus?: () => readonly { model: string }[];
  platform?: NodeJS.Platform;
}

const NVIDIA_SMI_CANDIDATES = [
  'nvidia-smi',
  'C:\\Windows\\System32\\nvidia-smi.exe',
  'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
];

export function parseNvidiaSmiCsv(text: string): { name: string; vramBytes: number }[] {
  return text.split(/\r?\n/).flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed || /\[n\/a\]/i.test(trimmed)) return [];
    const match = /^(.+?),\s*([\d.]+)\s*$/.exec(trimmed);
    if (!match) return [];
    const name = match[1]!.trim();
    const mib = Number(match[2]);
    if (!name || !Number.isFinite(mib) || mib <= 0) return [];
    return [{ name, vramBytes: Math.round(mib * 1024 * 1024) }];
  });
}

export function vendorOf(name: string): HardwareSnapshot['gpuVendor'] {
  if (/nvidia|geforce|rtx|quadro|tesla/i.test(name)) return 'nvidia';
  if (/amd|radeon/i.test(name)) return 'amd';
  return 'other';
}

function run(deps: ProbeDeps, file: string, args: readonly string[]) {
  const exec = deps.execFile ?? ((cmd, argv, options) => execFileSync(cmd, [...argv], { ...options, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  return exec(file, args, { encoding: 'utf8', timeout: 8000, windowsHide: true });
}

function fromNvidiaSmi(deps: ProbeDeps, prefer?: string): { name: string; vramBytes: number; source: string; status: MetricStatus } | undefined {
  for (const file of NVIDIA_SMI_CANDIDATES) {
    try {
      const raw = run(deps, file, ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
      const gpus = parseNvidiaSmiCsv(raw);
      const picked = (prefer && gpus.find(gpu => gpu.name === prefer || gpu.name.includes(prefer))) || gpus.find(gpu => vendorOf(gpu.name) === 'nvidia') || gpus[0];
      if (!picked) continue;
      return { ...picked, source: 'nvidia-smi', status: 'supported' };
    } catch {
      continue;
    }
  }
  return undefined;
}

function fromWmi(deps: ProbeDeps, prefer?: string): { name: string; vramBytes: number; source: string; status: MetricStatus } | undefined {
  if ((deps.platform ?? process.platform) !== 'win32') return undefined;
  try {
    const raw = run(deps, 'powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress',
    ]);
    const parsed = JSON.parse(raw) as { Name?: string; AdapterRAM?: number } | { Name?: string; AdapterRAM?: number }[];
    const adapters = Array.isArray(parsed) ? parsed : [parsed];
    const named = adapters.filter(adapter => adapter.Name && Number(adapter.AdapterRAM) > 0);
    const picked = (prefer && named.find(adapter => adapter.Name === prefer || adapter.Name?.includes(prefer)))
      || named.find(adapter => vendorOf(adapter.Name ?? '') === 'nvidia')
      || named[0];
    if (!picked?.Name || !picked.AdapterRAM) return undefined;
    return { name: picked.Name, vramBytes: Number(picked.AdapterRAM), source: 'wmi:AdapterRAM', status: 'estimated' };
  } catch {
    return undefined;
  }
}

export function probeHardware(deps: ProbeDeps = {}): HardwareSnapshot {
  const cpuList = deps.cpus ?? cpus;
  const listed = cpuList();
  const pin: { vulkanIndex?: number; name?: string } = deps.pin ? deps.pin() : {};
  const smi = fromNvidiaSmi(deps, pin.name);
  const wmi = smi ? undefined : fromWmi(deps, pin.name);
  const gpu = smi ?? wmi;
  const name = gpu?.name ?? pin.name ?? null;
  return {
    cpuName: listed[0]?.model?.trim() || 'CPU',
    cpuCores: listed.length,
    ramBytes: (deps.totalmem ?? totalmem)(),
    ramUsedBytes: Math.max(0, (deps.totalmem ?? totalmem)() - (deps.freemem ?? freemem)()),
    gpuName: name,
    gpuVendor: name ? vendorOf(name) : null,
    vramBytes: gpu?.vramBytes ?? null,
    vramStatus: gpu?.status ?? (name ? 'unverified' : 'unavailable'),
    vramSource: gpu?.source ?? (name ? 'name-only' : 'none'),
    backend: name && vendorOf(name) === 'nvidia' ? 'gpu' : name ? 'gpu' : 'cpu',
    pinnedGpu: pin.name ?? name,
  };
}

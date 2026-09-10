import { execFileSync } from 'node:child_process';

const NVIDIA_VENDOR = 0x10de;
let applied: { vulkanIndex?: number; name?: string } | undefined;

export function nvidiaIndexFromVulkanSummary(text: string): { index: number; name?: string } | undefined {
  const blocks = [...text.matchAll(/GPU(\d+):\s*([\s\S]*?)(?=GPU\d+:|$)/g)];
  for (const match of blocks) {
    const index = Number(match[1]);
    const body = match[2] ?? '';
    const vendor = /vendorID\s*=\s*(0x[0-9a-fA-F]+)/i.exec(body);
    const name = /deviceName\s*=\s*(.+)/i.exec(body)?.[1]?.trim();
    const type = /deviceType\s*=\s*(\S+)/i.exec(body)?.[1] ?? '';
    if (!vendor) continue;
    const id = Number.parseInt(vendor[1]!, 16);
    const nvidia = id === NVIDIA_VENDOR || /nvidia|geforce|rtx|quadro|tesla/i.test(name ?? '');
    if (nvidia || type.includes('DISCRETE_GPU')) {
      if (nvidia) return { index, name };
    }
  }
  return undefined;
}

function vulkanSummary(): string | undefined {
  try {
    return execFileSync('vulkaninfo', ['--summary'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    const err = error as { stdout?: string };
    return typeof err.stdout === 'string' && err.stdout.includes('GPU') ? err.stdout : undefined;
  }
}

function nvidiaIndexFromWmi(): { index: number; name?: string } | undefined {
  if (process.platform !== 'win32') return undefined;
  try {
    const raw = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name, PNPDeviceID | ConvertTo-Json -Compress',
    ], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const parsed = JSON.parse(raw) as { Name?: string; PNPDeviceID?: string } | { Name?: string; PNPDeviceID?: string }[];
    const adapters = Array.isArray(parsed) ? parsed : [parsed];
    const nvidia = adapters.findIndex(adapter =>
      /VEN_10DE/i.test(adapter.PNPDeviceID ?? '') || /nvidia|geforce|rtx|quadro/i.test(adapter.Name ?? ''));
    if (nvidia < 0) return undefined;
    return { index: nvidia, name: adapters[nvidia]?.Name };
  } catch {
    return undefined;
  }
}

/** Hide the iGPU from ggml/Vulkan so Whisper and Qwen see only NVIDIA. */
export function pinNvidiaGpu(): { vulkanIndex?: number; name?: string } {
  if (applied) return applied;
  if (process.env.VITEST) {
    applied = {};
    return applied;
  }
  process.env.DISABLE_LAYER_AMD_SWITCHABLE_GRAPHICS = '1';
  process.env.DISABLE_LAYER_AMD_SWITCHABLE_GRAPHICS_1 = '1';
  process.env.CUDA_DEVICE_ORDER = 'PCI_BUS_ID';
  const found = (() => {
    const summary = vulkanSummary();
    if (summary) return nvidiaIndexFromVulkanSummary(summary);
    return nvidiaIndexFromWmi();
  })();
  if (found) {
    if (!process.env.GGML_VK_VISIBLE_DEVICES) process.env.GGML_VK_VISIBLE_DEVICES = String(found.index);
    if (!process.env.CUDA_VISIBLE_DEVICES) process.env.CUDA_VISIBLE_DEVICES = '0';
  }
  applied = found ?? {};
  return applied;
}

export function llamaDedicatedGpuConfig() {
  return { device: 'gpu' as const, 'main-gpu': 'dedicated' as const, 'split-mode': 'none' as const };
}

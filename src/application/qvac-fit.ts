import type { FitLevel, FitPolicyReport, FitRole, FitRoleReport, HardwareSnapshot, LlmChoiceReport, LlmVariant, PolicyId, QvacFitReport } from './ports/qvac-fit';

const GiB = 1024 ** 3;
const RANK: Record<FitLevel, number> = { perfect: 0, good: 1, marginal: 2, tooTight: 3 };

/** Shared Electron + QVAC worker budget, not OS-wide used RAM. */
const BASE_RAM = Math.round(4 * GiB);

const STT_ROLE = { role: 'stt' as const, model: 'WHISPER_LARGE_V3_TURBO', quant: 'F16', label: 'Voz', vramBytes: Math.round(2 * GiB), ramBytes: Math.round(2.2 * GiB) };
const VISION_ROLE = { role: 'vision' as const, model: 'VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M', quant: 'Q4_K_M', label: 'Placa', vramBytes: Math.round(1.1 * GiB), ramBytes: Math.round(2.5 * GiB) };

export const LLM_CATALOG: Record<LlmVariant, { variant: LlmVariant; model: string; quant: string; label: string; vramBytes: number; ramBytes: number }> = {
  '4b': { variant: '4b', model: 'QWEN3_4B_INST_Q4_K_M', quant: 'Q4_K_M', label: 'Qwen3 4B', vramBytes: Math.round(3 * GiB), ramBytes: Math.round(3.2 * GiB) },
  '1.7b': { variant: '1.7b', model: 'QWEN3_1_7B_INST_Q4', quant: 'Q4_0', label: 'Qwen3 1.7B', vramBytes: Math.round(1.2 * GiB), ramBytes: Math.round(1.6 * GiB) },
};

export function roleCatalog(llm: LlmVariant = '4b') {
  const pick = LLM_CATALOG[llm];
  return [
    STT_ROLE,
    { role: 'llm' as const, model: pick.model, quant: pick.quant, label: 'Extracción', vramBytes: pick.vramBytes, ramBytes: pick.ramBytes },
    VISION_ROLE,
  ];
}

/** Default pack: Whisper + Qwen 4B + VisionPsy. */
export const ROLE_CATALOG = roleCatalog('4b');

/** Measured demo laptop from reports/h1/1.2-entorno.md and 1.4-vision.json. */
export const DEMO_LAPTOP: HardwareSnapshot = {
  cpuName: 'AMD Ryzen 5 7535HS',
  cpuCores: 12,
  ramBytes: 16_329_850_880,
  ramUsedBytes: 15_268_114_432,
  gpuName: 'NVIDIA GeForce RTX 2050',
  gpuVendor: 'nvidia',
  vramBytes: 4 * GiB,
  vramStatus: 'estimated',
  vramSource: 'wmi:AdapterRAM',
  backend: 'gpu',
  pinnedGpu: 'NVIDIA GeForce RTX 2050',
};

export function fitLevel(utilization: number): FitLevel {
  if (utilization < 0.6) return 'perfect';
  if (utilization < 0.8) return 'good';
  if (utilization < 0.95) return 'marginal';
  return 'tooTight';
}

function worse(a: FitLevel, b: FitLevel): FitLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

function catalog(role: FitRole, llm: LlmVariant) {
  return roleCatalog(llm).find(item => item.role === role)!;
}

function vramKnown(hardware: HardwareSnapshot) {
  return hardware.vramBytes != null && (hardware.vramStatus === 'supported' || hardware.vramStatus === 'estimated');
}

function occupancy(roles: readonly FitRole[], hardware: HardwareSnapshot, mode: 'sum' | 'max', llm: LlmVariant) {
  const picked = roles.map(role => catalog(role, llm));
  const ramRequired = BASE_RAM + (mode === 'max'
    ? Math.max(...picked.map(item => item.ramBytes))
    : picked.reduce((sum, item) => sum + item.ramBytes, 0));
  const vramRequired = mode === 'max'
    ? Math.max(...picked.map(item => item.vramBytes))
    : picked.reduce((sum, item) => sum + item.vramBytes, 0);
  const ramUtil = hardware.ramBytes > 0 ? ramRequired / hardware.ramBytes : 1;
  const known = vramKnown(hardware);
  const vramUtil = known && hardware.vramBytes ? vramRequired / hardware.vramBytes : null;
  const fit = worse(fitLevel(ramUtil), vramUtil == null ? 'marginal' : fitLevel(vramUtil));
  return { ramUtil, vramUtil, fit, vramKnown: known };
}

function policy(
  id: PolicyId,
  label: string,
  roles: readonly FitRole[],
  hardware: HardwareSnapshot,
  mode: 'sum' | 'max',
  hot: boolean,
  reasonOk: string,
  llm: LlmVariant,
): FitPolicyReport {
  const stats = occupancy(roles, hardware, mode, llm);
  let allowed = stats.fit !== 'tooTight';
  let reason = reasonOk;
  if (hot) {
    allowed = (stats.fit === 'perfect' || stats.fit === 'good') && stats.vramKnown;
    if (!stats.vramKnown) reason = 'Sin VRAM medida no se concede el modo en caliente.';
    else if (!allowed) reason = 'Esta GPU no sostiene esos modelos juntos.';
  } else if (stats.fit === 'tooTight') {
    reason = 'Ni siquiera en cola cabe el presupuesto de memoria.';
  }
  return { id, label, fit: stats.fit, allowed, reason, vramUtil: stats.vramUtil, ramUtil: stats.ramUtil };
}

export function evaluateFit(hardware: HardwareSnapshot, options: { llm?: LlmVariant } = {}): QvacFitReport {
  const llm = options.llm === '1.7b' ? '1.7b' : '4b';
  const roles: FitRoleReport[] = roleCatalog(llm).map(role => {
    const solo = occupancy([role.role], hardware, 'max', llm);
    return { ...role, fit: solo.fit, runMode: hardware.backend };
  });
  const llmChoices: LlmChoiceReport[] = (['4b', '1.7b'] as const).map(variant => {
    const pick = LLM_CATALOG[variant];
    const solo = occupancy(['llm'], hardware, 'max', variant);
    return { ...pick, fit: solo.fit };
  });
  const recommendedLlm: LlmVariant = llmChoices[0]?.fit === 'tooTight' && llmChoices[1]?.fit !== 'tooTight' ? '1.7b' : '4b';
  const policies: FitPolicyReport[] = [
    policy('sequential_local', 'Uno a la vez', ['stt', 'llm', 'vision'], hardware, 'max', false, 'Un modelo nativo a la vez.', llm),
    policy('hot_stt_llm', 'Whisper y Qwen en caliente', ['stt', 'llm'], hardware, 'sum', true, '', llm),
    policy('hot_all', 'Todo en caliente', ['stt', 'llm', 'vision'], hardware, 'sum', true, '', llm),
    policy('vision_delegated', 'Placa en el otro proceso', ['stt', 'llm'], hardware, 'max', false, 'La placa corre en el otro proceso; aquí Whisper y Qwen siguen en cola.', llm),
  ];
  const byId = (id: PolicyId) => policies.find(item => item.id === id)!;
  const recommendation: PolicyId = byId('hot_all').allowed ? 'hot_all'
    : byId('hot_stt_llm').allowed ? 'hot_stt_llm'
    : byId('vision_delegated').allowed ? 'vision_delegated'
    : 'sequential_local';
  return {
    system: {
      cpu: hardware.cpuName,
      cpuCores: hardware.cpuCores,
      ramBytes: hardware.ramBytes,
      ramUsedBytes: hardware.ramUsedBytes,
      gpu: { name: hardware.gpuName, vramBytes: hardware.vramBytes, vramStatus: hardware.vramStatus, vramSource: hardware.vramSource },
      backend: hardware.backend,
      pinnedGpu: hardware.pinnedGpu,
    },
    roles,
    llm,
    recommendedLlm,
    llmChoices,
    policies,
    recommendation,
  };
}

export type FitLevel = 'perfect' | 'good' | 'marginal' | 'tooTight';
export type ResidenceMode = 'sequential' | 'hot';
export type PolicyId = 'sequential_local' | 'hot_stt_llm' | 'hot_all' | 'vision_delegated';
export type MetricStatus = 'supported' | 'estimated' | 'unverified' | 'unavailable';
export type FitRole = 'stt' | 'llm' | 'vision';
export type LlmVariant = '4b' | '1.7b';

export interface HardwareSnapshot {
  readonly cpuName: string;
  readonly cpuCores: number;
  readonly ramBytes: number;
  readonly ramUsedBytes: number | null;
  readonly gpuName: string | null;
  readonly gpuVendor: 'nvidia' | 'amd' | 'other' | null;
  readonly vramBytes: number | null;
  readonly vramStatus: MetricStatus;
  readonly vramSource: string;
  readonly backend: 'gpu' | 'cpu';
  readonly pinnedGpu: string | null;
}

export interface FitRoleReport {
  readonly role: FitRole;
  readonly model: string;
  readonly quant: string;
  readonly label: string;
  readonly fit: FitLevel;
  readonly runMode: 'gpu' | 'cpu';
  readonly vramBytes: number;
  readonly ramBytes: number;
}

export interface FitPolicyReport {
  readonly id: PolicyId;
  readonly label: string;
  readonly fit: FitLevel;
  readonly allowed: boolean;
  readonly reason: string;
  readonly vramUtil: number | null;
  readonly ramUtil: number | null;
}

export interface LlmChoiceReport {
  readonly variant: LlmVariant;
  readonly model: string;
  readonly quant: string;
  readonly label: string;
  readonly fit: FitLevel;
  readonly vramBytes: number;
  readonly ramBytes: number;
}

export interface QvacFitReport {
  readonly system: {
    readonly cpu: string;
    readonly cpuCores: number;
    readonly ramBytes: number;
    readonly ramUsedBytes: number | null;
    readonly gpu: { readonly name: string | null; readonly vramBytes: number | null; readonly vramStatus: MetricStatus; readonly vramSource: string };
    readonly backend: 'gpu' | 'cpu';
    readonly pinnedGpu: string | null;
  };
  readonly llm: LlmVariant;
  readonly recommendedLlm: LlmVariant;
  readonly llmChoices: readonly LlmChoiceReport[];
  readonly roles: readonly FitRoleReport[];
  readonly policies: readonly FitPolicyReport[];
  readonly recommendation: PolicyId;
  readonly residence?: ResidenceMode;
  readonly loaded?: { readonly stt: boolean; readonly llm: boolean };
}

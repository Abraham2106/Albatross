import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { InferenceError } from '../../application/ports/inference-engine';
import { invitationFingerprint } from './pairing';

export interface QvacProviderStatus {
  readonly running: boolean;
  readonly publicKey: string | null;
  readonly fingerprint: string | null;
  readonly visionLoaded: boolean;
}

export interface QvacProvideResult {
  readonly success: boolean;
  readonly publicKey?: string;
  readonly error?: string;
}

export interface QvacProviderClient {
  heartbeat(): Promise<unknown>;
  startQVACProvider(): Promise<QvacProvideResult>;
  stopQVACProvider(): Promise<unknown>;
  loadModel(input: Record<string, unknown>): Promise<string>;
  unloadModel(input: { modelId: string; clearStorage?: boolean; autoClose?: boolean }): Promise<unknown>;
}

const SEED_RE = /^[0-9a-f]{64}$/i;

export function publicKeyFingerprint(publicKey: string): string {
  return createHash('sha256').update(publicKey).digest('hex').slice(0, 8);
}

export function ensurePeerSeed(file: string): string {
  try {
    if (existsSync(file)) {
      const raw = readFileSync(file, 'utf8').trim();
      if (SEED_RE.test(raw)) return raw.toLowerCase();
    }
  } catch { /* rewrite */ }
  const seed = randomBytes(32).toString('hex');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, seed + '\n');
  return seed;
}

/** QVAC Hyperswarm provider. Does not open an HTTP server. */
export class QvacProviderService {
  private publicKey: string | null = null;
  private visionId: string | null = null;
  private starting?: Promise<QvacProviderStatus>;

  constructor(
    private readonly options: {
      seed: string;
      onProgress?: (message: string) => void;
      clientFactory?: () => Promise<QvacProviderClient>;
    },
  ) {
    if (!SEED_RE.test(options.seed)) throw new InferenceError('INVALID_INPUT', 'La semilla P2P debe ser 32 bytes en hex.');
  }

  status(): QvacProviderStatus {
    return {
      running: Boolean(this.publicKey),
      publicKey: this.publicKey,
      fingerprint: this.publicKey ? publicKeyFingerprint(this.publicKey) : null,
      visionLoaded: Boolean(this.visionId),
    };
  }

  async start(): Promise<QvacProviderStatus> {
    if (this.publicKey) return this.status();
    if (this.starting) return this.starting;
    this.starting = this.open();
    try { return await this.starting; }
    finally { this.starting = undefined; }
  }

  async loadVision(): Promise<QvacProviderStatus> {
    if (!this.publicKey) throw new InferenceError('UNAVAILABLE', 'Arrancá el provider antes de cargar VisionPsy.');
    if (this.visionId) return this.status();
    this.options.onProgress?.('Cargando VisionPsy para el celular…');
    const sdk = await this.client();
    this.visionId = await sdk.loadModel({
      modelSrc: 'VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M',
      modelConfig: {
        ctx_size: 2048,
        projectionModelSrc: 'MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0',
        image_no_upscale: 'on',
        device: 'gpu',
        'main-gpu': 'dedicated',
        'split-mode': 'none',
      },
    });
    return this.status();
  }

  async stop(): Promise<QvacProviderStatus> {
    if (this.starting) await this.starting.catch(() => {});
    if (!this.publicKey && !this.visionId) return this.status();
    const sdk = await this.client().catch(() => undefined);
    if (sdk && this.visionId) {
      await sdk.unloadModel({ modelId: this.visionId, clearStorage: false, autoClose: false }).catch(() => {});
    }
    this.visionId = null;
    if (sdk && this.publicKey) await sdk.stopQVACProvider().catch(() => {});
    this.publicKey = null;
    return this.status();
  }

  private async open(): Promise<QvacProviderStatus> {
    process.env.QVAC_HYPERSWARM_SEED = this.options.seed;
    this.options.onProgress?.('Arrancando provider QVAC…');
    const sdk = await this.client();
    await sdk.heartbeat();
    const provide = await sdk.startQVACProvider();
    if (!provide.success || !provide.publicKey) {
      throw new InferenceError('UNAVAILABLE', provide.error || 'QVAC no pudo publicar el provider.');
    }
    this.publicKey = provide.publicKey;
    this.options.onProgress?.('Provider en DHT · huella ' + publicKeyFingerprint(provide.publicKey));
    return this.status();
  }

  private client(): Promise<QvacProviderClient> {
    if (this.options.clientFactory) return this.options.clientFactory();
    return import('@qvac/sdk').then(sdk => ({
      heartbeat: () => sdk.heartbeat(),
      startQVACProvider: () => sdk.startQVACProvider(),
      stopQVACProvider: () => sdk.stopQVACProvider(),
      loadModel: async () => sdk.loadModel({
        modelSrc: sdk.VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
        modelConfig: {
          ctx_size: 2048,
          projectionModelSrc: sdk.MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
          image_no_upscale: 'on',
          device: 'gpu',
          'main-gpu': 'dedicated',
          'split-mode': 'none',
        },
      }),
      unloadModel: input => sdk.unloadModel(input),
    }));
  }
}

export function invitationCard(publicKey: string, token: string, expiresAt: string) {
  return {
    v: 1 as const,
    k: publicKey,
    t: token,
    e: expiresAt,
    fingerprint: invitationFingerprint(publicKey, token),
  };
}

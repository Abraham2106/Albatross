import { randomUUID, randomBytes } from 'node:crypto';
import { VisitService } from '../application/visits';
import { CibService } from '../application/cib-service';
import { CaptureService } from '../application/capture-service';
import { SqliteVisitRepository } from '../adapters/persistence/visit-repository';
import { QvacInferenceEngine, QvacPlateVisionEngine } from '../adapters/inference/qvac';
import { visionDelegateFromEnv } from '../adapters/inference/qvac/qvac-plate-vision';
import { downloadAll, inspectModels, writeLlmChoice, type LlmVariant } from '../adapters/inference/qvac/model-pack';
import { probeHardware } from '../adapters/inference/qvac/hardware-probe';
import { pinNvidiaGpu } from '../adapters/inference/qvac/prefer-nvidia';
import { evaluateFit } from '../application/qvac-fit';
import { DeviceRegistry } from '../adapters/peer/device-registry';
import { ComputerPeerService } from '../adapters/peer/computer-peer';
import { ensurePeerSeed, invitationCard, QvacProviderService } from '../adapters/peer/qvac-provider';
import { InferenceError, type OperationOptions } from '../application/ports/inference-engine';
import type { ResidenceMode } from '../application/ports/qvac-fit';
import type { RuntimeStatus } from '../application/desktop-api';

function statusMessage(enabled: boolean, loaded?: { stt: boolean; llm: boolean }) {
  if (!enabled) return 'Faltan modelos. Descargalos en Capturar o con npm run models.';
  if (loaded?.stt) return 'Whisper en memoria · listo';
  return 'QVAC local habilitado. Los modelos se cargan al procesar.';
}

export function createRuntime(filename: string, env: Record<string, string | undefined>, onProgress: (message: string) => void, allowDiskModels = true) {
  const modelsEnabled = env.QVAC_ENABLE_MODELS === '1' || (allowDiskModels && inspectModels().ready);
  const engine = new QvacInferenceEngine({ enabled: modelsEnabled, sttSource: env.QVAC_STT_SOURCE, llmSource: env.QVAC_LLM_SOURCE, onProgress });
  const repository = new SqliteVisitRepository(filename);
  const service = new VisitService(engine, repository, randomUUID);
  const cib = new CibService(service);
  const visionEnabled = env.QVAC_ENABLE_VISION === '1';
  const vision = visionEnabled ? new QvacPlateVisionEngine({
    enabled: true, onProgress, delegate: visionDelegateFromEnv(env),
  }) : undefined;
  const capture = new CaptureService(service, repository, engine, vision);
  const peerId = env.QVAC_PEER_ID?.trim() || 'desktop-peer-local';
  const peerKey = env.QVAC_PEER_PUBLIC_KEY?.trim() || 'pending';
  const pairing = new DeviceRegistry(repository, peerKey);
  const peer = new ComputerPeerService(capture, pairing, peerId);
  const envSeed = env.QVAC_HYPERSWARM_SEED?.trim();
  const seed = envSeed && /^[0-9a-f]{64}$/i.test(envSeed)
    ? envSeed.toLowerCase()
    : env.QVAC_PEER_SEED_FILE?.trim()
      ? ensurePeerSeed(env.QVAC_PEER_SEED_FILE.trim())
      : randomBytes(32).toString('hex');
  const provider = new QvacProviderService({ seed, onProgress });
  const status: RuntimeStatus = { mode: 'qvac', modelsEnabled, message: statusMessage(modelsEnabled, engine.loaded()) };
  const refreshStatus = () => {
    status.message = statusMessage(status.modelsEnabled, engine.loaded());
  };
  return {
    service, cib, capture, pairing, peer, status,
    models: () => ({ ...inspectModels(), loaded: engine.loaded() }),
    async warm(capabilities: Array<'stt' | 'llm'> = ['stt'], options?: OperationOptions) {
      const loaded = await engine.warm(capabilities, options);
      refreshStatus();
      return loaded;
    },
    async downloadModels(signal?: AbortSignal, llm?: LlmVariant) {
      const pack = await downloadAll({ onProgress, signal, llm });
      engine.enable();
      status.modelsEnabled = true;
      await engine.dropLoaded('llm');
      refreshStatus();
      return { ...pack, loaded: engine.loaded() };
    },
    async setLlm(llm: LlmVariant) {
      const pack = inspectModels();
      const wanted = pack.items.find(item => item.name === (llm === '1.7b' ? 'QWEN3_1_7B_INST_Q4' : 'QWEN3_4B_INST_Q4_K_M'));
      if (!wanted?.ready) throw new InferenceError('UNAVAILABLE', 'Descarga ese modelo antes de activarlo.');
      writeLlmChoice(llm);
      await engine.dropLoaded('llm');
      refreshStatus();
      return { ...inspectModels(), loaded: engine.loaded() };
    },
    fit() {
      return { ...evaluateFit(probeHardware({ pin: pinNvidiaGpu }), { llm: inspectModels().llm }), residence: engine.residence(), loaded: engine.loaded() };
    },
    async setResidence(mode: ResidenceMode) {
      if (mode === 'hot') {
        const hot = evaluateFit(probeHardware({ pin: pinNvidiaGpu }), { llm: inspectModels().llm }).policies.find(item => item.id === 'hot_stt_llm');
        if (!hot?.allowed) throw new InferenceError('INVALID_INPUT', hot?.reason || 'Esta GPU no sostiene Whisper y Qwen juntos.');
      }
      await engine.setResidence(mode);
      refreshStatus();
      return { ...evaluateFit(probeHardware({ pin: pinNvidiaGpu }), { llm: inspectModels().llm }), residence: engine.residence(), loaded: engine.loaded() };
    },
    peerStatus() {
      const live = provider.status();
      return { ...live, invitation: null as ReturnType<typeof invitationCard> | null };
    },
    async startPeer() {
      await engine.dropLoaded('stt');
      await engine.dropLoaded('llm');
      const live = await provider.start();
      if (live.publicKey) pairing.setPublicKey(live.publicKey);
      refreshStatus();
      return live;
    },
    async loadPeerVision() {
      const live = await provider.loadVision();
      refreshStatus();
      return live;
    },
    async stopPeer() {
      const live = await provider.stop();
      refreshStatus();
      return live;
    },
    invitePeer() {
      const live = provider.status();
      if (!live.publicKey) throw new InferenceError('UNAVAILABLE', 'Arrancá el provider QVAC antes de invitar al celular.');
      pairing.setPublicKey(live.publicKey);
      const invite = pairing.invite();
      return invitationCard(invite.providerPublicKey, invite.token, invite.expiresAt);
    },
    async close() {
      try { await provider.stop(); }
      finally {
        try { await engine.close?.(); }
        finally { repository.close(); }
      }
    },
  };
}

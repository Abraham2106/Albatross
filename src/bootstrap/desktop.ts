import { randomUUID } from 'node:crypto';
import { VisitService } from '../application/visits';
import { CibService } from '../application/cib-service';
import { CaptureService } from '../application/capture-service';
import { SqliteVisitRepository } from '../adapters/persistence/visit-repository';
import { QvacInferenceEngine, QvacPlateVisionEngine } from '../adapters/inference/qvac';
import { downloadAll, inspectModels } from '../adapters/inference/qvac/model-pack';
import { DeviceRegistry } from '../adapters/peer/device-registry';
import { ComputerPeerService } from '../adapters/peer/computer-peer';
import type { OperationOptions } from '../application/ports/inference-engine';
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
  const vision = visionEnabled ? new QvacPlateVisionEngine({ enabled: modelsEnabled, onProgress }) : undefined;
  const capture = new CaptureService(service, repository, engine, vision);
  const peerId = env.QVAC_PEER_ID?.trim() || 'desktop-peer-local';
  const peerKey = env.QVAC_PEER_PUBLIC_KEY?.trim() || 'desktop-dev-key';
  const pairing = new DeviceRegistry(repository, peerKey);
  const peerEnabled = env.QVAC_ENABLE_PEER === '1';
  const peer = peerEnabled ? new ComputerPeerService(capture, pairing, peerId) : undefined;
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
    async downloadModels(signal?: AbortSignal) {
      const pack = await downloadAll({ onProgress, signal });
      engine.enable();
      status.modelsEnabled = true;
      refreshStatus();
      return { ...pack, loaded: engine.loaded() };
    },
    async close() { try { await engine.close?.(); } finally { repository.close(); } },
  };
}

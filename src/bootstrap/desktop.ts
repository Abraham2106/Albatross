import { randomUUID } from 'node:crypto';
import { VisitService } from '../application/visits';
import { CibService } from '../application/cib-service';
import { SqliteVisitRepository } from '../adapters/persistence/visit-repository';
import { QvacInferenceEngine } from '../adapters/inference/qvac';
import { downloadAll, inspectModels } from '../adapters/inference/qvac/model-pack';
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
  const status: RuntimeStatus = { mode: 'qvac', modelsEnabled, message: statusMessage(modelsEnabled, engine.loaded()) };
  const refreshStatus = () => {
    status.message = statusMessage(status.modelsEnabled, engine.loaded());
  };
  return {
    service, cib, status,
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

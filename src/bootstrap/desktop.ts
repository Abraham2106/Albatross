import { randomUUID } from 'node:crypto';
import { VisitService } from '../application/visits';
import { CibService } from '../application/cib-service';
import { SqliteVisitRepository } from '../adapters/persistence/visit-repository';
import { QvacInferenceEngine } from '../adapters/inference/qvac';
import { downloadAll, inspectModels } from '../adapters/inference/qvac/model-pack';
import type { RuntimeStatus } from '../application/desktop-api';

function statusMessage(enabled: boolean) {
  return enabled ? 'QVAC local habilitado. Los modelos se cargan al procesar.' : 'Faltan modelos. Descargalos en Capturar o con npm run models.';
}

export function createRuntime(filename: string, env: Record<string, string | undefined>, onProgress: (message: string) => void, allowDiskModels = true) {
  const modelsEnabled = env.QVAC_ENABLE_MODELS === '1' || (allowDiskModels && inspectModels().ready);
  const engine = new QvacInferenceEngine({ enabled: modelsEnabled, sttSource: env.QVAC_STT_SOURCE, llmSource: env.QVAC_LLM_SOURCE, onProgress });
  const repository = new SqliteVisitRepository(filename);
  const service = new VisitService(engine, repository, randomUUID);
  const cib = new CibService(service);
  const status: RuntimeStatus = { mode: 'qvac', modelsEnabled, message: statusMessage(modelsEnabled) };
  return {
    service, cib, status,
    models: () => inspectModels(),
    async downloadModels(signal?: AbortSignal) {
      const pack = await downloadAll({ onProgress, signal });
      engine.enable();
      status.modelsEnabled = true;
      status.message = statusMessage(true);
      return pack;
    },
    async close() { try { await engine.close?.(); } finally { repository.close(); } },
  };
}

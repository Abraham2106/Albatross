import { randomUUID } from 'node:crypto';
import { VisitService } from '../application/visits';
import { CibService } from '../application/cib-service';
import { SqliteVisitRepository } from '../adapters/persistence/visit-repository';
import { QvacInferenceEngine } from '../adapters/inference/qvac';
import type { RuntimeStatus } from '../application/desktop-api';

export function createRuntime(filename: string, env: Record<string, string | undefined>, onProgress: (message: string) => void) {
  const modelsEnabled = env.QVAC_ENABLE_MODELS === '1';
  const engine = new QvacInferenceEngine({ enabled: modelsEnabled, sttSource: env.QVAC_STT_SOURCE, llmSource: env.QVAC_LLM_SOURCE, onProgress });
  const repository = new SqliteVisitRepository(filename);
  const service = new VisitService(engine, repository, randomUUID);
  const cib = new CibService(service);
  const status: RuntimeStatus = {
    mode: 'qvac', modelsEnabled,
    message: modelsEnabled ? 'QVAC local habilitado. Los modelos se cargan al procesar.' : 'Modelos deshabilitados hasta QVAC_ENABLE_MODELS=1.',
  };
  return { service, cib, status, async close() { try { await engine.close?.(); } finally { repository.close(); } } };
}

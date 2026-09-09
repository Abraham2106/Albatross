import type { ProcessVisitInput, ReviewInput, VisitService } from './visits';
import type { CibService } from './cib-service';
import type { InferenceErrorCode, TranscriptionRequest } from './ports/inference-engine';
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: InferenceErrorCode; message: string } };
export interface RuntimeStatus { mode: 'qvac'; modelsEnabled: boolean; message: string }
export interface ModelPackStatus {
  ready: boolean;
  totalBytes: number;
  items: readonly { name: string; label: string; file: string; ready: boolean; bytes: number; expected: number }[];
}
export interface DesktopApi {
  status(): Promise<Result<RuntimeStatus>>;
  list(): Promise<Result<ReturnType<VisitService['list']>>>;
  profile(id: string): Promise<Result<ReturnType<VisitService['getProfile']>>>;
  process(requestId: string, input: ProcessVisitInput): Promise<Result<Awaited<ReturnType<VisitService['process']>>>>;
  accept(input: ReviewInput): Promise<Result<ReturnType<VisitService['accept']>>>;
  followUps(requestId: string, hospitalId: string): Promise<Result<Awaited<ReturnType<VisitService['followUps']>>>>;
  cancel(requestId: string): Promise<Result<void>>;
  onProgress(listener: (progress: { requestId: string; message: string }) => void): () => void;
  clientes(): Promise<Result<ReturnType<CibService['clientes']>>>;
  cliente(id: string): Promise<Result<ReturnType<CibService['cliente']>>>;
  geo(): Promise<Result<ReturnType<CibService['geo']>>>;
  resumen(pais?: string): Promise<Result<ReturnType<CibService['resumen']>>>;
  extraer(requestId: string, input: { texto?: string; audio?: TranscriptionRequest }): Promise<Result<Awaited<ReturnType<CibService['extraer']>>>>;
  confirmar(input: { observacionId: string; respuestas: Record<string, 'si' | 'no' | 'nose'> }): Promise<Result<ReturnType<CibService['confirmar']>>>;
  models(): Promise<Result<ModelPackStatus>>;
  downloadModels(requestId: string): Promise<Result<ModelPackStatus>>;
}
declare global { interface Window { philips?: DesktopApi } }

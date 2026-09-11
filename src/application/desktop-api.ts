import type { ProcessVisitInput, ReviewInput, VisitService } from './visits';
import type { NetworkAuditReport } from './network-audit';
import type { CibService } from './cib-service';
import type { InferenceErrorCode, QueryFilter, TranscriptionRequest } from './ports/inference-engine';
import type { WhisperSpeedResult } from './whisper-metrics';
import type { QvacFitReport, ResidenceMode, LlmVariant } from './ports/qvac-fit';
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: InferenceErrorCode; message: string } };
export interface RuntimeStatus { mode: 'qvac'; modelsEnabled: boolean; message: string }
export interface ModelPackStatus {
  ready: boolean;
  totalBytes: number;
  llm: LlmVariant;
  items: readonly { name: string; label: string; file: string; ready: boolean; bytes: number; expected: number; optional?: boolean }[];
  loaded?: { stt: boolean; llm: boolean };
}
export interface OpenWavResult {
  name: string;
  audio: Uint8Array;
  mimeType: 'audio/wav';
  audioMs: number;
}
export interface DesktopApi {
  readonly developmentTools: boolean;
  status(): Promise<Result<RuntimeStatus>>;
  list(): Promise<Result<ReturnType<VisitService['list']>>>;
  profile(id: string): Promise<Result<ReturnType<VisitService['getProfile']>>>;
  process(requestId: string, input: ProcessVisitInput): Promise<Result<Awaited<ReturnType<VisitService['process']>>>>;
  accept(input: ReviewInput): Promise<Result<ReturnType<VisitService['accept']>>>;
  verifyIntegrity(): Promise<Result<ReturnType<VisitService['verifyIntegrity']>>>;
  networkAudit(): Promise<Result<NetworkAuditReport>>;
  followUps(requestId: string, hospitalId: string): Promise<Result<Awaited<ReturnType<VisitService['followUps']>>>>;
  cancel(requestId: string): Promise<Result<void>>;
  onProgress(listener: (progress: { requestId: string; message: string }) => void): () => void;
  clientes(): Promise<Result<ReturnType<CibService['clientes']>>>;
  cliente(id: string): Promise<Result<ReturnType<CibService['cliente']>>>;
  geo(): Promise<Result<ReturnType<CibService['geo']>>>;
  resumen(pais?: string): Promise<Result<ReturnType<CibService['resumen']>>>;
  cargarEjemplo(): Promise<Result<ReturnType<CibService['cargarEjemplo']>>>;
  consultar(requestId: string, input: { pregunta: string } | { filtro: QueryFilter }): Promise<Result<Awaited<ReturnType<CibService['consultar']>>>>;
  extraer(requestId: string, input: { texto?: string; audio?: TranscriptionRequest }): Promise<Result<Awaited<ReturnType<CibService['extraer']>>>>;
  transcribir?(requestId: string, input: TranscriptionRequest): Promise<Result<WhisperSpeedResult>>;
  openWav?(): Promise<Result<OpenWavResult | null>>;
  openWhisperWindow?(): Promise<Result<void>>;
  confirmar(input: { observacionId: string; respuestas: Record<string, 'si' | 'no' | 'nose'> }): Promise<Result<ReturnType<CibService['confirmar']>>>;
  models(): Promise<Result<ModelPackStatus>>;
  downloadModels(requestId: string, options?: { llm?: LlmVariant }): Promise<Result<ModelPackStatus>>;
  preloadModels(requestId: string, capabilities?: Array<'stt' | 'llm'>): Promise<Result<{ stt: boolean; llm: boolean }>>;
  fit(): Promise<Result<QvacFitReport>>;
  setResidence(mode: ResidenceMode): Promise<Result<QvacFitReport>>;
  setLlm(llm: LlmVariant): Promise<Result<ModelPackStatus>>;
}
declare global { interface Window { philips?: DesktopApi } }

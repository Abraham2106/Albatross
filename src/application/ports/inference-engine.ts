import type { Modality, StatusLevel } from '../../domain/types';

export type InferenceErrorCode = 'INVALID_INPUT' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED_INPUT' | 'INVALID_OUTPUT' | 'CANCELLED' | 'CONFLICT';
export class InferenceError extends Error {
  constructor(public readonly code: InferenceErrorCode, message: string) { super(message); this.name = 'InferenceError'; }
}
export type InferenceProvenance =
  | { readonly execution: 'local'; readonly model: string }
  | { readonly execution: 'peer'; readonly model: string; readonly peerId: string };
export interface InferenceTiming {
  readonly loadMs: number;
  readonly inferMs: number;
  readonly totalMs: number;
  readonly coldStart: boolean;
}
export interface InferenceBackend {
  readonly device: 'cpu' | 'gpu';
  readonly name: string;
  readonly graphicsApi?: string;
}
export interface InferenceResult<T> {
  readonly data: T;
  readonly provenance: InferenceProvenance;
  readonly timing?: InferenceTiming;
  readonly backend?: InferenceBackend;
}
export interface OperationOptions { readonly signal?: AbortSignal }
export interface TranscriptionRequest { readonly audio: Uint8Array; readonly mimeType: string }
export interface ExtractionRequest { readonly hospitalId: string; readonly transcript: string }

/** One claim about a total or a distinct equipment group. null means unmentioned. */
export interface ObservationCandidate {
  readonly modality: Modality;
  readonly scope: 'total' | 'group';
  readonly quantity: number | null;
  readonly brand: string | null;
  readonly model: string | null;
  readonly ageYears: number | null;
  readonly ageDescription: string | null;
  readonly quantityApproximate: boolean;
  readonly ageApproximate: boolean;
  readonly unknownFields: readonly ('quantity' | 'brand' | 'model' | 'ageYears')[];
  readonly evidence: string;
}
export interface MentionedHospital {
  readonly name: string | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly evidence: string | null;
}
export interface ExtractionData {
  readonly hospitalId: string;
  readonly mentionedHospital: MentionedHospital;
  readonly candidates: readonly ObservationCandidate[];
}
export interface FollowUpRequest {
  readonly hospitalId: string;
  readonly gaps: readonly { readonly id: string; readonly description: string }[];
}
export interface FollowUpQuestion { readonly gapId: string; readonly text: string }
export interface QueryOptions { readonly countries: readonly string[]; readonly cities: readonly string[]; readonly brands: readonly string[] }
export interface QueryFilter {
  readonly countries: readonly string[];
  readonly cities: readonly string[];
  readonly modalities: readonly Modality[];
  readonly brands: readonly string[];
  readonly model: string | null;
  readonly olderThanYears: number | null;
  readonly youngerThanYears: number | null;
  readonly ageWord: 'old' | 'new' | null;
  readonly minQuantity: number | null;
  readonly statuses: readonly StatusLevel[];
}
export interface QueryRequest { readonly question: string; readonly options: QueryOptions }
export interface InferenceEngine {
  transcribe(input: TranscriptionRequest, options?: OperationOptions): Promise<InferenceResult<{ readonly text: string }>>;
  extractObservations(input: ExtractionRequest, options?: OperationOptions): Promise<InferenceResult<ExtractionData>>;
  generateFollowUps(input: FollowUpRequest, options?: OperationOptions): Promise<InferenceResult<readonly FollowUpQuestion[]>>;
  interpretQuery(input: QueryRequest, options?: OperationOptions): Promise<InferenceResult<QueryFilter>>;
  close?(): Promise<void>;
}

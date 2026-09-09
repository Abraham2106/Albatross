/** Product contract. No SDK, storage, Electron or platform-specific types. */
export type InferenceErrorCode = 'INVALID_INPUT' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED_INPUT';

export class InferenceError extends Error {
  constructor(public readonly code: InferenceErrorCode, message: string) {
    super(message);
    this.name = 'InferenceError';
  }
}

/** Mock execution is never represented as real local QVAC inference. */
export type InferenceProvenance =
  | { readonly execution: 'mock'; readonly scenario: string }
  | { readonly execution: 'local'; readonly model: string }
  | { readonly execution: 'peer'; readonly model: string; readonly peerId: string };

export interface InferenceResult<T> {
  readonly data: T;
  readonly provenance: InferenceProvenance;
}

export interface TranscriptionRequest {
  readonly audio: Uint8Array;
  readonly mimeType: string;
}

export interface ExtractionRequest {
  readonly hospitalId: string;
  readonly transcript: string;
}

/** Candidates are not persisted observations and never imply confirmation. */
export interface ObservationCandidate {
  readonly modality: 'CT' | 'MR';
  readonly field: 'count' | 'ageYears';
  readonly value: number;
  readonly evidence: string;
}

export interface ExtractionData {
  readonly hospitalId: string;
  readonly candidates: readonly ObservationCandidate[];
}

/** The domain supplies and prioritizes gaps; inference only phrases them. */
export interface FollowUpRequest {
  readonly hospitalId: string;
  readonly gaps: readonly {
    readonly id: string;
    readonly description: string;
  }[];
}

export interface FollowUpQuestion {
  readonly gapId: string;
  readonly text: string;
}

export interface InferenceEngine {
  transcribe(input: TranscriptionRequest): Promise<InferenceResult<{ readonly text: string }>>;
  extractObservations(input: ExtractionRequest): Promise<InferenceResult<ExtractionData>>;
  generateFollowUps(input: FollowUpRequest): Promise<InferenceResult<readonly FollowUpQuestion[]>>;
}

import type { ObservationCandidate } from './inference-engine';
import type { CaptureJobState, AttachmentManifest } from './capture-protocol';
import type { ExecutionProvenance, FieldEvidence, PlateFields } from './evidence';
import type { VisitDraft } from './visit-repository';

export interface CaptureJob {
  readonly id: string;
  readonly deviceId: string;
  readonly idempotencyKey: string;
  readonly state: CaptureJobState;
  readonly revision: number;
  readonly hospital: { readonly id?: string; readonly name: string; readonly country: string; readonly city: string };
  readonly note: string | null;
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly attachments: readonly AttachmentManifest[];
  readonly error: { readonly code: string; readonly message: string; readonly recoverable: boolean } | null;
  readonly draftId: string | null;
  readonly visitDraft: VisitDraft | null;
  readonly plate: PlateFields | null;
  readonly evidence: readonly FieldEvidence[];
  readonly provenance: ExecutionProvenance;
  readonly payloadHash: string;
}

export interface CaptureReceipt {
  readonly kind: 'submit' | 'accept';
  readonly idempotencyKey: string;
  readonly captureId: string;
  readonly payloadHash: string;
  readonly jobRevision: number;
  readonly siteRevision: number | null;
  readonly observationId: string | null;
  readonly at: string;
}

export interface CaptureChunk {
  readonly attachmentId: string;
  readonly offset: number;
  readonly bytes: Uint8Array;
}

export interface CaptureStore {
  saveJob(job: CaptureJob): void;
  getJob(id: string): CaptureJob | undefined;
  getJobByIdempotency(deviceId: string, key: string): CaptureJob | undefined;
  listActiveJobs(): CaptureJob[];
  saveReceipt(receipt: CaptureReceipt): void;
  getReceipt(kind: CaptureReceipt['kind'], idempotencyKey: string): CaptureReceipt | undefined;
  putChunk(captureId: string, chunk: CaptureChunk, totalBytes: number): { received: number };
  getAssembled(captureId: string, attachmentId: string, expected: number, sha256: string): Uint8Array | undefined;
  saveAttachmentBytes(captureId: string, attachmentId: string, bytes: Uint8Array, sha256: string): void;
  getAttachmentBytes(captureId: string, attachmentId: string): Uint8Array | undefined;
}

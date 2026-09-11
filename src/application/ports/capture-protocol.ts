/** Application protocol v1 between the capture client and the computer peer. */

export const PROTOCOL_VERSION = 1 as const;
export const OPERATIONS = [
  'capabilities',
  'submitCapture',
  'uploadAttachment',
  'getCaptureStatus',
  'getDraft',
  'acceptDraft',
  'cancelCapture',
  'queryInstalledBase',
] as const;
export type CaptureOperation = (typeof OPERATIONS)[number];

export const CAPTURE_STATES = [
  'received',
  'uploading',
  'queued',
  'processing',
  'needsReview',
  'accepted',
  'failed',
  'cancelled',
] as const;
export type CaptureJobState = (typeof CAPTURE_STATES)[number];

export const QUOTAS = {
  maxPhotos: 3,
  maxImageBytes: 10 * 1024 * 1024,
  maxImagePixels: 20_000_000,
  maxAudioMs: 120_000,
  maxNoteChars: 12_000,
  maxQueue: 4,
  maxActiveInference: 1,
  maxChunkBytes: 256 * 1024,
  maxAttachments: 4,
} as const;

export const IMAGE_MIME = ['image/jpeg', 'image/png'] as const;
export const AUDIO_MIME = ['audio/wav', 'audio/x-wav'] as const;

export type AttachmentKind = 'photo' | 'audio';

export interface ProtocolEnvelope {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly requestId: string;
  readonly deviceId: string;
  readonly captureId: string | null;
  readonly operation: CaptureOperation;
  readonly payload: unknown;
}

export interface AttachmentManifest {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface SubmitCapturePayload {
  readonly hospital: { readonly id?: string; readonly name: string; readonly country: string; readonly city: string };
  readonly note: string | null;
  readonly capturedAt: string;
  readonly attachments: readonly AttachmentManifest[];
  readonly idempotencyKey: string;
}

export interface UploadAttachmentPayload {
  readonly attachmentId: string;
  readonly offset: number;
  readonly byteLength: number;
  readonly dataBase64: string;
  readonly sha256: string;
}

export interface AcceptDraftPayload {
  readonly expectedJobRevision: number;
  readonly expectedSiteRevision: number;
  readonly idempotencyKey: string;
  readonly visitedAt: string;
  readonly identityAcknowledged: boolean;
  readonly candidates: unknown;
}

export interface QueryInstalledBasePayload {
  readonly question: string;
}

export interface CaptureErrorBody {
  readonly code: 'INVALID_INPUT' | 'UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED_INPUT' | 'INVALID_OUTPUT' | 'CANCELLED' | 'CONFLICT';
  readonly message: string;
  readonly recoverable: boolean;
}

export type CaptureEvent =
  | 'submit'
  | 'chunk'
  | 'transferComplete'
  | 'enqueue'
  | 'startProcess'
  | 'draftReady'
  | 'fail'
  | 'accept'
  | 'cancel'
  | 'retry';

import { InferenceError } from './ports/inference-engine';
import {
  AUDIO_MIME, CAPTURE_STATES, IMAGE_MIME, OPERATIONS, PROTOCOL_VERSION, QUOTAS,
  type AcceptDraftPayload, type AttachmentManifest, type CaptureEvent, type CaptureJobState, type CaptureOperation,
  type ProtocolEnvelope, type SubmitCapturePayload, type UploadAttachmentPayload,
} from './ports/capture-protocol';
import { invalid, record, text } from './validation';

const ID = /^[a-zA-Z0-9_-]{8,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TERMINAL: ReadonlySet<CaptureJobState> = new Set(['accepted', 'cancelled']);

export function hexId(value: unknown, label: string): string {
  const raw = text(value, label, 128);
  if (!ID.test(raw)) invalid(label + ': identificador inválido.');
  return raw;
}

function sha256(value: unknown, label: string): string {
  const raw = text(value, label, 64).toLowerCase();
  if (!SHA256.test(raw)) invalid(label + ': hash SHA-256 inválido.');
  return raw;
}

export function parseEnvelope(value: unknown): ProtocolEnvelope {
  const v = record(value);
  if (v.protocolVersion !== PROTOCOL_VERSION) invalid('Versión de protocolo no soportada.');
  const operation = text(v.operation, 'Operación', 40);
  if (!(OPERATIONS as readonly string[]).includes(operation)) invalid('Operación desconocida.');
  const captureId = v.captureId === null || v.captureId === undefined ? null : hexId(v.captureId, 'Captura');
  if (operation !== 'capabilities' && !captureId && operation !== 'queryInstalledBase') invalid('Falta captureId.');
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: hexId(v.requestId, 'Solicitud'),
    deviceId: hexId(v.deviceId, 'Dispositivo'),
    captureId,
    operation: operation as CaptureOperation,
    payload: v.payload === undefined ? {} : v.payload,
  };
}

export function parseSubmitCapture(value: unknown): SubmitCapturePayload {
  const v = record(value);
  const hospital = record(v.hospital);
  const name = text(hospital.name, 'Hospital', 200);
  const country = text(hospital.country, 'País', 80);
  const city = text(hospital.city, 'Ciudad', 80);
  const id = hospital.id === undefined ? undefined : hexId(hospital.id, 'Hospital');
  const note = v.note === null || v.note === undefined ? null : text(v.note, 'Nota', QUOTAS.maxNoteChars);
  const capturedAt = text(v.capturedAt, 'Fecha de captura', 50);
  if (!Number.isFinite(Date.parse(capturedAt))) invalid('Fecha de captura inválida.');
  if (!Array.isArray(v.attachments) || v.attachments.length > QUOTAS.maxAttachments) invalid('Manifiesto de adjuntos inválido.');
  const attachments = v.attachments.map(parseManifest);
  const photos = attachments.filter(a => a.kind === 'photo');
  const audios = attachments.filter(a => a.kind === 'audio');
  if (photos.length > QUOTAS.maxPhotos) invalid('Máximo tres fotos por captura.');
  if (audios.length > 1) invalid('Máximo un audio por captura.');
  if (!photos.length && !note) invalid('La captura necesita una nota o una foto.');
  const ids = attachments.map(a => a.id);
  if (new Set(ids).size !== ids.length) invalid('Adjuntos duplicados.');
  return {
    hospital: { ...(id ? { id } : {}), name, country, city },
    note, capturedAt, attachments,
    idempotencyKey: hexId(v.idempotencyKey, 'Clave idempotente'),
  };
}

export function parseManifest(value: unknown): AttachmentManifest {
  const v = record(value);
  const kind = text(v.kind, 'Tipo de adjunto', 16);
  if (kind !== 'photo' && kind !== 'audio') invalid('Tipo de adjunto inválido.');
  const mimeType = text(v.mimeType, 'MIME', 40).toLowerCase();
  const allowed = kind === 'photo' ? IMAGE_MIME : AUDIO_MIME;
  if (!(allowed as readonly string[]).includes(mimeType)) invalid('Formato de adjunto no soportado.');
  const byteLength = v.byteLength;
  if (typeof byteLength !== 'number' || !Number.isInteger(byteLength) || byteLength <= 0) invalid('Tamaño de adjunto inválido.');
  if (kind === 'photo' && byteLength > QUOTAS.maxImageBytes) invalid('La foto supera 10 MB.');
  if (kind === 'audio' && byteLength > 16_000 * 2 * (QUOTAS.maxAudioMs / 1000) + 128) invalid('El audio supera dos minutos.');
  return { id: hexId(v.id, 'Adjunto'), kind, mimeType, byteLength, sha256: sha256(v.sha256, 'Hash') };
}

export function parseUploadChunk(value: unknown): UploadAttachmentPayload {
  const v = record(value);
  if (typeof v.offset !== 'number' || !Number.isInteger(v.offset) || v.offset < 0) invalid('Offset inválido.');
  if (typeof v.byteLength !== 'number' || !Number.isInteger(v.byteLength) || v.byteLength <= 0 || v.byteLength > QUOTAS.maxChunkBytes) invalid('Fragmento demasiado grande.');
  const dataBase64 = text(v.dataBase64, 'Fragmento', Math.ceil(QUOTAS.maxChunkBytes * 1.4) + 8);
  return {
    attachmentId: hexId(v.attachmentId, 'Adjunto'),
    offset: v.offset,
    byteLength: v.byteLength,
    dataBase64,
    sha256: sha256(v.sha256, 'Hash'),
  };
}

export function parseAcceptDraft(value: unknown): AcceptDraftPayload {
  const v = record(value);
  if (typeof v.expectedJobRevision !== 'number' || !Number.isInteger(v.expectedJobRevision) || v.expectedJobRevision < 0) invalid('Revisión de captura inválida.');
  if (typeof v.expectedSiteRevision !== 'number' || !Number.isInteger(v.expectedSiteRevision) || v.expectedSiteRevision < 0) invalid('Revisión de sitio inválida.');
  if (v.identityAcknowledged !== true && v.identityAcknowledged !== false) invalid('Confirmación de identidad inválida.');
  if (!Array.isArray(v.candidates) || v.candidates.length > 50) invalid('Lista de grupos inválida.');
  return {
    expectedJobRevision: v.expectedJobRevision,
    expectedSiteRevision: v.expectedSiteRevision,
    idempotencyKey: hexId(v.idempotencyKey, 'Clave idempotente'),
    visitedAt: text(v.visitedAt, 'Fecha', 50),
    identityAcknowledged: v.identityAcknowledged,
    candidates: v.candidates,
  };
}

export function decodeChunk(payload: UploadAttachmentPayload): Uint8Array {
  let raw: Buffer;
  try { raw = Buffer.from(payload.dataBase64, 'base64'); }
  catch { throw new InferenceError('INVALID_INPUT', 'Fragmento inválido.'); }
  if (raw.byteLength !== payload.byteLength) invalid('El fragmento no coincide con el tamaño declarado.');
  return new Uint8Array(raw);
}

const TRANSITIONS: Record<CaptureEvent, Partial<Record<CaptureJobState, CaptureJobState>>> = {
  submit: { received: 'received' },
  chunk: { received: 'uploading', uploading: 'uploading' },
  transferComplete: { received: 'queued', uploading: 'queued' },
  enqueue: { queued: 'queued' },
  startProcess: { queued: 'processing' },
  draftReady: { processing: 'needsReview' },
  fail: { processing: 'failed', uploading: 'failed', queued: 'failed' },
  accept: { needsReview: 'accepted' },
  cancel: { received: 'cancelled', uploading: 'cancelled', queued: 'cancelled', processing: 'cancelled', needsReview: 'cancelled', failed: 'cancelled' },
  retry: { failed: 'queued' },
};

export function transition(state: CaptureJobState, event: CaptureEvent): CaptureJobState {
  if (state === 'accepted' && event === 'cancel') return 'accepted';
  if (state === 'accepted' && event === 'accept') return 'accepted';
  const next = TRANSITIONS[event]?.[state];
  if (!next) throw new InferenceError('CONFLICT', 'Transición de captura inválida (' + state + ' + ' + event + ').');
  return next;
}

export function assertLive(state: CaptureJobState) {
  if (TERMINAL.has(state) && state !== 'accepted') invalid('La captura ya no admite esta operación.');
}

export function isCaptureState(value: string): value is CaptureJobState {
  return (CAPTURE_STATES as readonly string[]).includes(value);
}

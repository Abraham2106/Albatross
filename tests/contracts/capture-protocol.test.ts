import { describe, expect, it } from 'vitest';
import {
  decodeChunk, parseAcceptDraft, parseEnvelope, parseSubmitCapture, parseUploadChunk, transition,
} from '../../src/application/capture-protocol';
import { PROTOCOL_VERSION, QUOTAS } from '../../src/application/ports/capture-protocol';
import { inspectImage } from '../../src/application/image-limits';
import { PNG_1x1 } from '../helpers/image';

const HASH = 'a'.repeat(64);

function envelope(operation: string, extra: Record<string, unknown> = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: 'request-01',
    deviceId: 'device-field-1',
    captureId: operation === 'capabilities' ? null : 'capture-note-01',
    operation,
    payload: {},
    ...extra,
  };
}

describe('protocolo de captura v1', () => {
  it('rechaza versión, operación y captureId inválidos', () => {
    expect(() => parseEnvelope({ ...envelope('capabilities'), protocolVersion: 99 })).toThrow('Versión de protocolo');
    expect(() => parseEnvelope(envelope('hackThePeer'))).toThrow('Operación desconocida');
    expect(() => parseEnvelope(envelope('submitCapture', { captureId: null }))).toThrow('Falta captureId');
    expect(() => parseEnvelope(envelope('capabilities', { deviceId: 'short' }))).toThrow('identificador inválido');
  });

  it('acepta capabilities y consulta sin captureId', () => {
    expect(parseEnvelope(envelope('capabilities', { captureId: null })).operation).toBe('capabilities');
    expect(parseEnvelope(envelope('queryInstalledBase', { captureId: null })).operation).toBe('queryInstalledBase');
  });

  it('exige nota o foto, cuotas y hashes', () => {
    const hospital = { name: 'Hospital DemoCare Green', country: 'Costa Rica', city: 'San Jose' };
    expect(() => parseSubmitCapture({
      hospital, note: null, capturedAt: '2026-09-11T12:00:00.000Z', attachments: [], idempotencyKey: 'capture-note-01',
    })).toThrow('nota o una foto');
    expect(() => parseSubmitCapture({
      hospital, note: 'ok', capturedAt: 'no-es-fecha', attachments: [], idempotencyKey: 'capture-note-01',
    })).toThrow('Fecha de captura');
    const photo = { id: 'photo-main-1', kind: 'photo', mimeType: 'image/png', byteLength: 12, sha256: HASH };
    expect(() => parseSubmitCapture({
      hospital, note: null, capturedAt: '2026-09-11T12:00:00.000Z',
      attachments: [photo, { ...photo, id: 'photo-main-2' }, { ...photo, id: 'photo-main-3' }, { ...photo, id: 'photo-main-4' }],
      idempotencyKey: 'capture-note-01',
    })).toThrow('Máximo tres fotos');
    expect(() => parseSubmitCapture({
      hospital, note: null, capturedAt: '2026-09-11T12:00:00.000Z',
      attachments: [{ ...photo, byteLength: QUOTAS.maxImageBytes + 1 }],
      idempotencyKey: 'capture-note-01',
    })).toThrow('10 MB');
    expect(parseSubmitCapture({
      hospital, note: 'Vi dos CT y cuatro MR.', capturedAt: '2026-09-11T12:00:00.000Z', attachments: [],
      idempotencyKey: 'capture-note-01',
    }).note).toBe('Vi dos CT y cuatro MR.');
  });

  it('valida fragmentos y revisiones de aceptación', () => {
    expect(() => parseUploadChunk({
      attachmentId: 'photo-main-1', offset: -1, byteLength: 8, dataBase64: 'YQ==', sha256: HASH,
    })).toThrow('Offset');
    const chunk = parseUploadChunk({
      attachmentId: 'photo-main-1', offset: 0, byteLength: 1, dataBase64: Buffer.from([1]).toString('base64'), sha256: HASH,
    });
    expect(decodeChunk(chunk)).toEqual(new Uint8Array([1]));
    expect(() => decodeChunk({ ...chunk, byteLength: 4 })).toThrow('tamaño declarado');
    expect(() => parseAcceptDraft({
      expectedJobRevision: 1.5, expectedSiteRevision: 0, idempotencyKey: 'accept-key-1',
      visitedAt: '2026-09-11T12:00:00.000Z', identityAcknowledged: true, candidates: [],
    })).toThrow('Revisión de captura');
    expect(parseAcceptDraft({
      expectedJobRevision: 2, expectedSiteRevision: 0, idempotencyKey: 'accept-key-1',
      visitedAt: '2026-09-11T12:00:00.000Z', identityAcknowledged: false, candidates: [],
    }).expectedJobRevision).toBe(2);
  });

  it('aplica la máquina de estados y rechaza transiciones ilegales', () => {
    expect(transition('received', 'transferComplete')).toBe('queued');
    expect(transition('queued', 'startProcess')).toBe('processing');
    expect(transition('processing', 'draftReady')).toBe('needsReview');
    expect(transition('needsReview', 'accept')).toBe('accepted');
    expect(transition('failed', 'retry')).toBe('queued');
    expect(transition('accepted', 'cancel')).toBe('accepted');
    expect(() => transition('accepted', 'startProcess')).toThrow('inválida');
    expect(() => transition('needsReview', 'chunk')).toThrow('inválida');
  });

  it('rechaza imágenes malformadas o demasiado grandes en píxeles', () => {
    expect(inspectImage(new Uint8Array(PNG_1x1), 'image/png')).toMatchObject({ width: 1, height: 1, format: 'png' });
    expect(() => inspectImage(new Uint8Array([1, 2, 3, 4]), 'image/png')).toThrow('malformada');
    expect(() => inspectImage(new Uint8Array(PNG_1x1), 'image/gif')).toThrow('no soportado');
  });
});

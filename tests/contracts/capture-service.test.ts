import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteVisitRepository } from '../../src/adapters/persistence/visit-repository';
import { CaptureService } from '../../src/application/capture-service';
import { VisitService } from '../../src/application/visits';
import { InferenceError, type InferenceEngine } from '../../src/application/ports/inference-engine';
import type { PlateVisionEngine } from '../../src/application/ports/plate-vision';
import { TEST_TRANSCRIPT, fakeEngine } from '../helpers/inference';
import { PNG_1x1 } from '../helpers/image';

const now = '2026-09-11T12:00:00.000Z';
const hospital = { name: 'Hospital DemoCare Green', country: 'Costa Rica', city: 'San Jose' };
const session = { deviceId: 'device-field-1', author: 'Ana', peerId: 'desktop-peer-local' };
const resources: Array<() => void> = [];
afterEach(() => { resources.splice(0).reverse().forEach(close => close()); });

const pngHash = createHash('sha256').update(PNG_1x1).digest('hex');

function fakeVision(): PlateVisionEngine {
  return {
    async extractPlate(input) {
      return {
        data: {
          brand: 'BluePeak Medical', model: 'Aether 3T', modality: 'MR', serial: 'BP-A3T-88421',
          manufactureDate: '2017-03', originalReadings: {}, warnings: [], illegibleFields: [],
        },
        provenance: { execution: 'local', model: 'fake-vision' },
      };
    },
  };
}

function setup(filename = ':memory:', engine: InferenceEngine = fakeEngine(), vision: PlateVisionEngine | undefined = fakeVision()) {
  const repo = new SqliteVisitRepository(filename);
  resources.push(() => { try { repo.close(); } catch { /* already closed */ } });
  let serial = 0;
  const visits = new VisitService(engine, repo, () => 'id-' + ++serial, () => now);
  const capture = new CaptureService(visits, repo, engine, vision, () => 'id-' + ++serial, () => now);
  return { repo, visits, capture };
}

function notePayload(key = 'capture-note-01', extras: Record<string, unknown> = {}) {
  return {
    hospital, note: TEST_TRANSCRIPT, capturedAt: now, attachments: [], idempotencyKey: key, ...extras,
  };
}

function photoPayload(key = 'capture-photo-01') {
  return {
    hospital, note: null, capturedAt: now, idempotencyKey: key,
    attachments: [{ id: 'photo-main-1', kind: 'photo', mimeType: 'image/png', byteLength: PNG_1x1.byteLength, sha256: pngHash }],
  };
}

function uploadAll(capture: CaptureService, captureId: string, bytes = PNG_1x1, attachmentId = 'photo-main-1') {
  return capture.upload(session, captureId, {
    attachmentId, offset: 0, byteLength: bytes.byteLength, dataBase64: Buffer.from(bytes).toString('base64'), sha256: pngHash,
  });
}

describe('captura: persistencia, transferencia y aceptación', () => {
  it('submit es idempotente y conflicto si el payload cambia', () => {
    const { capture } = setup();
    const first = capture.submit(session, notePayload());
    const again = capture.submit(session, notePayload());
    expect(again).toEqual(first);
    expect(() => capture.submit(session, notePayload('capture-note-01', { note: TEST_TRANSCRIPT + ' extra' })))
      .toThrow(InferenceError);
    try { capture.submit(session, notePayload('capture-note-01', { note: TEST_TRANSCRIPT + ' extra' })); }
    catch (error) { expect(error).toMatchObject({ code: 'CONFLICT' }); }
  });

  it('procesa nota, acepta dos veces el mismo recibo y rechaza payload o revisión vieja', async () => {
    const { capture, repo } = setup();
    const submitted = capture.submit(session, notePayload());
    const draftJob = await capture.process(session, submitted.captureId);
    expect(draftJob.state).toBe('needsReview');
    expect(draftJob.visitDraft?.source).toBe('Manual');
    expect(draftJob.evidence.some(e => e.kind === 'text')).toBe(true);
    const acceptBody = {
      expectedJobRevision: draftJob.revision, expectedSiteRevision: 0, idempotencyKey: 'accept-key-01',
      visitedAt: now, identityAcknowledged: true, candidates: draftJob.visitDraft!.extraction.candidates,
    };
    const receipt = capture.accept(session, submitted.captureId, acceptBody);
    expect(receipt.observationId).toBe(draftJob.draftId);
    expect(capture.accept(session, submitted.captureId, acceptBody)).toEqual(receipt);
    try {
      capture.accept(session, submitted.captureId, { ...acceptBody, visitedAt: '2026-09-11T11:00:00.000Z' });
      expect.unreachable();
    } catch (error) { expect(error).toMatchObject({ code: 'CONFLICT' }); }
    const other = capture.submit(session, notePayload('capture-note-02'));
    const otherJob = await capture.process(session, other.captureId);
    try {
      capture.accept(session, other.captureId, {
        ...acceptBody, idempotencyKey: 'accept-key-02', expectedJobRevision: otherJob.revision - 1,
        candidates: otherJob.visitDraft!.extraction.candidates,
      });
      expect.unreachable();
    } catch (error) { expect(error).toMatchObject({ code: 'CONFLICT' }); }
    expect(repo.listSites()).toHaveLength(1);
    const cancelled = capture.cancel(session, submitted.captureId);
    expect(cancelled.state).toBe('accepted');
  });

  it('reanuda un adjunto, verifica el hash y no infiere un PNG incompleto', () => {
    const dir = mkdtempSync(join(tmpdir(), 'capture-resume-')); resources.push(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, 'visits.sqlite');
    const first = setup(file);
    const submitted = first.capture.submit(session, photoPayload());
    const mid = Math.floor(PNG_1x1.byteLength / 2) || 1;
    first.capture.upload(session, submitted.captureId, {
      attachmentId: 'photo-main-1', offset: 0, byteLength: mid,
      dataBase64: Buffer.from(PNG_1x1.subarray(0, mid)).toString('base64'), sha256: pngHash,
    });
    expect(first.capture.status(session, submitted.captureId).state).toBe('uploading');
    first.repo.close();
    const reopened = setup(file);
    expect(reopened.capture.status(session, submitted.captureId).state).toBe('uploading');
    const done = reopened.capture.upload(session, submitted.captureId, {
      attachmentId: 'photo-main-1', offset: mid, byteLength: PNG_1x1.byteLength - mid,
      dataBase64: Buffer.from(PNG_1x1.subarray(mid)).toString('base64'), sha256: pngHash,
    });
    expect(done.state).toBe('queued');
    expect(reopened.repo.getAttachmentBytes(submitted.captureId, 'photo-main-1')?.byteLength).toBe(PNG_1x1.byteLength);
  });

  it('rechaza un adjunto corrupto o no declarado', () => {
    const { capture } = setup();
    const submitted = capture.submit(session, photoPayload());
    expect(() => capture.upload(session, submitted.captureId, {
      attachmentId: 'photo-other-9', offset: 0, byteLength: PNG_1x1.byteLength,
      dataBase64: Buffer.from(PNG_1x1).toString('base64'), sha256: pngHash,
    })).toThrow('no declarado');
    const otherHash = 'b'.repeat(64);
    expect(() => capture.upload(session, submitted.captureId, {
      attachmentId: 'photo-main-1', offset: 0, byteLength: PNG_1x1.byteLength,
      dataBase64: Buffer.from(PNG_1x1).toString('base64'), sha256: otherHash,
    })).toThrow('manifiesto');
  });

  it('foto sin nota produce borrador Photo y se acepta con evidencia de hash', async () => {
    const { capture, repo } = setup();
    const submitted = capture.submit(session, photoPayload());
    uploadAll(capture, submitted.captureId);
    const job = await capture.process(session, submitted.captureId);
    expect(job.state).toBe('needsReview');
    expect(job.visitDraft?.source).toBe('Photo');
    expect(job.plate?.serial).toBe('BP-A3T-88421');
    expect(job.visitDraft?.provenance).toEqual({ execution: 'local', model: 'fake-vision' });
    expect(job.provenance.model).toBe('fake-vision');
    expect(job.provenance.modelVersion).toBeNull();
    expect(job.provenance.inference).toEqual({ execution: 'local', model: 'fake-vision' });
    expect(job.provenance.captureDeviceId).toBe(session.deviceId);
    expect(job.provenance.executorPeerId).toBe(session.peerId);
    const candidates = job.visitDraft!.extraction.candidates;
    expect(candidates[0]?.evidence).toBe('photo:' + pngHash);
    const receipt = capture.accept(session, submitted.captureId, {
      expectedJobRevision: job.revision, expectedSiteRevision: 0, idempotencyKey: 'accept-photo-01',
      visitedAt: now, identityAcknowledged: true, candidates,
    });
    expect(receipt.kind).toBe('accept');
    expect(repo.getDraft(job.draftId!)?.status).toBe('accepted');
  });

  it('persiste procedencia peer del motor sin sustituirla por la sesión de captura', async () => {
    const peerProvenance = { execution: 'peer' as const, model: 'vision-contract', peerId: 'ab'.repeat(32) };
    const vision: PlateVisionEngine = { async extractPlate(input) {
      const result = await fakeVision().extractPlate(input);
      return { ...result, provenance: peerProvenance };
    } };
    const { capture, repo } = setup(':memory:', fakeEngine(), vision);
    const receipt = capture.submit(session, photoPayload());
    uploadAll(capture, receipt.captureId);
    const job = await capture.process(session, receipt.captureId);
    expect(repo.getDraft(job.draftId!)?.provenance).toEqual(peerProvenance);
    expect(repo.getJob(job.id)?.provenance.inference).toEqual(peerProvenance);
    expect(job.provenance.modelVersion).toBeNull();
  });

  it('un fallo de visión deja el trabajo en failed y el siguiente puede correr', async () => {
    let fail = true;
    const vision: PlateVisionEngine = {
      async extractPlate(input) {
        if (fail) throw new InferenceError('UNAVAILABLE', 'visión ocupada');
        return fakeVision().extractPlate(input);
      },
    };
    const { capture, repo } = setup(':memory:', fakeEngine(), vision);
    const a = capture.submit(session, photoPayload('capture-photo-01'));
    uploadAll(capture, a.captureId);
    await expect(capture.process(session, a.captureId)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(capture.status(session, a.captureId).state).toBe('failed');
    expect(repo.getAttachmentBytes(a.captureId, 'photo-main-1')).toEqual(new Uint8Array(PNG_1x1));
    const note = capture.submit(session, notePayload('note-with-vision-unavailable'));
    expect((await capture.process(session, note.captureId)).state).toBe('needsReview');
    capture.retry(session, a.captureId);
    fail = false;
    const recovered = await capture.process(session, a.captureId);
    expect(recovered.state).toBe('needsReview');
  });

  it('no permite dos inferencias a la vez', async () => {
    let release!: (value: unknown) => void;
    const engine = fakeEngine({
      async extractObservations(input, options) {
        await new Promise(resolve => { release = resolve; });
        return fakeEngine().extractObservations(input, options);
      },
    });
    const { capture } = setup(':memory:', engine);
    capture.submit(session, notePayload('capture-note-01'));
    capture.submit(session, notePayload('capture-note-02'));
    const pending = capture.process(session, 'capture-note-01');
    await Promise.resolve();
    await expect(capture.process(session, 'capture-note-02')).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    release(undefined);
    await pending;
  });
});

import { createHash, randomUUID } from 'node:crypto';
import { canonicalize } from './integrity';
import { inspectImage } from './image-limits';
import { decodeChunk, parseAcceptDraft, parseSubmitCapture, parseUploadChunk, transition } from './capture-protocol';
import { QUOTAS } from './ports/capture-protocol';
import type { CaptureJob, CaptureReceipt, CaptureStore } from './ports/capture-store';
import type { ExecutionProvenance, FieldEvidence, PlateFields } from './ports/evidence';
import type { InferenceEngine } from './ports/inference-engine';
import { InferenceError, type InferenceProvenance } from './ports/inference-engine';
import type { PlateVisionEngine } from './ports/plate-vision';
import type { VisitDraft, VisitRepository } from './ports/visit-repository';
import { checkCancelled, invalid, text, validateCandidate } from './validation';
import { VisitService } from './visits';
import { fusePlateWithTranscript, plateToCandidates, sanitizePlate } from './capture-fusion';

export interface CaptureSession {
  readonly deviceId: string;
  readonly author: string;
  readonly peerId: string;
}

export class CaptureService {
  private processing = false;
  constructor(
    private readonly visits: VisitService,
    private readonly repository: VisitRepository & CaptureStore,
    private readonly engine: InferenceEngine,
    private readonly vision: PlateVisionEngine | undefined,
    private readonly newId: () => string = () => randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  capabilities() {
    return {
      protocolVersion: 1,
      quotas: QUOTAS,
      vision: Boolean(this.vision),
      stt: true,
      llm: true,
      queue: { active: this.processing, pending: this.repository.listActiveJobs().filter(j => j.state === 'queued').length, max: QUOTAS.maxQueue },
    };
  }

  submit(session: CaptureSession, payload: unknown): CaptureReceipt {
    const body = parseSubmitCapture(payload);
    const payloadHash = createHash('sha256').update(canonicalize(body)).digest('hex');
    const existing = this.repository.getJobByIdempotency(session.deviceId, body.idempotencyKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new InferenceError('CONFLICT', 'La misma clave idempotente llegó con otro payload.');
      const receipt = this.repository.getReceipt('submit', body.idempotencyKey);
      if (!receipt) throw new InferenceError('UNAVAILABLE', 'Falta el recibo de una captura ya registrada.');
      return receipt;
    }
    const queued = this.repository.listActiveJobs().filter(j => j.state === 'queued' || j.state === 'processing').length;
    if (queued >= QUOTAS.maxQueue) throw new InferenceError('UNAVAILABLE', 'La cola de captura está llena.');
    const id = body.idempotencyKey;
    const receivedAt = this.now();
    const provenance = this.provenance(session, body.capturedAt, receivedAt, body.attachments.map(a => a.sha256));
    let state = transition('received', 'submit');
    if (!body.attachments.length) state = transition(state, 'transferComplete');
    const job: CaptureJob = {
      id, deviceId: session.deviceId, idempotencyKey: body.idempotencyKey, state, revision: 1,
      hospital: body.hospital, note: body.note, capturedAt: body.capturedAt, receivedAt,
      attachments: body.attachments, error: null, draftId: null, visitDraft: null, plate: null, evidence: [],
      provenance, payloadHash,
    };
    this.repository.saveJob(job);
    const receipt: CaptureReceipt = {
      kind: 'submit', idempotencyKey: body.idempotencyKey, captureId: id, payloadHash,
      jobRevision: job.revision, siteRevision: null, observationId: null, at: receivedAt,
    };
    this.repository.saveReceipt(receipt);
    return receipt;
  }

  upload(session: CaptureSession, captureId: string, payload: unknown): CaptureJob {
    const job = this.requireJob(session, captureId);
    const chunk = parseUploadChunk(payload);
    const manifest = job.attachments.find(a => a.id === chunk.attachmentId);
    if (!manifest) invalid('Adjunto no declarado.');
    if (chunk.sha256 !== manifest.sha256) invalid('El hash del fragmento no coincide con el manifiesto.');
    const bytes = decodeChunk(chunk);
    const { received } = this.repository.putChunk(job.id, { attachmentId: chunk.attachmentId, offset: chunk.offset, bytes }, manifest.byteLength);
    let next: CaptureJob = { ...job, state: transition(job.state, 'chunk'), revision: job.revision + 1 };
    if (received >= manifest.byteLength) {
      const assembled = this.repository.getAssembled(job.id, manifest.id, manifest.byteLength, manifest.sha256);
      if (!assembled) throw new InferenceError('INVALID_INPUT', 'El adjunto está incompleto.');
      if (manifest.kind === 'photo') inspectImage(assembled, manifest.mimeType);
    }
    if (job.attachments.every(a => this.repository.getAttachmentBytes(job.id, a.id))) {
      next = { ...next, state: transition(next.state, 'transferComplete'), revision: next.revision + 1 };
    }
    this.repository.saveJob(next);
    return next;
  }

  async process(session: CaptureSession, captureId: string, options: { signal?: AbortSignal } = {}): Promise<CaptureJob> {
    const job = this.requireJob(session, captureId);
    if (job.state !== 'queued') throw new InferenceError('CONFLICT', 'La captura no está lista para procesar.');
    checkCancelled(options.signal);
    if (this.processing) throw new InferenceError('UNAVAILABLE', 'Hay otra inferencia activa.');
    this.processing = true;
    let current: CaptureJob = { ...job, state: transition(job.state, 'startProcess'), revision: job.revision + 1 };
    this.repository.saveJob(current);
    try {
      const photos = current.attachments.filter(a => a.kind === 'photo');
      const audio = current.attachments.find(a => a.kind === 'audio');
      let plate: PlateFields | null = null;
      const evidence: FieldEvidence[] = [];
      let model: string | null = null;
      let visionProvenance: InferenceProvenance | null = null;
      if (photos.length && !this.vision) throw new InferenceError('UNAVAILABLE', 'No hay motor visual local.');
      if (photos.length && this.vision) {
        for (const photo of photos) {
          const image = this.repository.getAttachmentBytes(current.id, photo.id);
          if (!image) throw new InferenceError('INVALID_INPUT', 'Falta la foto para inferencia.');
          const result = await this.vision.extractPlate({ image, mimeType: photo.mimeType, imageId: photo.id, sha256: photo.sha256 }, options);
          plate = sanitizePlate(result.data);
          model = result.provenance.model;
          visionProvenance = result.provenance;
          evidence.push({ kind: 'photo', imageId: photo.id, sha256: photo.sha256, proposedReading: result.data.brand, crop: null });
        }
      }
      let transcript = current.note ?? '';
      if (audio) {
        const wav = this.repository.getAttachmentBytes(current.id, audio.id);
        if (!wav) throw new InferenceError('INVALID_INPUT', 'Falta el audio.');
        const spoken = await this.engine.transcribe({ audio: wav, mimeType: audio.mimeType }, options);
        transcript = spoken.data.text;
        evidence.push({ kind: 'text', quote: transcript, author: session.author, capturedAt: current.capturedAt });
      } else if (current.note) {
        evidence.push({ kind: 'text', quote: current.note, author: session.author, capturedAt: current.capturedAt });
      }
      const hospital = current.hospital.id
        ? { id: current.hospital.id, name: current.hospital.name, country: current.hospital.country, city: current.hospital.city }
        : { name: current.hospital.name, country: current.hospital.country, city: current.hospital.city };
      let visitDraft: VisitDraft;
      if (transcript.trim()) {
        visitDraft = await this.visits.process({ hospital, transcript }, options);
        if (plate) visitDraft = this.mergePlateIntoDraft(visitDraft, plate, photos[0]?.sha256 ?? '', photos.length > 0);
      } else {
        visitDraft = this.syntheticPhotoDraft(current, plate, visionProvenance);
      }
      current = {
        ...current,
        state: transition(current.state, 'draftReady'),
        revision: current.revision + 1,
        plate, evidence, visitDraft, draftId: visitDraft.id,
        provenance: { ...current.provenance, processedAt: this.now(), model, inference: visitDraft.provenance },
      };
      const latest = this.repository.getJob(current.id);
      if (latest?.state === 'cancelled' || latest?.state === 'accepted') return latest;
      this.repository.saveJob(current);
      return current;
    } catch (error) {
      const latest = this.repository.getJob(current.id);
      if (latest?.state === 'cancelled' || latest?.state === 'accepted') throw error;
      const failed: CaptureJob = {
        ...current,
        state: transition(current.state, 'fail'),
        revision: current.revision + 1,
        error: {
          code: error instanceof InferenceError ? error.code : 'UNAVAILABLE',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        },
      };
      this.repository.saveJob(failed);
      throw error;
    } finally {
      this.processing = false;
    }
  }

  accept(session: CaptureSession, captureId: string, payload: unknown) {
    const job = this.requireJob(session, captureId);
    const body = parseAcceptDraft(payload);
    const payloadHash = createHash('sha256').update(canonicalize({ captureId, ...body })).digest('hex');
    const previous = this.repository.getReceipt('accept', body.idempotencyKey);
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new InferenceError('CONFLICT', 'La misma clave de aceptación llegó con otro payload.');
      return previous;
    }
    if (job.revision !== body.expectedJobRevision) throw new InferenceError('CONFLICT', 'El borrador cambió. Vuelve a revisar.');
    if (!job.visitDraft) throw new InferenceError('INVALID_INPUT', 'No hay borrador para aceptar.');
    const siteRevision = this.repository.getSite(job.visitDraft.site.id)?.revision ?? 0;
    if (siteRevision !== body.expectedSiteRevision) throw new InferenceError('CONFLICT', 'El perfil cambió mientras revisabas.');
    const candidates = (body.candidates as unknown[]).map(c => validateCandidate(c, job.visitDraft!.transcript, job.visitDraft!.source));
    const profile = this.visits.accept({
      draftId: job.visitDraft.id, author: session.author, visitedAt: body.visitedAt,
      candidates, identityAcknowledged: body.identityAcknowledged,
    });
    const accepted: CaptureJob = { ...job, state: transition(job.state, 'accept'), revision: job.revision + 1 };
    this.repository.saveJob(accepted);
    const receipt: CaptureReceipt = {
      kind: 'accept', idempotencyKey: body.idempotencyKey, captureId, payloadHash,
      jobRevision: accepted.revision, siteRevision: this.repository.getSite(profile.site.id)?.revision ?? siteRevision + 1,
      observationId: job.visitDraft.id, at: this.now(),
    };
    this.repository.saveReceipt(receipt);
    return receipt;
  }

  cancel(session: CaptureSession, captureId: string): CaptureJob {
    const job = this.requireJob(session, captureId);
    if (job.state === 'accepted') return job;
    const next = { ...job, state: transition(job.state, 'cancel'), revision: job.revision + 1 };
    this.repository.saveJob(next);
    return next;
  }

  retry(session: CaptureSession, captureId: string): CaptureJob {
    const job = this.requireJob(session, captureId);
    const next = { ...job, state: transition(job.state, 'retry'), revision: job.revision + 1, error: null };
    this.repository.saveJob(next);
    return next;
  }

  status(session: CaptureSession, captureId: string) { return this.requireJob(session, captureId); }

  private requireJob(session: CaptureSession, captureId: string): CaptureJob {
    const job = this.repository.getJob(text(captureId, 'Captura', 128));
    if (!job) invalid('Captura no encontrada.');
    if (job.deviceId !== session.deviceId) throw new InferenceError('CONFLICT', 'Esta captura pertenece a otro dispositivo.');
    return job;
  }

  private provenance(session: CaptureSession, capturedAt: string, receivedAt: string, hashes: readonly string[]): ExecutionProvenance {
    return {
      schemaVersion: 1, author: session.author, captureDeviceId: session.deviceId, executorPeerId: session.peerId,
      capturedAt, receivedAt, processedAt: null, model: null, modelVersion: null, inference: null, attachmentHashes: hashes,
    };
  }

  private syntheticPhotoDraft(job: CaptureJob, plate: PlateFields | null, visionProvenance: InferenceProvenance | null): VisitDraft {
    const saved = job.hospital.id ? this.repository.getSite(job.hospital.id) : undefined;
    const site = saved?.site ?? { id: job.hospital.id ?? this.newId(), name: job.hospital.name, country: job.hospital.country, city: job.hospital.city, facts: [] };
    const hash = job.attachments.find(a => a.kind === 'photo')?.sha256 ?? '0'.repeat(64);
    const cleaned = plate ? sanitizePlate(plate) : null;
    const draft: VisitDraft = {
      id: this.newId(), site, baseRevision: saved?.revision ?? 0, transcript: job.note ?? '',
      extraction: { hospitalId: site.id, mentionedHospital: { name: null, city: null, country: null, evidence: null }, candidates: plateToCandidates(cleaned, hash) },
      provenance: visionProvenance ?? { execution: 'local', model: 'none' },
      createdAt: this.now(), source: 'Photo', status: 'pending',
    };
    this.repository.saveDraft(draft);
    return draft;
  }

  private mergePlateIntoDraft(draft: VisitDraft, plate: PlateFields, sha256: string, fromPhoto: boolean): VisitDraft {
    const fused = fusePlateWithTranscript(draft.extraction.candidates, plate, sha256);
    const warning = [draft.identityWarning, ...fused.warnings].filter(Boolean).join(' ') || undefined;
    const merged: VisitDraft = {
      ...draft,
      source: fromPhoto ? 'Photo' : draft.source,
      extraction: { ...draft.extraction, candidates: fused.candidates },
      ...(warning ? { identityWarning: warning } : {}),
    };
    this.repository.updateDraft(merged);
    return merged;
  }
}

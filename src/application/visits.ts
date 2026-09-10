import { createSite, mergeAll, explainCertainty, rankMissingFields } from '../domain';
import type { Candidate, Site } from '../domain/types';
import { InferenceError, type InferenceEngine, type OperationOptions, type ObservationCandidate, type TranscriptionRequest, type InferenceProvenance, type InferenceResult, type ExtractionData } from './ports/inference-engine';
import type { HospitalInput, VisitDraft, VisitRepository } from './ports/visit-repository';
import { checkCancelled, invalid, record, text, validateCandidate } from './validation';
import { applyRespuestas, resolveHospital, type CibRespuesta } from './cib';

export interface ProcessVisitInput {
  hospital: HospitalInput;
  transcript?: string;
  audio?: TranscriptionRequest;
}
export interface ProcessFreeInput {
  transcript?: string;
  audio?: TranscriptionRequest;
}
export interface ReviewInput {
  draftId: string; author: string; visitedAt: string; candidates: readonly ObservationCandidate[];
  identityAcknowledged: boolean;
}
export function toDomainCandidate(c: ObservationCandidate, siteId: string, author: string, timestamp: string, channel: 'Voice' | 'Manual'): Candidate {
  return {
    siteId, modality: c.modality, scope: c.scope, extractedAge: true,
    ...(c.ageDescription ? { groupLabel: c.ageDescription.toLowerCase() } : {}),
    ...(c.quantity === null ? {} : { quantity: c.quantity }),
    ...(c.brand === null ? {} : { brand: c.brand }),
    ...(c.model === null ? {} : { model: c.model }),
    ...(c.ageYears === null ? {} : { approxAgeYears: c.ageYears }),
    rawAnswerText: c.evidence,
    notes: [c.ageDescription ? 'Edad cualitativa: ' + c.ageDescription : '', c.quantityApproximate ? 'Cantidad aproximada' : '', c.ageApproximate ? 'Edad aproximada' : '', c.unknownFields.length ? 'Desconocido: ' + c.unknownFields.join(', ') : ''].filter(Boolean).join('; '),
    source: { author, timestamp, channel },
  };
}
export class VisitService {
  constructor(private readonly engine: InferenceEngine, private readonly repository: VisitRepository, private readonly newId: () => string, private readonly now = () => new Date().toISOString()) {}
  list() { return { sites: this.repository.listSites(), drafts: this.repository.listDrafts() }; }
    verifyIntegrity() { return this.repository.verifyIntegrity(); }
  getProfile(id: string) {
    const entry = this.repository.getSite(text(id, 'Hospital'));
    if (!entry) invalid('Hospital no encontrado.');
    return this.profile(entry.site);
  }
  private profile(site: Site) { return { site, certainty: explainCertainty(site, this.now()), questions: rankMissingFields(site, this.now()).slice(0, 12) }; }
  private bindHospital(h: HospitalInput) {
    if (h.id) {
      const saved = this.repository.getSite(text(h.id, 'Hospital'));
      if (!saved) invalid('El hospital seleccionado ya no existe.');
      return { site: saved.site, baseRevision: saved.revision };
    }
    return { site: createSite({ id: this.newId(), name: text(h.name, 'Nombre del hospital'), country: text(h.country, 'País'), city: text(h.city, 'Ciudad') }), baseRevision: 0 };
  }
  private async readTranscript(input: { transcript?: string; audio?: TranscriptionRequest }, options: OperationOptions) {
    if (input.audio && input.transcript) invalid('Envía audio o texto, no ambos.');
    if (input.audio) {
      const result = await this.engine.transcribe(input.audio, options);
      return { transcript: text(result.data.text, 'Transcripción', 12000), transcriptionProvenance: result.provenance, source: 'Voice' as const };
    }
    return { transcript: text(input.transcript, 'Transcripción', 12000), source: 'Manual' as const };
  }
  private writeDraft(site: Site, baseRevision: number, transcript: string, result: InferenceResult<ExtractionData>, source: 'Voice' | 'Manual', transcriptionProvenance?: InferenceProvenance, extraWarning?: string) {
    const mention = result.data.mentionedHospital;
    const differences = (['name', 'country', 'city'] as const).filter(k => mention[k] && mention[k]!.trim().toLocaleLowerCase() !== site[k].trim().toLocaleLowerCase());
    const identityWarning = extraWarning
      ?? (differences.length ? 'El dictado menciona datos distintos del hospital seleccionado: ' + differences.join(', ') + '. Revisa el destino antes de guardar.' : undefined);
    const draft: VisitDraft = {
      id: this.newId(), site, baseRevision, transcript, extraction: { ...result.data, hospitalId: site.id }, provenance: result.provenance,
      ...(transcriptionProvenance ? { transcriptionProvenance } : {}),
      createdAt: this.now(), source, status: 'pending',
      ...(identityWarning ? { identityWarning } : {}),
    };
    this.repository.saveDraft(draft);
    return draft;
  }
  async process(input: ProcessVisitInput, options: OperationOptions = {}): Promise<VisitDraft> {
    record(input);
    const { site, baseRevision } = this.bindHospital(record(input.hospital) as unknown as HospitalInput);
    checkCancelled(options.signal);
    const spoken = await this.readTranscript(input, options);
    checkCancelled(options.signal);
    const result = await this.engine.extractObservations({ hospitalId: site.id, transcript: spoken.transcript }, options);
    checkCancelled(options.signal);
    return this.writeDraft(site, baseRevision, spoken.transcript, result, spoken.source, spoken.transcriptionProvenance);
  }
  async processFree(input: ProcessFreeInput, options: OperationOptions = {}): Promise<VisitDraft> {
    record(input);
    const spoken = await this.readTranscript(input, options);
    checkCancelled(options.signal);
    const tempId = this.newId();
    const result = await this.engine.extractObservations({ hospitalId: tempId, transcript: spoken.transcript }, options);
    checkCancelled(options.signal);
    const resolved = resolveHospital(result.data.mentionedHospital, this.repository.listSites());
    const { site, baseRevision } = this.bindHospital(resolved.hospital);
    return this.writeDraft(site, baseRevision, spoken.transcript, result, spoken.source, spoken.transcriptionProvenance, resolved.identityWarning);
  }
  accept(input: ReviewInput) {
    record(input);
    const draft = this.repository.getDraft(text(input.draftId, 'Borrador'));
    if (!draft) invalid('Borrador no encontrado.');
    if (draft.status === 'accepted') return this.getProfile(draft.site.id);
    const author = text(input.author, 'Observador');
    const visitedAt = text(input.visitedAt, 'Fecha', 50);
    const date = new Date(visitedAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() > new Date(this.now()).getTime() + 60000 || date.getUTCFullYear() < 1900) invalid('Fecha de visita inválida o futura.');
    if (!Array.isArray(input.candidates) || input.candidates.length > 50) invalid('Lista de grupos inválida.');
    // Human edits may change values, but evidence must still point to the original dictation.
    const candidates = input.candidates.map(c => validateCandidate(c, draft.transcript));
    if (draft.identityWarning && input.identityAcknowledged !== true) invalid('Confirma que revisaste el hospital de destino.');
    const current = this.repository.getSite(draft.site.id);
    if ((current?.revision ?? 0) !== draft.baseRevision) throw new InferenceError('CONFLICT', 'El perfil cambió mientras revisabas. Genera un nuevo borrador con el texto conservado.');
    const site = mergeAll(current?.site ?? draft.site, candidates.map(c => toDomainCandidate(c, draft.site.id, author, date.toISOString(), draft.source)));
    this.repository.accept({ draftId: draft.id, site, author, visitedAt: date.toISOString(), acceptedAt: this.now(), reviewedCandidates: candidates, originalDraft: draft });
    return this.profile(site);
  }
  confirmCards(draftId: string, respuestas: Record<string, CibRespuesta>, author = 'Colaborador local') {
    const draft = this.repository.getDraft(text(draftId, 'Borrador'));
    if (!draft) invalid('Borrador no encontrado.');
    return this.accept({
      draftId: draft.id, author, visitedAt: this.now(),
      candidates: applyRespuestas(draft, respuestas), identityAcknowledged: true,
    });
  }
  async followUps(id: string, options: OperationOptions = {}) {
    const profile = this.getProfile(id);
    const gaps = profile.questions.map((q, i) => ({ id: 'gap-' + i, description: q.prompt }));
    if (!gaps.length) return { questions: [], provenance: null };
    const result = await this.engine.generateFollowUps({ hospitalId: id, gaps }, options);
    return { questions: result.data, provenance: result.provenance };
  }
}

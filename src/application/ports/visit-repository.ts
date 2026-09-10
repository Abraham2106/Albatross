import type { Site } from '../../domain/types';
import type { ChainVerdict } from '../integrity';
import type { ExtractionData, InferenceProvenance, ObservationCandidate, InferenceTiming } from './inference-engine';

export interface HospitalInput { id?: string; name: string; country: string; city: string }
export interface VisitDraft {
  id: string; site: Site; baseRevision: number; transcript: string;
  extraction: ExtractionData; provenance: InferenceProvenance; transcriptionProvenance?: InferenceProvenance;
  createdAt: string; source: 'Voice' | 'Manual'; status: 'pending' | 'accepted'; identityWarning?: string;
  timings?: { transcription?: InferenceTiming; extraction?: InferenceTiming };
}
export interface AcceptedVisit {
  draftId: string; site: Site; author: string; visitedAt: string; acceptedAt: string;
  reviewedCandidates: readonly ObservationCandidate[]; originalDraft: VisitDraft;
}
export interface VisitRepository {
  listSites(): Site[];
  getSite(id: string): { site: Site; revision: number } | undefined;
  saveDraft(draft: VisitDraft): void;
  getDraft(id: string): VisitDraft | undefined;
  listDrafts(): VisitDraft[];
  accept(visit: AcceptedVisit): Site;
  /** Carga sitios iniciales solo si la base está vacía; devuelve cuántos entraron. */
  seed(sites: readonly Site[]): number;
  /** Verifica que ninguna observación aceptada haya sido alterada después. */
  verifyIntegrity(): ChainVerdict;
  close(): void;
}
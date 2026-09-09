import { InferenceError, type InferenceEngine, type ObservationCandidate } from '../../src/application/ports/inference-engine';

export const TEST_TRANSCRIPT = 'Vi dos CT y cuatro MR.';
export const testProvenance = { execution: 'local' as const, model: 'test' };
export const emptyMention = { name: null, city: null, country: null, evidence: null };

export function candidate(modality: ObservationCandidate['modality'], quantity: number | null, evidence: string): ObservationCandidate {
  return { modality, scope: 'total', quantity, brand: null, model: null, ageYears: null, ageDescription: null, quantityApproximate: false, ageApproximate: false, unknownFields: [], evidence };
}

export function fakeEngine(overrides: Partial<InferenceEngine> = {}): InferenceEngine {
  const engine: InferenceEngine = {
    async transcribe(input) {
      if (!(input?.audio instanceof Uint8Array) || input.audio.byteLength === 0) throw new InferenceError('INVALID_INPUT', 'audio must contain bytes.');
      return { data: { text: TEST_TRANSCRIPT }, provenance: testProvenance };
    },
    async extractObservations(input) {
      if (!input?.hospitalId?.trim() || !input.transcript?.trim()) throw new InferenceError('INVALID_INPUT', 'extract requires hospital and transcript.');
      if (input.transcript.trim() !== TEST_TRANSCRIPT) throw new InferenceError('UNSUPPORTED_INPUT', 'Unexpected transcript.');
      return {
        data: {
          hospitalId: input.hospitalId,
          mentionedHospital: emptyMention,
          candidates: [candidate('CT', 2, 'dos CT'), candidate('MR', 4, 'cuatro MR')],
        },
        provenance: testProvenance,
      };
    },
    async generateFollowUps(input) {
      return { data: input.gaps.map(gap => ({ gapId: gap.id, text: gap.description })), provenance: testProvenance };
    },
  };
  return { ...engine, ...overrides };
}

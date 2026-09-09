import type { ObservationCandidate } from '../../../application/ports/inference-engine';

export type MockScenarioName = 'post-visit' | 'conflicting-count' | 'new-hospital' | 'no-findings';

interface Scenario {
  readonly transcript: string;
  readonly candidates: readonly ObservationCandidate[];
}

export const MOCK_SCENARIOS = {
  'post-visit': {
    transcript: 'Vi dos CT y cuatro MR.',
    candidates: [
      { modality: 'CT', field: 'count', value: 2, evidence: 'dos CT' },
      { modality: 'MR', field: 'count', value: 4, evidence: 'cuatro MR' },
    ],
  },
  'conflicting-count': {
    transcript: 'Me dijeron que hay tres MR, pero otra persona dijo cuatro MR.',
    candidates: [
      { modality: 'MR', field: 'count', value: 3, evidence: 'tres MR' },
      { modality: 'MR', field: 'count', value: 4, evidence: 'cuatro MR' },
    ],
  },
  'new-hospital': {
    transcript: 'Es un hospital pequeño. Vi un CT.',
    candidates: [{ modality: 'CT', field: 'count', value: 1, evidence: 'un CT' }],
  },
  'no-findings': {
    transcript: 'No pude confirmar qué equipos tienen.',
    candidates: [],
  },
} as const satisfies Record<MockScenarioName, Scenario>;

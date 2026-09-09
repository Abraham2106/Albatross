import {
  InferenceError,
  type ExtractionData,
  type ExtractionRequest,
  type FollowUpQuestion,
  type FollowUpRequest,
  type InferenceEngine,
  type InferenceResult,
  type TranscriptionRequest,
} from '../../../application/ports/inference-engine';
import { MOCK_SCENARIOS, type MockScenarioName } from './scenarios';

export interface MockInferenceOptions {
  readonly scenario?: MockScenarioName;
  readonly latencyMs?: number;
  readonly failures?: Partial<Record<keyof InferenceEngine, 'UNAVAILABLE' | 'TIMEOUT'>>;
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InferenceError('INVALID_INPUT', `${label} must be nonempty text.`);
  }
}

/** Scripted development adapter. It does not decode audio or call any model. */
export class MockInferenceEngine implements InferenceEngine {
  private readonly scenario: MockScenarioName;
  private readonly latencyMs: number;
  private readonly failures: MockInferenceOptions['failures'];

  constructor(options: MockInferenceOptions = {}) {
    this.scenario = options.scenario ?? 'post-visit';
    this.latencyMs = options.latencyMs ?? 0;
    this.failures = { ...options.failures };
    if (!Object.hasOwn(MOCK_SCENARIOS, this.scenario)) {
      throw new InferenceError('INVALID_INPUT', 'Unknown mock scenario.');
    }
    if (!Number.isFinite(this.latencyMs) || this.latencyMs < 0 || this.latencyMs > 30_000) {
      throw new InferenceError('INVALID_INPUT', 'latencyMs must be between 0 and 30000.');
    }
    for (const [operation, code] of Object.entries(this.failures)) {
      if (!['transcribe', 'extractObservations', 'generateFollowUps'].includes(operation)
        || !['UNAVAILABLE', 'TIMEOUT'].includes(code)) {
        throw new InferenceError('INVALID_INPUT', 'Invalid mock failure configuration.');
      }
    }
  }

  private async respond<T>(operation: keyof InferenceEngine, data: T): Promise<InferenceResult<T>> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    const failure = this.failures?.[operation];
    if (failure) throw new InferenceError(failure, `Simulated ${operation} failure.`);
    return { data, provenance: { execution: 'mock', scenario: this.scenario } };
  }

  async transcribe(input: TranscriptionRequest): Promise<InferenceResult<{ readonly text: string }>> {
    if (!(input?.audio instanceof Uint8Array) || input.audio.byteLength === 0) {
      throw new InferenceError('INVALID_INPUT', 'audio must contain bytes.');
    }
    requireText(input.mimeType, 'mimeType');
    if (!input.mimeType.startsWith('audio/')) {
      throw new InferenceError('INVALID_INPUT', 'Expected an audio MIME type.');
    }
    return this.respond('transcribe', { text: MOCK_SCENARIOS[this.scenario].transcript });
  }

  async extractObservations(input: ExtractionRequest): Promise<InferenceResult<ExtractionData>> {
    requireText(input?.hospitalId, 'hospitalId');
    requireText(input?.transcript, 'transcript');
    const scenario = MOCK_SCENARIOS[this.scenario];
    if (input.transcript.trim() !== scenario.transcript) {
      throw new InferenceError('UNSUPPORTED_INPUT', 'Use the transcript from the selected mock scenario.');
    }
    // Capture values before latency; callers cannot change an in-flight request.
    return this.respond('extractObservations', {
      hospitalId: input.hospitalId,
      candidates: scenario.candidates.map((candidate) => ({ ...candidate })),
    });
  }

  async generateFollowUps(input: FollowUpRequest): Promise<InferenceResult<readonly FollowUpQuestion[]>> {
    requireText(input?.hospitalId, 'hospitalId');
    if (!Array.isArray(input?.gaps)) throw new InferenceError('INVALID_INPUT', 'gaps must be an array.');
    const ids = new Set<string>();
    const questions = input.gaps.map((gap) => {
      requireText(gap?.id, 'gap.id');
      requireText(gap?.description, 'gap.description');
      if (ids.has(gap.id)) throw new InferenceError('INVALID_INPUT', 'Duplicate gap ID.');
      ids.add(gap.id);
      return { gapId: gap.id, text: `¿Puedes confirmar lo siguiente: ${gap.description}?` };
    });
    return this.respond('generateFollowUps', questions);
  }
}

import type { InferenceResult, OperationOptions } from './inference-engine';
import type { PlateFields } from './evidence';

export interface PlateVisionRequest {
  readonly image: Uint8Array;
  readonly mimeType: string;
  readonly imageId: string;
  readonly sha256: string;
}

export interface PlateVisionEngine {
  extractPlate(input: PlateVisionRequest, options?: OperationOptions): Promise<InferenceResult<PlateFields>>;
  close?(): Promise<void>;
}

import type { InferenceProvenance } from './inference-engine';

/** Versioned field evidence. Text quotes stay compatible with existing drafts. */
export type FieldEvidence =
  | {
      readonly kind: 'text';
      readonly quote: string;
      readonly author: string;
      readonly capturedAt: string;
    }
  | {
      readonly kind: 'photo';
      readonly imageId: string;
      readonly sha256: string;
      readonly proposedReading: string | null;
      readonly crop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
    }
  | {
      readonly kind: 'humanCorrection';
      readonly field: string;
      readonly previous: string | number | null;
      readonly next: string | number | null;
      readonly author: string;
      readonly at: string;
    };

export interface ExecutionProvenance {
  readonly schemaVersion: 1;
  readonly author: string;
  readonly captureDeviceId: string;
  readonly executorPeerId: string;
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly processedAt: string | null;
  readonly model: string | null;
  readonly modelVersion: string | null;
  readonly inference: InferenceProvenance | null;
  readonly attachmentHashes: readonly string[];
}

export interface PlateFields {
  readonly brand: string | null;
  readonly model: string | null;
  readonly modality: string | null;
  readonly serial: string | null;
  readonly manufactureDate: string | null;
  readonly originalReadings: Readonly<Record<string, string | null>>;
  readonly warnings: readonly string[];
  readonly illegibleFields: readonly string[];
}

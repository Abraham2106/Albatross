export type CaptureStatus =
  | 'captured'
  | 'pending_peer'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'needs_review'
  | 'accepted'
  | 'failed'
  | 'cancelled';

export type FieldState = 'present' | 'absent' | 'unknown' | 'estimated' | 'unreadable';
export type ObservationState = 'Confirmado' | 'Reportado' | 'Estimado' | 'Desconocido';

export interface Hospital {
  id: string;
  name: string;
  city: string;
  country: string;
}

export interface EquipmentDraft {
  modality: string | null;
  quantity: number | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  manufactureDate: string | null;
  ageYears: number | null;
  evidence: string[];
  warnings: string[];
  fieldStates: Record<string, FieldState>;
  observationState: ObservationState;
}

export interface Capture {
  id: string;
  hospitalId?: string;
  hospitalName: string;
  city?: string;
  country?: string;
  capturedAt: string;
  note?: string;
  photos: string[];
  audioLabel?: string;
  status: CaptureStatus;
  draft: EquipmentDraft;
  receipt?: string;
  isDemo: true;
}

export interface CaptureInput {
  hospitalId?: string;
  hospitalName: string;
  city?: string;
  country?: string;
  note?: string;
  photos: string[];
  audioLabel?: string;
}

export type DemoScenario =
  | 'normal' | 'empty' | 'offline' | 'pending' | 'unreadable'
  | 'incomplete' | 'conflict' | 'error' | 'accepted';

export interface CaptureManagementPort {
  listCaptures(): Promise<Capture[]>;
  listHospitals(): Promise<Hospital[]>;
  createCapture(input: CaptureInput): Promise<Capture>;
  getCapture(id: string): Promise<Capture | undefined>;
  updateDraft(id: string, draft: EquipmentDraft): Promise<Capture>;
  setStatus(id: string, status: CaptureStatus): Promise<Capture>;
  acceptDraft(id: string, expectedRevision?: string): Promise<Capture>;
  cancelCapture(id: string): Promise<Capture>;
  subscribe(callback: (captures: Capture[]) => void): () => void;
  setScenario(scenario: DemoScenario): void;
  reset(): void;
}

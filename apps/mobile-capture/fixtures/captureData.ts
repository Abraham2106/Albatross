import { Capture, EquipmentDraft } from '../application/ports/CaptureManagementPort';

export const completeDraft: EquipmentDraft = {
  modality: 'CT', quantity: 1, brand: 'BluePeak Medical', model: 'Aether CT 64', serial: 'BP-CT-2048',
  manufactureDate: '2017', ageYears: 8, evidence: ['Placa frontal demo'], warnings: [],
  fieldStates: { modality: 'present', quantity: 'estimated', brand: 'present', model: 'present', serial: 'present', manufactureDate: 'present', ageYears: 'estimated' },
  observationState: 'Reportado',
};

export const demoCaptures: Capture[] = [
  { id: 'OBS-001', hospitalId: 'HOSP-001', hospitalName: 'Hospital DemoCare Pacific', city: 'Ciudad de Panamá', country: 'Panamá', capturedAt: 'Hoy, 10:15', note: 'Vi un tomógrafo en radiología; la placa parece legible.', photos: ['demo://placa-ct'], status: 'needs_review', draft: completeDraft, isDemo: true },
  { id: 'OBS-002', hospitalId: 'HOSP-002', hospitalName: 'Hospital DemoCare Horizon', city: 'São Paulo', country: 'Brasil', capturedAt: 'Ayer, 15:40', note: 'Uno de los resonadores parece tener unos ocho años.', photos: [], status: 'accepted', draft: { ...completeDraft, modality: 'MR', model: 'Aether MR 3T', ageYears: 8, observationState: 'Confirmado' }, receipt: 'DEMO-REC-002', isDemo: true },
];

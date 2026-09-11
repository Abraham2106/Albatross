import { Hospital } from '../application/ports/CaptureManagementPort';

export const hospitals: Hospital[] = [
  { id: 'HOSP-001', name: 'Hospital DemoCare Pacific', city: 'Ciudad de Panamá', country: 'Panamá' },
  { id: 'HOSP-002', name: 'Hospital DemoCare Horizon', city: 'São Paulo', country: 'Brasil' },
  { id: 'HOSP-003', name: 'Centro DemoCare Norte', city: 'San José', country: 'Costa Rica' },
  { id: 'UNKNOWN', name: 'Hospital por identificar', city: '', country: '' },
];

import { Capture, CaptureInput, CaptureManagementPort, DemoScenario, EquipmentDraft, CaptureStatus } from '../../application/ports/CaptureManagementPort';
import { hospitals } from '../../fixtures/hospitalData';
import { completeDraft, demoCaptures } from '../../fixtures/captureData';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class DemoCaptureManagementAdapter implements CaptureManagementPort {
  private captures: Capture[] = clone(demoCaptures);
  private scenario: DemoScenario = 'normal';
  private listeners: Array<(captures: Capture[]) => void> = [];
  async listCaptures() { return clone(this.captures); }
  async listHospitals() { return clone(hospitals); }
  async createCapture(input: CaptureInput) {
    const baseDraft: EquipmentDraft = { ...clone(completeDraft), modality: null, quantity: null, brand: null, model: null, serial: null, manufactureDate: null, ageYears: null, evidence: [], warnings: [], fieldStates: {}, observationState: 'Desconocido' };
    const capture: Capture = { id: 'OBS-' + Date.now(), ...input, capturedAt: 'Ahora', photos: input.photos, status: this.scenario === 'offline' ? 'pending_peer' : 'captured', draft: baseDraft, isDemo: true };
    this.captures = [capture, ...this.captures]; this.notify(); return clone(capture);
  }
  async getCapture(id: string) { return clone(this.captures.find(capture => capture.id === id)); }
  async updateDraft(id: string, draft: EquipmentDraft) { return this.update(id, { draft }); }
  async setStatus(id: string, status: CaptureStatus) { return this.update(id, { status }); }
  async acceptDraft(id: string) { const capture = this.find(id); return this.update(id, { status: 'accepted', receipt: 'DEMO-REC-' + id, draft: { ...capture.draft, observationState: 'Confirmado' } }); }
  async cancelCapture(id: string) { return this.update(id, { status: 'cancelled' }); }
  subscribe(callback: (captures: Capture[]) => void) { this.listeners.push(callback); callback(clone(this.captures)); return () => { this.listeners = this.listeners.filter(item => item !== callback); }; }
  setScenario(scenario: DemoScenario) { this.scenario = scenario; this.captures = scenario === 'empty' ? [] : clone(demoCaptures); this.applyScenario(); this.notify(); }
  reset() { this.scenario = 'normal'; this.captures = clone(demoCaptures); this.notify(); }
  private applyScenario() {
    const first = this.captures[0]; if (!first) return;
    if (this.scenario === 'pending') first.status = 'pending_peer';
    if (this.scenario === 'unreadable') { first.status = 'needs_review'; first.draft = { ...first.draft, brand: null, model: null, serial: null, warnings: ['La placa no se puede leer con suficiente confianza.'], fieldStates: { ...first.draft.fieldStates, brand: 'unreadable', model: 'unreadable', serial: 'unreadable' }, observationState: 'Desconocido' }; }
    if (this.scenario === 'incomplete') { first.status = 'needs_review'; first.draft = { ...first.draft, quantity: null, brand: null, model: null, warnings: ['Faltan marca y cantidad.'], fieldStates: { modality: 'present', quantity: 'unknown', brand: 'unknown', model: 'unknown' }, observationState: 'Reportado' }; }
    if (this.scenario === 'conflict') { first.status = 'needs_review'; first.draft = { ...first.draft, warnings: ['La nota dice resonador, pero la placa parece CT.'], observationState: 'Reportado' }; }
    if (this.scenario === 'error') first.status = 'failed';
    if (this.scenario === 'accepted') first.status = 'accepted';
  }
  private find(id: string) { const capture = this.captures.find(item => item.id === id); if (!capture) throw new Error('Observación no encontrada'); return capture; }
  private async update(id: string, next: Partial<Capture>) { const capture = this.find(id); Object.assign(capture, next); this.notify(); return clone(capture); }
  private notify() { this.listeners.forEach(listener => listener(clone(this.captures))); }
}

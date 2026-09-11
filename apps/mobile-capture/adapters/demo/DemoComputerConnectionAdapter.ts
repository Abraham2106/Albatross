import { ComputerConnectionPort, ComputerConnectionState, PairingStatus } from '../../application/ports/ComputerConnectionPort';

export class DemoComputerConnectionAdapter implements ComputerConnectionPort {
  private state: ComputerConnectionState = { status: 'disconnected', computerId: null, computerName: null, pairingCode: null, fingerprint: null, isDemo: true };
  private listeners: Array<(state: ComputerConnectionState) => void> = [];
  getConnectionState() { return { ...this.state }; }
  async pair() { this.update({ status: 'found', computerId: 'PEER-DEMO-01', computerName: 'Computadora Albatross (demo)', pairingCode: '482 190', fingerprint: 'DEMO · 7A:31:9C' }); return this.getConnectionState(); }
  async disconnect() { this.update({ status: 'disconnected', computerId: null, computerName: null, pairingCode: null, fingerprint: null }); return this.getConnectionState(); }
  subscribe(callback: (state: ComputerConnectionState) => void) { this.listeners.push(callback); callback(this.getConnectionState()); return () => { this.listeners = this.listeners.filter(item => item !== callback); }; }
  setDemoStatus(status: PairingStatus) {
    if (status === 'connected' || status === 'found') this.update({ status, computerId: 'PEER-DEMO-01', computerName: 'Computadora Albatross (demo)', pairingCode: '482 190', fingerprint: 'DEMO · 7A:31:9C' });
    else this.update({ status, computerId: null, computerName: null, pairingCode: null, fingerprint: null });
  }
  private update(next: Partial<ComputerConnectionState>) { this.state = { ...this.state, ...next }; this.listeners.forEach(listener => listener(this.getConnectionState())); }
}

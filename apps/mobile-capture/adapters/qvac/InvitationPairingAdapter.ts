import { ComputerConnectionPort, ComputerConnectionState, PairingStatus } from '../../application/ports/ComputerConnectionPort';

function fingerprintOf(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

export class InvitationPairingAdapter implements ComputerConnectionPort {
  private state: ComputerConnectionState = {
    status: 'disconnected', computerId: null, computerName: null, pairingCode: null, fingerprint: null, isDemo: false,
  };
  private listeners: Array<(state: ComputerConnectionState) => void> = [];

  getConnectionState() { return { ...this.state }; }

  async pair() {
    return this.getConnectionState();
  }

  async acceptInvitation(raw: string) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('La invitación no es JSON.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('QR inválido.');
    const v = parsed as { v?: unknown; k?: unknown; t?: unknown; e?: unknown };
    if (v.v !== 1 || typeof v.k !== 'string' || typeof v.t !== 'string' || typeof v.e !== 'string') {
      throw new Error('QR de otra versión o incompleto.');
    }
    if (Date.parse(v.e) <= Date.now()) throw new Error('La invitación expiró.');
    this.update({
      status: 'found',
      computerId: v.k,
      computerName: 'Computadora QVAC',
      pairingCode: v.t.slice(0, 8),
      fingerprint: fingerprintOf(v.k),
      isDemo: false,
    });
    return this.getConnectionState();
  }

  async disconnect() {
    this.update({ status: 'disconnected', computerId: null, computerName: null, pairingCode: null, fingerprint: null, isDemo: false });
    return this.getConnectionState();
  }

  subscribe(callback: (state: ComputerConnectionState) => void) {
    this.listeners.push(callback);
    callback(this.getConnectionState());
    return () => { this.listeners = this.listeners.filter(item => item !== callback); };
  }

  setDemoStatus(status: PairingStatus) {
    if (status === 'disconnected' || status === 'expired' || status === 'revoked' || status === 'searching') {
      this.update({ status, computerId: null, computerName: null, pairingCode: null, fingerprint: null, isDemo: status !== 'disconnected' });
      return;
    }
    this.update({
      status,
      computerId: this.state.computerId || 'pending',
      computerName: this.state.computerName || 'Computadora QVAC',
      pairingCode: this.state.pairingCode,
      fingerprint: this.state.fingerprint,
      isDemo: false,
    });
  }

  private update(next: Partial<ComputerConnectionState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener(this.getConnectionState()));
  }
}

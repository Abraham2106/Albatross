export type PairingStatus = 'disconnected' | 'searching' | 'found' | 'connected' | 'expired' | 'revoked';

export interface ComputerConnectionState {
  status: PairingStatus;
  computerId: string | null;
  computerName: string | null;
  pairingCode: string | null;
  fingerprint: string | null;
  isDemo: boolean;
}

export interface ComputerConnectionPort {
  getConnectionState(): ComputerConnectionState;
  pair(): Promise<ComputerConnectionState>;
  acceptInvitation?(raw: string): Promise<ComputerConnectionState>;
  disconnect(): Promise<ComputerConnectionState>;
  subscribe(callback: (state: ComputerConnectionState) => void): () => void;
  setDemoStatus(status: PairingStatus): void;
}

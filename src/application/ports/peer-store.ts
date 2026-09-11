export interface PeerInvitationRecord {
  readonly expiresAt: string;
  readonly consumedAt: string | null;
  readonly payload: unknown;
}

export interface PeerDeviceRecord {
  readonly publicKey: string;
  readonly revokedAt: string | null;
  readonly payload: unknown;
}

export interface PeerStore {
  saveInvitation(token: string, expiresAt: string, payload: unknown): void;
  getInvitation(token: string): PeerInvitationRecord | undefined;
  consumeInvitation(token: string, at: string): void;
  saveDevice(deviceId: string, publicKey: string, payload: unknown): void;
  getDevice(deviceId: string): PeerDeviceRecord | undefined;
  revokeDevice(deviceId: string, at: string): void;
}

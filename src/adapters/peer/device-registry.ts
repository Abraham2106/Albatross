import { InferenceError } from '../../application/ports/inference-engine';
import type { PeerStore } from '../../application/ports/peer-store';
import { hexId } from '../../application/capture-protocol';
import { text } from '../../application/validation';
import {
  assertAuthorized, assertInvitationOpen, createInvitation, pairingQrPayload, parsePairingQr,
  type Invitation,
} from './pairing';

export class DeviceRegistry {
  constructor(
    private readonly store: PeerStore,
    private providerPublicKey: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  setPublicKey(publicKey: string) {
    this.providerPublicKey = text(publicKey, 'Clave del peer', 200);
  }

  currentPublicKey() { return this.providerPublicKey; }

  invite(ttlMs = 5 * 60 * 1000): Invitation {
    if (!this.providerPublicKey || this.providerPublicKey === 'pending') {
      throw new InferenceError('UNAVAILABLE', 'Arrancá el provider QVAC antes de invitar al celular.');
    }
    const invite = createInvitation(this.now(), ttlMs, this.providerPublicKey);
    this.store.saveInvitation(invite.token, invite.expiresAt, invite);
    return invite;
  }

  qr(invite: Invitation) { return pairingQrPayload(invite); }

  parseQr(value: unknown) { return parsePairingQr(value); }

  authorize(token: string, deviceId: string, devicePublicKey: string) {
    const invite = this.store.getInvitation(token);
    if (!invite) throw new InferenceError('INVALID_INPUT', 'Invitación no encontrada.');
    assertInvitationOpen(invite, this.now());
    const id = hexId(deviceId, 'Dispositivo');
    this.store.consumeInvitation(token, this.now().toISOString());
    this.store.saveDevice(id, devicePublicKey, { authorizedAt: this.now().toISOString(), publicKey: devicePublicKey });
  }

  session(deviceId: string) {
    const device = this.store.getDevice(hexId(deviceId, 'Dispositivo'));
    assertAuthorized(device);
    return device!;
  }

  revoke(deviceId: string) {
    this.store.revokeDevice(hexId(deviceId, 'Dispositivo'), this.now().toISOString());
  }
}

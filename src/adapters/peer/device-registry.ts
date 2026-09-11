import { InferenceError } from '../../application/ports/inference-engine';
import type { PeerStore } from '../../application/ports/peer-store';
import { hexId } from '../../application/capture-protocol';
import {
  assertAuthorized, assertInvitationOpen, createInvitation, pairingQrPayload, parsePairingQr,
  type Invitation,
} from './pairing';

export class DeviceRegistry {
  constructor(
    private readonly store: PeerStore,
    private readonly providerPublicKey: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  invite(ttlMs = 5 * 60 * 1000): Invitation {
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

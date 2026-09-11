import { afterEach, describe, expect, it } from 'vitest';
import { SqliteVisitRepository } from '../../src/adapters/persistence/visit-repository';
import { DeviceRegistry } from '../../src/adapters/peer/device-registry';
import { ComputerPeerService } from '../../src/adapters/peer/computer-peer';
import { CaptureService } from '../../src/application/capture-service';
import { VisitService } from '../../src/application/visits';
import { PROTOCOL_VERSION } from '../../src/application/ports/capture-protocol';
import { createInvitation, parsePairingQr, pairingQrPayload } from '../../src/adapters/peer/pairing';
import { fakeEngine, TEST_TRANSCRIPT } from '../helpers/inference';

const resources: Array<() => void> = [];
afterEach(() => { resources.splice(0).reverse().forEach(close => close()); });

describe('emparejamiento y autorización', () => {
  it('el QR v1 no lleva secretos de hospital y se puede parsear', () => {
    const invite = createInvitation(new Date('2026-09-11T12:00:00.000Z'), 60_000, 'desktop-dev-key');
    const qr = pairingQrPayload(invite);
    expect(qr).toEqual({ v: 1, k: 'desktop-dev-key', t: invite.token, e: invite.expiresAt });
    expect(JSON.stringify(qr)).not.toMatch(/hospital|DemoCare/i);
    expect(parsePairingQr(qr)).toEqual({ providerPublicKey: qr.k, token: qr.t, expiresAt: qr.e });
    expect(() => parsePairingQr({ ...qr, v: 2 })).toThrow('otra versión');
  });

  it('la invitación expira, no se reutiliza y la revocación bloquea el peer', () => {
    const repo = new SqliteVisitRepository(':memory:'); resources.push(() => repo.close());
    let now = new Date('2026-09-11T12:00:00.000Z');
    const devices = new DeviceRegistry(repo, 'desktop-dev-key', () => now);
    const live = devices.invite(60_000);
    const expired = devices.invite(1);
    now = new Date('2026-09-11T12:00:02.000Z');
    expect(() => devices.authorize(expired.token, 'device-field-1', 'phone-key-01')).toThrow('expiró');
    now = new Date('2026-09-11T12:00:00.500Z');
    devices.authorize(live.token, 'device-field-1', 'phone-key-01');
    expect(() => devices.authorize(live.token, 'device-other-2', 'phone-key-02')).toThrow('reutilizable');
    devices.session('device-field-1');
    devices.revoke('device-field-1');
    expect(() => devices.session('device-field-1')).toThrow('revocado');
    expect(() => devices.session('unknown-device')).toThrow('no autorizado');
  });

  it('el canal de aplicación rechaza un dispositivo no autorizado y acepta uno emparejado', async () => {
    const repo = new SqliteVisitRepository(':memory:'); resources.push(() => repo.close());
    const now = () => new Date('2026-09-11T12:00:00.000Z');
    const devices = new DeviceRegistry(repo, 'desktop-dev-key', now);
    const visits = new VisitService(fakeEngine(), repo, () => 'draft-id-1', () => '2026-09-11T12:00:00.000Z');
    const capture = new CaptureService(visits, repo, fakeEngine(), undefined, () => 'draft-id-1', () => '2026-09-11T12:00:00.000Z');
    const peer = new ComputerPeerService(capture, devices, 'desktop-peer-local');
    const envelope = {
      protocolVersion: PROTOCOL_VERSION, requestId: 'request-01', deviceId: 'device-field-1',
      captureId: 'capture-note-01', operation: 'submitCapture' as const,
      payload: {
        hospital: { name: 'Hospital DemoCare Green', country: 'Costa Rica', city: 'San Jose' },
        note: TEST_TRANSCRIPT, capturedAt: '2026-09-11T12:00:00.000Z', attachments: [],
        idempotencyKey: 'capture-note-01',
      },
    };
    await expect(peer.dispatch(envelope)).rejects.toThrow('no autorizado');
    const invite = devices.invite();
    devices.authorize(invite.token, 'device-field-1', 'phone-key-01');
    const receipt = await peer.dispatch(envelope);
    expect(receipt).toMatchObject({ kind: 'submit', captureId: 'capture-note-01' });
    await peer.idle();
    const status = await peer.dispatch({ ...envelope, operation: 'getCaptureStatus', payload: {} });
    expect(status).toMatchObject({ state: 'needsReview' });
    devices.revoke('device-field-1');
    await expect(peer.dispatch({ ...envelope, operation: 'capabilities', captureId: null, payload: {} })).rejects.toThrow('revocado');
  });
});

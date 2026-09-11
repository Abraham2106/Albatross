import { createHash, randomBytes } from 'node:crypto';
import { InferenceError } from '../../application/ports/inference-engine';
import { invalid, text } from '../../application/validation';

export interface Invitation {
  readonly token: string;
  readonly expiresAt: string;
  readonly providerPublicKey: string;
  readonly fingerprint: string;
}

export interface AuthorizedDevice {
  readonly deviceId: string;
  readonly publicKey: string;
  readonly authorizedAt: string;
}

export function invitationFingerprint(providerPublicKey: string, token: string): string {
  return createHash('sha256').update(providerPublicKey).update('\u0000').update(token).digest('hex').slice(0, 8);
}

export function createInvitation(now: Date, ttlMs: number, providerPublicKey: string): Invitation {
  const key = text(providerPublicKey, 'Clave del peer', 128);
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  return { token, expiresAt, providerPublicKey: key, fingerprint: invitationFingerprint(key, token) };
}

export function assertInvitationOpen(invite: { expiresAt: string; consumedAt: string | null }, now: Date) {
  if (invite.consumedAt) throw new InferenceError('CONFLICT', 'La invitación no es reutilizable.');
  if (Date.parse(invite.expiresAt) <= now.getTime()) throw new InferenceError('INVALID_INPUT', 'La invitación expiró.');
}

export function assertAuthorized(device: { revokedAt: string | null } | undefined) {
  if (!device) throw new InferenceError('INVALID_INPUT', 'Dispositivo no autorizado.');
  if (device.revokedAt) throw new InferenceError('INVALID_INPUT', 'El dispositivo fue revocado.');
}

export function pairingQrPayload(invite: Invitation): { v: 1; k: string; t: string; e: string } {
  return { v: 1, k: invite.providerPublicKey, t: invite.token, e: invite.expiresAt };
}

export function parsePairingQr(value: unknown): { providerPublicKey: string; token: string; expiresAt: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('QR inválido.');
  const v = value as Record<string, unknown>;
  if (v.v !== 1) invalid('QR de otra versión.');
  return { providerPublicKey: text(v.k, 'Clave', 128), token: text(v.t, 'Invitación', 128), expiresAt: text(v.e, 'Expiración', 50) };
}

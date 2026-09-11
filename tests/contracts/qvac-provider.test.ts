import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ensurePeerSeed, publicKeyFingerprint, QvacProviderService } from '../../src/adapters/peer/qvac-provider';

const seed = 'ab'.repeat(32);

function clientMock() {
  return {
    heartbeat: vi.fn(async () => ({ ok: true })),
    startQVACProvider: vi.fn(async () => ({ success: true, publicKey: 'peer-public-key-01' })),
    stopQVACProvider: vi.fn(async () => {}),
    loadModel: vi.fn(async () => 'vision-model'),
    unloadModel: vi.fn(async () => {}),
  };
}

describe('qvac provider', () => {
  it('writes a 32-byte hex seed and reuses it', () => {
    const file = join(tmpdir(), 'philips-seed-' + Date.now(), 'qvac-hyperswarm.seed');
    mkdirSync(join(file, '..'), { recursive: true });
    const first = ensurePeerSeed(file);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(ensurePeerSeed(file)).toBe(first);
    expect(readFileSync(file, 'utf8').trim()).toBe(first);
  });

  it('replaces a non-hex seed file', () => {
    const file = join(tmpdir(), 'philips-seed-bad-' + Date.now() + '.seed');
    writeFileSync(file, 'not-a-seed\n');
    const next = ensurePeerSeed(file);
    expect(next).toMatch(/^[0-9a-f]{64}$/);
  });

  it('starts and stops without touching the network when the client is injected', async () => {
    const client = clientMock();
    const provider = new QvacProviderService({ seed, clientFactory: async () => client });
    expect(provider.status().running).toBe(false);
    const live = await provider.start();
    expect(live).toMatchObject({ running: true, publicKey: 'peer-public-key-01', visionLoaded: false });
    expect(live.fingerprint).toBe(publicKeyFingerprint('peer-public-key-01'));
    expect(client.heartbeat).toHaveBeenCalledOnce();
    expect(client.startQVACProvider).toHaveBeenCalledOnce();
    await provider.loadVision();
    expect(client.loadModel).toHaveBeenCalledOnce();
    await provider.stop();
    expect(client.unloadModel).toHaveBeenCalledWith({ modelId: 'vision-model', clearStorage: false, autoClose: false });
    expect(client.stopQVACProvider).toHaveBeenCalledOnce();
    expect(provider.status().running).toBe(false);
  });

  it('does not import a client on stop if it never started', async () => {
    const factory = vi.fn(async () => clientMock());
    const provider = new QvacProviderService({ seed, clientFactory: factory });
    await provider.stop();
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects a phrase seed', () => {
    expect(() => new QvacProviderService({ seed: 'not hex' })).toThrow('32 bytes');
  });
});

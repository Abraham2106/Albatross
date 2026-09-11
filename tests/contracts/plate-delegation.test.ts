import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PLATE_MODEL, QvacPlateVisionEngine, visionDelegateFromEnv, type QvacPlateSdk } from '../../src/adapters/inference/qvac/qvac-plate-vision';
import { PNG_1x1 } from '../helpers/image';

const key = 'ab'.repeat(32);
const input = { image: PNG_1x1, mimeType: 'image/png', imageId: 'photo-contract', sha256: 'a'.repeat(64) };
const output = JSON.stringify({ brand: 'Demo', model: null, modality: 'MR', serial: null,
  manufactureDate: null, originalReadings: {}, warnings: [], illegibleFields: [] });

function client() {
  const sdk = {
    VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M: 'vision-fixture',
    MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0: 'projector-fixture',
    loadModel: vi.fn(async (_params: unknown) => 'model-contract'),
    completion: vi.fn((_params: unknown) => ({ requestId: 'request-contract', final: Promise.resolve({ contentText: output }) })),
    cancel: vi.fn(async (_params: unknown) => undefined),
    unloadModel: vi.fn(async (_params: unknown) => undefined),
  };
  // Only the SDK methods exercised by this contract are implemented; no native module is imported.
  return { sdk, sdkFactory: async () => sdk as unknown as QvacPlateSdk };
}

describe('visión delegada: contratos sin red ni modelos', () => {
  it('carga en el peer sin fallback y devuelve la clave del proveedor', async () => {
    const { sdk, sdkFactory } = client();
    let attachment = '';
    sdk.completion.mockImplementation(params => {
      attachment = (params as { history: { attachments: { path: string }[] }[] }).history[0].attachments[0].path;
      expect(readFileSync(attachment)).toEqual(Buffer.from(PNG_1x1));
      return { requestId: 'request-contract', final: Promise.resolve({ contentText: output }) };
    });
    const engine = new QvacPlateVisionEngine({ enabled: true, delegate: { providerPublicKey: key, timeout: 42000 }, sdkFactory });
    const result = await engine.extractPlate(input);
    expect(sdk.loadModel).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      delegate: { providerPublicKey: key, timeout: 42000, fallbackToLocal: false },
    }));
    expect(result.provenance).toEqual({ execution: 'peer', model: PLATE_MODEL, peerId: key });
    expect(sdk.unloadModel).toHaveBeenCalledWith({ modelId: 'model-contract', clearStorage: false, autoClose: false });
    expect(existsSync(attachment)).toBe(false);
  });

  it('sin destino mantiene carga y procedencia local', async () => {
    const { sdk, sdkFactory } = client();
    const result = await new QvacPlateVisionEngine({ enabled: true, sdkFactory }).extractPlate(input);
    expect(sdk.loadModel.mock.calls[0][0]).not.toHaveProperty('delegate');
    expect(result.provenance).toEqual({ execution: 'local', model: PLATE_MODEL });
  });

  it('proveedor inaccesible produce UNAVAILABLE sin intentar carga local y permite reintentar', async () => {
    const { sdk, sdkFactory } = client();
    sdk.loadModel.mockRejectedValueOnce(new Error('Provider unreachable'));
    const engine = new QvacPlateVisionEngine({ enabled: true, delegate: { providerPublicKey: key }, sdkFactory });
    await expect(engine.extractPlate(input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(sdk.completion).not.toHaveBeenCalled();
    expect(sdk.loadModel).toHaveBeenCalledOnce();
    await expect(engine.extractPlate(input)).resolves.toMatchObject({ provenance: { execution: 'peer', peerId: key } });
    for (const [params] of sdk.loadModel.mock.calls) expect(params).toHaveProperty('delegate.fallbackToLocal', false);
  });

  it('un fallo de importación también libera el candado', async () => {
    const { sdkFactory } = client();
    const factory = vi.fn(sdkFactory).mockRejectedValueOnce(new Error('worker unavailable'));
    const engine = new QvacPlateVisionEngine({ enabled: true, sdkFactory: factory });
    await expect(engine.extractPlate(input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(engine.extractPlate(input)).resolves.toHaveProperty('data.brand', 'Demo');
  });

  it('cancelar la inferencia solicita cancelación SDK y descarga el modelo', async () => {
    const { sdk, sdkFactory } = client();
    const controller = new AbortController();
    sdk.completion.mockImplementation(() => {
      queueMicrotask(() => controller.abort());
      return { requestId: 'request-contract', final: new Promise(() => {}) };
    });
    const engine = new QvacPlateVisionEngine({ enabled: true, delegate: { providerPublicKey: key }, sdkFactory });
    await expect(engine.extractPlate(input, { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(sdk.cancel).toHaveBeenCalledWith({ requestId: 'request-contract' });
    expect(sdk.unloadModel).toHaveBeenCalledOnce();
  });

  it('señal ya cancelada no importa SDK ni inicia carga', async () => {
    const { sdkFactory } = client();
    const factory = vi.fn(sdkFactory);
    const engine = new QvacPlateVisionEngine({ enabled: true, sdkFactory: factory });
    await expect(engine.extractPlate(input, { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('valida configuración explícita y nunca degrada una clave inválida a local', () => {
    expect(visionDelegateFromEnv({})).toBeUndefined();
    expect(visionDelegateFromEnv({ QVAC_VISION_DELEGATE_KEY: ` ${key.toUpperCase()} ` }))
      .toEqual({ providerPublicKey: key, timeout: 180000 });
    for (const value of ['', 'peer-name', 'a'.repeat(63)]) {
      expect(() => visionDelegateFromEnv({ QVAC_VISION_DELEGATE_KEY: value })).toThrow('clave pública');
    }
    for (const value of ['', '0', '-1', 'NaN', '1.5', 'Infinity']) {
      expect(() => visionDelegateFromEnv({ QVAC_VISION_DELEGATE_KEY: key, QVAC_VISION_TIMEOUT: value })).toThrow('entero positivo');
    }
    expect(() => new QvacPlateVisionEngine({ delegate: { providerPublicKey: 'invalid' } })).toThrow('clave pública');
  });
});

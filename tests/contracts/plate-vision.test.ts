import { describe, expect, it } from 'vitest';
import { QvacPlateVisionEngine, plateFromUnknown } from '../../src/adapters/inference/qvac';
import { PNG_1x1 } from '../helpers/image';

describe('adaptador visual sin cargar pesos', () => {
  it('parsea el DTO y convierte vacíos en null', () => {
    const plate = plateFromUnknown(JSON.stringify({
      brand: ' BluePeak Medical ', model: '', modality: 'MR', serial: 'BP-A3T-88421',
      manufactureDate: null, originalReadings: { serial: 'BP-A3T-88421' },
      warnings: ['glare'], illegibleFields: ['model'],
    }));
    expect(plate).toMatchObject({
      brand: 'BluePeak Medical', model: null, modality: 'MR', serial: 'BP-A3T-88421',
      manufactureDate: null, warnings: ['glare'], illegibleFields: ['model'],
    });
    expect(() => plateFromUnknown('not-json')).toThrow(/INVALID_OUTPUT|JSON/);
    expect(() => plateFromUnknown('[]')).toThrow('esquema');
  });

  it('queda deshabilitado por defecto y libera el candado tras un fallo', async () => {
    const engine = new QvacPlateVisionEngine();
    await expect(engine.extractPlate({
      image: new Uint8Array(PNG_1x1), mimeType: 'image/png', imageId: 'photo-main-1', sha256: 'a'.repeat(64),
    })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(engine.extractPlate({
      image: new Uint8Array(PNG_1x1), mimeType: 'image/png', imageId: 'photo-main-1', sha256: 'a'.repeat(64),
    })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

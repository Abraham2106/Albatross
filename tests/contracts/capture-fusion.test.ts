import { describe, expect, it } from 'vitest';
import { fusePlateWithTranscript, sanitizePlate } from '../../src/application/capture-fusion';
import { candidate } from '../helpers/inference';
import type { PlateFields } from '../../src/application/ports/evidence';

const HASH = 'a'.repeat(64);

function plate(overrides: Partial<PlateFields> = {}): PlateFields {
  return {
    brand: 'BluePeak Medical', model: 'Aether 3T', modality: 'MR', serial: 'BP-A3T-88421',
    manufactureDate: '2017-03', originalReadings: { serial: 'BP-A3T-88421' },
    warnings: [], illegibleFields: [], ...overrides,
  };
}

describe('fusión de foto y nota', () => {
  it('deja ilegibles en null y no convierte fabricación en edad', () => {
    const cleaned = sanitizePlate(plate({ illegibleFields: ['serial', 'model'], model: 'Aether 3T', serial: 'BP-XXXX' }));
    expect(cleaned.serial).toBeNull();
    expect(cleaned.model).toBeNull();
    expect(cleaned.brand).toBe('BluePeak Medical');
    const fused = fusePlateWithTranscript([], cleaned, HASH);
    expect(fused.candidates[0]?.ageYears).toBeNull();
    expect(fused.candidates[0]?.ageDescription).toBeNull();
    expect(fused.candidates[0]?.model).toBeNull();
    const noDate = fusePlateWithTranscript([], sanitizePlate(plate({ illegibleFields: ['manufactureDate'] })), HASH);
    expect(noDate.plate?.manufactureDate).toBeNull();
    expect(noDate.warnings.some(w => /fabricaci[oó]n/.test(w))).toBe(false);
    const withDate = fusePlateWithTranscript([], plate(), HASH);
    expect(withDate.warnings.some(w => /fabricaci[oó]n/.test(w))).toBe(true);
    expect(withDate.candidates[0]?.ageYears).toBeNull();
  });

  it('conserva nota y foto cuando se contradicen y no duplica si coinciden', () => {
    const spoken = [{ ...candidate('MR', 2, 'dos MR'), brand: 'NovaMed', model: null, scope: 'total' as const }];
    const clash = fusePlateWithTranscript(spoken, plate({ brand: 'BluePeak Medical' }), HASH);
    expect(clash.candidates).toHaveLength(2);
    expect(clash.warnings.some(w => /no coinciden/.test(w))).toBe(true);
    const same = fusePlateWithTranscript(
      [{ ...candidate('MR', 2, 'dos MR'), brand: 'BluePeak Medical', model: 'Aether 3T' }],
      plate(),
      HASH,
    );
    expect(same.candidates).toHaveLength(1);
    expect(same.candidates[0]?.quantity).toBe(2);
  });
});

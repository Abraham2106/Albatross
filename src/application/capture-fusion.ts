import type { ObservationCandidate } from './ports/inference-engine';
import type { PlateFields } from './ports/evidence';
import { normalizeBrand, normalizeModality, normalizeModel } from '../domain';

const PLATE_KEYS = ['brand', 'model', 'modality', 'serial', 'manufactureDate'] as const;

/** Ilegible is absence of a reading, not an explicit unknown. Fabrication is not installation. */
export function sanitizePlate(plate: PlateFields): PlateFields {
  const drop = new Set(plate.illegibleFields.map(k => k.trim().toLowerCase()));
  const take = (key: (typeof PLATE_KEYS)[number]) => drop.has(key.toLowerCase()) ? null : plate[key];
  return {
    ...plate,
    brand: take('brand'),
    model: take('model'),
    modality: take('modality'),
    serial: take('serial'),
    manufactureDate: take('manufactureDate'),
  };
}

export function plateToCandidates(plate: PlateFields | null, sha256: string): ObservationCandidate[] {
  if (!plate?.modality) return [];
  const modality = normalizeModality(plate.modality);
  if (!modality) return [];
  return [{
    modality, scope: 'group', quantity: 1, brand: plate.brand, model: plate.model,
    ageYears: null, ageDescription: null, quantityApproximate: false, ageApproximate: false,
    unknownFields: [], evidence: 'photo:' + sha256,
  }];
}

export function fusePlateWithTranscript(
  transcriptCandidates: readonly ObservationCandidate[],
  plate: PlateFields | null,
  photoSha256: string,
): { candidates: ObservationCandidate[]; plate: PlateFields | null; warnings: string[] } {
  const cleaned = plate ? sanitizePlate(plate) : null;
  const warnings = [...(cleaned?.warnings ?? [])];
  if (cleaned?.manufactureDate) warnings.push('La fecha de fabricación no se usa como instalación.');
  const photo = plateToCandidates(cleaned, photoSha256);
  if (!photo.length) return { candidates: [...transcriptCandidates], plate: cleaned, warnings };

  const extra: ObservationCandidate[] = [];
  for (const seen of photo) {
    const related = transcriptCandidates.filter(c => c.modality === seen.modality);
    const conflict = related.some(c => fieldsConflict(c, seen));
    if (conflict) {
      warnings.push('La nota y la foto no coinciden; se conservan ambas lecturas.');
      extra.push(seen);
      continue;
    }
    const compatible = related.some(c => fieldsCompatible(c, seen));
    if (compatible) continue;
    extra.push(seen);
  }
  return { candidates: [...transcriptCandidates, ...extra], plate: cleaned, warnings };
}

function known(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function fieldsConflict(spoken: ObservationCandidate, seen: ObservationCandidate): boolean {
  if (known(spoken.brand) && known(seen.brand) && normalizeBrand(spoken.brand) !== normalizeBrand(seen.brand)) return true;
  if (known(spoken.model) && known(seen.model) && normalizeModel(spoken.model) !== normalizeModel(seen.model)) return true;
  return false;
}

function fieldsCompatible(spoken: ObservationCandidate, seen: ObservationCandidate): boolean {
  if (fieldsConflict(spoken, seen)) return false;
  const brandOk = !known(spoken.brand) || !known(seen.brand) || normalizeBrand(spoken.brand) === normalizeBrand(seen.brand);
  const modelOk = !known(spoken.model) || !known(seen.model) || normalizeModel(spoken.model) === normalizeModel(seen.model);
  return brandOk && modelOk;
}

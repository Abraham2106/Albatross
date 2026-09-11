import { InferenceError, type ExtractionData, type ObservationCandidate, type QueryFilter, type QueryOptions } from './ports/inference-engine';

export const MODALITIES = ['MR', 'CT', 'Ultrasound', 'X-Ray', 'Patient Monitoring', 'Image Guided Therapy'] as const;
export function invalid(message: string): never { throw new InferenceError('INVALID_INPUT', message); }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Se esperaba un objeto.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(label + ': texto requerido (máximo ' + max + ' caracteres).');
  return value.trim();
}
export function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new InferenceError('CANCELLED', 'Operación cancelada.');
}
function nullableText(value: unknown, label: string, max = 200): string | null {
  return value === null ? null : text(value, label, max);
}
function nullableNumber(value: unknown, label: string, max: number, integer = false): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) invalid(label + ': número inválido.');
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') invalid('Se esperaba un booleano.'); return value; }
function exactKeys(obj: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(obj).length !== keys.length || keys.some(k => !Object.hasOwn(obj, k))) invalid('Campos inesperados o incompletos.');
}
export function validateCandidate(value: unknown, transcript?: string, channel: 'Voice' | 'Manual' | 'Photo' = 'Manual'): ObservationCandidate {
  const v = record(value);
  exactKeys(v, ['modality', 'scope', 'quantity', 'brand', 'model', 'ageYears', 'ageDescription', 'quantityApproximate', 'ageApproximate', 'unknownFields', 'evidence']);
  if (!(MODALITIES as readonly unknown[]).includes(v.modality)) invalid('Modalidad no reconocida.');
  if (v.scope !== 'total' && v.scope !== 'group') invalid('Tipo de afirmación inválido.');
  const evidence = text(v.evidence, 'Evidencia', 2000);
  const photoEvidence = /^photo:[a-f0-9]{64}$/.test(evidence);
  if (channel === 'Photo') {
    if (!photoEvidence && transcript !== undefined && !transcript.includes(evidence)) invalid('La evidencia no aparece en la nota ni en la foto.');
  } else if (transcript !== undefined && !transcript.includes(evidence)) invalid('La evidencia no aparece en la transcripción.');
  if (!Array.isArray(v.unknownFields) || v.unknownFields.some(k => !['quantity', 'brand', 'model', 'ageYears'].includes(k)) || new Set(v.unknownFields).size !== v.unknownFields.length) invalid('Campos desconocidos inválidos.');
  const result: ObservationCandidate = {
    modality: v.modality as ObservationCandidate['modality'], scope: v.scope,
    quantity: nullableNumber(v.quantity, 'Cantidad', 100000, true), brand: nullableText(v.brand, 'Marca'),
    model: nullableText(v.model, 'Modelo'), ageYears: nullableNumber(v.ageYears, 'Edad', 100),
    ageDescription: nullableText(v.ageDescription, 'Descripción de edad'), quantityApproximate: bool(v.quantityApproximate),
    ageApproximate: bool(v.ageApproximate), unknownFields: [...v.unknownFields], evidence,
  };
  if (result.ageYears !== null && result.ageDescription !== null) invalid('Usa edad numérica o cualitativa, no ambas.');
  for (const key of result.unknownFields) if (result[key] !== null && result[key] !== 'Unknown') invalid('Un campo desconocido no puede contener un valor conocido.');
  return result;
}
export function validateExtraction(value: unknown, hospitalId: string, transcript: string): ExtractionData {
  const v = record(value);
  exactKeys(v, ['mentionedHospital', 'candidates']);
  const h = record(v.mentionedHospital);
  exactKeys(h, ['name', 'country', 'city', 'evidence']);
  const mentionedHospital = { name: nullableText(h.name, 'Hospital'), country: nullableText(h.country, 'País'), city: nullableText(h.city, 'Ciudad'), evidence: nullableText(h.evidence, 'Evidencia del hospital', 2000) };
  if ((mentionedHospital.name || mentionedHospital.country || mentionedHospital.city) && !mentionedHospital.evidence) invalid('Falta evidencia del hospital.');
  if (mentionedHospital.evidence && !transcript.includes(mentionedHospital.evidence)) invalid('La evidencia del hospital no aparece en el texto.');
  if (!Array.isArray(v.candidates) || v.candidates.length > 50) invalid('Máximo 50 grupos por dictado.');
  return { hospitalId, mentionedHospital, candidates: v.candidates.map(c => validateCandidate(c, transcript)) };
}
export const STATUSES = ['Confirmed', 'Reported', 'Estimated', 'Unknown'] as const;
const QUERY_KEYS = ['countries', 'cities', 'modalities', 'brands', 'model', 'olderThanYears', 'youngerThanYears', 'ageWord', 'minQuantity', 'statuses'] as const;
function subset<T extends string>(value: unknown, allowed: readonly T[], label: string): T[] {
  if (!Array.isArray(value) || value.some(v => !allowed.includes(v)) || new Set(value).size !== value.length) invalid(label + ': valor no reconocido.');
  return [...value] as T[];
}
export function validateQueryFilter(value: unknown, options: QueryOptions): QueryFilter {
  const v = record(value);
  exactKeys(v, QUERY_KEYS);
  if (v.ageWord !== null && v.ageWord !== 'old' && v.ageWord !== 'new') invalid('Edad inválida.');
  const filter: QueryFilter = {
    countries: subset(v.countries, options.countries, 'País'),
    cities: subset(v.cities, options.cities, 'Ciudad'),
    modalities: subset(v.modalities, MODALITIES, 'Modalidad'),
    brands: subset(v.brands, options.brands, 'Marca'),
    model: nullableText(v.model, 'Modelo'),
    olderThanYears: nullableNumber(v.olderThanYears, 'Edad', 100),
    youngerThanYears: nullableNumber(v.youngerThanYears, 'Edad', 100),
    ageWord: v.ageWord as QueryFilter['ageWord'],
    minQuantity: nullableNumber(v.minQuantity, 'Cantidad', 100000, true),
    statuses: subset(v.statuses, STATUSES, 'Estado'),
  };
  if (filter.olderThanYears !== null && filter.youngerThanYears !== null && filter.olderThanYears >= filter.youngerThanYears) invalid('Rango de edad vacío.');
  const scalars = [filter.model, filter.olderThanYears, filter.youngerThanYears, filter.ageWord, filter.minQuantity];
  const lists = [filter.countries, filter.cities, filter.modalities, filter.brands, filter.statuses];
  if (scalars.every(s => s === null) && lists.every(l => !l.length)) invalid('La pregunta no trae ningún filtro.');
  return filter;
}

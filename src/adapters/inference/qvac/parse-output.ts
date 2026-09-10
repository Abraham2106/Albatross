import { MODALITIES, STATUSES } from '../../../application/validation';
import type { ExtractionData, MentionedHospital, ObservationCandidate, QueryOptions } from '../../../application/ports/inference-engine';

const UNKNOWN_FIELDS = ['quantity', 'brand', 'model', 'ageYears'] as const;
const ALIAS: Record<string, (typeof MODALITIES)[number]> = {
  MRI: 'MR', SCANNER: 'CT', TOMOGRAFO: 'CT', TOMOGRAFOS: 'CT',
  US: 'Ultrasound', ULTRASOUND: 'Ultrasound', ECOGRAFO: 'Ultrasound',
  RX: 'X-Ray', 'XRAY': 'X-Ray', 'X-RAY': 'X-Ray',
};

export function parseModelJson(raw: string): unknown {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const attempts = [text];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1));
  for (const attempt of attempts) {
    try { return JSON.parse(attempt); } catch { /* next */ }
  }
  throw new Error('not json');
}

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function alignEvidence(transcript: string, quote: string): string | undefined {
  const q = quote.trim();
  if (!q) return undefined;
  if (transcript.includes(q)) return q;
  const lower = transcript.toLocaleLowerCase();
  const at = lower.indexOf(q.toLocaleLowerCase());
  if (at >= 0) return transcript.slice(at, at + q.length);
  const compactT = fold(transcript).replace(/\s+/g, ' ');
  const compactQ = fold(q).replace(/\s+/g, ' ');
  const foldedAt = compactT.indexOf(compactQ);
  if (foldedAt >= 0) {
    const loose = transcript.replace(/\s+/g, ' ');
    const looseAt = fold(loose).indexOf(compactQ);
    if (looseAt >= 0) return loose.slice(looseAt, looseAt + compactQ.length).trim();
  }
  return undefined;
}

function fallbackEvidence(transcript: string, hint: string) {
  const tokens = hint.split(/\s+/).filter(token => token.length > 2);
  for (const token of tokens) {
    const at = fold(transcript).indexOf(fold(token));
    if (at < 0) continue;
    const start = Math.max(0, transcript.lastIndexOf(' ', Math.min(at, transcript.length - 1)));
    return transcript.slice(start, Math.min(transcript.length, start + 80)).trim() || transcript.slice(0, 80);
  }
  return transcript.slice(0, Math.min(80, transcript.length)).trim();
}

function coerceNullString(value: unknown, max = 200): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) return null;
  return value.trim();
}

function coerceNumber(value: unknown, max: number, integer = false): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) return null;
  return n;
}

function coerceBool(value: unknown): boolean { return value === true; }

function normalizeModality(value: unknown): ObservationCandidate['modality'] | undefined {
  if (typeof value !== 'string') return;
  const key = value.trim();
  if ((MODALITIES as readonly string[]).includes(key)) return key as ObservationCandidate['modality'];
  return ALIAS[key.toUpperCase().replace(/\s+/g, '')];
}

function coerceUnknown(value: unknown): Array<(typeof UNKNOWN_FIELDS)[number]> {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is (typeof UNKNOWN_FIELDS)[number] =>
    typeof item === 'string' && (UNKNOWN_FIELDS as readonly string[]).includes(item)))];
}

const notUnknown = (value: string | null) => value === 'Unknown' ? null : value;

function coerceHospital(raw: unknown, transcript: string): MentionedHospital {
  const h = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const name = coerceNullString(h.name);
  const country = notUnknown(coerceNullString(h.country));
  const city = notUnknown(coerceNullString(h.city));
  let evidence = coerceNullString(h.evidence, 2000);
  if (evidence) evidence = alignEvidence(transcript, evidence) ?? null;
  if ((name || country || city) && !evidence) {
    evidence = alignEvidence(transcript, name ?? city ?? country ?? '') ?? fallbackEvidence(transcript, name ?? city ?? country ?? '');
  }
  return { name, country, city, evidence };
}

function coerceCandidate(raw: unknown, transcript: string): ObservationCandidate | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const v = raw as Record<string, unknown>;
  const modality = normalizeModality(v.modality);
  if (!modality) return;
  const quoted = typeof v.evidence === 'string' ? v.evidence : '';
  const evidence = alignEvidence(transcript, quoted) ?? fallbackEvidence(transcript, quoted || modality);
  let ageYears = coerceNumber(v.ageYears, 100);
  let ageDescription = coerceNullString(v.ageDescription);
  // A qualitative assertion must never be converted into a numeric age. If a
  // small model emits both representations, retain the literal description;
  // keeping its number would turn "old" into an unsupported number of years.
  if (ageYears !== null && ageDescription !== null) ageYears = null;
  const unknownFields = coerceUnknown(v.unknownFields);
  const declared = (value: string | null, field: 'brand' | 'model') =>
    value === 'Unknown' && !unknownFields.includes(field) ? null : value;
  const brand = declared(coerceNullString(v.brand), 'brand');
  const model = declared(coerceNullString(v.model), 'model');
  const quantity = coerceNumber(v.quantity, 100000, true);
  const result: ObservationCandidate = {
    modality, scope: v.scope === 'group' ? 'group' : 'total',
    quantity, brand, model, ageYears, ageDescription,
    quantityApproximate: quantity === null ? false : coerceBool(v.quantityApproximate),
    ageApproximate: ageYears === null ? false : coerceBool(v.ageApproximate),
    unknownFields, evidence,
  };
  return {
    ...result,
    unknownFields: unknownFields.filter(field => result[field] === null || result[field] === 'Unknown'),
  };
}

export function coerceExtraction(value: unknown, _hospitalId: string, transcript: string): Pick<ExtractionData, 'mentionedHospital' | 'candidates'> {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map(item => coerceCandidate(item, transcript)).filter((item): item is ObservationCandidate => !!item).slice(0, 50)
    : [];
  return { mentionedHospital: coerceHospital(raw.mentionedHospital, transcript), candidates };
}
const MENTIONS: Record<string, readonly string[]> = {
  MR: ['mr', 'mri', 'resona', 'magnetic'],
  CT: ['ct', 'tac', 'tomogra', 'scanner', 'escaner'],
  Ultrasound: ['ultra', 'ecogra', 'sonogra'],
  'X-Ray': ['rayos x', 'x-ray', 'xray', 'rx', 'radiogra'],
  'Patient Monitoring': ['monitor'],
  'Image Guided Therapy': ['guiad', 'guided', 'igt'],
  Confirmed: ['confirm'],
  Reported: ['reportad', 'reported', 'sin confirmar', 'unconfirmed', 'no confirmad'],
  Estimated: ['estimad', 'estimated', 'sin confirmar', 'unconfirmed', 'no confirmad'],
  Unknown: ['sin datos', 'unknown', 'desconocid', 'sin confirmar', 'unconfirmed', 'no confirmad'],
  old: ['viej', 'antigu', 'old', 'envejec', 'obsolet'],
  new: ['nuev', 'recient', 'new', 'modern'],
};
const NUMBER_WORDS: Record<number, readonly string[]> = {
  1: ['uno', 'una', 'one'], 2: ['dos', 'two'], 3: ['tres', 'three'], 4: ['cuatro', 'four'], 5: ['cinco', 'five'],
  6: ['seis', 'six'], 7: ['siete', 'seven'], 8: ['ocho', 'eight'], 9: ['nueve', 'nine'], 10: ['diez', 'ten', 'decada', 'decade'],
  11: ['once', 'eleven'], 12: ['doce', 'twelve'], 13: ['trece', 'thirteen'], 14: ['catorce', 'fourteen'], 15: ['quince', 'fifteen'], 20: ['veinte', 'twenty'],
};

function says(question: string, stem: string) {
  return stem.length <= 3 ? new RegExp(`(^|[^a-z])${stem}([^a-z]|$)`).test(question) : question.includes(stem);
}

export function coerceQueryFilter(value: unknown, options: QueryOptions, question: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const q = fold(question);
  const negated = ['sin confirmar', 'unconfirmed', 'no confirmad'].some(s => q.includes(s));
  const mentioned = (key: string) => (key !== 'Confirmed' || !negated) && (MENTIONS[key] ?? []).some(stem => says(q, stem));
  const number = (n: unknown) => typeof n === 'number' && (new RegExp(`(^|\\D)${n}(\\D|$)`).test(q) || (NUMBER_WORDS[n] ?? []).some(w => says(q, w)));
  const v = { ...value as Record<string, unknown> };
  const everything = (list: unknown, allowed: readonly string[]) => Array.isArray(list) && allowed.every(a => list.includes(a)) ? [] : list;
  const grounded = (list: unknown) => Array.isArray(list) ? list.filter(item => typeof item !== 'string' || mentioned(item)) : list;
  const model = typeof v.model === 'string' ? v.model.trim() : v.model;
  v.model = model === '' || (typeof model === 'string' && options.brands.some(b => fold(b) === fold(model))) ? null : model;
  if (!number(v.olderThanYears)) v.olderThanYears = null;
  if (!number(v.youngerThanYears)) v.youngerThanYears = null;
  if (typeof v.minQuantity === 'number' && (v.minQuantity <= 1 || !(number(v.minQuantity) || number(v.minQuantity - 1)))) v.minQuantity = null;
  if (typeof v.ageWord === 'string' && !mentioned(v.ageWord)) v.ageWord = null;
  v.modalities = grounded(everything(v.modalities, MODALITIES));
  v.statuses = grounded(everything(v.statuses, STATUSES));
  v.brands = everything(v.brands, options.brands);
  return v;
}
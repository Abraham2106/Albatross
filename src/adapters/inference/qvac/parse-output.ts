import { MODALITIES } from '../../../application/validation';
import type { ExtractionData, MentionedHospital, ObservationCandidate } from '../../../application/ports/inference-engine';

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
  if (ageYears !== null && ageDescription !== null) ageDescription = null;
  const unknownFields = coerceUnknown(v.unknownFields);
  const declared = (value: string | null, field: 'brand' | 'model') =>
    value === 'Unknown' && !unknownFields.includes(field) ? null : value;
  const brand = declared(coerceNullString(v.brand), 'brand');
  const model = declared(coerceNullString(v.model), 'model');
  const quantity = coerceNumber(v.quantity, 100000, true);
  const result: ObservationCandidate = {
    modality, scope: v.scope === 'group' ? 'group' : 'total',
    quantity, brand, model, ageYears, ageDescription,
    quantityApproximate: coerceBool(v.quantityApproximate), ageApproximate: coerceBool(v.ageApproximate),
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

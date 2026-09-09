// =============================================================================
// DOMINIO — DERIVACIONES
// Campos "Derived" de la hoja "Agent Question Logic": Confidence (paso 9),
// Status (paso 10) e Installation Year (paso 8).
// =============================================================================

import type { ConfidenceLevel, ObservationRef, SourceChannel, StatusLevel } from "./types";
import { canonicalize } from "./vocabulary";

/** Marcadores de certeza alta en el habla del observador. */
const FIRM_MARKERS = [
  "exactly", "confirmed", "i confirmed", "definitely", "i counted", "counted",
  "confirme", "confirmado", "seguro", "exactamente", "conte", "verifique",
];

/** Marcadores de estimacion o duda. */
const HEDGE_MARKERS = [
  "around", "about", "approximately", "roughly", "maybe", "i think", "probably",
  "best estimate", "estimate", "seems", "looks", "appear", "appears", "mostly",
  "aproximadamente", "como", "creo", "quizas", "tal vez", "parece", "mas o menos",
];

/** Marcadores de desconocimiento explicito. */
const UNKNOWN_MARKERS = [
  "i do not know", "i don't know", "not sure", "unknown", "no idea", "could not see",
  "no se", "no estoy seguro", "desconocido", "no pude ver", "no lo vi",
];

/**
 * Compara contra marcadores ya canonicalizados. Es necesario porque
 * canonicalize() elimina apostrofes: "I don't know" -> "i don t know".
 */
function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(canonicalize(n)));
}

/**
 * Paso 9: "Agent can infer High / Medium / Low by field."
 * Se infiere del lenguaje, no se le pregunta al usuario.
 */
export function deriveConfidence(rawAnswerText: string | undefined): ConfidenceLevel {
  if (!rawAnswerText) return "Low";
  const t = canonicalize(rawAnswerText);
  if (t.length === 0) return "Low";
  if (containsAny(t, UNKNOWN_MARKERS)) return "Low";
  if (containsAny(t, FIRM_MARKERS)) return "High";
  if (containsAny(t, HEDGE_MARKERS)) return "Medium";
  return "High"; // afirmacion directa, sin matizar
}

/**
 * Paso 10: Confirmed | Reported | Estimated | Unknown.
 * Una foto es evidencia mas fuerte que un dictado de memoria.
 */
export function deriveStatus(
  channel: SourceChannel,
  rawAnswerText: string | undefined
): StatusLevel {
  const t = rawAnswerText ? canonicalize(rawAnswerText) : "";
  if (containsAny(t, UNKNOWN_MARKERS)) return "Unknown";
  if (channel === "Photo" || containsAny(t, FIRM_MARKERS)) return "Confirmed";
  if (containsAny(t, HEDGE_MARKERS)) return "Estimated";
  if (t.length === 0) return "Unknown";
  return "Reported";
}

/**
 * Paso 8: "If age is known, estimate installation year from observation date."
 * Devuelve undefined si no hay edad: no se inventa un anio.
 */
export function deriveInstallYear(
  visitTimestamp: string,
  approxAgeYears: number | undefined
): number | undefined {
  if (approxAgeYears === undefined || !Number.isFinite(approxAgeYears)) return undefined;
  const visitYear = new Date(visitTimestamp).getFullYear();
  if (!Number.isFinite(visitYear)) return undefined;
  return visitYear - Math.round(approxAgeYears);
}

/**
 * Paso 7: "Accept ranges such as 5-7 years or qualitative answers like new / old."
 * Convierte lenguaje de edad a un numero aproximado. Devuelve undefined si el
 * texto no dice nada util sobre edad.
 */
export function parseApproxAge(rawText: string | undefined): number | undefined {
  if (!rawText) return undefined;
  const t = canonicalize(rawText);

  // Rango explicito: "5-7 years", "entre 5 y 7"
  const range = t.match(/(\d{1,2})\s*(?:-|a|to|y|and)\s*(\d{1,2})\s*(?:years|anios|year|anio)?/);
  if (range && range[1] && range[2]) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && high >= low && high <= 60) {
      return Math.round((low + high) / 2);
    }
  }

  // Numero explicito con unidad
  const single = t.match(/(\d{1,2})\s*(?:years|year|anios|anio|de anios)/);
  if (single && single[1]) {
    const value = Number(single[1]);
    if (Number.isFinite(value) && value <= 60) return value;
  }

  // Numeros escritos en palabras, hasta trece (los que aparecen en el dataset)
  const words: Readonly<Record<string, number>> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
    ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  };
  const wordMatch = t.match(
    /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece)\s*(?:years|year|anios|anio)/
  );
  if (wordMatch && wordMatch[1]) {
    const value = words[wordMatch[1]];
    if (value !== undefined) return value;
  }

  // Cualitativo. Valores conservadores, siempre acompaniados de status Estimated.
  if (/\b(brand new|nuevo|nueva|new|recently|recien|recently installed)\b/.test(t)) return 2;
  if (/\b(very old|muy viejo|muy antiguo|quite old|bastante viejo)\b/.test(t)) return 12;
  if (/\b(old|viejo|antiguo|older)\b/.test(t)) return 9;

  return undefined;
}

/** Autores distintos que respaldan un conjunto de observaciones. */
export function distinctAuthors(observations: readonly ObservationRef[]): number {
  return new Set(observations.map((o) => o.author)).size;
}

/**
 * Confianza de un grupo a partir de TODA su evidencia acumulada.
 * Regla: dos observadores independientes que coinciden elevan a High.
 * "Confidence scoring: assign confidence based on how complete, recent, or
 * independently confirmed an observation is." (brief del reto)
 */
export function computeGroupConfidence(
  observations: readonly ObservationRef[],
  latestConfidence: ConfidenceLevel
): ConfidenceLevel {
  if (distinctAuthors(observations) >= 2) return "High";
  return latestConfidence;
}

/** Estado de un grupo a partir de toda su evidencia. */
export function computeGroupStatus(
  observations: readonly ObservationRef[],
  latestStatus: StatusLevel
): StatusLevel {
  if (distinctAuthors(observations) >= 2) return "Confirmed";
  return latestStatus;
}

/** Dias transcurridos entre dos instantes ISO. Nunca negativo. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/**
 * Frescura: cuanto vale hoy un dato observado hace N dias.
 * Escalones explicables ante un jurado, no una exponencial opaca.
 */
export function freshnessFactor(days: number): number {
  if (days <= 90) return 1;
  if (days <= 180) return 0.8;
  if (days <= 365) return 0.6;
  return 0.4;
}

/**
 * Hash FNV-1a de 32 bits en base36. Determinista y sin dependencias:
 * el mismo contenido produce el mismo id en todos los dispositivos, lo cual
 * es requisito para que Infra pueda encadenar y firmar sin coordinacion.
 */
export function deterministicId(prefix: string, ...parts: readonly (string | number | undefined)[]): string {
  const input = parts.map((p) => String(p ?? "")).join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}_${hash.toString(36)}`;
}

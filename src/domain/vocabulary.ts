// =============================================================================
// DOMINIO — VOCABULARIO Y NORMALIZACION
// "Normalize synonyms such as MRI -> MR, scanner -> CT when context is clear."
// (Agent Question Logic, paso 3)
// =============================================================================

import type { Modality } from "./types";

export const KNOWN_MODALITIES: readonly Modality[] = [
  "MR",
  "CT",
  "Ultrasound",
  "X-Ray",
  "Patient Monitoring",
  "Image Guided Therapy",
] as const;

/** Marcas ficticias del dataset. Hoja "Dummy Reference Lists". */
export const KNOWN_BRANDS: readonly string[] = [
  "NovaMed",
  "Aurelia Health",
  "BluePeak Medical",
  "Orion Imaging",
  "HelixCare",
  "Zenith MedTech",
] as const;

export const UNKNOWN = "Unknown";

/** Sinonimos que una persona diria en voz alta, en ingles y espaniol. */
const MODALITY_SYNONYMS: Readonly<Record<string, Modality>> = {
  mr: "MR",
  mri: "MR",
  "mr system": "MR",
  "mr systems": "MR",
  "magnetic resonance": "MR",
  resonancia: "MR",
  "resonancia magnetica": "MR",
  resonador: "MR",
  ct: "CT",
  "ct scanner": "CT",
  "ct scanners": "CT",
  "ct system": "CT",
  "ct systems": "CT",
  scanner: "CT",
  tac: "CT",
  tomografia: "CT",
  tomografo: "CT",
  ultrasound: "Ultrasound",
  "ultrasound system": "Ultrasound",
  "ultrasound systems": "Ultrasound",
  ultrasonido: "Ultrasound",
  ecografia: "Ultrasound",
  ecografo: "Ultrasound",
  "x-ray": "X-Ray",
  xray: "X-Ray",
  "x ray": "X-Ray",
  "rayos x": "X-Ray",
  rx: "X-Ray",
  "patient monitoring": "Patient Monitoring",
  monitoring: "Patient Monitoring",
  monitoreo: "Patient Monitoring",
  monitores: "Patient Monitoring",
  "image guided therapy": "Image Guided Therapy",
  igt: "Image Guided Therapy",
  "terapia guiada por imagen": "Image Guided Therapy",
};

/** Quita acentos, colapsa espacios y pasa a minusculas. */
export function canonicalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza una modalidad dictada a su forma canonica.
 * Devuelve null si no se reconoce: Dominio NUNCA inventa una modalidad.
 */
export function normalizeModality(raw: string): Modality | null {
  const key = canonicalize(raw);
  if (key.length === 0) return null;

  const direct = MODALITY_SYNONYMS[key];
  if (direct) return direct;

  const exact = KNOWN_MODALITIES.find((m) => canonicalize(m) === key);
  if (exact) return exact;

  // Un sinonimo contenido en una frase mas larga ("two mr systems in the basement")
  const contained = Object.keys(MODALITY_SYNONYMS)
    .filter((syn) => syn.length >= 2)
    .sort((a, b) => b.length - a.length)
    .find((syn) => key.includes(syn));

  return contained ? MODALITY_SYNONYMS[contained] ?? null : null;
}

/** Distancia de Levenshtein. O(n*m) en tiempo, O(min(n,m)) en espacio. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost
      );
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length] ?? 0;
}

/**
 * Ajusta una marca dictada al catalogo conocido con tolerancia a errores de
 * transcripcion ("Nova Med", "novamed", "Aurelia Helth").
 * Si no hay match razonable devuelve la marca tal cual, capitalizada,
 * y NUNCA la fuerza a una del catalogo: "If unknown, save as Unknown.
 * Never force a guess." (Agent Question Logic, paso 5)
 */
export function normalizeBrand(raw: string | undefined): string {
  if (!raw) return UNKNOWN;
  const clean = raw.trim();
  if (clean.length === 0) return UNKNOWN;
  if (canonicalize(clean) === "unknown" || canonicalize(clean) === "desconocido") return UNKNOWN;

  const key = canonicalize(clean).replace(/\s/g, "");
  let best: { brand: string; distance: number } | null = null;

  for (const brand of KNOWN_BRANDS) {
    const distance = levenshtein(key, canonicalize(brand).replace(/\s/g, ""));
    if (best === null || distance < best.distance) best = { brand, distance };
  }

  // Umbral proporcional: hasta ~20% de los caracteres pueden diferir.
  if (best !== null && best.distance <= Math.max(1, Math.floor(key.length * 0.2))) {
    return best.brand;
  }
  return clean;
}

export function normalizeModel(raw: string | undefined): string {
  if (!raw) return UNKNOWN;
  const clean = raw.trim();
  if (clean.length === 0) return UNKNOWN;
  if (canonicalize(clean) === "unknown" || canonicalize(clean) === "desconocido") return UNKNOWN;
  return clean;
}

export function isKnown(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0 && value !== UNKNOWN;
}

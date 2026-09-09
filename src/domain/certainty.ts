// =============================================================================
// DOMINIO — CERTEZA
// El porcentaje que ve el usuario y que pinta el mapa de rojo a verde.
// Los pesos NO son inventados: salen de la columna "Required?" de la hoja
// "Agent Question Logic" del propio dataset del patrocinador.
// =============================================================================

import type {
  CertaintyReport,
  ConfidenceLevel,
  ExpectedModality,
  ModalityCertainty,
  Requirement,
  Site,
} from "./types";
import { daysBetween, freshnessFactor } from "./derive";
import { expectedModalitiesFor, inferProfileType } from "./profiles";
import { openDisputes } from "./merge";

/** Peso de negocio por nivel de exigencia. Agent Question Logic, columna "Required?". */
export const REQUIREMENT_WEIGHT: Readonly<Record<Requirement, number>> = {
  Required: 3,
  Preferred: 2,
  Optional: 1,
  Derived: 0, // campos calculados: nunca se preguntan ni suman certeza
};

/** Cuanto vale un dato segun su confianza. */
export const CONFIDENCE_VALUE: Readonly<Record<ConfidenceLevel, number>> = {
  High: 1,
  Medium: 0.6,
  Low: 0.3,
};

/** Penalizacion por cada disputa abierta en la modalidad. */
export const DISPUTE_PENALTY = 0.5;

function bestConfidence(confidences: readonly ConfidenceLevel[]): ConfidenceLevel | "None" {
  if (confidences.length === 0) return "None";
  if (confidences.includes("High")) return "High";
  if (confidences.includes("Medium")) return "Medium";
  return "Low";
}

/**
 * Reporte completo de certeza de un sitio. La UI usa `percent` para el color
 * del pin y `perModality` para explicar el porque, que es lo que sostiene el
 * argumento de confianza ante el jurado: el numero se puede desglosar.
 *
 * certeza = suma(peso * valorConfianza * frescura * penalizacionDisputa) / suma(pesos)
 *
 * Complejidad: O(E * F) con E modalidades esperadas y F conocidas. E y F <= 6.
 */
export function explainCertainty(
  site: Site,
  now: string,
  expected?: readonly ExpectedModality[]
): CertaintyReport {
  const expectedList =
    expected ?? expectedModalitiesFor(site.profileType ?? inferProfileType(site.name));

  const scored = expectedList.filter((e) => REQUIREMENT_WEIGHT[e.requirement] > 0);
  const totalWeight = scored.reduce((sum, e) => sum + REQUIREMENT_WEIGHT[e.requirement], 0);

  const perModality: ModalityCertainty[] = scored.map((e) => {
    const weight = REQUIREMENT_WEIGHT[e.requirement];
    const fact = site.facts.find((f) => f.modality === e.modality);

    if (!fact || fact.groups.length === 0) {
      return {
        modality: e.modality,
        known: false,
        confidence: "None",
        freshnessFactor: 0,
        weight,
        earned: 0,
      };
    }

    const confidence = bestConfidence(fact.groups.map((g) => g.confidence));
    const latestTimestamp = fact.groups
      .flatMap((g) => g.observations.map((o) => o.timestamp))
      .concat(fact.totalObservations.map((o) => o.timestamp))
      .sort()
      .at(-1);

    const fresh = latestTimestamp ? freshnessFactor(daysBetween(latestTimestamp, now)) : 0.4;
    const hasOpenDispute = fact.disputes.some((d) => d.resolvedAt === undefined);
    const confidenceValue = confidence === "None" ? 0 : CONFIDENCE_VALUE[confidence];
    const earned = weight * confidenceValue * fresh * (hasOpenDispute ? DISPUTE_PENALTY : 1);

    return {
      modality: e.modality,
      known: true,
      confidence,
      freshnessFactor: fresh,
      weight,
      earned: Number(earned.toFixed(3)),
    };
  });

  const earnedTotal = perModality.reduce((sum, m) => sum + m.earned, 0);
  const percent = totalWeight === 0 ? 0 : Math.round((earnedTotal / totalWeight) * 100);

  const lastUpdate = site.lastUpdated;

  return {
    siteId: site.id,
    percent: Math.max(0, Math.min(100, percent)),
    perModality,
    openDisputes: openDisputes(site).length,
    ...(lastUpdate ? { daysSinceLastUpdate: daysBetween(lastUpdate, now) } : {}),
  };
}

/** Atajo cuando la UI solo necesita el numero. */
export function calculateCertainty(
  site: Site,
  now: string,
  expected?: readonly ExpectedModality[]
): number {
  return explainCertainty(site, now, expected).percent;
}

/** Color del pin en el mapa: rojo -> amarillo -> verde. */
export type CertaintyBand = "red" | "amber" | "green";

export function certaintyBand(percent: number): CertaintyBand {
  if (percent < 34) return "red";
  if (percent < 67) return "amber";
  return "green";
}

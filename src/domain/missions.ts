// =============================================================================
// DOMINIO — MOTOR DE MISIONES
// Lo que diferencia el proyecto: en vez de esperar el reporte, el sistema
// calcula QUE le falta averiguar a cada sitio y lo ordena por valor.
// La misma funcion sirve para las preguntas previas a la visita y para las
// repreguntas durante el dictado. Un solo motor, dos funcionalidades.
// =============================================================================

import type { ExpectedModality, MissionQuestion, ModalityFact, Site } from "./types";
import { REQUIREMENT_WEIGHT } from "./certainty";
import { daysBetween } from "./derive";
import { expectedModalitiesFor, inferProfileType } from "./profiles";
import { UNKNOWN, isKnown } from "./vocabulary";
import { totalQuantity } from "./merge";

/** Multiplicadores por tipo de vacio. Un conflicto vale mas que un hueco. */
export const REASON_MULTIPLIER = {
  conflict: 1.5,
  missing: 1,
  low_confidence: 0.6,
  stale: 0.5,
} as const;

/** A partir de cuantos dias un dato se considera viejo y hay que reverificar. */
export const STALE_AFTER_DAYS = 180;

/**
 * Genera y ordena las misiones de un sitio.
 *
 * Orden de valor:
 *   1. Disputas abiertas: hay contradiccion y alguien debe resolverla.
 *   2. Modalidades esperadas de las que no se sabe nada.
 *   3. Datos incompletos: se sabe que hay equipos pero no marca o edad.
 *   4. Datos viejos que conviene reverificar.
 *
 * prioridad = pesoRequerimiento * multiplicadorRazon
 *
 * Complejidad: O(E + F*G) con E esperadas, F modalidades conocidas, G lotes.
 */
export function rankMissingFields(
  site: Site,
  now: string,
  topN = 3,
  expected?: readonly ExpectedModality[]
): readonly MissionQuestion[] {
  const expectedList =
    expected ?? expectedModalitiesFor(site.profileType ?? inferProfileType(site.name));
  const missions: MissionQuestion[] = [];

  // 1. Disputas abiertas
  for (const fact of site.facts) {
    for (const dispute of fact.disputes) {
      if (dispute.resolvedAt !== undefined) continue;
      const weight = weightFor(expectedList, fact.modality);
      missions.push({
        siteId: site.id,
        modality: fact.modality,
        field: dispute.field === "approxAgeYears" ? "approxAgeYears" : dispute.field,
        prompt: dispute.question,
        priority: weight * REASON_MULTIPLIER.conflict,
        reason: "conflict",
      });
    }
  }

  // 2, 3 y 4
  for (const expectedItem of expectedList) {
    const weight = REQUIREMENT_WEIGHT[expectedItem.requirement];
    if (weight === 0) continue;

    const fact = site.facts.find((f) => f.modality === expectedItem.modality);

    if (!fact || fact.groups.length === 0) {
      missions.push({
        siteId: site.id,
        modality: expectedItem.modality,
        field: "presence",
        prompt: `¿Tienen equipos de ${expectedItem.modality}?`,
        priority: weight * REASON_MULTIPLIER.missing,
        reason: "missing",
      });
      continue;
    }

    if (totalQuantity(fact) === 0 && fact.groups.every(g => g.quantity !== undefined)) continue; // el sitio confirmo que no tiene: no se pregunta mas

    missions.push(...incompleteFieldMissions(site.id, fact, weight));

    const latest = latestTimestamp(fact);
    if (latest && daysBetween(latest, now) > STALE_AFTER_DAYS) {
      missions.push({
        siteId: site.id,
        modality: fact.modality,
        field: "quantity",
        prompt: `La informacion de ${fact.modality} tiene mas de ${STALE_AFTER_DAYS} dias. ¿Sigue igual?`,
        priority: weight * REASON_MULTIPLIER.stale,
        reason: "stale",
      });
    }
  }

  return dedupe(missions)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, topN);
}

/** Huecos concretos dentro de una modalidad ya conocida. */
function incompleteFieldMissions(
  siteId: string,
  fact: ModalityFact,
  weight: number
): MissionQuestion[] {
  const out: MissionQuestion[] = [];

  if (fact.groups.some(g => g.quantity === undefined)) {
    out.push({ siteId, modality: fact.modality, field: "quantity",
      prompt: `¿Cuántos equipos de ${fact.modality} tienen?`,
      priority: REQUIREMENT_WEIGHT.Required * REASON_MULTIPLIER.missing, reason: "missing" });
  }

  const missingBrand = fact.groups.some((g) => g.brand === UNKNOWN);
  if (missingBrand) {
    out.push({
      siteId,
      modality: fact.modality,
      field: "brand",
      // Paso 5: preferido, no obligatorio. Nunca se fuerza una respuesta.
      prompt: `¿Sabes la marca de los equipos de ${fact.modality}?`,
      priority: REQUIREMENT_WEIGHT.Preferred * REASON_MULTIPLIER.low_confidence,
      reason: "low_confidence",
    });
  }

  const missingAge = fact.groups.some((g) => g.approxAgeYears === undefined);
  if (missingAge) {
    out.push({
      siteId,
      modality: fact.modality,
      field: "approxAgeYears",
      prompt: `¿Aproximadamente que edad tienen los ${fact.modality}?`,
      priority: REQUIREMENT_WEIGHT.Preferred * REASON_MULTIPLIER.low_confidence,
      reason: "low_confidence",
    });
  }

  const missingModel = fact.groups.some((g) => !isKnown(g.model) || g.model === UNKNOWN);
  if (missingModel && !missingBrand) {
    out.push({
      siteId,
      modality: fact.modality,
      field: "model",
      prompt: `¿Sabes el modelo o familia de producto de ${fact.modality}?`,
      priority: REQUIREMENT_WEIGHT.Optional * REASON_MULTIPLIER.low_confidence,
      reason: "low_confidence",
    });
  }

  const onlyOneSource = fact.groups.some(
    (g) => new Set(g.observations.map((o) => o.author)).size === 1 && g.confidence !== "High"
  );
  if (onlyOneSource) {
    out.push({
      siteId,
      modality: fact.modality,
      field: "quantity",
      prompt: `¿Puedes confirmar la cantidad de ${fact.modality}? Solo una persona lo ha reportado.`,
      priority: weight * REASON_MULTIPLIER.low_confidence,
      reason: "low_confidence",
    });
  }

  return out;
}

function weightFor(expected: readonly ExpectedModality[], modality: ModalityFact["modality"]): number {
  const found = expected.find((e) => e.modality === modality);
  return found ? REQUIREMENT_WEIGHT[found.requirement] : REQUIREMENT_WEIGHT.Optional;
}

function latestTimestamp(fact: ModalityFact): string | undefined {
  return fact.groups
    .flatMap((g) => g.observations.map((o) => o.timestamp))
    .concat(fact.totalObservations.map((o) => o.timestamp))
    .sort()
    .at(-1);
}

function dedupe(missions: readonly MissionQuestion[]): MissionQuestion[] {
  const seen = new Set<string>();
  const out: MissionQuestion[] = [];
  for (const m of missions) {
    const key = `${m.modality}|${m.field}|${m.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/**
 * Paso 12 de Agent Question Logic: "Always confirm the structured summary
 * before saving." Resumen legible de lo captado para que la persona lo valide.
 */
export function buildReviewSummary(site: Site): string {
  const parts = site.facts.flatMap((fact) =>
    fact.groups
      .filter((g) => g.quantity === undefined || g.quantity > 0)
      .map((g) => {
        const brand = g.brand === UNKNOWN ? "marca desconocida" : g.brand;
        const age = g.approxAgeYears !== undefined ? `, ~${g.approxAgeYears} anios` : "";
        return `${g.quantity ?? "?"} ${fact.modality} (${brand}${age})`;
      })
  );
  if (parts.length === 0) return `No hay equipos registrados en ${site.name}. ¿Es correcto?`;
  return `Capte en ${site.name}: ${parts.join("; ")}. ¿Es correcto?`;
}

/**
 * Version de una sola pregunta, para la repregunta inmediata durante el
 * dictado. Es el mismo motor: solo cambia cuantas se muestran.
 */
export function nextQuestion(site: Site, now: string): MissionQuestion | undefined {
  return rankMissingFields(site, now, 1)[0];
}

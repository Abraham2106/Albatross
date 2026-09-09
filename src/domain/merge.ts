// =============================================================================
// DOMINIO — COMPARACION Y FUSION
// =============================================================================
import type {
  Candidate,
  ComparisonResult,
  Dispute,
  EquipmentGroup,
  MergeResult,
  ModalityFact,
  ObservationRef,
  Site,
} from "./types";
import {
  computeGroupConfidence,
  computeGroupStatus,
  deriveConfidence,
  deriveInstallYear,
  deriveStatus,
  deterministicId,
  parseApproxAge,
} from "./derive";
import { UNKNOWN, isKnown, normalizeBrand, normalizeModality, normalizeModel } from "./vocabulary";

/** Tolerancia en años para considerar que dos lotes son el mismo. */
export const AGE_MATCH_TOLERANCE_YEARS = 1;

export class UnknownModalityError extends Error {
  constructor(public readonly raw: string) {
    super(`Modalidad no reconocida: "${raw}". Dominio no inventa modalidades.`);
    this.name = "UnknownModalityError";
  }
}

/** Sitio vacio. Punto de partida cuando se descubre un cliente nuevo. */
export function createSite(params: {
  id: string;
  name: string;
  city: string;
  country: string;
  profileType?: Site["profileType"];
}): Site {
  return {
    id: params.id,
    name: params.name,
    city: params.city,
    country: params.country,
    ...(params.profileType ? { profileType: params.profileType } : {}),
    facts: [],
  };
}

export function totalQuantity(fact: ModalityFact | undefined): number {
  if (!fact) return 0;
  return fact.groups.reduce((sum, g) => sum + g.quantity, 0);
}

export function findFact(site: Site, modality: ModalityFact["modality"]): ModalityFact | undefined {
  return site.facts.find((f) => f.modality === modality);
}

/**
 * Una afirmacion "vacia" habla del TOTAL de la modalidad: trae cantidad pero
 * ni marca ni edad que permitan distinguir un lote.
 *   "Confirme que hay cuatro MR"  -> total
 *   "Hay 2 MR NovaMed de 7 años" -> lote especifico
 */
export function isBareTotalClaim(candidate: Candidate): boolean {
  return (
    candidate.quantity !== undefined &&
    !isKnown(candidate.brand) &&
    candidate.approxAgeYears === undefined
  );
}

/**
 * Compara un candidato contra lo que ya se sabe de esa modalidad.
 * Solo una afirmacion sobre el total puede generar conflicto de cantidad:
 * un lote nuevo con otra marca o edad AUMENTA el total legitimamente.
 */
export function compareCandidate(
  fact: ModalityFact | undefined,
  candidate: Candidate
): ComparisonResult {
  if (!fact || fact.groups.length === 0) return { kind: "new" };

  const modality = fact.modality;

  if (isBareTotalClaim(candidate)) {
    const existingTotal = totalQuantity(fact);
    const newTotal = candidate.quantity as number;
    if (existingTotal === newTotal) {
      const confirmations =
        fact.groups.reduce((n, g) => n + g.observations.length, 0) +
        fact.totalObservations.length +
        1;
      return { kind: "corroboration", confirmations };
    }
    return {
      kind: "conflict",
      field: "quantity",
      existingValue: existingTotal,
      newValue: newTotal,
      question: `Hay observaciones que no coinciden: ¿el sitio tiene ${existingTotal} o ${newTotal} de ${modality}?`,
    };
  }

  const matchIndex = findMatchingGroupIndex(fact, candidate);
  if (matchIndex < 0) return { kind: "new" };

  const group = fact.groups[matchIndex];
  if (!group) return { kind: "new" };

  if (candidate.quantity !== undefined && candidate.quantity !== group.quantity) {
    return {
      kind: "conflict",
      field: "quantity",
      existingValue: group.quantity,
      newValue: candidate.quantity,
      question: `Para ${modality} ${group.brand}: ¿son ${group.quantity} o ${candidate.quantity} unidades?`,
    };
  }

  return { kind: "corroboration", confirmations: group.observations.length + 1 };
}

/**
 * Busca el lote al que pertenece el candidato: misma marca y edad dentro de
 * la tolerancia. Devuelve -1 si es un lote nuevo.
 */
export function findMatchingGroupIndex(fact: ModalityFact, candidate: Candidate): number {
  const brand = normalizeBrand(candidate.brand);
  const age = candidate.approxAgeYears;

  return fact.groups.findIndex((g) => {
    const brandMatches =
      // misma marca
      g.brand === brand ||
      // el candidato no dice marca: encaja con un lote que si la tiene
      (!isKnown(candidate.brand) && g.brand !== UNKNOWN) ||
      // el lote no tiene marca todavia: este candidato puede completarla
      g.brand === UNKNOWN;
    if (!brandMatches) return false;
    if (age === undefined || g.approxAgeYears === undefined) return true;
    return Math.abs(g.approxAgeYears - age) <= AGE_MATCH_TOLERANCE_YEARS;
  });
}

function buildObservationRef(candidate: Candidate): ObservationRef {
  const age = candidate.approxAgeYears ?? parseApproxAge(candidate.rawAnswerText);
  return {
    observationId: deterministicId(
      "obs",
      candidate.siteId,
      candidate.modality,
      candidate.source.author,
      candidate.source.timestamp,
      candidate.quantity,
      candidate.brand,
      candidate.model,
      age
    ),
    author: candidate.source.author,
    timestamp: candidate.source.timestamp,
    channel: candidate.source.channel,
    ...(candidate.quantity !== undefined ? { quantity: candidate.quantity } : {}),
    ...(isKnown(candidate.brand) ? { brand: normalizeBrand(candidate.brand) } : {}),
    ...(isKnown(candidate.model) ? { model: normalizeModel(candidate.model) } : {}),
    ...(age !== undefined ? { approxAgeYears: age } : {}),
    ...(candidate.rawAnswerText ? { rawAnswerText: candidate.rawAnswerText } : {}),
  };
}

function buildGroup(candidate: Candidate, ref: ObservationRef): EquipmentGroup {
  const confidence = deriveConfidence(candidate.rawAnswerText);
  const status = deriveStatus(candidate.source.channel, candidate.rawAnswerText);
  const age = ref.approxAgeYears;
  const installYear = deriveInstallYear(candidate.source.timestamp, age);

  return {
    groupId: deterministicId(
      "grp",
      candidate.siteId,
      candidate.modality,
      normalizeBrand(candidate.brand),
      age,
      candidate.source.timestamp
    ),
    quantity: candidate.quantity ?? 0,
    brand: normalizeBrand(candidate.brand),
    model: normalizeModel(candidate.model),
    ...(age !== undefined ? { approxAgeYears: age } : {}),
    ...(installYear !== undefined ? { estimatedInstallYear: installYear } : {}),
    confidence,
    status,
    observations: [ref],
    notes: candidate.notes ? [candidate.notes] : [],
  };
}

function corroborateGroup(group: EquipmentGroup, candidate: Candidate, ref: ObservationRef): EquipmentGroup {
  const alreadyRecorded = group.observations.some((o) => o.observationId === ref.observationId);
  const observations = alreadyRecorded ? group.observations : [...group.observations, ref];

  const latestConfidence = deriveConfidence(candidate.rawAnswerText);
  const latestStatus = deriveStatus(candidate.source.channel, candidate.rawAnswerText);
  const age = group.approxAgeYears ?? ref.approxAgeYears;
  const installYear =
    group.estimatedInstallYear ?? deriveInstallYear(candidate.source.timestamp, age);

  return {
    ...group,
    // Un dato desconocido se completa; uno ya conocido no se pisa.
    brand: group.brand === UNKNOWN ? normalizeBrand(candidate.brand) : group.brand,
    model: group.model === UNKNOWN ? normalizeModel(candidate.model) : group.model,
    ...(age !== undefined ? { approxAgeYears: age } : {}),
    ...(installYear !== undefined ? { estimatedInstallYear: installYear } : {}),
    confidence: computeGroupConfidence(observations, latestConfidence),
    status: computeGroupStatus(observations, latestStatus),
    observations,
    notes: candidate.notes && !group.notes.includes(candidate.notes)
      ? [...group.notes, candidate.notes]
      : group.notes,
  };
}

function openDispute(
  fact: ModalityFact,
  candidate: Candidate,
  comparison: Extract<ComparisonResult, { kind: "conflict" }>
): Dispute {
  const existingClaimAuthor =
    fact.groups[0]?.observations[0]?.author ?? fact.totalObservations[0]?.author ?? "unknown";
  const existingClaimTimestamp =
    fact.groups[0]?.observations[0]?.timestamp ?? candidate.source.timestamp;

  return {
    disputeId: deterministicId(
      "dsp",
      candidate.siteId,
      fact.modality,
      comparison.field,
      comparison.existingValue,
      comparison.newValue
    ),
    modality: fact.modality,
    field: comparison.field,
    claims: [
      { value: comparison.existingValue, author: existingClaimAuthor, timestamp: existingClaimTimestamp },
      { value: comparison.newValue, author: candidate.source.author, timestamp: candidate.source.timestamp },
    ],
    question: comparison.question,
    openedAt: candidate.source.timestamp,
  };
}

function laterOf(a: string | undefined, b: string): string {
  if (!a) return b;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

/**
 * Integra un candidato al sitio.
 *
 * Reglas, en orden:
 *  1. La modalidad se normaliza; si no se reconoce, se lanza y NO se guarda basura.
 *  2. Si la modalidad no existe en el sitio, se crea con un lote.
 *  3. Si el candidato afirma un total que contradice lo conocido, se abre una
 *     disputa y el estado NO se sobrescribe.
 *  4. Si coincide con un lote existente, corrobora: suma evidencia y puede
 *     elevar confianza y estado.
 *  5. Si trae marca o edad distintas, se agrega como lote nuevo dentro de la
 *     misma modalidad (el caso Horizon: MR viejos + MR nuevo).
 *
 * Complejidad: O(G) donde G es el numero de lotes de esa modalidad.
 */
export function mergeCandidate(site: Site, candidate: Candidate): MergeResult {
  const modality = normalizeModality(candidate.modality);
  if (modality === null) throw new UnknownModalityError(candidate.modality);

  const ref = buildObservationRef(candidate);
  const factIndex = site.facts.findIndex((f) => f.modality === modality);
  const fact = factIndex >= 0 ? site.facts[factIndex] : undefined;
  const comparison = compareCandidate(fact, candidate);
  const lastUpdated = laterOf(site.lastUpdated, candidate.source.timestamp);

  // Caso 2: modalidad nueva en este sitio
  if (!fact) {
    const group = buildGroup(candidate, ref);
    const newFact: ModalityFact = {
      modality,
      groups: [group],
      totalObservations: isBareTotalClaim(candidate) ? [ref] : [],
      disputes: [],
    };
    return {
      site: { ...site, facts: [...site.facts, newFact], lastUpdated },
      comparison,
      affectedGroupId: group.groupId,
    };
  }

  // Caso 3: conflicto -> se abre disputa y se preserva la evidencia de ambos lados
  if (comparison.kind === "conflict") {
    const dispute = openDispute(fact, candidate, comparison);
    const alreadyOpen = fact.disputes.some(
      (d) => d.disputeId === dispute.disputeId && d.resolvedAt === undefined
    );
    const updatedFact: ModalityFact = {
      ...fact,
      totalObservations: [...fact.totalObservations, ref],
      disputes: alreadyOpen ? fact.disputes : [...fact.disputes, dispute],
    };
    return {
      site: { ...site, facts: replaceAt(site.facts, factIndex, updatedFact), lastUpdated },
      comparison,
      openedDispute: dispute,
    };
  }

  // Caso 3b: total que coincide -> corrobora la modalidad completa
  if (isBareTotalClaim(candidate)) {
    const alreadyRecorded = fact.totalObservations.some((o) => o.observationId === ref.observationId);
    const totalObservations = alreadyRecorded ? fact.totalObservations : [...fact.totalObservations, ref];
    const groups = fact.groups.map((g) => ({
      ...g,
      confidence: computeGroupConfidence([...g.observations, ref], g.confidence),
      status: computeGroupStatus([...g.observations, ref], g.status),
    }));
    const updatedFact: ModalityFact = { ...fact, groups, totalObservations };
    return {
      site: { ...site, facts: replaceAt(site.facts, factIndex, updatedFact), lastUpdated },
      comparison,
    };
  }

  // Casos 4 y 5: lote existente o lote nuevo
  const matchIndex = findMatchingGroupIndex(fact, candidate);
  if (matchIndex >= 0) {
    const existingGroup = fact.groups[matchIndex];
    if (existingGroup) {
      const updatedGroup = corroborateGroup(existingGroup, candidate, ref);
      const updatedFact: ModalityFact = {
        ...fact,
        groups: replaceAt(fact.groups, matchIndex, updatedGroup),
      };
      return {
        site: { ...site, facts: replaceAt(site.facts, factIndex, updatedFact), lastUpdated },
        comparison,
        affectedGroupId: updatedGroup.groupId,
      };
    }
  }

  const newGroup = buildGroup(candidate, ref);
  const updatedFact: ModalityFact = { ...fact, groups: [...fact.groups, newGroup] };
  return {
    site: { ...site, facts: replaceAt(site.facts, factIndex, updatedFact), lastUpdated },
    comparison,
    affectedGroupId: newGroup.groupId,
  };
}

/** Aplica varios candidatos en orden. Util para reconstruir estado desde el log. */
export function mergeAll(site: Site, candidates: readonly Candidate[]): Site {
  return candidates.reduce<Site>((acc, c) => mergeCandidate(acc, c).site, site);
}

/**
 * Resuelve una disputa con el valor que una persona eligio.
 * El lote se ajusta al valor ganador y la disputa queda cerrada con historial.
 */
export function resolveDispute(
  site: Site,
  disputeId: string,
  chosenValue: string | number,
  resolvedAt: string
): Site {
  const facts = site.facts.map((fact) => {
    const dispute = fact.disputes.find((d) => d.disputeId === disputeId);
    if (!dispute || dispute.resolvedAt !== undefined) return fact;

    const disputes = fact.disputes.map((d) =>
      d.disputeId === disputeId ? { ...d, resolvedAt, resolvedValue: chosenValue } : d
    );

    if (dispute.field !== "quantity" || typeof chosenValue !== "number" || fact.groups.length === 0) {
      return { ...fact, disputes };
    }

    // Se ajusta el lote mas grande para que el total cuadre con lo elegido.
    const currentTotal = totalQuantity(fact);
    const delta = chosenValue - currentTotal;
    let largestIndex = 0;
    fact.groups.forEach((g, i) => {
      const largest = fact.groups[largestIndex];
      if (largest && g.quantity > largest.quantity) largestIndex = i;
    });
    const target = fact.groups[largestIndex];
    if (!target) return { ...fact, disputes };

    const adjusted: EquipmentGroup = {
      ...target,
      quantity: Math.max(0, target.quantity + delta),
      confidence: "High",
      status: "Confirmed",
    };
    return { ...fact, groups: replaceAt(fact.groups, largestIndex, adjusted), disputes };
  });

  return { ...site, facts, lastUpdated: laterOf(site.lastUpdated, resolvedAt) };
}

export function openDisputes(site: Site): readonly Dispute[] {
  return site.facts.flatMap((f) => f.disputes.filter((d) => d.resolvedAt === undefined));
}

function replaceAt<T>(items: readonly T[], index: number, value: T): T[] {
  const copy = items.slice();
  copy[index] = value;
  return copy;
}

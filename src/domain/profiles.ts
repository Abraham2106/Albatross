// =============================================================================
// DOMINIO — ARRANQUE EN FRIO
// Un sitio sin datos no puede generar misiones utiles: no se le puede pedir a
// alguien que recuerde lo que nunca registro. La salida es proponer el perfil
// tipico del centro y dejar que la persona confirme si / no / no se, que es
// mucho mas facil que recordar.
// =============================================================================

import type {
  Candidate,
  ColdStartAnswer,
  ExpectedModality,
  Modality,
  Site,
  SiteProfileType,
} from "./types";
import { UNKNOWN } from "./vocabulary";
import { mergeCandidate } from "./merge";
import { canonicalize } from "./vocabulary";

/**
 * Que se espera encontrar segun el tipo de centro, con el peso que la hoja
 * "Agent Question Logic" le da a cada dato.
 */
export const SITE_PROFILES: Readonly<Record<SiteProfileType, readonly ExpectedModality[]>> = {
  hospital_general: [
    { modality: "MR", requirement: "Required" },
    { modality: "CT", requirement: "Required" },
    { modality: "Ultrasound", requirement: "Required" },
    { modality: "X-Ray", requirement: "Preferred" },
    { modality: "Patient Monitoring", requirement: "Preferred" },
    { modality: "Image Guided Therapy", requirement: "Optional" },
  ],
  clinica_imagen: [
    { modality: "MR", requirement: "Required" },
    { modality: "CT", requirement: "Required" },
    { modality: "Ultrasound", requirement: "Preferred" },
    { modality: "X-Ray", requirement: "Optional" },
  ],
  centro_diagnostico: [
    { modality: "Ultrasound", requirement: "Required" },
    { modality: "CT", requirement: "Preferred" },
    { modality: "X-Ray", requirement: "Preferred" },
    { modality: "MR", requirement: "Optional" },
  ],
};

/** Perfil por defecto cuando aun no se sabe el tipo de centro. */
export const DEFAULT_EXPECTED: readonly ExpectedModality[] = SITE_PROFILES.hospital_general;

export function expectedModalitiesFor(profileType: SiteProfileType | undefined): readonly ExpectedModality[] {
  if (!profileType) return DEFAULT_EXPECTED;
  return SITE_PROFILES[profileType];
}

/**
 * Heuristica de tipo de centro a partir del nombre. Es una SUGERENCIA:
 * el tipo real lo confirma la persona o lo propone QVAC desde el dictado.
 */
export function inferProfileType(siteName: string): SiteProfileType {
  const n = canonicalize(siteName);
  if (n.includes("clinica") || n.includes("clinic")) return "clinica_imagen";
  if (n.includes("centro") || n.includes("instituto") || n.includes("diagnostico")) {
    return "centro_diagnostico";
  }
  return "hospital_general";
}

/** Una casilla del perfil gris que el usuario ve antes de tener datos. */
export interface ColdStartItem {
  readonly modality: Modality;
  readonly prompt: string;
  readonly assumed: true;
  readonly requirement: ExpectedModality["requirement"];
}

/**
 * Etapa 1: propone el perfil tipico. Solo incluye modalidades de las que aun
 * no se sabe nada, para no volver a preguntar lo ya respondido.
 */
export function buildColdStartChecklist(site: Site): readonly ColdStartItem[] {
  const expected = expectedModalitiesFor(site.profileType ?? inferProfileType(site.name));
  return expected
    .filter((e) => e.requirement !== "Derived")
    .filter((e) => !site.facts.some((f) => f.modality === e.modality))
    .map((e) => ({
      modality: e.modality,
      prompt: `¿Tienen equipos de ${e.modality}?`,
      assumed: true as const,
      requirement: e.requirement,
    }));
}

/**
 * Aplica la respuesta si / no / no se a una casilla del perfil gris.
 *
 * - "yes"     -> se registra la presencia con marca y modelo desconocidos.
 * - "no"      -> se registra cantidad 0, dato negativo confirmado y valioso.
 * - "unknown" -> no se registra nada, pero se devuelve el sitio intacto para
 *                que la capa de misiones baje la prioridad de esa pregunta.
 */
export function applyColdStartAnswer(
  site: Site,
  modality: Modality,
  answer: ColdStartAnswer,
  author: string,
  timestamp: string
): Site {
  if (answer === "unknown") return site;

  const candidate: Candidate = {
    siteId: site.id,
    modality,
    quantity: answer === "yes" ? 1 : 0,
    brand: UNKNOWN,
    rawAnswerText:
      answer === "yes"
        ? `Confirmado por ${author}: el sitio tiene ${modality}`
        : `Confirmado por ${author}: el sitio no tiene ${modality}`,
    source: { author, timestamp, channel: "Manual" },
  };

  return mergeCandidate(site, candidate).site;
}

/** Modalidades cuya respuesta fue "no se", para despriorizarlas por persona. */
export function shouldSkipForAuthor(
  skipped: readonly { modality: Modality; author: string }[],
  modality: Modality,
  author: string
): boolean {
  return skipped.some((s) => s.modality === modality && s.author === author);
}

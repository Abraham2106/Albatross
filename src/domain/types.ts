// =============================================================================
// DOMINIO — TIPOS
// Capa pura: sin QVAC, sin red, sin disco, sin UI.
// Los tipos siguen las columnas reales de la hoja "Dummy Installed Base"
// y la logica de la hoja "Agent Question Logic" del dataset del patrocinador.
// =============================================================================

/** Categorias de equipo. Hoja "Dummy Reference Lists". */
export type Modality =
  | "MR"
  | "CT"
  | "Ultrasound"
  | "X-Ray"
  | "Patient Monitoring"
  | "Image Guided Therapy";

/** Confianza por dato. Hoja "Dummy Reference Lists" -> Confidence. */
export type ConfidenceLevel = "High" | "Medium" | "Low";

/** Estado de la observacion. Hoja "Dummy Reference Lists" -> Status. */
export type StatusLevel = "Confirmed" | "Reported" | "Estimated" | "Unknown";

/** Canal por el que entro la observacion. Columna "Source". */
export type SourceChannel = "Voice" | "Manual" | "Photo" | "Seed";

/** Tipo de centro, usado solo para el arranque en frio. */
export type SiteProfileType = "hospital_general" | "clinica_imagen" | "centro_diagnostico";

/** Peso de negocio de un campo. Columna "Required?" de "Agent Question Logic". */
export type Requirement = "Required" | "Preferred" | "Optional" | "Derived";

// -----------------------------------------------------------------------------
// Entrada: lo que QVAC entrega a Dominio
// -----------------------------------------------------------------------------

/**
 * Un candidato es una afirmacion extraida de un dictado, todavia sin validar.
 * `modality` llega SIN normalizar: la normalizacion es responsabilidad de Dominio.
 */
export interface Candidate {
  readonly siteId: string;
  readonly modality: string;
  readonly quantity?: number;
  readonly brand?: string;
  readonly model?: string;
  readonly approxAgeYears?: number;
  readonly notes?: string;
  /** Texto crudo de la respuesta; de aqui se derivan confianza y estado. */
  readonly rawAnswerText?: string;
  readonly source: CandidateSource;
}

export interface CandidateSource {
  readonly author: string;
  /** ISO 8601. Corresponde a la columna "Visit Date". */
  readonly timestamp: string;
  readonly channel: SourceChannel;
}

// -----------------------------------------------------------------------------
// Estado: lo que Dominio mantiene como verdad conocida
// -----------------------------------------------------------------------------

/** Referencia inmutable a una observacion concreta. Es la evidencia. */
export interface ObservationRef {
  readonly observationId: string;
  readonly author: string;
  readonly timestamp: string;
  readonly channel: SourceChannel;
  readonly quantity?: number;
  readonly brand?: string;
  readonly model?: string;
  readonly approxAgeYears?: number;
  readonly rawAnswerText?: string;
}

/**
 * Un grupo = un lote de unidades que comparten marca y edad dentro de una
 * modalidad. Corresponde a UNA fila del dataset del patrocinador.
 * Hospital DemoCare Horizon tiene dos grupos de MR: 3 unidades de ~9 anios
 * y 1 unidad de ~3 anios.
 */
export interface EquipmentGroup {
  readonly groupId: string;
  readonly quantity: number;
  /** "Unknown" si no se sabe. Nunca se adivina (Agent Question Logic, paso 5). */
  readonly brand: string;
  readonly model: string;
  readonly approxAgeYears?: number;
  readonly estimatedInstallYear?: number;
  readonly confidence: ConfidenceLevel;
  readonly status: StatusLevel;
  readonly observations: readonly ObservationRef[];
  readonly notes: readonly string[];
}

/** Una contradiccion abierta entre observaciones. Nunca se resuelve sola. */
export interface Dispute {
  readonly disputeId: string;
  readonly modality: Modality;
  readonly field: "quantity" | "brand" | "approxAgeYears";
  readonly claims: readonly DisputeClaim[];
  readonly question: string;
  readonly openedAt: string;
  readonly resolvedAt?: string;
  readonly resolvedValue?: string | number;
}

export interface DisputeClaim {
  readonly value: string | number;
  readonly author: string;
  readonly timestamp: string;
}

export interface ModalityFact {
  readonly modality: Modality;
  readonly groups: readonly EquipmentGroup[];
  /** Observaciones que afirman un TOTAL de la modalidad sin distinguir lote. */
  readonly totalObservations: readonly ObservationRef[];
  readonly disputes: readonly Dispute[];
}

export interface Site {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly profileType?: SiteProfileType;
  readonly facts: readonly ModalityFact[];
  /** ISO 8601 de la observacion mas reciente registrada en el sitio. */
  readonly lastUpdated?: string;
}

// -----------------------------------------------------------------------------
// Resultados
// -----------------------------------------------------------------------------

export type ComparisonResult =
  | { readonly kind: "new" }
  | { readonly kind: "corroboration"; readonly confirmations: number }
  | {
      readonly kind: "conflict";
      readonly field: "quantity";
      readonly existingValue: number;
      readonly newValue: number;
      readonly question: string;
    };

/** Lo que devuelve mergeCandidate: estado nuevo + explicacion de lo que paso. */
export interface MergeResult {
  readonly site: Site;
  readonly comparison: ComparisonResult;
  readonly openedDispute?: Dispute;
  readonly affectedGroupId?: string;
}

export interface MissionQuestion {
  readonly siteId: string;
  readonly modality: Modality;
  readonly field: "presence" | "quantity" | "brand" | "approxAgeYears" | "model";
  readonly prompt: string;
  readonly priority: number;
  readonly reason: "missing" | "conflict" | "low_confidence" | "stale";
}

export interface ExpectedModality {
  readonly modality: Modality;
  readonly requirement: Requirement;
}

export interface CertaintyReport {
  readonly siteId: string;
  readonly percent: number;
  readonly perModality: readonly ModalityCertainty[];
  readonly openDisputes: number;
  readonly daysSinceLastUpdate?: number;
}

export interface ModalityCertainty {
  readonly modality: Modality;
  readonly known: boolean;
  readonly confidence: ConfidenceLevel | "None";
  readonly freshnessFactor: number;
  readonly weight: number;
  readonly earned: number;
}

/** Respuesta del usuario al perfil gris del arranque en frio. */
export type ColdStartAnswer = "yes" | "no" | "unknown";

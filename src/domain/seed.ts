// =============================================================================
// DOMINIO — SEMILLA
// Los 20 registros de la hoja "Dummy Installed Base" del patrocinador.
// No se construyen los Site a mano: se pasan por mergeCandidate, de modo que
// el estado inicial es producto del mismo motor que procesa los dictados.
// Datos ficticios provistos por el reto. No sustituir por datos reales.
// =============================================================================

import type { Candidate, Site } from "./types";
import { createSite, mergeCandidate } from "./merge";
import { inferProfileType } from "./profiles";

export interface SeedRow {
  readonly observationId: number;
  readonly country: string;
  readonly city: string;
  readonly customer: string;
  readonly observer: string;
  readonly visitDate: string;
  readonly modality: string;
  readonly quantity: number;
  readonly brand: string;
  readonly model: string;
  readonly approxAgeYears: number;
  readonly followUpAnswer: string;
  readonly notes: string;
}

export const SEED_ROWS: readonly SeedRow[] = [
  { observationId: 1, country: "Panama", city: "Panama City", customer: "Hospital DemoCare Pacific", observer: "Field User 01", visitDate: "2026-08-18", modality: "MR", quantity: 2, brand: "NovaMed", model: "NM-MR 700", approxAgeYears: 7, followUpAnswer: "Yes, NovaMed.", notes: "Two MR systems observed in imaging area." },
  { observationId: 2, country: "Panama", city: "Panama City", customer: "Hospital DemoCare Pacific", observer: "Field User 01", visitDate: "2026-08-18", modality: "CT", quantity: 1, brand: "Aurelia Health", model: "AH-CT 320", approxAgeYears: 5, followUpAnswer: "Aurelia Health, around 5 years old.", notes: "Single CT system observed." },
  { observationId: 3, country: "Brazil", city: "Sao Paulo", customer: "Hospital DemoCare Horizon", observer: "Sales User 02", visitDate: "2026-08-16", modality: "MR", quantity: 3, brand: "BluePeak Medical", model: "BP-MR 500", approxAgeYears: 9, followUpAnswer: "Two are around 9 years old and one around 3 years.", notes: "Aggregate row for older systems." },
  { observationId: 4, country: "Brazil", city: "Sao Paulo", customer: "Hospital DemoCare Horizon", observer: "Sales User 02", visitDate: "2026-08-16", modality: "MR", quantity: 1, brand: "BluePeak Medical", model: "BP-MR 900", approxAgeYears: 3, followUpAnswer: "Yes, same brand, different model.", notes: "Newer MR system." },
  { observationId: 5, country: "Brazil", city: "Campinas", customer: "Clinica DemoCare Light", observer: "Field User 03", visitDate: "2026-08-15", modality: "CT", quantity: 2, brand: "Orion Imaging", model: "OI-CT 450", approxAgeYears: 11, followUpAnswer: "Orion Imaging, about 11 years.", notes: "Potential aging installed base." },
  { observationId: 6, country: "Brazil", city: "Campinas", customer: "Clinica DemoCare Light", observer: "Field User 03", visitDate: "2026-08-15", modality: "Ultrasound", quantity: 5, brand: "HelixCare", model: "HC-US 40", approxAgeYears: 4, followUpAnswer: "I think four are HelixCare; one is unknown.", notes: "Four confirmed, one uncertain." },
  { observationId: 7, country: "Mexico", city: "Mexico City", customer: "Centro Medico DemoCare Valley", observer: "Account User 04", visitDate: "2026-08-14", modality: "MR", quantity: 1, brand: "Zenith MedTech", model: "ZM-MR 810", approxAgeYears: 6, followUpAnswer: "Zenith MedTech, around six years old.", notes: "MR observation." },
  { observationId: 8, country: "Mexico", city: "Mexico City", customer: "Centro Medico DemoCare Valley", observer: "Account User 04", visitDate: "2026-08-14", modality: "CT", quantity: 2, brand: "Aurelia Health", model: "AH-CT 510", approxAgeYears: 8, followUpAnswer: "Around eight years, both similar.", notes: "Two similar CT units." },
  { observationId: 9, country: "Mexico", city: "Monterrey", customer: "Hospital DemoCare North", observer: "Field User 05", visitDate: "2026-08-13", modality: "Ultrasound", quantity: 6, brand: "NovaMed", model: "NM-US 55", approxAgeYears: 2, followUpAnswer: "NovaMed, roughly two years old.", notes: "Recent installation." },
  { observationId: 10, country: "Chile", city: "Santiago", customer: "Clinica DemoCare Andes", observer: "Sales User 06", visitDate: "2026-08-12", modality: "CT", quantity: 1, brand: "BluePeak Medical", model: "BP-CT 610", approxAgeYears: 13, followUpAnswer: "Maybe around thirteen years.", notes: "Old CT estimate." },
  { observationId: 11, country: "Chile", city: "Santiago", customer: "Clinica DemoCare Andes", observer: "Sales User 06", visitDate: "2026-08-12", modality: "MR", quantity: 2, brand: "Orion Imaging", model: "OI-MR 620", approxAgeYears: 5, followUpAnswer: "Orion Imaging, about five years.", notes: "Two MR units." },
  { observationId: 12, country: "Argentina", city: "Buenos Aires", customer: "Hospital DemoCare Park", observer: "Field User 07", visitDate: "2026-08-11", modality: "MR", quantity: 1, brand: "HelixCare", model: "HC-MR 300", approxAgeYears: 10, followUpAnswer: "HelixCare, model unknown.", notes: "Model not visible." },
  { observationId: 13, country: "Argentina", city: "Buenos Aires", customer: "Hospital DemoCare Park", observer: "Field User 07", visitDate: "2026-08-11", modality: "CT", quantity: 3, brand: "Zenith MedTech", model: "ZM-CT 430", approxAgeYears: 7, followUpAnswer: "Yes, all Zenith MedTech.", notes: "Three CT units." },
  { observationId: 14, country: "Colombia", city: "Bogota", customer: "Clinica DemoCare Central", observer: "Account User 08", visitDate: "2026-08-10", modality: "Ultrasound", quantity: 8, brand: "Aurelia Health", model: "AH-US 70", approxAgeYears: 6, followUpAnswer: "Aurelia Health. Eight is my best estimate.", notes: "Quantity estimated." },
  { observationId: 15, country: "Colombia", city: "Medellin", customer: "Hospital DemoCare Pines", observer: "Field User 09", visitDate: "2026-08-09", modality: "MR", quantity: 2, brand: "NovaMed", model: "NM-MR 720", approxAgeYears: 4, followUpAnswer: "Around four years.", notes: "Two MR systems." },
  { observationId: 16, country: "Peru", city: "Lima", customer: "Instituto DemoCare Lima", observer: "Sales User 10", visitDate: "2026-08-08", modality: "CT", quantity: 2, brand: "Orion Imaging", model: "OI-CT 540", approxAgeYears: 12, followUpAnswer: "Around twelve years.", notes: "Potential refresh opportunity." },
  { observationId: 17, country: "Peru", city: "Lima", customer: "Instituto DemoCare Lima", observer: "Sales User 10", visitDate: "2026-08-08", modality: "MR", quantity: 1, brand: "BluePeak Medical", model: "BP-MR 840", approxAgeYears: 2, followUpAnswer: "BluePeak Medical, installed about two years ago.", notes: "Recent MR." },
  { observationId: 18, country: "Costa Rica", city: "San Jose", customer: "Hospital DemoCare Green", observer: "Field User 11", visitDate: "2026-08-07", modality: "Ultrasound", quantity: 4, brand: "HelixCare", model: "HC-US 60", approxAgeYears: 9, followUpAnswer: "Around nine years.", notes: "Same family." },
  { observationId: 19, country: "Dominican Republic", city: "Santo Domingo", customer: "Centro Diagnostico DemoCare Caribbean", observer: "Account User 12", visitDate: "2026-08-06", modality: "CT", quantity: 1, brand: "Zenith MedTech", model: "ZM-CT 760", approxAgeYears: 3, followUpAnswer: "Zenith MedTech, around three years.", notes: "Newer CT." },
  { observationId: 20, country: "Ecuador", city: "Quito", customer: "Hospital DemoCare Metro North", observer: "Field User 13", visitDate: "2026-08-05", modality: "MR", quantity: 2, brand: "Aurelia Health", model: "AH-MR 650", approxAgeYears: 8, followUpAnswer: "Aurelia Health, maybe eight years.", notes: "Model unknown." },
];

/** Id estable de sitio a partir del nombre. Mismo nombre -> mismo id en todo peer. */
export function siteIdFor(customerName: string): string {
  return customerName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function seedRowToCandidate(row: SeedRow): Candidate {
  return {
    siteId: siteIdFor(row.customer),
    modality: row.modality,
    quantity: row.quantity,
    brand: row.brand,
    model: row.model,
    approxAgeYears: row.approxAgeYears,
    notes: row.notes,
    rawAnswerText: row.followUpAnswer,
    source: {
      author: row.observer,
      timestamp: `${row.visitDate}T12:00:00.000Z`,
      channel: "Seed",
    },
  };
}

/**
 * Reconstruye todos los sitios pasando cada fila por el motor de fusion.
 * Determinista: el orden de entrada fija el resultado, igual en todo peer.
 */
export function buildSeedSites(rows: readonly SeedRow[] = SEED_ROWS): readonly Site[] {
  const bySiteId = new Map<string, Site>();

  for (const row of rows) {
    const id = siteIdFor(row.customer);
    const existing =
      bySiteId.get(id) ??
      createSite({
        id,
        name: row.customer,
        city: row.city,
        country: row.country,
        profileType: inferProfileType(row.customer),
      });

    bySiteId.set(id, mergeCandidate(existing, seedRowToCandidate(row)).site);
  }

  return [...bySiteId.values()];
}

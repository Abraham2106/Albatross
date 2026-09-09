// =============================================================================
// DOMINIO — AGREGACION Y ANALITICA
// Alimenta el dashboard y el mapa. Todo puro y calculado sobre el estado.
// Cubre "Dashboard & Analytics" del brief del reto.
// =============================================================================

import type { Modality, Site } from "./types";
import { certaintyBand, explainCertainty } from "./certainty";
import { daysBetween } from "./derive";
import { openDisputes, totalQuantity } from "./merge";

export interface ModalityTotal {
  readonly modality: Modality;
  readonly quantity: number;
  readonly sites: number;
}

/** Equipos instalados por modalidad, agregando todos los sitios. */
export function aggregateByModality(sites: readonly Site[]): readonly ModalityTotal[] {
  const acc = new Map<Modality, { quantity: number; sites: Set<string> }>();

  for (const site of sites) {
    for (const fact of site.facts) {
      const qty = totalQuantity(fact);
      if (qty === 0) continue;
      const entry = acc.get(fact.modality) ?? { quantity: 0, sites: new Set<string>() };
      entry.quantity += qty;
      entry.sites.add(site.id);
      acc.set(fact.modality, entry);
    }
  }

  return [...acc.entries()]
    .map(([modality, v]) => ({ modality, quantity: v.quantity, sites: v.sites.size }))
    .sort((a, b) => b.quantity - a.quantity);
}

export interface GeoTotal {
  readonly country: string;
  readonly sites: number;
  readonly equipment: number;
  readonly averageCertainty: number;
}

/** Equipos y certeza por pais. Alimenta el mapa. */
export function aggregateByCountry(sites: readonly Site[], now: string): readonly GeoTotal[] {
  const acc = new Map<string, { sites: number; equipment: number; certaintySum: number }>();

  for (const site of sites) {
    const entry = acc.get(site.country) ?? { sites: 0, equipment: 0, certaintySum: 0 };
    entry.sites += 1;
    entry.equipment += site.facts.reduce((sum, f) => sum + totalQuantity(f), 0);
    entry.certaintySum += explainCertainty(site, now).percent;
    acc.set(site.country, entry);
  }

  return [...acc.entries()]
    .map(([country, v]) => ({
      country,
      sites: v.sites,
      equipment: v.equipment,
      averageCertainty: Math.round(v.certaintySum / v.sites),
    }))
    .sort((a, b) => b.equipment - a.equipment);
}

export interface RefreshOpportunity {
  readonly siteId: string;
  readonly siteName: string;
  readonly country: string;
  readonly city: string;
  readonly modality: Modality;
  readonly quantity: number;
  readonly brand: string;
  readonly approxAgeYears: number;
  readonly estimatedInstallYear?: number;
}

/**
 * "Opportunity identification: identify customer sites where the installed
 * technology landscape suggests a potential refresh." (stretch goal del brief)
 */
export function findRefreshOpportunities(
  sites: readonly Site[],
  minAgeYears = 10
): readonly RefreshOpportunity[] {
  const out: RefreshOpportunity[] = [];

  for (const site of sites) {
    for (const fact of site.facts) {
      for (const group of fact.groups) {
        if (group.approxAgeYears === undefined || group.approxAgeYears < minAgeYears) continue;
        if (group.quantity === undefined || group.quantity === 0) continue;
        out.push({
          siteId: site.id,
          siteName: site.name,
          country: site.country,
          city: site.city,
          modality: fact.modality,
          quantity: group.quantity,
          brand: group.brand,
          approxAgeYears: group.approxAgeYears,
          ...(group.estimatedInstallYear !== undefined
            ? { estimatedInstallYear: group.estimatedInstallYear }
            : {}),
        });
      }
    }
  }

  return out.sort((a, b) => b.approxAgeYears - a.approxAgeYears);
}

export interface SiteSummary {
  readonly siteId: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly certainty: number;
  readonly band: "red" | "amber" | "green";
  readonly equipment: number;
  readonly openDisputes: number;
  readonly daysSinceLastUpdate?: number;
}

/** Fila del listado y pin del mapa. */
export function summarizeSite(site: Site, now: string): SiteSummary {
  const report = explainCertainty(site, now);
  return {
    siteId: site.id,
    name: site.name,
    city: site.city,
    country: site.country,
    certainty: report.percent,
    band: certaintyBand(report.percent),
    equipment: site.facts.reduce((sum, f) => sum + totalQuantity(f), 0),
    openDisputes: openDisputes(site).length,
    ...(report.daysSinceLastUpdate !== undefined
      ? { daysSinceLastUpdate: report.daysSinceLastUpdate }
      : {}),
  };
}

/** Sitios con menos certeza: donde mas rinde la proxima visita. */
export function sitesNeedingAttention(
  sites: readonly Site[],
  now: string,
  limit = 5
): readonly SiteSummary[] {
  return sites
    .map((s) => summarizeSite(s, now))
    .sort((a, b) => a.certainty - b.certainty)
    .slice(0, limit);
}

/** "Data freshness: highlight information not verified recently." */
export function staleSites(
  sites: readonly Site[],
  now: string,
  thresholdDays = 180
): readonly SiteSummary[] {
  return sites
    .filter((s) => s.lastUpdated !== undefined && daysBetween(s.lastUpdated, now) > thresholdDays)
    .map((s) => summarizeSite(s, now))
    .sort((a, b) => (b.daysSinceLastUpdate ?? 0) - (a.daysSinceLastUpdate ?? 0));
}

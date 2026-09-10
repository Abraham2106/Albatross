import { explainCertainty, findRefreshOpportunities, rankMissingFields, staleSites, totalQuantity } from '../domain';
import { UNKNOWN } from '../domain/vocabulary';
import type { Site } from '../domain/types';
import type { MentionedHospital, ObservationCandidate } from './ports/inference-engine';
import type { HospitalInput, VisitDraft } from './ports/visit-repository';

export type CibRespuesta = 'si' | 'no' | 'nose';
export interface CibCliente {
  id: string; nombre: string; ciudad: string; pais: string;
  confianza: number; ultimaVisita: string | null; pendientes: number;
}
export interface CibPendiente { id: string; texto: string; valor: number; motivo: string }
export interface CibEquipo {
  id: string; modalidad: string; cantidad: number | null; marca: string | null; modelo: string | null;
  edad: number | null; anioInstalacion: number | null; estado: string; confianza: string | null;
  nota: string | null; observador: string | null; fecha: string | null; cita: string | null;
}
export interface CibFicha extends Omit<CibCliente, 'pendientes'> { pendientes: CibPendiente[]; equipos: CibEquipo[] }
export interface CibHospitalPin { id: string; nombre: string; confianza: number; equipos: number; x: number; y: number }
export interface CibCiudad { id: string; nombre: string; confianza: number; clientes: number; equipos: number; hospitales: CibHospitalPin[] }
export interface CibPais { id: string; nombre: string; confianza: number; clientes: number; equipos: number; ciudades: CibCiudad[] }
export interface CibGeo { region: string; confianza: number; paises: CibPais[] }
export interface CibOportunidad { id: string; cliente: string; motivo: string; prioridad: 'alta' | 'media' | 'visitar' }
export interface CibResumen {
  region: string; pais: string; clientes: number; equipos: number;
  confianzaMedia: number; sinVerificar: number; oportunidades: CibOportunidad[];
}
export interface CibItem {
  id: string; resumen: string; estadoSugerido: string; evidencia: string;
  campos: { modalidad: string; cantidad: number | null; marca: string | null; modelo: string | null; edad: number | null };
}
export interface CibObservacion {
  timings?: VisitDraft['timings'];
  observacionId: string; clienteId: string; cliente: string; ciudad: string; pais: string; textoOriginal: string;
  confianza: number | null;
  items: CibItem[]; conflictos: { campo: string; mensaje: string }[];
}

const REGION = 'Latinoamérica';
function norm(value: string) { return value.trim().toLocaleLowerCase(); }
function slug(value: string) {
  const compact = value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return compact || 'x';
}
export function itemId(draftId: string, index: number) { return draftId + ':' + index; }

export function resolveHospital(mention: MentionedHospital, sites: readonly Site[]): { hospital: HospitalInput; identityWarning?: string } {
  const name = mention.name?.trim() ?? '';
  const city = mention.city?.trim() ?? '';
  const country = mention.country?.trim() ?? '';
  if (name && city && country) {
    const existing = sites.find(s => norm(s.name) === norm(name) && norm(s.city) === norm(city) && norm(s.country) === norm(country));
    if (existing) return { hospital: { id: existing.id, name: existing.name, city: existing.city, country: existing.country } };
    return { hospital: { name, city, country } };
  }
  if (name) {
    const matches = sites.filter(s => norm(s.name) === norm(name));
    if (matches.length === 1) return { hospital: { id: matches[0].id, name: matches[0].name, city: matches[0].city, country: matches[0].country } };
  }
  return {
    hospital: { name: name || 'Hospital por identificar', city: city || 'Desconocido', country: country || 'Desconocido' },
    identityWarning: 'El dictado no identificó hospital, ciudad y país. Se guardará un destino provisional.',
  };
}

export function known(value: string | undefined) { return value && value !== UNKNOWN ? value : null; }

export function toCliente(site: Site, now: string): CibCliente {
  const certainty = explainCertainty(site, now);
  const questions = rankMissingFields(site, now);
  return {
    id: site.id, nombre: site.name, ciudad: site.city, pais: site.country,
    confianza: certainty.percent, ultimaVisita: site.lastUpdated ? site.lastUpdated.slice(0, 10) : null,
    pendientes: questions.length,
  };
}

export function toFicha(site: Site, now: string): CibFicha {
  const cliente = toCliente(site, now);
  const questions = rankMissingFields(site, now, 12);
  const equipos: CibEquipo[] = site.facts.flatMap(fact => fact.groups.map(g => {
    const last = g.observations[g.observations.length - 1];
    return {
      id: g.groupId, modalidad: fact.modality, cantidad: g.quantity ?? null,
      marca: known(g.brand), modelo: known(g.model), edad: g.approxAgeYears ?? null,
      anioInstalacion: g.estimatedInstallYear ?? null, estado: g.status, confianza: g.confidence,
      nota: g.notes.filter(Boolean).join(' ') || null,
      observador: last?.author ?? null, fecha: last?.timestamp.slice(0, 10) ?? null,
      cita: last?.rawAnswerText ?? null,
    };
  }));
  return {
    ...cliente,
    pendientes: questions.map(q => ({ id: q.siteId + ':' + q.modality + ':' + q.field, texto: q.prompt, valor: q.priority, motivo: q.reason })),
    equipos,
  };
}

function pin(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  const x = 0.14 + ((hash >>> 0) % 720) / 1000;
  const y = 0.16 + (((hash >>> 8) % 680) / 1000);
  return { x, y };
}

export function toGeo(sites: readonly Site[], now: string): CibGeo {
  const byCountry = new Map<string, Site[]>();
  for (const site of sites) {
    const list = byCountry.get(site.country) ?? [];
    list.push(site);
    byCountry.set(site.country, list);
  }
  const paises = [...byCountry.entries()].map(([country, countrySites]) => {
    const byCity = new Map<string, Site[]>();
    for (const site of countrySites) {
      const list = byCity.get(site.city) ?? [];
      list.push(site);
      byCity.set(site.city, list);
    }
    const ciudades = [...byCity.entries()].map(([city, citySites]) => {
      const hospitales = citySites.map(site => {
        const c = toCliente(site, now);
        return { id: site.id, nombre: site.name, confianza: c.confianza, equipos: site.facts.reduce((n, f) => n + totalQuantity(f), 0), ...pin(site.id) };
      });
      const confianza = Math.round(hospitales.reduce((n, h) => n + h.confianza, 0) / hospitales.length);
      const equipos = hospitales.reduce((n, h) => n + h.equipos, 0);
      return { id: slug(country + '-' + city), nombre: city, confianza, clientes: hospitales.length, equipos, hospitales };
    });
    const confianza = Math.round(ciudades.reduce((n, c) => n + c.confianza, 0) / ciudades.length);
    const equipos = ciudades.reduce((n, c) => n + c.equipos, 0);
    return { id: slug(country), nombre: country, confianza, clientes: countrySites.length, equipos, ciudades };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const confianza = paises.length ? Math.round(paises.reduce((n, p) => n + p.confianza, 0) / paises.length) : 0;
  return { region: REGION, confianza, paises };
}

export function toResumen(sites: readonly Site[], now: string, pais?: string): CibResumen {
  const scoped = pais ? sites.filter(s => norm(s.country) === norm(pais)) : sites;
  const clientes = scoped.map(s => toCliente(s, now));
  const equipos = scoped.reduce((n, s) => n + s.facts.reduce((m, f) => m + totalQuantity(f), 0), 0);
  const confianzaMedia = clientes.length ? Math.round(clientes.reduce((n, c) => n + c.confianza, 0) / clientes.length) : 0;
  const oportunidades: CibOportunidad[] = [
    ...findRefreshOpportunities(scoped, 10).slice(0, 8).map(o => ({
      id: o.siteId + ':' + o.modality, cliente: o.siteName,
      motivo: o.modality + ' de ' + o.approxAgeYears + ' años en ' + o.city,
      prioridad: o.approxAgeYears >= 13 ? 'alta' as const : 'media' as const,
    })),
    ...scoped.filter(s => explainCertainty(s, now).percent < 40).slice(0, 4).map(s => ({
      id: s.id + ':visitar', cliente: s.name, motivo: 'Confianza baja: faltan datos por confirmar', prioridad: 'visitar' as const,
    })),
  ];
  return {
    region: REGION, pais: pais || 'Todos', clientes: scoped.length, equipos, confianzaMedia,
    sinVerificar: staleSites(scoped, now, 365).length, oportunidades,
  };
}

export function summarizeCandidate(c: ObservationCandidate) {
  const bits = [
    c.quantity !== null ? c.quantity + (c.quantityApproximate ? ' (aprox.)' : '') + ' × ' + c.modality : c.modality,
    c.brand, c.model,
    c.ageYears !== null ? (c.ageApproximate ? 'aprox. ' : '') + c.ageYears + ' años' : c.ageDescription,
  ].filter(Boolean);
  return bits.join(', ');
}

export function suggestedStatus(c: ObservationCandidate) {
  if (c.unknownFields.length) return 'Unknown';
  if (c.quantityApproximate || c.ageApproximate) return 'Estimated';
  return 'Reported';
}

export function toObservacion(draft: VisitDraft): CibObservacion {
  const conflictos = [
    ...(draft.identityWarning ? [{ campo: 'hospital', mensaje: draft.identityWarning }] : []),
    ...draft.extraction.candidates.flatMap((c, i, all) => {
      const other = all.find((x, n) => n > i && x.modality === c.modality && x.quantity !== null && c.quantity !== null && x.quantity !== c.quantity);
      return other ? [{ campo: c.modality, mensaje: 'El dictado menciona cantidades distintas de ' + c.modality + ': ' + c.quantity + ' y ' + other.quantity + '.' }] : [];
    }),
  ];
  return {
    observacionId: draft.id, clienteId: draft.site.id, cliente: draft.site.name, ciudad: draft.site.city, pais: draft.site.country,
    textoOriginal: draft.transcript,
    confianza: draft.baseRevision ? explainCertainty(draft.site, draft.createdAt).percent : null,
    timings: draft.timings,
    items: draft.extraction.candidates.map((c, i) => ({
      id: itemId(draft.id, i), resumen: summarizeCandidate(c), estadoSugerido: suggestedStatus(c), evidencia: c.evidence,
      campos: { modalidad: c.modality, cantidad: c.quantity, marca: c.brand, modelo: c.model, edad: c.ageYears },
    })),
    conflictos,
  };
}

export function applyRespuestas(draft: VisitDraft, respuestas: Record<string, CibRespuesta>): ObservationCandidate[] {
  return draft.extraction.candidates.flatMap((c, i) => {
    const answer = respuestas[itemId(draft.id, i)];
    if (answer !== 'si' && answer !== 'nose') return [];
    if (answer === 'si') return [c];
    const unknown = (['quantity', 'brand', 'model', 'ageYears'] as const).filter(field => c[field] !== null || c.unknownFields.includes(field));
    return [{ ...c, quantity: null, brand: null, model: null, ageYears: null, ageDescription: null, unknownFields: unknown }];
  });
}

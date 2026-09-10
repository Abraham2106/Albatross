import { KNOWN_BRANDS, UNKNOWN } from '../domain/vocabulary';
import type { Site } from '../domain/types';
import type { QueryFilter, QueryOptions } from './ports/inference-engine';
import { known } from './cib';

export interface CibGrupoConsulta { id: string; modalidad: string; cantidad: number | null; marca: string | null; modelo: string | null; edad: number | null; estado: string }
export interface CibHospitalConsulta { id: string; nombre: string; ciudad: string; pais: string; equipos: number; grupos: CibGrupoConsulta[] }
export interface CibConsulta { hospitales: CibHospitalConsulta[]; totalHospitales: number; totalEquipos: number; sinEdad: number }

const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es'));

export function queryOptions(sites: readonly Site[]): QueryOptions {
  const brands = [...KNOWN_BRANDS, ...sites.flatMap(s => s.facts.flatMap(f => f.groups.map(g => g.brand)))];
  return { countries: sorted(sites.map(s => s.country)), cities: sorted(sites.map(s => s.city)), brands: sorted(brands.filter(b => b && b !== UNKNOWN)) };
}

function ageFits(age: number, f: QueryFilter) {
  return (f.olderThanYears === null || age > f.olderThanYears)
    && (f.youngerThanYears === null || age < f.youngerThanYears)
    && (f.ageWord !== 'old' || age >= 10)
    && (f.ageWord !== 'new' || age < 5);
}

export function applyQuery(sites: readonly Site[], f: QueryFilter): CibConsulta {
  const byAge = f.olderThanYears !== null || f.youngerThanYears !== null || f.ageWord !== null;
  const byGroup = byAge || f.modalities.length > 0 || f.brands.length > 0 || f.statuses.length > 0 || f.model !== null || f.minQuantity !== null;
  const model = f.model?.toLocaleLowerCase();
  let sinEdad = 0;
  const hospitales: CibHospitalConsulta[] = [];
  for (const site of sites) {
    if (f.countries.length && !f.countries.includes(site.country)) continue;
    if (f.cities.length && !f.cities.includes(site.city)) continue;
    const grupos: CibGrupoConsulta[] = [];
    for (const fact of site.facts) for (const g of fact.groups) {
      if (f.modalities.length && !f.modalities.includes(fact.modality)) continue;
      if (f.brands.length && !f.brands.includes(g.brand)) continue;
      if (model && !g.model.toLocaleLowerCase().includes(model)) continue;
      if (f.statuses.length && !f.statuses.includes(g.status)) continue;
      if (byAge && g.approxAgeYears === undefined) { sinEdad++; continue; }
      if (byAge && !ageFits(g.approxAgeYears!, f)) continue;
      grupos.push({ id: g.groupId, modalidad: fact.modality, cantidad: g.quantity ?? null, marca: known(g.brand), modelo: known(g.model), edad: g.approxAgeYears ?? null, estado: g.status });
    }
    const equipos = grupos.reduce((n, g) => n + (g.cantidad ?? 0), 0);
    if (byGroup && !grupos.length) continue;
    if (f.minQuantity !== null && equipos < f.minQuantity) continue;
    hospitales.push({ id: site.id, nombre: site.name, ciudad: site.city, pais: site.country, equipos, grupos });
  }
  hospitales.sort((a, b) => b.equipos - a.equipos || a.nombre.localeCompare(b.nombre, 'es'));
  return { hospitales, totalHospitales: hospitales.length, totalEquipos: hospitales.reduce((n, h) => n + h.equipos, 0), sinEdad };
}

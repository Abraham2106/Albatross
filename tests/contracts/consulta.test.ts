import { describe, expect, it, vi } from 'vitest';
import { buildSeedSites, createSite, mergeAll } from '../../src/domain';
import { applyQuery, queryOptions } from '../../src/application/consulta';
import { validateQueryFilter } from '../../src/application/validation';
import { toDomainCandidate, VisitService } from '../../src/application/visits';
import { CibService } from '../../src/application/cib-service';
import { SqliteVisitRepository } from '../../src/adapters/persistence/visit-repository';
import { candidate, fakeEngine, testProvenance } from '../helpers/inference';
import type { InferenceEngine, QueryFilter } from '../../src/application/ports/inference-engine';

const sites = buildSeedSites();
const none: QueryFilter = { countries: [], cities: [], modalities: [], brands: [], model: null, olderThanYears: null, youngerThanYears: null, ageWord: null, minQuantity: null, statuses: [] };
const q = (f: Partial<QueryFilter>) => applyQuery(sites, { ...none, ...f });

describe('query filter over the sponsor sample', () => {
  it('answers the brief example: Brazil, MR older than seven years', () => {
    const r = q({ countries: ['Brazil'], modalities: ['MR'], olderThanYears: 7 });
    expect(r.hospitales.map(h => h.nombre)).toEqual(['Hospital DemoCare Horizon']);
    expect(r.hospitales[0].grupos).toMatchObject([{ modalidad: 'MR', cantidad: 3, edad: 9 }]);
    expect(r.totalEquipos).toBe(3);
  });
  it('finds CT older than ten years, most equipment first', () => {
    const r = q({ modalities: ['CT'], olderThanYears: 10 });
    expect(r.hospitales.map(h => h.nombre)).toEqual(['Clinica DemoCare Light', 'Instituto DemoCare Lima', 'Clinica DemoCare Andes']);
    expect(r).toMatchObject({ totalHospitales: 3, totalEquipos: 5, sinEdad: 0 });
  });
  it('maps old to ten years or more and new to under five', () => {
    expect(q({ ageWord: 'old', modalities: ['CT'] }).totalEquipos).toBe(5);
    const nuevos = q({ ageWord: 'new' }).hospitales.flatMap(h => h.grupos);
    expect(nuevos.length).toBeGreaterThan(0);
    expect(nuevos.every(g => g.edad! < 5)).toBe(true);
  });
  it('counts groups left out only because their age is unknown', () => {
    const base = createSite({ id: 's1', name: 'Hospital DemoCare Green', city: 'San Jose', country: 'Costa Rica' });
    const site = mergeAll(base, [toDomainCandidate(candidate('CT', 2, 'dos CT'), 's1', 'Ana', '2026-09-09T12:00:00.000Z', 'Manual')]);
    expect(applyQuery([site], { ...none, olderThanYears: 5 })).toMatchObject({ totalHospitales: 0, sinEdad: 1 });
  });
  it('applies minimum quantity to the matching equipment of each hospital', () => {
    expect(q({ modalities: ['Ultrasound'], minQuantity: 6 }).hospitales.map(h => h.nombre)).toEqual(['Clinica DemoCare Central', 'Hospital DemoCare North']);
  });
  it('filters by place and keeps every group when no equipment filter is given', () => {
    const chile = q({ countries: ['Chile'] });
    expect(chile.hospitales).toHaveLength(1);
    expect(chile.hospitales[0].grupos.map(g => g.modalidad).sort()).toEqual(['CT', 'MR']);
    expect(q({ cities: ['Campinas'] }).hospitales[0].nombre).toBe('Clinica DemoCare Light');
  });
  it('filters by brand, model and status', () => {
    expect(q({ brands: ['Aurelia Health'], countries: ['Mexico'] }).hospitales.map(h => h.nombre)).toEqual(['Centro Medico DemoCare Valley']);
    expect(q({ model: 'oi-ct' }).totalEquipos).toBe(4);
    const status = sites[0].facts[0].groups[0].status;
    expect(q({ statuses: [status] }).hospitales.flatMap(h => h.grupos).every(g => g.estado === status)).toBe(true);
  });
  it('derives the allowed values from the saved sites', () => {
    const o = queryOptions(sites);
    expect(o.countries).toContain('Brazil');
    expect(o.cities).toContain('Sao Paulo');
    expect(o.brands).toEqual(expect.arrayContaining(['NovaMed', 'Zenith MedTech']));
    expect(o.brands).not.toContain('Unknown');
  });
});

describe('query filter validation', () => {
  const options = queryOptions(sites);
  const valid = { ...none, countries: ['Brazil'], modalities: ['MR'], olderThanYears: 7 };
  it('accepts a filter within the saved values', () => {
    expect(validateQueryFilter(valid, options)).toEqual(valid);
  });
  it.each([
    ['an extra key', { ...valid, hospital: 'x' }],
    ['a country not in the base', { ...valid, countries: ['Brasil'] }],
    ['an unknown status', { ...valid, statuses: ['Old'] }],
    ['an empty age range', { ...valid, olderThanYears: 10, youngerThanYears: 5 }],
    ['an age out of range', { ...valid, olderThanYears: 150 }],
    ['no constraint at all', none],
  ])('rejects %s', (_label, value) => {
    expect(() => validateQueryFilter(value, options)).toThrow();
  });
});

describe('CibService.consultar', () => {
  const brief: QueryFilter = { ...none, countries: ['Brazil'], modalities: ['MR'], olderThanYears: 7 };
  function setup() {
    const interpretQuery = vi.fn<InferenceEngine['interpretQuery']>(async () => ({ data: brief, provenance: testProvenance }));
    const repo = new SqliteVisitRepository(':memory:');
    const visits = new VisitService(fakeEngine({ interpretQuery }), repo, () => 'id');
    return { cib: new CibService(visits), visits, repo, interpretQuery };
  }
  it('asks the model once for a question and never for an edited filter', async () => {
    const { cib, visits, repo, interpretQuery } = setup();
    visits.loadSample();
    const byQuestion = await cib.consultar({ pregunta: 'clientes en Brasil con resonadores de más de siete años' });
    expect(byQuestion).toMatchObject({ totalHospitales: 1, totalEquipos: 3 });
    const byFilter = await cib.consultar({ filtro: { ...byQuestion.filtro, olderThanYears: null } });
    expect(byFilter.totalEquipos).toBe(4);
    expect(interpretQuery).toHaveBeenCalledOnce();
    repo.close();
  });
  it('refuses to query an empty base', async () => {
    const { cib, repo } = setup();
    await expect(cib.consultar({ pregunta: 'hola' })).rejects.toThrow('Todavía no hay hospitales');
    repo.close();
  });
});
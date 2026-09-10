import { describe, expect, it } from 'vitest';
import { createSite, mergeAll } from '../../src/domain';
import { applyRespuestas, itemId, resolveHospital, toCliente, toFicha, toGeo, toObservacion, toResumen } from '../../src/application/cib';
import { toDomainCandidate } from '../../src/application/visits';
import { candidate } from '../helpers/inference';
import type { VisitDraft } from '../../src/application/ports/visit-repository';

const now = '2026-09-09T12:00:00.000Z';
const emptyMention = { name: null, country: null, city: null, evidence: null };

function siteWithCt() {
  const base = createSite({ id: 's1', name: 'Hospital A', city: 'San José', country: 'Costa Rica' });
  return mergeAll(base, [toDomainCandidate(candidate('CT', 2, 'dos CT'), 's1', 'Ana', now, 'Manual')]);
}

function draft(overrides: Partial<VisitDraft> = {}): VisitDraft {
  const candidates = [candidate('CT', 2, 'dos CT'), candidate('MR', 4, 'cuatro MR')];
  return {
    id: 'd1', site: createSite({ id: 's1', name: 'Hospital A', city: 'San José', country: 'Costa Rica' }),
    baseRevision: 0, transcript: 'Vi dos CT y cuatro MR.',
    extraction: { hospitalId: 's1', mentionedHospital: emptyMention, candidates },
    provenance: { execution: 'local', model: 'test' }, createdAt: now, source: 'Manual', status: 'pending',
    ...overrides,
  };
}

describe('CIB contract projection', () => {
  it('maps a site to the hospital list and ficha', () => {
    const site = siteWithCt();
    const cliente = toCliente(site, now);
    expect(cliente).toMatchObject({ id: 's1', nombre: 'Hospital A', ciudad: 'San José', pais: 'Costa Rica' });
    expect(cliente.pendientes).toBeGreaterThan(0);
    const ficha = toFicha(site, now);
    expect(ficha.equipos[0]).toMatchObject({ modalidad: 'CT', cantidad: 2, estado: 'Reported' });
    expect(ficha.pendientes[0]).toEqual(expect.objectContaining({ texto: expect.any(String), motivo: expect.any(String) }));
  });
  it('builds geo and resumen from saved sites', () => {
    const sites = [siteWithCt()];
    const geo = toGeo(sites, now);
    expect(geo.region).toBe('Latinoamérica');
    expect(geo.paises[0]).toMatchObject({ nombre: 'Costa Rica', clientes: 1, equipos: 2 });
    expect(geo.paises[0].ciudades[0].hospitales[0]).toEqual(expect.objectContaining({ id: 's1', x: expect.any(Number), y: expect.any(Number) }));
    const resumen = toResumen(sites, now);
    expect(resumen).toMatchObject({ pais: 'Todos', clientes: 1, equipos: 2 });
  });
  it('turns a draft into confirmation cards and applies si/no/nose', () => {
    const value = draft();
    const obs = toObservacion(value);
    expect(obs.items).toHaveLength(2);
    expect(obs.items[0].resumen).toContain('CT');
    expect(obs.items.map(i => i.evidencia)).toEqual(['dos CT', 'cuatro MR']);
    expect(obs).toMatchObject({ ciudad: 'San José', pais: 'Costa Rica', confianza: null });
    expect(toObservacion(draft({ site: siteWithCt(), baseRevision: 1 })).confianza).toBe(toCliente(siteWithCt(), now).confianza);
    const kept = applyRespuestas(value, { [itemId('d1', 0)]: 'si', [itemId('d1', 1)]: 'no' });
    expect(kept).toHaveLength(1);
    expect(kept[0].modality).toBe('CT');
    const unknown = applyRespuestas(value, { [itemId('d1', 0)]: 'nose' });
    expect(unknown[0].quantity).toBeNull();
    expect(unknown[0].unknownFields).toContain('quantity');
  });
  it('resolves a complete mention to an existing site', () => {
    const sites = [createSite({ id: 's1', name: 'Hospital A', city: 'San José', country: 'Costa Rica' })];
    const resolved = resolveHospital({ name: 'hospital a', city: 'San José', country: 'Costa Rica', evidence: 'x' }, sites);
    expect(resolved.hospital.id).toBe('s1');
    expect(resolved.identityWarning).toBeUndefined();
    const missing = resolveHospital(emptyMention, sites);
    expect(missing.hospital.name).toBe('Hospital por identificar');
    expect(missing.identityWarning).toMatch(/provisional/);
  });
});

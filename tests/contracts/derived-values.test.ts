import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSite, deriveConfidence, deriveStatus, mergeAll } from '../../src/domain';
import type { Candidate, SourceChannel } from '../../src/domain/types';
import { EXTRACTION_SCHEMA } from '../../src/adapters/inference/qvac/schema';

const fixture = JSON.parse(readFileSync(new URL('../../fixtures/voice-tests.json', import.meta.url), 'utf8'));
const own = (id: string) => fixture.casos_propios.casos.find((c: { id: string }) => c.id === id);
const site = (name: string) => createSite({ id: 'site', name, city: 'Panama', country: 'Panama' });
type Input = Partial<Candidate> & { modality: string; channel: SourceChannel; author?: string; timestamp?: string };
const candidate = ({ channel, author, timestamp, ...c }: Input): Candidate => ({
  siteId: 'site', extractedAge: true, ...c,
  source: { author: author ?? 'Sales User 01', timestamp: timestamp ?? '2026-09-10T09:00:00.000Z', channel },
});

describe('own fixture cases cover the derived values the Philips seeds never produce', () => {
  it('A1: two observers on the same modality and customer confirm the group', () => {
    const c = own('A1');
    for (const lang of ['en', 'es'] as const) {
      const merged = mergeAll(site(c.cliente), c.observaciones.map((o: Record<string, string | number>) => candidate({
        modality: c.modalidad, quantity: Number(o.cantidad), rawAnswerText: String(o[lang]),
        channel: o.canal as SourceChannel, author: String(o.autor), timestamp: String(o.fecha),
      })));
      const fact = merged.facts[0]!, group = fact.groups[0]!;
      expect(group.status).toBe(c.expected.status);
      expect(group.confidence).toBe(c.expected.confidence);
      expect(new Set([...group.observations, ...fact.totalObservations].map(o => o.author)).size).toBe(c.expected.observadores);
    }
  });
  it('A2: a required field still missing after the follow-up is Unknown / Low', () => {
    const c = own('A2');
    for (const lang of ['en', 'es'] as const) {
      expect(deriveStatus(c.canal, c.respuesta[lang])).toBe(c.expected.status);
      expect(deriveConfidence(c.respuesta[lang])).toBe(c.expected.confidence);
      const group = mergeAll(site(c.cliente), [candidate({ modality: c.modalidad, rawAnswerText: c.respuesta[lang], channel: c.canal })]).facts[0]!.groups[0]!;
      expect(group.status).toBe(c.expected.status);
      expect(group.confidence).toBe(c.expected.confidence);
      expect(group.quantity).toBeUndefined();
    }
  });
  it('A3: modality and quantity alone derive Low without inventing brand, model or year', () => {
    const c = own('A3');
    const group = mergeAll(site(c.cliente), [candidate({ modality: c.modalidad, quantity: c.cantidad, channel: c.canal })]).facts[0]!.groups[0]!;
    expect(group.confidence).toBe(c.expected.confidence);
    expect(group.status).toBe(c.expected.status);
    expect(group.brand).toBe(c.expected.marca);
    expect(group.model).toBe(c.expected.modelo);
    expect(group.estimatedInstallYear).toBeUndefined();
  });
  it('A4: a manual entry keeps its non-Voice source and derives Reported / High', () => {
    const c = own('A4');
    for (const lang of ['en', 'es'] as const) {
      const group = mergeAll(site(c.cliente), [candidate({ modality: c.modalidad, quantity: c.cantidad, rawAnswerText: c[lang], channel: c.canal })]).facts[0]!.groups[0]!;
      expect(group.observations[0]!.channel).toBe(c.expected.source);
      expect(group.status).toBe(c.expected.status);
      expect(group.confidence).toBe(c.expected.confidence);
    }
  });
  it('Philips cases plus own cases reach all four Status and all three Confidence values', () => {
    const answers: string[] = [...fixture.casos.map((c: { en: string }) => c.en), own('A2').respuesta.en, own('A4').en];
    const statuses = new Set([...answers.map(a => deriveStatus('Voice', a)), 'Confirmed']);
    const confidences = new Set([...answers.map(a => deriveConfidence(a)), deriveConfidence(undefined)]);
    expect([...statuses].sort()).toEqual(['Confirmed', 'Estimated', 'Reported', 'Unknown']);
    expect([...confidences].sort()).toEqual(['High', 'Low', 'Medium']);
  });
  it('the schema imposed on the model carries no derived field', () => {
    const keys = JSON.stringify(EXTRACTION_SCHEMA).toLowerCase();
    for (const derived of ['status', 'confidence', 'installyear', 'installationyear', 'author', 'source']) expect(keys).not.toContain(derived);
  });
});

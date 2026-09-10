import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteVisitRepository } from '../../src/adapters/persistence/visit-repository';
import { VisitService } from '../../src/application/visits';
import type { VisitDraft } from '../../src/application/ports/visit-repository';
import type { InferenceEngine } from '../../src/application/ports/inference-engine';
import { pcmToWav } from '../../src/application/audio';
import { TEST_TRANSCRIPT, candidate, emptyMention, fakeEngine, testProvenance } from '../helpers/inference';

const now = '2026-09-09T12:00:00.000Z';
const hospital = { name: 'Hospital A', country: 'Costa Rica', city: 'San José' };
const resources: Array<() => void> = [];
afterEach(() => { resources.splice(0).reverse().forEach(close => close()); });
function setup(filename = ':memory:', engine: InferenceEngine = fakeEngine()) {
  const repo = new SqliteVisitRepository(filename); resources.push(() => repo.close());
  let serial = 0;
  return { repo, service: new VisitService(engine, repo, () => 'id-' + ++serial, () => now) };
}
function review(draft: VisitDraft) { return { draftId: draft.id, author: 'Ana', visitedAt: now, candidates: draft.extraction.candidates, identityAcknowledged: true }; }
describe('dictation, human review and local persistence', () => {
  it('persists separate transcription and extraction timings for the review', async () => {
    const base = fakeEngine();
    const transcription = { loadMs: 1, inferMs: 1250, totalMs: 1251, coldStart: false };
    const extraction = { loadMs: 300, inferMs: 2700, totalMs: 3000, coldStart: true };
    const engine = fakeEngine({
      async transcribe(input, options) { return { ...await base.transcribe(input, options), timing: transcription }; },
      async extractObservations(input, options) { return { ...await base.extractObservations(input, options), timing: extraction }; },
    });
    const { service, repo } = setup(':memory:', engine);
    const draft = await service.processFree({ audio: { audio: pcmToWav(new Float32Array(16000), 16000), mimeType: 'audio/wav' } });
    expect(repo.getDraft(draft.id)?.timings).toEqual({ transcription, extraction });
    const { toObservacion } = await import('../../src/application/cib');
    expect(toObservacion(draft).timings).toEqual({ transcription, extraction });
    const typed = await service.processFree({ transcript: TEST_TRANSCRIPT });
    expect(typed.timings?.transcription).toBeUndefined();
    expect(typed.timings?.extraction).toEqual(extraction);
  });
  it('saves a recoverable draft, commits reviewed edits and is idempotent', async () => {
    const { repo, service } = setup();
    const draft = await service.process({ hospital, audio: { audio: pcmToWav(new Float32Array(100), 16000), mimeType: 'audio/wav' } });
    expect(service.list().sites).toHaveLength(0);
    expect(service.list().drafts).toHaveLength(1);
    expect(draft.transcriptionProvenance?.execution).toBe('local');
    const input = review(draft);
    const candidates = input.candidates.map((c, i) => i === 0 ? { ...c, quantity: 5 } : c);
    const result = service.accept({ ...input, candidates });
    expect(result.site.facts[0].groups[0].quantity).toBe(5);
    expect(result.site.facts[0].groups[0].status).toBe('Reported');
    expect(result.questions.length).toBeGreaterThan(0);
    expect(repo.getSite(draft.site.id)?.revision).toBe(1);
    service.accept(input);
    expect(repo.getSite(draft.site.id)?.revision).toBe(1);
    expect(service.list().drafts).toHaveLength(0);
  });
  it('loads the sponsor sample only into an empty base, outside the integrity chain', async () => {
    const { repo, service } = setup();
    expect(service.loadSample()).toBe(13);
    expect(service.loadSample()).toBe(0);
    expect(service.list().sites).toHaveLength(13);
    expect(service.verifyIntegrity()).toMatchObject({ ok: true, entries: 0 });
    const park = { id: 'hospital-democare-park', name: 'Hospital DemoCare Park', country: 'Argentina', city: 'Buenos Aires' };
    service.accept(review(await service.process({ hospital: park, transcript: TEST_TRANSCRIPT })));
    expect(repo.getSite(park.id)?.revision).toBe(2);
    const other = setup();
    other.service.accept(review(await other.service.process({ hospital, transcript: TEST_TRANSCRIPT })));
    expect(other.service.loadSample()).toBe(0);
  });
  it('keeps data after reopening SQLite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'philips-test-')); resources.push(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, 'visits.sqlite');
    const { service } = setup(file);
    const draft = await service.process({ hospital, transcript: TEST_TRANSCRIPT });
    service.accept(review(draft));
    const reopened = new SqliteVisitRepository(file); resources.push(() => reopened.close());
    expect(reopened.listSites()).toHaveLength(1);
    expect(reopened.getDraft(draft.id)?.status).toBe('accepted');
  });
  it('rejects stale drafts and leaves the pending draft intact', async () => {
    const { repo, service } = setup();
    const first = await service.process({ hospital, transcript: TEST_TRANSCRIPT });
    service.accept(review(first));
    const selected = { ...hospital, id: first.site.id };
    const a = await service.process({ hospital: selected, transcript: first.transcript });
    const b = await service.process({ hospital: selected, transcript: first.transcript });
    service.accept(review(a));
    expect(() => service.accept(review(b))).toThrow('perfil cambió');
    expect(repo.getDraft(b.id)?.status).toBe('pending');
    expect(repo.getSite(first.site.id)?.revision).toBe(2);
  });
  it('rejects invalid reviews without persisting a hospital', async () => {
    const { service } = setup();
    const draft = await service.process({ hospital, transcript: TEST_TRANSCRIPT });
    expect(() => service.accept({ ...review(draft), candidates: [{ ...draft.extraction.candidates[0], quantity: -1 }] })).toThrow();
    expect(() => service.accept({ ...review(draft), author: '' })).toThrow();
    expect(() => service.accept({ ...review(draft), visitedAt: '2100-01-01' })).toThrow();
    expect(service.list().sites).toHaveLength(0);
  });
  it('cancelled processing never creates a draft', async () => {
    const controller = new AbortController();
    const base = fakeEngine();
    const engine: InferenceEngine = {
      ...base,
      async extractObservations(input) { const result = await base.extractObservations(input); controller.abort(); return result; },
    };
    const { service } = setup(':memory:', engine);
    await expect(service.process({ hospital, transcript: TEST_TRANSCRIPT }, { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(service.list().drafts).toHaveLength(0);
  });
  it('preserves qualitative groups and asks for unknown counts instead of assuming absence', async () => {
    const quote = 'Vi dos MR viejos y uno nuevo. No sé cuántos CT.';
    const candidates = [
      { ...candidate('MR', 2, 'dos MR viejos'), scope: 'group' as const, ageDescription: 'viejos' },
      { ...candidate('MR', 1, 'uno nuevo'), scope: 'group' as const, ageDescription: 'nuevo' },
      { ...candidate('CT', null, 'No sé cuántos CT'), unknownFields: ['quantity' as const] },
    ];
    const { service } = setup(':memory:', fakeEngine({
      async extractObservations(input) { return { data: { hospitalId: input.hospitalId, mentionedHospital: emptyMention, candidates }, provenance: testProvenance }; },
    }));
    const draft = await service.process({ hospital, transcript: quote });
    const result = service.accept(review(draft));
    const mr = result.site.facts.find(f => f.modality === 'MR')!;
    expect(mr.groups.map(g => g.quantity)).toEqual([2, 1]);
    expect(mr.groups.every(g => g.approxAgeYears === undefined)).toBe(true);
    expect(result.site.facts.find(f => f.modality === 'CT')?.groups[0].quantity).toBeUndefined();
    expect(result.questions.some(q => q.modality === 'CT' && q.field === 'quantity')).toBe(true);
  });
  it('requires acknowledgment when the dictation names a different hospital', async () => {
    const quote = 'En Hospital B de Panamá vi dos CT.';
    const { service } = setup(':memory:', fakeEngine({
      async extractObservations(input) {
        return { data: { hospitalId: input.hospitalId, mentionedHospital: { name: 'Hospital B', country: 'Panamá', city: null, evidence: 'Hospital B de Panamá' }, candidates: [candidate('CT', 2, 'dos CT')] }, provenance: testProvenance };
      },
    }));
    const draft = await service.process({ hospital, transcript: quote });
    expect(draft.identityWarning).toMatch(/name|country/);
    expect(() => service.accept({ ...review(draft), identityAcknowledged: false })).toThrow('hospital de destino');
    expect(service.list().sites).toHaveLength(0);
    const saved = service.accept(review(draft));
    expect(saved.site.name).toBe(hospital.name);
    expect(saved.site.facts[0].groups[0].status).toBe('Reported');
  });
  it('bootstraps a hospital from free text and confirms cards', async () => {
    const { service } = setup();
    const draft = await service.processFree({ transcript: TEST_TRANSCRIPT });
    expect(draft.site.name).toBe('Hospital por identificar');
    expect(draft.identityWarning).toMatch(/provisional/);
    const profile = service.confirmCards(draft.id, { [draft.id + ':0']: 'si', [draft.id + ':1']: 'no' });
    expect(profile.site.facts.map(f => f.modality)).toEqual(['CT']);
    expect(service.list().sites).toHaveLength(1);
  });
  it('measures whisper speed without writing a draft', async () => {
    const engine = fakeEngine({
      async transcribe(input) {
        await new Promise(resolve => setTimeout(resolve, 30));
        return fakeEngine().transcribe(input);
      },
    });
    const { service } = setup(':memory:', engine);
    const audio = pcmToWav(new Float32Array(16000), 16000);
    const result = await service.transcribeAudio({ audio, mimeType: 'audio/wav' });
    expect(result.text).toBe(TEST_TRANSCRIPT);
    expect(result.audioMs).toBe(1000);
    expect(result.xRealtime).toBeGreaterThan(1);
    expect(result.words).toBeGreaterThan(0);
    expect(service.list().drafts).toHaveLength(0);
    expect(service.list().sites).toHaveLength(0);
  });
});

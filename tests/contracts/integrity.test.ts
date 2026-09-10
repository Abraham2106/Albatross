import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalize, GENESIS_HASH, linkHash, nextEntry, verifyChain, type ChainEntry } from '../../src/application/integrity';
import { SqliteVisitRepository } from '../../src/adapters/persistence/visit-repository';
import { createSite } from '../../src/domain';
import type { AcceptedVisit, VisitDraft } from '../../src/application/ports/visit-repository';

// --------------------------------------------------------------- unidad pura

describe('canonicalización', () => {
  it('ordena las claves para que el mismo dato produzca el mismo hash', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
  it('ordena en profundidad, no solo en el primer nivel', () => {
    expect(canonicalize({ x: { z: 1, y: 2 } })).toBe(canonicalize({ x: { y: 2, z: 1 } }));
  });
  it('respeta el orden de los arreglos, que sí es significativo', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });
  it('descarta undefined en vez de emitir JSON inválido', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('cadena de hashes', () => {
  function build(values: readonly unknown[]): ChainEntry[] {
    const entries: ChainEntry[] = [];
    let head: { index: number; hash: string } | undefined;
    for (const value of values) {
      const entry = nextEntry(head, value);
      entries.push(entry);
      head = { index: entry.index, hash: entry.hash };
    }
    return entries;
  }

  it('el primer eslabón cuelga del génesis', () => {
    const [first] = build([{ a: 1 }]);
    expect(first!.index).toBe(0);
    expect(first!.previousHash).toBe(GENESIS_HASH);
  });

  it('una cadena intacta se verifica y expone su cabeza', () => {
    const entries = build([{ a: 1 }, { b: 2 }, { c: 3 }]);
    const verdict = verifyChain(entries);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.entries).toBe(3);
      expect(verdict.headHash).toBe(entries[2]!.hash);
    }
  });

  it('la cadena vacía es válida', () => {
    expect(verifyChain([]).ok).toBe(true);
  });

  it('detecta contenido alterado en el eslabón exacto', () => {
    const entries = build([{ a: 1 }, { b: 2 }, { c: 3 }]);
    entries[1] = { ...entries[1]!, payload: canonicalize({ b: 999 }) };
    const verdict = verifyChain(entries);
    expect(verdict).toMatchObject({ ok: false, brokenAt: 1, reason: 'content-altered' });
  });

  it('detecta un eslabón eliminado', () => {
    const entries = build([{ a: 1 }, { b: 2 }, { c: 3 }]);
    const verdict = verifyChain([entries[0]!, entries[2]!]);
    expect(verdict).toMatchObject({ ok: false, reason: 'index-gap' });
  });

  it('detecta un enlace reapuntado aunque el contenido sea coherente', () => {
    const entries = build([{ a: 1 }, { b: 2 }]);
    const forged = { ...entries[1]!, previousHash: GENESIS_HASH };
    const verdict = verifyChain([entries[0]!, { ...forged, hash: linkHash(forged.index, forged.previousHash, forged.payload) }]);
    expect(verdict).toMatchObject({ ok: false, brokenAt: 1, reason: 'broken-link' });
  });

  it('reescribir un dato obliga a recalcular todo lo posterior', () => {
    const entries = build([{ a: 1 }, { b: 2 }, { c: 3 }]);
    // El atacante recalcula bien su propio eslabón, pero el siguiente ya no cuadra.
    const tampered = nextEntry({ index: -1, hash: GENESIS_HASH }, { a: 666 });
    const verdict = verifyChain([{ ...tampered, index: 0, previousHash: GENESIS_HASH, hash: linkHash(0, GENESIS_HASH, tampered.payload) }, entries[1]!, entries[2]!]);
    expect(verdict).toMatchObject({ ok: false, brokenAt: 1, reason: 'broken-link' });
  });
});

// ------------------------------------------------- integración con el SQLite

describe('cadena de custodia sobre SQLite', () => {
  const dirs: string[] = [];
  function repo() {
    const dir = mkdtempSync(join(tmpdir(), 'cib-integrity-'));
    dirs.push(dir);
    const file = join(dir, 'test.sqlite');
    return { repository: new SqliteVisitRepository(file), file };
  }
  afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

  function draft(id: string, baseRevision = 0): VisitDraft {
    return {
      id, site: createSite({ id: 'h1', name: 'Hospital Alpha', city: 'São Paulo', country: 'Brazil' }),
      baseRevision, transcript: 'Vi dos CT.',
      extraction: { hospitalId: 'h1', mentionedHospital: { name: null, city: null, country: null, evidence: null }, candidates: [] },
      provenance: { execution: 'local', model: 'QWEN3_4B_INST_Q4_K_M' },
      createdAt: '2026-09-10T10:00:00.000Z', source: 'Voice', status: 'pending',
    };
  }
  function accepted(d: VisitDraft): AcceptedVisit {
    return {
      draftId: d.id, site: d.site, author: 'Field User 01',
      visitedAt: '2026-09-10T09:00:00.000Z', acceptedAt: '2026-09-10T10:05:00.000Z',
      reviewedCandidates: [], originalDraft: d,
    };
  }

  it('una base recién creada tiene una cadena válida y vacía', () => {
    const { repository } = repo();
    expect(repository.verifyIntegrity()).toMatchObject({ ok: true, entries: 0 });
    repository.close();
  });

  it('cada aceptación extiende la cadena', () => {
    const { repository } = repo();
    for (const [revision, id] of ['d1', 'd2', 'd3'].entries()) {
      const d = draft(id, revision);
      repository.saveDraft(d);
      repository.accept(accepted(d));
    }
    expect(repository.verifyIntegrity()).toMatchObject({ ok: true, entries: 3 });
    repository.close();
  });

  it('editar el archivo SQLite por fuera rompe la verificación', () => {
    const { repository, file } = repo();
    for (const [revision, id] of ['d1', 'd2'].entries()) {
      const d = draft(id, revision);
      repository.saveDraft(d);
      repository.accept(accepted(d));
    }
    repository.close();

    // Un atacante con acceso al archivo cambia el autor de la primera visita.
    const raw = new DatabaseSync(file);
    const row = raw.prepare('SELECT payload FROM accepted_visits WHERE chain_index = 0').get() as { payload: string };
    raw.prepare('UPDATE accepted_visits SET payload = ? WHERE chain_index = 0')
      .run(row.payload.replace('Field User 01', 'Otra Persona'));
    raw.close();

    const reopened = new SqliteVisitRepository(file);
    expect(reopened.verifyIntegrity()).toMatchObject({ ok: false, brokenAt: 0, reason: 'content-altered' });
    reopened.close();
  });

  it('borrar una observación aceptada también se detecta', () => {
    const { repository, file } = repo();
    for (const [revision, id] of ['d1', 'd2', 'd3'].entries()) {
      const d = draft(id, revision);
      repository.saveDraft(d);
      repository.accept(accepted(d));
    }
    repository.close();

    const raw = new DatabaseSync(file);
    raw.exec('DELETE FROM accepted_visits WHERE chain_index = 1');
    raw.close();

    const reopened = new SqliteVisitRepository(file);
    expect(reopened.verifyIntegrity()).toMatchObject({ ok: false, reason: 'index-gap' });
    reopened.close();
  });

  it('aceptar dos veces el mismo borrador no duplica eslabones', () => {
    const { repository } = repo();
    const d = draft('d1');
    repository.saveDraft(d);
    repository.accept(accepted(d));
    repository.accept(accepted(d));
    expect(repository.verifyIntegrity()).toMatchObject({ ok: true, entries: 1 });
    repository.close();
  });

  it('una base de la versión anterior migra sin romperse', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cib-legacy-'));
    dirs.push(dir);
    const file = join(dir, 'legacy.sqlite');
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE sites (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot TEXT NOT NULL);
      CREATE TABLE visit_drafts (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('pending','accepted')), payload TEXT NOT NULL);
      CREATE TABLE accepted_visits (draft_id TEXT PRIMARY KEY REFERENCES visit_drafts(id), site_id TEXT NOT NULL REFERENCES sites(id), payload TEXT NOT NULL);
      PRAGMA user_version = 1;
    `);
    legacy.close();

    const migrated = new SqliteVisitRepository(file);
    expect(migrated.verifyIntegrity()).toMatchObject({ ok: true, entries: 0 });
    const d = draft('d1');
    migrated.saveDraft(d);
    migrated.accept(accepted(d));
    expect(migrated.verifyIntegrity()).toMatchObject({ ok: true, entries: 1 });
    migrated.close();
  });
});
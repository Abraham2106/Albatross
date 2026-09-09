import { DatabaseSync } from 'node:sqlite';
import { InferenceError } from '../../application/ports/inference-engine';
import type { AcceptedVisit, VisitDraft, VisitRepository } from '../../application/ports/visit-repository';
import type { Site } from '../../domain/types';

/** Snapshots + immutable acceptance audit are committed in a single SQLite transaction. */
export class SqliteVisitRepository implements VisitRepository {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 1) { this.db.close(); throw new Error('Esta base requiere una versión más reciente de la aplicación.'); }
    if (version.user_version === 0) this.db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visit_drafts (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('pending','accepted')), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accepted_visits (draft_id TEXT PRIMARY KEY REFERENCES visit_drafts(id), site_id TEXT NOT NULL REFERENCES sites(id), payload TEXT NOT NULL);
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }
  listSites(): Site[] { return this.db.prepare('SELECT snapshot FROM sites ORDER BY id').all().map(row => JSON.parse(row.snapshot as string) as Site); }
  getSite(id: string) {
    const row = this.db.prepare('SELECT snapshot, revision FROM sites WHERE id = ?').get(id);
    return row ? { site: JSON.parse(row.snapshot as string) as Site, revision: Number(row.revision) } : undefined;
  }
  saveDraft(draft: VisitDraft) { this.db.prepare('INSERT INTO visit_drafts (id,status,payload) VALUES (?,?,?)').run(draft.id, 'pending', JSON.stringify(draft)); }
  getDraft(id: string): VisitDraft | undefined {
    const row = this.db.prepare('SELECT payload,status FROM visit_drafts WHERE id = ?').get(id);
    return row ? { ...JSON.parse(row.payload as string), status: row.status } : undefined;
  }
  listDrafts(): VisitDraft[] {
    return this.db.prepare("SELECT payload FROM visit_drafts WHERE status = 'pending' ORDER BY rowid DESC LIMIT 30").all().map(row => JSON.parse(row.payload as string));
  }
  accept(visit: AcceptedVisit): Site {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stored = this.getDraft(visit.draftId);
      if (!stored) throw new Error('Borrador no encontrado.');
      if (stored.status === 'accepted') {
        const existing = this.getSite(stored.site.id);
        if (!existing) throw new Error('Perfil no encontrado.');
        this.db.exec('COMMIT'); return existing.site;
      }
      const current = this.getSite(visit.site.id);
      if ((current?.revision ?? 0) !== stored.baseRevision) throw new InferenceError('CONFLICT', 'El perfil cambió; vuelve a revisar el dictado.');
      this.db.prepare('INSERT INTO sites(id,revision,snapshot) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot')
        .run(visit.site.id, stored.baseRevision + 1, JSON.stringify(visit.site));
      this.db.prepare('INSERT INTO accepted_visits(draft_id,site_id,payload) VALUES(?,?,?)').run(visit.draftId, visit.site.id, JSON.stringify(visit));
      this.db.prepare("UPDATE visit_drafts SET status='accepted' WHERE id=?").run(visit.draftId);
      this.db.exec('COMMIT'); return visit.site;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}

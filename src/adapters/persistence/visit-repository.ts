import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { InferenceError } from '../../application/ports/inference-engine';
import { nextEntry, verifyChain, type ChainEntry, type ChainVerdict } from '../../application/integrity';
import type { CaptureChunk, CaptureJob, CaptureReceipt, CaptureStore } from '../../application/ports/capture-store';
import type { AcceptedVisit, VisitDraft, VisitRepository } from '../../application/ports/visit-repository';
import type { Site } from '../../domain/types';

const SCHEMA_VERSION = 3;

/** Snapshots + immutable acceptance audit are committed in a single SQLite transaction. */
export class SqliteVisitRepository implements VisitRepository, CaptureStore {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    let version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version > SCHEMA_VERSION) { this.db.close(); throw new Error('Esta base requiere una versión más reciente de la aplicación.'); }
    if (version === 0) this.db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visit_drafts (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('pending','accepted')), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accepted_visits (
        draft_id TEXT PRIMARY KEY REFERENCES visit_drafts(id),
        site_id TEXT NOT NULL REFERENCES sites(id),
        payload TEXT NOT NULL,
        chain_index INTEGER NOT NULL DEFAULT 0,
        prev_hash TEXT NOT NULL DEFAULT '',
        hash TEXT NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX IF NOT EXISTS accepted_visits_chain ON accepted_visits(chain_index);
      PRAGMA user_version = 2;
      COMMIT;
    `);
    // Bases creadas antes de la cadena de custodia: se añaden las columnas y
    // los registros previos quedan fuera de la cadena, marcados con índice -1.
    if (version === 1) this.db.exec(`
      BEGIN;
      ALTER TABLE accepted_visits ADD COLUMN chain_index INTEGER NOT NULL DEFAULT -1;
      ALTER TABLE accepted_visits ADD COLUMN prev_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE accepted_visits ADD COLUMN hash TEXT NOT NULL DEFAULT '';
      PRAGMA user_version = 2;
      COMMIT;
    `);
    version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version === 2) this.db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS capture_jobs (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS capture_jobs_idempotency ON capture_jobs(device_id, idempotency_key);
      CREATE TABLE IF NOT EXISTS capture_receipts (
        kind TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        receipt TEXT NOT NULL,
        PRIMARY KEY (kind, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS capture_chunks (
        capture_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        offset INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (capture_id, attachment_id, offset)
      );
      CREATE TABLE IF NOT EXISTS capture_blobs (
        capture_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (capture_id, attachment_id)
      );
      CREATE TABLE IF NOT EXISTS peer_invitations (
        token TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS peer_devices (
        device_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        revoked_at TEXT,
        payload TEXT NOT NULL
      );
      PRAGMA user_version = 3;
      COMMIT;
    `);
  }
  listSites(): Site[] { return this.db.prepare('SELECT snapshot FROM sites ORDER BY id').all().map(row => JSON.parse(row.snapshot as string) as Site); }
  getSite(id: string) {
    const row = this.db.prepare('SELECT snapshot, revision FROM sites WHERE id = ?').get(id);
    return row ? { site: JSON.parse(row.snapshot as string) as Site, revision: Number(row.revision) } : undefined;
  }
  saveDraft(draft: VisitDraft) { this.db.prepare('INSERT INTO visit_drafts (id,status,payload) VALUES (?,?,?)').run(draft.id, 'pending', JSON.stringify(draft)); }
  updateDraft(draft: VisitDraft) {
    const result = this.db.prepare("UPDATE visit_drafts SET payload = ? WHERE id = ? AND status = 'pending'").run(JSON.stringify(draft), draft.id);
    if (result.changes !== 1) throw new InferenceError('CONFLICT', 'El borrador ya no es editable.');
  }
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
      // La cadena se extiende dentro de la misma transacción que el snapshot:
      // o entran los dos, o no entra ninguno.
      const link = nextEntry(this.head(), visit);
      this.db.prepare('INSERT INTO accepted_visits(draft_id,site_id,payload,chain_index,prev_hash,hash) VALUES(?,?,?,?,?,?)')
        .run(visit.draftId, visit.site.id, link.payload, link.index, link.previousHash, link.hash);
      this.db.prepare("UPDATE visit_drafts SET status='accepted' WHERE id=?").run(visit.draftId);
      this.db.exec('COMMIT'); return visit.site;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  seed(sites: readonly Site[]): number {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM sites').get() as { n: number };
      if (n > 0) { this.db.exec('COMMIT'); return 0; }
      const insert = this.db.prepare('INSERT INTO sites(id,revision,snapshot) VALUES(?,1,?)');
      for (const site of sites) insert.run(site.id, JSON.stringify(site));
      this.db.exec('COMMIT'); return sites.length;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  /** Último eslabón de la cadena, o undefined si aún no hay observaciones. */
  private head(): { index: number; hash: string } | undefined {
    const row = this.db.prepare('SELECT chain_index, hash FROM accepted_visits WHERE chain_index >= 0 ORDER BY chain_index DESC LIMIT 1').get();
    return row ? { index: Number(row.chain_index), hash: String(row.hash) } : undefined;
  }

  /**
   * Recorre la cadena completa y detecta cualquier alteración posterior a la
   * aceptación. Es la operación que respalda el botón "Verificar integridad".
   */
  verifyIntegrity(): ChainVerdict {
    const rows = this.db.prepare('SELECT chain_index, prev_hash, hash, payload FROM accepted_visits WHERE chain_index >= 0 ORDER BY chain_index').all();
    const entries: ChainEntry[] = rows.map(row => ({
      index: Number(row.chain_index),
      previousHash: String(row.prev_hash),
      hash: String(row.hash),
      payload: String(row.payload),
    }));
    return verifyChain(entries);
  }

  saveJob(job: CaptureJob) {
    this.db.prepare(`INSERT INTO capture_jobs(id,device_id,idempotency_key,payload_hash,payload) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET payload_hash=excluded.payload_hash, payload=excluded.payload`)
      .run(job.id, job.deviceId, job.idempotencyKey, job.payloadHash, JSON.stringify(job));
  }
  getJob(id: string): CaptureJob | undefined {
    const row = this.db.prepare('SELECT payload FROM capture_jobs WHERE id = ?').get(id);
    return row ? JSON.parse(row.payload as string) as CaptureJob : undefined;
  }
  getJobByIdempotency(deviceId: string, key: string): CaptureJob | undefined {
    const row = this.db.prepare('SELECT payload FROM capture_jobs WHERE device_id = ? AND idempotency_key = ?').get(deviceId, key);
    return row ? JSON.parse(row.payload as string) as CaptureJob : undefined;
  }
  listActiveJobs(): CaptureJob[] {
    return this.db.prepare('SELECT payload FROM capture_jobs').all()
      .map(row => JSON.parse(row.payload as string) as CaptureJob)
      .filter(job => job.state !== 'accepted' && job.state !== 'cancelled');
  }
  saveReceipt(receipt: CaptureReceipt) {
    this.db.prepare('INSERT INTO capture_receipts(kind,idempotency_key,payload_hash,receipt) VALUES(?,?,?,?)')
      .run(receipt.kind, receipt.idempotencyKey, receipt.payloadHash, JSON.stringify(receipt));
  }
  getReceipt(kind: CaptureReceipt['kind'], idempotencyKey: string): CaptureReceipt | undefined {
    const row = this.db.prepare('SELECT receipt FROM capture_receipts WHERE kind = ? AND idempotency_key = ?').get(kind, idempotencyKey);
    return row ? JSON.parse(row.receipt as string) as CaptureReceipt : undefined;
  }
  putChunk(captureId: string, chunk: CaptureChunk, totalBytes: number): { received: number } {
    if (chunk.offset + chunk.bytes.byteLength > totalBytes) throw new InferenceError('INVALID_INPUT', 'El fragmento excede el tamaño declarado.');
    this.db.prepare('INSERT INTO capture_chunks(capture_id,attachment_id,offset,data) VALUES(?,?,?,?) ON CONFLICT(capture_id,attachment_id,offset) DO UPDATE SET data=excluded.data')
      .run(captureId, chunk.attachmentId, chunk.offset, Buffer.from(chunk.bytes));
    const row = this.db.prepare('SELECT COALESCE(SUM(length(data)),0) AS n FROM capture_chunks WHERE capture_id = ? AND attachment_id = ?')
      .get(captureId, chunk.attachmentId) as { n: number };
    return { received: Number(row.n) };
  }
  getAssembled(captureId: string, attachmentId: string, expected: number, sha256: string): Uint8Array | undefined {
    const rows = this.db.prepare('SELECT offset, data FROM capture_chunks WHERE capture_id = ? AND attachment_id = ? ORDER BY offset')
      .all(captureId, attachmentId) as { offset: number; data: Buffer }[];
    if (!rows.length) return undefined;
    const out = new Uint8Array(expected);
    let cursor = 0;
    for (const row of rows) {
      if (Number(row.offset) !== cursor) return undefined;
      const part = new Uint8Array(row.data);
      if (cursor + part.byteLength > expected) return undefined;
      out.set(part, cursor);
      cursor += part.byteLength;
    }
    if (cursor !== expected) return undefined;
    const hash = createHash('sha256').update(out).digest('hex');
    if (hash !== sha256) throw new InferenceError('INVALID_INPUT', 'El adjunto está corrupto.');
    this.saveAttachmentBytes(captureId, attachmentId, out, sha256);
    this.db.prepare('DELETE FROM capture_chunks WHERE capture_id = ? AND attachment_id = ?').run(captureId, attachmentId);
    return out;
  }
  saveAttachmentBytes(captureId: string, attachmentId: string, bytes: Uint8Array, sha256: string) {
    this.db.prepare('INSERT INTO capture_blobs(capture_id,attachment_id,sha256,data) VALUES(?,?,?,?) ON CONFLICT(capture_id,attachment_id) DO UPDATE SET sha256=excluded.sha256, data=excluded.data')
      .run(captureId, attachmentId, sha256, Buffer.from(bytes));
  }
  getAttachmentBytes(captureId: string, attachmentId: string): Uint8Array | undefined {
    const row = this.db.prepare('SELECT data FROM capture_blobs WHERE capture_id = ? AND attachment_id = ?').get(captureId, attachmentId);
    return row ? new Uint8Array(row.data as Buffer) : undefined;
  }

  saveInvitation(token: string, expiresAt: string, payload: unknown) {
    this.db.prepare('INSERT INTO peer_invitations(token,expires_at,payload) VALUES(?,?,?)').run(token, expiresAt, JSON.stringify(payload));
  }
  getInvitation(token: string): { expiresAt: string; consumedAt: string | null; payload: unknown } | undefined {
    const row = this.db.prepare('SELECT expires_at, consumed_at, payload FROM peer_invitations WHERE token = ?').get(token) as
      { expires_at: string; consumed_at: string | null; payload: string } | undefined;
    return row ? { expiresAt: row.expires_at, consumedAt: row.consumed_at, payload: JSON.parse(row.payload) } : undefined;
  }
  consumeInvitation(token: string, at: string) {
    const result = this.db.prepare('UPDATE peer_invitations SET consumed_at = ? WHERE token = ? AND consumed_at IS NULL').run(at, token);
    if (result.changes !== 1) throw new InferenceError('CONFLICT', 'La invitación no es reutilizable.');
  }
  saveDevice(deviceId: string, publicKey: string, payload: unknown) {
    this.db.prepare('INSERT INTO peer_devices(device_id,public_key,payload) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET public_key=excluded.public_key, payload=excluded.payload, revoked_at=NULL')
      .run(deviceId, publicKey, JSON.stringify(payload));
  }
  getDevice(deviceId: string): { publicKey: string; revokedAt: string | null; payload: unknown } | undefined {
    const row = this.db.prepare('SELECT public_key, revoked_at, payload FROM peer_devices WHERE device_id = ?').get(deviceId) as
      { public_key: string; revoked_at: string | null; payload: string } | undefined;
    return row ? { publicKey: row.public_key, revokedAt: row.revoked_at, payload: JSON.parse(row.payload) } : undefined;
  }
  revokeDevice(deviceId: string, at: string) {
    const result = this.db.prepare('UPDATE peer_devices SET revoked_at = ? WHERE device_id = ?').run(at, deviceId);
    if (result.changes !== 1) throw new InferenceError('INVALID_INPUT', 'Dispositivo no encontrado.');
  }

  close() { this.db.close(); }
}
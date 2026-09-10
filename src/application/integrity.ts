import { createHash } from 'node:crypto';

/**
 * Cadena de custodia de las observaciones aceptadas.
 *
 * Cada aceptación se encadena con la anterior mediante SHA-256. Alterar una
 * fila del archivo SQLite rompe su propio hash y, en cascada, el de todas las
 * siguientes: no basta con reescribir un dato, habría que recalcular la cadena
 * completa, y eso se detecta comparando contra el último hash conocido.
 *
 * No sustituye a una firma criptográfica con clave privada: prueba que el
 * historial no fue modificado, no quién lo escribió. La firma por dispositivo
 * es el paso siguiente y encaja sobre esta misma estructura.
 */

/** Hash del eslabón cero. No existe una observación anterior a la primera. */
export const GENESIS_HASH = '0'.repeat(64);

export interface ChainEntry {
  readonly index: number;
  readonly previousHash: string;
  readonly hash: string;
  /** JSON canónico exacto que se usó para calcular el hash. */
  readonly payload: string;
}

export type ChainVerdict =
  | { readonly ok: true; readonly entries: number; readonly headHash: string }
  | {
      readonly ok: false;
      readonly entries: number;
      readonly brokenAt: number;
      readonly reason: 'content-altered' | 'broken-link' | 'index-gap';
      readonly detail: string;
    };

/**
 * Serializa con las claves ordenadas en todo el árbol.
 *
 * Complejidad: O(n log n) sobre el número de claves.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalize(v)).join(',') + '}';
}

/** Hash de un eslabón. Depende del contenido, de su posición y del anterior. */
export function linkHash(index: number, previousHash: string, payload: string): string {
  return createHash('sha256')
    .update(String(index))
    .update('\u0000')
    .update(previousHash)
    .update('\u0000')
    .update(payload)
    .digest('hex');
}

/** Construye el siguiente eslabón a partir del último conocido. */
export function nextEntry(head: { index: number; hash: string } | undefined, value: unknown): ChainEntry {
  const index = head === undefined ? 0 : head.index + 1;
  const previousHash = head === undefined ? GENESIS_HASH : head.hash;
  const payload = canonicalize(value);
  return { index, previousHash, hash: linkHash(index, previousHash, payload), payload };
}

/**
 * Recalcula la cadena completa y reporta el primer eslabón que no cuadra.
 *
 * Distingue tres formas de manipulación:
 *  - content-altered: el payload cambió, su propio hash ya no corresponde.
 *  - broken-link: el payload está intacto pero apunta a un anterior distinto,
 *    lo que delata una fila eliminada o reordenada.
 *  - index-gap: falta un eslabón intermedio.
 *
 * Complejidad: O(n) sobre el número de observaciones aceptadas.
 */
export function verifyChain(entries: readonly ChainEntry[]): ChainVerdict {
  let expectedPrevious = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    if (entry.index !== i) {
      return {
        ok: false,
        entries: entries.length,
        brokenAt: i,
        reason: 'index-gap',
        detail: `Se esperaba el eslabón ${i} y se encontró el ${entry.index}. Falta o sobra una observación.`,
      };
    }

    if (entry.previousHash !== expectedPrevious) {
      return {
        ok: false,
        entries: entries.length,
        brokenAt: i,
        reason: 'broken-link',
        detail: `El eslabón ${i} apunta a un antecesor que no es el registrado. Se eliminó o reordenó una observación.`,
      };
    }

    const recomputed = linkHash(entry.index, entry.previousHash, entry.payload);
    if (recomputed !== entry.hash) {
      return {
        ok: false,
        entries: entries.length,
        brokenAt: i,
        reason: 'content-altered',
        detail: `El contenido del eslabón ${i} fue modificado después de aceptarse.`,
      };
    }

    expectedPrevious = entry.hash;
  }

  return { ok: true, entries: entries.length, headHash: expectedPrevious };
}

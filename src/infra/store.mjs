/**
 * Persistencia local. Guarda y lee; no deriva ningun campo.
 * Columnas nombradas literalmente como la hoja "Dummy Installed Base".
 */

import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

/** Las diecinueve columnas, en el orden de la hoja. */
export const COLUMNS = [
  'Observation ID',
  'Country',
  'City',
  'Customer / Hospital',
  'Observer',
  'Visit Date',
  'Modality',
  'Quantity',
  'Dummy Brand',
  'Dummy Model',
  'Approx. Age (Years)',
  'Estimated Installation Year',
  'Confidence',
  'Status',
  'Source',
  'Voice Input Example',
  'Agent Follow-up Question',
  'Follow-up Answer',
  'Notes',
];

const COLUMN_TYPES = {
  'Observation ID': 'INTEGER PRIMARY KEY',
  Quantity: 'INTEGER',
  'Approx. Age (Years)': 'REAL',
  'Estimated Installation Year': 'INTEGER',
};

const q = (name) => `"${name}"`;

const DDL = `
CREATE TABLE IF NOT EXISTS observations (
  ${COLUMNS.map((c) => `${q(c)} ${COLUMN_TYPES[c] ?? 'TEXT'}`).join(',\n  ')}
);
CREATE TABLE IF NOT EXISTS customer_embeddings (
  ${q('Customer / Hospital')} TEXT PRIMARY KEY,
  embedding BLOB NOT NULL
);
`;

const CUSTOMER = 'Customer / Hospital';

function toFloat32(embedding, label) {
  if (embedding instanceof Float32Array) return embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new TypeError(`${label} debe ser un arreglo de numeros no vacio.`);
  }
  if (!embedding.every(Number.isFinite)) {
    throw new TypeError(`${label} contiene valores no finitos.`);
  }
  return Float32Array.from(embedding);
}

function cosine(a, b) {
  if (a.length !== b.length) return null; // dimensiones distintas: no comparable
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? null : dot / den; // vector nulo: sin direccion, no hay coseno
}

/**
 * Abre la base y devuelve las operaciones. `filename` ':memory:' para pruebas.
 */
export function openStore(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec(DDL);

  const insertable = COLUMNS.filter((c) => c !== 'Observation ID');
  const insertStmt = db.prepare(
    `INSERT INTO observations (${insertable.map(q).join(', ')})
     VALUES (${insertable.map(() => '?').join(', ')})`,
  );
  const byCustomerStmt = db.prepare(
    `SELECT * FROM observations WHERE ${q(CUSTOMER)} = ? ORDER BY ${q('Observation ID')}`,
  );
  const customersStmt = db.prepare(
    `SELECT ${q(CUSTOMER)} AS customer,
            COUNT(*) AS observations
     FROM observations
     WHERE ${q(CUSTOMER)} IS NOT NULL
     GROUP BY ${q(CUSTOMER)}
     ORDER BY customer`,
  );
  const upsertEmbeddingStmt = db.prepare(
    `INSERT INTO customer_embeddings (${q(CUSTOMER)}, embedding) VALUES (?, ?)
     ON CONFLICT(${q(CUSTOMER)}) DO UPDATE SET embedding = excluded.embedding`,
  );
  const allEmbeddingsStmt = db.prepare(
    `SELECT ${q(CUSTOMER)} AS customer, embedding FROM customer_embeddings`,
  );

  return {
    /** Rechaza columnas que no estan en la hoja. Devuelve el Observation ID. */
    insertObservation(row) {
      if (row === null || typeof row !== 'object') {
        throw new TypeError('insertObservation espera un objeto.');
      }
      const unknown = Object.keys(row).filter((k) => !COLUMNS.includes(k));
      if (unknown.length > 0) {
        throw new TypeError(`Columnas desconocidas: ${unknown.join(', ')}`);
      }
      return Number(insertStmt.run(...insertable.map((c) => row[c] ?? null)).lastInsertRowid);
    },

    /** Filas de un cliente, en orden de insercion. */
    listByCustomer(customer) {
      return byCustomerStmt.all(customer);
    },

    /** Clientes distintos con su conteo de observaciones. */
    listCustomers() {
      return customersStmt.all();
    },

    /** Sin esto, findSimilarCustomers no ve nada. */
    upsertCustomerEmbedding(customer, embedding) {
      if (typeof customer !== 'string' || customer.trim() === '') {
        throw new TypeError('customer debe ser texto no vacio.');
      }
      const vec = toFloat32(embedding, 'embedding');
      upsertEmbeddingStmt.run(customer, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
    },

    /**
     * Los k vecinos mas cercanos por coseno. No aplica umbral ni decide nada.
     * ponytail: escaneo lineal; indice vectorial (sqlite-vec) si crece.
     */
    findSimilarCustomers(embedding, k = 5) {
      const query = toFloat32(embedding, 'embedding');
      if (!Number.isInteger(k) || k < 1) throw new TypeError('k debe ser un entero >= 1.');
      const scored = [];
      for (const { customer, embedding: blob } of allEmbeddingsStmt.all()) {
        const stored = new Float32Array(
          blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength),
        );
        const similarity = cosine(query, stored);
        if (similarity !== null) scored.push({ customer, similarity });
      }
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, k);
    },

    close() {
      db.close();
    },
  };
}

/** Autocomprobacion: node src/infra/store.mjs */
function demo() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`FALLO: ${msg}`);
  };
  const store = openStore();

  const id = store.insertObservation({
    Country: 'Panama',
    City: 'Panama City',
    'Customer / Hospital': 'Hospital DemoCare Pacific',
    Modality: 'MR',
    Quantity: 2,
    'Dummy Brand': 'NovaMed',
    'Approx. Age (Years)': 7,
    'Estimated Installation Year': 2019,
    Confidence: 'High',
    Status: 'Reported',
    Source: 'Voice',
  });
  assert(id === 1, 'el primer Observation ID debe ser 1');

  store.insertObservation({
    'Customer / Hospital': 'Hospital DemoCare Pacific',
    Modality: 'CT',
    Quantity: 1,
  });
  store.insertObservation({ 'Customer / Hospital': 'Clinica DemoCare Light', Modality: 'CT' });

  const rows = store.listByCustomer('Hospital DemoCare Pacific');
  assert(rows.length === 2, 'listByCustomer devuelve las dos filas del cliente');
  assert(rows[0].Country === 'Panama', 'las columnas conservan su nombre literal');
  assert(rows[0]['Approx. Age (Years)'] === 7, 'columna con parentesis legible');
  assert(rows[1].Confidence === null, 'lo que el dominio no envio queda null, no calculado');

  const customers = store.listCustomers();
  assert(customers.length === 2, 'listCustomers agrupa por cliente');
  assert(customers[0].observations === 1, 'cuenta observaciones por cliente');

  let rejected = false;
  try {
    store.insertObservation({ Modality: 'CT', 'Confidence Score': 0.9 });
  } catch {
    rejected = true;
  }
  assert(rejected, 'una columna que no esta en la hoja debe fallar');

  store.upsertCustomerEmbedding('a', [1, 0, 0]);
  store.upsertCustomerEmbedding('b', [0.9, 0.1, 0]);
  store.upsertCustomerEmbedding('c', [0, 1, 0]);
  store.upsertCustomerEmbedding('otra-dimension', [1, 0]);
  store.upsertCustomerEmbedding('nulo', [0, 0, 0]);

  const near = store.findSimilarCustomers([1, 0, 0], 2);
  assert(near.length === 2, 'k limita el resultado');
  assert(near[0].customer === 'a', 'el vecino identico va primero');
  assert(near[1].customer === 'b', 'el segundo vecino ordenado por coseno');
  assert(near[0].similarity > near[1].similarity, 'orden descendente por similitud');

  const all = store.findSimilarCustomers([1, 0, 0], 50);
  assert(all.length === 3, 'dimension distinta y norma cero quedan fuera');
  assert(!all.some((n) => 'decision' in n), 'findSimilarCustomers no decide nada sobre los vecinos');

  store.upsertCustomerEmbedding('a', [0, 1, 0]);
  assert(
    store.findSimilarCustomers([0, 1, 0], 1)[0].customer === 'a',
    'el embedding se reemplaza, no se duplica',
  );

  store.close();
  console.log('store.mjs OK');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  demo();
}

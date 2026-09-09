/**
 * Mide el adaptador activo contra fixtures/voice-tests.json y escribe REPORT.md.
 *
 *   ALBATROSS_ADAPTER=mock node scripts/measure.mjs
 *
 * No levanta Electron, ni Vite, ni la UI. Importa el adaptador y src/domain/
 * directo. No inventa metricas: lo que el adaptador no produce se reporta como
 * no producido, no como cero.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const rel = (p) => new URL(p, ROOT);

// Los .ts del repo se compilan con tsc, no con el stripper de Node, asi que
// usan parameter properties e imports sin extension. Un solo re-exec con
// --experimental-transform-types evita duplicar el adaptador en .mjs.
if (!process.execArgv.includes('--experimental-transform-types')) {
  const args = [
    '--experimental-transform-types',
    '--disable-warning=ExperimentalWarning',
    fileURLToPath(import.meta.url),
    ...process.argv.slice(2),
  ];
  process.exit(spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1);
}

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) {
      const url = new URL(`${spec}.ts`, ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(spec, ctx);
  },
});

const ADAPTER = process.env.ALBATROSS_ADAPTER ?? 'mock';

/** Construye el motor de inferencia del adaptador seleccionado. */
async function loadEngine(name) {
  if (name === 'mock') {
    const { MockInferenceEngine } = await import(
      rel('src/adapters/inference/mock/index.ts').href
    );
    return new MockInferenceEngine({ scenario: 'post-visit' });
  }
  if (name === 'qvac') {
    const candidates = ['src/qvac/index.mjs', 'src/adapters/inference/qvac/index.ts'];
    for (const c of candidates) {
      if (existsSync(fileURLToPath(rel(c)))) {
        const mod = await import(rel(c).href);
        const Engine = mod.QvacInferenceEngine ?? mod.default;
        if (typeof Engine === 'function') return new Engine();
      }
    }
    throw new Error('ALBATROSS_ADAPTER=qvac pero src/qvac/ todavia no expone un motor.');
  }
  throw new Error(`ALBATROSS_ADAPTER desconocido: ${name}. Valores: mock, qvac.`);
}

/**
 * El dominio vive en src/domain/ y NO expone un deriveFields(row): expone
 * funciones puras separadas. Nos adaptamos a ellas.
 *
 *   deriveConfidence(rawAnswerText)       -> "High" | "Medium" | "Low"
 *   deriveStatus(channel, rawAnswerText)  -> "Confirmed" | "Reported" | "Estimated" | "Unknown"
 */
async function loadDomain() {
  const entry = 'src/domain/index.ts';
  if (!existsSync(fileURLToPath(rel(entry)))) return null;
  const mod = await import(rel(entry).href);
  const missing = ['deriveConfidence', 'deriveStatus']
    .filter((f) => typeof mod[f] !== 'function');
  if (missing.length > 0) return { path: entry, mod: null };
  return { path: entry, mod };
}

const MODALITY_ALIASES = { MRI: 'MR', SCANNER: 'CT', US: 'Ultrasound', ULTRASOUND: 'Ultrasound' };
const normModality = (m) => {
  if (typeof m !== 'string') return null;
  const up = m.trim().toUpperCase();
  return MODALITY_ALIASES[up] ?? m.trim();
};
const normText = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v ?? null);

/**
 * Lleva la salida del adaptador a la forma comparable del fixture: la lista de
 * candidatos del contrato InferenceEngine, un candidato por campo, agrupados
 * por modalidad.
 */
function toRows(data) {
  const candidates = data?.candidates ?? [];
  if (candidates.length > 0 && candidates[0].field === undefined) return candidates;
  const byModality = new Map();
  for (const c of candidates) {
    const key = normModality(c.modality);
    if (!byModality.has(key)) {
      byModality.set(key, {
        cliente: null, pais: null, ciudad: null, modalidad: key,
        cantidad: null, marca: null, modelo: null, edad: null,
      });
    }
    const row = byModality.get(key);
    if (c.field === 'count') row.cantidad = c.value;
    else if (c.field === 'ageYears') row.edad = c.value;
  }
  return [...byModality.values()];
}

const FIELDS = ['cliente', 'pais', 'ciudad', 'modalidad', 'cantidad', 'marca', 'edad'];

const pick = (row, field) => row?.[field] ?? null;

/**
 * Compara un campo. Devuelve 'ok', 'miss' o 'relleno'.
 * 'relleno' es el caso peligroso: el enunciado no dice nada y el adaptador
 * puso un valor. Se cuenta aparte porque inventar es peor que callar.
 */
function compare(field, expected, row) {
  // Sin fila emitida no hay acierto posible. Si "esperado null / obtenido null"
  // contara como ok, un adaptador que no responde nada puntuaria alto en los
  // campos que el enunciado no menciona.
  if (row === null) return 'miss';
  const got = pick(row, field);
  if (field === 'edad' && expected.edad === null && expected.edad_cualitativa !== null) {
    // Edad cualitativa: no hay numero correcto. Acierta quien no inventa uno.
    return got === null || normText(got) === normText(expected.edad_cualitativa) ? 'ok' : 'relleno';
  }
  const want = field === 'modalidad' ? normModality(expected[field]) : expected[field];
  const have = field === 'modalidad' ? normModality(got) : got;
  if (want === null) return have === null ? 'ok' : 'relleno';
  if (have === null) return 'miss';
  if (typeof want === 'number') return Number(have) === want ? 'ok' : 'miss';
  return normText(have) === normText(want) ? 'ok' : 'miss';
}

/** Empareja filas esperadas y emitidas por modalidad, luego por posicion. */
function pair(expected, emitted) {
  const pool = emitted.map((r) => ({ r, used: false }));
  const pairs = expected.map((exp) => {
    const want = normModality(exp.modalidad);
    const hit = pool.find((p) => !p.used && normModality(pick(p.r, 'modalidad')) === want)
      ?? pool.find((p) => !p.used);
    if (hit) hit.used = true;
    return { expected: exp, emitted: hit?.r ?? null };
  });
  return { pairs, extra: pool.filter((p) => !p.used).map((p) => p.r) };
}

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(0)}% (${n}/${d})`);

async function main() {
  const fixture = JSON.parse(readFileSync(fileURLToPath(rel('fixtures/voice-tests.json')), 'utf8'));
  const engine = await loadEngine(ADAPTER);
  const domain = await loadDomain();

  const tally = Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, miss: 0, relleno: 0 }]));
  const statusDist = new Map();
  const confidenceDist = new Map();
  const results = [];

  for (const testCase of fixture.casos) {
    const started = performance.now();
    let emitted = [];
    let error = null;
    try {
      const out = await engine.extractObservations({
        hospitalId: `case-${testCase.id}`,
        transcript: testCase.en,
      });
      emitted = toRows(out.data);
    } catch (e) {
      error = `${e.code ?? e.name}: ${e.message}`;
    }
    const latencyMs = performance.now() - started;

    const { pairs, extra } = pair(testCase.expected, emitted);
    let relleno = false;
    for (const { expected, emitted: row } of pairs) {
      for (const field of FIELDS) {
        const verdict = compare(field, expected, row);
        tally[field][verdict] += 1;
        if (verdict === 'relleno' && (field === 'marca' || field === 'edad')) relleno = true;
      }
      // modelo no entra en la exactitud por campo pedida, pero si en el relleno.
      if (expected.modelo === null && row !== null && (row.modelo ?? null) !== null) {
        relleno = true;
      }
    }
    for (const row of extra) {
      if (pick(row, 'marca') !== null || (row.modelo ?? null) !== null) relleno = true;
    }

    if (domain?.mod) {
      // El enunciado es el texto crudo del que el dominio infiere certeza y estado.
      const st = domain.mod.deriveStatus('Voice', testCase.en);
      const cf = domain.mod.deriveConfidence(testCase.en);
      for (let i = 0; i < emitted.length; i += 1) {
        statusDist.set(st, (statusDist.get(st) ?? 0) + 1);
        confidenceDist.set(cf, (confidenceDist.get(cf) ?? 0) + 1);
      }
    }

    results.push({
      id: testCase.id, latencyMs, error, relleno,
      esperadas: testCase.expected.length, emitidas: emitted.length,
    });
  }

  const total = results.length;
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const esperadas = results.reduce((a, r) => a + r.esperadas, 0);
  const emitidas = results.reduce((a, r) => a + r.emitidas, 0);
  const conRelleno = results.filter((r) => r.relleno).length;
  const conError = results.filter((r) => r.error).length;

  const dist = (map, label) => (map.size === 0
    ? `No disponible: ${domain?.mod
      ? `${domain.path} cargo correctamente, pero el adaptador no emitio ninguna fila sobre la cual derivar`
      : 'src/domain/ no encontrado o sin las funciones de derivacion'}.`
    : [`| ${label} | Filas | Proporcion |`, '| --- | ---: | ---: |',
      ...[...map].sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `| ${k} | ${v} | ${pct(v, emitidas)} |`)].join('\n'));

  const report = `# REPORT.md — medicion de extraccion

Generado por \`scripts/measure.mjs\` el ${new Date().toISOString()}.

- Adaptador activo: \`ALBATROSS_ADAPTER=${ADAPTER}\`
- Referencia: \`fixtures/voice-tests.json\` (hoja **${fixture.fuente.hoja}** de \`${fixture.fuente.archivo}\`)
- Casos: ${total}
- Dominio: ${domain?.mod ? `\`${domain.path}\`` : '`src/domain/` no disponible'}

## Exactitud por campo

Sobre ${esperadas} filas esperadas. **relleno** = el enunciado no menciona el campo
y el adaptador puso un valor; se separa de **error** porque inventar es peor que callar.

| Campo | Acierto | Error | Relleno |
| --- | ---: | ---: | ---: |
${FIELDS.map((f) => {
    const t = tally[f];
    const d = t.ok + t.miss + t.relleno;
    return `| ${f} | ${pct(t.ok, d)} | ${t.miss} | ${t.relleno} |`;
  }).join('\n')}

## Filas emitidas contra esperadas

| Metrica | Valor |
| --- | ---: |
| Filas esperadas | ${esperadas} |
| Filas emitidas | ${emitidas} |
| Diferencia | ${emitidas - esperadas} |
| Casos con error del adaptador | ${pct(conError, total)} |

## Relleno de marca o modelo no mencionados

**${pct(conRelleno, total)}** de los casos recibieron una marca o un modelo que el
enunciado no menciona. Cero es el objetivo: la hoja Agent Question Logic pide
"If unknown, save as Unknown. Never force a guess."

## Latencia por enunciado

| Caso | ms | Filas esp./emit. | Resultado |
| ---: | ---: | :---: | --- |
${results.map((r) => `| ${r.id} | ${r.latencyMs.toFixed(1)} | ${r.esperadas} / ${r.emitidas} | ${r.error ?? (r.relleno ? 'relleno' : 'ok')} |`).join('\n')}

Mediana ${latencies[Math.floor(total / 2)].toFixed(1)} ms · minimo ${latencies[0].toFixed(1)} ms · maximo ${latencies[total - 1].toFixed(1)} ms.

## Distribucion de Status

${dist(statusDist, 'Status')}

## Distribucion de Confidence

${dist(confidenceDist, 'Confidence')}
`;

  writeFileSync(fileURLToPath(rel('REPORT.md')), report, 'utf8');
  console.log(`REPORT.md escrito · adaptador ${ADAPTER} · ${total} casos · ${emitidas}/${esperadas} filas · relleno ${pct(conRelleno, total)}`);
  if (conError > 0) console.log(`${conError} de ${total} casos fallaron en el adaptador; el detalle esta en REPORT.md.`);
}

/**
 * Autocomprobacion de la logica de medicion: node scripts/measure.mjs --self-check
 * No toca el adaptador. Verifica que un extractor perfecto puntue 100, que uno
 * que calla puntue 0 y que el relleno de marca se detecte.
 */
function selfCheck() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`FALLO: ${msg}`);
  };
  const fixture = JSON.parse(readFileSync(fileURLToPath(rel('fixtures/voice-tests.json')), 'utf8'));

  const score = (emitFor) => {
    const t = { ok: 0, miss: 0, relleno: 0 };
    let casosConRelleno = 0;
    for (const c of fixture.casos) {
      const { pairs, extra } = pair(c.expected, emitFor(c));
      let relleno = extra.some((r) => pick(r, 'marca') !== null);
      for (const { expected, emitted } of pairs) {
        for (const field of FIELDS) {
          const v = compare(field, expected, emitted);
          t[v] += 1;
          if (v === 'relleno' && field === 'marca') relleno = true;
        }
      }
      if (relleno) casosConRelleno += 1;
    }
    return { ...t, casosConRelleno };
  };

  const perfecto = score((c) => c.expected.map((r) => ({ ...r })));
  assert(perfecto.miss === 0 && perfecto.relleno === 0, 'un extractor perfecto no falla ningun campo');
  assert(perfecto.ok === 16 * 7, `esperados 112 aciertos, hubo ${perfecto.ok}`);
  assert(perfecto.casosConRelleno === 0, 'copiar lo esperado no es relleno');

  const mudo = score(() => []);
  assert(mudo.ok === 0, 'no emitir nada no debe acertar ningun campo');
  assert(mudo.miss === 16 * 7, 'no emitir nada falla los 112 campos');

  // Caso 6: "from the same manufacturer" no nombra marca. Ponerle una es relleno.
  const inventor = score((c) => c.expected.map((r) => ({ ...r, marca: r.marca ?? 'NovaMed' })));
  assert(inventor.casosConRelleno === 6, `6 casos con marca no mencionada, hubo ${inventor.casosConRelleno}`);

  // Caso 2: la semilla dice 3 y 1; el enunciado dice 2 y 1. Debe contar error.
  const semilla = score((c) => (c.id === 2
    ? [{ ...c.expected[0], cantidad: 3 }, { ...c.expected[1] }]
    : c.expected.map((r) => ({ ...r }))));
  assert(semilla.miss === 1, `la cantidad 3 de la semilla debe fallar, miss=${semilla.miss}`);

  // Alias de modalidad: MRI -> MR, scanner -> CT (Agent Question Logic, paso 3).
  const c1 = fixture.casos[0];
  const alias = pair(c1.expected, [
    { ...c1.expected[0], modalidad: 'MRI' },
    { ...c1.expected[1], modalidad: 'scanner' },
  ]);
  assert(alias.extra.length === 0, 'las dos filas con sinonimo se emparejan');
  assert(
    alias.pairs.every(({ expected, emitted }) => compare('modalidad', expected, emitted) === 'ok'),
    'MRI->MR y scanner->CT se comparan bien',
  );

  // Caso 5: edad cualitativa. Callar acierta, inventar un numero es relleno.
  const c5 = fixture.casos[4].expected[0];
  assert(compare('edad', c5, { edad: null }) === 'ok', 'no inventar edad ante "mostly new" acierta');
  assert(compare('edad', c5, { edad: 2 }) === 'relleno', 'inventar 2 anos ante "mostly new" es relleno');

  // toRows dobla los candidatos del contrato InferenceEngine en filas.
  const filas = toRows({
    candidates: [
      { modality: 'CT', field: 'count', value: 2 },
      { modality: 'MR', field: 'count', value: 4 },
      { modality: 'CT', field: 'ageYears', value: 11 },
    ],
  });
  assert(filas.length === 2, 'dos modalidades producen dos filas');
  assert(filas[0].cantidad === 2 && filas[0].edad === 11, 'los candidatos de una modalidad se funden');

  console.log('measure.mjs OK');
}

if (process.argv.includes('--self-check')) selfCheck();
else await main();

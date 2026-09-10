/** Real local extraction benchmark; --es selects Spanish, --self-check needs no models. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { FIELDS, AGE_ALIASES, evaluateCase, summarize, toRows, validateLanguage, validateReplay } from './measurement-core.mjs';

const ROOT = new URL('../', import.meta.url), rel = path => new URL(path, ROOT);
if (process.argv.includes('--self-check')) {
  process.exit(spawnSync(process.execPath, ['--test', fileURLToPath(rel('scripts/measurement-core.test.mjs'))], { stdio: 'inherit' }).status ?? 1);
}
if (!process.execArgv.includes('--experimental-transform-types')) {
  process.exit(spawnSync(process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', cwd: fileURLToPath(ROOT) }).status ?? 1);
}
registerHooks({ resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) {
    const url = new URL(`${spec}.ts`, ctx.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return next(spec, ctx);
} });

const readJson = path => JSON.parse(readFileSync(rel(path), 'utf8'));
const saveJson = (path, data) => writeFileSync(rel(path), JSON.stringify(data, null, 2) + '\n');
const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}% (${n}/${d})` : 'N/A';
const ms = n => n === null ? 'N/A' : n.toFixed(1);
const safe = value => String(value).replaceAll('|', '/').replaceAll('\n', ' ');
const scoredRowCount = result => result.error ? 0 : result.emitted.length;

function renderReport(run, artifactPath) {
  const { metadata, summary: s, results } = run;
  const distribution = key => {
    const counts = {};
    for (const r of results) counts[r[key]] = (counts[r[key]] ?? 0) + scoredRowCount(r);
    return Object.entries(counts).map(([label, count]) => `| ${label} | ${count} |`).join('\n');
  };
  return `# Medicion de extraccion — evaluador v2

Generado: ${metadata.startedAt}. Idioma: ${metadata.language}. SDK QVAC: ${metadata.sdk}.
${s.cases} dictados de texto; no mide Whisper ni audio. Modelos locales, prompt y parser sin modificaciones.
[Respuestas originales, parametros y diferencias](${artifactPath}).

## Metricas de grupos

Un grupo exacto coincide en los ${FIELDS.length} campos evaluados. Precision = exactos/emitidos; cobertura = exactos/esperados. Una fila con atributos incorrectos penaliza ambas. Extra significa fila sin pareja, no todos los falsos positivos. Una marca inventada es una marca concreta donde la referencia es null (no mencionada) o Unknown (el hablante dijo no saberla); el objetivo es cero.

| Metrica | Valor |
| --- | ---: |
| Filas esperadas / emitidas | ${s.expected} / ${s.emitted} |
| Grupos exactos | ${s.exactRows} |
| Precision | ${pct(s.exactRows, s.emitted)} |
| Cobertura | ${pct(s.exactRows, s.expected)} |
| F1 | ${s.f1 === null ? 'N/A' : (s.f1 * 100).toFixed(1) + '%'} |
| Casos exactos en campos evaluados, sin filas extra | ${pct(s.exactCases, s.cases)} |
| Filas extra / esperadas sin pareja | ${s.extra} / ${s.missing} |
| Fallos del adaptador | ${pct(s.errors, s.cases)} |
| Truncamientos notificados (stopReason=length) | ${s.truncations} |
| Casos sin motivo de parada informado por el SDK | ${s.unknownStopReasons} |
| Casos con marca inventada (referencia null o Unknown; casos 4, 6 y 10 la ejercitan) | ${pct(s.brandFillCases, s.cases)} |
| Casos con relleno de marca/modelo segun referencia | ${pct(s.brandModelFillCases, s.cases)} |
| Latencia p50 / p95 (exitos, n=${s.latency.samples}) | ${ms(s.latency.p50)} / ${ms(s.latency.p95)} ms |

Percentiles con interpolacion lineal (n-1)*q; p50 promedia los dos centrales cuando n es par. Carga inicial excluida. Una sola ejecucion de diez casos no estima rendimiento general.

## Exactitud por campo

Penalizada = aciertos/(esperadas + extras); la columna sobre esperadas conserva la lectura por campo. Presente = referencia distinta de null, incluyendo false; ausente = null. N/A indica que no hay ejemplos. Relleno compara con la referencia; no certifica evidencia semantica.

| Campo | Sobre esperadas | Penalizada | Presentes | Ausentes | Error | Relleno | Valores en filas extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${FIELDS.map(f => { const t = s.fields[f]; return `| ${f} | ${pct(t.exact, s.expected)} | ${pct(t.exact, s.expected + s.extra)} | ${pct(t.presentExact, t.present)} | ${pct(t.absentExact, t.absent)} | ${t.miss} | ${t.relleno} | ${t.extraValues} |`; }).join('\n')}

## Detalle por caso

| Caso | ms | Esperadas / emitidas | Grupos exactos | Resultado | Diferencias |
| --- | ---: | ---: | ---: | --- | --- |
${results.map(r => `| ${r.id} | ${ms(r.latencyMs)} | ${r.expected.length} / ${scoredRowCount(r)} | ${r.evaluation.exactRows} | ${safe(r.error ?? (r.evaluation.exact ? 'exacto' : 'diferencias'))} | ${[...new Set(r.evaluation.differences.map(d => d.field))].join(', ')}${r.evaluation.extra.length ? '; filas extra: ' + r.evaluation.extra.length : ''} |`).join('\n')}

## Convenciones y limites

- Emparejamiento global uno a uno por modalidad: prioriza filas exactas, luego numero de parejas y atributos correctos. Se conservan filas sin pareja.
- Edad cualitativa se compara en su propio campo con alias bilingues fijos guardados en el artefacto; no se equiparan old y very old ni new y newer.
- Caso 2: referencia del dictado 2+1, no la semilla 3+1. Caso 4: se conserva modelo Unknown aunque el hablante solo desconoce marcas; es una discrepancia de la referencia.
- Las traducciones son diez casos paralelos, no veinte escenarios independientes. No hay ejemplos positivos de ciudad. Las relaciones de fabricante compartido no tienen campo evaluable.
- scope, unknownFields y respaldo semantico de evidencia no tienen anotaciones gold independientes y no se puntuan. La exactitud de casos se limita a los ${FIELDS.length} campos declarados.
- El artefacto guarda las respuestas originales del SDK antes del parser, los motivos de parada y la salida normalizada. Una solicitud que falla antes de completar puede no tener respuesta original.
- Si el SDK no informa stopReason, no se puede certificar ausencia de truncamientos; el contador solo incluye los notificados.

## Distribuciones del dominio

Derivadas por dictado; no son puntuaciones de exactitud ni confianza del modelo.

| Status | Filas |
| --- | ---: |
${distribution('status')}

| Confidence | Filas |
| --- | ---: |
${distribution('confidence')}
`;
}

async function main() {
  const outputAt = process.argv.indexOf('--output-dir');
  const outputDir = outputAt >= 0 ? process.argv[outputAt + 1] : 'reports/extraction';
  if (!outputDir || outputDir.startsWith('/') || /^[A-Za-z]:[\\/]/.test(outputDir) || outputDir.includes('..')) {
    throw new Error('Uso: --output-dir <ruta-relativa-sin-..>');
  }
  const replayAt = process.argv.indexOf('--replay');
  if (replayAt >= 0) {
    const artifact = process.argv[replayAt + 1];
    if (!artifact) throw new Error('Uso: --replay reports/extraction/<ejecucion>/run.json');
    const run = readJson(artifact);
    validateReplay(run);
    for (const r of run.results) {
      r.emitted = toRows(r.output?.data);
      r.evaluation = evaluateCase(r.expected, r.emitted, r.error);
    }
    run.summary = summarize(run.results);
    run.metadata.rescoredAt = new Date().toISOString();
    run.metadata.rescoredWith = createHash('sha256').update(readFileSync(rel('scripts/measurement-core.mjs'))).digest('hex');
    saveJson(artifact, run);
    writeFileSync(rel(run.metadata.language === 'es' ? 'REPORT.es.md' : 'REPORT.md'), renderReport(run, artifact));
    writeFileSync(new URL('REPORT.md', rel(artifact)), renderReport(run, 'run.json'));
    console.log(`Metricas recalculadas sin inferencia: ${artifact}`);
    return;
  }
  const language = process.argv.includes('--es') ? 'es' : 'en';
  const fixture = readJson('fixtures/voice-tests.json');
  validateLanguage(fixture.casos, language);
  for (const c of fixture.casos) for (const row of c.expected) {
    if (FIELDS.some(f => !Object.hasOwn(row, f))) throw new Error(`Caso ${c.id}: campos esperados incompletos.`);
  }
  if ((process.env.ALBATROSS_ADAPTER ?? 'qvac') !== 'qvac') throw new Error('Solo ALBATROSS_ADAPTER=qvac esta soportado.');
  const { QvacInferenceEngine } = await import(rel('src/adapters/inference/qvac/index.ts'));
  const { createSdkClient } = await import(rel('src/adapters/inference/qvac/sdk-client.ts'));
  const { inspectModels } = await import(rel('src/adapters/inference/qvac/model-pack.ts'));
  const { deriveStatus, deriveConfidence } = await import(rel('src/domain/index.ts'));
  const pack = inspectModels();
  if (!pack.ready) throw new Error('Faltan modelos completos. Ejecuta npm run models. No se reemplazo el reporte.');
  const startedAt = new Date().toISOString();
  const dir = `${outputDir.replace(/[\\/]+$/g, '')}/${startedAt.replaceAll(':', '-')}-${language}`;
  mkdirSync(rel(dir), { recursive: true });
  const sourceFiles = ['scripts/measurement-core.mjs', 'scripts/measure.mjs', 'fixtures/voice-tests.json', 'src/domain/derive.ts', 'src/adapters/inference/qvac/schema.ts', 'src/adapters/inference/qvac/parse-output.ts', 'src/adapters/inference/qvac/sdk-client.ts'];
  const metadata = { evaluatorVersion: 2, startedAt, language, expectedCaseIds: fixture.casos.map(c => c.id), node: process.version, sdk: readJson('node_modules/@qvac/sdk/package.json').version,
    hardware: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model }, models: pack,
    modelConfig: { ctx_size: 4096 }, ageAliases: AGE_ALIASES,
    sourceHashes: Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(rel(path))).digest('hex')])) };
  let trace = null;
  const engine = new QvacInferenceEngine({ enabled: true, clientFactory: () => createSdkClient(message => console.log(message), value => { trace = value; }, undefined, { profiler: true }) });
  const run = { metadata, warmup: null, results: [], summary: null, error: null };
  const artifact = `${dir}/run.json`;
  try {
    console.log(`Calentando Qwen; idioma ${language}...`);
    let warmupError = null;
    try { await engine.extractObservations({ hospitalId: 'warmup', transcript: 'Warmup.' }); }
    catch (error) { warmupError = `${error.code ?? error.name}: ${error.message}`; }
    run.warmup = { trace, error: warmupError };
    if (warmupError && !trace) throw new Error(`No se pudo calentar el modelo: ${warmupError}`);
    for (const c of fixture.casos) {
      trace = null;
      const start = performance.now();
      let output = null, error = null;
      try { output = await engine.extractObservations({ hospitalId: `case-${c.id}`, transcript: c[language] }); }
      catch (failure) { error = `${failure.code ?? failure.name}: ${failure.message}`; }
      const latencyMs = performance.now() - start;
      const emitted = toRows(output?.data);
      const result = { id: c.id, transcript: c[language], expected: c.expected, trace, output, emitted, error, latencyMs,
        evaluation: evaluateCase(c.expected, emitted, error), status: deriveStatus('Voice', c[language]), confidence: deriveConfidence(c[language]) };
      run.results.push(result);
      saveJson(artifact, run);
      console.log(`Caso ${c.id}: ${ms(latencyMs)} ms; ${emitted.length}/${c.expected.length} filas; ${error ?? (result.evaluation.exact ? 'exacto' : 'diferencias')}`);
    }
    run.summary = summarize(run.results);
  } catch (error) {
    run.error = error.message;
    throw error;
  } finally {
    try { await engine.close(); }
    finally { saveJson(artifact, run); console.log(`Diagnostico: ${artifact}`); }
  }
  const report = renderReport(run, artifact);
  if (outputAt < 0) writeFileSync(rel(language === 'es' ? 'REPORT.es.md' : 'REPORT.md'), report);
  writeFileSync(rel(`${dir}/REPORT.md`), renderReport(run, 'run.json'));
  console.log(JSON.stringify({ ...run.summary, fields: undefined }, null, 2));
  if (run.summary.errors) process.exitCode = 1;
}
await main();

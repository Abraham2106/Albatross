import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELDS, compare, normAge, normText, pair, quantile, toRows, validateLanguage, validateReplay, evaluateCase, summarize } from './measurement-core.mjs';

test('normalizes accents and bilingual qualitative age aliases', () => {
  assert.equal(normText('Panamá'), 'panama');
  assert.equal(normAge('más nuevas'), 'newer');
  assert.equal(normAge('muy viejas'), 'very old');
});

test('qualitative age is a separate field and model/approximation survive normalization', () => {
  const rows = toRows({ mentionedHospital: { name: 'X' }, candidates: [{ modality: 'US', quantity: 6, quantityApproximate: true, brand: null, model: 'M', ageYears: null, ageApproximate: false, ageDescription: 'new' }] });
  assert.equal(rows[0].modalidad, 'Ultrasound');
  assert.equal(rows[0].cantidad_aprox, true);
  assert.equal(rows[0].modelo, 'M');
  assert.equal(rows[0].edad_cualitativa, 'new');
  assert.equal(compare('edad', { edad: null, edad_cualitativa: 'new' }, rows[0]), 'exact');
  assert.equal(compare('edad_cualitativa', { edad_cualitativa: 'new' }, { edad_cualitativa: 'new' }), 'exact');
});

test('pairs duplicate modalities independent of emitted order and reports extras', () => {
  const expected = [{ modalidad: 'MR', cantidad: 2, edad_cualitativa: 'old' }, { modalidad: 'MR', cantidad: 1, edad_cualitativa: 'newer' }];
  const out = pair(expected, [{ modalidad: 'MRI', cantidad: 1, edad_cualitativa: 'newer' }, { modalidad: 'MR', cantidad: 2, edad_cualitativa: 'old' }, { modalidad: 'MR', cantidad: 9 }]);
  assert.deepEqual(out.pairs.map(x => x.emitted.cantidad), [2, 1]);
  assert.equal(out.extra.length, 1);
});

test('missing rows are misses and quantiles interpolate even samples', () => {
  assert.equal(compare('cantidad', { cantidad: 2 }, null), 'miss');
  assert.equal(quantile([10, 20, 30, 40], 0.5), 25);
  assert.ok(Math.abs(quantile([1, 2, 3, 4], 0.95) - 3.85) < 1e-12);
});

const fixture = JSON.parse(readFileSync(new URL('../fixtures/voice-tests.json', import.meta.url), 'utf8'));
const resultFor = (expected, emitted, extra = {}) => ({ expected, emitted, error: null, latencyMs: 10, ...extra,
  evaluation: evaluateCase(expected, emitted, extra.error) });

test('rejects absent and whitespace-only translations instead of silently using English', () => {
  assert.throws(() => validateLanguage([{ id: 1, en: 'English', es: '' }], 'es'), /casos 1/);
  assert.throws(() => validateLanguage([{ id: 2, en: 'English', es: '  ' }], 'es'), /casos 2/);
  assert.throws(() => validateLanguage([{ id: 3, es: 'Español' }], 'en'), /casos 3/);
  assert.throws(() => validateLanguage([], 'es'), /sin casos/);
  validateLanguage(fixture.casos, 'en');
  validateLanguage(fixture.casos, 'es');
});

test('perfect, silent, and inventing extractors have distinct scores over all fixture fields', () => {
  const perfect = summarize(fixture.casos.map(c => resultFor(c.expected, c.expected.map(r => ({ ...r })))));
  assert.equal(perfect.exactRows, 16);
  assert.equal(perfect.exactCases, 10);
  assert.equal(perfect.precision, 1);
  assert.equal(perfect.recall, 1);
  assert.equal(Object.values(perfect.fields).reduce((s, t) => s + t.exact, 0), 16 * FIELDS.length);
  const silent = summarize(fixture.casos.map(c => resultFor(c.expected, [])));
  assert.equal(silent.recall, 0);
  assert.equal(silent.precision, null);
  assert.equal(silent.missing, 16);
  assert.equal(silent.fields.ciudad.exact, 0);
  const inventor = summarize(fixture.casos.map(c => resultFor(c.expected, c.expected.map(r => ({ ...r, marca: r.marca ?? 'Invented' })))));
  assert.equal(inventor.brandModelFillCases, 6);
  assert.ok(inventor.fields.marca.relleno > 0);
});

test('extra rows lower precision and every penalized field, even all-null extra attributes', () => {
  const expected = fixture.casos[0].expected;
  const evaluation = summarize([resultFor(expected, [...expected, { modalidad: 'CT' }])]);
  assert.equal(evaluation.extra, 1);
  assert.equal(evaluation.exactCases, 0);
  assert.equal(evaluation.precision, 2 / 3);
  assert.equal(evaluation.recall, 1);
  assert.equal(evaluation.fields.ciudad.accuracy, 1);
  assert.equal(evaluation.fields.ciudad.penalizedAccuracy, 2 / 3);
});

test('missing qualitative age, wrong model and wrong approximation make the case non-exact', () => {
  const expected = fixture.casos[4].expected;
  const output = [{ ...expected[0], edad_cualitativa: null, modelo: 'Invented', cantidad_aprox: false }];
  const result = evaluateCase(expected, output);
  assert.equal(result.exact, false);
  assert.equal(result.exactRows, 0);
  assert.deepEqual(result.differences.map(d => d.field).sort(), ['cantidad_aprox', 'edad_cualitativa', 'modelo']);
  assert.equal(compare('edad_cualitativa', { edad_cualitativa: 'very old' }, { edad_cualitativa: 'old' }), 'miss');
  assert.equal(compare('edad_cualitativa', { edad_cualitativa: 'newer' }, { edad_cualitativa: 'new' }), 'miss');
});

test('global assignment handles 50 same-modality rows and ignores their order', () => {
  const expected = Array.from({ length: 50 }, (_, i) => ({ ...fixture.casos[0].expected[0], cantidad: i }));
  const output = [...expected].reverse();
  const result = evaluateCase(expected, output);
  assert.equal(result.exactRows, 50);
  assert.equal(result.exact, true);
});

test('global assignment agrees with exhaustive exact-row matching for small ambiguous groups', () => {
  const base = fixture.casos[0].expected[0];
  const expected = [{ ...base, cantidad: 1 }, { ...base, cantidad: 2 }, { ...base, cantidad: 3 }];
  const variants = [{ ...base, cantidad: 2 }, { ...base, cantidad: 1, marca: 'Other' }, { ...base, cantidad: 1 }, { ...base, cantidad: 7 }];
  let best = 0;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    if (new Set([a, b, c]).size !== 3) continue;
    const exact = [a, b, c].filter((v, i) => FIELDS.every(f => compare(f, expected[i], variants[v]) === 'exact')).length;
    best = Math.max(best, exact);
  }
  assert.equal(evaluateCase(expected, variants).exactRows, best);
  assert.equal(evaluateCase(expected, [...variants].reverse()).exactRows, best);
});

test('never pairs different modalities and keeps missing/extra counts explicit', () => {
  const expected = [fixture.casos[0].expected[0]];
  const result = evaluateCase(expected, [{ ...expected[0], modalidad: 'CT' }]);
  assert.equal(result.missing, 1);
  assert.equal(result.extra.length, 1);
  assert.equal(result.exactRows, 0);
  assert.equal(pair([{ modalidad: 'X-Ray' }], [{ modalidad: 'x-ray' }]).extra.length, 0);
});

test('separates errors, truncations, successful latencies and absent positive examples', () => {
  const rows = fixture.casos[0].expected;
  const s = summarize([
    resultFor(rows, rows, { latencyMs: 20 }),
    resultFor(rows, rows, { latencyMs: 40 }),
    resultFor(rows, [], { latencyMs: 10000, error: 'INVALID_OUTPUT', trace: { result: { stopReason: 'length' } } }),
  ]);
  assert.equal(s.errors, 1);
  assert.equal(s.truncations, 1);
  assert.equal(s.unknownStopReasons, 2);
  assert.equal(s.latency.p50, 30);
  assert.equal(s.latency.p95, 39);
  assert.equal(s.fields.ciudad.present, 0);
  assert.equal(quantile([], .5), null);
});

test('replay rejects interrupted suites and duplicate case IDs', () => {
  const run = { metadata: { expectedCaseIds: [1, 2] }, results: [{ id: 1 }, { id: 2 }], summary: {}, error: null };
  validateReplay(run);
  assert.throws(() => validateReplay({ ...run, summary: null }), /no se completo/);
  assert.throws(() => validateReplay({ ...run, results: [{ id: 1 }] }), /no se completo/);
  assert.throws(() => validateReplay({ ...run, results: [{ id: 1 }, { id: 1 }] }), /no se completo/);
});

test('failed extraction cannot earn exact groups from a partial output', () => {
  const rows = fixture.casos[0].expected;
  const result = resultFor(rows, rows, { error: 'INVALID_OUTPUT' });
  assert.equal(result.evaluation.exactRows, 0);
  assert.equal(result.evaluation.missing, 2);
  const summary = summarize([result]);
  assert.equal(summary.emitted, 0);
  assert.equal(summary.fields.cantidad.exact, 0);
});

test('a concrete brand or model against an Unknown reference is invention, silence is a miss', () => {
  const four = fixture.casos[3], ten = fixture.casos[9];
  assert.equal(compare('marca', four.expected[0], { ...four.expected[0], marca: 'Zenith MedTech' }), 'relleno');
  assert.equal(compare('marca', four.expected[0], { ...four.expected[0], marca: null }), 'miss');
  assert.equal(compare('modelo', ten.expected[0], { ...ten.expected[0], modelo: 'AH-MR 650' }), 'relleno');
  const honest = summarize([resultFor(four.expected, four.expected), resultFor(ten.expected, ten.expected)]);
  assert.equal(honest.brandFillCases, 0);
  assert.equal(honest.brandModelFillCases, 0);
  const inventor = summarize([
    resultFor(four.expected, four.expected.map(r => ({ ...r, marca: 'Zenith MedTech' }))),
    resultFor(ten.expected, ten.expected.map(r => ({ ...r, modelo: 'AH-MR 650' }))),
  ]);
  assert.equal(inventor.brandFillCases, 1);
  assert.equal(inventor.brandModelFillCases, 2);
  const unknownExtra = summarize([resultFor(four.expected, [...four.expected, { ...four.expected[0], modalidad: 'Ultrasound' }])]);
  assert.equal(unknownExtra.brandFillCases, 0);
});

export const MODALITY_ALIASES = {
  MR: 'MR', MRI: 'MR', CT: 'CT', SCANNER: 'CT', CTS: 'CT',
  US: 'Ultrasound', ULTRASOUND: 'Ultrasound', ECOGRAFIA: 'Ultrasound',
  'X-RAY': 'X-Ray', 'PATIENT MONITORING': 'Patient Monitoring', 'IMAGE GUIDED THERAPY': 'Image Guided Therapy',
};
export const AGE_ALIASES = {
  viejo: 'old', vieja: 'old', viejos: 'old', viejas: 'old', antiguo: 'old', antigua: 'old', antiguos: 'old', antiguas: 'old',
  'muy viejo': 'very old', 'muy vieja': 'very old', 'muy viejos': 'very old', 'muy viejas': 'very old',
  nuevo: 'new', nueva: 'new', nuevos: 'new', nuevas: 'new', 'mas nueva': 'newer', 'mas nuevas': 'newer', 'más nuevo': 'newer', 'mas nuevo': 'newer', 'más nuevos': 'newer', 'mas nuevos': 'newer',
  reciente: 'recent', recientes: 'recent', recientemente: 'recent', 'instalado recientemente': 'recent', 'instalada recientemente': 'recent',
  'recently installed': 'recent', 'mostly new': 'new', 'much newer': 'newer',
  'casi todas nuevas': 'new', 'mucho mas nuevo': 'newer', 'mucho mas nueva': 'newer'
};
export const normText = value => typeof value === 'string'
  ? value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '') : value ?? null;
export const normModality = value => {
  if (typeof value !== 'string') return null;
  const normalized = normText(value).toUpperCase();
  return MODALITY_ALIASES[normalized] ?? normalized;
};
export const normAge = value => { const t = normText(value); return typeof t === 'string' ? AGE_ALIASES[t] ?? t : t; };
export const pick = (row, field) => row?.[field] ?? null;

export function toRows(data) {
  const candidates = data?.candidates ?? [], mentioned = data?.mentionedHospital ?? {};
  if (candidates.length && candidates[0].field === undefined) return candidates.map(c => ({
    cliente: mentioned.name ?? null, pais: mentioned.country ?? null, ciudad: mentioned.city ?? null,
    modalidad: normModality(c.modality), cantidad: c.quantity ?? null, cantidad_aprox: c.quantityApproximate ?? null,
    marca: c.brand ?? null, modelo: c.model ?? null, edad: c.ageYears ?? null,
    edad_aprox: c.ageApproximate ?? null, edad_cualitativa: c.ageDescription ?? null,
  }));
  const groups = new Map();
  for (const c of candidates) {
    const key = normModality(c.modality);
    if (!groups.has(key)) groups.set(key, { cliente: null, pais: null, ciudad: null, modalidad: key, cantidad: null, cantidad_aprox: false, marca: null, modelo: null, edad: null, edad_aprox: false, edad_cualitativa: null });
    const row = groups.get(key);
    if (c.field === 'count') { row.cantidad = c.value; row.cantidad_aprox = c.quantityApproximate ?? c.approximate ?? false; }
    if (c.field === 'ageYears') { row.edad = c.value; row.edad_aprox = c.ageApproximate ?? c.approximate ?? false; }
    if (c.field === 'ageDescription') row.edad_cualitativa = c.value;
  }
  return [...groups.values()];
}

export const FIELDS = ['cliente', 'pais', 'ciudad', 'modalidad', 'cantidad', 'cantidad_aprox', 'marca', 'modelo', 'edad', 'edad_aprox', 'edad_cualitativa'];
export function compare(field, expected, row) {
  if (row == null) return 'miss';
  const wantRaw = pick(expected, field), gotRaw = pick(row, field);
  const want = field === 'modalidad' ? normModality(wantRaw) : field === 'edad_cualitativa' ? normAge(wantRaw) : wantRaw;
  const got = field === 'modalidad' ? normModality(gotRaw) : field === 'edad_cualitativa' ? normAge(gotRaw) : gotRaw;
  if (want === null) return got === null ? 'exact' : 'relleno';
  if (got === null) return 'miss';
  if (typeof want === 'number') return Number(got) === want ? 'exact' : 'miss';
  if (typeof want === 'boolean') return got === want ? 'exact' : 'miss';
  return normText(got) === normText(want) ? 'exact' : 'miss';
}

// Rectangular Hungarian assignment: polynomial even at the contract limit of 50 rows.
function assign(cost) {
  const n = cost.length;
  if (!n) return [];
  const m = cost[0].length;
  const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const min = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const current = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (current < min[j]) { min[j] = current; way[j] = j0; }
        if (min[j] < delta) { delta = min[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else min[j] -= delta;
      }
      j0 = j1;
    } while (p[j0]);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const choices = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) choices[p[j] - 1] = j - 1;
  return choices;
}
function pairGroup(expected, emitted) {
  const base = (expected.length + emitted.length + 1) * (FIELDS.length + 1);
  const costs = expected.map(e => [...emitted.map(r => {
    const equal = FIELDS.filter(f => compare(f, e, r) === 'exact').length;
    // Exact rows first, then cardinality, then individual matching fields.
    return -(equal === FIELDS.length ? base * base : 0) - base - equal;
  }), ...expected.map(() => 0)]);
  const choices = assign(costs), used = new Set(choices.filter(j => j >= 0 && j < emitted.length));
  return { pairs: expected.map((e, i) => ({ expected: e, emitted: emitted[choices[i]] ?? null })), extra: emitted.filter((_, j) => !used.has(j)) };
}
export function pair(expected, emitted) {
  const modalities = [...new Set([...expected, ...emitted].map(r => normModality(pick(r, 'modalidad'))))];
  const pairs = [], extra = [];
  for (const modality of modalities) { const e = expected.filter(r => normModality(pick(r, 'modalidad')) === modality), r = emitted.filter(x => normModality(pick(x, 'modalidad')) === modality); const out = pairGroup(e, r); pairs.push(...out.pairs); extra.push(...out.extra); }
  return { pairs, extra };
}
export const quantile = (values, p) => { const a = [...values].sort((x, y) => x - y); if (!a.length) return null; const pos = (a.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };

export function validateLanguage(cases, language) {
  if (!['en', 'es'].includes(language)) throw new Error(`Idioma no soportado: ${language}`);
  if (!Array.isArray(cases) || !cases.length) throw new Error('Fixture sin casos.');
  const missing = cases.filter(c => typeof c[language] !== 'string' || !c[language].trim());
  if (missing.length) throw new Error(`Fixture sin transcripcion ${language}: casos ${missing.map(c => c.id).join(', ')}`);
}

export function evaluateCase(expected, emitted, error = null) {
  // Partial data from a failed request is diagnostic only, never a scored success.
  if (error) emitted = [];
  const { pairs, extra } = pair(expected, emitted);
  const differences = pairs.flatMap(p => FIELDS.flatMap(field => {
    const verdict = compare(field, p.expected, p.emitted);
    return verdict === 'exact' ? [] : [{ expectedIndex: expected.indexOf(p.expected), emittedIndex: p.emitted ? emitted.indexOf(p.emitted) : null,
      field, expected: pick(p.expected, field), actual: pick(p.emitted, field), verdict }];
  }));
  const exactRows = pairs.filter(p => FIELDS.every(f => compare(f, p.expected, p.emitted) === 'exact')).length;
  return { pairs, extra, differences, exactRows,
    exact: !error && !differences.length && !extra.length,
    missing: pairs.filter(p => !p.emitted).length,
    brandModelFill: differences.some(d => ['marca', 'modelo'].includes(d.field) && d.verdict === 'relleno')
      || extra.some(r => r.marca != null || r.modelo != null) };
}

export function summarize(results) {
  const expected = results.reduce((s, r) => s + r.expected.length, 0);
  const emitted = results.reduce((s, r) => s + (r.error ? 0 : r.emitted.length), 0);
  const exactRows = results.reduce((s, r) => s + r.evaluation.exactRows, 0);
  const extra = results.reduce((s, r) => s + r.evaluation.extra.length, 0);
  const ratio = (n, d) => d ? n / d : null;
  const fields = Object.fromEntries(FIELDS.map(field => {
    const t = { exact: 0, miss: 0, relleno: 0, present: 0, presentExact: 0, absent: 0, absentExact: 0, extraValues: 0 };
    for (const r of results) {
      for (const p of r.evaluation.pairs) {
        const verdict = compare(field, p.expected, p.emitted);
        t[verdict]++;
        const prefix = pick(p.expected, field) === null ? 'absent' : 'present';
        t[prefix]++;
        if (verdict === 'exact') t[`${prefix}Exact`]++;
      }
      t.extraValues += r.evaluation.extra.filter(row => pick(row, field) !== null).length;
    }
    return [field, { ...t, accuracy: ratio(t.exact, expected), penalizedAccuracy: ratio(t.exact, expected + extra) }];
  }));
  const success = results.filter(r => !r.error);
  return { cases: results.length, expected, emitted, exactRows, extra,
    missing: results.reduce((s, r) => s + r.evaluation.missing, 0),
    precision: ratio(exactRows, emitted), recall: ratio(exactRows, expected), f1: ratio(2 * exactRows, emitted + expected),
    exactCases: results.filter(r => r.evaluation.exact).length,
    errors: results.filter(r => r.error).length,
    truncations: results.filter(r => r.trace?.result?.stopReason === 'length').length,
    unknownStopReasons: results.filter(r => !r.trace?.result?.stopReason).length,
    brandModelFillCases: results.filter(r => r.evaluation.brandModelFill).length,
    latency: { samples: success.length, p50: quantile(success.map(r => r.latencyMs), .5), p95: quantile(success.map(r => r.latencyMs), .95) }, fields };
}

export function validateReplay(run) {
  const expectedIds = run.metadata?.expectedCaseIds;
  const actualIds = run.results?.map(r => r.id);
  if (run.error || !run.summary || !Array.isArray(expectedIds) || !expectedIds.length || !actualIds
    || actualIds.length !== expectedIds.length || new Set(actualIds).size !== expectedIds.length
    || expectedIds.some(id => !actualIds.includes(id))) {
    throw new Error('La ejecucion guardada no se completo o no declara todos sus casos esperados.');
  }
}

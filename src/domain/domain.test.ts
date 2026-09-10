import { strict as assert } from "node:assert";
import { describe, it } from "vitest";

import {
  applyColdStartAnswer,
  aggregateByCountry,
  aggregateByModality,
  buildColdStartChecklist,
  buildReviewSummary,
  buildSeedSites,
  calculateCertainty,
  certaintyBand,
  compareCandidate,
  createSite,
  deriveConfidence,
  deriveInstallYear,
  deriveStatus,
  deterministicId,
  explainCertainty,
  findMatchingGroupIndex,
  findRefreshOpportunities,
  isBareTotalClaim,
  mergeAll,
  mergeCandidate,
  normalizeBrand,
  normalizeModality,
  openDisputes,
  parseApproxAge,
  rankMissingFields,
  resolveDispute,
  siteIdFor,
  sitesNeedingAttention,
  totalQuantity,
  UnknownModalityError,
  type Candidate,
  type Site,
} from "./index";

const NOW = "2026-09-09T12:00:00.000Z";

function alpha(): Site {
  return createSite({
    id: "hospital-democare-horizon",
    name: "Hospital DemoCare Horizon",
    city: "Sao Paulo",
    country: "Brazil",
    profileType: "hospital_general",
  });
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    siteId: "hospital-democare-horizon",
    modality: "MR",
    quantity: 3,
    source: { author: "Field User 01", timestamp: "2026-09-01T10:00:00.000Z", channel: "Voice" },
    ...over,
  };
}

// ---------------------------------------------------------------- normalizacion
describe("normalizacion", () => {
  it("mapea sinonimos en ingles y espaniol", () => {
    assert.equal(normalizeModality("MRI"), "MR");
    assert.equal(normalizeModality("resonancia magnetica"), "MR");
    assert.equal(normalizeModality("CT scanners"), "CT");
    assert.equal(normalizeModality("tomografo"), "CT");
    assert.equal(normalizeModality("ecografo"), "Ultrasound");
    assert.equal(normalizeModality("rayos X"), "X-Ray");
  });

  it("devuelve null en vez de inventar una modalidad", () => {
    assert.equal(normalizeModality("licuadora industrial"), null);
  });

  it("corrige marcas mal transcritas sin forzar el catalogo", () => {
    assert.equal(normalizeBrand("nova med"), "NovaMed");
    assert.equal(normalizeBrand("Aurelia Helth"), "Aurelia Health");
    assert.equal(normalizeBrand(undefined), "Unknown");
    assert.equal(normalizeBrand("Siemens Healthineers"), "Siemens Healthineers");
  });

  it("rechaza modalidad desconocida al fusionar", () => {
    assert.throws(
      () => mergeCandidate(alpha(), candidate({ modality: "licuadora" })),
      UnknownModalityError
    );
  });
});

// ---------------------------------------------------------------- derivaciones
describe("derivaciones", () => {
  it("infiere confianza del lenguaje", () => {
    assert.equal(deriveConfidence("Confirmé que son cuatro"), "High");
    assert.equal(deriveConfidence("maybe around eight years"), "Medium");
    assert.equal(deriveConfidence("I could not see the model"), "Low");
    assert.equal(deriveConfidence(undefined), "Low");
  });

  it("infiere estado y prioriza la foto", () => {
    assert.equal(deriveStatus("Photo", "dos MR"), "Confirmed");
    assert.equal(deriveStatus("Voice", "Eight is my best estimate."), "Estimated");
    assert.equal(deriveStatus("Voice", "Yes, all Zenith MedTech."), "Reported");
    assert.equal(deriveStatus("Voice", "I don't know"), "Unknown");
  });

  it("deriva anio de instalacion solo si hay edad", () => {
    assert.equal(deriveInstallYear("2026-08-18T00:00:00.000Z", 7), 2019);
    assert.equal(deriveInstallYear("2026-08-18T00:00:00.000Z", undefined), undefined);
  });

  it("parsea edades en rango, numero y palabra", () => {
    assert.equal(parseApproxAge("between 5 and 7 years"), 6);
    assert.equal(parseApproxAge("around 11 years"), 11);
    assert.equal(parseApproxAge("maybe around thirteen years"), 13);
    assert.equal(parseApproxAge("recently installed"), 2);
    assert.equal(parseApproxAge("no tengo idea"), undefined);
  });

  it("genera ids deterministas", () => {
    assert.equal(deterministicId("obs", "a", 1), deterministicId("obs", "a", 1));
    assert.notEqual(deterministicId("obs", "a", 1), deterministicId("obs", "a", 2));
  });
});

// ---------------------------------------------------------------- fusion
describe("fusion de candidatos", () => {
  it("crea la modalidad cuando el sitio esta vacio", () => {
    const { site, comparison } = mergeCandidate(alpha(), candidate());
    assert.equal(comparison.kind, "new");
    assert.equal(site.facts.length, 1);
    assert.equal(totalQuantity(site.facts[0]), 3);
    assert.equal(site.lastUpdated, "2026-09-01T10:00:00.000Z");
  });

  it("distingue afirmacion de total de afirmacion de lote", () => {
    assert.equal(isBareTotalClaim(candidate()), true);
    assert.equal(isBareTotalClaim(candidate({ brand: "NovaMed" })), false);
    assert.equal(isBareTotalClaim(candidate({ approxAgeYears: 7 })), false);
  });

  it("corrobora y eleva a High con dos autores distintos", () => {
    const first = mergeCandidate(alpha(), candidate({ brand: "NovaMed", approxAgeYears: 7 })).site;
    const second = mergeCandidate(
      first,
      candidate({
        brand: "NovaMed",
        approxAgeYears: 7,
        source: { author: "Sales User 02", timestamp: "2026-09-03T10:00:00.000Z", channel: "Voice" },
      })
    );
    assert.equal(second.comparison.kind, "corroboration");
    const group = second.site.facts[0]!.groups[0]!;
    assert.equal(group.confidence, "High");
    assert.equal(group.status, "Confirmed");
    assert.equal(group.observations.length, 2);
  });

  it("agrega un lote nuevo cuando cambia marca o edad (caso Horizon)", () => {
    const first = mergeCandidate(alpha(), candidate({ quantity: 3, brand: "BluePeak Medical", approxAgeYears: 9 })).site;
    const second = mergeCandidate(first, candidate({ quantity: 1, brand: "BluePeak Medical", approxAgeYears: 3 })).site;
    const fact = second.facts[0]!;
    assert.equal(fact.groups.length, 2);
    assert.equal(totalQuantity(fact), 4);
  });

  it("abre disputa ante un total contradictorio y NO sobrescribe", () => {
    const base = mergeCandidate(alpha(), candidate({ quantity: 3, brand: "NovaMed", approxAgeYears: 7 })).site;
    const result = mergeCandidate(
      base,
      candidate({
        quantity: 4,
        rawAnswerText: "Confirmé que hay cuatro MR",
        source: { author: "Sales User 02", timestamp: "2026-09-05T10:00:00.000Z", channel: "Voice" },
      })
    );
    assert.equal(result.comparison.kind, "conflict");
    assert.ok(result.openedDispute);
    assert.equal(openDisputes(result.site).length, 1);
    // el valor original sigue intacto: el conflicto no decide por si solo
    assert.equal(totalQuantity(result.site.facts[0]), 3);
    assert.match(result.openedDispute!.question, /3 o 4/);
  });

  it("resuelve una disputa y ajusta la cantidad al valor elegido", () => {
    const base = mergeCandidate(alpha(), candidate({ quantity: 3, brand: "NovaMed", approxAgeYears: 7 })).site;
    const conflicted = mergeCandidate(
      base,
      candidate({
        quantity: 4,
        source: { author: "Sales User 02", timestamp: "2026-09-05T10:00:00.000Z", channel: "Voice" },
      })
    );
    const resolved = resolveDispute(conflicted.site, conflicted.openedDispute!.disputeId, 4, NOW);
    assert.equal(totalQuantity(resolved.facts[0]), 4);
    assert.equal(openDisputes(resolved).length, 0);
    assert.equal(resolved.facts[0]!.groups[0]!.status, "Confirmed");
  });

  it("es idempotente: la misma observacion dos veces no duplica evidencia", () => {
    const c = candidate({ brand: "NovaMed", approxAgeYears: 7 });
    const once = mergeCandidate(alpha(), c).site;
    const twice = mergeCandidate(once, c).site;
    assert.equal(twice.facts[0]!.groups[0]!.observations.length, 1);
    assert.equal(totalQuantity(twice.facts[0]), 3);
  });

  it("no muta el sitio de entrada", () => {
    const original = alpha();
    const snapshot = JSON.stringify(original);
    mergeCandidate(original, candidate());
    assert.equal(JSON.stringify(original), snapshot);
  });

  it("completa marca desconocida sin pisar una ya conocida", () => {
    const base = mergeCandidate(alpha(), candidate({ approxAgeYears: 7 })).site;
    assert.equal(base.facts[0]!.groups[0]!.brand, "Unknown");
    const filled = mergeCandidate(base, candidate({ brand: "NovaMed", approxAgeYears: 7 })).site;
    assert.equal(filled.facts[0]!.groups[0]!.brand, "NovaMed");
  });

  it("compareCandidate no toca el estado", () => {
    const base = mergeCandidate(alpha(), candidate({ brand: "NovaMed", approxAgeYears: 7 })).site;
    const result = compareCandidate(base.facts[0], candidate({ quantity: 3 }));
    assert.equal(result.kind, "corroboration");
    assert.equal(findMatchingGroupIndex(base.facts[0]!, candidate({ brand: "NovaMed", approxAgeYears: 7 })), 0);
  });
});

// ---------------------------------------------------------------- arranque en frio
describe("arranque en frio", () => {
  it("propone el perfil tipico cuando no hay datos", () => {
    const checklist = buildColdStartChecklist(alpha());
    assert.ok(checklist.length >= 3);
    assert.ok(checklist.every((c) => c.assumed));
    assert.ok(checklist.some((c) => c.modality === "MR"));
  });

  it("deja de proponer lo que ya se sabe", () => {
    const withMr = mergeCandidate(alpha(), candidate()).site;
    const checklist = buildColdStartChecklist(withMr);
    assert.equal(checklist.some((c) => c.modality === "MR"), false);
  });

  it("registra un 'no' como dato negativo valioso", () => {
    const answered = applyColdStartAnswer(alpha(), "MR", "no", "Field User 01", "2026-09-02T10:00:00.000Z");
    assert.equal(totalQuantity(answered.facts[0]), 0);
    const missions = rankMissingFields(answered, NOW, 5);
    assert.equal(missions.some((m) => m.modality === "MR"), false);
  });

  it("un 'no se' no ensucia el estado", () => {
    const before = alpha();
    const after = applyColdStartAnswer(before, "MR", "unknown", "Field User 01", "2026-09-02T10:00:00.000Z");
    assert.equal(after.facts.length, 0);
  });
});

// ---------------------------------------------------------------- certeza
describe("certeza", () => {
  it("un sitio vacio vale 0 y pinta rojo", () => {
    assert.equal(calculateCertainty(alpha(), NOW), 0);
    assert.equal(certaintyBand(0), "red");
  });

  it("sube al agregar datos confirmados", () => {
    const site = mergeAll(alpha(), [
      candidate({ brand: "NovaMed", approxAgeYears: 7, rawAnswerText: "Confirmé que son dos" }),
      candidate({ modality: "CT", quantity: 2, brand: "Aurelia Health", approxAgeYears: 5, rawAnswerText: "Confirmé" }),
    ]);
    assert.ok(calculateCertainty(site, NOW) > calculateCertainty(alpha(), NOW));
  });

  it("penaliza disputas abiertas", () => {
    const clean = mergeCandidate(alpha(), candidate({ brand: "NovaMed", approxAgeYears: 7, rawAnswerText: "Confirmé" })).site;
    const disputed = mergeCandidate(
      clean,
      candidate({ quantity: 9, source: { author: "Otro", timestamp: "2026-09-05T10:00:00.000Z", channel: "Voice" } })
    ).site;
    assert.ok(calculateCertainty(disputed, NOW) < calculateCertainty(clean, NOW));
  });

  it("penaliza informacion vieja", () => {
    const fresh = mergeCandidate(alpha(), candidate({ brand: "NovaMed", approxAgeYears: 7, rawAnswerText: "Confirmé" })).site;
    const old = mergeCandidate(
      alpha(),
      candidate({
        brand: "NovaMed",
        approxAgeYears: 7,
        rawAnswerText: "Confirmé",
        source: { author: "Field User 01", timestamp: "2024-01-01T10:00:00.000Z", channel: "Voice" },
      })
    ).site;
    assert.ok(calculateCertainty(old, NOW) < calculateCertainty(fresh, NOW));
  });

  it("el reporte desglosa el porcentaje", () => {
    const site = mergeCandidate(alpha(), candidate({ brand: "NovaMed", approxAgeYears: 7 })).site;
    const report = explainCertainty(site, NOW);
    assert.equal(report.siteId, "hospital-democare-horizon");
    assert.ok(report.perModality.length >= 5);
    assert.ok(report.perModality.some((m) => m.modality === "MR" && m.known));
    assert.ok(report.percent >= 0 && report.percent <= 100);
  });
});

// ---------------------------------------------------------------- misiones
describe("misiones", () => {
  it("un sitio vacio pide presencia de lo obligatorio primero", () => {
    const missions = rankMissingFields(alpha(), NOW, 3);
    assert.equal(missions.length, 3);
    assert.equal(missions[0]!.reason, "missing");
    assert.ok(["MR", "CT", "Ultrasound"].includes(missions[0]!.modality));
  });

  it("una disputa abierta encabeza la lista", () => {
    const base = mergeCandidate(alpha(), candidate({ brand: "NovaMed", approxAgeYears: 7 })).site;
    const disputed = mergeCandidate(
      base,
      candidate({ quantity: 4, source: { author: "Otro", timestamp: "2026-09-05T10:00:00.000Z", channel: "Voice" } })
    ).site;
    const missions = rankMissingFields(disputed, NOW, 3);
    assert.equal(missions[0]!.reason, "conflict");
  });

  it("pide marca cuando falta", () => {
    const site = mergeCandidate(alpha(), candidate({ approxAgeYears: 7 })).site;
    const missions = rankMissingFields(site, NOW, 8);
    assert.ok(missions.some((m) => m.field === "brand" && m.modality === "MR"));
  });

  it("marca como viejo lo no verificado en mucho tiempo", () => {
    const old = mergeCandidate(
      alpha(),
      candidate({
        brand: "NovaMed",
        approxAgeYears: 7,
        source: { author: "Field User 01", timestamp: "2024-01-01T10:00:00.000Z", channel: "Voice" },
      })
    ).site;
    const missions = rankMissingFields(old, NOW, 10);
    assert.ok(missions.some((m) => m.reason === "stale"));
  });

  it("arma el resumen de validacion del paso 12", () => {
    const site = mergeCandidate(alpha(), candidate({ quantity: 2, brand: "NovaMed", approxAgeYears: 7 })).site;
    const summary = buildReviewSummary(site);
    assert.match(summary, /2 MR/);
    assert.match(summary, /NovaMed/);
    assert.match(summary, /¿Es correcto\?/);
  });
});

// ---------------------------------------------------------------- dataset real
describe("dataset del patrocinador", () => {
  const sites = buildSeedSites();

  it("reconstruye 13 sitios a partir de 20 observaciones", () => {
    assert.equal(sites.length, 13);
  });

  it("Horizon conserva los dos lotes de MR", () => {
    const horizon = sites.find((s) => s.id === siteIdFor("Hospital DemoCare Horizon"))!;
    const mr = horizon.facts.find((f) => f.modality === "MR")!;
    assert.equal(mr.groups.length, 2);
    assert.equal(totalQuantity(mr), 4);
    assert.deepEqual(
      mr.groups.map((g) => g.approxAgeYears).sort(),
      [3, 9]
    );
  });

  it("Pacific tiene MR y CT de marcas distintas", () => {
    const pacific = sites.find((s) => s.id === siteIdFor("Hospital DemoCare Pacific"))!;
    assert.equal(pacific.facts.length, 2);
    assert.equal(pacific.facts.find((f) => f.modality === "MR")!.groups[0]!.brand, "NovaMed");
    assert.equal(pacific.facts.find((f) => f.modality === "CT")!.groups[0]!.brand, "Aurelia Health");
  });

  it("agrega equipos por modalidad", () => {
    const totals = aggregateByModality(sites);
    const ultrasound = totals.find((t) => t.modality === "Ultrasound")!;
    assert.equal(ultrasound.quantity, 23); // 5 + 6 + 8 + 4
    const ct = totals.find((t) => t.modality === "CT")!;
    assert.equal(ct.quantity, 12); // 1 + 2 + 2 + 1 + 3 + 2 + 1
  });

  it("agrega por pais", () => {
    const geo = aggregateByCountry(sites, NOW);
    assert.equal(geo.find((g) => g.country === "Brazil")!.sites, 2);
    assert.ok(geo.every((g) => g.averageCertainty >= 0 && g.averageCertainty <= 100));
  });

  it("detecta oportunidades de renovacion", () => {
    const opportunities = findRefreshOpportunities(sites, 10);
    assert.ok(opportunities.length >= 3);
    assert.equal(opportunities[0]!.approxAgeYears, 13); // Andes, CT BluePeak
    assert.ok(opportunities.every((o) => o.approxAgeYears >= 10));
  });

  it("prioriza los sitios con menos certeza", () => {
    const attention = sitesNeedingAttention(sites, NOW, 5);
    assert.equal(attention.length, 5);
    for (let i = 1; i < attention.length; i++) {
      assert.ok(attention[i - 1]!.certainty <= attention[i]!.certainty);
    }
  });

  it("es determinista: dos reconstrucciones dan el mismo estado", () => {
    assert.equal(JSON.stringify(buildSeedSites()), JSON.stringify(buildSeedSites()));
  });
});

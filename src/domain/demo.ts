/**
 * Demo end-to-end del dominio, sin QVAC ni Infra ni UI.
 * Ejecuta: npm run demo
 */
import {
  buildColdStartChecklist,
  buildReviewSummary,
  buildSeedSites,
  certaintyBand,
  createSite,
  explainCertainty,
  findRefreshOpportunities,
  mergeCandidate,
  openDisputes,
  rankMissingFields,
  resolveDispute,
  sitesNeedingAttention,
  type Candidate,
} from "./index";

const NOW = "2026-09-09T12:00:00.000Z";
const line = (t: string) => console.log(`\n=== ${t} ===`);

// 1. Sitio nuevo: cero datos
line("1. Sitio nuevo, cero datos");
let alpha = createSite({
  id: "hospital-democare-horizon",
  name: "Hospital DemoCare Horizon",
  city: "Sao Paulo",
  country: "Brazil",
  profileType: "hospital_general",
});
console.log("Certeza:", explainCertainty(alpha, NOW).percent + "%", "->", certaintyBand(0));
console.log("Perfil gris propuesto:", buildColdStartChecklist(alpha).map((c) => c.prompt));

// 2. Primer dictado
line("2. Primer dictado del ingeniero");
const first: Candidate = {
  siteId: alpha.id,
  modality: "MRI",
  quantity: 3,
  brand: "BluePeak Medical",
  approxAgeYears: 9,
  rawAnswerText: "Vi tres MR, parecen de unos nueve anios",
  source: { author: "Field User 01", timestamp: "2026-09-01T10:00:00.000Z", channel: "Voice" },
};
alpha = mergeCandidate(alpha, first).site;
const r1 = explainCertainty(alpha, NOW);
console.log("Certeza:", r1.percent + "%", "->", certaintyBand(r1.percent));
console.log("Misiones:", rankMissingFields(alpha, NOW, 3).map((m) => `[${m.reason}] ${m.prompt}`));

// 3. Lote nuevo dentro de la misma modalidad
line("3. Segundo lote de MR (mas nuevo)");
alpha = mergeCandidate(alpha, {
  ...first,
  quantity: 1,
  approxAgeYears: 3,
  rawAnswerText: "Uno es mucho mas nuevo, como tres anios",
  source: { author: "Field User 01", timestamp: "2026-09-01T10:05:00.000Z", channel: "Voice" },
}).site;
console.log(buildReviewSummary(alpha));

// 4. Conflicto
line("4. Otro colega dice que son 3 en total");
const conflict = mergeCandidate(alpha, {
  siteId: alpha.id,
  modality: "MR",
  quantity: 3,
  rawAnswerText: "Confirmé que hay tres MR",
  source: { author: "Sales User 02", timestamp: "2026-09-06T09:00:00.000Z", channel: "Voice" },
});
alpha = conflict.site;
console.log("Comparacion:", conflict.comparison.kind);
console.log("Disputa abierta:", openDisputes(alpha)[0]?.question);
console.log("Mision top:", rankMissingFields(alpha, NOW, 1)[0]?.prompt);

// 5. Resolucion
line("5. Se resuelve la disputa a favor de 4");
alpha = resolveDispute(alpha, conflict.openedDispute!.disputeId, 4, NOW);
const r2 = explainCertainty(alpha, NOW);
console.log("Disputas abiertas:", openDisputes(alpha).length);
console.log("Certeza:", r2.percent + "%", "->", certaintyBand(r2.percent));

// 6. Dataset del patrocinador
line("6. Dataset real del patrocinador");
const sites = buildSeedSites();
console.log("Sitios reconstruidos:", sites.length);
console.log(
  "Top oportunidades de renovacion:",
  findRefreshOpportunities(sites, 10)
    .slice(0, 3)
    .map((o) => `${o.siteName}: ${o.quantity} ${o.modality} de ~${o.approxAgeYears} anios`)
);
console.log(
  "Sitios que mas necesitan visita:",
  sitesNeedingAttention(sites, NOW, 3).map((s) => `${s.name} (${s.certainty}%, ${s.band})`)
);

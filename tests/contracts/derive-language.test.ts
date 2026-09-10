import { strict as assert } from "node:assert";
import { describe, it } from "vitest";

import { deriveConfidence, deriveStatus } from "../../src/domain/derive";

describe("derivaciones: vocabulario bilingue y frases completas", () => {
  it("mantiene la precedencia Unknown sobre cualquier matiz", () => {
    assert.equal(deriveConfidence("No sé, quizás unos nueve años"), "Low");
    assert.equal(deriveStatus("Voice", "No sé, quizás unos nueve años"), "Unknown");
  });

  it("reconoce estimaciones comunes en español", () => {
    for (const answer of [
      "Quizá de diez años",
      "Quizá hay unas 5 máquinas",
      "Parecen unos nueve equipos",
      "Casi todas son de la misma marca",
    ]) {
      assert.equal(deriveConfidence(answer), "Medium", answer);
      assert.equal(deriveStatus("Voice", answer), "Estimated", answer);
    }
  });

  it("no confunde palabras que contienen el marcador no se", () => {
    assert.equal(deriveConfidence("Uno se ve en buen estado"), "High");
    assert.equal(deriveStatus("Voice", "Uno se ve en buen estado"), "Reported");
    assert.equal(deriveConfidence("Unos equipos están instalados"), "High");
    assert.equal(deriveStatus("Voice", "Unos equipos están instalados"), "Reported");
    assert.equal(deriveStatus("Voice", "Los modelos son desconocidos"), "Unknown");
  });

  it("conserva los marcadores de estimación en inglés", () => {
    assert.equal(deriveConfidence("Maybe around eight years"), "Medium");
    assert.equal(deriveStatus("Voice", "Eight is my best estimate."), "Estimated");
    assert.equal(deriveConfidence("I could not see the model"), "Low");
  });

  it("detecta estimaciones numéricas sin depender de otros marcadores", () => {
    for (const answer of ["De unos once años", "Unas seis unidades", "Unos 24 equipos", "Unos veintidós equipos", "Unos treinta y dos equipos"]) {
      assert.equal(deriveStatus("Voice", answer), "Estimated", answer);
      assert.equal(deriveConfidence(answer), "Medium", answer);
    }
  });

  it("respeta límites de palabra, puntuación y precedencia existente", () => {
    assert.equal(deriveStatus("Voice", "Unconfirmed equipment"), "Reported");
    assert.equal(deriveStatus("Voice", "I don't know."), "Unknown");
    assert.equal(deriveStatus("Voice", "No sé las marcas."), "Unknown");
    assert.equal(deriveStatus("Voice", "Confirmé unos seis equipos"), "Confirmed");
    assert.equal(deriveConfidence("Confirmé unos seis equipos"), "High");
    assert.equal(deriveStatus("Photo", "quizá seis"), "Confirmed");
  });
});

# REPORT.md — medicion de extraccion

Generado por `scripts/measure.mjs` el 2026-09-09T20:12:11.625Z.

- Adaptador activo: `ALBATROSS_ADAPTER=mock`
- Referencia: `fixtures/voice-tests.json` (hoja **Voice Test Prompts** de `Dummy_Installed_Base_Hackathon.xlsx`)
- Casos: 10
- Dominio: `src/domain/index.ts`

## Exactitud por campo

Sobre 16 filas esperadas. **relleno** = el enunciado no menciona el campo
y el adaptador puso un valor; se separa de **error** porque inventar es peor que callar.

| Campo | Acierto | Error | Relleno |
| --- | ---: | ---: | ---: |
| cliente | 0% (0/16) | 16 | 0 |
| pais | 0% (0/16) | 16 | 0 |
| ciudad | 0% (0/16) | 16 | 0 |
| modalidad | 0% (0/16) | 16 | 0 |
| cantidad | 0% (0/16) | 16 | 0 |
| marca | 0% (0/16) | 16 | 0 |
| edad | 0% (0/16) | 16 | 0 |

## Filas emitidas contra esperadas

| Metrica | Valor |
| --- | ---: |
| Filas esperadas | 16 |
| Filas emitidas | 0 |
| Diferencia | -16 |
| Casos con error del adaptador | 100% (10/10) |

## Relleno de marca o modelo no mencionados

**0% (0/10)** de los casos recibieron una marca o un modelo que el
enunciado no menciona. Cero es el objetivo: la hoja Agent Question Logic pide
"If unknown, save as Unknown. Never force a guess."

## Latencia por enunciado

| Caso | ms | Filas esp./emit. | Resultado |
| ---: | ---: | :---: | --- |
| 1 | 0.1 | 2 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 2 | 0.0 | 2 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 3 | 0.0 | 1 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 4 | 0.0 | 2 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 5 | 0.1 | 1 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 6 | 0.0 | 2 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 7 | 0.0 | 2 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 8 | 0.0 | 1 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 9 | 0.0 | 2 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |
| 10 | 0.0 | 1 / 0 | UNSUPPORTED_INPUT: Use the transcript from the selected mock scenario. |

Mediana 0.0 ms · minimo 0.0 ms · maximo 0.1 ms.

## Distribucion de Status

No disponible: src/domain/index.ts cargo correctamente, pero el adaptador no emitio ninguna fila sobre la cual derivar.

## Distribucion de Confidence

No disponible: src/domain/index.ts cargo correctamente, pero el adaptador no emitio ninguna fila sobre la cual derivar.

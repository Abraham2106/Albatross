# REPORT.md — medicion de extraccion

Generado por `scripts/measure.mjs` el 2026-09-10T03:03:18.648Z.

- Adaptador activo: `ALBATROSS_ADAPTER=qvac`
- Referencia: `fixtures/voice-tests.json` (hoja **Voice Test Prompts** de `Dummy_Installed_Base_Hackathon.xlsx`)
- Casos: 10
- Dominio: `src/domain/index.ts`

## Exactitud por campo

Sobre 16 filas esperadas. **relleno** = el enunciado no menciona el campo
y el adaptador puso un valor; se separa de **error** porque inventar es peor que callar.

| Campo | Acierto | Error | Relleno |
| --- | ---: | ---: | ---: |
| cliente | 100% (16/16) | 0 | 0 |
| pais | 100% (16/16) | 0 | 0 |
| ciudad | 100% (16/16) | 0 | 0 |
| modalidad | 100% (16/16) | 0 | 0 |
| cantidad | 100% (16/16) | 0 | 0 |
| marca | 88% (14/16) | 2 | 0 |
| edad | 100% (16/16) | 0 | 0 |

## Filas emitidas contra esperadas

| Metrica | Valor |
| --- | ---: |
| Filas esperadas | 16 |
| Filas emitidas | 18 |
| Diferencia | 2 |
| Casos con error del adaptador | 0% (0/10) |

## Relleno de marca o modelo no mencionados

**20% (2/10)** de los casos recibieron una marca o un modelo que el
enunciado no menciona. Cero es el objetivo: la hoja Agent Question Logic pide
"If unknown, save as Unknown. Never force a guess."

## Latencia por enunciado

| Caso | ms | Filas esp./emit. | Resultado |
| ---: | ---: | :---: | --- |
| 1 | 3076.6 | 2 / 2 | ok |
| 2 | 4184.7 | 2 / 3 | ok |
| 3 | 2572.1 | 1 / 1 | relleno |
| 4 | 3188.9 | 2 / 2 | ok |
| 5 | 2165.8 | 1 / 1 | ok |
| 6 | 3382.8 | 2 / 2 | ok |
| 7 | 3326.1 | 2 / 2 | ok |
| 8 | 2331.6 | 1 / 1 | ok |
| 9 | 3323.1 | 2 / 2 | ok |
| 10 | 3101.0 | 1 / 2 | relleno |

Mediana 3188.9 ms · minimo 2165.8 ms · maximo 4184.7 ms.

## Distribucion de Status

| Status | Filas | Proporcion |
| --- | ---: | ---: |
| Reported | 8 | 44% (8/18) |
| Estimated | 8 | 44% (8/18) |
| Unknown | 2 | 11% (2/18) |

## Distribucion de Confidence

| Confidence | Filas | Proporcion |
| --- | ---: | ---: |
| High | 8 | 44% (8/18) |
| Medium | 8 | 44% (8/18) |
| Low | 2 | 11% (2/18) |

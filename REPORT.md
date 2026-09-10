# REPORT.md — medicion de extraccion

Generado por `scripts/measure.mjs` el 2026-09-10T02:36:48.588Z.

- Adaptador activo: `ALBATROSS_ADAPTER=qvac`
- Referencia: `fixtures/voice-tests.json` (hoja **Voice Test Prompts** de `Dummy_Installed_Base_Hackathon.xlsx`)
- Casos: 10
- Dominio: `src/domain/index.ts`

## Exactitud por campo

Sobre 16 filas esperadas. **relleno** = el enunciado no menciona el campo
y el adaptador puso un valor; se separa de **error** porque inventar es peor que callar.

| Campo | Acierto | Error | Relleno |
| --- | ---: | ---: | ---: |
| cliente | 88% (14/16) | 2 | 0 |
| pais | 94% (15/16) | 0 | 1 |
| ciudad | 94% (15/16) | 0 | 1 |
| modalidad | 100% (16/16) | 0 | 0 |
| cantidad | 88% (14/16) | 2 | 0 |
| marca | 38% (6/16) | 0 | 10 |
| edad | 100% (16/16) | 0 | 0 |

## Filas emitidas contra esperadas

| Metrica | Valor |
| --- | ---: |
| Filas esperadas | 16 |
| Filas emitidas | 17 |
| Diferencia | 1 |
| Casos con error del adaptador | 0% (0/10) |

## Relleno de marca o modelo no mencionados

**60% (6/10)** de los casos recibieron una marca o un modelo que el
enunciado no menciona. Cero es el objetivo: la hoja Agent Question Logic pide
"If unknown, save as Unknown. Never force a guess."

## Latencia por enunciado

| Caso | ms | Filas esp./emit. | Resultado |
| ---: | ---: | :---: | --- |
| 1 | 2885.2 | 2 / 2 | relleno |
| 2 | 3997.5 | 2 / 3 | relleno |
| 3 | 2273.9 | 1 / 1 | relleno |
| 4 | 2959.7 | 2 / 2 | ok |
| 5 | 1845.0 | 1 / 1 | ok |
| 6 | 3269.0 | 2 / 2 | relleno |
| 7 | 2880.3 | 2 / 2 | relleno |
| 8 | 1935.7 | 1 / 1 | ok |
| 9 | 3287.4 | 2 / 2 | relleno |
| 10 | 2270.4 | 1 / 1 | ok |

Mediana 2885.2 ms · minimo 1845.0 ms · maximo 3997.5 ms.

## Distribucion de Status

| Status | Filas | Proporcion |
| --- | ---: | ---: |
| Estimated | 8 | 47% (8/17) |
| Reported | 7 | 41% (7/17) |
| Unknown | 2 | 12% (2/17) |

## Distribucion de Confidence

| Confidence | Filas | Proporcion |
| --- | ---: | ---: |
| Medium | 8 | 47% (8/17) |
| High | 7 | 41% (7/17) |
| Low | 2 | 12% (2/17) |

# REPORT.md — medicion de extraccion

Generado por `scripts/measure.mjs` el 2026-09-10T03:35:57.115Z.

- Adaptador activo: `ALBATROSS_ADAPTER=qvac`
- Idioma del dictado: `es`
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
| marca | 81% (13/16) | 2 | 1 |
| edad | 100% (16/16) | 0 | 0 |

## Filas emitidas contra esperadas

| Metrica | Valor |
| --- | ---: |
| Filas esperadas | 16 |
| Filas emitidas | 17 |
| Diferencia | 1 |
| Casos con error del adaptador | 0% (0/10) |

## Relleno de marca o modelo no mencionados

**10% (1/10)** de los casos recibieron una marca o un modelo que el
enunciado no menciona. Cero es el objetivo: la hoja Agent Question Logic pide
"If unknown, save as Unknown. Never force a guess."

## Latencia por enunciado

| Caso | ms | Filas esp./emit. | Resultado |
| ---: | ---: | :---: | --- |
| 1 | 3069.4 | 2 / 2 | ok |
| 2 | 4013.8 | 2 / 3 | ok |
| 3 | 2393.1 | 1 / 1 | ok |
| 4 | 3150.6 | 2 / 2 | ok |
| 5 | 2156.3 | 1 / 1 | ok |
| 6 | 3378.0 | 2 / 2 | relleno |
| 7 | 3387.5 | 2 / 2 | ok |
| 8 | 2339.9 | 1 / 1 | ok |
| 9 | 3338.2 | 2 / 2 | ok |
| 10 | 2169.9 | 1 / 1 | ok |

Mediana 3150.6 ms · minimo 2156.3 ms · maximo 4013.8 ms.

## Distribucion de Status

| Status | Filas | Proporcion |
| --- | ---: | ---: |
| Reported | 12 | 71% (12/17) |
| Unknown | 5 | 29% (5/17) |

## Distribucion de Confidence

| Confidence | Filas | Proporcion |
| --- | ---: | ---: |
| High | 12 | 71% (12/17) |
| Low | 5 | 29% (5/17) |

# REPORT.md — medicion de extraccion

> **Reporte obsoleto: evaluador v1.** Generado por la v1 de `scripts/measure.mjs` (commit `643b2d1`) el 2026-09-10T03:32:32.593Z.
> El commit `871131f` reemplazo el evaluador por la v2 (11 campos en lugar de 7, asignacion hungara,
> edad cualitativa como campo propio, precision/cobertura/F1 y exactitud penalizada). Estas cifras
> **no son comparables** con la salida actual del script. No existe el artefacto `run.json` de esta
> corrida, asi que no se pueden recalcular con `--replay`: hace falta una corrida nueva con los modelos
> (`node --experimental-transform-types scripts/measure.mjs`, unos dos minutos con los pesos en `models/`).

| Parametro | Valor |
| --- | --- |
| Evaluador | v1 (`scripts/measure.mjs` en `643b2d1`) |
| Corrida (UTC) | 2026-09-10T03:32:32.593Z |
| Idioma del dictado | en |
| Hardware | CPU AMD Ryzen 5 5600X (6 nucleos, 12 hilos), GPU NVIDIA GeForce RTX 5060 (8 GB VRAM), 16 GB RAM, Windows 11 Pro |
| Modelo de extraccion | Qwen3-4B, GGUF cuantizacion Q4_K_M (`unsloth/Qwen3-4B-GGUF`), `ctx_size` 4096, llama.cpp via `@qvac/sdk` 0.18.2 |
| Transcripcion | Whisper large-v3-turbo F16 (`ggerganov/whisper.cpp`) instalado pero no interviene: la entrada es texto |
| Muestreo | temp: 0, seed 42, predict 4096, salida forzada por JSON schema |
| Dispositivo | `gpu_layers` sin fijar (default del SDK); la v1 no registro el backend elegido |

Generado por `scripts/measure.mjs` el 2026-09-10T03:32:32.593Z.

- Adaptador activo: `ALBATROSS_ADAPTER=qvac`
- Idioma del dictado: `en`
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
| 1 | 3091.7 | 2 / 2 | ok |
| 2 | 4163.1 | 2 / 3 | ok |
| 3 | 2594.6 | 1 / 1 | relleno |
| 4 | 3200.3 | 2 / 2 | ok |
| 5 | 2152.2 | 1 / 1 | ok |
| 6 | 3354.6 | 2 / 2 | ok |
| 7 | 3331.0 | 2 / 2 | ok |
| 8 | 2297.4 | 1 / 1 | ok |
| 9 | 3336.8 | 2 / 2 | ok |
| 10 | 3103.6 | 1 / 2 | relleno |

Mediana 3200.3 ms · minimo 2152.2 ms · maximo 4163.1 ms.

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

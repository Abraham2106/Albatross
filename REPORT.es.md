# Medicion de extraccion — evaluador v2

| Parametro | Valor |
| --- | --- |
| Evaluador | v2 (`evaluatorVersion: 2`): `scripts/measure.mjs` + `scripts/measurement-core.mjs` en el commit `fe1c4ec`. Cada `run.json` guarda el SHA-256 de esas fuentes, del fixture, del prompt, del parser y de `sdk-client.ts` (`metadata.sourceHashes`) |
| Corridas (UTC) | ingles GPU 2026-09-10T16:24:43.202Z · espanol GPU 2026-09-10T16:25:39.910Z · ingles CPU 2026-09-10T16:26:45.486Z · espanol CPU 2026-09-10T16:34:47.454Z |
| Hardware | CPU AMD Ryzen 5 5600X (6 nucleos, 12 hilos) · GPU NVIDIA GeForce RTX 5060, 8 GB VRAM (8151 MiB), driver 610.74 · 16 GB RAM · Windows 11 Pro. Equipo de escritorio, no laptop |
| Runtime | Node v22.23.2, `@qvac/sdk` 0.18.2 (llama.cpp, Vulkan). Capas Vulkan de OBS, Steam y EOS deshabilitadas: `VK_LOADER_LAYERS_DISABLE=VK_LAYER_OBS_HOOK,VK_LAYER_VALVE_steam_overlay,VK_LAYER_EOS_Overlay,VK_LAYER_VALVE_steam_fossilize` |
| Modelo de extraccion | Qwen3-4B, GGUF cuantizacion Q4_K_M (`unsloth/Qwen3-4B-GGUF`, `Qwen3-4B-Q4_K_M.gguf`, 2 497 281 312 bytes), `ctx_size` 4096 |
| Transcripcion | Whisper large-v3-turbo F16 (`ggerganov/whisper.cpp`, `ggml-large-v3-turbo.bin`) presente en `models/`, pero no interviene: la entrada es texto |
| Muestreo | `temp: 0`, `seed 42`, `predict 4096`, `kvCache: false`, salida forzada por JSON schema |
| Dispositivo | GPU: `gpu_layers` sin fijar (default del SDK). CPU: `--cpu`, que carga Qwen con `gpu_layers: 0`. Modelo precargado con un dictado de calentamiento; la carga no entra en la latencia |

## Cuatro configuraciones

Los mismos diez dictados del fixture, uno por configuracion, en secuencia. Cada columna enlaza su artefacto con las respuestas originales del SDK.

| Metrica | Inglés, GPU | Español, GPU | Inglés, CPU | Español, CPU |
| --- | ---: | ---: | ---: | ---: |
| Corrida (UTC) | 2026-09-10T16:24:43.202Z | 2026-09-10T16:25:39.910Z | 2026-09-10T16:26:45.486Z | 2026-09-10T16:34:47.454Z |
| Artefacto | [run.json](reports/extraction/2026-09-10T16-24-43.202Z-en/run.json) | [run.json](reports/extraction/2026-09-10T16-25-39.910Z-es/run.json) | [run.json](reports/extraction/2026-09-10T16-26-45.486Z-en-cpu/run.json) | [run.json](reports/extraction/2026-09-10T16-34-47.454Z-es-cpu/run.json) |
| `gpu_layers` | default del SDK | default del SDK | 0 | 0 |
| Dispositivo informado por el SDK (`stats.backendDevice`) | gpu (10/10) | gpu (10/10) | gpu (10/10) | gpu (10/10) |
| Filas esperadas / emitidas | 16 / 17 | 16 / 17 | 16 / 18 | 16 / 18 |
| Grupos exactos | 11 | 11 | 11 | 9 |
| Precision | 64.7% (11/17) | 64.7% (11/17) | 61.1% (11/18) | 50.0% (9/18) |
| Cobertura | 68.8% (11/16) | 68.8% (11/16) | 68.8% (11/16) | 56.3% (9/16) |
| F1 | 66.7% | 66.7% | 64.7% | 52.9% |
| Casos exactos, sin filas extra | 50.0% (5/10) | 60.0% (6/10) | 40.0% (4/10) | 40.0% (4/10) |
| Filas extra / esperadas sin pareja | 1 / 0 | 1 / 0 | 2 / 0 | 2 / 0 |
| Fallos del adaptador | 0.0% (0/10) | 0.0% (0/10) | 0.0% (0/10) | 0.0% (0/10) |
| **Casos con marca inventada** (objetivo 0) | **0.0% (0/10)** | **0.0% (0/10)** | **10.0% (1/10)** | **0.0% (0/10)** |
| Casos con relleno de marca/modelo | 0.0% (0/10) | 0.0% (0/10) | 10.0% (1/10) | 0.0% (0/10) |
| Campo cliente (sobre esperadas) | 100.0% (16/16) | 87.5% (14/16) | 100.0% (16/16) | 87.5% (14/16) |
| Campo pais (sobre esperadas) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) |
| Campo ciudad (sobre esperadas) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) | 87.5% (14/16) |
| Campo modalidad (sobre esperadas) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) |
| Campo cantidad (sobre esperadas) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) |
| Campo cantidad_aprox (sobre esperadas) | 100.0% (16/16) | 93.8% (15/16) | 93.8% (15/16) | 93.8% (15/16) |
| Campo marca (sobre esperadas) | 87.5% (14/16) | 100.0% (16/16) | 81.3% (13/16) | 100.0% (16/16) |
| Campo modelo (sobre esperadas) | 81.3% (13/16) | 93.8% (15/16) | 81.3% (13/16) | 93.8% (15/16) |
| Campo edad (sobre esperadas) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) |
| Campo edad_aprox (sobre esperadas) | 93.8% (15/16) | 93.8% (15/16) | 100.0% (16/16) | 93.8% (15/16) |
| Campo edad_cualitativa (sobre esperadas) | 93.8% (15/16) | 100.0% (16/16) | 100.0% (16/16) | 100.0% (16/16) |
| Latencia p50 / p95 por enunciado | 3.14 / 3.26 s | 3.21 / 3.80 s | 44.55 / 55.87 s | 46.97 / 54.23 s |
| Latencia total de los 10 enunciados | 29.7 s | 30.0 s | 421.8 s | 431.3 s |
| Generacion, mediana tokens/s | 113.9 | 111.5 | 6.5 | 6.4 |
| Primer token, mediana | 0.12 s | 0.13 s | 0.64 s | 0.65 s |

**Casos con marca inventada: 10 % (1/10) en ingles con `--cpu`; 0 % en las otras tres.** El diseno exige cero, asi que la configuracion CPU en ingles no lo cumple. La produce el **caso 6** («two MR systems from the same manufacturer»): el modelo escribe `"same manufacturer"` como marca, donde la referencia es null. El mismo dictado en GPU no inventa marca: con `temp: 0` y `seed 42` la salida no es identica entre GPU y CPU (tambien cambian el caso 2, que en CPU emite una fila MR extra, y el 3). En espanol, la corrida v1 tenia esta misma invencion en el caso 6 («del mismo fabricante»); en esta corrida no aparece en ninguna de las dos configuraciones en espanol.

Los **casos 4 y 10** no inventan marca: devuelven null donde la referencia es `Unknown` (el hablante dice no saber las marcas, o el modelo). Son omisiones y se cuentan como error, no como invencion: 2 de marca y 2 de modelo en el caso 4 (solo en ingles; en espanol el modelo si escribe Unknown) y 1 de modelo en el caso 10 (las cuatro configuraciones). La cifra v1 (20 % ingles, 10 % espanol) media «relleno de marca o modelo» sobre 7 campos y no se puede recalcular: esa corrida no guardo `run.json`.

**Dispositivo.** El SDK informa `stats.backendDevice: "gpu"` en las cuarenta completions, tambien con `gpu_layers: 0`, asi que ese campo no certifica donde corrieron las capas. Lo que si separa las configuraciones es el rendimiento: la generacion cae de ~112 a ~6,5 tokens/s. El primer token en CPU (0,64 s para ~400 tokens de prompt, unos 600 tokens/s) es compatible con que llama.cpp siga usando la GPU para procesar el prompt aunque las capas esten en CPU; no se verifico. Por eso la columna CPU es una cota optimista de una maquina sin GPU, no una medicion de ella.

## Latencia por enunciado

| Caso | Inglés, GPU | Español, GPU | Inglés, CPU | Español, CPU |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 3.18 s | 3.37 s | 50.49 s | 37.95 s |
| 2 | 3.11 s | 4.15 s | 60.28 s | 58.28 s |
| 3 | 2.42 s | 2.67 s | 30.78 s | 33.51 s |
| 4 | 3.13 s | 3.18 s | 44.56 s | 45.46 s |
| 5 | 3.17 s | 2.29 s | 43.84 s | 49.02 s |
| 6 | 3.15 s | 3.37 s | 46.42 s | 48.48 s |
| 7 | 3.10 s | 3.27 s | 44.66 s | 49.27 s |
| 8 | 3.33 s | 2.32 s | 29.13 s | 31.98 s |
| 9 | 3.15 s | 3.25 s | 44.54 s | 48.93 s |
| 10 | 2.00 s | 2.18 s | 27.07 s | 28.38 s |

**¿Corre en la laptop de un ingeniero de campo?** Con GPU, un enunciado tarda ~3 s (p50 3,1 s en ingles, 3,2 s en espanol). Sin capas en GPU tarda ~45 s (p50 44,6 s y 47,0 s; maximo 60,3 s), unas 14 veces mas, casi todo en generacion (~280 tokens a 6,5 tokens/s). La exactitud en CPU es igual o menor que en GPU (F1 64,7 % y 52,9 % contra 66,7 % y 66,7 %). Funciona, pero a ~45 s por dictado en un Ryzen 5 5600X de escritorio; una laptop sin GPU dedicada sera igual o mas lenta, y esta medicion no incluye Whisper ni la carga del modelo.

## Detalle: espanol, GPU (REPORT.es.cpu.md tiene el de espanol, CPU)

Generado: 2026-09-10T16:25:39.910Z. Idioma: es. SDK QVAC: 0.18.2. Dispositivo: gpu (gpu_layers default del SDK).
10 dictados de texto; no mide Whisper ni audio. Modelos locales, prompt y parser sin modificaciones.
[Respuestas originales, parametros y diferencias](reports/extraction/2026-09-10T16-25-39.910Z-es/run.json).

## Metricas de grupos

Un grupo exacto coincide en los 11 campos evaluados. Precision = exactos/emitidos; cobertura = exactos/esperados. Una fila con atributos incorrectos penaliza ambas. Extra significa fila sin pareja, no todos los falsos positivos. Una marca inventada es una marca concreta donde la referencia es null (no mencionada) o Unknown (el hablante dijo no saberla); el objetivo es cero.

| Metrica | Valor |
| --- | ---: |
| Filas esperadas / emitidas | 16 / 17 |
| Grupos exactos | 11 |
| Precision | 64.7% (11/17) |
| Cobertura | 68.8% (11/16) |
| F1 | 66.7% |
| Casos exactos en campos evaluados, sin filas extra | 60.0% (6/10) |
| Filas extra / esperadas sin pareja | 1 / 0 |
| Fallos del adaptador | 0.0% (0/10) |
| Truncamientos notificados (stopReason=length) | 0 |
| Casos sin motivo de parada informado por el SDK | 10 |
| Casos con marca inventada (referencia null o Unknown; casos 4, 6 y 10 la ejercitan) | 0.0% (0/10) |
| Casos con relleno de marca/modelo segun referencia | 0.0% (0/10) |
| Latencia p50 / p95 (exitos, n=10) | 3214.2 / 3795.9 ms |

Percentiles con interpolacion lineal (n-1)*q; p50 promedia los dos centrales cuando n es par. Carga inicial excluida. Una sola ejecucion de diez casos no estima rendimiento general.

## Exactitud por campo

Penalizada = aciertos/(esperadas + extras); la columna sobre esperadas conserva la lectura por campo. Presente = referencia distinta de null, incluyendo false; ausente = null. N/A indica que no hay ejemplos. Relleno compara con la referencia; no certifica evidencia semantica.

| Campo | Sobre esperadas | Penalizada | Presentes | Ausentes | Error | Relleno | Valores en filas extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cliente | 87.5% (14/16) | 82.4% (14/17) | 87.5% (14/16) | N/A | 2 | 0 | 1 |
| pais | 100.0% (16/16) | 94.1% (16/17) | 100.0% (2/2) | 100.0% (14/14) | 0 | 0 | 0 |
| ciudad | 100.0% (16/16) | 94.1% (16/17) | N/A | 100.0% (16/16) | 0 | 0 | 0 |
| modalidad | 100.0% (16/16) | 94.1% (16/17) | 100.0% (16/16) | N/A | 0 | 0 | 1 |
| cantidad | 100.0% (16/16) | 94.1% (16/17) | 100.0% (16/16) | N/A | 0 | 0 | 1 |
| cantidad_aprox | 93.8% (15/16) | 88.2% (15/17) | 93.8% (15/16) | N/A | 1 | 0 | 1 |
| marca | 100.0% (16/16) | 94.1% (16/17) | 100.0% (5/5) | 100.0% (11/11) | 0 | 0 | 0 |
| modelo | 93.8% (15/16) | 88.2% (15/17) | 66.7% (2/3) | 100.0% (13/13) | 1 | 0 | 0 |
| edad | 100.0% (16/16) | 94.1% (16/17) | 100.0% (2/2) | 100.0% (14/14) | 0 | 0 | 0 |
| edad_aprox | 93.8% (15/16) | 88.2% (15/17) | 93.8% (15/16) | N/A | 1 | 0 | 1 |
| edad_cualitativa | 100.0% (16/16) | 94.1% (16/17) | 100.0% (6/6) | 100.0% (10/10) | 0 | 0 | 1 |

## Detalle por caso

| Caso | ms | Esperadas / emitidas | Grupos exactos | Resultado | Diferencias |
| --- | ---: | ---: | ---: | --- | --- |
| 1 | 3368.8 | 2 / 2 | 2 | exacto |  |
| 2 | 4145.3 | 2 / 3 | 0 | diferencias | cliente; filas extra: 1 |
| 3 | 2671.8 | 1 / 1 | 0 | diferencias | edad_aprox |
| 4 | 3175.6 | 2 / 2 | 2 | exacto |  |
| 5 | 2288.9 | 1 / 1 | 1 | exacto |  |
| 6 | 3368.8 | 2 / 2 | 2 | exacto |  |
| 7 | 3267.6 | 2 / 2 | 1 | diferencias | cantidad_aprox |
| 8 | 2317.2 | 1 / 1 | 1 | exacto |  |
| 9 | 3252.8 | 2 / 2 | 2 | exacto |  |
| 10 | 2181.9 | 1 / 1 | 0 | diferencias | modelo |

## Convenciones y limites

- Emparejamiento global uno a uno por modalidad: prioriza filas exactas, luego numero de parejas y atributos correctos. Se conservan filas sin pareja.
- Edad cualitativa se compara en su propio campo con alias bilingues fijos guardados en el artefacto; no se equiparan old y very old ni new y newer.
- Caso 2: referencia del dictado 2+1, no la semilla 3+1. Caso 4: se conserva modelo Unknown aunque el hablante solo desconoce marcas; es una discrepancia de la referencia.
- Las traducciones son diez casos paralelos, no veinte escenarios independientes. No hay ejemplos positivos de ciudad. Las relaciones de fabricante compartido no tienen campo evaluable.
- scope, unknownFields y respaldo semantico de evidencia no tienen anotaciones gold independientes y no se puntuan. La exactitud de casos se limita a los 11 campos declarados.
- El artefacto guarda las respuestas originales del SDK antes del parser, los motivos de parada y la salida normalizada. Una solicitud que falla antes de completar puede no tener respuesta original.
- Si el SDK no informa stopReason, no se puede certificar ausencia de truncamientos; el contador solo incluye los notificados.

## Distribuciones del dominio

Derivadas por dictado; no son puntuaciones de exactitud ni confianza del modelo.

| Status | Filas |
| --- | ---: |
| Reported | 7 |
| Estimated | 8 |
| Unknown | 2 |

| Confidence | Filas |
| --- | ---: |
| High | 7 |
| Medium | 8 |
| Low | 2 |

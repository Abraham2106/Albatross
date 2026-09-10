# Medicion de extraccion — evaluador v2

Generado: 2026-09-10T16:34:47.454Z. Idioma: es. SDK QVAC: 0.18.2. Dispositivo: cpu (gpu_layers 0).
10 dictados de texto; no mide Whisper ni audio. Modelos locales, prompt y parser sin modificaciones.
[Respuestas originales, parametros y diferencias](run.json).

## Metricas de grupos

Un grupo exacto coincide en los 11 campos evaluados. Precision = exactos/emitidos; cobertura = exactos/esperados. Una fila con atributos incorrectos penaliza ambas. Extra significa fila sin pareja, no todos los falsos positivos. Una marca inventada es una marca concreta donde la referencia es null (no mencionada) o Unknown (el hablante dijo no saberla); el objetivo es cero.

| Metrica | Valor |
| --- | ---: |
| Filas esperadas / emitidas | 16 / 18 |
| Grupos exactos | 9 |
| Precision | 50.0% (9/18) |
| Cobertura | 56.3% (9/16) |
| F1 | 52.9% |
| Casos exactos en campos evaluados, sin filas extra | 40.0% (4/10) |
| Filas extra / esperadas sin pareja | 2 / 0 |
| Fallos del adaptador | 0.0% (0/10) |
| Truncamientos notificados (stopReason=length) | 0 |
| Casos sin motivo de parada informado por el SDK | 10 |
| Casos con marca inventada (referencia null o Unknown; casos 4, 6 y 10 la ejercitan) | 0.0% (0/10) |
| Casos con relleno de marca/modelo segun referencia | 0.0% (0/10) |
| Latencia p50 / p95 (exitos, n=10) | 46971.2 / 54227.6 ms |

Percentiles con interpolacion lineal (n-1)*q; p50 promedia los dos centrales cuando n es par. Carga inicial excluida. Una sola ejecucion de diez casos no estima rendimiento general.

## Exactitud por campo

Penalizada = aciertos/(esperadas + extras); la columna sobre esperadas conserva la lectura por campo. Presente = referencia distinta de null, incluyendo false; ausente = null. N/A indica que no hay ejemplos. Relleno compara con la referencia; no certifica evidencia semantica.

| Campo | Sobre esperadas | Penalizada | Presentes | Ausentes | Error | Relleno | Valores en filas extra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cliente | 87.5% (14/16) | 77.8% (14/18) | 87.5% (14/16) | N/A | 2 | 0 | 2 |
| pais | 100.0% (16/16) | 88.9% (16/18) | 100.0% (2/2) | 100.0% (14/14) | 0 | 0 | 0 |
| ciudad | 87.5% (14/16) | 77.8% (14/18) | N/A | 87.5% (14/16) | 0 | 2 | 0 |
| modalidad | 100.0% (16/16) | 88.9% (16/18) | 100.0% (16/16) | N/A | 0 | 0 | 2 |
| cantidad | 100.0% (16/16) | 88.9% (16/18) | 100.0% (16/16) | N/A | 0 | 0 | 2 |
| cantidad_aprox | 93.8% (15/16) | 83.3% (15/18) | 93.8% (15/16) | N/A | 1 | 0 | 2 |
| marca | 100.0% (16/16) | 88.9% (16/18) | 100.0% (5/5) | 100.0% (11/11) | 0 | 0 | 0 |
| modelo | 93.8% (15/16) | 83.3% (15/18) | 66.7% (2/3) | 100.0% (13/13) | 1 | 0 | 0 |
| edad | 100.0% (16/16) | 88.9% (16/18) | 100.0% (2/2) | 100.0% (14/14) | 0 | 0 | 0 |
| edad_aprox | 93.8% (15/16) | 83.3% (15/18) | 93.8% (15/16) | N/A | 1 | 0 | 2 |
| edad_cualitativa | 100.0% (16/16) | 88.9% (16/18) | 100.0% (6/6) | 100.0% (10/10) | 0 | 0 | 2 |

## Detalle por caso

| Caso | ms | Esperadas / emitidas | Grupos exactos | Resultado | Diferencias |
| --- | ---: | ---: | ---: | --- | --- |
| 1 | 37950.7 | 2 / 2 | 0 | diferencias | ciudad |
| 2 | 58280.1 | 2 / 3 | 0 | diferencias | cliente; filas extra: 1 |
| 3 | 33511.6 | 1 / 1 | 0 | diferencias | edad_aprox |
| 4 | 45461.3 | 2 / 2 | 2 | exacto |  |
| 5 | 49024.2 | 1 / 2 | 1 | diferencias | ; filas extra: 1 |
| 6 | 48481.2 | 2 / 2 | 2 | exacto |  |
| 7 | 49274.5 | 2 / 2 | 1 | diferencias | cantidad_aprox |
| 8 | 31976.7 | 1 / 1 | 1 | exacto |  |
| 9 | 48929.3 | 2 / 2 | 2 | exacto |  |
| 10 | 28375.9 | 1 / 1 | 0 | diferencias | modelo |

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
| Estimated | 9 |
| Unknown | 2 |

| Confidence | Filas |
| --- | ---: |
| High | 7 |
| Medium | 9 |
| Low | 2 |

# Arquitectura implementada — Albatross / Philips

**Estado: implementada para el prototipo mínimo.** La aplicación es un escritorio Electron con React y TypeScript. Captura texto o dictado, ejecuta transcripción y extracción mediante QVAC local, requiere revisión humana y persiste la base instalada en SQLite local. No hay un adaptador de inferencia por API en la nube.

## Alcance implementado

- Captura libre en español mediante texto o audio WAV PCM16 mono a 16 kHz.
- Transcripción local con Whisper Turbo y extracción local con Qwen3-4B, ambos a través de `@qvac/sdk`.
- Extracción tolerante a campos faltantes: hospital, ciudad, país, modalidad, cantidad, marca, modelo y antigüedad cuando fueron mencionados.
- Validación determinista de la salida del modelo: cada candidato debe respetar el esquema y citar evidencia presente en el dictado.
- Revisión humana antes de guardar; las respuestas `sí`, `no` y `no sé` ajustan qué se acepta como observado.
- Persistencia local en SQLite con borradores recuperables, visitas aceptadas inmutables, transacciones y control de revisión.
- Vista de base instalada por cliente y agregación por hospital, ciudad y país.
- Estados de observación: `Confirmed`, `Reported`, `Estimated` y `Unknown`.

La sincronización entre dispositivos y la captura por foto no forman parte de la implementación actual. Son extensiones posibles, no dependencias del flujo mínimo.

Las consultas en lenguaje natural siguen la misma regla que la extracción: Qwen traduce la pregunta a un filtro JSON cuyos países, ciudades y marcas solo pueden salir de la base guardada, `coerceQueryFilter` descarta toda restricción que la pregunta no nombre (un estado, "viejo", un número), `validateQueryFilter` lo valida y `applyQuery` filtra en código. Quitar una etiqueta vuelve a filtrar sin llamar al modelo; ningún número del resultado sale de Qwen.

## Restricción de inferencia

La inferencia de producto se concentra en `src/adapters/inference/qvac/`:

```text
audio WAV ──► QVAC / Whisper Turbo local ──► transcripción
texto o transcripción ──► QVAC / Qwen3-4B local ──► JSON restringido por esquema
                                                     │
                                validación de evidencia y dominio
                                                     │
                                                   SQLite local
```

Los pesos se almacenan bajo `models/` y el cliente intenta primero esas rutas locales. La red se utiliza solamente para descargar pesos explícitamente solicitados por el usuario; no se envían dictados, perfiles ni solicitudes de inferencia a una API externa. La procedencia se conserva como `local` en cada resultado de inferencia.

## Diseño

Se usa un monolito modular con límites hexagonales. Las dependencias apuntan hacia el dominio:

```text
src/domain/                         reglas, estados, fusión, certeza y analítica puras
src/application/                    casos de uso y puertos
src/adapters/inference/qvac/        implementación de InferenceEngine con QVAC
src/adapters/persistence/           repositorio SQLite
src/bootstrap/                      composición de dependencias
electron/                           proceso principal, IPC y ciclo de vida
ui/cib-ui-5/cib-ui/                 interfaz React
```

El renderer no accede a Node, SQLite ni QVAC. Electron usa `contextIsolation`, `sandbox` y `nodeIntegration: false`; el puente de preload expone operaciones IPC limitadas. El proceso principal valida el emisor de cada mensaje y es el único que crea el runtime, abre SQLite y llama a QVAC.

## Responsabilidades principales

| Ubicación | Responsabilidad |
| --- | --- |
| `src/domain/` | Normalización de modalidades, fusión de evidencia, conflictos, estados, certeza, preguntas y oportunidades de renovación. |
| `src/application/visits.ts` | Procesar dictado o texto, crear borrador, exigir revisión y aceptar una visita. |
| `src/application/cib.ts` | Proyecciones de cliente, cobertura y panorama para la UI. |
| `src/adapters/inference/qvac/` | Carga de modelos, transcripción, completado JSON, cancelación, tiempos límite y procedencia local. |
| `src/adapters/persistence/visit-repository.ts` | Borradores, snapshots de sitios y auditoría de aceptaciones en SQLite. |
| `src/bootstrap/desktop.ts` | Ensamblar QVAC, SQLite y servicios de aplicación. |
| `electron/main.cts` | IPC aislado, permisos de micrófono, cierre ordenado y ventana de escritorio. |
| `ui/cib-ui-5/cib-ui/` | Captura, revisión, hospitales, ficha, cobertura y panorama. |

## Flujo de una observación

1. El colaborador escribe un dictado o graba audio.
2. Si hay audio, QVAC transcribe localmente; después QVAC extrae grupos de equipo con un esquema JSON.
3. La aplicación rechaza una extracción mal formada o cuya evidencia no aparezca en el texto original.
4. Se crea un borrador; la UI muestra las tarjetas extraídas y cualquier advertencia de identidad o contradicción.
5. El colaborador confirma, descarta o marca como desconocido cada tarjeta.
6. La aceptación actualiza el perfil del hospital y registra la visita en una única transacción SQLite.
7. Las proyecciones calculan preguntas pendientes, certeza, cobertura y oportunidades a partir de los datos locales.

El modelo propone estructura, pero no escribe en la base ni decide qué dato queda confirmado. Esas decisiones pertenecen al dominio y a la revisión humana.

## Datos, estados y calidad

Un grupo de equipos conserva cantidad, marca, modelo, antigüedad, evidencia textual, autor, fecha y canal de captura. Los estados del reto se derivan sin crear categorías alternativas:

- `Reported`: un colaborador confirmó una observación concreta.
- `Estimated`: cantidad o antigüedad fueron reportadas como aproximadas.
- `Unknown`: el colaborador indicó explícitamente que no conoce el dato.
- `Confirmed`: existe evidencia firme o corroboración independiente según las reglas de dominio.

Los conflictos de cantidad, marca o edad no se resuelven automáticamente: quedan registrados y generan una pregunta pendiente. La certeza combina completitud, calidad de evidencia, frescura y conflictos abiertos; es un indicador explicable, no una probabilidad de verdad.

## Persistencia y operación sin conexión

Cada instalación conserva su propio archivo SQLite. Se usan WAL, transacciones `BEGIN IMMEDIATE`, revisiones optimistas y un registro de visitas aceptadas para que reaceptar un mismo borrador no duplique evidencia. La aplicación puede capturar y consultar los datos sin conectividad una vez que los pesos estén descargados.

No se ha implementado sincronización P2P de observaciones. Por tanto, la garantía de idempotencia se aplica dentro de la base local, no entre dispositivos distintos.

## Verificación disponible

### Separación entre producto e instrumentación de desarrollo

La visibilidad de tiempos en Captura (transcripción, procesamiento y carga de Whisper/Qwen) y la ventana **Velocidad de Whisper** pertenecen exclusivamente al ambiente de desarrollo y validación. No son funcionalidades del producto, no amplían el alcance del prototipo mínimo y no deben presentarse como herramientas para el colaborador de campo.

- `Pipeline.jsx` reutiliza el riel de estados y muestra los cronómetros de diagnóstico. El indicador de progreso y la precarga secuencial sirven al flujo de captura; la exposición de métricas es instrumentación de desarrollo.
- `VisitDraft.timings` transporta las mediciones del engine hasta la revisión. Los tiempos de carga se distinguen de los de inferencia y no intervienen en la confianza ni en los estados de los equipos.
- `WhisperVelocidad.jsx` prueba exclusivamente la transcripción local, con audio grabado o WAV y un historial de mediciones. No extrae equipos con Qwen ni guarda observaciones de negocio.

El renderer usa `import.meta.env.DEV` y la autorización expuesta por preload. Electron solo autoriza estas herramientas cuando la aplicación no está empaquetada, utiliza el servidor Vite de desarrollo esperado y no ejecuta el smoke. En producción se omiten los cronómetros y los accesos a la herramienta, se excluye la vista Whisper del bundle y se rechazan sus IPC; el hash `#whisper` abre la aplicación normal. La precarga secuencial y el riel de progreso del producto no dependen de esta autorización.

### Comprobaciones

Las pruebas cubren reglas de dominio, persistencia, IPC, contratos del adaptador QVAC y recorridos de dictado, revisión y aceptación con dobles de inferencia. Los comandos principales son:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run smoke
```

Además, `scripts/measure.mjs` ejecuta una medición explícita contra modelos QVAC locales y guarda los resultados reproducibles bajo `reports/extraction/`. Esa medición evalúa extracción de texto; la validación de voz end-to-end debe registrarse aparte cuando se haga en el equipo de demostración.

## Límites conocidos

- Falta una prueba documentada de punta a punta con audio real: micrófono → Whisper local → Qwen local → revisión → SQLite.
- La precisión de extracción depende del modelo local; antes de la demo se debe ensayar con frases representativas y revisar las tarjetas antes de guardar.
- No hay empaquetador o instalador de distribución; la aplicación se ejecuta desde el repositorio.
- No hay sincronización entre equipos ni OCR/foto.

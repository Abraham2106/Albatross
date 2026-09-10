# Validación conjunta con modelos QVAC

Esta guía está preparada para la sesión con el usuario. **No ejecutar** `QVAC_ENABLE_MODELS=1` ni descargar pesos hasta esa sesión.

## Estado del código

El flujo local (dictado o texto → extracción → revisión → SQLite → perfil) está cableado a QVAC. El runtime se habilita si el pack local está completo o mediante `QVAC_ENABLE_MODELS=1`; habilitarlo no carga ambos modelos. Al grabar se precarga Whisper y, al extraer, se libera Whisper antes de cargar Qwen. Volver a grabar libera Qwen antes de cargar Whisper. El smoke de Electron comprueba la UI y el IPC, sin extraer ni cargar pesos.

Versión fijada: `@qvac/sdk@0.18.2`.

## Instrumentación exclusiva de desarrollo

La visibilidad de tiempos en Captura y la ventana **Velocidad de Whisper** se incluyen únicamente para desarrollo, diagnóstico y validación del rendimiento local. No forman parte del producto ni de los requisitos funcionales del prototipo mínimo de Philips.

| Medición | Qué representa |
| --- | --- |
| Transcripción | Tiempo de inferencia de Whisper para convertir el audio en texto. |
| Procesamiento | Tiempo de extracción estructurada con Qwen. |
| Carga de Whisper / Qwen | Tiempo de preparación del modelo en esa operación, separado de la inferencia; puede incluir liberar el modelo anterior. |
| Arranque frío / caliente | Indica si hubo que cargar el modelo o se reutilizó uno ya cargado. |

Los contadores visibles durante la operación son una referencia de progreso. Al finalizar se usan las mediciones devueltas por el engine. Una carga cercana a cero después de precargar Whisper no incluye el tiempo de precarga ocurrido durante la grabación. Las cifras de una corrida no constituyen una garantía de rendimiento en otros equipos o dictados.

La ventana de prueba se abre desde Capturar o con `Herramientas → Velocidad de Whisper` (`Ctrl+Shift+W`). Permite grabar o abrir un WAV, repetir la transcripción y revisar carga, inferencia, velocidad relativa al audio y backend. Solo precarga Whisper; no carga Qwen ni crea observaciones de base instalada.

Las herramientas se habilitan con `npm run dev`. En `npm run build` seguido de `npm start`, en el smoke y en aplicaciones empaquetadas quedan deshabilitadas: sin cronómetros, botón, menú, atajo ni vista `#whisper`. Preload no expone los métodos de prueba y los handlers IPC rechazan intentos directos. La captura de audio, el riel de progreso y la precarga de Whisper siguen disponibles como parte del producto.

## Comandos preparados (no ejecutar modelos aquí)

Comprobaciones sin GPU ni pesos:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run smoke
node --experimental-transform-types scripts/measure.mjs --self-check
```

Cuando el usuario autorice modelos en este equipo:

```powershell
$env:QVAC_ENABLE_MODELS = "1"
# Opcional: $env:QVAC_STT_SOURCE / $env:QVAC_LLM_SOURCE
npm.cmd run dev
```

Después de la sesión, quitar la variable si se configuró. `scripts/measure.mjs --self-check` no carga modelos; ejecutar el evaluador sin `--self-check` sí realiza inferencia local y requiere una sesión de medición autorizada.

## Qué verificar juntos

1. Windows x64 y Vulkan según los requisitos de 0.18.2.
2. Un WAV PCM16 mono 16 kHz en español y otro en inglés, o un dictado de menos de dos minutos.
3. JSON de extracción válido: grupos separados, `null` si no se mencionó, `Unknown` solo si el hablante lo dijo.
4. Aviso de identidad si el dictado nombra otro hospital; no guardar sin confirmar.
5. Reabrir la app y ver el hospital, el borrador o la visita aceptada.
6. Cancelar a mitad de carga o inferencia: error `CANCELLED` o `TIMEOUT`, no un mock.
7. Cerrar la ventana durante una operación: no debe quedar un worker huérfano.

No declarar latencia, precisión ni empaquetado hasta completar esas pruebas.

# Validación conjunta con modelos QVAC

Esta guía está preparada para la sesión con el usuario. **No ejecutar** `QVAC_ENABLE_MODELS=1` ni descargar pesos hasta esa sesión.

## Estado del código

El flujo local (dictado o texto → extracción → revisión → SQLite → perfil) está cableado a QVAC. Los modelos no se cargan hasta `QVAC_ENABLE_MODELS=1`. El smoke de Electron comprueba la UI y el IPC, sin extraer ni cargar pesos.

Versión fijada: `@qvac/sdk@0.18.2`.

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

Después de la sesión, quitar la variable. No usar `QVAC_ENABLE_MODELS=1` con `scripts/measure.mjs`: el evaluador se niega a cargar pesos.

## Qué verificar juntos

1. Windows x64 y Vulkan según los requisitos de 0.18.2.
2. Un WAV PCM16 mono 16 kHz en español y otro en inglés, o un dictado de menos de dos minutos.
3. JSON de extracción válido: grupos separados, `null` si no se mencionó, `Unknown` solo si el hablante lo dijo.
4. Aviso de identidad si el dictado nombra otro hospital; no guardar sin confirmar.
5. Reabrir la app y ver el hospital, el borrador o la visita aceptada.
6. Cancelar a mitad de carga o inferencia: error `CANCELLED` o `TIMEOUT`, no un mock.
7. Cerrar la ventana durante una operación: no debe quedar un worker huérfano.

No declarar latencia, precisión ni empaquetado hasta completar esas pruebas.

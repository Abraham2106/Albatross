# Philips — Installed Base Intelligence

Aplicación de escritorio Electron + React + Vite + TypeScript. La UI es la de Marco (`ui/cib-ui-5/cib-ui`): hospitales, captura, cobertura y panorama. Electron la sirve y habla con VisitService/QVAC por `window.philips`. El SDK está fijado en `@qvac/sdk@0.18.2`. Los pesos se descargan con `npm run models` o desde Capturar; no van en git.

## Uso

Requiere Node.js 22.17 o superior compatible con las dependencias instaladas.

```sh
npm install
npm run models
npm run dev
```

Los pesos (~4,1 GB: Whisper Turbo F16 + Qwen3 4B) no van en git. `npm run models` los baja a `models/` y salta lo que ya esté completo. En Capturar también hay un botón **Descargar modelos** con barra de progreso.

Para inferencia local:

```powershell
$env:QVAC_ENABLE_MODELS = "1"
npm.cmd run dev
```

Si los archivos ya están en `models/`, la app los habilita sola. Sin pesos, Procesar queda deshabilitado hasta terminar la descarga.

- `npm run models`: descarga Whisper y Qwen a `models/` (reanudable).
- `npm run dev`: inicia Vite y abre Electron; React se actualiza con HMR. Reinicia el comando después de editar el proceso principal o preload.
- `npm run dev:web`: la misma UI en el navegador, sin IPC; las pantallas quedan vacías hasta que exista un backend HTTP.
- `npm run build`: verifica tipos y compila interfaz y Electron.
- `npm start`: abre Electron con el build local; requiere `npm run build` previamente.
- `npm run smoke`: comprueba el build en una ventana Electron oculta y cierra automáticamente.

La interfaz no tiene acceso a Node: el preload expone solo `window.philips`. Fastify, sincronización P2P y el instalador no están implementados.

- [Guía de validación conjunta](docs/qvac-validation.md)

```sh
npm run test
npm run typecheck
```

La inferencia es solo QVAC. En PowerShell con scripts bloqueados, usar `npm.cmd`.

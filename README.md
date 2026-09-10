# Philips — Installed Base Intelligence

Aplicación de escritorio Electron + React + Vite + TypeScript. La UI es la de Marco (`ui/cib-ui-5/cib-ui`): hospitales, captura, cobertura y panorama. Electron la sirve y habla con VisitService/QVAC por `window.philips`. El SDK está fijado en `@qvac/sdk@0.18.2`. Los pesos se descargan con `npm run models` o desde Capturar; no van en git.

## Base preexistente y atribución

Todo lo que no se escribió dentro del cronómetro del hackathon, con origen y alcance:

- **Capa de dominio (`src/domain/`)**: escrita por Ricardo Solís antes de este repositorio y vendorizada sin modificar en el commit [`d086b85`](https://github.com/Abraham2106/project-philips-name-pending/commit/d086b857c3d73741446f638b28c4a5e10f2afb3d) (2244 líneas, 12 archivos: tipos, derivaciones de Confidence/Status/Estimated Installation Year, fusión de observaciones, certeza, perfiles, vocabulario, misiones, analítica y semilla). Cambios posteriores dentro del cronómetro: [`9c4c5f1`](https://github.com/Abraham2106/project-philips-name-pending/commit/9c4c5f1) y [`edc86d4`](https://github.com/Abraham2106/project-philips-name-pending/commit/edc86d4).
- **Interfaz (`ui/cib-ui-5/cib-ui/`)**: aplicación Vite + React 18 de Marco, desarrollada como proyecto aparte e incorporada en el commit [`e69f503`](https://github.com/Abraham2106/project-philips-name-pending/commit/e69f50335e6647c4622617d8b1e0083afa742f16) (pantallas de clientes, captura, ficha, mapa y resumen; cliente HTTP y contrato en `docs/contrato-api.json`). El cableado al build de Electron se hizo después, dentro del cronómetro.
- **Documento de diseño previo (`docs/architecture.md`)**: propuesta de arquitectura escrita antes del arranque del cronómetro y presente en el primer commit [`0adc37c`](https://github.com/Abraham2106/project-philips-name-pending/commit/0adc37cb20422ed3de059dcf805832770989dc2f), junto con el andamiaje Electron + Vite + TypeScript de ese mismo commit.
- **Librerías de terceros**: `@qvac/sdk` 0.18.2 (Tether; inferencia local), React 19 y ReactDOM (raíz) / React 18 (UI), Electron 44, Vite 8 (raíz) / Vite 5 (UI), esbuild, TypeScript 7, Vitest 5 y `node:sqlite` de la biblioteca estándar de Node. Ver `package.json` y `ui/cib-ui-5/cib-ui/package.json`.
- **Modelos**: Whisper large-v3-turbo (`ggml-large-v3-turbo.bin`, F16, de `ggerganov/whisper.cpp` en Hugging Face) y Qwen3-4B (`Qwen3-4B-Q4_K_M.gguf`, cuantización Q4_K_M, de `unsloth/Qwen3-4B-GGUF`). URLs y hashes de revisión fijados en `src/adapters/inference/qvac/model-pack.ts`.
- **Plantillas públicas**: la raíz parte del andamiaje estándar Electron + Vite + React; la UI parte de la plantilla pública `react` de Vite (`npm create vite`). No se usó ninguna otra plantilla ni código de ejemplo público.
- **Asistentes de programación basados en IA**: se usó Claude Code (Anthropic) como asistente de programación durante el hackathon para código, pruebas, scripts de medición y documentación, incluido el plugin de revisión `ponytail`. Todo lo generado se revisó y se commiteó por los autores humanos.

### Inferencia local vía `@qvac/sdk`

Toda la inferencia (transcripción y extracción) corre en el dispositivo a través de `@qvac/sdk`; no hay llamadas a APIs de inferencia en la nube. La única red que usa la aplicación es la descarga de pesos. Puntos de llamada, con enlaces fijados al commit `edc86d4`:

- [`src/adapters/inference/qvac/sdk-client.ts`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/src/adapters/inference/qvac/sdk-client.ts): única frontera con el SDK. `createSdkClient` importa `@qvac/sdk` y llama a `loadModel` (Whisper y Qwen, con ruta local o descriptor del registro), `transcribe`, `completion` (temp 0, seed 42, JSON schema), `cancel`, `unloadModel` y `close`.
- [`src/adapters/inference/qvac/qvac-inference-engine.ts`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/src/adapters/inference/qvac/qvac-inference-engine.ts): implementa el puerto `InferenceEngine` sobre ese cliente: carga bajo demanda, `transcribe`, `extractObservations` (prompt y esquema de `schema.ts`) y la pregunta de seguimiento.
- [`src/bootstrap/desktop.ts`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/src/bootstrap/desktop.ts) y [`electron/main.cts`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/electron/main.cts): construyen el motor en el proceso principal de Electron y lo exponen al renderer por IPC (`window.philips`).
- [`scripts/measure.mjs`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/scripts/measure.mjs): harness de medición; crea el mismo cliente y motor para puntuar `fixtures/voice-tests.json`.
- [`scripts/start-bare-worker.mjs`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/scripts/start-bare-worker.mjs): diagnóstico del worker Bare del SDK (`heartbeat`); no hace inferencia.
- [`src/adapters/inference/qvac/model-pack.ts`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/src/adapters/inference/qvac/model-pack.ts) y [`scripts/download-models.mjs`](https://github.com/Abraham2106/project-philips-name-pending/blob/edc86d4/scripts/download-models.mjs): descarga de pesos a `models/`; no llaman al SDK.

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

- `npm run models`: descarga Whisper y Qwen a `models/` (salta los completos; uno a medias se rebaja entero).
- `npm run dev`: inicia Vite y abre Electron; React se actualiza con HMR. Reinicia el comando después de editar el proceso principal o preload.
- `npm run dev:web`: la misma UI en el navegador, sin IPC; las pantallas quedan vacías hasta que exista un backend HTTP.
- `npm run build`: verifica tipos y compila interfaz y Electron.
- `npm start`: abre Electron con el build local; requiere `npm run build` previamente.
- `npm run smoke`: comprueba el build en una ventana Electron oculta y cierra automáticamente.

Recorrido de la interfaz para el video (verificado el 2026-09-10 con Playwright sobre Electron): `npm run dev` levanta Vite en `http://127.0.0.1:5187` y abre Electron con `window.philips`; Capturar → escribir el enunciado → Procesar (la primera extracción carga Qwen, ~20 s; después ~3 s) → responder las tarjetas «Confirmá lo que entendí» → Guardar observación → Hospitales muestra el cliente y su ficha con la base instalada. Capturas de cada paso, registro de consola y el script del recorrido quedan en `reports/ui-walkthrough/` (no versionado). Sin Electron (`npm run dev:web`) no hay IPC y cada pantalla muestra «El servidor no responde».

La interfaz no tiene acceso a Node: el preload expone solo `window.philips`. Fastify, sincronización P2P y el instalador no están implementados.

- [Guía de validación conjunta](docs/qvac-validation.md)

Medición de extracción (evaluador v2, `scripts/measure.mjs`; necesita los pesos en `models/`):

- `node --experimental-transform-types scripts/measure.mjs`: diez casos en inglés en GPU → `REPORT.md` y `reports/extraction/<fecha>-en/run.json`.
- `--es`: los mismos casos en español → `REPORT.es.md`.
- `--cpu`: carga Qwen con `gpu_layers: 0` para medir sin GPU (laptop de campo) → `REPORT.cpu.md` / `REPORT.es.cpu.md`. Configuración disponible, aún sin correr.
- `--replay reports/extraction/<corrida>/run.json`: recalcula métricas sin inferencia.
- `--self-check`: pruebas del evaluador, sin modelos.

```sh
npm run test
npm run typecheck
```

La inferencia es solo QVAC. En PowerShell con scripts bloqueados, usar `npm.cmd`.

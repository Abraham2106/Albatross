# Albatross Mobile Client

Cliente móvil Android primero para capturar observaciones sobre equipos instalados en hospitales. Esta entrega es una demo de interfaz en React Native, TypeScript y Expo SDK 57.

## Ejecutar la demo

Requisitos: Node.js 22.13 o posterior y un teléfono Android con Expo Go compatible con SDK 57.

    cd apps/mobile-capture
    npm.cmd install
    npx.cmd expo start --lan

Escanea el QR desde Expo Go mientras computadora y teléfono estén en la misma red. Si el puerto 8081 está ocupado, usa npx.cmd expo start --lan --port 8082.

También puedes abrir la vista web con npm.cmd run web. La validación hecha en este worktree fue npm.cmd run ts:check, npx.cmd expo-doctor y el arranque de Metro en el puerto 8082.

## Qué se puede recorrer

El flujo es Inicio → Nueva observación → Estado → Revisión → Detalle. Incluye hospital, ciudad, país, modalidad, cantidad, marca, modelo, serie, año de fabricación, antigüedad, nota, fotos de placa y audio representado.

El botón Demo abre escenarios deterministas: sin observaciones, computadora desconectada, captura pendiente, foto ilegible, resultado incompleto, conflicto de datos, error recuperable y observación aceptada.

## Límites de esta entrega

Los datos viven en memoria y son ficticios. Cámara, micrófono, persistencia, transporte P2P, inferencia QVAC y guardado definitivo en la computadora están pendientes de integración. No se envían datos a servicios externos. El selector de escenarios y los recibos DEMO-* no deben habilitarse en producción.

## Estructura

- presentation/: pantallas, componentes y contexto de UI.
- application/ports/: contratos que consumirá la UI.
- adapters/demo/: implementaciones deterministas en memoria.
- fixtures/: hospitales y observaciones ficticias.
- bootstrap/: composición de adaptadores.

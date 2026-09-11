# Albatross Mobile Client

Cliente móvil Android primero para capturar observaciones sobre equipos instalados en hospitales. Esta entrega es una demo de interfaz en React Native, TypeScript y Expo SDK 57.

## Ejecutar la demo

Requisitos: Node.js 22.13 o posterior, Android SDK, JDK 17 y un teléfono Android 10 o posterior con depuración USB habilitada. Bare Kit requiere una compilación de desarrollo propia; Expo Go no incluye su módulo nativo.

    cd apps/mobile-capture
    npm.cmd install
    $env:JAVA_HOME = 'C:/Program Files/Java/jdk-17'
    $env:ANDROID_HOME = 'C:/Users/solan/AppData/Local/Android/Sdk'
    npm.cmd run android:device
    npm.cmd start -- --lan

Abre la compilación de desarrollo instalada mientras computadora y teléfono estén en la misma red. Si el puerto 8081 está ocupado, usa npm.cmd start -- --lan --port 8082.

También puedes abrir la vista web con npm.cmd run web. La validación hecha en este worktree fue npm.cmd run ts:check, npx.cmd expo-doctor y el arranque de Metro en el puerto 8082.

## Qué se puede recorrer

El flujo es Inicio → Nueva observación → Estado → Revisión → Detalle. Incluye hospital, ciudad, país, modalidad, cantidad, marca, modelo, serie, año de fabricación, antigüedad, nota, fotos de placa y audio representado.

El botón Demo abre escenarios deterministas: sin observaciones, computadora desconectada, captura pendiente, foto ilegible, resultado incompleto, conflicto de datos, error recuperable y observación aceptada.

## Límites de esta entrega

Puedes adjuntar hasta tres fotos reales desde «Tomar foto» o «Elegir de galería». La cámara solicita permiso al usarla; el selector de galería permite elegir imágenes sin acceso general a la biblioteca. Las fotos se muestran antes de guardar, en revisión y en detalle. Puedes quitarlas antes de guardar.

Las observaciones viven en memoria y las fotos seleccionadas usan archivos locales temporales: no sobreviven de forma garantizada a un reinicio. Los escenarios y resultados de procesamiento siguen siendo ficticios. Micrófono, persistencia, transporte de fotos P2P, inferencia QVAC y guardado definitivo en la computadora están pendientes de integración. No se suben las fotos a servicios externos. El selector de escenarios y los recibos DEMO-* no deben habilitarse en producción.

Para probar: reinicia Metro tras instalar dependencias, abre Nueva observación, toma una foto o elige hasta tres imágenes, quita una y guarda. Comprueba también cancelar el selector y denegar el permiso de cámara. En una compilación nativa propia debes reconstruir la app para incluir los módulos y permisos nuevos.

## Estructura

- presentation/: pantallas, componentes y contexto de UI.
- application/ports/: contratos que consumirá la UI.
- adapters/demo/: implementaciones deterministas en memoria.
- fixtures/: hospitales y observaciones ficticias.
- bootstrap/: composición de adaptadores.

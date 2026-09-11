# Notas de migración

## Baseline auditado

- El worktree codex-mobile-migration ya contenía apps/mobile-capture; no fue necesario copiarlo desde el checkout principal.
- El baseline era Expo SDK 50, React Native 0.73 y React Navigation 6.
- node_modules conservaba Expo 50 aunque el proyecto fue editado para Expo 57, lo que provocaba ERESOLVE al instalar. Se eliminó únicamente apps/mobile-capture/node_modules y su lockfile local; luego se regeneró package-lock.json.
- No había archivos Kotlin, Java, Gradle ni app/ residual en la app Expo.

## Cambios realizados

- Migración a Expo SDK 57, React 19.2.3 y React Native 0.86.3 con npx expo install --fix.
- Actualización de expo-status-bar, react-native-safe-area-context, react-native-screens, TypeScript y React Navigation.
- Corrección del app.json según el esquema SDK 57.
- Sustitución completa del modelo clínico anterior por observaciones de equipos instalados.
- Adaptadores demo deterministas, sin azar; cancelar conserva la observación como cancelled.
- Implementación de Inicio, Conectar computadora, Nueva observación, Estado, Revisión, Detalle y selector de escenarios.

## Validación real

- npm.cmd install: correcto; 495 paquetes auditados. npm reportó 16 vulnerabilidades moderadas transitivas; no se ejecutó npm audit fix --force.
- npx.cmd expo-doctor: 21/21 checks passed. No issues detected!
- npm.cmd run ts:check: correcto; TypeScript terminó sin errores.
- npx.cmd expo start --clear --lan --port 8082: Metro inició y mostró Waiting on http://localhost:8082. La ejecución se detuvo manualmente después de comprobar el arranque.

## Pendiente

No está implementado todavía el transporte P2P real, QVAC, cámara, audio, persistencia durable ni ejecución en un teléfono físico. Expo Go es suficiente para esta demo visual; la integración P2P puede requerir un development build.

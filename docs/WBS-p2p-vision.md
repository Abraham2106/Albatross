# WBS — Albatross: captura móvil, P2P y visión QVAC

Fecha: 2026-09-11. Versión: 1.4. Estado: H1 en curso. H2 (2.1–2.4) implementado en computadora con pruebas. 1.3 sigue sin aceptarse, pero su bloqueo cambió: ya hay teléfono (`23117RA68G`), `adb` y Android SDK; lo que falta es la prueba con la app y la medición sin internet. 4.1–4.4 siguen en el otro hilo; este hilo no edita `apps/mobile-capture`.

## Objetivo y alcance

Extender el prototipo existente para capturar texto, voz y fotos de placas desde un celular, procesarlas con QVAC en la computadora emparejada y guardar observaciones revisadas en SQLite. Conservar captura de escritorio, estados de observación, ficha de cliente, agregados, certeza, preguntas, consultas y oportunidades.

Esta WBS (estructura de desglose del trabajo) organiza el alcance por entregables. Las dependencias indican el orden de ejecución; no son fechas comprometidas. Los responsables son roles propuestos, todavía sin asignación a personas. Todos los paquetes comienzan en estado **Pendiente**.

Referencias: [alcance](replanteamiento-p2p.md), [arquitectura](arquitectura-celular-peer.md), [visión](captura-vision.md) y [plan de validación](plan-implementacion-p2p-vision.md).

## Descomposición del proyecto

```text
0. Albatross móvil + peer QVAC
   1. Base técnica y viabilidad
      1.1 Baseline del producto existente
      1.2 Restricciones y entorno de demo
      1.3 Prueba de enlace móvil–computadora
      1.4 Prueba de visión en computadora
      1.5 Decisión técnica integrada
   2. Contratos y almacenamiento
      2.1 Protocolo y estados de captura
      2.2 Evidencia multimodal y procedencia
      2.3 Persistencia y migraciones
      2.4 Aceptación idempotente
   3. Servicio P2P de computadora
      3.1 Emparejamiento y autorización
      3.2 Transferencia de adjuntos
      3.3 Cola y ejecución QVAC
      3.4 Recuperación y ciclo de vida
   4. Aplicación móvil de captura
      4.1 Aplicación y conexión al peer
      4.2 Foto, texto y dictado
      4.3 Pendientes locales
      4.4 Revisión y aceptación
   5. Extracción visual y calidad del dato
      5.1 Adaptador de visión QVAC
      5.2 Validación y combinación de evidencia
      5.3 Duplicados, estados y conflictos
      5.4 Evaluación visual
   6. Integración con base instalada
      6.1 Evidencia y capturas móviles en escritorio
      6.2 Ficha, agregados y capacidades existentes
   7. Validación y entrega
      7.1 Pruebas integrales y regresiones
      7.2 Privacidad y funcionamiento sin internet
      7.3 Distribución, activación y reversión
      7.4 Demo y documentación final
```

## Diccionario de paquetes de trabajo

Los IDs de dependencia se refieren a paquetes de esta WBS. Un paquete termina cuando existe el entregable y se conserva la evidencia de su aceptación; escribir código por sí solo no lo completa.

**Reparto:** la aplicación móvil se construye fuera de este hilo, en `apps/mobile-capture` (Expo SDK 57, React Native 0.86.3, paquete `com.philips.albatross.mobilecapture`). Este hilo no crea ni edita esa app. Integra contratos, peer de computadora, visión QVAC y escritorio; 4.1–4.4 los cierra el hilo móvil.

| ID | Entregable y trabajo incluido | Depende de | Responsable propuesto | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| 1.1 | Reporte baseline: estado del checkout, pruebas, typecheck, build y flujo actual. | — | Integración | Resultados reproducibles, fallos previos separados y cambios del usuario preservados. |
| 1.2 | Ficha de entorno: sistema del celular, hardware de computadora, SDK, topología y requisito completo del reto. | — | Producto / arquitectura | Supuestos y restricciones registrados; no se declara elegibilidad con el texto truncado. |
| 1.3 | Prueba mínima P2P: cliente real, autenticación, envío de bytes y respuesta. | 1.1, 1.2 | P2P / móvil | Foto enviada desde el celular real, hash verificado y conexión probada sin internet; dependencias externas registradas. |
| 1.4 | Prueba mínima visual: pesos compatibles y extracción real vía QVAC en computadora. | 1.1, 1.2 | Inferencia | Imagen produce salida real; modelo, API, versión, memoria y tiempos registrados. |
| 1.5 | Decisión de arquitectura: transporte de aplicación, uso de delegación QVAC, modelo y plataforma móvil. | 1.3, 1.4 | Arquitectura | Foto del celular procesada en computadora y resultado devuelto; limitaciones y elección documentadas. |
| 2.1 | DTO versionados, operaciones, errores, cuotas y máquina de estados de captura. | 1.5 | Aplicación | Contratos cubren captura, adjuntos, progreso, borrador, aceptación, consulta y cancelación; payload inválido rechazado. |
| 2.2 | Modelo de evidencia textual/fotográfica/corrección y procedencia por ejecución. | 2.1 | Dominio | Se distinguen autor, dispositivo capturador, peer ejecutor, fechas, hash y versión de modelo; compatible con evidencia anterior. |
| 2.3 | Migraciones y repositorios para adjuntos, trabajos, borradores y recibos. | 2.2 | Persistencia | Base anterior migra preservando observaciones; reinicio recupera trabajos; backup verificable. |
| 2.4 | Aceptación transaccional con clave idempotente y revisión esperada. | 2.3 | Aplicación / persistencia | Repetir aceptación devuelve mismo recibo; payload distinto o revisión vieja devuelve conflicto; no duplica evidencia. |
| 3.1 | Invitación QR, verificación de identidad, sesión y revocación. | 2.1 | P2P | Peer no autorizado rechazado; invitación expira y no se reutiliza; revocación bloquea nuevas solicitudes. |
| 3.2 | Transferencia binaria reanudable, manifiesto, límites e integridad. | 3.1, 2.3 | P2P | Corte de conexión permite reanudar; adjunto incompleto/corrupto/sobredimensionado no llega a inferencia. |
| 3.3 | Orquestador de captura, cola acotada, progreso y ejecución secuencial de modelos. | 3.2, 5.1 | Inferencia / aplicación | Texto, audio y foto se procesan con QVAC en computadora; errores visibles y sin fallback en nube o mock. |
| 3.4 | Recuperación de sesión/trabajo, cancelación y cierre del servicio desde Electron. | 3.3, 2.4 | P2P / integración | Reinicio y ACK perdido recuperan el mismo trabajo; cancelación no revierte una aceptación persistida. |
| 4.1 | Build móvil instalable y flujo de conexión con estado del peer. | 3.1 | Móvil (`apps/mobile-capture`, otro hilo) | App abre en celular real, empareja y diferencia conectado/desconectado/no autorizado. |
| 4.2 | Captura de foto, nota y audio; selección de hospital y revisión de adjuntos. | 4.1, 2.2 | Móvil (`apps/mobile-capture`, otro hilo) | Permisos denegados manejados; recorte/orientación y eliminación EXIF; audio compatible con pipeline existente. |
| 4.3 | Cola privada durable de pendientes con reintento por ID. | 4.2, 3.2 | Móvil (`apps/mobile-capture`, otro hilo) | Captura sin peer sobrevive al reinicio y se envía una vez al reconectar; no borra la única copia pendiente. |
| 4.4 | Pantalla de evidencia/campos, correcciones, preguntas y aceptación con recibo. | 4.3, 3.4, 5.3 | Móvil (`apps/mobile-capture`, otro hilo) | Usuario revisa antes de guardar; conflicto de revisión recuperable; estado aceptado exige recibo persistido. |
| 5.1 | Puerto y adaptador visual QVAC, modelo opcional y manejo de memoria. | 2.2 | Inferencia | Imagen soportada produce DTO validable con procedencia; fallo/cancelación no impide siguiente trabajo. |
| 5.2 | Validación de campos y combinación de foto/nota/transcripción. | 5.1 | Inferencia / dominio | Campos ilegibles quedan ausentes; fabricación no se convierte en instalación; contradicciones conservadas. |
| 5.3 | Reglas de identidad, duplicados, conflictos y certeza con evidencia visual. | 5.2, 2.4 | Dominio | Dos fotos de una unidad no suman equipos; mismo autor/visita no cuenta como corroboración independiente; estados existentes conservados. |
| 5.4 | Dataset visual y reporte de calidad con conjunto reservado. | 5.2 | Validación | Al menos 20 imágenes según especificación; medir exactitud, abstención, invenciones y recursos; objetivo ≥90% en campos legibles y cero invenciones en ausentes del conjunto reservado. |
| 6.1 | Evidencia fotográfica y capturas móviles visibles en Electron. | 4.4 | Escritorio | Observación aceptada desde celular se puede inspeccionar con su fuente y correcciones. |
| 6.2 | Proyecciones actualizadas: ficha, agregados, certeza, preguntas, consultas y oportunidades. | 6.1, 5.3 | Dominio / integración | Nueva observación aparece una sola vez; cálculos provienen de datos persistidos y conservan incertidumbre. |
| 7.1 | Suite integral y reporte de regresiones de escritorio/móvil. | 6.2, 5.4 | Validación | Pasan casos del plan de validación; incluir concurrencia, reconexión, errores de modelo y migración. |
| 7.2 | Evidencia de tráfico y funcionamiento sin internet entre dispositivos. | 3.4, 4.4 | Validación / P2P | Auditar ambos dispositivos, runtime y servicio; ninguna inferencia externa; documentar descubrimiento y enlace local real. |
| 7.3 | Artefactos de demo, configuración opcional, instalación y recuperación documentadas. | 7.1, 7.2 | Integración | Build reproducible e instalación probada; desactivar peer/visión conserva flujo local y pendientes; backup/restauración descritos. |
| 7.4 | Guion, grabación, resultados y manual final de demo. | 7.3 | Producto / validación | Demostrar foto -> peer -> revisión -> SQLite -> vistas, reintento sin duplicado y recuperación offline; declarar límites medidos. |

## Hitos y secuencia sugerida

| Hito | Paquetes requeridos | Evidencia de salida |
| --- | --- | --- |
| H1: viabilidad demostrada | 1.1–1.5 | Foto real del celular procesada con QVAC en computadora y resultado de vuelta. |
| H2: base confiable | 2.1–2.4 | Persistencia, migración y aceptación idempotente comprobadas. |
| H3: captura móvil funcional | 3.1–3.4, 4.1–4.4, 5.1–5.3 | Recorrido móvil completo con pendientes, revisión y guardado. |
| H4: integración validada | 5.4, 6.1–6.2, 7.1–7.2 | Calidad visual, vistas, regresiones y tráfico verificados. |
| H5: demo entregable | 7.3–7.4 | Artefactos reproducibles y demo documentada. |

Primero resolver H1. Después ejecutar contratos y persistencia; desarrollar el adaptador visual y el peer de computadora según sus dependencias. Los paquetes 4.1–4.4 los cierra el hilo de `apps/mobile-capture`; este hilo no implementa esa app. Integrar evidencia y reglas de dominio antes de cerrar vistas y validación.

No se declara ruta crítica ni fecha final sin estimar duraciones y disponibilidad. Para calendarizar, añadir a cada paquete esfuerzo estimado, responsable nominal y capacidad disponible después de H1; la compatibilidad P2P/visión puede cambiar sustancialmente esas estimaciones.

## Límites y tratamiento de bloqueos

- La plataforma de captura es Expo SDK 57 en `apps/mobile-capture`, paquete `com.philips.albatross.mobilecapture`, orientada a Android; iOS queda fuera. El P2P en el celular exigirá un development build con `react-native-bare-kit`: Expo Go no puede cargar los enlaces nativos de Hyperswarm.
- Sin conexión al peer, el celular captura y conserva pendientes; no ejecuta modelos en este alcance.
- Si P2P o visión falla en H1, registrar causa y alternativa local viable antes de comprometer construcción adicional. Captura manual de evidencia no completa el entregable de extracción visual automática.
- Quedan fuera inferencia en nube, reconocimiento de pacientes, diagnóstico clínico, múltiples computadoras maestras y conectividad entre redes distintas garantizada.
- La evaluación visual usa etiquetas ficticias o autorizadas. Los objetivos son umbrales de aceptación propuestos, no resultados obtenidos.
- Todo cambio de alcance actualiza esta WBS y los documentos vinculados. No eliminar pruebas o capacidades comprometidas para declarar un hito terminado.

## Seguimiento

Estados permitidos: **Pendiente**, **En curso**, **Bloqueado**, **En validación**, **Terminado**. Para cada paquete iniciado registrar responsable nominal, fecha de inicio, evidencia (archivo/reporte/commit), resultado de aceptación y bloqueo concreto si existe.

| ID | Estado | Responsable | Inicio | Evidencia | Aceptación | Bloqueo |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Terminado | Integración (sesión 2026-09-10) | 2026-09-10 | [reports/h1/1.1-baseline.md](../reports/h1/1.1-baseline.md) | typecheck, 179 pruebas, build y smoke OK; cambio de `architecture.md` conservado | — |
| 1.2 | Terminado | Producto / arquitectura | 2026-09-10 | [reports/h1/1.2-entorno.md](../reports/h1/1.2-entorno.md) | Hardware, SDK 0.18.2 y supuestos registrados; elegibilidad no declarada | Celular no identificado |
| 1.3 | En curso | P2P / móvil | 2026-09-10 | [reports/h1/1.3-p2p.md](../reports/h1/1.3-p2p.md) | No: falta la corrida con la app en el celular y la prueba sin internet. Lab Node↔Node sí envió imagen y recibió serie | Ya no falta hardware: hay teléfono, `adb` y SDK. Falta development build con `react-native-bare-kit` y medir el DHT sin internet |
| 1.4 | Terminado | Inferencia | 2026-09-10 | [reports/h1/1.4-vision.md](../reports/h1/1.4-vision.md), [1.4-vision.json](../reports/h1/1.4-vision.json) | VisionPsy Flash Q4 en GPU produjo JSON real | Serie `A3T` leída como `ABT` |
| 1.5 | En validación | Arquitectura | 2026-09-10 | [reports/h1/1.5-decision.md](../reports/h1/1.5-decision.md) | Decisiones registradas; H1 no cierra sin 1.3 | Celular real |
| 2.1 | Terminado | Aplicación | 2026-09-11 | `src/application/ports/capture-protocol.ts`, `tests/contracts/capture-protocol.test.ts` | Payload inválido rechazado; estados y cuotas cubiertos | Consulta peer aún no ejecuta `queryInstalledBase` |
| 2.2 | Terminado | Dominio | 2026-09-11 | `src/application/ports/evidence.ts`, pruebas de captura | Texto/foto/corrección y procedencia de ejecución separados | — |
| 2.3 | Terminado | Persistencia | 2026-09-11 | `src/adapters/persistence/visit-repository.ts` (v3), `tests/contracts/integrity.test.ts` | Migración v2→v3 conserva sitios; trabajos se recuperan al reabrir | — |
| 2.4 | Terminado | Aplicación / persistencia | 2026-09-11 | `src/application/capture-service.ts`, `tests/contracts/capture-service.test.ts` | Misma clave/mismo payload = mismo recibo; payload distinto o revisión vieja = CONFLICT | — |
| 3.1 | En validación | P2P | 2026-09-11 | `src/adapters/peer/pairing.ts`, `device-registry.ts`, `tests/contracts/pairing.test.ts` | Invitación expira, no se reutiliza; revocación bloquea dispatch | Sin QR en Electron ni enlace DHT |
| 3.2 | En validación | P2P | 2026-09-11 | `CaptureService.upload`, prueba de reanudación en SQLite | Corte local permite reanudar; hash/manifiesto rechazan corrupto | Falta transferencia por sesión P2P real (1.3) |
| 3.3 | En validación | Inferencia / aplicación | 2026-09-11 | `CaptureService.process`, `ComputerPeerService`, `QvacPlateVisionEngine` | Cola acotada, un proceso a la vez, visión/STT/LLM secuencial; peer apagado por defecto (`QVAC_ENABLE_PEER`) | Sin celular; visión real no se carga en la suite |
| 3.4 | En validación | P2P / integración | 2026-09-11 | cancel no revierte `accepted`; `retry` desde `failed` | Reinicio de SQLite recupera trabajo; ACK perdido no cubierto en red | Sin ciclo de vida en Electron |
| 5.1 | Terminado | Inferencia | 2026-09-11 | `src/adapters/inference/qvac/qvac-plate-vision.ts`, `tests/contracts/plate-vision.test.ts` | DTO parseable con procedencia; motor deshabilitado por defecto; fallo no deja candado | No descarga VisionPsy en CI |
| 5.2 | Terminado | Inferencia / dominio | 2026-09-11 | `src/application/capture-fusion.ts`, `tests/contracts/capture-fusion.test.ts` | Ilegibles → null; fabricación ≠ instalación; contradicción nota/foto conservada | — |
| 5.3–5.4, 6.1–7.4 | Pendiente | — | — | — | — | Esperan H1 móvil / dependencias |
| 4.1–4.4 | En curso (otro hilo) | Móvil | 2026-09-11 | `apps/mobile-capture` (Expo SDK 57, React Native 0.86.3, React Navigation 7; paquete `com.philips.albatross.mobilecapture`; adaptadores demo, sin P2P) | No en este hilo | Este agente no edita la app |

Los entregables superiores se cierran cuando todos sus paquetes están terminados. No calcular avance contando archivos o líneas de código. Esta versión establece la línea base del alcance; su estado inicial no implica que las capacidades de escritorio ya existentes deban reconstruirse.

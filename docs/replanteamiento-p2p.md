# Albatross: celular de campo + computadora QVAC

Fecha: 2026-09-10. Estado: propuesta para implementar; esta entrega modifica únicamente documentación.

## Decisión de producto

Conservar Albatross y sumar captura móvil de texto, voz y fotos de etiquetas o placas. Los modelos residen y ejecutan en la computadora del usuario. El celular se empareja con esa computadora mediante P2P, envía la captura, recibe un borrador estructurado y permite revisarlo antes de guardarlo. SQLite en la computadora sigue siendo la fuente de verdad.

La promesa será: **captura en el celular, inteligencia en tu computadora, sin APIs de inferencia en la nube**. El contenido sí viaja entre estos dos dispositivos autorizados. La afirmación anterior de que el dato nunca sale de un dispositivo no describe este nuevo modo.

## Punto de partida revisado

| Capacidad | Evidencia en el repositorio | Tratamiento |
| --- | --- | --- |
| Texto y dictado con QVAC | `src/adapters/inference/qvac/`, `src/application/visits.ts` | Conservar STT y extracción actuales en la computadora. |
| Revisión, persistencia y vistas | `src/adapters/persistence/visit-repository.ts`, UI React | Reutilizar casos de uso; sumar acceso móvil. |
| Estados, conflictos, certeza y preguntas | `src/domain/` | Conservar reglas y comprobar regresiones. |
| Consultas y oportunidades | `src/application/consulta.ts`, `src/domain/analytics.ts` | Mantener alcance actual; extender evidencia fotográfica. |
| Procedencia peer | Unión `InferenceProvenance` en el puerto de inferencia | Hay representación de datos; no demuestra transporte implementado. |
| Foto | Canal `Photo` en dominio | Falta contrato visual, modelo validado, captura e integración. |
| Aplicación móvil | `apps/mobile-capture` (Expo SDK 57, React Native 0.86.3, React Navigation 7; paquete `com.philips.albatross.mobilecapture`) | Cliente Expo con adaptadores demo. La previsión original de Android nativo con Kotlin DSL quedó superada por la app que existe; `apps/android-plate/` nunca se creó. |

Esta inspección no ejecutó pruebas ni modelos. `docs/architecture.md` tiene un cambio previo preparado en Git y se conserva intacto. El plan anterior de integración QVAC contiene pasos históricos; no debe leerse como inventario vigente de pendientes.

## Alcance comprometido por el plan

1. Mantener captura conversacional, extracción incompleta, estados Confirmado/Reportado/Estimado/Desconocido, ficha de cliente y agregación geográfica.
2. Llevar al celular texto, dictado y revisión; reutilizar las capacidades adicionales existentes de preguntas, certeza, conflictos, consultas y oportunidades.
3. Añadir como nueva capacidad prioritaria la captura asistida por foto, con inferencia visual QVAC en la computadora.
4. Añadir emparejamiento, transferencia, pendientes recuperables y aceptación idempotente entre celular y computadora.

No se agrega diagnóstico clínico ni reconocimiento de pacientes. Una placa aporta evidencia sobre un equipo; no establece por sí sola cuántos equipos tiene el hospital.

## Conectividad y alcance real de offline

| Situación | Comportamiento esperado |
| --- | --- |
| Celular y computadora conectados por un enlace P2P validado | Captura, inferencia, revisión y guardado. |
| Sin internet, con enlace local entre ambos | Mismo recorrido, condicionado a demostrar descubrimiento/conexión P2P sin servicios externos. |
| Sin enlace con la computadora o computadora apagada | Captura y almacenamiento local de pendientes; inferencia al reconectar. |
| Computadora lejos, redes distintas | No es requisito de la primera demo; validar NAT, descubrimiento y posibles relays antes de prometerlo. |

No habrá inferencia móvil autónoma en este alcance. La demo preferida tendrá ambos equipos presentes, en Wi-Fi local o hotspot probado, con pesos descargados previamente.

## Supuestos y decisiones pendientes

- La plataforma implementada es Expo SDK 57 en `apps/mobile-capture`, paquete `com.philips.albatross.mobilecapture`, orientada a Android; iOS queda fuera. Para P2P real desde el celular hará falta un development build con `react-native-bare-kit`, porque Hermes no ofrece UDP ni los enlaces nativos que exige Hyperswarm.
- El modelo visual exacto se elige mediante la prueba de compatibilidad y calidad, no por el nombre del producto. VisionPsy-Nano es un candidato, no una dependencia aprobada ni probada.
- El texto del reto pegado está truncado en su requisito técnico. La aceptación del esquema de inferencia en un peer personal debe cotejarse con las bases completas/ISD antes de afirmar elegibilidad. Esa comprobación no requiere enviarles datos del proyecto.
- No se promete latencia, precisión ni conexión offline hasta medirlas en ambos equipos reales.

## Documentos de ejecución

- [WBS: entregables y paquetes de trabajo](WBS-p2p-vision.md).
- [Arquitectura y protocolo P2P](arquitectura-celular-peer.md).
- [Captura y evidencia visual](captura-vision.md).
- [Fases, pruebas y criterios de salida](plan-implementacion-p2p-vision.md).

## Fuentes técnicas y límites

La [introducción oficial de QVAC](https://docs.qvac.tether.io/introduction/) describe clientes JS/TS, Expo y aplicaciones locales/P2P. La [referencia actual de API](https://docs.qvac.tether.io/reference/api/) se identifica como v0.19.x, mientras este proyecto fija `@qvac/sdk@0.18.2`. Por eso no se trasladarán firmas actuales al proyecto sin verificar los contratos de la versión instalada. Fuentes consultadas el 2026-09-10; no prueban compatibilidad de un modelo visual específico ni elegibilidad en el reto.

# Plan de implementación y validación

Estado: todas las fases están pendientes. Este plan añade capacidades al prototipo existente; no representa implementación realizada.

## Orden de trabajo

| Fase | Trabajo concreto | Criterio de salida |
| --- | --- | --- |
| 0. Baseline | Registrar estado del checkout, respetar cambios previos, ejecutar pruebas/typecheck/build sin modelos; revisar contratos y base SQLite. | Baseline reproducible y fallos previos identificados. |
| 1. Viabilidad P2P y visión | Verificar Android/iOS real, SDK 0.18.2, build móvil, enlace autenticado y una inferencia visual en la computadora. | Celular real envía foto, computadora ejecuta QVAC y devuelve resultado; registrar APIs, modelo y tráfico. Probar además enlace sin internet. |
| 2. Contratos y persistencia | DTO versionados, adjuntos/evidencia, trabajos durables, idempotencia, revisión y migraciones. | Reinicio/reintento no pierde capturas ni duplica aceptación. Datos anteriores siguen legibles. |
| 3. Servicio peer | Emparejamiento, revocación, cola, transferencia acotada, progreso, cancelación y recuperación. | Peer no autorizado rechazado; pérdida de enlace recuperable; carga secuencial de modelos sin agotar memoria. |
| 4. Cliente móvil | Cámara, texto, audio, almacenamiento privado, pendientes, foto/campos y aceptación. **Dueño: hilo `apps/mobile-capture`.** | Recorrido completo con borrador editable; sin peer conserva datos y explica que falta procesamiento. |
| 5. Visión y dominio | Puerto visual, modelo validado, evidencia por campo, serie/fechas, fusión y conflictos. | Casos visuales reservados pasan los objetivos documentados; ninguna foto incrementa cantidades por reintento. |
| 6. Integración y demo | Ficha, agregados, certeza, preguntas, consultas y oportunidades con evidencia nueva. | Demo verificable de extremo a extremo y reporte de límites/resultados. |

La fase 1 reduce los dos riesgos principales antes de construir toda la app: que el modelo visual funcione en el equipo y que el transporte móvil funcione en las condiciones del reto. Si falla, documentar el bloqueo concreto y mantener disponible el prototipo local.

## Mapa de cambios previstos

| Área | Cambios a implementar |
| --- | --- |
| `apps/mobile-capture/` | Cliente Expo SDK 57 con React Native 0.86.3, paquete `com.philips.albatross.mobilecapture`, orientado a Android. La construye otro hilo; este plan no la reescribe. El P2P en el celular exigirá un development build con `react-native-bare-kit`. |
| `src/application/ports/` | Puerto visual y contratos de capturas/trabajos/repositorio. |
| `src/application/` | Orquestación multimodal y aceptación reutilizando `visits.ts`; validación del protocolo. |
| `src/adapters/peer/` (propuesto) | Emparejamiento, transporte, sesiones y recuperación. |
| `src/adapters/inference/qvac/` | Adaptador visual, pack opcional y gestión secuencial de memoria junto con Whisper/Qwen. |
| `src/adapters/persistence/`, `migrations/` | Adjuntos, procedencia, trabajos, recibos y evidencia compatible con datos anteriores. |
| `src/domain/` | Identidad de unidad frente a grupo, evidencia visual, fecha de fabricación separada y reglas de corroboración. |
| `src/bootstrap/`, `electron/` | Servicio peer opcional, apagado limpio y administración de dispositivos. |
| UI React actual | Mostrar evidencia fotográfica y capturas móviles; conservar flujo de escritorio. |
| `tests/`, `reports/` | Contratos, integración, mediciones reales y evidencia de demo. |

## Pruebas necesarias

| Escenario | Resultado esperado |
| --- | --- |
| Voz/texto en escritorio | Comportamiento actual conservado. |
| Foto + nota desde celular | Marca/modelo visibles, contexto correcto y borrador revisable antes de guardar. |
| Foto ilegible o campo ausente | Abstención; solicitar otra foto o dato útil sin inventar. |
| Dos fotos de la misma unidad | Evidencia adicional, sin sumar equipos ni confirmaciones independientes. |
| Foto contradice dictado | Conflicto visible y resolución humana. |
| Se corta red durante transferencia | Reanuda con integridad verificada; no procesa adjunto incompleto. |
| Se pierde recibo de aceptación | Reintento devuelve aceptación previa, sin volver a fusionar. |
| Celular y Electron aceptan con revisión vieja | Conflicto de revisión y recuperación explícita. |
| Reinicio de computadora/celular | Pendientes y resultados recuperables por ID. |
| Peer revocado / archivo sobredimensionado | Rechazo temprano; sin inferencia ni escritura de observaciones. |
| Sin internet, enlace local activo | Flujo completo medido; documentar cualquier dependencia de descubrimiento. |
| Computadora apagada | Captura pendiente; sin extracción simulada ni fallback en nube. |
| Modelo falla / falta memoria / cancelación | Error visible, captura conservada, siguiente trabajo puede continuar. |
| Migración desde base existente | Visitas, estados y evidencia textual preservados. |

## Evidencia para el reto

Grabar una demo con datos ficticios: emparejar, capturar placa y nota, ver procesamiento en la computadora, corregir un campo, guardar y comprobar ficha/agregados. Repetir una transferencia y mostrar que no duplica. Capturar sin peer y demostrar recuperación al reconectar.

El reporte debe incluir modelo/versión/hash, hardware, versión del SDK, plataforma móvil, topología P2P, latencias de transferencia/carga/inferencia y resultados visuales por campo. Inspeccionar tráfico de ambos equipos durante el recorrido; distinguir descarga previa de pesos, descubrimiento y contenido. El contador de red del renderer no cubre el servicio peer ni el worker QVAC.

La procedencia debe permitir vincular una foto con su ejecución real en la computadora y su aceptación. Presentar las capacidades fallidas o pendientes como tales. Cotejar el requisito completo P2P del reto antes de declarar cumplimiento.

## Activación y reversión

Activar móvil/P2P/visión con configuración opcional inicialmente apagada. Antes de migrar, crear copia verificable de SQLite y adjuntos; preferir migraciones aditivas. Desactivar el servicio peer y el modelo visual debe permitir seguir usando texto/voz en Electron. No eliminar capturas pendientes al desactivar una capacidad.

Si se requiere restaurar una base anterior, detener escrituras, conservar primero una copia de la base nueva y comunicar qué aceptaciones posteriores quedarían fuera de la restauración. No hacer downgrade destructivo automático.

## Definición de terminado

El celular real captura foto/texto/voz y recibe inferencia real de QVAC ejecutada en la computadora emparejada. El usuario revisa y acepta; SQLite persiste una sola observación; las vistas reflejan el resultado. Se prueban reconexión, privacidad del contenido, abstención visual y regresiones, y se entregan instrucciones reproducibles y resultados medidos.

Fuera de esta entrega documental: código, instalación de dependencias, descarga de pesos, ejecución de modelos y cambios de red. La implementación posterior seguirá las fases anteriores.

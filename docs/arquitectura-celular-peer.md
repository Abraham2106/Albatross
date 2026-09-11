# Arquitectura propuesta: celular y peer personal

Estado: diseño, no implementación. Alcance y supuestos en [el replanteamiento](replanteamiento-p2p.md).

## Componentes

```text
Celular: cámara / micrófono / texto
    -> almacenamiento privado de capturas y cola pendiente
    -> sesión P2P autenticada con la computadora emparejada
        -> servicio de captura en computadora
            -> QVAC: visión / Whisper / Qwen (pesos locales)
            -> validación y borrador de aplicación
    <- borrador + evidencia + preguntas
Celular: revisión y correcciones
    -> solicitud de aceptación con revisión esperada
        -> casos de uso existentes -> transacción SQLite
    <- recibo persistido + vista actualizada
```

La aplicación Electron mantiene sus pantallas y flujo local. El servicio peer vive fuera del renderer y expone operaciones limitadas de aplicación, sin SQL arbitrario, shell, rutas de archivos ni selección libre de modelos.

## Transporte: separar dos problemas

La delegación de inferencia QVAC y la sincronización de capturas/aceptaciones son contratos diferentes. Un proveedor de modelos no sustituye al repositorio de visitas.

Se propone un único orquestador en la computadora: el celular envía una captura mediante un canal de aplicación P2P y ese orquestador invoca QVAC local. Así se conserva el flujo de borrador y aceptación existente. La prueba inicial comparará este recorrido con la delegación nativa QVAC si el SDK móvil y la versión fijada permiten transportar las modalidades requeridas. Se registrará la decisión antes de construir el resto.

El canal de aplicación debe soportar mensajes autenticados y adjuntos binarios. Su biblioteca concreta, descubrimiento local y transporte cifrado se seleccionan en la prueba P2P. No presentar un servidor HTTP en LAN como prueba de delegación QVAC. Tampoco dar por demostrado un enlace sin internet porque la descarga de modelos admite P2P.

## Emparejamiento y autorización

1. La computadora crea una invitación de un solo uso, con expiración y referencia a su clave pública; la muestra como QR.
2. El celular escanea y ambos dispositivos verifican una huella/código corto antes de autorizar la sesión.
3. Guardar credenciales en almacenamiento seguro del sistema, con permisos de captura, revisión y consulta explícitos.
4. Cada reconexión verifica la identidad fijada. Revocar un celular desde Electron invalida sus nuevas solicitudes.
5. Limitar inicialmente a un celular autorizado y una inferencia activa; cola acotada para evitar agotar memoria.

No incluir secretos duraderos ni información del hospital en el QR. No considerar que conocer la dirección de un peer basta para estar autorizado.

## Contrato de aplicación propuesto, versión 1

Cada mensaje lleva `protocolVersion`, `requestId`, `deviceId`, `captureId`, tipo y payload validado. La identidad del autor se obtiene de la sesión autorizada, no de una afirmación del modelo.

| Operación | Contenido / resultado |
| --- | --- |
| `capabilities` | Modelos/capacidades disponibles, versiones, límites y estado de cola. |
| `submitCapture` | Hospital seleccionado, nota y manifiesto de adjuntos; devuelve recibo duradero. |
| `uploadAttachment` | Fragmentos con offset, tamaño y hash final; transferencia reanudable y verificada. |
| `getCaptureStatus` | Consulta por ID: transferencia, cola, procesamiento, revisión o error. |
| `getDraft` | Candidatos, evidencia, advertencias, preguntas y revisión del borrador. |
| `acceptDraft` | Revisión esperada, correcciones y decisiones por candidato; devuelve recibo de aceptación. |
| `cancelCapture` | Cancelación de trabajo pendiente/activo; una aceptación ya persistida no se revierte. |
| `queryInstalledBase` | Pregunta -> filtro validado -> resultados del repositorio autorizado. |

Los adjuntos viajan como bytes, nunca como rutas locales elegidas por el cliente. Tamaños, formatos y cuota se validan en ambos extremos. Misma clave idempotente con payload diferente devuelve conflicto; misma clave y mismo payload devuelve el resultado previo.

## Recuperación y consistencia

Estados locales: `captured -> pendingPeer -> uploading -> queued -> processing -> needsReview -> accepted`. Añadir `failed` y `cancelled`, con errores recuperables diferenciados. `accepted` exige recibo de la computadora; enviar una solicitud no equivale a guardarla.

Persistir captura en celular antes de transmitir, y trabajo en computadora antes de confirmar recepción. Si se pierde un ACK, consultar/reintentar por ID. Reiniciar cualquiera de las aplicaciones debe recuperar el mismo trabajo; un reintento no crea otra observación ni otra confirmación independiente.

La aceptación usa la revisión esperada del borrador y del sitio según el repositorio existente. Ante edición simultánea desde Electron, devolver conflicto y nueva revisión para que el usuario decida. Mantener la transacción de aceptación y su recibo durable juntos.

El celular conserva una proyección/cache explícitamente fechada, no otra base maestra. Después del recibo final puede eliminar adjuntos de transferencia conforme a la política de retención. La pérdida de conexión nunca elimina la única copia de una captura pendiente.

## Procedencia y límites de privacidad

Registrar `captureDeviceId`, `executorPeerId`, modelo y versión, versión de esquema, fechas de captura/recepción/procesamiento y hashes de adjuntos. Desde la computadora QVAC ejecuta `local`; desde el celular ese mismo resultado se presenta como ejecución en el peer emparejado. Preservar ambas perspectivas sin confundirlas.

Conservar auditoría de sesión y errores sin fotos, audio, números de serie ni dictados en logs. Usar archivos privados y cifrado de almacenamiento según las capacidades del sistema. Proponer eliminación de originales en celular tras aceptación confirmada; en computadora, retención de evidencia configurable y borrado explícito que marque la evidencia como retirada.

`src/application/network-audit.ts` cubre tráfico del renderer, no toda la computadora. El modo P2P requiere auditar también el servicio peer y el runtime QVAC, distinguir tráfico de descubrimiento de contenido y bloquear endpoints de inferencia externa. No usar el contador actual de interfaz como prueba suficiente de privacidad.

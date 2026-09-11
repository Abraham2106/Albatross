# Arquitectura móvil

La app usa Ports & Adapters para que la UI pueda conservarse cuando se reemplacen los adaptadores demo por capacidades reales.

    React Native screens
            ↓
    AppContext / hooks
            ↓
    application/ports
            ↓
    bootstrap
            ↓
    adapters/demo (actual)

La UI solo conoce las interfaces de application/ports. bootstrap/index.ts compone el adaptador de emparejamiento y el adaptador de observaciones. Los fixtures representan hospitales y equipos instalados.

## Puertos actuales

- ComputerConnectionPort: estado visual de emparejamiento, código y huella de una computadora.
- CaptureManagementPort: crear, listar, consultar, actualizar, aceptar y cancelar observaciones.
- EquipmentDraft: modalidad, cantidad, marca, modelo, serie, año de fabricación, antigüedad, evidencia, advertencias y estado de cada campo.

Los estados de observación son captured, pending_peer, uploading, queued, processing, needs_review, accepted, failed y cancelled. La revisión distingue Confirmado, Reportado, Estimado y Desconocido.

## Integración futura

Los adaptadores reales deberán implementar estos puertos sin cambiar las pantallas:

1. Emparejamiento P2P autenticado con la computadora que ejecuta QVAC.
2. Carga de adjuntos mediante manifiesto, hash y reanudación.
3. Cámara y audio del dispositivo con permisos explícitos y limpieza de metadatos.
4. Caché local durable para pendientes.
5. Recepción de borradores, advertencias y conflictos de revisión.
6. Recibo de aceptación persistido en la computadora.

El protocolo P2P, la identidad, el cifrado y la inferencia no se inventan en esta capa. La fuente de verdad futura será la computadora; la app móvil mantendrá pendientes y una copia de consulta.

## Límites y seguridad de la demo

adapters/demo no usa red, cámara, micrófono ni modelos. Los escenarios y los recibos DEMO-* son visibles para evitar que se confundan con resultados reales. La demo no calcula confianza, duplicados ni oportunidades de renovación. Esas reglas pertenecen al servicio QVAC y a su repositorio.

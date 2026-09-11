# Captura asistida por foto de placa

Estado: especificación pendiente de validar con un modelo QVAC real en la computadora.

## Recorrido

1. Seleccionar hospital o conservarlo sin resolver si aún no se conoce; permitir una nota escrita o dictada.
2. Fotografiar la placa, recortar a la etiqueta y revisar la imagen antes de enviarla. Avisar que evite pacientes y documentos clínicos.
3. Corregir orientación, eliminar metadatos EXIF y conservar resolución suficiente para letras pequeñas. Guardar la imagen procesada con su hash; cualquier recorte posterior será otra evidencia derivada.
4. Enviar al peer autorizado o dejar pendiente si no está disponible.
5. Ejecutar modelo visual QVAC en la computadora. Validar salida, estructurar los campos legibles y combinar con el contexto sin sobrescribir contradicciones.
6. Mostrar foto y campos lado a lado para revisar, corregir, marcar ilegible o descartar. Preguntar por el dato faltante de mayor valor.
7. Aceptar mediante el mismo caso de uso transaccional que texto/voz y actualizar las vistas.

## Selección del modelo

Evaluar primero VisionPsy-Nano si su formato y backend están soportados por QVAC en este Windows. Confirmar pesos, licencia, proyector visual si aplica, API de imagen, cuantización y consumo de RAM/VRAM. El nombre de un modelo en documentación no prueba que pueda leer placas pequeñas.

El pipeline preferido es imagen -> modelo visual QVAC -> campos con evidencia. Evaluar OCR QVAC + extracción Qwen como alternativa local si la lectura visual no alcanza calidad suficiente; documentarla como OCR asistido, sin atribuir resultados a un VLM no ejecutado. Si el backend requerido solo existe en otra versión, proponer una actualización aislada con regresiones de STT/LLM antes de cambiar el lockfile.

No reemplazar visión por respuestas simuladas ni servicios externos. Si la prueba falla, foto queda como evidencia para revisión manual y la funcionalidad automática se reporta pendiente.

## Campos y evidencia

| Campo | Regla |
| --- | --- |
| Cliente, ciudad y país | Contexto seleccionado o mencionado; una etiqueta no prueba ubicación actual. |
| Marca y modelo | Solo caracteres legibles; mantener la lectura original junto a la normalización. |
| Modalidad | Extraer si hay soporte explícito; inferencias por nombre/modelo requieren revisión y evidencia. No forzar equipos fuera de catálogo a la modalidad más cercana. |
| Serie | Extensión propuesta para identificar una unidad; conservar original y normalización conservadora. Ilegible -> `null`. |
| Fecha de fabricación | Campo separado si la etiqueta la identifica explícitamente. |
| Fecha de instalación / antigüedad | Fabricación no equivale a instalación. Derivar antigüedad de instalación únicamente con fecha respaldada y fecha de referencia. Mantener estimaciones de la nota como estimaciones. |
| Cantidad | Una foto no determina el total del hospital. Proponer una unidad observada solo al revisar que representa un equipo; nunca sumar automáticamente cada foto. |

Proponer un puerto `PlateVisionEngine` separado del contrato textual inicial, para no obligar a que toda evidencia sea una cita del dictado. Su resultado tendrá campos nullable, lectura original, `imageId`, advertencias de legibilidad y procedencia del modelo. La aplicación añade autor, fechas y decisiones humanas.

Ampliar evidencia con una unión versionada: `text` (cita verificable), `photo` (hash/ID, lectura propuesta y recorte opcional) y `humanCorrection` (valor anterior, nuevo y autor). Las coordenadas de un recorte, si existen, deben referirse a la imagen exacta y validarse; no son prueba automática de que los caracteres sean correctos.

Una salida visual plausible no cuenta como evidencia verificada. Foto ilegible es ausencia de lectura, no la afirmación del colaborador de que desconoce el campo. Preservar la distinción actual entre `null` y desconocimiento explícito.

## Fusión y confianza

- Mantener estados `Confirmed`, `Reported`, `Estimated`, `Unknown`. Aceptar un borrador no confirma automáticamente todos sus datos.
- Un dato visible corregido/revisado puede respaldar un campo conforme a una regla explícita de dominio; no confirma ubicación, cantidad total ni antigüedad no visibles.
- Deduplicar transferencia por ID/hash y sugerir coincidencia de equipo por fabricante + serie + contexto. Una coincidencia en otro hospital abre revisión por posible traslado o error.
- Fotos distintas de la misma placa no añaden unidades. Sin serie, marca/modelo/modalidad son una sugerencia de duplicado, no una identidad segura.
- Foto y dictado de la misma visita/autor no son confirmaciones independientes. Mantener certeza explicable basada en completitud, frescura y corroboraciones independientes.
- Si voz y foto difieren, mostrar ambas afirmaciones. Las oportunidades de renovación se calculan con la antigüedad respaldada y sus límites; no como una recomendación clínica.

## Evaluación visual

Preparar al menos 20 fotos de etiquetas ficticias o autorizadas, con verdad de referencia por campo: nítidas, inclinadas, reflejo, desenfoque, recortadas, sin fecha, números ambiguos y dos tomas del mismo equipo. Separar ejemplos usados para ajustar el prompt de los usados para evaluar.

Medir exactitud de marca/modelo/serie/fecha, abstención ante ilegibilidad, valores inventados, duplicados, latencia fría/caliente y memoria máxima. Objetivos iniciales de demo: al menos 90% de coincidencia exacta en campos legibles del conjunto reservado y cero valores inventados en campos ausentes. Son criterios propuestos, no resultados actuales.

Límites iniciales propuestos: JPEG/PNG, máximo 10 MB y 20 megapíxeles por imagen, tres fotos por captura y audio de hasta dos minutos. Validar tamaño decodificado antes de reservar memoria, rechazar archivos malformados y afinar límites según mediciones. El texto dentro de la foto se trata como dato no confiable; nunca como instrucciones para ejecutar acciones.

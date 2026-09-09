# Propuesta de arquitectura por revisar — Philips

**Estado: arquitectura de producto pendiente de revisión.** Electron + React + Vite + TypeScript constituyen la base de escritorio solicitada. Las demás capas, contratos y tecnologías siguen como propuesta por revisar. El requisito de inferencia QVAC local o P2P sin inferencia de nube permanece vigente.

## Objetivo y alcance

Construir en 48 horas un prototipo que prepare las visitas a hospitales identificando vacíos de información sobre su base instalada, procese dictados posteriores y sincronice observaciones entre colaboradores. Toda inferencia debe ejecutarse mediante QVAC en el dispositivo o en peers de confianza; no se permite inferencia mediante APIs de nube.

El proyecto conserva únicamente este documento y archivos .gitkeep para mantener las carpetas de la propuesta. No contiene código, manifiestos ni configuración ejecutable. La integración QVAC está pendiente de implementación y validación. Las carpetas también pueden cambiar como resultado de la revisión.

## Sugerencia: monolito modular con arquitectura hexagonal

Cada dispositivo ejecutaría Electron con interfaz React/Vite. El renderer está aislado de Node; los futuros casos de uso se conectarían mediante métodos acotados de IPC expuestos por preload. Fastify es opcional y no está instalado: solo se evaluaría para otros clientes HTTP. La persistencia y la inferencia siguen pendientes; la inferencia deberá ejecutarse fuera del renderer y sin bloquear el proceso principal.

Un único proyecto TypeScript reduce coordinación y preparación durante el hackathon. La división en módulos mantiene responsabilidades y contratos explícitos sin añadir despliegues independientes ni publicar un paquete npm por módulo. La arquitectura hexagonal permite sustituir infraestructura mediante puertos y probar el negocio sin UI, red o modelos reales.

La dependencia de código apunta hacia el dominio:

```text
domain                         reglas e invariantes puras
application -> domain          puertos y casos de uso
adapters -> application/domain implementaciones de infraestructura
ui -> contratos de aplicación  presentación y futuro puente IPC
bootstrap -> capas necesarias  construcción e inyección
```

La UI se comunica en ejecución con la API local; importar tipos no implica ejecutar casos de uso del servidor en el navegador. Solo bootstrap selecciona implementaciones concretas. Los módulos exponen su superficie pública por index.ts cuando corresponde; los consumidores no deben acceder a archivos internos de otro módulo.

## Mapa de responsabilidades

| Ubicación | Responsabilidad y límite |
| --- | --- |
| src/domain/hospitals/ | Identidad del hospital, equipos y perfil agregado; sin almacenamiento. |
| src/domain/observations/ | Hechos, estados, procedencia, correcciones e invariantes de observación. |
| src/domain/reconciliation/ | Distinguir duplicados, corroboraciones y conflictos mediante reglas deterministas. |
| src/domain/completeness/ | Calcular huecos, prioridad y score explicable a partir de hechos y política recibida. |
| src/domain/typical-profiles/ | Aplicar perfiles esperados configurables y conservar sugerencias sin confirmar. |
| src/application/ports/ | Contratos propios de inferencia, repositorios, sincronización, identidad, catálogo y reloj. |
| src/application/use-cases/ | Coordinar intenciones del colaborador sin conocer SDK, SQL ni transporte. |
| src/adapters/inference/ | Implementar InferenceEngine y encapsular QVAC, modelos y procedencia de ejecución. |
| src/adapters/persistence/sqlite/ | Consultas y proyecciones locales; SQL no atraviesa sus contratos. |
| src/adapters/sync/p2p/ | Frontera de sincronización entre peers; transporte y tecnología de replicación pendientes de elección. |
| src/adapters/identity/ | Firma, verificación y vinculación de claves con identidades autorizadas. |
| src/adapters/dataset/ | Validar y transformar el dataset externo al modelo propio, preservando su procedencia. |
| src/adapters/config/ | Leer y validar configuración antes de entregarla como datos tipados al dominio. |
| src/adapters/http/ | Rutas de la API local, validación de solicitudes y traducción de errores. |
| src/ui/features/ | Pre-visita, post-visita, hospital nuevo y mapa del país; sin cálculo duplicado de scores. |
| src/ui/components/ | Componentes de presentación compartidos. |
| src/ui/api/ | Futuro cliente del puente IPC; sin acceso directo a QVAC o SQLite. |
| src/bootstrap/ | Inicio, composición de dependencias y cierre de recursos. |
| config/ | Perfiles hospitalarios, taxonomía y política de scoring ajustables sin recompilar. |
| migrations/ | Evolución futura del esquema de persistencia. |
| fixtures/ | Datos sintéticos identificados para desarrollo y pruebas. |
| docs/decisions/ | Registro de futuras decisiones y alternativas consideradas. |

El contrato InferenceEngine lo implementa `QvacInferenceEngine`. Los demás puertos y casos de uso de las secciones siguientes siguen como propuesta. En el reparto del equipo, App significa UI; la carpeta application/ describe la coordinación de casos de uso que integra Infra, apoyándose en Dominio y QVAC.

## Casos de uso y puertos

| Caso de uso | Resultado esperado |
| --- | --- |
| prepare-visit | Perfil actual y preguntas priorizadas según huecos, vigencia y contradicciones. |
| process-dictation | Transcripción y candidatos estructurados validados; extraer no equivale a confirmar. |
| accept-observations | Registrar observaciones con procedencia y estado adecuado, y actualizar proyecciones. |
| bootstrap-hospital | Iniciar con dictado libre y proponer un perfil sin confirmarlo automáticamente. |
| answer-profile-item | Procesar sí/no/no sé; desconocimiento no equivale a ausencia de equipo. |
| import-dataset | Incorporar datos iniciales con procedencia y estados explícitos. |
| synchronize-observations | Incorporar eventos autorizados de manera idempotente y reconciliar resultados. |
| get-country-overview | Entregar una vista agregada para el mapa sin reglas de negocio en la UI. |

InferenceEngine ofrece capacidades acotadas como transcribir, extraer candidatos y redactar seguimientos. No calcula el score ni decide por sí solo qué es verdadero. ObservationRepository y HospitalRepository expresan operaciones del negocio; PeerSync oculta replicación y transporte; Identity permite autenticar registros; ProfileCatalog suministra configuración validada; Clock hace explícito el tiempo usado para vigencia y pruebas.

Los tipos de SDK, Buffer de Node, conexiones y respuestas HTTP no deben atravesar los puertos del producto. Para audio se prevén Uint8Array o referencias opacas, traducidos por el adapter. Los contratos definitivos se escribirán durante la implementación.

## Observaciones, certeza y sincronización

Los estados del reto son Confirmado, Reportado, Estimado y Desconocido. La procedencia de una sugerencia y los conflictos deben conservarse como información adicional, sin inventar un quinto estado del reto.

Se propone un registro de observaciones inmutables: identidad del evento, hospital, campo, valor, estado, autor, tiempo observado, tiempo registrado y procedencia. Una corrección referencia un registro anterior. Los perfiles son proyecciones de ese historial. Datos importados deben identificarse como tales y no atribuirse falsamente a un colaborador.

La completitud, vigencia y corroboración son dimensiones distintas. Un indicador combinado puede resumirlas con política versionada y componentes explicables, pero no debe presentarse como probabilidad calibrada de verdad. El score debe ser finito y permanecer en [0,1]. No hay porcentajes de demo hardcodeados ni garantía de incremento: nueva evidencia contradictoria o el paso del tiempo pueden reducirlo.

Recibir el mismo evento dos veces no agrega evidencia. Reportes independientes pueden corroborar; copias reenviadas conservan su origen y no cuentan como autores nuevos. Los conflictos no se resuelven únicamente tomando el timestamp más reciente. Mientras los dispositivos estén desconectados no se puede garantizar que nunca repitan preguntas; después de sincronizar deben recalcular los huecos con la evidencia incorporada.

Hyperswarm es únicamente un candidato para una prueba técnica, no una decisión final ni una dependencia aprobada del scaffold. Hypercore puede evaluarse junto con él como alternativa de registro replicable; tampoco se fija su adopción. El puerto PeerSync y la carpeta neutral src/adapters/sync/p2p/ deben permitir elegir otra implementación sin cambiar los casos de uso.

Si se adopta la alternativa Hypercore, se evaluaría un log por escritor autorizado como fuente replicada y SQLite como proyección local reconstruible con cursores persistidos e ingesta idempotente. Esta distribución de almacenamiento queda condicionada al resultado de la prueba. En cualquier implementación se debe definir una fuente de verdad explícita, evitar escrituras independientes inconsistentes y sincronizar registros mediante contratos, no copiar el archivo SQLite entre dispositivos.

[Hypercore](https://github.com/holepunchto/hypercore) proporciona registros append-only autenticados y [Hyperswarm](https://github.com/holepunchto/hyperswarm) conecta peers mediante streams cifrados. Eso no sustituye autorización, asociación de claves con personas, validación de payloads ni reconciliación de negocio. Las versiones, la integración y la conectividad en las máquinas objetivo quedan pendientes de validación. La operación local sin conexión y el descubrimiento P2P son capacidades distintas.

La prueba de Hyperswarm debe comprobar conexión en las redes y equipos de la demo, requisitos de descubrimiento, reconexión, autorización de peers y esfuerzo de integración. Su resultado se registrará en docs/decisions/ antes de seleccionar el transporte. Si no satisface esos criterios, se evaluará otra implementación de PeerSync; el requisito P2P permanece.

## Aplicación de los once principios

| Principio | Aplicación propuesta |
| --- | --- |
| Divide and conquer | Módulos acotados y casos de uso separados por intención. |
| Alta cohesión | Scoring, reconciliación, identidad e inferencia tienen responsabilidades propias; no hay carpeta de utilidades indiscriminadas. |
| Bajo acoplamiento | Contratos explícitos y datos inmutables; sin estado global mutable compartido. |
| Encapsulamiento | Puertos propios ocultan SDK, transporte, almacenamiento y detalles de plataforma. |
| Reusabilidad | Completitud, perfiles y reconciliación no dependen de UI; sync se integra mediante un puerto sustituible. |
| Reutilizar antes que reinventar | Evaluar librerías maduras para validación, persistencia y P2P; concentrar el desarrollo propio en el negocio. |
| Flexibilidad | Perfiles, pesos, umbrales y taxonomías en configuración validada. |
| Anticipar obsolescencia | QVAC aislado y versionado; las actualizaciones afectan su frontera. |
| Portabilidad | Dominio y aplicación sin Node, DOM, SQLite o APIs nativas. |
| Testabilidad | Funciones puras y mocks de puertos; reloj inyectable. |
| Diseño defensivo | Validar inferencia, dataset y mensajes P2P en fronteras; invariantes explícitas antes de persistir. |

## Verificación prevista y orden de implementación

1. Implementar dominio y contratos: estados, sugerencias, score, dedupe y conflictos con pruebas deterministas.
2. Implementar la integración QVAC y validar temprano STT y extracción reales en una máquina objetivo, sin fallback de inferencia a nube.
3. Cerrar el recorrido hospital existente → huecos → dictado → validación → persistencia → perfil actualizado.
4. Incorporar hospital nuevo mediante dictado libre y revisión del perfil sugerido.
5. Validar sync entre dos dispositivos, reconexión, duplicados y convergencia ante diferente orden de llegada.
6. Conectar el mapa a las proyecciones reales y verificar el recorrido de demo.

tests/unit cubrirá invariantes y funciones puras; tests/contracts, implementaciones sustituibles de puertos; tests/architecture, imports prohibidos; tests/integration, persistencia y flujos entre componentes. Las pruebas con modelos o peers reales serán explícitas y diferenciadas de los mocks.

También deberá comprobarse que no exista un fallback a inferencia de nube y observar las conexiones durante la demo. Un mock exitoso no demuestra ejecución QVAC ni cumplimiento de red. El build y el smoke check de Electron verifican únicamente la base de escritorio, no las funciones del producto ni QVAC.

## Puntos pendientes de revisión

- Confirmar plataforma de la demo y compatibilidad de QVAC con el hardware disponible.
- Revisar si la división de módulos es proporcional al alcance de 48 horas.
- Definir contratos, fórmula de scoring, vigencia y reglas de corroboración y conflictos.
- Evaluar persistencia y fuente de verdad antes de adoptar SQLite o un log replicado.
- Probar Hyperswarm y, si resulta útil, Hypercore; elegir tecnologías solo con evidencia de integración y conectividad.
- Revisar el dataset real y definir los contratos de los adaptadores por implementar.

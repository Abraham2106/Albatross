# Albatross

**Convierte lo que un ingeniero de campo vio en un hospital, dicho en voz alta, en una base instalada estructurada y auditable. Todo el procesamiento ocurre dentro de la laptop: el dato del cliente nunca sale del dispositivo.**

La mayoría de las herramientas de captura esperan a que alguien reporte. Albatross hace lo contrario: **calcula qué le falta averiguar de cada hospital y se lo dice antes de la visita.** La lista de clientes se ordena por los más incompletos primero, y cada ficha abre con "Antes de entrar, averiguá".


---

## El problema

Cada día, ingenieros de servicio, especialistas de aplicación y account managers entran a hospitales y ven equipos: cuántos resonadores hay, de qué marca, qué tan viejos. Ese conocimiento se queda en la cabeza de la gente, en notas sueltas o en un WhatsApp. La organización no lo tiene.

Llenar un formulario después de cada visita no funciona: toma minutos que nadie tiene y produce descripciones inconsistentes. Y aunque funcionara, seguiría sin resolver el problema difícil, que es **saber qué es lo que no sabemos**.

## La idea

Un colega dicta veinte segundos al salir del hospital:

> «Estuve en Hospital Alpha en São Paulo. Vi dos CT y tres MR. Dos de los MR parecen de unos nueve años, uno es bastante más nuevo.»

Albatross transcribe, extrae los grupos de equipo, muestra lo que entendió para que la persona lo confirme, y actualiza la ficha del hospital. La certeza del sitio sube y su posición en la lista baja, porque ya hace falta menos.

La siguiente persona que abra ese hospital no ve un formulario en blanco. Ve tres preguntas concretas, ordenadas por cuánto valen.

## Cómo se ve

| Antes de la visita | Después del dictado |
| --- | --- |
| [Ficha del hospital] | [Revisión de lo captado] |

Cuatro pantallas: **Hospitales** (ordenados por lo que falta), **Capturar** (dictado y revisión), **Cobertura** (región → país → ciudad → hospital) y **Panorama** (equipos por modalidad, base envejecida, sitios sin verificar).

Los cronómetros de transcripción/procesamiento, los tiempos de carga y la ventana **Velocidad de Whisper** son herramientas exclusivas del ambiente de desarrollo y validación (`npm run dev`). No forman parte del producto ni del prototipo mínimo presentado a Philips y están deshabilitados en el build de producción.

---

## Lo que lo hace distinto

**1. El sistema sabe qué le falta.** Un motor determinista compara lo conocido contra el perfil esperado del tipo de centro y ordena los huecos por peso de negocio, antigüedad del dato y contradicciones abiertas. La misma función genera las preguntas previas a la visita y las repreguntas durante la captura.

**2. El modelo no puede inventar.** Cada campo extraído tiene que **citar textualmente el dictado**. Si la cita no aparece literal en la transcripción, la extracción se rechaza completa. No es un ruego en el prompt: es una validación que corre después del modelo y que se puede leer en veinte líneas de código.

**3. Un dato ausente y un dato desconocido no son lo mismo.** Si nadie mencionó la marca, el campo queda `null`. Si la persona dijo "no sé la marca", queda `Unknown`. Son dos hechos distintos sobre el mundo y el sistema los trata distinto: el primero genera una pregunta, el segundo no se vuelve a preguntar a esa persona.

**4. Los conflictos no se resuelven solos.** Si un colega reportó tres MR y otro reporta cuatro, no gana el más reciente. Se abre una contradicción visible que sube al tope de la lista de pendientes y que un humano decide.

**5. Corre entero en la laptop.** Whisper Turbo para voz y Qwen3-4B para extracción, ambos en el dispositivo. Un hospital que no permite que sus datos salgan a un servidor externo puede usar esto tal como está, en el sótano, sin cobertura.

---

## Cómo funciona

```
voz  →  Whisper Turbo (local)  →  transcripción
        ↓
        Qwen3-4B (local, salida restringida por esquema JSON)
        ↓
        validación: ¿cada campo cita el dictado?  → si no, se rechaza
        ↓
        dominio: ¿dato nuevo, corroboración o conflicto?
        ↓
        el humano confirma lo captado
        ↓
        SQLite local  →  certeza recalculada  →  nuevas preguntas
```

**El modelo propone, el código determinista decide.** El LLM nunca escribe en la base ni ejecuta acciones: produce estructura bajo `responseFormat: json_schema` con `temp: 0` y `seed: 42`. Todo lo que decide qué es verdad son funciones puras y probadas.

### Resultados medidos

Con los modelos reales corriendo, contra los diez enunciados de referencia del reto:

| | Modalidad | Cantidad | Marca | Edad | Latencia mediana |
| --- | --- | --- | --- | --- | --- |
| Inglés | 100% | 100% | 88% | 100% | 3.2 s |
| Español | 100% | 88% | 81% | 100% | 3.4 s |

Se mide aparte el **relleno**: cuántas veces el modelo puso un valor que nadie mencionó. Inventar es peor que callar. Detalle completo en [`REPORT.md`](REPORT.md) y [`REPORT.es.md`](REPORT.es.md), generados por `scripts/measure.mjs`.

---

## Correrlo

Node.js 22.17+. Probado en Windows x64 con Vulkan.

```sh
npm install
npm run models   # ~4.1 GB de pesos, una sola vez
npm run dev
```

Sin los pesos la aplicación abre igual y **Procesar** queda deshabilitado; dentro de Capturar hay un botón de descarga con progreso. Verificación rápida sin modelos ni GPU:

```sh
npm test        # 69 pruebas
npm run typecheck
npm run smoke   # arranca Electron, valida IPC y aislamiento, cierra solo
```

### Herramientas de desarrollo

En Capturar, los tiempos permiten distinguir la carga de modelos de la inferencia: **Transcripción** corresponde a Whisper y **Procesamiento** a la extracción con Qwen. Durante la ejecución se muestra un contador; al finalizar se presentan las mediciones del engine. Una carga de Whisper cercana a cero indica reutilización del modelo precargado al grabar, no ausencia de carga previa.

**Velocidad de Whisper**, accesible desde Capturar o desde `Herramientas → Velocidad de Whisper` (`Ctrl+Shift+W`), sirve para probar un dictado o WAV, repetir transcripciones y consultar sus métricas. No ejecuta Qwen ni registra equipos en la base instalada.

Estas superficies se habilitan con `npm run dev`. Con `npm run build` seguido de `npm start`, y en una aplicación empaquetada, se ocultan los cronómetros, el botón, el menú y el atajo de la herramienta; Electron bloquea también sus IPC. El riel de progreso y el dictado del producto permanecen disponibles. Detalle en [la guía de validación](docs/qvac-validation.md#instrumentación-exclusiva-de-desarrollo).

---

## Bajo el capó

Electron + React + TypeScript, arquitectura hexagonal, un solo proceso. La dependencia apunta siempre hacia adentro:

```
src/domain/        reglas puras: fusión, conflictos, certeza, misiones
src/application/   puertos y casos de uso; no conoce SDK, SQL ni transporte
src/adapters/      QVAC y SQLite; implementan los puertos
ui/                React; habla solo por el puente IPC
src/bootstrap/     compone las dependencias concretas
```

**Estado y persistencia.** SQLite con WAL, transacciones `BEGIN IMMEDIATE`, concurrencia optimista por revisión y una tabla inmutable de aceptaciones. Procesar dos veces la misma observación no agrega evidencia, lo cual es requisito para poder replicar el registro más adelante.

**Superficie de ataque.** `contextIsolation`, `sandbox`, `nodeIntegration: false`, validación de emisor y frame en cada canal IPC, CSP restrictiva, navegación y ventanas nuevas denegadas, permisos limitados al micrófono. El dictado se trata como dato no confiable y nunca como instrucción: el texto de campo no puede alterar el comportamiento del sistema, y aunque lo intentara, la salida está restringida por esquema y el modelo no tiene autoridad de escritura.

**69 pruebas** cubren el dominio (fusión, conflictos, idempotencia, certeza), los contratos del adaptador QVAC (JSON inválido, alias de modalidad, cancelación, timeouts, recarga de modelos) y la integración con SQLite.

---

## Límites conocidos

- Sincronización entre dispositivos: no implementada. El registro ya es determinista e idempotente, que es la parte difícil, pero el transporte no está.
- No hay instalador empaquetado; se ejecuta desde el código.
- La vista de cobertura usa bloques y puntos, no cartografía real: cualquier librería de mapas carga teselas desde internet y eso rompería la promesa de funcionar sin conexión.

---

## Atribución

Inferencia con [`@qvac/sdk`](https://qvac.tether.io) 0.18.2 (Apache-2.0). Los pesos no se distribuyen aquí; se descargan de su fuente original: [Whisper large-v3-turbo](https://huggingface.co/ggerganov/whisper.cpp) (MIT) y [Qwen3-4B Q4_K_M](https://huggingface.co/unsloth/Qwen3-4B-GGUF) (Apache-2.0). Ningún modelo fue entrenado ni ajustado por el equipo.

Interfaz con React 19 y Electron 44 (MIT); build con Vite y esbuild (MIT); TypeScript y pruebas con Vitest. `node:sqlite` y `node:crypto` son módulos integrados de Node 22. Sin librería de mapas.

Los datos de ejemplo son ficticios y provienen del workbook entregado por la empresa que publica el desafío. No se usó información real de clientes.

Todo el código de producto de este repositorio se escribió durante las 48 horas de la competencia, con asistentes de programación basados en IA. No se partió de una plantilla ni de un repositorio anterior del equipo.

## Licencia

Propietaria, todos los derechos reservados. Ver [LICENSE](LICENSE). Los jurados y organizadores del Decentralized AI Hackathon tienen permiso de evaluación durante el período de calificación.

## Equipo

Ricardo Solís Arias · Marco Gomez Mendez · Abraham Solano Parrales · Sebastián Granados Artavia


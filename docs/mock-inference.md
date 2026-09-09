# Mock de inferencia para infraestructura

## Qué es cada parte

En la división de este equipo, **App = UI**: la interfaz React que ve el colaborador. Los cuatro frentes son Dominio, QVAC, Infra y App/UI. Infra conecta Electron, IPC, persistencia y sincronización, y coordina los casos de uso apoyándose en las reglas de Dominio y el puerto de QVAC. Esto cumple el papel de backend local sin necesitar un servidor de nube ni Fastify.

La carpeta técnica `application/` contiene contratos y casos de uso; no corresponde al frente App/UI. El contrato `InferenceEngine` se acuerda entre QVAC e Infra. Infra lo consume y QVAC prepara su implementación real; App/UI recibe los resultados a través del puente IPC.

El mock sustituye únicamente la inferencia. No interpreta audio real, no ejecuta QVAC, no guarda datos y no sincroniza dispositivos. Devuelve respuestas programadas para desarrollar esas conexiones antes de tener los modelos disponibles.

```text
React → puente IPC de Electron → caso de uso
                                  ├─ InferenceEngine (mock ahora; QVAC después)
                                  ├─ validación y reglas del dominio
                                  └─ repositorio local (por implementar)
```

El puente IPC, los casos de uso y la persistencia de este recorrido todavía no están implementados. La pantalla inicial no llama al mock automáticamente.

## Contrato disponible

Importar tipos desde `src/application/ports/inference-engine.ts`. El punto de composición construye `MockInferenceEngine` desde `src/adapters/inference/mock/index.ts` y lo entrega al caso de uso. El caso de uso depende solo de `InferenceEngine`.

| Método | Entrada | Resultado en `data` |
| --- | --- | --- |
| `transcribe` | Bytes de audio y MIME type | `{ text }` |
| `extractObservations` | `hospitalId` y transcripción del escenario | `{ hospitalId, candidates }` |
| `generateFollowUps` | `hospitalId` y huecos con ID y descripción | Lista de `{ gapId, text }` |

Todas las respuestas incluyen `provenance: { execution: 'mock', scenario }`. Esa marca debe mantenerse en los datos de desarrollo para que no se confundan con inferencia real.

## Ejemplo de integración

Las rutas de import deben ajustarse a la ubicación del archivo consumidor. Este ejemplo muestra el recorrido; no persiste observaciones.

```ts
import type { InferenceEngine } from '../application/ports/inference-engine';
import { MockInferenceEngine } from '../adapters/inference/mock';

// Construcción en bootstrap, no dentro de React ni de las reglas del dominio.
const inference: InferenceEngine = new MockInferenceEngine({
  scenario: 'post-visit',
  latencyMs: 300,
});

// El mock acepta bytes ficticios: no valida ni decodifica el archivo de audio.
const transcription = await inference.transcribe({
  audio: new Uint8Array([1, 2, 3]),
  mimeType: 'audio/webm',
});

const extraction = await inference.extractObservations({
  hospitalId: 'hospital-alpha',
  transcript: transcription.data.text,
});

// extraction.data.candidates:
// [
//   { modality: 'CT', field: 'count', value: 2, evidence: 'dos CT' },
//   { modality: 'MR', field: 'count', value: 4, evidence: 'cuatro MR' },
// ]

const followUps = await inference.generateFollowUps({
  hospitalId: 'hospital-alpha',
  gaps: [{ id: 'ct-age', description: 'edad de los CT' }],
});
```

Infraestructura puede usar `extraction.data` para desarrollar el siguiente paso: validar candidatos, solicitar revisión y construir observaciones con autor, fecha y estado antes de persistir. El mock no inventa esos atributos ni marca candidatos como confirmados. Tampoco calcula scores ni decide qué huecos existen.

## Escenarios y errores

| Escenario | Transcripción / comportamiento |
| --- | --- |
| `post-visit` (predeterminado) | Dos CT y cuatro MR. |
| `conflicting-count` | Tres y cuatro MR como candidatos distintos; dominio debe resolver el conflicto. |
| `new-hospital` | Hospital pequeño con un CT; no inventa equipos adicionales ni un perfil confirmado. |
| `no-findings` | Sin hallazgos: lista vacía, no un conteo de cero equipos. |

El audio siempre devuelve la transcripción fija del escenario seleccionado. La extracción requiere esa transcripción exacta, permitiendo espacios al inicio o al final. Un texto diferente produce `UNSUPPORTED_INPUT`; el mock no pretende comprender texto libre. Las preguntas conservan el orden y los IDs de los huecos suministrados. Una lista de huecos vacía produce una lista de preguntas vacía.

```ts
const unavailable = new MockInferenceEngine({
  failures: { transcribe: 'UNAVAILABLE' },
});

const slowExtraction = new MockInferenceEngine({
  latencyMs: 1000,
  failures: { extractObservations: 'TIMEOUT' },
});
```

Los fallos configurados se repiten en cada llamada de esa instancia. `latencyMs` vale cero por defecto y admite hasta 30000. `TIMEOUT` simula un error tras esa demora; no implementa cancelación ni un deadline real. Las entradas inválidas se rechazan antes de la demora.

Los errores son `InferenceError` con `code`: `INVALID_INPUT`, `UNSUPPORTED_INPUT`, `UNAVAILABLE` o `TIMEOUT`. El adapter IPC deberá traducirlos a una respuesta serializable como `{ ok: false, error: { code, message } }`; no conviene depender de que Electron conserve propiedades de una excepción entre procesos.

## Validación y sustitución futura

```sh
npm run test
npm run typecheck
```

En PowerShell con scripts bloqueados, usar `npm.cmd`. Las pruebas corren en Node sin Electron, red, GPU ni modelos. Cubren escenarios, evidencia textual, conflictos, errores, aislamiento de resultados y preguntas limitadas a los huecos recibidos.

La futura implementación QVAC deberá cumplir `InferenceEngine`, devolver procedencia real y validar la salida del modelo. El mock debe seleccionarse explícitamente; nunca usarlo como fallback silencioso cuando QVAC falle. Este contrato inicial cubre STT, extracción y preguntas; OCR, RAG, TTS, clasificación de hospital y perfiles sugeridos quedan fuera de esta entrega.

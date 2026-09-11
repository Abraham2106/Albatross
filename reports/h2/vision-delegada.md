# H2 visión delegada (CaptureService + SQLite)

Fecha: 2026-09-11. Comando: `npm run vision:delegada`. Estado: **Medido**.

No copia tiempos de `reports/h1/`. Consumer aislado con `SNAP_USER_COMMON` **después** de arrancar el provider. `fallbackToLocal: false`. SDK `@qvac/sdk@0.18.2`.

## Recorrido

1. Provider QVAC en un proceso (`scripts/h1-p2p-provider.mjs --vision`).
2. `CaptureService` en el proceso consumidor: submit → upload de bytes → `process` → SQLite.
3. Motor: `QvacPlateVisionEngine` con `QVAC_VISION_DELEGATE_KEY`.

## Procedencia persistida (última corrida)

- `execution`: peer
- `model`: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M
- `peerId`: fe8a3510…
- job: needsReview
- wallMs total: 70094
- rssBytes (consumidor, al final): 98934784

## Tres solicitudes consecutivas

| # | job | execution | serial | wallMs |
| --- | --- | --- | --- | --- |
| 1 | needsReview | peer | BP-ABT-88421 | 55377 |
| 2 | needsReview | peer | BP-ABT-88421 | 7808 |
| 3 | needsReview | peer | BP-ABT-88421 | 6909 |

## Campos (última corrida)

| Campo | Esperado | Persistido |
| --- | --- | --- |
| brand | BluePeak Medical | BluePeak Medical |
| model | Aether 3T | Aether 3T |
| modality | Magnetic Resonance | Magnetic Resonance |
| serial | BP-A3T-88421 | BP-ABT-88421 |
| manufactureDate | 2017-03 | 2017-03 |

La serie leída por VisionPsy en las tres corridas fue `BP-ABT-88421` (esperado `BP-A3T-88421`), el mismo error de lectura que H1 1.4. Los wallMs de esta tabla no se copiaron de `reports/h1/`.

## Límites

- Fixture sintética, no dataset 5.4.
- `attachments: [{ path }]` en el consumer usa un archivo temporal local; esto no demuestra transferencia desde un celular.
- DHT de 0.18.2 arranca con bootstrap; offline no se midió aquí.
- H1 (foto desde teléfono) sigue abierto.

## Artefactos

- `reports/h2/vision-delegada.json`
- SQLite copiado a `reports/h2/vision-delegada.sqlite` (evidencia local; no versionar si pesa).

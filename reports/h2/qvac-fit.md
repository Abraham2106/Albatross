# Encaje QVAC (mini llmfit)

Fecha: 2026-09-11. Comando: `npm run fit`. Estado: **Terminado** en esta laptop.

## Hardware observado

| Dato | Valor |
| --- | --- |
| CPU | AMD Ryzen 5 7535HS, 12 hilos |
| RAM | 16 329 850 880 B (~15.2 GiB visibles) |
| GPU | NVIDIA GeForce RTX 2050 |
| VRAM | 4 294 967 296 B, `supported`, fuente `nvidia-smi` |

## Veredicto

| Política | Fit | Permitida |
| --- | --- | --- |
| `sequential_local` | good (VRAM 75 %) | sí |
| `hot_stt_llm` | tooTight (VRAM 125 %) | no |
| `hot_all` | tooTight | no |
| `vision_delegated` | good | sí |

Recomendación: **`vision_delegated`**. El interruptor “Mantener modelos en caliente” queda deshabilitado. Qwen 4B cabe en cola; Qwen 1.7B es opcional en Configuración.

## Artefactos

- `reports/h2/qvac-fit.json`
- Panel en `ui/cib-ui-5/cib-ui/src/screens/Configuracion.jsx`

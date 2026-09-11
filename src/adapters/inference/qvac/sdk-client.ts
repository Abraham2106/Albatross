import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { STT_FILE, activeLlm } from './model-pack';
import { llamaDedicatedGpuConfig, pinNvidiaGpu } from './prefer-nvidia';
import { pcm16ToWav } from '../../../application/audio';

type CompletionParams = Parameters<typeof import('@qvac/sdk')['completion']>[0];
type CompletionFinal = Awaited<ReturnType<typeof import('@qvac/sdk')['completion']>['final']>;
export interface CompletionTrace {
  requestId: string;
  params: CompletionParams;
  result: CompletionFinal;
}
export interface BackendTrace {
  operation: string;
  selectedBackend: string;
  selectedDevice: 'cpu' | 'gpu';
  graphicsApi?: string;
  fallback?: { requestedDevice?: 'cpu' | 'gpu'; reason: string };
}
export interface RequestRun<T> { requestId: string; final: Promise<T> }
export interface SdkClientOptions { profiler?: boolean; gpuLayers?: number }
export interface QvacClient {
  load(capability: 'stt' | 'llm', source?: string): RequestRun<string>;
  transcribe(modelId: string, pcm: Uint8Array): RequestRun<string>;
  complete(modelId: string, history: { role: string; content: string }[], schema: Record<string, unknown>): RequestRun<string>;
  cancel(requestId: string): Promise<void>;
  unload(modelId: string): Promise<void>;
  close(): Promise<void>;
}
function localWeight(file: string): string | undefined {
  const candidate = join(process.cwd(), 'models', file);
  return existsSync(candidate) ? candidate : undefined;
}
export async function createSdkClient(onProgress: (message: string) => void, onCompletion?: (trace: CompletionTrace) => void, onBackend?: (trace: BackendTrace) => void, options: SdkClientOptions = {}): Promise<QvacClient> {
  const nvidia = pinNvidiaGpu();
  if (nvidia.name) onProgress('GPU: ' + nvidia.name + (nvidia.vulkanIndex === undefined ? '' : ` · Vulkan ${nvidia.vulkanIndex}`));
  // Importing the adapter does not start QVAC; this boundary is reached only after opt-in.
  const sdk = await import('@qvac/sdk');
  if (options.profiler) sdk.profiler.enable({ mode: 'verbose', includeServerBreakdown: true });
  const unsubscribeBackend = sdk.profiler.onRecord(event => {
    const backend = event.backend;
    if (!backend) return;
    onBackend?.({ operation: event.op, selectedBackend: backend.selectedBackend, selectedDevice: backend.selectedDevice, graphicsApi: backend.graphicsApi, fallback: backend.fallback });
    onProgress(`QVAC ${event.op}: ${backend.selectedDevice.toUpperCase()} · ${backend.selectedBackend}${backend.graphicsApi ? ` · ${backend.graphicsApi}` : ''}${backend.fallback ? ` · fallback: ${backend.fallback.reason}` : ''}`);
  });
  return {
    load(capability, source) {
      const onDownload = (p: { percentage?: number }) => onProgress('Preparando modelo ' + capability + (p.percentage === undefined ? '' : ': ' + Math.round(p.percentage) + '%'));
      // Ruta local y descriptor del registro son sobrecargas distintas de loadModel:
      // un modelType condicional en un solo objeto impide resolverlas.
      const pending = capability === 'stt' ? loadStt(source ?? localWeight(STT_FILE)) : loadLlm(source ?? activeLlm().path);
      return { requestId: pending.requestId, final: pending };

      function loadStt(path?: string) {
        const modelConfig = {
          audio_format: 's16le' as const, language: 'auto', strategy: 'greedy' as const,
          no_timestamps: true,
          contextParams: { use_gpu: true, flash_attn: true },
        };
        return path
          ? sdk.loadModel({ modelSrc: path, modelType: 'whispercpp-transcription', modelConfig, onProgress: onDownload })
          : sdk.loadModel({ modelSrc: sdk.WHISPER_LARGE_V3_TURBO, modelConfig, onProgress: onDownload });
      }
      function loadLlm(path?: string) {
        const modelConfig = {
          ctx_size: 4096,
          ...(options.gpuLayers === 0 ? {} : llamaDedicatedGpuConfig()),
          ...(options.gpuLayers === undefined ? {} : { gpu_layers: options.gpuLayers }),
        };
        if (path) {
          return sdk.loadModel({ modelSrc: path, modelType: 'llamacpp-completion', modelConfig, onProgress: onDownload });
        }
        if (activeLlm().variant === '1.7b') {
          return sdk.loadModel({ modelSrc: sdk.QWEN3_1_7B_INST_Q4, modelConfig, onProgress: onDownload });
        }
        return sdk.loadModel({ modelSrc: sdk.QWEN3_4B_INST_Q4_K_M, modelConfig, onProgress: onDownload });
      }
    },
    transcribe(modelId, pcm) {
      const wavPath = join(tmpdir(), `philips-stt-${randomUUID()}.wav`);
      writeFileSync(wavPath, pcm16ToWav(pcm));
      const pending = sdk.transcribe({ modelId, audioChunk: wavPath, metadata: false });
      return {
        requestId: pending.requestId,
        final: Promise.resolve(pending).finally(() => { try { unlinkSync(wavPath); } catch { /* ignore */ } }),
      };
    },
    complete(modelId, history, schema) {
      const params = {
        modelId, history, stream: false, kvCache: false, captureThinking: true,
        generationParams: { temp: 0, predict: 4096, seed: 42 },
        responseFormat: { type: 'json_schema', json_schema: { name: 'philips', schema } },
      } satisfies CompletionParams;
      const run = sdk.completion(params);
      return { requestId: run.requestId, final: run.final.then(value => {
        onCompletion?.({ requestId: run.requestId, params, result: value });
        return value.contentText;
      }) };
    },
    cancel: requestId => sdk.cancel({ requestId }),
    unload: modelId => sdk.unloadModel({ modelId, clearStorage: false, autoClose: false }),
    close: async () => { unsubscribeBackend(); if (options.profiler) sdk.profiler.disable(); await sdk.close(); },
  };
}

import { existsSync } from 'node:fs';
import { join } from 'node:path';

type CompletionParams = Parameters<typeof import('@qvac/sdk')['completion']>[0];
export interface RequestRun<T> { requestId: string; final: Promise<T> }
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
export async function createSdkClient(onProgress: (message: string) => void): Promise<QvacClient> {
  // Importing the adapter does not start QVAC; this boundary is reached only after opt-in.
  const sdk = await import('@qvac/sdk');
  return {
    load(capability, source) {
      const onDownload = (p: { percentage?: number }) => onProgress('Preparando modelo ' + capability + (p.percentage === undefined ? '' : ': ' + Math.round(p.percentage) + '%'));
      const pending = capability === 'stt'
        ? sdk.loadModel({
          modelSrc: source ?? localWeight('ggml-large-v3-turbo-q8_0.bin') ?? sdk.WHISPER_LARGE_V3_TURBO,
          ...(source || localWeight('ggml-large-v3-turbo-q8_0.bin') ? { modelType: 'whispercpp-transcription' as const } : {}),
          modelConfig: { audio_format: 's16le', language: 'auto' }, onProgress: onDownload,
        })
        : sdk.loadModel({
          modelSrc: source ?? localWeight('Qwen3-4B-Q4_K_M.gguf') ?? sdk.QWEN3_4B_INST_Q4_K_M,
          ...(source || localWeight('Qwen3-4B-Q4_K_M.gguf') ? { modelType: 'llamacpp-completion' as const } : {}),
          modelConfig: { ctx_size: 4096 }, onProgress: onDownload,
        });
      return { requestId: pending.requestId, final: pending };
    },
    transcribe(modelId, pcm) {
      const pending = sdk.transcribe({ modelId, audioChunk: Buffer.from(pcm), metadata: false });
      return { requestId: pending.requestId, final: pending };
    },
    complete(modelId, history, schema) {
      const params = {
        modelId, history, stream: false, kvCache: false, captureThinking: true,
        generationParams: { temp: 0, predict: 4096, seed: 42 },
        responseFormat: { type: 'json_schema', json_schema: { name: 'philips', schema } },
      } satisfies CompletionParams;
      const run = sdk.completion(params);
      return { requestId: run.requestId, final: run.final.then(value => value.contentText) };
    },
    cancel: requestId => sdk.cancel({ requestId }),
    unload: modelId => sdk.unloadModel({ modelId, clearStorage: false, autoClose: false }),
    close: () => sdk.close(),
  };
}

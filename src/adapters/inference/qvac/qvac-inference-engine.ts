import { InferenceError, type InferenceEngine, type TranscriptionRequest, type ExtractionRequest, type FollowUpRequest, type OperationOptions, type InferenceResult } from '../../../application/ports/inference-engine';
import { checkCancelled, record, text, validateExtraction } from '../../../application/validation';
import { wavToPcm } from '../../../application/audio';
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA } from './schema';
import { coerceExtraction, parseModelJson } from './parse-output';
import { createSdkClient, type QvacClient, type RequestRun } from './sdk-client';

export interface QvacOptions {
  enabled?: boolean;
  sttSource?: string;
  llmSource?: string;
  timeoutMs?: number;
  loadTimeoutMs?: number;
  onProgress?: (message: string) => void;
  clientFactory?: () => Promise<QvacClient>;
}
export class QvacInferenceEngine implements InferenceEngine {
  private client?: Promise<QvacClient>;
  private models = new Map<'stt' | 'llm', string>();
  private busy = false;
  private closed = false;
  private controller?: AbortController;
  private running?: Promise<unknown>;
  constructor(private readonly options: QvacOptions = {}) {}
  enable() { this.options.enabled = true; }
  private async tracked<T>(client: QvacClient, run: RequestRun<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
    let interruption: InferenceError | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let listener: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      const interrupt = (code: 'TIMEOUT' | 'CANCELLED') => {
        if (interruption) return;
        interruption = new InferenceError(code, code === 'TIMEOUT' ? 'QVAC superó el tiempo disponible.' : 'Operación cancelada.');
        reject(interruption);
        // Stop the native request, not just the JS wait. If cancellation fails, retire this runtime.
        void client.cancel(run.requestId).catch(() => { this.closed = true; void client.close().catch(() => {}); });

      };
      listener = () => interrupt('CANCELLED');
      signal.addEventListener('abort', listener, { once: true });
      timer = setTimeout(() => interrupt('TIMEOUT'), timeoutMs);
      if (signal.aborted) listener();
    });
    try { return await Promise.race([run.final, interrupted]); }
    catch (failure) {
      const error = interruption ?? failure;
      if (error instanceof InferenceError && (error.code === 'TIMEOUT' || error.code === 'CANCELLED')) {
        let grace: ReturnType<typeof setTimeout> | undefined;
        const drained = await Promise.race([
          run.final.then(() => true, () => true),
          new Promise<false>(resolve => { grace = setTimeout(() => resolve(false), 1500); }),
        ]);
        if (grace) clearTimeout(grace);
        if (!drained) { this.closed = true; await client.close().catch(() => {}); }
      }
      throw error;
    } finally { if (timer) clearTimeout(timer); signal.removeEventListener('abort', listener); }
  }
  private async model(client: QvacClient, capability: 'stt' | 'llm', signal: AbortSignal) {
    const known = this.models.get(capability);
    if (known) return known;
    this.options.onProgress?.('Cargando modelo ' + capability + '…');
    const run = client.load(capability, capability === 'stt' ? this.options.sttSource : this.options.llmSource);
    // Even a cancelled load may finish in a race; release that late model.
    const id = await this.tracked(client, run, signal, this.options.loadTimeoutMs ?? 600000).catch(error => {
      void run.final.then(id => client.unload(id), () => {}).catch(() => {});
      throw error;
    });
    this.models.set(capability, id);
    return id;
  }
  private execute<T>(capability: 'stt' | 'llm', options: OperationOptions, work: (client: QvacClient, id: string, signal: AbortSignal) => Promise<T>): Promise<InferenceResult<T>> {
    if (!this.options.enabled) return Promise.reject(new InferenceError('UNAVAILABLE', 'Modelos deshabilitados. La ejecución real se habilitará durante la validación conjunta.'));
    if (this.closed || this.busy) return Promise.reject(new InferenceError('UNAVAILABLE', this.closed ? 'Reinicia la aplicación para reabrir QVAC.' : 'Hay otra operación en curso.'));
    checkCancelled(options.signal);
    this.busy = true;
    const controller = new AbortController();
    this.controller = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const pending = (async () => {
      try {
        this.client ??= (this.options.clientFactory ?? (() => createSdkClient(m => this.options.onProgress?.(m))))().catch(error => { this.client = undefined; throw error; });
        const client = await this.client;
        checkCancelled(controller.signal);
        const id = await this.model(client, capability, controller.signal);
        checkCancelled(controller.signal);
        const data = await work(client, id, controller.signal);
        checkCancelled(controller.signal);
        return { data, provenance: { execution: 'local' as const, model: capability === 'stt' ? this.options.sttSource ?? 'WHISPER_LARGE_V3_TURBO' : this.options.llmSource ?? 'QWEN3_4B_INST_Q4_K_M' } };
      } catch (error) {
        if (error instanceof InferenceError) throw error;
        throw new InferenceError('UNAVAILABLE', 'QVAC no pudo completar la operación. Comprueba modelos, memoria y runtime.');
      } finally {
        this.busy = false; this.controller = undefined; options.signal?.removeEventListener('abort', abort);
      }
    })();
    this.running = pending;
    return pending;
  }
  transcribe(input: TranscriptionRequest, options: OperationOptions = {}) {
    if (input?.mimeType !== 'audio/wav' && input?.mimeType !== 'audio/x-wav') return Promise.reject(new InferenceError('INVALID_INPUT', 'Usa audio WAV PCM16 mono de 16 kHz.'));
    let pcm: Uint8Array;
    try { pcm = wavToPcm(input.audio); } catch (error) { return Promise.reject(error); }
    return this.execute('stt', options, async (client, id, signal) => {
      this.options.onProgress?.('Transcribiendo audio…');
      const value = await this.tracked(client, client.transcribe(id, pcm), signal, this.options.timeoutMs ?? 120000);
      if (!value.trim()) throw new InferenceError('UNSUPPORTED_INPUT', 'No se detectó voz. Puedes escribir la transcripción.');
      return { text: text(value, 'Transcripción', 12000) };
    });
  }
  extractObservations(input: ExtractionRequest, options: OperationOptions = {}) {
    const hospitalId = text(input?.hospitalId, 'Hospital');
    const transcript = text(input?.transcript, 'Transcripción', 12000);
    return this.execute('llm', options, async (client, id, signal) => {
      this.options.onProgress?.('Extrayendo observaciones…');
      const raw = await this.tracked(client, client.complete(id, [{ role: 'system', content: EXTRACTION_PROMPT }, { role: 'user', content: transcript }], EXTRACTION_SCHEMA), signal, this.options.timeoutMs ?? 120000);
      try { return validateExtraction(coerceExtraction(parseModelJson(raw), hospitalId, transcript), hospitalId, transcript); }
      catch { throw new InferenceError('INVALID_OUTPUT', 'La extracción no cumple el esquema o su evidencia. Revisa el texto e inténtalo nuevamente.'); }
    });
  }
  generateFollowUps(input: FollowUpRequest, options: OperationOptions = {}) {
    text(input?.hospitalId, 'Hospital');
    if (!Array.isArray(input?.gaps) || input.gaps.length > 20) throw new InferenceError('INVALID_INPUT', 'Lista de preguntas inválida.');
    const gaps = input.gaps.map(g => ({ id: text(g.id, 'ID'), description: text(g.description, 'Pregunta', 1000) }));
    if (new Set(gaps.map(g => g.id)).size !== gaps.length) throw new InferenceError('INVALID_INPUT', 'IDs duplicados.');
    return this.execute('llm', options, async (client, id, signal) => {
      if (!gaps.length) return [];
      const schema = { type: 'object', additionalProperties: false, required: ['questions'], properties: { questions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['gapId', 'text'], properties: { gapId: { type: 'string' }, text: { type: 'string' } } } } } };
      const raw = await this.tracked(client, client.complete(id, [
        { role: 'system', content: 'Redacta en español las preguntas suministradas. Conserva exactamente IDs, orden y significado. No añadas hechos. Devuelve JSON con questions.' },
        { role: 'user', content: JSON.stringify(gaps) },
      ], schema), signal, this.options.timeoutMs ?? 120000);
      try {
        const result = record(JSON.parse(raw));
        if (!Array.isArray(result.questions) || result.questions.length !== gaps.length) throw new Error();
        return result.questions.map((q, i) => { const r = record(q); if (r.gapId !== gaps[i].id) throw new Error(); return { gapId: gaps[i].id, text: text(r.text, 'Pregunta', 1000) }; });
      } catch { throw new InferenceError('INVALID_OUTPUT', 'QVAC cambió las preguntas pendientes. Se conservan las preguntas del dominio.'); }
    });
  }
  async close() {
    this.closed = true; this.controller?.abort();
    await this.running?.catch(() => {});
    if (!this.client) return;
    const client = await this.client.catch(() => undefined);
    if (!client) return;
    try { for (const id of this.models.values()) await client.unload(id).catch(() => {}); }
    finally { this.models.clear(); await client.close(); }
  }
}

import { toCliente, toFicha, toGeo, toObservacion, toResumen, type CibRespuesta } from './cib';
import { invalid, record, text } from './validation';
import type { OperationOptions, TranscriptionRequest } from './ports/inference-engine';
import type { VisitService } from './visits';
import type { WhisperSpeedResult } from './whisper-metrics';

export class CibService {
  constructor(private readonly visits: VisitService, private readonly now = () => new Date().toISOString()) {}
  clientes() { return this.visits.list().sites.map(site => toCliente(site, this.now())); }
  cliente(id: string) { return toFicha(this.visits.getProfile(id).site, this.now()); }
  geo() { return toGeo(this.visits.list().sites, this.now()); }
  cargarEjemplo() { return { cargados: this.visits.loadSample() }; }
  resumen(pais?: string) { return toResumen(this.visits.list().sites, this.now(), pais); }
  async extraer(input: { texto?: string; audio?: TranscriptionRequest }, options: OperationOptions = {}) {
    return toObservacion(await this.visits.processFree({ transcript: input.texto, audio: input.audio }, options));
  }
  transcribir(audio: TranscriptionRequest, options: OperationOptions = {}): Promise<WhisperSpeedResult> {
    return this.visits.transcribeAudio(audio, options);
  }
  confirmar(value: unknown) {
    const input = record(value);
    const respuestas = record(input.respuestas) as Record<string, CibRespuesta>;
    for (const answer of Object.values(respuestas)) {
      if (answer !== 'si' && answer !== 'no' && answer !== 'nose') invalid('Respuesta de confirmación inválida.');
    }
    const profile = this.visits.confirmCards(text(input.observacionId, 'Observación'), respuestas);
    return { ok: true, guardados: Object.values(respuestas).filter(answer => answer !== 'no').length, clienteId: profile.site.id };
  }
}

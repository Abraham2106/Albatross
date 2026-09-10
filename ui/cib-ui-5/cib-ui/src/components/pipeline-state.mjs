// Pure phase mapping shared by both recorders; progress only applies while processing.
export function pipelineState({ recording = false, captured = false, processing = false, progress = '', review = false, warming = false, sttReady = false, showLlm = false } = {}) {
  const extract = processing && /extrayendo|cargando modelo llm/i.test(progress);
  const transcribe = processing && /transcribiendo/i.test(progress);
  const loadingStt = warming || (processing && !extract && /cargando.*(stt|whisper)/i.test(progress));
  const phase = review ? 'review' : recording ? 'record' : extract ? 'extract' : transcribe ? 'transcribe' : processing ? 'prepare' : captured ? 'captured' : 'idle';
  const stages = [
    { name: 'Mic', state: review ? 'done' : recording ? 'on' : captured ? 'done' : 'idle', label: captured || review ? 'capturado' : 'en espera' },
    { name: '16 kHz PCM', state: review || captured ? 'done' : recording ? 'on' : 'idle', label: recording ? 'capturando' : captured || review ? 'listo' : 'en espera' },
    { name: 'Whisper', state: review || extract ? 'done' : transcribe ? 'on' : loadingStt ? 'wait' : sttReady ? 'done' : 'idle', label: review || extract ? 'transcrito' : transcribe ? 'transcribiendo' : loadingStt ? 'cargando…' : sttReady ? 'listo' : 'en espera' },
  ];
  if (showLlm) stages.push({ name: 'Qwen', state: review ? 'done' : extract ? 'on' : 'idle', label: review ? 'extraído' : extract ? (/cargando/i.test(progress) ? 'cargando…' : 'extrayendo') : 'en espera' });
  const status = review ? 'Listo para revisar.' : recording ? (loadingStt ? 'Grabando · Whisper cargando…' : sttReady ? 'Grabando · Whisper listo.' : 'Grabando el dictado.') : extract ? 'Qwen · preparando la observación.' : transcribe ? 'Whisper · transcribiendo el dictado.' : loadingStt ? 'Whisper cargando…' : processing ? 'Preparando el dictado…' : captured ? 'Dictado capturado. Podés procesar.' : 'Grabá o escribí una observación.';
  return { stages, status, phase };
}

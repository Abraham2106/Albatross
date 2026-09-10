import { useEffect, useRef, useState } from 'react';
import { pipelineState } from './pipeline-state.mjs';
import { DEVELOPMENT_TOOLS } from '../../../../../src/ui/development-tools.ts';

function duration(ms) { return ms == null ? '—' : `${(ms / 1000).toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`; }

export default function Pipeline({
  recording = false, seconds = 0, rms = 0, inputRate = 0,
  sttReady = false, warming = false, showLlm = false,
  captured = false, processing = false, progress = '', review = false, timings,
}) {
  const clock = useRef({ transcription: null, extraction: null });
  const [elapsed, setElapsed] = useState({ transcription: null, extraction: null });
  const active = DEVELOPMENT_TOOLS && processing && /transcribiendo/i.test(progress) ? 'transcription'
    : DEVELOPMENT_TOOLS && processing && /extrayendo/i.test(progress) ? 'extraction' : null;
  useEffect(() => {
    if (!DEVELOPMENT_TOOLS) return;
    if (processing || recording || (!captured && !review)) {
      clock.current = { transcription: null, extraction: null };
      setElapsed({ ...clock.current });
    }
  }, [processing, recording, captured, review]);
  useEffect(() => {
    if (!active) return undefined;
    const started = performance.now();
    const tick = () => {
      clock.current[active] = performance.now() - started;
      setElapsed({ ...clock.current });
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => { clearInterval(interval); tick(); };
  }, [active]);
  const { stages, status, phase } = pipelineState({ recording, captured, processing, progress, review, warming, sttReady, showLlm });
  const level = Number.isFinite(rms) ? Math.min(1, Math.max(0.06, rms * 5)) : 0.06;
  return (
    <section className="pipeline" data-phase={phase} aria-label="Etapas del dictado">
      <ol className="pipeline-etapas" style={{ '--pipeline-count': stages.length }}>
        {stages.map((stage, i) => (
          <li key={stage.name} data-state={stage.state}>
            <span className="pipeline-nombre">{stage.name}</span>
            <b>{i === 0 && recording ? `${seconds} s` : stage.label}</b>
            {i === 0 && <span className="pipeline-metro" aria-hidden="true">
              <i style={{ transform: `scaleY(${recording ? level : 0.06})` }} />
            </span>}
            {i === 1 && recording && inputRate > 0 && <small>{Math.round(inputRate / 1000)} → 16 kHz</small>}
          </li>
        ))}
      </ol>
      {DEVELOPMENT_TOOLS && <dl className="pipeline-tiempos" aria-label="Tiempos de procesamiento">
        <div><dt>Transcripción</dt><dd data-testid="pipeline-transcription-time">{timings?.transcription ? duration(timings.transcription.inferMs) : duration(elapsed.transcription)}</dd></div>
        {showLlm && <div><dt>Procesamiento</dt><dd data-testid="pipeline-extraction-time">{timings?.extraction ? duration(timings.extraction.inferMs) : duration(elapsed.extraction)}</dd></div>}
      </dl>}
      {DEVELOPMENT_TOOLS && timings && <p className="pipeline-cargas">Carga de Whisper: {duration(timings.transcription?.loadMs)}{showLlm && ` · Carga de Qwen: ${duration(timings.extraction?.loadMs)}`}</p>}
      <p className="pipeline-texto" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    </section>
  );
}

import { pipelineState } from './pipeline-state.mjs';

export default function Pipeline({
  recording = false, seconds = 0, rms = 0, inputRate = 0,
  sttReady = false, warming = false, showLlm = false,
  captured = false, processing = false, progress = '', review = false,
}) {
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
      <p className="pipeline-texto" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    </section>
  );
}

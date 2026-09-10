import { useEffect, useRef, useState } from 'react';
import {
  transcribir, abrirWav, descargarModelos, estadoModelos, onProgreso, cancelar, hayEscritorio,
  precargarModelos,
} from '../api/client.js';
import { Micro, Reloj, SinRed, Copia } from '../components/Iconos.jsx';
import Pipeline from '../components/Pipeline.jsx';
import { startRecording } from '../../../../../src/ui/recorder.ts';

function percentFrom(message) {
  const match = String(message ?? '').match(/(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

function esNum(n, digits = 2) {
  return n.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${esNum(ms / 1000)} s`;
}

function fmtX(x) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${esNum(x)}×`;
}

function fmtRtf(rtf) {
  if (rtf == null || !Number.isFinite(rtf)) return '—';
  return esNum(rtf, 3);
}

function dispositivo(run) {
  if (!run?.device) return '—';
  const api = run.graphicsApi ? ` · ${run.graphicsApi}` : '';
  const name = run.backend ? ` · ${run.backend}` : '';
  return `${run.device.toUpperCase()}${name}${api}`;
}

function resumenHistorial(runs) {
  const warm = runs.filter((r) => !r.coldStart && r.inferMs > 0);
  if (!warm.length) return null;
  const avg = warm.reduce((s, r) => s + r.inferMs, 0) / warm.length;
  const avgX = warm.reduce((s, r) => s + (r.xRealtime || 0), 0) / warm.length;
  return { n: warm.length, avg, avgX };
}

export default function WhisperVelocidad() {
  const [audio, setAudio] = useState(null);
  const [fuente, setFuente] = useState('');
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [repeticiones, setRepeticiones] = useState(1);
  const [midiendo, setMidiendo] = useState(false);
  const [paso, setPaso] = useState('');
  const [error, setError] = useState('');
  const [pack, setPack] = useState(undefined);
  const [bajando, setBajando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [pct, setPct] = useState(0);
  const [historial, setHistorial] = useState([]);
  const [copiado, setCopiado] = useState(false);
  const recorder = useRef(null);
  const loop = useRef({ stop: false });
  const atajos = useRef({});
  const [warming, setWarming] = useState(false);
  const [rms, setRms] = useState(0);
  const [inputRate, setInputRate] = useState(0);
  const [pipelineProgress, setPipelineProgress] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    document.title = 'Velocidad de Whisper';
  }, []);

  useEffect(() => {
    if (!hayEscritorio()) {
      setPack(null);
      return undefined;
    }
    let alive = true;
    estadoModelos()
      .then((value) => { if (alive) setPack(value); })
      .catch(() => { if (alive) setPack(null); });
    const off = onProgreso(({ message }) => {
      setProgreso(message);
      if (/transcribiendo|cargando modelo stt/i.test(message)) setPipelineProgress(message);
      const next = percentFrom(message);
      if (next !== null) setPct(next);
    });
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    if (!hayEscritorio() || !pack?.ready) return undefined;
    if (pack.loaded?.stt) return undefined;
    let alive = true;
    setWarming(true);
    (async () => {
      while (alive) {
        try {
          const loaded = await precargarModelos(['stt']);
          if (!alive) return;
          if (loaded) setPack((prev) => (prev ? { ...prev, loaded } : prev));
          if (loaded?.stt) return;
        } catch {
          const next = await estadoModelos().catch(() => null);
          if (next && alive) setPack(next);
          if (next?.loaded?.stt) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    })().finally(() => { if (alive) setWarming(false); });
    return () => { alive = false; };
  }, [pack?.ready, pack?.loaded?.stt]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        atajos.current.escape?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        atajos.current.medir?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function bajarModelos() {
    setError('');
    setBajando(true);
    setProgreso('Preparando descarga…');
    setPct(0);
    try {
      const next = await descargarModelos();
      setPack(next);
      setProgreso('Cargando Whisper en memoria…');
      const loaded = await precargarModelos(['stt']).catch(() => next?.loaded);
      if (loaded) setPack((prev) => prev ? { ...prev, loaded } : prev);
      setProgreso('Whisper en memoria · listo');
      setPct(100);
    } catch (e) {
      setError(e.message === 'SIN_BACKEND' ? 'La descarga de modelos solo está en Electron.' : 'No se pudieron descargar los modelos. ' + e.message);
    } finally {
      setBajando(false);
    }
  }

  async function soltarMic() {
    const current = recorder.current;
    recorder.current = null;
    setGrabando(false);
    setRms(0);
    if (!current) return;
    try {
      const wav = await current.stop();
      setAudio(wav);
      setFuente('Micrófono');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo terminar la grabación.');
    }
  }

  async function pulsarMic() {
    setCompleted(false);
    setError('');
    setSegundos(0);
    setAudio(null);
    setFuente('');
    setRms(0);
    setInputRate(0);
    setGrabando(true);
    try {
      recorder.current = await startRecording(() => { void soltarMic(); }, setSegundos, (frame) => {
        setRms(frame.rms);
        setInputRate(frame.inputRate);
      });
    } catch {
      setGrabando(false);
      setError('No se pudo abrir el micrófono. Abrí un WAV PCM 16 kHz.');
    }
  }

  async function descartarAudio() {
    const current = recorder.current;
    recorder.current = null;
    setGrabando(false);
    setAudio(null);
    setFuente('');
    setSegundos(0);
    setRms(0);
    if (current) await current.cancel().catch(() => {});
  }

  async function elegirWav() {
    setCompleted(false);
    setError('');
    try {
      const wav = await abrirWav();
      if (!wav) return;
      setAudio(wav.audio);
      setFuente(wav.name);
      setSegundos(Math.max(1, Math.round(wav.audioMs / 1000)));
    } catch (e) {
      setError(e.message === 'SIN_BACKEND'
        ? 'Abrir un WAV solo está en Electron.'
        : e.message);
    }
  }

  function detener() {
    loop.current.stop = true;
    void cancelar();
  }

  async function medir() {
    if (!audio) {
      setError('Grabá o abrí un WAV primero.');
      return;
    }
    setError('');
    setMidiendo(true);
    setPipelineProgress('');
    loop.current.stop = false;
    const total = Math.min(10, Math.max(1, Number(repeticiones) || 1));
    try {
      for (let i = 1; i <= total; i += 1) {
        if (loop.current.stop) break;
        setPaso(`Medición ${i} de ${total}`);
        const result = await transcribir({ audio, mimeType: 'audio/wav' });
        setCompleted(true);
        setHistorial((prev) => [{ ...result, n: prev.length + 1, at: new Date().toISOString(), fuente }, ...prev]);
      }
    } catch (e) {
      if (!loop.current.stop) {
        setError(e.message === 'SIN_BACKEND'
          ? 'Esta ventana mide Whisper en el escritorio. Abrila desde Electron (Herramientas › Velocidad de Whisper).'
          : e.message);
      }
    } finally {
      setMidiendo(false);
      setPaso('');
    }
  }

  atajos.current = {
    escape: () => {
      if (grabando) void descartarAudio();
      else if (midiendo) detener();
    },
    medir: () => {
      if (audio && !midiendo && !grabando) void medir();
    },
  };

  async function copiar() {
    if (!historial.length) return;
    const header = ['n', 'fuente', 'audio_ms', 'carga_ms', 'infer_ms', 'rtf', 'x_tiempo_real', 'dispositivo', 'arranque', 'palabras'].join('\t');
    const rows = [...historial].reverse().map((r) => [
      r.n, r.fuente || '', Math.round(r.audioMs), Math.round(r.loadMs), Math.round(r.inferMs),
      r.rtf == null ? '' : r.rtf.toFixed(4), r.xRealtime == null ? '' : r.xRealtime.toFixed(4),
      dispositivo(r), r.coldStart ? 'frio' : 'caliente', r.words,
    ].join('\t'));
    await navigator.clipboard.writeText([header, ...rows].join('\n'));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1200);
  }

  const ultimo = historial[0];
  const resumen = resumenHistorial(historial);
  const escritorio = hayEscritorio();
  let estado = 'Solo en Electron';
  if (grabando) estado = `Grabando · ${segundos} s`;
  else if (midiendo) estado = paso || progreso || 'Transcribiendo…';
  else if (bajando) estado = progreso || 'Descargando modelos…';
  else if (warming) estado = progreso || 'Cargando Whisper en memoria…';
  else if (pack?.loaded?.stt) estado = 'Whisper en memoria · listo';
  else if (pack?.ready) estado = 'Whisper local · precargando';
  else if (pack) estado = 'Faltan modelos';
  else if (escritorio) estado = 'Sin conexión · en el dispositivo';

  return (
    <div className="app app-herramienta">
      <div className="columna">
        <main className="workspace" id="principal">
          <div className="vista vista-on">
            <div className="pantalla">
              <div className="top">
                <h1 className="titulo">Velocidad de Whisper</h1>
                <p className="offline"><SinRed /> Solo transcripción local · no extrae equipos</p>
              </div>

              <div className="cuerpo captura-cuerpo whisper-cuerpo">
                <div className="whisper-toolbar" role="toolbar" aria-label="Medición">
                  <div className="grabadora-botones">
                    {!grabando && (
                      <button type="button" className="btn" data-testid="whisper-mic" onClick={() => { void pulsarMic(); }} disabled={midiendo || warming || (pack && !pack.ready)}>
                        <Micro /> {audio ? 'Grabar de nuevo' : warming ? 'Cargando Whisper…' : 'Grabar'}
                      </button>
                    )}
                    {grabando && (
                      <button type="button" className="btn" data-testid="whisper-mic" onClick={() => { void soltarMic(); }}>
                        Detener
                      </button>
                    )}
                    <button type="button" className="btn btn-sec" onClick={() => { void elegirWav(); }} disabled={grabando || midiendo}>
                      Abrir WAV
                    </button>
                    {(grabando || audio) && (
                      <button type="button" className="btn btn-sec" onClick={() => { void descartarAudio(); }} disabled={midiendo}>
                        Descartar
                      </button>
                    )}
                  </div>

                  <label className="whisper-reps">
                    <span>Repeticiones</span>
                    <select
                      value={repeticiones}
                      disabled={midiendo || grabando}
                      onChange={(e) => setRepeticiones(Number(e.target.value))}
                    >
                      {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>

                  <div className="grabadora-botones">
                    <button
                      type="button"
                      className="btn"
                      data-testid="whisper-medir"
                      onClick={() => { void medir(); }}
                      disabled={!audio || midiendo || grabando || bajando || warming || (pack && !pack.ready)}
                    >
                      <Reloj /> {midiendo ? (paso || 'Midiendo…') : pack && !pack.ready ? 'Descargá los modelos' : 'Medir'}
                    </button>
                    {midiendo && (
                      <button type="button" className="btn btn-sec" onClick={detener}>Cancelar</button>
                    )}
                  </div>
                </div>

                <p className={'grabadora-estado' + (grabando ? ' grabando' : '')} role="status">
                  {grabando
                    ? `Grabando · ${segundos} s`
                    : audio
                      ? `Listo · ${fuente || 'audio'} · ${segundos || '?'} s · WAV PCM16 mono 16 kHz`
                      : 'Grabá un dictado o abrí un WAV para medir solo Whisper.'}
                </p>

                <Pipeline
                  recording={grabando}
                  seconds={segundos}
                  rms={rms}
                  inputRate={inputRate}
                  captured={!!audio}
                  processing={midiendo}
                  progress={pipelineProgress}
                  review={!midiendo && !!audio && completed && !grabando}
                  timings={completed && !midiendo && !grabando && ultimo ? { transcription: ultimo } : undefined}
                  sttReady={!!pack?.loaded?.stt}
                  warming={warming}
                />

                {!escritorio && (
                  <p className="aviso">Esta ventana mide Whisper en el escritorio. En Electron: Herramientas › Velocidad de Whisper, o Ctrl+Shift+W.</p>
                )}

                {pack && !pack.ready && (
                  <div className="pack-modelos">
                    <button type="button" className="btn btn-sec" onClick={bajarModelos} disabled={bajando}>
                      {bajando ? (progreso || 'Descargando modelos…') : 'Descargar modelos (~4,1 GB)'}
                    </button>
                    {bajando && (
                      <div className="barra-modelos" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                        <span style={{ width: pct + '%' }} />
                      </div>
                    )}
                  </div>
                )}

                {error && <p className="error" role="alert">{error}</p>}

                <div className="metricas whisper-metricas">
                  <div className="metrica metrica-hero">
                    <p>Vs tiempo real</p>
                    <b className={'num' + (ultimo ? ' lleno' : '')}>{ultimo ? fmtX(ultimo.xRealtime) : '—'}</b>
                    <span>{ultimo?.coldStart ? 'Incluye carga del modelo' : ultimo ? `RTF ${fmtRtf(ultimo.rtf)}` : 'Sin mediciones'}</span>
                  </div>
                  <div className="metrica">
                    <p>Inferencia</p>
                    <b className={'num' + (ultimo ? ' lleno' : '')}>{ultimo ? fmtMs(ultimo.inferMs) : '—'}</b>
                    <span>Carga {ultimo ? fmtMs(ultimo.loadMs) : '—'}</span>
                  </div>
                  <div className="metrica">
                    <p>Audio</p>
                    <b className={'num' + (ultimo ? ' lleno' : '')}>{ultimo ? fmtMs(ultimo.audioMs) : '—'}</b>
                    <span>{ultimo ? `${ultimo.words} palabras` : 'Duración del dictado'}</span>
                  </div>
                  <div className="metrica">
                    <p>Dispositivo</p>
                    <b className={'num whisper-device' + (ultimo ? ' lleno' : '')}>{ultimo?.device ? ultimo.device.toUpperCase() : '—'}</b>
                    <span>{ultimo ? dispositivo(ultimo) : 'CPU o GPU del runtime'}</span>
                  </div>
                </div>

                {resumen && (
                  <p className="fila-s whisper-resumen">
                    Promedio en caliente ({resumen.n}): {fmtMs(resumen.avg)} · {fmtX(resumen.avgX)} tiempo real.
                    La primera corrida suele incluir la carga de Whisper.
                  </p>
                )}

                <div className="whisper-paneles">
                  <section className="whisper-panel" aria-label="Transcripción">
                    <h2>Transcripción</h2>
                    {ultimo?.text ? (
                      <p className="cita-dictado">“{ultimo.text}”</p>
                    ) : (
                      <p className="vacio whisper-vacio">El texto de Whisper aparece aquí. No pasa por Qwen.</p>
                    )}
                  </section>

                  <section className="whisper-panel" aria-label="Historial de mediciones">
                    <div className="whisper-tabla-top">
                      <h2>Historial</h2>
                      <div className="grabadora-botones">
                        <button type="button" className="btn btn-sec" onClick={() => { void copiar(); }} disabled={!historial.length}>
                          <Copia /> {copiado ? 'Copiado' : 'Copiar TSV'}
                        </button>
                        <button type="button" className="btn btn-sec" onClick={() => setHistorial([])} disabled={!historial.length || midiendo}>
                          Vaciar
                        </button>
                      </div>
                    </div>
                    {historial.length === 0 ? (
                      <p className="vacio whisper-vacio">Todavía no hay corridas. Medí el mismo audio varias veces para separar carga e inferencia.</p>
                    ) : (
                      <div className="whisper-tabla">
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Audio</th>
                              <th>Inferencia</th>
                              <th>Velocidad</th>
                              <th>Dispositivo</th>
                              <th>Arranque</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historial.map((r) => (
                              <tr key={r.n} data-sel={r === ultimo ? 'true' : undefined}>
                                <td className="num">{r.n}</td>
                                <td className="num">{fmtMs(r.audioMs)}</td>
                                <td className="num">{fmtMs(r.inferMs)}</td>
                                <td className="num">{fmtX(r.xRealtime)}</td>
                                <td>{r.device ? r.device.toUpperCase() : '—'}</td>
                                <td>{r.coldStart ? 'Frío' : 'Caliente'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer className="estado-barra">
          <span role="status">{estado}</span>
        </footer>
      </div>
    </div>
  );
}

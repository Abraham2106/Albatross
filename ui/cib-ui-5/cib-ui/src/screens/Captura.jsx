import { useEffect, useRef, useState } from 'react';
import { extraer, confirmar, descargarModelos, estadoModelos, onProgreso, cancelar, hayEscritorio, precargarModelos } from '../api/client.js';
import Pipeline from '../components/Pipeline.jsx';
import { Micro, SinRed, Copia } from '../components/Iconos.jsx';
import { startRecording } from '../../../../../src/ui/recorder.ts';

function percentFrom(message) {
  const match = String(message ?? '').match(/(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

export default function Captura({ onListo, onEstado }) {
  const [texto, setTexto] = useState('');
  const [audio, setAudio] = useState(null);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [pack, setPack] = useState(undefined);
  const [bajando, setBajando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [pct, setPct] = useState(0);
  const recorder = useRef(null);
  const startedAt = useRef(0);
  const starting = useRef(false);
  const [abriendo, setAbriendo] = useState(false);
  const [warming, setWarming] = useState(false);
  const [rms, setRms] = useState(0);
  const [inputRate, setInputRate] = useState(0);
  const [pipelineProgress, setPipelineProgress] = useState('');
  const warmPromise = useRef(null);
  const processingCancelled = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      processingCancelled.current = true;
      void recorder.current?.cancel();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    estadoModelos()
      .then((value) => { if (alive) setPack(value); })
      .catch(() => { if (alive) setPack(null); });
    const off = onProgreso(({ message }) => {
      setProgreso(message);
      if (/transcribiendo|extrayendo|cargando modelo (stt|llm)/i.test(message)) setPipelineProgress(message);
      onEstado?.(message);
      const next = percentFrom(message);
      if (next !== null) setPct(next);
    });
    return () => { alive = false; off(); };
  }, [onEstado]);

  useEffect(() => {
    if (bajando) onEstado?.(progreso || 'Descargando modelos…');
    else if (cargando) onEstado?.(progreso || 'Procesando en el dispositivo…');
    else if (pack?.ready) onEstado?.('Modelos en disco. Se cargan al procesar.');
    else if (pack && !pack.ready) onEstado?.('Faltan modelos · descargalos en Capturar');
    else onEstado?.('Sin conexión · en el dispositivo');
  }, [bajando, cargando, pack, progreso, onEstado]);

  useEffect(() => {
    if (!grabando) return;
    const tick = () => setSegundos(Math.floor((Date.now() - startedAt.current) / 1000));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [grabando]);

  async function bajarModelos() {
    setError('');
    setBajando(true);
    setProgreso('Preparando descarga…');
    setPct(0);
    try {
      const next = await descargarModelos();
      setPack(next);
      setProgreso('Modelos listos · se cargan al procesar');
      setPct(100);
    } catch (e) {
      setError(e.message === 'SIN_BACKEND' ? 'La descarga de modelos solo está en Electron.' : 'No se pudieron descargar los modelos. ' + e.message);
    } finally {
      setBajando(false);
    }
  }

  async function procesar() {
    if (!texto.trim() && !audio) {
      setError('Escribí o dictá la observación primero');
      return;
    }
    setError('');
    setCargando(true);
    processingCancelled.current = false;
    setPipelineProgress('');
    try {
      await warmPromise.current;
      if (processingCancelled.current || !mounted.current) return;
      setResultado(await extraer(texto, audio ? { audio, mimeType: 'audio/wav' } : undefined));
      setRespuestas({});
    } catch (e) {
      setError(e.message === 'SIN_BACKEND' ? 'No se pudo procesar en el dispositivo.' : 'No se pudo procesar. ' + e.message);
    } finally {
      setCargando(false);
      void estadoModelos().then(value => { if (mounted.current) setPack(value); }).catch(() => {});
    }
  }

  async function soltarMic() {
    const current = recorder.current;
    recorder.current = null;
    setGrabando(false);
    setRms(0);
    if (startedAt.current) setSegundos(Math.floor((Date.now() - startedAt.current) / 1000));
    if (!current) return;
    try {
      const wav = await current.stop();
      setAudio(wav);
      setTexto('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo terminar la grabación.');
    }
  }

  async function pulsarMic() {
    if (starting.current || grabando) return;
    starting.current = true;
    setError('');
    setAbriendo(true);
    if (recorder.current) await recorder.current.cancel().catch(() => {});
    recorder.current = null;
    setAudio(null);
    setSegundos(0);
    setRms(0);
    setInputRate(0);
    setPipelineProgress('');
    try {
      const opening = startRecording(() => { void soltarMic(); }, setSegundos, frame => {
        setRms(frame.rms);
        setInputRate(frame.inputRate);
      });
      if (hayEscritorio() && pack?.ready && !warmPromise.current && (!pack.loaded?.stt || pack.loaded?.llm)) {
        setWarming(true);
        warmPromise.current = precargarModelos(['stt'])
          .then(loaded => { if (mounted.current && loaded) setPack(prev => ({ ...prev, loaded })); })
          .catch(e => { if (mounted.current) setError('No se pudo preparar Whisper. Procesar reintentará. ' + e.message); })
          .finally(() => { warmPromise.current = null; if (mounted.current) setWarming(false); });
      }
      const opened = await opening;
      if (!mounted.current) { await opened.cancel(); return; }
      recorder.current = opened;
      startedAt.current = Date.now();
      setGrabando(true);
    } catch {
      setGrabando(false);
      setError('No se pudo abrir el micrófono. Escribí el dictado.');
    } finally {
      starting.current = false;
      setAbriendo(false);
    }
  }

  async function descartarAudio() {
    const current = recorder.current;
    recorder.current = null;
    setGrabando(false);
    setAudio(null);
    setSegundos(0);
    setRms(0);
    startedAt.current = 0;
    if (current) await current.cancel().catch(() => {});
  }

  async function guardar() {
    await confirmar(resultado.observacionId, respuestas);
    setGuardado(true);
    setTexto('');
    setAudio(null);
    setTimeout(() => {
      setResultado(null);
      setGuardado(false);
      onListo?.();
    }, 900);
  }

  const faltan = resultado && resultado.items.some((i) => !respuestas[i.id]);

  return (
    <div className="pantalla">
      <div className="top">
        <h1 className="titulo">Nueva observación</h1>
        <p className="offline"><SinRed /> Sin conexión · procesando en el dispositivo</p>
      </div>

      <div className="cuerpo captura-cuerpo">
        <Pipeline recording={grabando} seconds={segundos} rms={rms} inputRate={inputRate}
          sttReady={!!pack?.loaded?.stt} warming={warming} showLlm
          captured={!!audio} processing={cargando} progress={pipelineProgress} review={!!resultado} />
        {!resultado && (
          <div className="captura-entrada">
            <div className="captura-trabajo">
              <div className="grabadora" role="group" aria-label="Grabadora">
                <p className={'grabadora-estado' + (grabando ? ' grabando' : '')} role="status">
                  {abriendo
                    ? 'Abriendo micrófono…'
                    : grabando
                      ? `Grabando · ${segundos} s`
                      : audio
                        ? `Dictado listo · ${segundos} s`
                        : 'Sin grabación'}
                </p>
                <div className="grabadora-botones">
                  {!grabando && (
                    <button
                      type="button"
                      className="btn"
                      data-testid="cib-mic"
                      disabled={abriendo || cargando || (pack && !pack.ready)}
                      onClick={() => { void pulsarMic(); }}
                    >
                      <Micro /> {audio ? 'Grabar de nuevo' : 'Grabar'}
                    </button>
                  )}
                  {grabando && (
                    <button type="button" className="btn" data-testid="cib-mic" onClick={() => { void soltarMic(); }}>
                      Detener
                    </button>
                  )}
                  {(grabando || audio) && (
                    <button type="button" className="btn btn-sec" onClick={() => { void descartarAudio(); }}>
                      Descartar
                    </button>
                  )}
                </div>
              </div>

              <label className="campo campo-lleno">
                <span>O escribí el dictado</span>
                <textarea
                  data-testid="cib-texto"
                  value={texto}
                  disabled={!!audio}
                  onChange={(e) => { setTexto(e.target.value); if (error) setError(''); }}
                  placeholder="Estuve en Hospital Calderón Guardia, vi dos tomógrafos…"
                />
              </label>
              {audio && <p className="fila-s">Audio capturado. Procesalo o grabá de nuevo.</p>}
              {error && <p className="error" role="alert">{error}</p>}

              <div className="acciones">
                <button type="button" data-testid="cib-procesar" className="btn" onClick={procesar} disabled={cargando || bajando || grabando || (pack && !pack.ready)}>
                  {cargando ? 'Procesando en el dispositivo' : pack && !pack.ready ? 'Descargá los modelos para procesar' : 'Procesar'}
                </button>
                {cargando && (
                  <button type="button" className="btn btn-sec" onClick={() => { processingCancelled.current = true; void cancelar(); }}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>

            <aside className="captura-guia">
              {pack && (
                <div className="pack-modelos">
                  {pack.ready ? (
                    <p className="fila-s">Al grabar se carga Whisper. Qwen entra al procesar, no juntos.</p>
                  ) : (
                    <>
                      <button type="button" data-testid="cib-modelos" className="btn btn-sec" onClick={bajarModelos} disabled={bajando}>
                        {bajando ? (progreso || 'Descargando modelos…') : 'Descargar modelos (~4,1 GB)'}
                      </button>
                      {bajando && (
                        <div className="barra-modelos" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                          <span style={{ width: pct + '%' }} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <h2>Qué conviene decir</h2>
              <p className="guia-intro">El extractor solo guarda lo que nombrás. Si no hay marca o modelo, decí que no los viste; si no los mencionás, aparece Unknown.</p>
              <ul className="guia-lista">
                <li><b>Hospital y ciudad</b> — nombre completo, no solo “el Calderón”.</li>
                <li><b>Modalidad y cantidad</b> — dos CT, un MR, un ultrasonido.</li>
                <li><b>Marca y modelo</b> — si los viste; si no, “no sé la marca”.</li>
                <li><b>Edad o año</b> — “unos ocho años” o “instalado en 2018”.</li>
              </ul>
              <h2>Ejemplo</h2>
              <p className="cita-dictado">Estuve en Hospital Calderón Guardia, San José. Vi dos tomógrafos CT marca NovaMed modelo NM-CT 320 de unos ocho años, y un resonador MR marca Aurelia Health modelo AH-MR 650.</p>
            </aside>
          </div>
        )}

        {resultado && (
          <div className="captura-revision">
            <aside className="captura-fuente">
              <h2>Dictado</h2>
              <p className="cita-dictado">“{resultado.textoOriginal}”</p>
              {resultado.conflictos.map((c, i) => (
                <div key={i} className="aviso">
                  <Copia style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 5 }} />
                  {c.mensaje}
                </div>
              ))}
            </aside>
            <div className="captura-tarjetas">
              <h2>Confirmá lo que entendí</h2>
              {resultado.items.map((item) => (
                <div key={item.id} className="tarjeta">
                  <p>{item.resumen}</p>
                  <div className="opciones" role="group" aria-label={item.resumen}>
                    {['si', 'no', 'nose'].map((op) => (
                      <button
                        key={op}
                        type="button"
                        className="opcion"
                        data-testid={op === 'si' ? 'cib-si' : undefined}
                        data-sel={respuestas[item.id] === op ? op : undefined}
                        aria-pressed={respuestas[item.id] === op}
                        onClick={() => setRespuestas((r) => ({ ...r, [item.id]: op }))}
                      >
                        {op === 'si' ? 'Sí' : op === 'no' ? 'No' : 'No sé'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="acciones">
                <button type="button" data-testid="cib-guardar" className="btn" onClick={guardar} disabled={faltan || guardado}>
                  {guardado ? 'Guardado' : faltan ? 'Respondé las tarjetas' : 'Guardar observación'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

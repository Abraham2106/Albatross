import { useEffect, useRef, useState } from 'react';
import { extraer, confirmar, descargarModelos, estadoModelos, onProgreso } from '../api/client.js';
import { Micro, SinRed, Copia } from '../components/Iconos.jsx';
import { startRecording } from '../../../../../src/ui/recorder.ts';

function percentFrom(message) {
  const match = String(message ?? '').match(/(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

export default function Captura({ onListo }) {
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

  useEffect(() => {
    let alive = true;
    estadoModelos().then(value => { if (alive) setPack(value); });
    const off = onProgreso(({ message }) => {
      setProgreso(message);
      const next = percentFrom(message);
      if (next !== null) setPct(next);
    });
    return () => { alive = false; off(); };
  }, []);

  async function bajarModelos() {
    setError('');
    setBajando(true);
    setProgreso('Preparando descarga…');
    setPct(0);
    try {
      setPack(await descargarModelos());
      setProgreso('Modelos listos');
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
    try {
      setResultado(await extraer(texto, audio ? { audio, mimeType: 'audio/wav' } : undefined));
      setRespuestas({});
    } catch (e) {
      setError(e.message === 'SIN_BACKEND' ? 'El servidor no responde. Revisa que el backend esté corriendo.' : 'No se pudo procesar. ' + e.message);
    } finally {
      setCargando(false);
    }
  }

  async function soltarMic() {
    const current = recorder.current;
    recorder.current = null;
    setGrabando(false);
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
    setError('');
    setSegundos(0);
    setGrabando(true);
    try {
      recorder.current = await startRecording(() => { void soltarMic(); }, setSegundos);
    } catch {
      setGrabando(false);
      setError('No se pudo abrir el micrófono. Escribí el dictado.');
    }
  }

  async function guardar() {
    await confirmar(resultado.observacionId, respuestas);
    setGuardado(true);
    setTimeout(() => {
      setTexto('');
      setResultado(null);
      setGuardado(false);
      onListo?.();
    }, 900);
  }

  const faltan = resultado && resultado.items.some((i) => !respuestas[i.id]);

  return (
    <>
      <div className="top">
        <h1 className="titulo">Nueva observación</h1>
        <p className="offline"><SinRed /> Sin conexión · procesando local</p>
      </div>

      <div className="cuerpo" style={{ padding: '16px 18px' }}>
        {!resultado && (
          <>
            {pack && (
              <div className="pack-modelos">
                {pack.ready ? (
                  <p className="fila-s">Modelos listos en el dispositivo.</p>
                ) : (
                  <>
                    <button data-testid="cib-modelos" className="btn btn-sec" onClick={bajarModelos} disabled={bajando}>
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
            <button
              className="btn-mic"
              data-testid="cib-mic"
              onPointerDown={() => { if (!grabando) void pulsarMic(); }}
              onPointerUp={() => { if (grabando) void soltarMic(); }}
              onPointerLeave={() => { if (grabando) void soltarMic(); }}
            >
              <Micro /> {grabando ? `Grabando · ${segundos} s` : audio ? 'Dictado listo · volvé a grabar' : 'Mantené presionado para dictar'}
            </button>

            <textarea
              data-testid="cib-texto"
              value={texto}
              disabled={!!audio}
              onChange={(e) => { setTexto(e.target.value); if (error) setError(''); }}
              placeholder="Estuve en Hospital Alpha, vi dos tomógrafos..."
            />
            {audio && <p className="fila-s">Audio capturado. Procesalo o grabá de nuevo.</p>}
            {error && <p className="error">{error}</p>}

            <button data-testid="cib-procesar" className="btn" onClick={procesar} disabled={cargando || bajando || (pack && !pack.ready)} style={{ marginTop: 12 }}>
              {cargando ? 'Procesando en el dispositivo' : pack && !pack.ready ? 'Descargá los modelos para procesar' : 'Procesar'}
            </button>
          </>
        )}

        {resultado && (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--tinta-3)', fontStyle: 'italic', margin: '0 0 16px' }}>
              "{resultado.textoOriginal}"
            </p>

            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--tinta-2)', margin: '0 0 10px' }}>
              Confirmá lo que entendí
            </h2>

            {resultado.items.map((item) => (
              <div key={item.id} className="tarjeta">
                <p>{item.resumen}</p>
                <div className="opciones">
                  {['si', 'no', 'nose'].map((op) => (
                    <button
                      key={op}
                      className="opcion"
                      data-testid={op === 'si' ? 'cib-si' : undefined}
                      data-sel={respuestas[item.id] === op ? op : undefined}
                      onClick={() => setRespuestas((r) => ({ ...r, [item.id]: op }))}
                    >
                      {op === 'si' ? 'Si' : op === 'no' ? 'No' : 'No sé'}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {resultado.conflictos.map((c, i) => (
              <div key={i} className="aviso">
                <Copia style={{ width: 14, height: 14, verticalAlign: -2, marginRight: 5 }} />
                {c.mensaje}
              </div>
            ))}

            <button data-testid="cib-guardar" className="btn" onClick={guardar} disabled={faltan || guardado}>
              {guardado ? 'Guardado' : faltan ? 'Respondé las tarjetas' : 'Guardar observación'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

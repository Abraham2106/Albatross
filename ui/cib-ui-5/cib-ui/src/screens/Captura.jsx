import { useState } from 'react';
import { extraer, confirmar } from '../api/client.js';
import { Micro, SinRed, Copia } from '../components/Iconos.jsx';

export default function Captura({ onListo }) {
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  async function procesar() {
    if (!texto.trim()) {
      setError('Escribí o dictá la observación primero');
      return;
    }
    setError('');
    setCargando(true);
    try {
      setResultado(await extraer(texto));
      setRespuestas({});
    } catch (e) {
      setError(e.message === 'SIN_BACKEND' ? 'El servidor no responde. Revisa que el backend esté corriendo.' : 'No se pudo procesar. ' + e.message);
    } finally {
      setCargando(false);
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
            <button className="btn-mic" onClick={() => setError('El dictado por voz todavía no está conectado')}>
              <Micro /> Mantené presionado para dictar
            </button>

            <textarea
              value={texto}
              onChange={(e) => { setTexto(e.target.value); if (error) setError(''); }}
              placeholder="Estuve en Hospital Alpha, vi dos tomógrafos..."
            />
            {error && <p className="error">{error}</p>}

            <button className="btn" onClick={procesar} disabled={cargando} style={{ marginTop: 12 }}>
              {cargando ? 'Procesando en el dispositivo' : 'Procesar'}
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

            <button className="btn" onClick={guardar} disabled={faltan || guardado}>
              {guardado ? 'Guardado' : faltan ? 'Respondé las tarjetas' : 'Guardar observación'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

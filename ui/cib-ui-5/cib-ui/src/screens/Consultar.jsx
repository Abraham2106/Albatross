import { useEffect, useState } from 'react';
import { cancelar, consultar, estadoModelos } from '../api/client.js';
import { EstadoBadge } from '../components/Estado.jsx';
import { esSinDatos } from '../components/Estados.jsx';

const EJEMPLOS = [
  'clientes en Brasil con resonadores de más de siete años',
  'tomógrafos de más de diez años',
  'hospitales con equipos Aurelia Health en México'
];
const ESTADOS = { Confirmed: 'confirmados', Reported: 'reportados', Estimated: 'estimados', Unknown: 'sin datos' };

function etiquetas(f) {
  const lista = (clave, texto = (v) => v) => f[clave].map((v) => ({ texto: texto(v), filtro: { ...f, [clave]: f[clave].filter((x) => x !== v) } }));
  const unica = (clave, texto) => (f[clave] === null ? [] : [{ texto: texto(f[clave]), filtro: { ...f, [clave]: null } }]);
  return [
    ...lista('countries'), ...lista('cities'), ...lista('modalities'), ...lista('brands'),
    ...unica('model', (v) => `Modelo ${v}`),
    ...unica('olderThanYears', (v) => `Más de ${v} años`),
    ...unica('youngerThanYears', (v) => `Menos de ${v} años`),
    ...unica('ageWord', (v) => (v === 'old' ? 'Viejos (10 años o más)' : 'Nuevos (menos de 5 años)')),
    ...unica('minQuantity', (v) => `Al menos ${v} equipos`),
    ...lista('statuses', (v) => `Estado: ${ESTADOS[v]}`)
  ];
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export default function Consultar({ activa, onAbrirCliente }) {
  const [pregunta, setPregunta] = useState('');
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [pack, setPack] = useState(undefined);

  useEffect(() => {
    if (activa) estadoModelos().then(setPack).catch(() => setPack(null));
  }, [activa]);

  async function pedir(input) {
    setError('');
    setCargando(true);
    try {
      setResultado(await consultar(input));
    } catch (e) {
      setError(esSinDatos(e.message) ? 'La consulta solo está disponible en la app de escritorio.' : e.message);
    } finally {
      setCargando(false);
    }
  }

  function preguntar(texto) {
    if (!texto.trim() || cargando) return;
    setPregunta(texto);
    void pedir({ pregunta: texto.trim() });
  }

  function quitar(filtro) {
    if (!etiquetas(filtro).length) setResultado(null);
    else void pedir({ filtro });
  }

  const sinModelos = pack && !pack.ready;

  return (
    <div className="pantalla">
      <div className="top">
        <h1 className="titulo">Consultar</h1>
        <form className="consulta-form" onSubmit={(e) => { e.preventDefault(); preguntar(pregunta); }}>
          <input
            data-testid="cib-consulta"
            className="consulta-campo"
            value={pregunta}
            maxLength={300}
            placeholder="Preguntá por la base instalada…"
            aria-label="Pregunta"
            disabled={cargando}
            onChange={(e) => setPregunta(e.target.value)}
          />
          <button type="submit" className="btn" disabled={cargando || sinModelos || !pregunta.trim()}>
            {cargando && <span className="girando" aria-hidden="true" />}
            {sinModelos ? 'Descargá los modelos en Capturar' : 'Consultar'}
          </button>
          {cargando && <button type="button" className="btn btn-sec" onClick={() => { void cancelar(); }}>Cancelar</button>}
        </form>
        <p className="fila-s">Qwen interpreta la pregunta en el dispositivo. Los resultados salen de la base, no del modelo.</p>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="cuerpo">
        {!resultado ? (
          <div className="seccion">
            <h2>Probá con</h2>
            <div className="consulta-ejemplos">
              {EJEMPLOS.map((e) => (
                <button key={e} type="button" className="consulta-ejemplo" disabled={cargando || sinModelos} onClick={() => preguntar(e)}>{e}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="consulta-entendi">
              <span className="consulta-rotulo">Entendí</span>
              {etiquetas(resultado.filtro).map((t) => (
                <button key={t.texto} type="button" className="consulta-etiqueta" disabled={cargando} aria-label={`Quitar ${t.texto}`} onClick={() => quitar(t.filtro)}>
                  {t.texto} <b aria-hidden="true">×</b>
                </button>
              ))}
              <span className="consulta-total">
                <b>{plural(resultado.totalHospitales, 'hospital', 'hospitales')}</b> · {plural(resultado.totalEquipos, 'equipo', 'equipos')}
              </span>
            </div>
            {resultado.sinEdad > 0 && (
              <p className="fila-s consulta-nota">{plural(resultado.sinEdad, 'grupo sin edad conocida no entra', 'grupos sin edad conocida no entran')}.</p>
            )}
            {!resultado.hospitales.length && <p className="vacio">Ningún hospital cumple. Quitá una etiqueta.</p>}
            {resultado.hospitales.map((h) => (
              <button key={h.id} type="button" className="consulta-hospital" onClick={() => onAbrirCliente(h.id)}>
                <span className="consulta-cabeza">
                  <span className="fila-t">{h.nombre}</span>
                  <span className="fila-s">{h.ciudad} · {h.pais}</span>
                </span>
                {h.grupos.map((g) => (
                  <span key={g.id} className="equipo">
                    <span>
                      <span className="fila-t">{g.cantidad ?? '?'} × {g.modalidad}</span>
                      <span className="fila-s">{[g.marca ?? 'Marca sin identificar', g.modelo, g.edad !== null && `${g.edad} años`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <EstadoBadge estado={g.estado} />
                  </span>
                ))}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

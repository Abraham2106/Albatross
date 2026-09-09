import { obtenerResumen } from '../api/client.js';
import { Cargando, Error, usePedido } from '../components/Estados.jsx';

const COLOR = {
  alta: ['var(--peligro-bg)', 'var(--peligro)'],
  media: ['var(--estimado-bg)', 'var(--estimado)'],
  visitar: ['var(--desconocido-bg)', 'var(--desconocido)']
};

export default function Resumen() {
  const { datos: r, error, reintentar } = usePedido(obtenerResumen);

  if (error) return <Error error={error} onReintentar={reintentar} />;
  if (!r) return <Cargando que="Cargando panorama" />;

  return (
    <>
      <div className="top">
        <p className="ruta">{r.region} › {r.pais}</p>
        <h1 className="titulo">Panorama</h1>
      </div>

      <div className="cuerpo">
        <div className="metricas" style={{ paddingTop: 14 }}>
          <div className="metrica"><p>Clientes</p><b className="num">{r.clientes}</b></div>
          <div className="metrica"><p>Equipos vistos</p><b className="num">{r.equipos}</b></div>
          <div className="metrica">
            <p>Confianza media</p>
            <b className="num" style={{ color: 'var(--estimado)' }}>{r.confianzaMedia}%</b>
          </div>
          <div className="metrica">
            <p>Sin verificar 12m</p>
            <b className="num" style={{ color: 'var(--peligro)' }}>{r.sinVerificar}</b>
          </div>
        </div>

        <div className="seccion">
          <h2>Oportunidades</h2>
          {r.oportunidades.map((o) => {
            const [bg, fg] = COLOR[o.prioridad] || COLOR.visitar;
            return (
              <div key={o.id} className="equipo" style={{ borderLeftColor: fg }}>
                <div style={{ minWidth: 0 }}>
                  <p className="fila-t">{o.cliente}</p>
                  <p className="fila-s">{o.motivo}</p>
                </div>
                <span className="badge" style={{ background: bg, color: fg }}>
                  {o.prioridad === 'visitar' ? 'Visitar' : `Prioridad ${o.prioridad}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

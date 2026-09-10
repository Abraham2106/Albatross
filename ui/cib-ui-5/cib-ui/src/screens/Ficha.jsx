import { obtenerCliente } from '../api/client.js';
import { EstadoBadge, Confianza } from '../components/Estado.jsx';
import { Cargando, Error, usePedido } from '../components/Estados.jsx';

/** "2 tomógrafos · Medix · 8 años" armado solo con lo que se sabe. */
function detalle(e) {
  if (e.estado === 'Unknown') return 'Nadie ha reportado esta modalidad';
  const partes = [];
  if (e.marca) partes.push(e.marca); else partes.push('Marca sin identificar');
  if (e.modelo) partes.push(e.modelo); else partes.push('modelo sin identificar');
  if (e.edad) partes.push(`${e.edad} años`);
  if (e.anioInstalacion) partes.push(`inst. ${e.anioInstalacion}`);
  return partes.join(' · ');
}

export default function Ficha({ id, onVolver }) {
  const { datos: c, error, reintentar } = usePedido(() => obtenerCliente(id), [id]);

  if (error) return <Error error={error} onReintentar={reintentar} />;
  if (!c) return <Cargando que="Cargando ficha" />;

  return (
    <div className="pantalla">
      <div className="top">
        <button type="button" className="volver" onClick={onVolver}>Hospitales</button>
        <p className="ruta">{c.pais} › {c.ciudad}</p>
        <h1 className="titulo ficha-titulo">{c.nombre}</h1>
        <Confianza pct={c.confianza} />
      </div>

      <div className="cuerpo">
        {c.pendientes.length > 0 && (
          <div className="pendientes">
            <h2>Antes de entrar, averiguá</h2>
            {c.pendientes.map((p) => (
              <div key={p.id} className="pendiente">
                <p>{p.texto}</p>
                <span>{p.motivo}</span>
              </div>
            ))}
          </div>
        )}

        <div className="seccion">
          <h2>Base instalada</h2>
          {c.equipos.map((e) => (
            <div key={e.id} className={`equipo ${(e.estado === 'Unknown' ? 'desconocido' : e.estado === 'Confirmed' ? 'confirmado' : e.estado === 'Reported' ? 'reportado' : 'estimado')}`}>
              <div style={{ minWidth: 0 }}>
                <p className="fila-t">
                  {e.cantidad ? `${e.cantidad} × ` : ''}{e.modalidad}
                  
                </p>
                <p className="fila-s">{detalle(e)}</p>
                {e.nota && <p className="cita">{e.nota}</p>}
              </div>
              <EstadoBadge estado={e.estado} />
            </div>
          ))}
        </div>

        <div className="seccion">
          <h2>Procedencia</h2>
          {c.equipos.filter((e) => e.observador).map((e) => (
            <p key={e.id} className="fila-s" style={{ marginBottom: 5 }}>
              {e.modalidad} · {e.observador} · {e.fecha}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

import { obtenerCliente } from '../api/client.js';
import { EstadoBadge, Confianza, MOTIVO } from '../components/Estado.jsx';
import { Cargando, Error, usePedido } from '../components/Estados.jsx';
import { Check } from '../components/Iconos.jsx';

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

export default function Ficha({ id, onVolver, onVisita, antes }) {
  const { datos: c, error, reintentar } = usePedido(() => obtenerCliente(id), [id]);

  if (error) return <Error error={error} onReintentar={reintentar} />;
  if (!c) return <Cargando que="Cargando ficha" />;

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="pantalla">
      {antes !== undefined && (
        <p className="guardado-aviso" role="status">
          <Check />
          {antes === null
            ? `Hospital nuevo guardado con confianza ${c.confianza}%.`
            : `Observación guardada. La confianza pasó de ${antes}% a ${c.confianza}%.`}
        </p>
      )}
      <div className="top">
        <button type="button" className="volver" onClick={onVolver}>Hospitales</button>
        <p className="ruta">{c.pais} › {c.ciudad}</p>
        <h1 className="titulo ficha-titulo">{c.nombre}</h1>
        <Confianza pct={c.confianza} antes={antes ?? null} />
        <button type="button" data-testid="cib-visita" className="btn btn-sec ficha-visita" onClick={() => onVisita(c)}>
          Registrar visita
        </button>
      </div>

      <div className="cuerpo">
        {c.pendientes.length > 0 && (
          <div className="pendientes">
            <h2>Antes de entrar, averiguá</h2>
            {c.pendientes.map((p) => (
              <div key={p.id} className="pendiente">
                <p>{p.texto}</p>
                <span>{MOTIVO[p.motivo] ?? p.motivo}</span>
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
              <span className="equipo-lado">
                {e.fecha === hoy && <span className="equipo-hoy">actualizado hoy</span>}
                <EstadoBadge estado={e.estado} />
              </span>
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

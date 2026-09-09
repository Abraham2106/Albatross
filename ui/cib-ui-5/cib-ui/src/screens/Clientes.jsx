import { listarClientes } from '../api/client.js';
import { Confianza } from '../components/Estado.jsx';
import { Cargando, Error, Vacio, usePedido } from '../components/Estados.jsx';

export default function Clientes({ onAbrir }) {
  const { datos, error, reintentar } = usePedido(listarClientes);

  if (error) return <Error error={error} onReintentar={reintentar} />;
  if (!datos) return <Cargando que="Cargando hospitales" />;
  if (!datos.length) return <Vacio mensaje="Todavía no hay clientes registrados." />;

  // Los mas incompletos primero. Ese es el punto del producto:
  // la app le dice al ingeniero donde falta informacion.
  const orden = [...datos].sort((a, b) => a.confianza - b.confianza);
  const pais = datos[0]?.pais;

  return (
    <>
      <div className="top">
        <p className="ruta">{pais ? `${pais} · ` : ''}{datos.length} clientes</p>
        <h1 className="titulo">Tus hospitales</h1>
      </div>

      <div className="cuerpo">
        {orden.map((c) => (
          <button key={c.id} className="fila" onClick={() => onAbrir(c.id)}>
            <div>
              <p className="fila-t">{c.nombre}</p>
              <p className="fila-s">
                {c.ciudad}
                {c.pendientes > 0 && ` · ${c.pendientes} dato${c.pendientes > 1 ? 's' : ''} por averiguar`}
              </p>
            </div>
            <Confianza pct={c.confianza} compacto />
          </button>
        ))}
      </div>
    </>
  );
}

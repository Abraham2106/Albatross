import { useState } from 'react';
import { cargarEjemplo, hayEscritorio, listarClientes } from '../api/client.js';
import { Confianza } from '../components/Estado.jsx';
import { Cargando, Error, Vacio, esSinDatos, usePedido } from '../components/Estados.jsx';

export default function Clientes({ onAbrir, onCapturar, onCargado, seleccionado }) {
  const { datos, error, reintentar } = usePedido(listarClientes);
  const [sembrando, setSembrando] = useState(false);
  const [fallo, setFallo] = useState('');

  async function sembrar() {
    setSembrando(true);
    setFallo('');
    try {
      await cargarEjemplo();
      onCargado?.();
    } catch (e) {
      setFallo('No se pudieron cargar los ejemplos. ' + e.message);
    } finally {
      setSembrando(false);
    }
  }

  if (error && !esSinDatos(error)) return <Error error={error} onReintentar={reintentar} />;
  if (!datos && !error) return <Cargando que="Cargando hospitales" />;
  if (error || !datos.length) {
    return (
      <Vacio
        mensaje="Todavía no hay hospitales. Capturá la primera observación."
        accion="Ir a capturar"
        onAccion={onCapturar}
      >
        {hayEscritorio() && (
          <>
            <button type="button" data-testid="cib-ejemplo" className="btn btn-sec vacio-ejemplo" onClick={sembrar} disabled={sembrando}>
              {sembrando && <span className="girando" aria-hidden="true" />}
              Cargar hospitales de ejemplo
            </button>
            <p className="fila-s vacio-nota">13 hospitales ficticios entregados con el reto.</p>
            {fallo && <p className="error" role="alert">{fallo}</p>}
          </>
        )}
      </Vacio>
    );
  }

  const orden = [...datos].sort((a, b) => a.confianza - b.confianza);
  const pais = datos[0]?.pais;

  return (
    <div className="pantalla">
      <div className="top">
        <p className="ruta">{pais ? `${pais} · ` : ''}{datos.length} hospitales</p>
        <h1 className="titulo">Hospitales</h1>
      </div>

      <div className="cuerpo">
        {orden.map((c) => (
          <button
            key={c.id}
            type="button"
            className="fila"
            data-sel={c.id === seleccionado}
            aria-current={c.id === seleccionado ? 'true' : undefined}
            onClick={() => onAbrir(c.id)}
          >
            <div className="fila-texto">
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
    </div>
  );
}

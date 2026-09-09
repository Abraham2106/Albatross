import { useState } from 'react';
import { obtenerGeo } from '../api/client.js';
import { nivel } from '../components/Estado.jsx';
import { Cargando, Error, usePedido } from '../components/Estados.jsx';

/**
 * Mapa por niveles: Region → Pais → Ciudad → Hospital.
 *
 * Decision clave: NO usamos contornos geograficos reales.
 *
 * Dos razones. La primera es tecnica: cualquier libreria de mapas
 * (Leaflet, Mapbox) carga tiles desde internet, y el mapa se pone gris
 * justo cuando desconectemos el wifi en la demo. Eso hundiria el argumento
 * central del proyecto.
 *
 * La segunda es que el brief no pide cartografia, pide poder navegar
 * la jerarquia y llegar hasta las observaciones individuales. Bloques
 * y puntos cumplen eso y se ven mejor en un proyector.
 */

/** El color dice lo mismo en los tres niveles: que tan completa esta la informacion. */
function color(pct) {
  return nivel(pct).color;
}

function fondo(pct) {
  const n = nivel(pct);
  return n.texto === 'Alta' ? 'var(--confirmado-bg)'
    : n.texto === 'Media' ? 'var(--estimado-bg)'
    : 'var(--peligro-bg)';
}

export default function Mapa({ onAbrirCliente }) {
  const { datos: geo, error, reintentar } = usePedido(obtenerGeo);
  const [pais, setPais] = useState(null);
  const [ciudad, setCiudad] = useState(null);

  if (error) return <Error error={error} onReintentar={reintentar} />;
  if (!geo) return <Cargando que="Cargando cobertura" />;

  const ruta = ['Latinoamérica', pais?.nombre, ciudad?.nombre].filter(Boolean);

  function subir() {
    if (ciudad) setCiudad(null);
    else if (pais) setPais(null);
  }

  return (
    <>
      <div className="top">
        {(pais || ciudad) && (
          <button className="volver" onClick={subir}>
            {ciudad ? pais.nombre : 'Latinoamérica'}
          </button>
        )}
        <p className="ruta">{ruta.join(' › ')}</p>
        <h1 className="titulo">
          {ciudad ? ciudad.nombre : pais ? pais.nombre : 'Cobertura'}
        </h1>
      </div>

      <div className="cuerpo" style={{ padding: '14px 18px' }}>

        {!pais && (
          <>
            <div className="tiles">
              {geo.paises.map((p) => (
                <button
                  key={p.id}
                  className="tile"
                  style={{ background: fondo(p.confianza), borderColor: color(p.confianza) }}
                  onClick={() => setPais(p)}
                >
                  <b>{p.nombre}</b>
                  <span className="num" style={{ color: color(p.confianza) }}>{p.confianza}%</span>
                  <small>{p.clientes} clientes · {p.equipos} equipos</small>
                </button>
              ))}
            </div>
            <Leyenda />
          </>
        )}

        {pais && !ciudad && (
          <>
            <div className="tiles">
              {pais.ciudades.map((c) => (
                <button
                  key={c.id}
                  className="tile"
                  style={{ background: fondo(c.confianza), borderColor: color(c.confianza) }}
                  onClick={() => setCiudad(c)}
                >
                  <b>{c.nombre}</b>
                  <span className="num" style={{ color: color(c.confianza) }}>{c.confianza}%</span>
                  <small>{c.clientes} clientes · {c.equipos} equipos</small>
                </button>
              ))}
            </div>
            <Leyenda />
          </>
        )}

        {ciudad && (
          <>
            <div className="plano">
              <svg viewBox="0 0 100 78" width="100%" role="img" aria-label={`Hospitales en ${ciudad.nombre}`}>
                <defs>
                  <pattern id="rejilla" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M10 0H0V10" fill="none" stroke="var(--linea)" strokeWidth="0.3" />
                  </pattern>
                </defs>
                <rect width="100" height="78" fill="url(#rejilla)" />
                {ciudad.hospitales.map((h) => {
                  const r = 3 + Math.min(h.equipos, 10) * 0.45;
                  return (
                    <g
                      key={h.id}
                      onClick={() => onAbrirCliente(h.id)}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onAbrirCliente(h.id)}
                    >
                      <circle
                        cx={h.x * 100}
                        cy={h.y * 78}
                        r={r}
                        fill={color(h.confianza)}
                        fillOpacity="0.9"
                        stroke="var(--papel)"
                        strokeWidth="1"
                      />
                      <text
                        x={h.x * 100}
                        y={h.y * 78 + r + 4.2}
                        textAnchor="middle"
                        fontSize="3.2"
                        fill="var(--tinta-2)"
                      >
                        {h.nombre.length > 22 ? h.nombre.slice(0, 20) + '…' : h.nombre}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <p style={{ fontSize: 12, color: 'var(--tinta-3)', margin: '10px 0 14px' }}>
              El tamaño del punto es la cantidad de equipos conocidos. Tocalo para ver la ficha.
            </p>

            {[...ciudad.hospitales].sort((a, b) => a.confianza - b.confianza).map((h) => (
              <button
                key={h.id}
                className="equipo"
                style={{ borderLeftColor: color(h.confianza), width: '100%', textAlign: 'left', border: 0, borderLeft: `3px solid ${color(h.confianza)}` }}
                onClick={() => onAbrirCliente(h.id)}
              >
                <div>
                  <p className="fila-t">{h.nombre}</p>
                  <p className="fila-s">{h.equipos} equipos conocidos</p>
                </div>
                <span className="num" style={{ fontWeight: 600, color: color(h.confianza) }}>{h.confianza}%</span>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function Leyenda() {
  return (
    <div className="leyenda">
      <span><i style={{ background: 'var(--peligro)' }} /> Baja</span>
      <span><i style={{ background: 'var(--estimado)' }} /> Media</span>
      <span><i style={{ background: 'var(--confirmado)' }} /> Alta</span>
      <em>confianza de la informacion</em>
    </div>
  );
}

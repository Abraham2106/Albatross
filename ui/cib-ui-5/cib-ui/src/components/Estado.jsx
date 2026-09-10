/**
 * Los dos componentes que sostienen todo el sistema visual.
 *
 * EstadoBadge es lo primero que hay que tener listo. Si el estado no se
 * distingue de un vistazo, el producto pierde su argumento principal.
 * Por eso lleva icono ademas de color: en un proyector los colores mienten,
 * y hay gente que no distingue verde de ambar.
 */

import { Check, Persona, Aprox, Guion } from './Iconos.jsx';

/**
 * El dataset guarda los estados en ingles (asi vienen del Excel y asi los
 * devolvera el backend). La UI los muestra en espanol. Traducir aca y no
 * en los datos evita tener dos verdades.
 */
const MAPA = {
  Confirmed:  { texto: 'Confirmado',  clase: 'confirmado',  Icono: Check },
  Reported:   { texto: 'Reportado',   clase: 'reportado',   Icono: Persona },
  Estimated:  { texto: 'Estimado',    clase: 'estimado',    Icono: Aprox },
  Unknown:    { texto: 'Sin datos',   clase: 'desconocido', Icono: Guion }
};

export const MOTIVO = {
  missing: 'Falta el dato',
  low_confidence: 'Poco confirmado',
  stale: 'Dato de hace más de seis meses',
  conflict: 'Dos reportes no coinciden'
};

export function EstadoBadge({ estado }) {
  const e = MAPA[estado] || MAPA.Unknown;
  return (
    <span className={`badge ${e.clase}`}>
      <e.Icono />
      {e.texto}
    </span>
  );
}

export function esEstado(estado, cual) {
  return estado === cual;
}

/** Alta, Media o Baja segun el porcentaje. El brief pide esta etiqueta. */
export function nivel(pct) {
  if (pct >= 80) return { texto: 'Alta', color: 'var(--confirmado)' };
  if (pct >= 55) return { texto: 'Media', color: 'var(--estimado)' };
  return { texto: 'Baja', color: 'var(--peligro)' };
}

export function Confianza({ pct, compacto = false, antes = null }) {
  const n = nivel(pct);
  if (compacto) {
    return (
      <div style={{ minWidth: 62 }}>
        <div style={{ textAlign: 'right', fontWeight: 600, color: n.color }} className="num">
          {pct}%
        </div>
        <div className="barra">
          <i style={{ width: `${pct}%`, background: n.color }} />
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="conf-fila">
        <span className="conf-num num" style={{ color: n.color }}>{pct}%</span>
        <span className="conf-etq">confianza {n.texto.toLowerCase()}</span>
        {antes !== null && (
          <span className="conf-delta" style={{ color: pct < antes ? 'var(--peligro)' : 'var(--confirmado)' }}>
            {pct === antes ? 'sin cambio con esta visita' : `${pct > antes ? '+' : ''}${pct - antes} con esta visita`}
          </span>
        )}
      </div>
      <div className="barra">
        <i style={{ width: `${pct}%`, background: n.color }} />
      </div>
    </div>
  );
}

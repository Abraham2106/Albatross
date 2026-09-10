/**
 * Estados de carga y error.
 */

export function esSinDatos(error) {
  return error === 'SIN_BACKEND'
    || /JSON\.parse|Unexpected token|unexpected character|is not valid JSON|Origen no autorizado/i.test(String(error || ''));
}

export function Cargando({ que = 'Cargando' }) {
  return <p className="vacio"><span className="girando" aria-hidden="true" />{que}…</p>;
}

export function Error({ error, onReintentar }) {
  const sinDatos = esSinDatos(error);

  return (
    <div className="vacio">
      <p style={{ fontWeight: 500, color: 'var(--tinta)', marginBottom: 6 }}>
        {sinDatos ? 'Todavía no hay datos' : 'No se pudo cargar'}
      </p>
      <p style={{ margin: '0 0 16px' }}>
        {sinDatos
          ? 'Capturá una observación para empezar. Todo se procesa en este dispositivo.'
          : 'Reintentá. Si sigue fallando, reiniciá la app.'}
      </p>
      {onReintentar && (
        <button type="button" className="btn" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ mensaje, accion, onAccion }) {
  return (
    <div className="vacio">
      <p>{mensaje}</p>
      {accion && onAccion && (
        <button type="button" className="btn" onClick={onAccion}>{accion}</button>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';

export function usePedido(fn, deps = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);

  const reintentar = useCallback(() => setIntento((i) => i + 1), []);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    fn()
      .then((d) => vivo && setDatos(d))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        vivo && setError(esSinDatos(msg) ? 'SIN_BACKEND' : msg);
      });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intento]);

  return { datos, error, reintentar };
}

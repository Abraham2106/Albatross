/**
 * Estados de carga y error.
 *
 * Mientras el backend no exista, esto es lo que se va a ver siempre.
 * Vale la pena que se vea bien: un error claro da mas confianza que
 * una pantalla en blanco, y si algo falla durante la demo, al menos
 * se entiende que fallo.
 */

export function Cargando({ que = 'Cargando' }) {
  return <p className="vacio">{que}…</p>;
}

export function Error({ error, onReintentar }) {
  const sinBackend = error === 'SIN_BACKEND';

  return (
    <div className="vacio">
      <p style={{ fontWeight: 500, color: 'var(--tinta)', marginBottom: 6 }}>
        {sinBackend ? 'El servidor no responde' : 'No se pudo cargar'}
      </p>
      <p style={{ margin: '0 0 16px' }}>
        {sinBackend
          ? 'Revisa que el backend este corriendo en el puerto 3000.'
          : `El servidor respondio con ${error}.`}
      </p>
      {onReintentar && (
        <button className="btn" style={{ maxWidth: 200 }} onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ mensaje }) {
  return <p className="vacio">{mensaje}</p>;
}

/**
 * Hook para pedir datos. Maneja carga, error y reintento en un solo lugar
 * para no repetir el mismo useEffect en cada pantalla.
 */
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
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intento]);

  return { datos, error, reintentar };
}

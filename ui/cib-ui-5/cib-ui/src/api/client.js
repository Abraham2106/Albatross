/**
 * Cliente de API.
 *
 * La UI no tiene datos propios. Todo viene del backend.
 * Si el backend no responde, cada pantalla muestra su estado de error.
 *
 * Los ejemplos de lo que cada ruta debe devolver estan en docs/contrato-api.json
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await fetch(BASE + ruta, {
      headers: { 'Content-Type': 'application/json' },
      ...opciones
    });
  } catch {
    // fetch solo tira excepcion si no hubo respuesta del servidor
    throw new Error('SIN_BACKEND');
  }
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

/** Lista para la pantalla principal. `pendientes` viene como numero. */
export const listarClientes = () => pedir('/clientes');

/** Ficha completa con equipos[] y pendientes[]. */
export const obtenerCliente = (id) => pedir(`/clientes/${id}`);

/** Jerarquia Region → Pais → Ciudad → Hospital. */
export const obtenerGeo = () => pedir('/geo');

/** Metricas agregadas y oportunidades de renovacion. */
export const obtenerResumen = (pais) =>
  pedir(pais ? `/resumen?pais=${encodeURIComponent(pais)}` : '/resumen');

/**
 * Manda el texto libre. El backend lo pasa por QVAC y devuelve
 * lo extraido para que el usuario lo confirme.
 */
export const extraer = (texto) =>
  pedir('/observaciones', { method: 'POST', body: JSON.stringify({ texto }) });

/** respuestas = { itemId: 'si' | 'no' | 'nose' } */
export const confirmar = (observacionId, respuestas) =>
  pedir(`/observaciones/${observacionId}/confirmar`, {
    method: 'POST',
    body: JSON.stringify({ respuestas })
  });

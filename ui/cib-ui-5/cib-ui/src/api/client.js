/**
 * Cliente de API.
 *
 * En Electron usa window.philips (VisitService + QVAC).
 * Fuera de Electron, fetch('/api') hacia el backend HTTP si existe.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

function desktop() {
  return typeof window !== 'undefined' ? window.philips : undefined;
}

async function viaDesktop(run) {
  const result = await run();
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await fetch(BASE + ruta, {
      headers: { 'Content-Type': 'application/json' },
      ...opciones
    });
  } catch {
    throw new Error('SIN_BACKEND');
  }
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

export const listarClientes = () => {
  const api = desktop();
  return api?.clientes ? viaDesktop(() => api.clientes()) : pedir('/clientes');
};

export const obtenerCliente = (id) => {
  const api = desktop();
  return api?.cliente ? viaDesktop(() => api.cliente(id)) : pedir(`/clientes/${id}`);
};

export const obtenerGeo = () => {
  const api = desktop();
  return api?.geo ? viaDesktop(() => api.geo()) : pedir('/geo');
};

export const obtenerResumen = (pais) => {
  const api = desktop();
  return api?.resumen ? viaDesktop(() => api.resumen(pais)) : pedir(pais ? `/resumen?pais=${encodeURIComponent(pais)}` : '/resumen');
};

export const extraer = (texto, audio) => {
  const api = desktop();
  if (api?.extraer) {
    return viaDesktop(() => api.extraer(crypto.randomUUID(), audio ? { audio } : { texto }));
  }
  return pedir('/observaciones', { method: 'POST', body: JSON.stringify({ texto }) });
};

export const estadoModelos = () => {
  const api = desktop();
  return api?.models ? viaDesktop(() => api.models()) : Promise.resolve(null);
};

export const descargarModelos = () => {
  const api = desktop();
  if (!api?.downloadModels) throw new Error('SIN_BACKEND');
  return viaDesktop(() => api.downloadModels(crypto.randomUUID()));
};

export const onProgreso = (listener) => desktop()?.onProgress?.(listener) ?? (() => {});

export const confirmar = (observacionId, respuestas) => {
  const api = desktop();
  if (api?.confirmar) {
    return viaDesktop(() => api.confirmar({ observacionId, respuestas }));
  }
  return pedir(`/observaciones/${observacionId}/confirmar`, {
    method: 'POST',
    body: JSON.stringify({ respuestas })
  });
};

/**
 * Cliente de API.
 *
 * En Electron usa window.philips. Si philips está, no hay fallback HTTP
 * (Vite devolvería HTML y JSON.parse revienta).
 */

const BASE = import.meta.env.VITE_API_URL || '/api';
let lastRequestId = '';

function desktop() {
  return typeof window !== 'undefined' ? window.philips : undefined;
}

async function viaDesktop(run) {
  const result = await run();
  if (!result || typeof result !== 'object') throw new Error('SIN_BACKEND');
  if (!result.ok) throw new Error(result.error?.message || 'SIN_BACKEND');
  return result.data;
}

async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await fetch(BASE + ruta, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...opciones
    });
  } catch {
    throw new Error('SIN_BACKEND');
  }
  const type = res.headers.get('content-type') || '';
  const cuerpo = await res.text();
  if (!res.ok || !type.includes('json')) throw new Error('SIN_BACKEND');
  try {
    return JSON.parse(cuerpo);
  } catch {
    throw new Error('SIN_BACKEND');
  }
}

function conDesktop(metodo, args, http) {
  const api = desktop();
  if (api) {
    if (typeof api[metodo] !== 'function') throw new Error('SIN_BACKEND');
    return viaDesktop(() => api[metodo](...args));
  }
  return http();
}

export const listarClientes = () => conDesktop('clientes', [], () => pedir('/clientes'));
export const obtenerCliente = (id) => conDesktop('cliente', [id], () => pedir(`/clientes/${id}`));
export const obtenerGeo = () => conDesktop('geo', [], () => pedir('/geo'));
export const obtenerResumen = (pais) => conDesktop('resumen', pais ? [pais] : [], () => pedir(pais ? `/resumen?pais=${encodeURIComponent(pais)}` : '/resumen'));

export const cargarEjemplo = () => conDesktop('cargarEjemplo', [], () => Promise.reject(new Error('SIN_BACKEND')));

export const hayEscritorio = () => !!desktop();

export const transcribir = (audio) => {
  const api = desktop();
  lastRequestId = crypto.randomUUID();
  if (!api?.transcribir) throw new Error('SIN_BACKEND');
  return viaDesktop(() => api.transcribir(lastRequestId, audio));
};

export const abrirWav = () => {
  const api = desktop();
  if (!api?.openWav) throw new Error('SIN_BACKEND');
  return viaDesktop(() => api.openWav());
};

export const abrirVentanaWhisper = () => {
  const api = desktop();
  if (!api?.openWhisperWindow) throw new Error('SIN_BACKEND');
  return viaDesktop(() => api.openWhisperWindow());
};

export const extraer = (texto, audio) => {
  const api = desktop();
  lastRequestId = crypto.randomUUID();
  if (api) {
    if (typeof api.extraer !== 'function') throw new Error('SIN_BACKEND');
    return viaDesktop(() => api.extraer(lastRequestId, audio ? { audio } : { texto }));
  }
  return pedir('/observaciones', { method: 'POST', body: JSON.stringify({ texto }) });
};

export const cancelar = () => {
  const api = desktop();
  if (!api?.cancel || !lastRequestId) return Promise.resolve();
  return viaDesktop(() => api.cancel(lastRequestId)).catch(() => {});
};

export const estadoModelos = () => {
  const api = desktop();
  return api?.models ? viaDesktop(() => api.models()) : Promise.resolve(null);
};

export const descargarModelos = () => {
  const api = desktop();
  if (!api?.downloadModels) throw new Error('SIN_BACKEND');
  lastRequestId = crypto.randomUUID();
  return viaDesktop(() => api.downloadModels(lastRequestId));
};

export const onProgreso = (listener) => desktop()?.onProgress?.(listener) ?? (() => {});

export const precargarModelos = (capabilities = ['stt']) => {
  const api = desktop();
  if (!api?.preloadModels) return Promise.resolve(null);
  const requestId = crypto.randomUUID();
  return viaDesktop(() => api.preloadModels(requestId, capabilities));
};

export const confirmar = (observacionId, respuestas) => {
  const api = desktop();
  if (api) {
    if (typeof api.confirmar !== 'function') throw new Error('SIN_BACKEND');
    return viaDesktop(() => api.confirmar({ observacionId, respuestas }));
  }
  return pedir(`/observaciones/${observacionId}/confirmar`, {
    method: 'POST',
    body: JSON.stringify({ respuestas })
  });
};

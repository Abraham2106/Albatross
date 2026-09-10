import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../src/application/desktop-api';
const developmentTools = process.argv.includes('--philips-development-tools');
const api: DesktopApi = {
  developmentTools,
  status: () => ipcRenderer.invoke('philips:status'),
  list: () => ipcRenderer.invoke('philips:list'),
  profile: id => ipcRenderer.invoke('philips:profile', id),
  process: (requestId, input) => ipcRenderer.invoke('philips:process', { requestId, input }),
  accept: input => ipcRenderer.invoke('philips:accept', input),
  verifyIntegrity: () => ipcRenderer.invoke('philips:verify-integrity'),
  networkAudit: () => ipcRenderer.invoke('philips:network-audit'),
  followUps: (requestId, hospitalId) => ipcRenderer.invoke('philips:follow-ups', { requestId, hospitalId }),
  cancel: requestId => ipcRenderer.invoke('philips:cancel', requestId),
  clientes: () => ipcRenderer.invoke('philips:clientes'),
  cliente: id => ipcRenderer.invoke('philips:cliente', id),
  geo: () => ipcRenderer.invoke('philips:geo'),
  resumen: pais => ipcRenderer.invoke('philips:resumen', pais),
  cargarEjemplo: () => ipcRenderer.invoke('philips:ejemplo'),
  consultar: (requestId, input) => ipcRenderer.invoke('philips:consultar', { requestId, ...input }),
  extraer: (requestId, input) => ipcRenderer.invoke('philips:extraer', { requestId, ...input }),
  ...(developmentTools ? {
    transcribir: (requestId: string, input: Parameters<NonNullable<DesktopApi['transcribir']>>[1]) => ipcRenderer.invoke('philips:transcribir', { requestId, ...input }),
    openWav: () => ipcRenderer.invoke('philips:open-wav'),
    openWhisperWindow: () => ipcRenderer.invoke('philips:open-whisper-window'),
  } : {}),
  confirmar: input => ipcRenderer.invoke('philips:confirmar', input),
  models: () => ipcRenderer.invoke('philips:models'),
  downloadModels: requestId => ipcRenderer.invoke('philips:download-models', { requestId }),
  preloadModels: (requestId, capabilities) => ipcRenderer.invoke('philips:preload-models', { requestId, capabilities }),
  onProgress: listener => {
    const handler = (_event: Electron.IpcRendererEvent, value: { requestId: string; message: string }) => listener(value);
    ipcRenderer.on('philips:progress', handler);
    return () => ipcRenderer.removeListener('philips:progress', handler);
  },
};
contextBridge.exposeInMainWorld('philips', Object.freeze(api));

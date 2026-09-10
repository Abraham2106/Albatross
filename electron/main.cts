import './hide-bare-console.cjs';
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, type IpcMainInvokeEvent } from 'electron';
import { pinNvidiaGpu } from '../src/adapters/inference/qvac/prefer-nvidia';
import * as path from 'node:path';
import { NetworkAudit } from '../src/application/network-audit';
import * as fs from 'node:fs';
import { createRuntime } from '../src/bootstrap/desktop';
import { InferenceError } from '../src/application/ports/inference-engine';
import { text, record, invalid } from '../src/application/validation';
import { asAudioBytes, wavToPcm } from '../src/application/audio';
import { pcmDurationMs } from '../src/application/whisper-metrics';
import type { ProcessVisitInput, ReviewInput } from '../src/application/visits';
import type { Result } from '../src/application/desktop-api';
import type { TranscriptionRequest } from '../src/application/ports/inference-engine';
import { developmentToolsEnabled, requireDevelopmentTools } from '../src/application/development-tools';

const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest) {
  const smokeData = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'philips-smoke-'));
  app.setPath('userData', smokeData);
  app.disableHardwareAcceleration();
} else {
  pinNvidiaGpu();
  app.commandLine.appendSwitch('force_high_performance_gpu');
}
const devUrl = process.env.VITE_DEV_SERVER_URL;
const developmentTools = developmentToolsEnabled(app.isPackaged, devUrl, smokeTest);
const networkAudit = new NetworkAudit(devUrl ? new URL(devUrl).origin : undefined);
let mainWindow: BrowserWindow | null = null;
let whisperWindow: BrowserWindow | null = null;
let runtime: ReturnType<typeof createRuntime> | undefined;
let active: { id: string; controller: AbortController; sender: Electron.WebContents } | undefined;
let quitting = false;
const preloadSenders = new Map<string, Electron.WebContents>();
const filePath = path.join(__dirname, '../dist/index.html');
function trustedUrl(url: string) {
  const expected = devUrl || require('node:url').pathToFileURL(filePath).href;
  try {
    const actual = new URL(url);
    const allow = new URL(expected);
    return actual.protocol === allow.protocol && actual.host === allow.host && actual.pathname === allow.pathname;
  } catch {
    return url === expected || url === expected + '/';
  }
}
function liveContents(window: BrowserWindow | null) {
  try {
    if (!window || window.isDestroyed()) return null;
    const contents = window.webContents;
    return contents.isDestroyed() ? null : contents;
  } catch {
    return null;
  }
}
function appContents(contents: Electron.WebContents | null) {
  if (!contents) return false;
  try {
    if (contents.isDestroyed()) return false;
    const main = liveContents(mainWindow);
    const whisper = liveContents(whisperWindow);
    return (main !== null && contents === main) || (whisper !== null && contents === whisper);
  } catch {
    return false;
  }
}
function sendProgress(sender: Electron.WebContents, requestId: string, message: string) {
  try {
    if (!sender.isDestroyed()) sender.send('philips:progress', { requestId, message });
  } catch { /* the renderer closed while QVAC was still flushing progress */ }
}
function abortIfSender(window: BrowserWindow) {
  try {
    const contents = liveContents(window);
    if (active && contents && active.sender === contents) active.controller.abort();
  } catch { active?.controller.abort(); }
}
function trusted(event: IpcMainInvokeEvent) {
  if (!appContents(event.sender) || event.senderFrame !== event.sender.mainFrame || !trustedUrl(event.senderFrame.url)) invalid('Origen no autorizado.');
}
function handle(channel: string, action: (value: unknown, event: IpcMainInvokeEvent) => unknown) {
  ipcMain.handle('philips:' + channel, async (event, value): Promise<Result<unknown>> => {
    try { trusted(event); return { ok: true, data: await action(value, event) }; }
    catch (error) { return { ok: false, error: error instanceof InferenceError ? { code: error.code, message: error.message } : { code: 'UNAVAILABLE', message: 'No se pudo completar la operación local. Inténtalo de nuevo.' } }; }
  });
}
async function operation(event: IpcMainInvokeEvent, value: unknown, run: (input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>) {
  if (active) throw new InferenceError('UNAVAILABLE', 'Ya hay una operación en curso.');
  const input = record(value);
  const id = text(input.requestId, 'Solicitud', 100);
  const controller = new AbortController();
  active = { id, controller, sender: event.sender };
  try { return await run(input, controller.signal); } finally { active = undefined; }
}
function audioRequest(value: Record<string, unknown>): TranscriptionRequest {
  return { audio: asAudioBytes(value.audio), mimeType: text(value.mimeType, 'Tipo de audio', 40) };
}
function setupHandlers() {
  handle('status', () => runtime!.status);
  handle('list', () => runtime!.service.list());
  handle('profile', id => runtime!.service.getProfile(text(id, 'Hospital')));
  handle('process', (value, event) => operation(event, value, (v, signal) => runtime!.service.process(v.input as ProcessVisitInput, { signal })));
  handle('accept', value => runtime!.service.accept(value as ReviewInput));
  handle('verify-integrity', () => runtime!.service.verifyIntegrity());
  handle('network-audit', () => networkAudit.report());
  handle('follow-ups', (value, event) => operation(event, value, (v, signal) => runtime!.service.followUps(text(v.hospitalId, 'Hospital'), { signal })));
  handle('cancel', value => { const id = text(value, 'Solicitud'); if (active?.id === id) active.controller.abort(); });
  handle('clientes', () => runtime!.cib.clientes());
  handle('cliente', id => runtime!.cib.cliente(text(id, 'Hospital')));
  handle('geo', () => runtime!.cib.geo());
  handle('resumen', value => runtime!.cib.resumen(typeof value === 'string' && value.trim() ? value : undefined));
  handle('extraer', (value, event) => operation(event, value, (v, signal) => runtime!.cib.extraer({
    texto: typeof v.texto === 'string' ? v.texto : undefined,
    audio: v.audio && typeof v.audio === 'object' ? audioRequest(v.audio as Record<string, unknown>) : undefined,
  }, { signal })));
  handle('transcribir', (value, event) => {
    requireDevelopmentTools(developmentTools);
    return operation(event, value, (v, signal) => runtime!.cib.transcribir(audioRequest(v), { signal }));
  });
  handle('open-wav', async (_value, event) => {
    requireDevelopmentTools(developmentTools);
    const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    const options = {
      title: 'Abrir WAV para Whisper',
      filters: [{ name: 'WAV PCM 16 kHz', extensions: ['wav'] }],
      properties: ['openFile' as const],
    };
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return null;
    const bytes = new Uint8Array(fs.readFileSync(picked.filePaths[0]));
    const pcm = wavToPcm(bytes);
    return { name: path.basename(picked.filePaths[0]), audio: bytes, mimeType: 'audio/wav' as const, audioMs: pcmDurationMs(pcm.byteLength) };
  });
  handle('open-whisper-window', () => openWhisperWindow());
  handle('confirmar', value => runtime!.cib.confirmar(value));
  handle('models', () => runtime!.models());
  handle('download-models', (value, event) => operation(event, value, (_input, signal) => runtime!.downloadModels(signal)));
  handle('preload-models', async (value, event) => {
    const v = record(value);
    const id = text(v.requestId, 'Solicitud', 100);
    const raw = Array.isArray(v.capabilities) ? v.capabilities : [];
    const capabilities = raw.filter((c): c is 'stt' | 'llm' => c === 'stt' || c === 'llm');
    preloadSenders.set(id, event.sender);
    try { return await runtime!.warm(capabilities.length ? capabilities : ['stt']); }
    finally { preloadSenders.delete(id); }
  });
}
function boundsPath(name = 'window-bounds.json') {
  return path.join(app.getPath('userData'), name);
}
function hardenContents(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => abortIfSender(window));
}
function allowMicrophone(window: BrowserWindow) {
  window.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) =>
    appContents(contents) && permission === 'media' && details.mediaType === 'audio' &&
    (devUrl ? origin === new URL(devUrl).origin : origin === 'file://'));
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    try {
      callback(appContents(contents) && permission === 'media' && trustedUrl(contents.getURL()) &&
        'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio');
    } catch { callback(false); }
  });
}
async function loadRenderer(window: BrowserWindow, hash?: string) {
  if (devUrl) {
    if (devUrl !== 'http://127.0.0.1:5187') throw new Error('Unexpected development URL');
    await window.loadURL(hash ? `${devUrl}#${hash}` : devUrl);
  } else if (hash) await window.loadFile(filePath, { hash });
  else await window.loadFile(filePath);
}
function restoreWhisperBounds() {
  try {
    const raw = JSON.parse(fs.readFileSync(boundsPath('whisper-window-bounds.json'), 'utf8')) as { x: number; y: number; width: number; height: number };
    const area = screen.getDisplayMatching(raw).workArea;
    if (raw.width >= 640 && raw.height >= 520
      && raw.x < area.x + area.width - 80
      && raw.y < area.y + area.height - 80
      && raw.x + raw.width > area.x + 80) return raw;
  } catch { /* primera vez */ }
  return { width: 920, height: 720 };
}
async function openWhisperWindow() {
  requireDevelopmentTools(developmentTools);
  if (liveContents(whisperWindow) && whisperWindow) { whisperWindow.show(); whisperWindow.focus(); return; }
  const window = new BrowserWindow({
    ...restoreWhisperBounds(),
    minWidth: 640, minHeight: 520, show: false,
    title: 'Velocidad de Whisper',
    backgroundColor: '#0c1114',
    parent: mainWindow ?? undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      devTools: developmentTools, additionalArguments: developmentTools ? ['--philips-development-tools'] : [] },
  });
  whisperWindow = window;
  window.on('close', () => abortIfSender(window));
  window.on('closed', () => { whisperWindow = null; });
  const persist = () => {
    if (window.isDestroyed() || window.isMinimized()) return;
    try { fs.writeFileSync(boundsPath('whisper-window-bounds.json'), JSON.stringify(window.getBounds())); } catch { /* ignore */ }
  };
  window.on('resized', persist);
  window.on('moved', persist);
  hardenContents(window);
  allowMicrophone(window);
  await loadRenderer(window, 'whisper');
  if (window.isDestroyed()) return;
  window.show();
  window.focus();
}
function installMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    ...(developmentTools ? [{ role: 'viewMenu' as const }] : [{ label: 'Ver', submenu: [
      { role: 'reload' as const }, { role: 'forceReload' as const }, { type: 'separator' as const },
      { role: 'resetZoom' as const }, { role: 'zoomIn' as const }, { role: 'zoomOut' as const },
      { type: 'separator' as const }, { role: 'togglefullscreen' as const },
    ] }]),
    ...(developmentTools ? [{
      label: 'Herramientas',
      submenu: [
        { label: 'Velocidad de Whisper', accelerator: 'CmdOrCtrl+Shift+W', click: () => { void openWhisperWindow(); } },
      ],
    }] : []),
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function restoreBounds() {
  try {
    const raw = JSON.parse(fs.readFileSync(boundsPath(), 'utf8')) as { x: number; y: number; width: number; height: number };
    const area = screen.getDisplayMatching(raw).workArea;
    if (raw.width >= 430 && raw.height >= 640
      && raw.x < area.x + area.width - 80
      && raw.y < area.y + area.height - 80
      && raw.x + raw.width > area.x + 80) return raw;
  } catch { /* primera vez */ }
  return { width: 1240, height: 880 };
}

async function createWindow() {
  const window = new BrowserWindow({
    ...restoreBounds(),
    minWidth: 430, minHeight: 640, show: !smokeTest,
    backgroundColor: '#0c1114',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      devTools: developmentTools, additionalArguments: developmentTools ? ['--philips-development-tools'] : [] },
  });
  mainWindow = window;
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: networkAudit.record(details.url) === 'blocked' });
  });
  window.on('close', () => abortIfSender(window));
  window.on('closed', () => { mainWindow = null; });
  const persist = () => {
    if (window.isDestroyed() || window.isMinimized()) return;
    try { fs.writeFileSync(boundsPath(), JSON.stringify(window.getBounds())); } catch { /* ignore */ }
  };
  window.on('resized', persist);
  window.on('moved', persist);
  hardenContents(window);
  allowMicrophone(window);
  await loadRenderer(window);
  if (window.isDestroyed()) return;
  if (!smokeTest) {
    window.show();
    window.focus();
  }
  if (smokeTest) {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (expression: string) => {
      for (let i = 0; i < 80; i++) { if (await window.webContents.executeJavaScript(expression)) return; await delay(100); }
      throw new Error('Smoke timeout: ' + expression);
    };
    await waitFor("!!document.querySelector('[data-testid=cib-nav-captura]')");
    await window.webContents.executeJavaScript("document.querySelector('[data-testid=cib-nav-captura]').click()");
    await waitFor("!!document.querySelector('[data-testid=cib-texto]')");
    const screenshotDir = path.join(__dirname, '../reports');
    fs.mkdirSync(screenshotDir, { recursive: true });
    fs.writeFileSync(path.join(screenshotDir, 'review-desktop.png'), (await window.webContents.capturePage()).toPNG());
    const result = await window.webContents.executeJavaScript(`(async () => {
      const status = await window.philips.status();
      const list = await window.philips.list();
      return { nodeExposed: typeof window.require !== 'undefined', mode: status.data?.mode, modelsEnabled: status.data?.modelsEnabled, sites: list.data?.sites.length };
    })()`);
    if (result.nodeExposed || result.mode !== 'qvac' || result.modelsEnabled || result.sites !== 0) throw new Error('IPC/UI smoke failed');
    const diagnosticExposure = await window.webContents.executeJavaScript(`({
      enabled: window.philips.developmentTools,
      api: typeof window.philips.openWhisperWindow !== 'undefined' || typeof window.philips.transcribir !== 'undefined' || typeof window.philips.openWav !== 'undefined',
      timers: !!document.querySelector('.pipeline-tiempos, .pipeline-cargas'),
      button: document.body.innerText.includes('Medir velocidad de Whisper'),
      pipeline: !!document.querySelector('.pipeline')
    })`);
    if (diagnosticExposure.enabled || diagnosticExposure.api || diagnosticExposure.timers || diagnosticExposure.button || !diagnosticExposure.pipeline) throw new Error('Development tools leaked into production');
    await window.loadFile(filePath, { hash: 'whisper' });
    await waitFor("!!document.querySelector('[data-testid=cib-nav-captura]')");
    await window.webContents.executeJavaScript("document.querySelector('[data-testid=cib-nav-hospitales]').click()");
    await delay(200);
    fs.writeFileSync(path.join(screenshotDir, 'profile-desktop.png'), (await window.webContents.capturePage()).toPNG());
    window.setSize(430, 900);
    await delay(200);
    const overflow = await window.webContents.executeJavaScript('document.documentElement.scrollWidth > window.innerWidth');
    if (overflow) throw new Error('Mobile overflow');
    fs.writeFileSync(path.join(screenshotDir, 'profile-mobile.png'), (await window.webContents.capturePage()).toPNG());
    console.log('Electron smoke: cib-ui + QVAC runtime (models off) + SQLite empty + Node isolated.');
    app.quit();
  }
}
const timeout = smokeTest ? setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 45000) : undefined;
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  active?.controller.abort();
  preloadSenders.clear();
  void runtime?.close().catch(error => console.error('Shutdown:', error.message)).finally(() => { if (timeout) clearTimeout(timeout); app.quit(); });
});
app.whenReady().then(async () => {
  runtime = createRuntime(smokeTest ? ':memory:' : path.join(app.getPath('userData'), 'philips-visits.sqlite'),
    smokeTest ? {} : process.env,
    message => {
      if (quitting) return;
      if (active) sendProgress(active.sender, active.id, message);
      for (const [requestId, sender] of preloadSenders) {
        if (sender !== active?.sender) sendProgress(sender, requestId, message);
      }
    },
    !smokeTest);
  if (!smokeTest) installMenu();
  setupHandlers(); await createWindow();
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || smokeTest) app.quit(); });
app.on('activate', () => { if (!mainWindow) void createWindow(); });

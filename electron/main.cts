import './hide-bare-console';
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createRuntime } from '../src/bootstrap/desktop';
import { InferenceError } from '../src/application/ports/inference-engine';
import { text, record, invalid } from '../src/application/validation';
import type { ProcessVisitInput, ReviewInput } from '../src/application/visits';
import type { Result } from '../src/application/desktop-api';

const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest) {
  const smokeData = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'philips-smoke-'));
  app.setPath('userData', smokeData);
  app.disableHardwareAcceleration();
}
const devUrl = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;
let runtime: ReturnType<typeof createRuntime> | undefined;
let active: { id: string; controller: AbortController } | undefined;
let quitting = false;
const filePath = path.join(__dirname, '../dist/index.html');
const trustedUrl = (url: string) => devUrl ? url === devUrl || url === devUrl + '/' : url === require('node:url').pathToFileURL(filePath).href;

function trusted(event: IpcMainInvokeEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !trustedUrl(event.senderFrame.url)) invalid('Origen no autorizado.');
}
function handle(channel: string, action: (value: unknown) => unknown) {
  ipcMain.handle('philips:' + channel, async (event, value): Promise<Result<unknown>> => {
    try { trusted(event); return { ok: true, data: await action(value) }; }
    catch (error) { return { ok: false, error: error instanceof InferenceError ? { code: error.code, message: error.message } : { code: 'UNAVAILABLE', message: 'No se pudo completar la operación local. Inténtalo de nuevo.' } }; }
  });
}
async function operation(value: unknown, run: (input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>) {
  if (active) throw new InferenceError('UNAVAILABLE', 'Ya hay una operación en curso.');
  const input = record(value);
  const id = text(input.requestId, 'Solicitud', 100);
  const controller = new AbortController();
  active = { id, controller };
  try { return await run(input, controller.signal); } finally { active = undefined; }
}
function setupHandlers() {
  handle('status', () => runtime!.status);
  handle('list', () => runtime!.service.list());
  handle('profile', id => runtime!.service.getProfile(text(id, 'Hospital')));
  handle('process', value => operation(value, (v, signal) => runtime!.service.process(v.input as ProcessVisitInput, { signal })));
  handle('accept', value => runtime!.service.accept(value as ReviewInput));
  handle('follow-ups', value => operation(value, (v, signal) => runtime!.service.followUps(text(v.hospitalId, 'Hospital'), { signal })));
  handle('cancel', value => { const id = text(value, 'Solicitud'); if (active?.id === id) active.controller.abort(); });
  handle('clientes', () => runtime!.cib.clientes());
  handle('cliente', id => runtime!.cib.cliente(text(id, 'Hospital')));
  handle('geo', () => runtime!.cib.geo());
  handle('resumen', value => runtime!.cib.resumen(typeof value === 'string' && value.trim() ? value : undefined));
  handle('extraer', value => operation(value, (v, signal) => runtime!.cib.extraer({
    texto: typeof v.texto === 'string' ? v.texto : undefined,
    audio: v.audio && typeof v.audio === 'object' ? v.audio as { audio: Uint8Array; mimeType: string } : undefined,
  }, { signal })));
  handle('confirmar', value => runtime!.cib.confirmar(value));
}
async function createWindow() {
  const window = new BrowserWindow({
    width: 1240, height: 880, show: !smokeTest,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow = window;
  window.on('closed', () => { active?.controller.abort(); mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => active?.controller.abort());
  window.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) =>
    contents === window.webContents && permission === 'media' && details.mediaType === 'audio' &&
    (devUrl ? origin === new URL(devUrl).origin : origin === 'file://'));
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(contents === window.webContents && permission === 'media' && trustedUrl(contents.getURL()) &&
      'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
  if (devUrl) {
    if (devUrl !== 'http://127.0.0.1:5187') throw new Error('Unexpected development URL');
    await window.loadURL(devUrl);
  } else await window.loadFile(filePath);
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
  void runtime?.close().catch(error => console.error('Shutdown:', error.message)).finally(() => { if (timeout) clearTimeout(timeout); app.quit(); });
});
app.whenReady().then(async () => {
  runtime = createRuntime(smokeTest ? ':memory:' : path.join(app.getPath('userData'), 'philips-visits.sqlite'),
    smokeTest ? {} : process.env,
    message => { if (active) mainWindow?.webContents.send('philips:progress', { requestId: active.id, message }); });
  setupHandlers(); await createWindow();
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || smokeTest) app.quit(); });
app.on('activate', () => { if (!mainWindow) void createWindow(); });

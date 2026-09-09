import { app, BrowserWindow } from 'electron';
import path = require('node:path');

const smokeTest = process.argv.includes('--smoke-test');
const devUrl = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    show: !smokeTest,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.on('closed', () => { mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (devUrl) {
    if (devUrl !== 'http://127.0.0.1:5187') throw new Error('Unexpected development URL');
    await window.loadURL(devUrl);
  } else {
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  if (smokeTest) {
    const result = await window.webContents.executeJavaScript(`({
      title: document.querySelector('h1')?.textContent,
      nodeExposed: typeof window.require !== 'undefined'
    })`);
    if (result.title !== 'Customer Installed Base Intelligence' || result.nodeExposed) {
      throw new Error('Renderer smoke check failed: ' + JSON.stringify(result));
    }
    console.log('Electron smoke check passed: React rendered; Node isolated.');
    app.quit();
  }
}

const timeout = smokeTest ? setTimeout(() => { console.error('Electron smoke check timed out'); app.exit(1); }, 20000) : undefined;
app.on('will-quit', () => { if (timeout) clearTimeout(timeout); });
app.whenReady().then(createWindow).catch((error) => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || smokeTest) app.quit(); });
app.on('activate', () => {
  if (!mainWindow) void createWindow().catch((error) => { console.error(error); app.exit(1); });
});

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, clipboard, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { format } = require('node:util');
const squirrelEvent = process.platform === 'win32' && require('electron-squirrel-startup');
let window, tray, desktop, envPath, configModule, quitting = false, restarting = false;
const logs = [];
for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    logs.push(`[${new Date().toLocaleTimeString()}] ${format(...args)}`);
    if (logs.length > 500) logs.shift();
  };
}
function showWindow() { if (window) { window.show(); window.focus(); } }
async function startClient() {
  const { startDesktop } = await import(pathToFileURL(path.join(__dirname, '../dist/desktop.js')).href);
  const settings = configModule.loadConfig(envPath);
  desktop = startDesktop(settings, false, async text => {
    clipboard.writeText(text);
    if (clipboard.readText() !== text) throw new Error('Clipboard verification failed');
  });
}
if (squirrelEvent || !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.squirrel.MeowLingo.MeowLingo');
    envPath = path.join(app.getPath('userData'), '.env');
    if (!fs.existsSync(envPath)) fs.copyFileSync(app.isPackaged ? path.join(process.resourcesPath, '.env.example') : path.join(__dirname, '../.env.example'), envPath);
    fs.chmodSync(envPath, 0o600);
    process.env.MEOWLINGO_ENV_FILE = envPath;
    if (app.isPackaged && process.platform === 'darwin') process.env.MEOWLINGO_MAC_HELPER = path.join(process.resourcesPath, 'meowlingo-game-input');
    configModule = await import(pathToFileURL(path.join(__dirname, '../dist/config.js')).href);
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets/tray.png')).resize({ width: 20, height: 20 }));
    tray.setToolTip('MeowLingo');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open MeowLingo', click: showWindow }, { label: 'Quit', click: () => app.quit() }]));
    tray.on('click', showWindow);
    window = new BrowserWindow({ width: 860, height: 700, minWidth: 600, minHeight: 500, title: 'MeowLingo',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
    await window.loadFile(path.join(__dirname, 'index.html'));
    try { await startClient(); } catch (error) { console.error('Client startup failed:', error.message); }
  }).catch(error => { dialog.showErrorBox('MeowLingo startup failed', error.message); app.quit(); });
  app.on('activate', showWindow);
  app.on('window-all-closed', () => {});
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true;
    Promise.resolve(desktop?.stop()).catch(error => console.error(error.message)).finally(() => app.quit());
  });
}
ipcMain.handle('snapshot', () => ({ logs, clients: desktop?.server.clients.size ?? 0, running: !!desktop?.server.address(), envPath }));
ipcMain.handle('settings', () => {
  const settings = configModule.loadConfig(envPath);
  return { TRANSLATOR_PROVIDER: settings.TRANSLATOR_PROVIDER, OPENAI_MODEL: settings.OPENAI_MODEL, OPENAI_API_KEY: settings.OPENAI_API_KEY ?? '', MEOWLINGO_PORT: String(settings.MEOWLINGO_PORT), MEOWLINGO_LOG_DIR: settings.MEOWLINGO_LOG_DIR, MEOWLINGO_HISTORY_COUNT: String(settings.MEOWLINGO_HISTORY_COUNT), MEOWLINGO_AUTO_SEND: String(settings.MEOWLINGO_AUTO_SEND) };
});
ipcMain.handle('save-settings', async (_event, values) => {
  if (restarting) throw new Error('Client restart already in progress');
  const allowed = ['TRANSLATOR_PROVIDER', 'OPENAI_MODEL', 'OPENAI_API_KEY', 'MEOWLINGO_PORT', 'MEOWLINGO_LOG_DIR', 'MEOWLINGO_HISTORY_COUNT', 'MEOWLINGO_AUTO_SEND'];
  const dotenv = await import('dotenv');
  const settings = dotenv.parse(fs.readFileSync(envPath));
  for (const key of allowed) { if (typeof values?.[key] !== 'string' || /[\r\n]/.test(values[key])) throw new Error('Invalid setting'); settings[key] = values[key]; }
  configModule.configSchema.parse(settings);
  const text = Object.entries(settings).map(([key, value]) => `${key}=${value.includes("'") ? (value.includes('`') ? (() => { throw new Error('Setting contains unsupported quote characters'); })() : '`' + value + '`') : "'" + value + "'"}`).join('\n') + '\n';
  fs.writeFileSync(envPath, text, { mode: 0o600 });
  restarting = true;
  try { await desktop?.stop(); desktop = undefined; await startClient(); } finally { restarting = false; }
});
ipcMain.handle('open-config', () => shell.showItemInFolder(envPath));

const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, clipboard, dialog, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { format } = require('node:util');
const squirrelEvent = process.platform === 'win32' && require('electron-squirrel-startup');
let window, tray, desktop, configPath, configModule, quitting = false, restarting = false;
const logs = [];
for (const level of ['log', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    logs.push(`[${new Date().toLocaleTimeString()}] ${format(...args)}`);
    if (logs.length > 500) logs.shift();
  };
}
let permissionStatus = { trusted: false, message: '' };
function accessibilityTrusted() {
  return process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false);
}
async function requestAccessibility() {
  if (process.platform !== 'darwin') return;
  try {
    const native = await import(pathToFileURL(path.join(__dirname, '../dist/zomboid/macGameInput.js')).href);
    permissionStatus = { ...native.macInputPermissions(true), message: '' };
  } catch (error) { permissionStatus = { trusted: false, message: 'Could not load macOS input module: ' + error.message }; }
}
function showWindow() { if (window) { window.show(); window.focus(); } }
async function startClient() {
  const { startDesktop } = await import(pathToFileURL(path.join(__dirname, '../dist/desktop.js')).href);
  const settings = configModule.loadConfig(configPath);
  const { createVerifiedClipboardCopy, copyText } = await import(pathToFileURL(path.join(__dirname, '../dist/clipboard/clipboard.js')).href);
  desktop = startDesktop(settings, false, process.platform === 'darwin' ? copyText : createVerifiedClipboardCopy(clipboard), path.dirname(configPath));
}
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('userData'), 'development'));
if (squirrelEvent || !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.squirrel.MeowLingo.MeowLingo');
    if (process.platform === 'darwin') app.dock?.setIcon(path.join(__dirname, 'assets/icon.png'));
    configPath = app.isPackaged ? path.join(app.getPath('userData'), 'config.json') :
      (process.env.MEOWLINGO_CONFIG_FILE || path.join(__dirname, '../config.json'));
    process.env.MEOWLINGO_CONFIG_FILE = configPath;
    configModule = await import(pathToFileURL(path.join(__dirname, '../dist/config.js')).href);
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets/tray.png')).resize({ width: 20, height: 20 }));
    tray.setToolTip('MeowLingo');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open MeowLingo', click: showWindow }, { label: 'Quit', click: () => app.quit() }]));
    tray.on('click', showWindow);
    window = new BrowserWindow({ width: 860, height: 700, minWidth: 600, minHeight: 500, title: 'MeowLingo', icon: path.join(__dirname, 'assets/icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
    await window.loadFile(path.join(__dirname, 'index.html'));
    if (configModule.loadConfig(configPath).MEOWLINGO_AUTO_SEND) void requestAccessibility();
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
ipcMain.handle('snapshot', () => {
  return ({ version: app.getVersion(), logs, clients: desktop?.server.clients.size ?? 0, running: !!desktop?.server.address(), accessibilityTrusted: accessibilityTrusted(), requiresAccessibility: process.platform === 'darwin', permissionMessage: permissionStatus.message, configPath });
});
ipcMain.handle('settings', () => {
  const settings = configModule.loadConfig(configPath);
  return { TRANSLATOR_PROVIDER: settings.TRANSLATOR_PROVIDER, OPENAI_MODEL: settings.OPENAI_MODEL, OPENAI_API_KEY: settings.OPENAI_API_KEY ?? '', MEOWLINGO_PORT: String(settings.MEOWLINGO_PORT), MEOWLINGO_LOG_DIR: settings.MEOWLINGO_LOG_DIR, MEOWLINGO_HISTORY_COUNT: String(settings.MEOWLINGO_HISTORY_COUNT), MEOWLINGO_INPUT_MODE: settings.MEOWLINGO_INPUT_MODE, MEOWLINGO_AUTO_SEND: String(settings.MEOWLINGO_AUTO_SEND), instructions: settings.instructions };
});
ipcMain.handle('save-settings', async (_event, values) => {
  if (restarting) throw new Error('Client restart already in progress');
  const allowed = ['TRANSLATOR_PROVIDER', 'OPENAI_MODEL', 'OPENAI_API_KEY', 'MEOWLINGO_PORT', 'MEOWLINGO_LOG_DIR', 'MEOWLINGO_HISTORY_COUNT', 'MEOWLINGO_AUTO_SEND', 'MEOWLINGO_INPUT_MODE', 'instructions'];
  const settings = configModule.loadConfig(configPath);
  for (const key of allowed) {
    if (typeof values?.[key] !== 'string' || (key !== 'instructions' && /[\r\n]/.test(values[key]))) throw new Error('Invalid setting');
    settings[key] = values[key];
  }
  const saved = configModule.saveConfig(configPath, settings);
  if (saved.MEOWLINGO_AUTO_SEND) void requestAccessibility();
  restarting = true;
  try { await desktop?.stop(); desktop = undefined; await startClient(); } finally { restarting = false; }
});
ipcMain.handle('open-config', () => shell.showItemInFolder(configPath));

ipcMain.handle('accessibility-settings', async () => {
  if (process.platform !== 'darwin') return;
  void requestAccessibility();
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
});

ipcMain.handle('clear-translation-cache', () => {
  if (restarting || !desktop) throw new Error('Client is not ready. Try again shortly.');
  desktop.clearTranslationCache();
});

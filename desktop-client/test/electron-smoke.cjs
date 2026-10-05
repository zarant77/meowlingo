const { app, BrowserWindow, systemPreferences, clipboard } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'meowlingo-electron-smoke-'));
app.setPath('userData', profile);
process.env.MEOWLINGO_CONFIG_FILE = path.join(profile, 'config.json');
let permissionGranted = false;
if (process.platform === 'darwin') systemPreferences.isTrustedAccessibilityClient = () => permissionGranted;
const probe = net.createServer();
probe.listen(0, '127.0.0.1', () => {
  const port = probe.address().port;
  probe.close(() => {
    fs.writeFileSync(path.join(profile, '.env'), `MEOWLINGO_PORT=${port}\nMEOWLINGO_DISCOVERY=false\nMEOWLINGO_AUTO_SEND=false\nMEOWLINGO_LOG_DIR='${profile}'\nTRANSLATOR_PROVIDER=mock\n`);
    require('../electron/main.cjs');
    setTimeout(async () => {
      try {
        let window;
        for (let attempt = 0; attempt < 100; attempt++) {
          window = BrowserWindow.getAllWindows()[0];
          if (window) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert(window);
        const initial = await window.webContents.executeJavaScript('window.meowlingo.snapshot()');
        assert(initial.running); assert.equal(initial.clients, 0);
        if (process.platform === 'darwin') {
          assert.equal(initial.accessibilityTrusted, false);
          assert.equal(await window.webContents.executeJavaScript("document.getElementById('accessibility-warning').hidden"), false);
          permissionGranted = true;
          await new Promise(resolve => setTimeout(resolve, 1200));
          const permissions = await window.webContents.executeJavaScript('window.meowlingo.snapshot()');
          assert.equal(await window.webContents.executeJavaScript("document.getElementById('accessibility-warning').hidden"), permissions.accessibilityTrusted);
        }
        const settings = await window.webContents.executeJavaScript('window.meowlingo.settings()');
        assert.equal(settings.TRANSLATOR_PROVIDER, 'mock');
        assert(fs.existsSync(path.join(profile, 'config.json')));
        settings.instructions = 'Custom multiline instructions\nExplain in Ukrainian.';
        settings.MEOWLINGO_INPUT_MODE = 'paste';
        settings.MEOWLINGO_HISTORY_COUNT = '22';
        await window.webContents.executeJavaScript(`window.meowlingo.save(${JSON.stringify(settings)})`);
        const saved = await window.webContents.executeJavaScript('window.meowlingo.settings()');
        assert.equal(saved.MEOWLINGO_HISTORY_COUNT, '22');
        assert.equal(saved.instructions, settings.instructions);
        assert.equal(saved.MEOWLINGO_INPUT_MODE, 'paste');
        assert(!fs.readFileSync(path.join(profile, 'config.json'), 'utf8').includes('test-placeholder'));
        assert.equal((await window.webContents.executeJavaScript('window.meowlingo.snapshot()')).running, true);
        await window.webContents.executeJavaScript('window.meowlingo.clearTranslationCache()');
        assert(fs.existsSync(path.join(profile, 'translation-cache.sqlite')));
        assert.equal(await window.webContents.executeJavaScript("document.getElementById('clear-translation-cache').textContent"), 'Clear translation cache');
        const nativeClipboard = (await import('clipboardy')).default;
        const previousClipboard = await nativeClipboard.read();
        try {
          const WebSocket = require('ws');
          const ready = await new Promise((resolve, reject) => {
            const socket = new WebSocket(`ws://127.0.0.1:${port}`);
            const timeout = setTimeout(() => { socket.terminate(); reject(new Error('Clipboard reply timed out')); }, 5000);
            socket.on('open', () => socket.send(JSON.stringify({type:'reply', id:require('node:crypto').randomUUID(), channel:'Local', text:'MeowLingo clipboard check'})));
            socket.on('error', error => { clearTimeout(timeout); reject(error); });
            socket.on('message', raw => {
              const message = JSON.parse(raw.toString());
              if (message.type === 'reply_ready') { clearTimeout(timeout); socket.close(); resolve(message); }
            });
          });
          assert.equal(ready.copiedToClipboard, true);
        } finally { await nativeClipboard.write(previousClipboard); }
        window.close(); assert.equal(window.isDestroyed(), false); assert.equal(window.isVisible(), false);
        console.log('Electron smoke passed: window, status, settings reload, client restart, close-to-tray.');
        app.quit();
      } catch (error) { console.error(error); app.exit(1); }
    }, 3000);
  });
});
app.on('quit', () => fs.rmSync(profile, {recursive:true,force:true}));
setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 20000).unref();

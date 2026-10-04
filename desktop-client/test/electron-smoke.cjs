const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'meowlingo-electron-smoke-'));
app.setPath('userData', profile);
const probe = net.createServer();
probe.listen(0, '127.0.0.1', () => {
  const port = probe.address().port;
  probe.close(() => {
    fs.writeFileSync(path.join(profile, '.env'), `MEOWLINGO_PORT=${port}\nMEOWLINGO_DISCOVERY=false\nMEOWLINGO_AUTO_SEND=false\nMEOWLINGO_LOG_DIR='${profile}'\nTRANSLATOR_PROVIDER=mock\n`);
    require('../electron/main.cjs');
    setTimeout(async () => {
      try {
        const window = BrowserWindow.getAllWindows()[0]; assert(window);
        const initial = await window.webContents.executeJavaScript('window.meowlingo.snapshot()');
        assert(initial.running); assert.equal(initial.clients, 0);
        const settings = await window.webContents.executeJavaScript('window.meowlingo.settings()');
        assert.equal(settings.TRANSLATOR_PROVIDER, 'mock');
        settings.MEOWLINGO_HISTORY_COUNT = '22';
        await window.webContents.executeJavaScript(`window.meowlingo.save(${JSON.stringify(settings)})`);
        const saved = await window.webContents.executeJavaScript('window.meowlingo.settings()');
        assert.equal(saved.MEOWLINGO_HISTORY_COUNT, '22');
        assert.equal((await window.webContents.executeJavaScript('window.meowlingo.snapshot()')).running, true);
        window.close(); assert.equal(window.isDestroyed(), false); assert.equal(window.isVisible(), false);
        console.log('Electron smoke passed: window, status, settings reload, client restart, close-to-tray.');
        app.quit();
      } catch (error) { console.error(error); app.exit(1); }
    }, 3000);
  });
});
app.on('quit', () => fs.rmSync(profile, {recursive:true,force:true}));
setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 20000).unref();

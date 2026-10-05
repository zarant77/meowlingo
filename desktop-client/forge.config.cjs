const path = require('node:path');
module.exports = {
  packagerConfig: {
    icon: path.resolve('electron/assets/icon'),
    name: 'MeowLingo', executableName: 'MeowLingo', appBundleId: 'com.catemup.meowlingo.desktop',
    asar: { unpack: '**/node_modules/clipboardy/fallbacks/**' },
    extraResource: [...(process.platform === 'darwin' ? [path.resolve('native/meowlingo-game-input')] : [])],
    ignore: [/^\/translation-cache\.sqlite(?:-.*)?$/, /^\/(src|test|scripts|native|out)(\/|$)/, /^\/config\.json(?:\.tmp)?$/, /^\/\.env$/, /^\/\.env\.(?!example)/, /^\/forge\.config\.cjs$/],
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'MeowLingo', setupExe: 'MeowLingo-Setup.exe', setupIcon: path.resolve('electron/assets/icon.ico') } },
  ],
};

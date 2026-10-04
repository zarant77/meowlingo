const path = require('node:path');
module.exports = {
  packagerConfig: {
    icon: path.resolve('electron/assets/icon'),
    name: 'MeowLingo', executableName: 'MeowLingo', appBundleId: 'com.catemup.meowlingo.desktop',
    asar: { unpack: '**/node_modules/clipboardy/fallbacks/**' },
    extraResource: [path.resolve('.env.example'), ...(process.platform === 'darwin' ? [path.resolve('native/meowlingo-game-input')] : [])],
    ignore: [/^\/(src|test|scripts|native|out)(\/|$)/, /^\/\.env$/, /^\/\.env\.(?!example)/, /^\/forge\.config\.cjs$/],
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'MeowLingo', setupExe: 'MeowLingo-Setup.exe' } },
  ],
};

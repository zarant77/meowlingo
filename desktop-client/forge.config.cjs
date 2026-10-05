const path = require('node:path');
const signingIdentity = process.env.MAC_SIGNING_IDENTITY;
const notarization = process.env.APPLE_API_KEY_PATH ? {
  appleApiKey: process.env.APPLE_API_KEY_PATH, appleApiKeyId: process.env.APPLE_API_KEY_ID, appleApiIssuer: process.env.APPLE_API_ISSUER,
} : undefined;
if (notarization && (!signingIdentity || !notarization.appleApiKeyId || !notarization.appleApiIssuer)) throw new Error('Incomplete macOS signing/notarization configuration.');
module.exports = {
  packagerConfig: {
    icon: path.resolve('electron/assets/icon'),
    name: 'MeowLingo', executableName: 'MeowLingo', appBundleId: 'com.catemup.meowlingo.desktop',
    asar: { unpack: '{**/node_modules/clipboardy/fallbacks/**,**/native/*.node}' },
    ...(process.platform === 'darwin' ? {
      osxSign: { identity: signingIdentity || '-', identityValidation: !!signingIdentity,
        preAutoEntitlements: false, keychain: process.env.MAC_SIGNING_KEYCHAIN,
        optionsForFile: () => ({ hardenedRuntime: true, entitlements: path.resolve(signingIdentity ? 'electron/entitlements/mac.plist' : 'electron/entitlements/mac-adhoc.plist') }),
      },
      ...(notarization ? { osxNotarize: notarization } : {}),
    } : {}),
    ignore: [/^\/translation-cache\.sqlite(?:-.*)?$/, /^\/(src|test|scripts|native-source|out)(\/|$)/, /^\/config\.json(?:\.tmp)?$/, /^\/\.env$/, /^\/\.env\.(?!example)/, /^\/forge\.config\.cjs$/, /^\/native\/(GameInput\.swift|ModuleCache|meowlingo-game-input.*)(\/|$)/],
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'MeowLingo', setupExe: 'MeowLingo-Setup.exe', setupIcon: path.resolve('electron/assets/icon.ico') } },
  ],
};

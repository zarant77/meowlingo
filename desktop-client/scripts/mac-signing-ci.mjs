import { execFileSync } from 'node:child_process';
import { writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.env.RUNNER_TEMP;
if (!directory) throw new Error('This script is intended for GitHub Actions.');
const keychain = join(directory, 'meowlingo-signing.keychain-db');
const certificate = join(directory, 'meowlingo-signing.p12');
const key = join(directory, 'meowlingo-notary.p8');
if (process.argv.includes('--cleanup')) {
  try { execFileSync('security', ['delete-keychain', keychain], { stdio: 'ignore' }); } catch {}
  for (const file of [certificate, key]) rmSync(file, { force: true });
} else if (!process.env.MAC_CERTIFICATE_BASE64) {
  if (process.env.MAC_SIGNING_IDENTITY || process.env.APPLE_API_KEY_BASE64) throw new Error('Incomplete macOS signing secrets.');
  console.log('::warning::No Developer ID credentials configured; building ad-hoc signed apps without notarization.');
} else {
  for (const name of ['MAC_CERTIFICATE_PASSWORD', 'MAC_SIGNING_IDENTITY', 'APPLE_API_KEY_BASE64', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
    if (!process.env[name]) throw new Error(`Missing ${name}.`);
  }
  writeFileSync(certificate, Buffer.from(process.env.MAC_CERTIFICATE_BASE64, 'base64'), { mode: 0o600 });
  writeFileSync(key, Buffer.from(process.env.APPLE_API_KEY_BASE64, 'base64'), { mode: 0o600 });
  const password = process.env.MAC_CERTIFICATE_PASSWORD;
  const run = args => {
    try { execFileSync('security', args, { stdio: 'ignore' }); }
    catch { throw new Error(`Keychain operation failed: ${args[0]}. Credentials were not logged.`); }
  };
  run(['create-keychain', '-p', password, keychain]);
  run(['set-keychain-settings', '-lut', '21600', keychain]);
  run(['unlock-keychain', '-p', password, keychain]);
  run(['import', certificate, '-k', keychain, '-P', password, '-T', '/usr/bin/codesign']);
  run(['set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain]);
  run(['list-keychains', '-d', 'user', '-s', keychain, join(process.env.HOME, 'Library/Keychains/login.keychain-db')]);
  appendFileSync(process.env.GITHUB_ENV, `MAC_SIGNING_KEYCHAIN=${keychain}\nAPPLE_API_KEY_PATH=${key}\n`);
  rmSync(certificate, { force: true });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, copyFile, writeFile, symlink, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));
const options = { skip: process.platform === 'win32' };
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'meowlingo-launcher-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'desktop-client'));
  await mkdir(join(directory, 'android-app'));
  const sdk = join(directory, 'sdk'); await mkdir(join(sdk, 'platform-tools'), { recursive: true });
  await copyFile(join(root, 'desktop-client', 'config.example.json'), join(directory, 'desktop-client', 'config.example.json'));
  await copyFile(join(root, 'launch.mjs'), join(directory, 'launch.mjs'));
  await symlink(join(root, 'desktop-client', 'node_modules'), join(directory, 'desktop-client', 'node_modules'));
  await writeFile(join(directory, 'desktop-client', '.env'), 'MEOWLINGO_PORT="9100"\nMEOWLINGO_HOST=0.0.0.0\n');
  await writeFile(join(directory, 'android-app', 'local.properties'), `sdk.dir=${sdk}\n`);
  const log = join(directory, 'adb-calls.jsonl');
  await writeFile(join(sdk, 'platform-tools', 'adb'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_ADB_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'devices') console.log('List of devices attached\\nUSB123\\tdevice\\n');
else if (args.includes('get-devpath')) console.log(process.env.FAKE_DEVICE_PATH || 'usb:1-2');
else if (args.includes('pm')) console.log(process.env.FAKE_PACKAGE_MISSING ? '' : 'package:/data/app/meowlingo.apk');
else if (args.includes('reverse') && process.env.FAKE_REVERSE_FAIL) process.exit(1);
`, { mode: 0o755 });
  const env = { ...process.env, FAKE_ADB_LOG: log };
  delete env.MEOWLINGO_PORT; delete env.MEOWLINGO_HOST;
  Object.assign(env, overrides);
  const run = (...args) => exec(process.execPath, [join(directory, 'launch.mjs'), ...args], { env });
  const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  return { run, calls };
}

test('USB connection uses the configured port and selected device before launching Android', options, async t => {
  const app = await fixture(t);
  await app.run('usb-connect', '--device', 'USB123');
  const calls = await app.calls();
  const reverse = calls.find(args => args.includes('reverse'));
  assert.deepEqual(reverse, ['-s', 'USB123', 'reverse', 'tcp:9100', 'tcp:9100']);
  const launch = calls.find(args => args.includes('am'));
  assert.deepEqual(launch.slice(-3), ['--ei', 'meowlingo.usbPort', '9100']);
  assert(calls.indexOf(reverse) < calls.indexOf(launch));
});
test('environment port overrides the dotenv value for the USB tunnel', options, async t => {
  const app = await fixture(t, { MEOWLINGO_PORT: '9200' });
  await app.run('usb-connect');
  assert((await app.calls()).some(args => args.includes('tcp:9200')));
});
test('wireless adb is rejected before installing a USB tunnel', options, async t => {
  const app = await fixture(t, { FAKE_DEVICE_PATH: 'tcp:192.168.1.42:5555' });
  await assert.rejects(app.run('usb-connect'), /not connected by USB/);
  assert(!(await app.calls()).some(args => args.includes('reverse')));
});
test('failed forwarding does not launch Android into a broken connection', options, async t => {
  const app = await fixture(t, { FAKE_REVERSE_FAIL: '1' });
  await assert.rejects(app.run('usb-connect'), /exit code 1/);
  assert(!(await app.calls()).some(args => args.includes('am')));
});
test('disconnect removes only the configured tunnel and pauses Android auto-connect', options, async t => {
  const app = await fixture(t);
  await app.run('usb-disconnect');
  const calls = await app.calls();
  assert(calls.some(args => args.slice(-3).join(' ') === '--ez meowlingo.disconnect true'));
  assert(calls.some(args => args.slice(-3).join(' ') === 'reverse --remove tcp:9100'));
  assert(!calls.some(args => args.includes('--remove-all')));
});
test('USB connect gives an actionable error when the Android app is not installed', options, async t => {
  const app = await fixture(t, { FAKE_PACKAGE_MISSING: '1' });
  await assert.rejects(app.run('usb-connect'), /MeowLingo is not installed/);
  assert(!(await app.calls()).some(args => args.includes('reverse')));
});

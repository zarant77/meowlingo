#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, networkInterfaces } from 'node:os';
import { createInterface } from 'node:readline/promises';

const root = dirname(fileURLToPath(import.meta.url));
const desktop = join(root, 'desktop-client');
const android = join(root, 'android-app');
const windows = process.platform === 'win32';
const argv = process.argv.slice(2);
const serialIndex = argv.indexOf('--device');
let serial;
if (serialIndex !== -1) {
  serial = argv[serialIndex + 1];
  if (!serial || !/^[\w.:_-]+$/.test(serial)) {
    console.error('Specify a serial number from adb devices after --device.');
    process.exit(1);
  }
  argv.splice(serialIndex, 2);
}
if (argv.length > 1) { console.error('Specify one command. Usage: node launch.mjs help'); process.exit(1); }

async function exists(path) { try { await access(path, constants.F_OK); return true; } catch { return false; } }
function run(command, args = [], cwd = root, capture = false) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    // Only fixed npm/Gradle commands need cmd.exe on Windows; adb arguments bypass the shell.
    const child = spawn(command, args, { cwd, shell: windows && /\.(cmd|bat)$/.test(command), stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit' });
    let output = '';
    if (capture) child.stdout.on('data', data => { output += data; });
    child.on('error', error => reject(new Error(`Failed to start ${command}: ${error.message}`)));
    child.on('exit', (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command}: ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}
const npm = (...args) => run(windows ? 'npm.cmd' : 'npm', args, desktop);
const gradle = (...args) => run(windows ? 'gradlew.bat' : './gradlew', args, android);

async function sdkDirectory() {
  const local = join(android, 'local.properties');
  if (await exists(local)) {
    const text = await readFile(local, 'utf8');
    const value = text.match(/^\s*sdk\.dir\s*=\s*(.+)$/m)?.[1]?.trim();
    if (value) return value.replace(/\\([\\: =])/g, '$1');
  }
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    (windows ? join(process.env.LOCALAPPDATA || homedir(), 'Android', 'Sdk') :
      process.platform === 'darwin' ? join(homedir(), 'Library', 'Android', 'sdk') : join(homedir(), 'Android', 'Sdk'));
}
async function adbPath() {
  const candidate = join(await sdkDirectory(), 'platform-tools', windows ? 'adb.exe' : 'adb');
  return await exists(candidate) ? candidate : 'adb';
}
async function devices() {
  const output = await run(await adbPath(), ['devices'], root, true);
  console.log(output.trim());
  return output.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(parts => parts[1] === 'device').map(parts => parts[0]);
}
async function targetDevice() {
  const available = await devices();
  if (serial) {
    if (!available.includes(serial)) throw new Error(`Device ${serial} is unavailable. Check USB debugging and authorize access on your phone.`);
    return serial;
  }
  if (!available.length) throw new Error('No Android devices are ready. Connect a phone with USB debugging enabled or start an emulator.');
  if (available.length > 1) throw new Error('Multiple devices are connected. Specify --device SERIAL (see the devices command).');
  return available[0];
}
async function ensureDesktop() {
  if (!await exists(join(desktop, 'node_modules', 'tsx', 'package.json'))) await npm('ci');
  if (!await exists(join(desktop, 'config.json'))) {
    const example = JSON.parse(await readFile(join(desktop, 'config.example.json'), 'utf8'));
    const require = createRequire(join(desktop, 'package.json'));
    const legacy = await exists(join(desktop, '.env')) ? require('dotenv').parse(await readFile(join(desktop, '.env'))) : {};
    await writeFile(join(desktop, 'config.json'), JSON.stringify({ ...example, ...legacy }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log('Created desktop-client/config.json. Configure it in desktop Settings.');
  }
}
function addresses() {
  console.log('\nAndroid emulator address: ws://10.0.2.2:8765');
  for (const entries of Object.values(networkInterfaces())) for (const item of entries || []) {
    if (item.family === 'IPv4' && !item.internal) console.log(`Phone address on your local network: ws://${item.address}:8765`);
  }
  console.log('If MEOWLINGO_PORT is changed in config.json, use that port instead. Press Ctrl+C to stop the desktop client.');
}
async function install(open = false, selectedTarget) {
  const target = selectedTarget ?? await targetDevice();
  await gradle('assembleDebug');
  await run(await adbPath(), ['-s', target, 'install', '-r', join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')]);
  if (open) await run(await adbPath(), ['-s', target, 'shell', 'am', 'start', '-n', 'com.catemup.meowlingo/.MainActivity']);
}
async function desktopPort() {
  const require = createRequire(join(desktop, 'package.json'));
  const { parse } = require('dotenv');
  const values = await exists(join(desktop, 'config.json'))
    ? JSON.parse(await readFile(join(desktop, 'config.json'), 'utf8'))
    : parse(await readFile(join(desktop, '.env')));
  const port = Number(process.env.MEOWLINGO_PORT ?? values.MEOWLINGO_PORT ?? 8765);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MEOWLINGO_PORT must be an integer from 1 to 65535.');
  const host = process.env.MEOWLINGO_HOST ?? values.MEOWLINGO_HOST ?? '0.0.0.0';
  if (!['0.0.0.0', '::', '127.0.0.1', 'localhost'].includes(host)) {
    throw new Error('USB forwarding requires a desktop listener accessible through localhost. Set MEOWLINGO_HOST=0.0.0.0 or 127.0.0.1.');
  }
  return port;
}
async function usbTarget() {
  const target = await targetDevice();
  const path = (await run(await adbPath(), ['-s', target, 'get-devpath'], root, true)).trim();
  if (!path.startsWith('usb:') && !target.startsWith('emulator-')) {
    throw new Error('The selected device is not connected by USB. Connect a data cable and enable USB debugging.');
  }
  return target;
}
async function connectUsb(build = false) {
  await ensureDesktop();
  const port = await desktopPort();
  const target = await usbTarget();
  if (build) await install(false, target);
  else {
    const installed = await run(await adbPath(), ['-s', target, 'shell', 'pm', 'path', 'com.catemup.meowlingo'], root, true);
    if (!installed.includes('package:')) throw new Error('MeowLingo is not installed. Run node launch.mjs usb to build and install it.');
  }
  await run(await adbPath(), ['-s', target, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  await run(await adbPath(), ['-s', target, 'shell', 'am', 'start', '-n', 'com.catemup.meowlingo/.MainActivity',
    '--ei', 'meowlingo.usbPort', String(port)]);
  console.log(`\nUSB connection ready: ws://127.0.0.1:${port}. Wi-Fi is not required.`);
  console.log('After reconnecting the cable, run usb-connect again to restore the tunnel.');
}
async function disconnectUsb() {
  await ensureDesktop();
  const port = await desktopPort();
  const target = await usbTarget();
  await run(await adbPath(), ['-s', target, 'shell', 'am', 'start', '-n', 'com.catemup.meowlingo/.MainActivity',
    '--ez', 'meowlingo.disconnect', 'true']);
  await run(await adbPath(), ['-s', target, 'reverse', '--remove', `tcp:${port}`]);
  console.log('USB tunnel removed and Android disconnected. The desktop client keeps running.');
}
const commands = {
  dev: async () => { await connectUsb(true); await npm('run', 'desktop:dev'); },
  setup: async () => { await npm('ci'); await ensureDesktop(); },
  desktop: async () => { await ensureDesktop(); addresses(); await npm('run', 'dev'); },
  mock: async () => { await ensureDesktop(); addresses(); await npm('run', 'mock:chat'); },
  build: async () => { await ensureDesktop(); await npm('run', 'build'); await gradle('assembleDebug'); },
  'desktop-build': async () => { await ensureDesktop(); await npm('run', 'desktop:make'); },
  'android-build': async () => { await gradle('assembleDebug'); console.log('\nAPK: dist/MeowLingo-android-debug.apk'); },
  install: () => install(false),
  'android-run': () => install(true),
  devices,
  usb: async () => commands.dev(),
  'usb-connect': () => connectUsb(false),
  'usb-disconnect': disconnectUsb,
  check: async () => { await ensureDesktop(); await npm('run', 'typecheck'); await npm('test'); await run(process.execPath, ['--test', join(root, 'launcher.test.mjs')]); await gradle('assembleDebug', 'testDebugUnitTest'); },
  all: async () => { await ensureDesktop(); await install(true); addresses(); await npm('run', 'dev'); },
  doctor: async () => {
    console.log(`Node: ${process.version}\nAndroid SDK: ${await sdkDirectory()}`);
    await npm('--version'); await run('java', ['-version']); await gradle('--version'); await devices();
  },
  help: async () => console.log(`MeowLingo — console launcher

node launch.mjs [command] [--device SERIAL]
Omit the command to open the interactive menu.

Main actions:
dev            Build/install Android over USB and start the desktop window with hot reload
desktop-build  Build desktop app into dist/
android-build  Build the debug APK into dist/

Utilities:
devices        List Android devices
usb-connect    Restore the USB connection without rebuilding Android
usb-disconnect Disconnect Android and remove its USB tunnel
check          Run project checks and tests
setup          Install desktop dependencies and create config.json if missing
doctor         Check Node, npm, Java, Gradle, and adb
mock           Start the desktop with mock chat
desktop        Start only the desktop in watch mode
help           Show this help

Requires Node.js 22+, JDK 17, Android SDK 36.
For dev, connect your phone with a data cable, enable USB debugging and authorize the computer.
Use --device SERIAL when multiple devices are connected.`),
};
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  if (argv.length) {
    const action = commands[argv[0]];
    if (!action) throw new Error(`Unknown command: ${argv[0]}. Use help.`);
    await action(); return;
  }
  if (!process.stdin.isTTY) { await commands.help(); return; }
  const primary = [
    ['dev', 'Start development (install Android over USB)'],
    ['desktop-build', 'Build desktop app'],
    ['android-build', 'Build Android APK'],
    ['install', 'Build and install Android APK'],
  ];
  const utilities = [
    ['devices', 'List Android devices'],
    ['usb-connect', 'Restore USB connection'],
    ['usb-disconnect', 'Disconnect USB'],
    ['check', 'Run project checks'],
    ['setup', 'Install desktop dependencies'],
    ['doctor', 'Check the environment'],
    ['mock', 'Start desktop with mock chat'],
    ['desktop', 'Start desktop only'],
  ];
  const options = [...primary, ...utilities];
  while (true) {
    console.log('\nMeowLingo\n' +
      options.map(([_, title], i) => (i === primary.length ? '--------\n' : '') + `${i + 1}. ${title}`).join('\n') +
      '\n0. Exit');
    const input = createInterface({ input: process.stdin, output: process.stdout });
    let answer;
    try { answer = (await input.question('Choose an action: ')).trim(); } finally { input.close(); }
    if (answer === '0') return;
    const option = /^\d+$/.test(answer) ? options[Number(answer) - 1] : undefined;
    if (!option) { console.log('Unknown menu option.'); continue; }
    try { await commands[option[0]](); } catch (error) { console.error(`\nError: ${error.message}`); }
  }
}
main().catch(error => { console.error(`\nError: ${error.message}`); process.exitCode = 1; });

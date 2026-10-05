import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { watch } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
execFileSync(process.execPath, [fileURLToPath(new URL('./build-native.mjs', import.meta.url))], { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit' });
const root = fileURLToPath(new URL('../', import.meta.url));
let electron;
let stopping = false;
let restarting = false;
let timer;
let restartQueue = Promise.resolve();
const watchers = [];

async function stopElectron() {
  const child = electron;
  electron = undefined;
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'exit');
    child.kill('SIGTERM');
    await closed;
  }
}
function restart() {
  if (stopping) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    restartQueue = restartQueue.then(async () => {
      if (stopping) return;
      restarting = true;
      await stopElectron();
      if (!stopping) {
        console.log('Starting MeowLingo desktop window (development)…');
        electron = spawn(require('electron'), ['.'], { cwd: root, stdio: 'inherit' });
        electron.on('error', error => { console.error(error.message); shutdown(1); });
        electron.on('exit', () => { if (!restarting && !stopping) shutdown(); });
      }
      restarting = false;
    }).catch(error => { console.error(error.message); shutdown(1); });
  }, 250);
}
const compiler = spawn(process.execPath, [require.resolve('typescript/bin/tsc'), '--watch', '--pretty', 'false',
  '--preserveWatchOutput'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
let output = '';
compiler.stdout.on('data', chunk => {
  process.stdout.write(chunk);
  output += chunk.toString();
  if (/Found 0 errors\. Watching for file changes\./.test(output)) {
    output = '';
    restart();
  } else if (output.length > 8000) output = output.slice(-4000);
});
compiler.on('error', error => { console.error(error.message); shutdown(1); });
compiler.on('exit', code => { if (!stopping) shutdown(code ?? 1); });
watchers.push(watch(new URL('../electron/', import.meta.url), { recursive: true }, restart));
watchers.push(watch(new URL('../config.example.json', import.meta.url), restart));
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  compiler.kill();
  void stopElectron().finally(() => { process.exitCode = code; });
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

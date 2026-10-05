import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
const require = createRequire(import.meta.url);
if (process.platform === 'darwin') {
  const directory = resolve('native');
  mkdirSync(directory, { recursive: true });
  const include = resolve(dirname(require.resolve('node-api-headers/package.json')), 'include');
  for (const arch of ['arm64', 'x64']) {
    execFileSync('/usr/bin/xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-fblocks', '-DNAPI_VERSION=8', '-DNODE_GYP_MODULE_NAME=game_input',
      '-arch', arch === 'x64' ? 'x86_64' : arch, '-mmacosx-version-min=13.0', '-bundle', '-undefined', 'dynamic_lookup',
      '-I', include, '-framework', 'AppKit', '-framework', 'ApplicationServices',
      resolve('native-source/game-input.mm'), '-o', resolve(directory, `game-input-${arch}.node`)], { stdio: 'inherit' });
  }
}

import { macGameInputSource } from '../dist/zomboid/macGameInput.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
if (process.platform === 'darwin') {
  const directory = resolve('native');
  await mkdir(directory, { recursive: true });
  const source = resolve(directory, 'GameInput.swift');
  await writeFile(source, macGameInputSource);
  execFileSync('/usr/bin/xcrun', ['swiftc', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos13.0`, '-O', '-module-cache-path', resolve(directory, 'ModuleCache'), source, '-o', resolve(directory, 'meowlingo-game-input')], { stdio: 'inherit' });
}

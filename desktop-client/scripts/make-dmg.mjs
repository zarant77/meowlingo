import { readdir, mkdir, cp, symlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
if (process.platform === 'darwin') {
  const directory = (await readdir('out')).find(name => name === `MeowLingo-darwin-${process.arch}`);
  if (!directory) throw new Error('Packaged macOS application not found');
  const stage = resolve('out/dmg-stage');
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await cp(resolve('out', directory, 'MeowLingo.app'), resolve(stage, 'MeowLingo.app'), { recursive: true });
  await symlink('/Applications', resolve(stage, 'Applications'));
  const output = resolve('out/make', `MeowLingo-${directory.split('-').at(-1)}.dmg`);
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'MeowLingo', '-srcfolder', stage, '-ov', '-format', 'UDZO', output], { stdio: 'inherit' });
  await rm(stage, { recursive: true, force: true });
}

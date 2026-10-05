import { readdir, mkdir, cp, symlink, rm, readlink } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import { execFileSync } from 'node:child_process';
async function verifyBundleLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() && isAbsolute(await readlink(path))) {
      throw new Error(`App bundle contains an absolute symlink: ${path}`);
    }
    if (entry.isDirectory()) await verifyBundleLinks(path);
  }
}
if (process.platform === 'darwin') {
  const directory = (await readdir('out')).find(name => name === `MeowLingo-darwin-${process.arch}`);
  if (!directory) throw new Error('Packaged macOS application not found');
  const stage = resolve('out/dmg-stage');
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await cp(resolve('out', directory, 'MeowLingo.app'), resolve(stage, 'MeowLingo.app'), { recursive: true, verbatimSymlinks: true });
  await verifyBundleLinks(resolve(stage, 'MeowLingo.app'));
  await symlink('/Applications', resolve(stage, 'Applications'));
  const output = resolve('out/make', `MeowLingo-${directory.split('-').at(-1)}.dmg`);
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'MeowLingo', '-srcfolder', stage, '-ov', '-format', 'UDZO', output], { stdio: 'inherit' });
  await rm(stage, { recursive: true, force: true });
}

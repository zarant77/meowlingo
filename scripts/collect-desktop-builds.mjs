import { readdir, mkdir, copyFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'dist');
await mkdir(destination, { recursive: true });
for (const entry of await readdir(destination, { withFileTypes: true })) {
  if (entry.isFile() && /^MeowLingo-darwin-.*\.zip$/.test(entry.name)) {
    await unlink(join(destination, entry.name));
  }
}

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) await collect(source);
    else if (/\.(dmg|exe|zip|nupkg)$/.test(entry.name) && !(process.platform === 'darwin' && entry.name.endsWith('.zip'))) {
      const arch = process.platform === 'darwin' && entry.name.endsWith('.dmg') ? /MeowLingo-(arm64|x64)\.dmg$/.exec(entry.name)?.[1] : undefined;
      const name = `MeowLingo-${process.platform}-${arch || process.arch}-${entry.name}`;
      await copyFile(source, join(destination, name));
      console.log(`Build: ${join(destination, name)}`);
    }
  }
}
await collect(join(root, 'desktop-client', 'out', 'make'));

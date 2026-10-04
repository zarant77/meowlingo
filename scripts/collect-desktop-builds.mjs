import { readdir, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'dist');
await mkdir(destination, { recursive: true });

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) await collect(source);
    else if (/\.(dmg|exe|zip|nupkg)$/.test(entry.name)) {
      const name = `MeowLingo-${process.platform}-${process.arch}-${entry.name}`;
      await copyFile(source, join(destination, name));
      console.log(`Build: ${join(destination, name)}`);
    }
  }
}
await collect(join(root, 'desktop-client', 'out', 'make'));

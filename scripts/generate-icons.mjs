import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generated assets are checked in, so Windows/Linux builds do not need these macOS tools.
if (process.platform !== 'darwin') throw new Error('Icon generation requires macOS sips.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'icon-source.png');
const assets = join(root, 'desktop-client/electron/assets');
const resources = join(root, 'android-app/app/src/main/res');
const temporary = mkdtempSync(join(tmpdir(), 'meowlingo-icons-'));
function resize(size, output) {
  mkdirSync(dirname(output), { recursive: true });
  execFileSync('/usr/bin/sips', ['-z', String(size), String(size), source, '--out', output], { stdio: 'ignore' });
}
try {
  resize(512, join(assets, 'icon.png'));
  resize(32, join(assets, 'tray.png'));
  resize(512, join(resources, 'drawable-nodpi/app_icon.png'));
  for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    resize(size, join(resources, `mipmap-${density}/ic_launcher.png`));
  }
  // Modern ICNS containers use a typed PNG chunk for each resolution.
  const chunks = Object.entries({ icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024 }).map(([type, size]) => {
    const file = join(temporary, `mac-${size}.png`);
    resize(size, file);
    const png = readFileSync(file);
    const chunk = Buffer.alloc(8);
    chunk.write(type, 0, 'ascii');
    chunk.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([chunk, png]);
  });
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write('icns', 0, 'ascii');
  icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  writeFileSync(join(assets, 'icon.icns'), Buffer.concat([icnsHeader, ...chunks]));
  // ICO containers can embed PNG images directly, preserving full-color artwork.
  const sizes = [16, 32, 48, 64, 128, 256];
  const frames = sizes.map(size => {
    const file = join(temporary, `windows-${size}.png`);
    resize(size, file);
    return readFileSync(file);
  });
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index] % 256;
    header[entry + 1] = sizes[index] % 256;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  writeFileSync(join(assets, 'icon.ico'), Buffer.concat([header, ...frames]));
  console.log('Generated Android, macOS, Windows and tray icons from icon-source.png.');
} finally { rmSync(temporary, { recursive: true, force: true }); }

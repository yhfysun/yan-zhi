#!/usr/bin/env node
/**
 * Sync the approved YanZhi icon pack into all runtime/build entry points.
 *
 * Source of truth:
 *   assets/icons/yanzhi-original-pack/
 *
 * The pack is raster-derived and must not be redrawn. PNG/ICO files are copied
 * byte-for-byte; only the Electron-dev BMP ICO and macOS ICNS are repackaged
 * from the pack's own PNG frames.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const repoRoot = path.resolve(__dirname, '..');
const packDir = path.join(repoRoot, 'assets', 'icons', 'yanzhi-original-pack');
const brandDir = path.join(packDir, 'Brand');
const windowsDir = path.join(packDir, 'Windows');
const iconDir = path.join(repoRoot, 'assets', 'icons');

function requireFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`[brand-icons] missing approved icon source: ${path.relative(repoRoot, file)}`);
  }
}

function copy(source, relativeTarget) {
  requireFile(source);
  const target = path.join(repoRoot, relativeTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function writeIcns(target, entries) {
  const chunks = entries.map(({ type, file }) => {
    requireFile(file);
    const data = fs.readFileSync(file);
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.concat([header, ...chunks]));
}

async function bmpFrame(file, size) {
  const meta = await sharp(file).metadata();
  if (meta.width !== size || meta.height !== size) {
    throw new Error(
      `[brand-icons] expected ${size}x${size} source frame, got ${meta.width}x${meta.height}: ${path.relative(repoRoot, file)}`,
    );
  }
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const xor = Buffer.alloc(size * size * 4);
  let offset = 0;
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * info.width + x) * info.channels;
      xor[offset] = data[index + 2];
      xor[offset + 1] = data[index + 1];
      xor[offset + 2] = data[index];
      xor[offset + 3] = data[index + 3];
      offset += 4;
    }
  }

  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha < 128) {
        const row = size - 1 - y;
        mask[row * maskRowBytes + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
  }

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(xor.length + mask.length, 20);
  return Buffer.concat([header, xor, mask]);
}

async function writeBmpIco(target, frames) {
  const offsetStart = 6 + frames.length * 16;
  let offset = offsetStart;
  const entries = [];
  for (const { size, file } of frames) {
    const data = await bmpFrame(file, size);
    const header = Buffer.alloc(16);
    header.writeUInt8(size >= 256 ? 0 : size, 0);
    header.writeUInt8(size >= 256 ? 0 : size, 1);
    header.writeUInt16LE(1, 4);
    header.writeUInt16LE(32, 6);
    header.writeUInt32LE(data.length, 8);
    header.writeUInt32LE(offset, 12);
    entries.push({ header, data });
    offset += data.length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.concat([
    header,
    ...entries.map((entry) => entry.header),
    ...entries.map((entry) => entry.data),
  ]));
}

async function main() {
  requireFile(path.join(packDir, 'README.txt'));
  const brand = (name) => path.join(brandDir, name);
  const win = (name) => path.join(windowsDir, name);
  const targets = [
    [brand('YanZhi_1024.png'), 'assets/icons/icon.png'],
    [brand('YanZhi_512.png'), 'assets/icons/icon1.png'],
    [brand('YanZhi_256.png'), 'assets/icons/icon2.png'],
    [win('YanZhi.ico'), 'assets/icons/icon.ico'],
    [win('YanZhi.ico'), 'assets/icons/icon1.ico'],
    [win('YanZhi.ico'), 'assets/icons/icon2.ico'],
    [brand('YanZhi_1024.png'), 'apps/desktop/build/icon.png'],
    [win('YanZhi.ico'), 'apps/desktop/build/icon.ico'],
    [brand('YanZhi_192.png'), 'apps/web/public/icon-192.png'],
    [brand('YanZhi_512.png'), 'apps/web/public/icon-512.png'],
    [win('YanZhi.ico'), 'apps/web/public/favicon.ico'],
    [brand('YanZhi_40.png'), 'packages/ui/src/assets/titlebar-logo.png'],
    [brand('YanZhi_40.png'), 'apps/desktop/src/assets/titlebar-logo.png'],
    [brand('YanZhi_48.png'), 'packages/ui/src/assets/login-logo.png'],
  ];
  for (const [source, target] of targets) copy(source, target);

  const devFrames = [16, 24, 32, 48, 64, 128, 256]
    .map((size) => ({ size, file: win(`YanZhi_${size}.png`) }));
  await writeBmpIco(path.join(iconDir, 'icon-dev.bmp.ico'), devFrames);

  const icns = path.join(iconDir, 'icon.icns');
  writeIcns(icns, [
    { type: 'icp4', file: brand('YanZhi_16.png') },
    { type: 'icp5', file: brand('YanZhi_32.png') },
    { type: 'icp6', file: brand('YanZhi_64.png') },
    { type: 'ic07', file: brand('YanZhi_128.png') },
    { type: 'ic08', file: brand('YanZhi_256.png') },
    { type: 'ic09', file: brand('YanZhi_512.png') },
    { type: 'ic10', file: brand('YanZhi_1024.png') },
  ]);
  copy(icns, 'apps/desktop/build/icon.icns');
  console.log('[brand-icons] synced approved YanZhi pack');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

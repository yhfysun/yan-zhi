const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const pack = (...parts) => path.join(ROOT, 'assets', 'icons', 'yanzhi-original-pack', ...parts);
const root = (...parts) => path.join(ROOT, ...parts);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('approved icon pack is the single source for runtime assets', () => {
  assert.equal(sha256(root('assets', 'icons', 'icon.png')), sha256(pack('Brand', 'YanZhi_1024.png')));
  assert.equal(sha256(root('assets', 'icons', 'icon.ico')), sha256(pack('Windows', 'YanZhi.ico')));
  assert.equal(sha256(root('apps', 'web', 'public', 'icon-512.png')), sha256(pack('Brand', 'YanZhi_512.png')));
  assert.equal(
    sha256(root('packages', 'ui', 'src', 'assets', 'titlebar-logo.png')),
    sha256(pack('Brand', 'YanZhi_40.png')),
  );
});

test('desktop, web, mobile and dev entry points sync the approved pack first', () => {
  const files = [
    'apps/desktop/scripts/prepare-edition-build.cjs',
    'apps/desktop/scripts/build-all-editions.cjs',
    'apps/desktop/scripts/build-shell.cjs',
    'apps/mobile/scripts/gen-android-icons.cjs',
    'bin/dev.mjs',
  ];
  for (const file of files) {
    assert.match(fs.readFileSync(root(file), 'utf8'), /sync-yanzhi-icons\.cjs/, file);
  }
  for (const file of ['apps/desktop/package.json', 'apps/web/package.json', 'apps/mobile/package.json']) {
    assert.match(fs.readFileSync(root(file), 'utf8'), /sync-yanzhi-icons\.cjs/, file);
  }
});

test('electron-dev ICO contains BMP frames from the approved Windows PNGs', () => {
  const data = fs.readFileSync(root('assets', 'icons', 'icon-dev.bmp.ico'));
  const count = data.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = data[offset] || 256;
    const height = data[offset + 1] || 256;
    const imageOffset = data.readUInt32LE(offset + 12);
    assert.equal(width, height);
    assert.notDeepEqual(
      [...data.subarray(imageOffset, imageOffset + 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `frame ${width} must not be PNG-compressed`,
    );
    sizes.push(width);
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 24, 32, 48, 64, 128, 256]);
});

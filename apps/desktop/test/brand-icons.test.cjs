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

test('Windows taskbar uses the native BMP ICO in dev and packaged builds', () => {
  const main = fs.readFileSync(root('apps', 'desktop', 'main.cjs'), 'utf8');
  assert.match(main, /resourcesPath,\s*'icon-window\.ico'/, 'packaged windows must prefer icon-window.ico');
  assert.match(main, /assets',\s*'icons',\s*'icon-dev\.bmp\.ico'/, 'dev windows must use icon-dev.bmp.ico');
  assert.match(main, /function applyWindowIcon\(win\)/, 'window icons must be applied through one helper');
  assert.match(main, /app\.on\('browser-window-created',\s*\(_e,\s*win\)\s*=>\s*applyWindowIcon\(win\)\)/);
  assert.match(
    main,
    /app\.isPackaged\s*\?\s*'com\.yanzhi\.desktop'\s*:\s*'com\.yanzhi\.desktop\.dev'/,
    'dev must use its own AUMID instead of Electron or the packaged app identity',
  );
  assert.match(
    main,
    /app\.setAppUserModelId\(WINDOWS_APP_USER_MODEL_ID\)/,
    'the selected AUMID must be registered before windows are created',
  );
  assert.match(
    main,
    /win\.setAppDetails\(\{[\s\S]*?appId:\s*WINDOWS_APP_USER_MODEL_ID,[\s\S]*?appIconPath:\s*iconPath,/,
    'Windows shell icon details must follow the selected runtime icon',
  );

  for (const file of [
    'apps/desktop/electron-builder.full.yml',
    'apps/desktop/electron-builder.lite.yml',
    'apps/desktop/electron-builder.shell.yml',
  ]) {
    const yml = fs.readFileSync(root(file), 'utf8');
    assert.match(
      yml,
      /from:\s*\.\.\/\.\.\/assets\/icons\/icon-dev\.bmp\.ico\s*\n\s*to:\s*icon-window\.ico/,
      `${file} must ship icon-window.ico`,
    );
  }
});

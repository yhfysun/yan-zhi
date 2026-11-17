const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const ROOT = path.resolve(DESKTOP, '..', '..');
const MAIN = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');
const SET_EDITION = fs.readFileSync(path.join(DESKTOP, 'scripts', 'set-edition.cjs'), 'utf8');
const PACKAGE = fs.readFileSync(path.join(ROOT, 'scripts', 'package.cjs'), 'utf8');
const BUILD_ALL = fs.readFileSync(path.join(DESKTOP, 'scripts', 'build-all-editions.cjs'), 'utf8');
const ROOT_PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('多用户发行配置随包固化，并由主进程注入后端', () => {
  assert.match(SET_EDITION, /authMode/);
  assert.match(SET_EDITION, /YZ_DEFAULT_AUTH_MODE/);
  assert.match(MAIN, /cfg\.authMode/);
  assert.match(MAIN, /function effectiveAuthMode/);
  assert.match(MAIN, /const mode = effectiveAuthMode\(\)/);
  assert.match(MAIN, /YZ_AUTH_MODE: mode/);
  assert.match(MAIN, /authModeLocked: editionDefaultAuthMode === 'multi'/);
});

test('打包入口支持显式多用户 Pro 包', () => {
  assert.match(PACKAGE, /--auth-mode/);
  assert.match(PACKAGE, /YZ_DEFAULT_AUTH_MODE/);
  assert.match(BUILD_ALL, /YZ_DEFAULT_AUTH_MODE/);
  assert.equal(
    ROOT_PKG.scripts['package:desktop:pro:multi'],
    'node scripts/package-desktop-pro.cjs --auth-mode=multi --name=pro-multi --yes',
  );
});

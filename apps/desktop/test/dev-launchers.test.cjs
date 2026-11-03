/**
 * 开发启动入口守门：
 *   dev:backend = 只启动完整后端；
 *   dev:shell   = 强制轻量壳模式，不启动本机后端，连接指定远程后端。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('根脚本提供 dev:backend 与 dev:shell', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.strictEqual(pkg.scripts['dev:backend'], 'node bin/dev-backend.mjs');
  assert.strictEqual(pkg.scripts['dev:shell'], 'node bin/dev-shell.mjs');
});

test('纯后端入口只转 server，并标记为本地完整执行端', () => {
  const src = read('bin/dev-backend.mjs');
  assert.match(src, /'server'/);
  assert.match(src, /YZ_DESKTOP_LOCAL_EXECUTION:\s*'1'/);
});

test('壳入口强制 SHELL_MODE，要求远程后端且不启动本机 server', () => {
  const shell = read('bin/dev-shell.mjs');
  const main = read('apps/desktop/main.cjs');
  assert.match(shell, /YZ_SHELL_DEV:\s*'1'/);
  assert.match(shell, /YZ_SERVER_BASE:\s*serverBase/);
  assert.match(shell, /'shell'/);
  assert.match(main, /DEV_SHELL_MODE = !app\.isPackaged && process\.env\.YZ_SHELL_DEV === '1'/);
  assert.match(main, /if \(SHELL_MODE\)[\s\S]{0,160}跳过本地后端启动/);
});

test('bin/dev.mjs 支持 shell 目标并构建本机能力 bundle', () => {
  const src = read('bin/dev.mjs');
  assert.match(src, /shell:\s*\{\s*dir:\s*'apps\/desktop'/s);
  assert.match(src, /build-local-capabilities\.cjs/);
  assert.match(src, /YZ_SHELL_DEV = '1'/);
});

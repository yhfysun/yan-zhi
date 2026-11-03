/**
 * 轻量壳 `/remote` 会被局域网普通浏览器打开。
 * 这个入口没有 Electron preload，也没有桌面数据库；不能为了挂载控制端页面先跑 initSchema，
 * 否则页面功能能用，但控制台会报“数据库初始化失败 / 降级挂载”。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'main.ts'), 'utf8');

test('远程控制 guest 入口必须在数据库初始化之前分流挂载', () => {
  const branch = SRC.indexOf('isRemoteGuestEntry()');
  const init = SRC.indexOf('initSchema(');
  assert.ok(branch >= 0, '缺少 isRemoteGuestEntry 分流');
  assert.ok(init > branch, '远程页分流必须早于 initSchema');
  assert.match(SRC, /#\/remote/);
  assert.match(SRC, /\/remote/);
});

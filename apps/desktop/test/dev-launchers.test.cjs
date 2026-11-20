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
  assert.ok(fs.existsSync(path.join(ROOT, 'bin', 'dev-backend.bat')));
  assert.ok(fs.existsSync(path.join(ROOT, 'bin', 'dev-shell.bat')));
});

test('Windows 开发启动器统一解析 fnm / nvm / WorkBuddy Node', () => {
  const launchers = [
    'bin/dev.bat',
    'bin/dev-desktop.bat',
    'bin/dev-desktop-multi.bat',
    'bin/dev-backend.bat',
    'bin/dev-shell.bat',
  ];

  for (const launcher of launchers) {
    const bat = read(launcher);
    assert.match(bat, /call "%~dp0resolve-node\.bat"/, launcher);
    assert.doesNotMatch(bat, /22\.22\.2\\node\.exe/, launcher);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'bin', 'resolve-node.bat')));
  assert.ok(fs.existsSync(path.join(ROOT, 'bin', 'resolve-node.ps1')));
});

test('纯后端入口只转 server，并标记为本地完整执行端', () => {
  const src = read('bin/dev-backend.mjs');
  const bat = read('bin/dev-backend.bat');
  assert.match(src, /'server'/);
  assert.match(src, /YZ_DESKTOP_LOCAL_EXECUTION:\s*'1'/);
  assert.match(bat, /bin\\dev-backend\.mjs/);
  assert.match(bat, /%NODE_BIN%/);
  assert.match(bat, /pause/);
});

test('壳入口强制 SHELL_MODE，要求远程后端且不启动本机 server', () => {
  const shell = read('bin/dev-shell.mjs');
  const bat = read('bin/dev-shell.bat');
  const main = read('apps/desktop/main.cjs');
  assert.match(shell, /YZ_SHELL_DEV:\s*'1'/);
  assert.match(shell, /YZ_SERVER_BASE:\s*serverBase/);
  assert.match(shell, /'shell'/);
  assert.match(bat, /bin\\dev-shell\.mjs/);
  assert.match(bat, /%NODE_BIN%/);
  assert.match(bat, /pause/);
  assert.match(main, /DEV_SHELL_MODE = !app\.isPackaged && process\.env\.YZ_SHELL_DEV === '1'/);
  assert.match(main, /if \(SHELL_MODE\)[\s\S]{0,160}跳过本地后端启动/);
});

test('bin/dev.mjs 支持 shell 目标并构建本机能力 bundle', () => {
  const src = read('bin/dev.mjs');
  assert.match(src, /shell:\s*\{\s*dir:\s*'apps\/desktop'/s);
  assert.match(src, /build-local-capabilities\.cjs/);
  assert.match(src, /YZ_SHELL_DEV = '1'/);
});

test('桌面开发分支启动后端时显式标记本地执行端', () => {
  const main = read('apps/desktop/main.cjs');
  const devBranch = main.slice(
    main.indexOf("if (!app.isPackaged) {"),
    main.indexOf("} else {\n    // 生产模式", main.indexOf("if (!app.isPackaged) {")),
  );
  assert.match(devBranch, /YZ_DESKTOP_LOCAL_EXECUTION:\s*'1'/);
  assert.ok(
    (devBranch.match(/YZ_DESKTOP_LOCAL_EXECUTION:\s*'1'/g) || []).length >= 2,
    'tsx 与 npx 回退路径都必须标记本地执行端',
  );
});

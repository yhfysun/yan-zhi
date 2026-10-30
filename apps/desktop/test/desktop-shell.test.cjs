/**
 * 插件桌面窗口 + 桌面外壳纯逻辑单测（openspec/changes/desktop-manager P0-0）。
 * 覆盖：入口白名单/权限、助手输出解析、图标会话状态机。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  resolvePluginWindowRequest,
  parseHelperLine,
  createIconSession,
  HELPER_CS,
} = require('../desktop-shell.cjs');

function mkPlugin(perms = ['desktop-shell'], entry = 'frontend/fence.html') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-pw-'));
  const installed = path.join(root, 'installed');
  const dir = path.join(installed, 'desktop-manager');
  fs.mkdirSync(path.join(dir, 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    id: 'desktop-manager', name: 'x', version: '0.1.0', permissions: perms,
  }));
  fs.writeFileSync(path.join(dir, entry), '<!doctype html>');
  return { dirs: { installed, builtin: path.join(root, 'builtin') }, root };
}

test('合法请求：返回 yz:// 地址与绝对路径', () => {
  const { dirs, root } = mkPlugin();
  const r = resolvePluginWindowRequest(dirs, { pluginId: 'desktop-manager', entry: 'frontend/fence.html', placement: 'desktop' });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'yz://plugin/desktop-manager/frontend/fence.html');
  assert.ok(r.absPath.endsWith('fence.html'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('★ 传了 apiOrigin 就用本地 HTTP 开页（yz:// 文档加载子资源会被 Chromium 拒绝）', () => {
  const { dirs, root } = mkPlugin();
  const r = resolvePluginWindowRequest(dirs, {
    pluginId: 'desktop-manager',
    entry: 'frontend/fence.html',
    placement: 'desktop',
    apiOrigin: 'http://127.0.0.1:3001/',
  });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'http://127.0.0.1:3001/api/plugin-assets/desktop-manager/frontend/fence.html');
  fs.rmSync(root, { recursive: true, force: true });
});

test('清单未声明 desktop-shell 权限 → 拒绝', () => {
  const { dirs, root } = mkPlugin(['fs']);
  const r = resolvePluginWindowRequest(dirs, { pluginId: 'desktop-manager', entry: 'frontend/fence.html' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'permission-denied');
  fs.rmSync(root, { recursive: true, force: true });
});

test('路径穿越 / 非 html / 非法 id / 非法 placement 全部拒绝', () => {
  const { dirs, root } = mkPlugin();
  assert.equal(resolvePluginWindowRequest(dirs, { pluginId: 'desktop-manager', entry: '../evil.html' }).error, 'entry-outside-plugin');
  assert.equal(resolvePluginWindowRequest(dirs, { pluginId: 'desktop-manager', entry: 'backend/index.js' }).error, 'invalid-entry');
  assert.equal(resolvePluginWindowRequest(dirs, { pluginId: 'Bad/Id', entry: 'frontend/fence.html' }).error, 'invalid-plugin-id');
  assert.equal(resolvePluginWindowRequest(dirs, { pluginId: 'desktop-manager', entry: 'frontend/fence.html', placement: 'top' }).error, 'invalid-placement');
  fs.rmSync(root, { recursive: true, force: true });
});

test('插件未安装 → plugin-not-installed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-pw-'));
  const dirs = { installed: path.join(root, 'installed'), builtin: path.join(root, 'builtin') };
  assert.equal(resolvePluginWindowRequest(dirs, { pluginId: 'nope', entry: 'a.html' }).error, 'plugin-not-installed');
  fs.rmSync(root, { recursive: true, force: true });
});

test('助手输出解析：取最后一行 JSON，坏输出返回 null', () => {
  assert.deepEqual(parseHelperLine('noise\n{"ok":true}\n'), { ok: true });
  assert.deepEqual(parseHelperLine('{"workerW":123}\r\n'), { workerW: 123 });
  assert.equal(parseHelperLine('not json'), null);
  assert.equal(parseHelperLine(''), null);
});

test('图标会话：启动即隐藏不认领，退出不恢复', () => {
  const s = createIconSession();
  s.noteStartup(false);
  assert.equal(s.hiddenAtStartup, true);
  assert.equal(s.shouldRestore(), false);
});

test('图标会话：桌面层要求隐藏但当前已是隐藏 → 显式认领，退出要恢复', () => {
  const s = createIconSession();
  s.noteStartup(false);            // 启动时就是隐藏（可能是上次没收尾）
  assert.equal(s.shouldRestore(), false);
  s.claimHidden();                 // 桌面层窗口说要隐藏 → 归属转到我们
  assert.equal(s.shouldRestore(), true);
  assert.equal(s.hiddenAtStartup, false);
  s.markRestored();
  assert.equal(s.shouldRestore(), false);
});

test('图标会话：本会话隐藏 → 需要恢复；恢复后清空', () => {
  const s = createIconSession();
  s.noteStartup(true);
  assert.equal(s.onHideRequested(true), true);
  assert.equal(s.shouldRestore(), true);
  assert.equal(s.onHideRequested(false), false); // 已隐藏时重复请求不重复认领
  s.markRestored();
  assert.equal(s.shouldRestore(), false);
});

test('图标会话：显式显示清除所有权', () => {
  const s = createIconSession();
  s.onHideRequested(true);
  assert.equal(s.onShowRequested(false), true);
  assert.equal(s.shouldRestore(), false);
  assert.equal(s.hiddenAtStartup, false);
});

test('助手源码包含全部命令', () => {
  for (const cmd of ['--progman', '--spawn-workerw', '--pin', '--unpin', '--icons-visible', '--toggle-icons', '--foreground', '--icon']) {
    assert.ok(HELPER_CS.includes(cmd), '缺少命令 ' + cmd);
  }
});

test('入口允许带查询串（?layer=desktop），路径部分照常校验', () => {
  const { dirs, root } = mkPlugin();
  fs.writeFileSync(path.join(dirs.installed, 'desktop-manager', 'frontend', 'widgets.html'), '<!doctype html>');
  const r = resolvePluginWindowRequest(dirs, {
    pluginId: 'desktop-manager',
    entry: 'frontend/widgets.html?layer=desktop',
    placement: 'desktop',
    apiOrigin: 'http://127.0.0.1:3001',
  });
  assert.equal(r.ok, true);
  assert.equal(r.url, 'http://127.0.0.1:3001/api/plugin-assets/desktop-manager/frontend/widgets.html?layer=desktop');
  assert.ok(r.absPath.endsWith('widgets.html'));

  const notHtml = resolvePluginWindowRequest(dirs, { pluginId: 'desktop-manager', entry: 'frontend/x.txt?layer=1', placement: 'normal' });
  assert.equal(notHtml.ok, false);
  const trav = resolvePluginWindowRequest(dirs, { pluginId: 'desktop-manager', entry: '../evil.html?x=1', placement: 'normal' });
  assert.equal(trav.ok, false, '查询串不能拿来绕过越界检查');
  fs.rmSync(root, { recursive: true, force: true });
});

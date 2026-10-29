// yz:// 协议目标解析器单测（mode-pluginization P0）。
// plugin-protocol.cjs 是纯函数模块（无 electron 依赖），这里把「目录定位 + 路径穿越拦截 +
// dev/打包双布局」钉死 —— 渲染层所有插件前端 bundle 都经它落盘，错一格就是 404/越读。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { YZ_SCHEME_PRIVILEGES, pluginDirCandidates, resolveYzTarget, safeJoin, PLUGIN_ID_RE } = require('../plugin-protocol.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yz-protocol-'));
}

test('privileged scheme 声明（standard + cors，file:// 源跨源模块装载依赖它）', () => {
  assert.strictEqual(YZ_SCHEME_PRIVILEGES.scheme, 'yz');
  assert.strictEqual(YZ_SCHEME_PRIVILEGES.standard, true);
  assert.strictEqual(YZ_SCHEME_PRIVILEGES.corsEnabled, true);
  assert.strictEqual(YZ_SCHEME_PRIVILEGES.supportFetchAPI, true);
});

test('safeJoin 拦截路径穿越与绝对路径注入', () => {
  const root = mkTmp();
  assert.strictEqual(safeJoin(root, '../outside.txt'), null);
  assert.strictEqual(safeJoin(root, 'a/../../b.txt'), null);
  assert.strictEqual(safeJoin(root, 'C:\\evil.txt'), null);       // 盘符绝对路径
  assert.strictEqual(safeJoin(root, '\\\\srv\\share\\x'), null);  // UNC
  // 前导 / 被安全剥离后按相对路径处理（URL pathname 的前导斜杠本就该剥）
  const rel = safeJoin(root, '/abs.txt');
  assert.ok(rel && rel.startsWith(path.normalize(root + path.sep)));
  const ok = safeJoin(root, 'a/b/c.txt');
  assert.ok(ok && ok.startsWith(path.normalize(root + path.sep)));
});

test('plugin id 白名单', () => {
  assert.ok(PLUGIN_ID_RE.test('git-explorer'));
  assert.ok(!PLUGIN_ID_RE.test('Git-Explorer'));
  assert.ok(!PLUGIN_ID_RE.test('../evil'));
  assert.ok(!PLUGIN_ID_RE.test('a b'));
});

test('resolveYzTarget: shared 命中 / 缺失 404 / 穿越 404', () => {
  const shimsDir = mkTmp();
  fs.writeFileSync(path.join(shimsDir, 'vue.mjs'), 'export default {}');
  const ctx = { shimsDir };
  const hit = resolveYzTarget('yz://shared/vue.mjs', ctx);
  assert.ok(hit.ok && hit.filePath === path.join(shimsDir, 'vue.mjs'));
  assert.strictEqual(hit.mime, 'text/javascript');
  assert.strictEqual(resolveYzTarget('yz://shared/missing.mjs', ctx).status, 404);
  assert.strictEqual(resolveYzTarget('yz://shared/../secret.txt', ctx).status, 404);
});

test('resolveYzTarget: plugin 内置优先 → 已安装兜底 → 双双缺失 404', () => {
  const mainDir = mkTmp();
  const builtin = path.join(mainDir, 'plugins', 'builtin');
  const installed = path.join(mainDir, 'plugins', 'installed');
  fs.mkdirSync(path.join(builtin, 'alpha', 'frontend'), { recursive: true });
  fs.mkdirSync(path.join(installed, 'beta', 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(builtin, 'alpha', 'frontend', 'index.mjs'), 'export default {}');
  fs.writeFileSync(path.join(installed, 'beta', 'frontend', 'index.mjs'), 'export default {}');
  // 显式传 pluginRoots（生产路径经 pluginDirCandidates 从 mainDir/resources 推导，dev 布局已在单测钉住）
  const ctx = { mainDir, isPackaged: false, shimsDir: mkTmp(), pluginRoots: { builtin, installed } };

  const a = resolveYzTarget('yz://plugin/alpha/frontend/index.mjs', ctx);
  assert.ok(a.ok && a.filePath.startsWith(builtin));
  const b = resolveYzTarget('yz://plugin/beta/frontend/index.mjs', ctx);
  assert.ok(b.ok && b.filePath.startsWith(installed));
  assert.strictEqual(resolveYzTarget('yz://plugin/ghost/frontend/index.mjs', ctx).status, 404);
});

test('★ 插件页 .html 必须按 text/html 服务（否则窗口 loadURL 直接 ERR_FAILED）', () => {
  const mainDir = mkTmp();
  const builtin = path.join(mainDir, 'plugins', 'builtin');
  const installed = path.join(mainDir, 'plugins', 'installed');
  fs.mkdirSync(path.join(installed, 'demo', 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(installed, 'demo', 'frontend', 'settings.html'), '<!doctype html>');
  const ctx = { mainDir, isPackaged: false, shimsDir: mkTmp(), pluginRoots: { builtin, installed } };

  const hit = resolveYzTarget('yz://plugin/demo/frontend/settings.html', ctx);
  assert.ok(hit.ok, '插件页必须能解析到磁盘文件');
  // 回落 application/octet-stream 时 Chromium 会把页面当下载 → 窗口白页 + ERR_FAILED(-2)
  assert.match(hit.mime, /^text\/html/);
});

test('resolveYzTarget: 非法 id / 非法协议 / 编码穿越 → 400', () => {
  const ctx = { mainDir: mkTmp(), isPackaged: false, shimsDir: mkTmp() };
  // WHATWG URL 会把 %2e%2e 当 ".." 段规范化掉（消化成空 rest → 404）；
  // 段内编码（..%2Fevil）解码后 id 含路径分隔符，必须被 id 白名单 400 拦下。
  assert.strictEqual(resolveYzTarget('yz://plugin/..%2Fevil/frontend/index.mjs', ctx).status, 400);
  assert.strictEqual(resolveYzTarget('yz://plugin/%42ad-id/frontend/index.mjs', ctx).status, 400);
  assert.strictEqual(resolveYzTarget('yz://plugin/Bad-Id/frontend/index.mjs', ctx).status, 400);
  assert.strictEqual(resolveYzTarget('http://127.0.0.1/x', ctx).status, 400);
  // 规范化消化后的未知 id → 404
  assert.strictEqual(resolveYzTarget('yz://plugin/%2e%2e/evil', ctx).status, 404);
});

test('pluginDirCandidates: dev 与打包双布局', () => {
  const dev = pluginDirCandidates({ mainDir: 'C:/app/desktop', resourcesPath: 'C:/app/resources', isPackaged: false });
  assert.strictEqual(dev.builtin.replace(/\\/g, '/'), 'C:/app/server/plugins/builtin');
  assert.strictEqual(dev.installed.replace(/\\/g, '/'), 'C:/app/server/plugins/installed');

  const packed = pluginDirCandidates({ mainDir: 'C:/asar', resourcesPath: 'C:/res', isPackaged: true });
  assert.strictEqual(packed.builtin.replace(/\\/g, '/'), 'C:/res/server/dist/plugins/builtin');
  assert.strictEqual(packed.installed.replace(/\\/g, '/'), 'C:/res/server/dist/apps/plugins/installed');
});

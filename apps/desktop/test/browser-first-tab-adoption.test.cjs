/**
 * 首启预览面板“停在浏览器首页”回归测试。
 *
 * 实报时序：Agent 第一次 navigate 时主进程先建 tab-N 并广播 tabCreated；
 * BrowserPanel 随后才挂载，自己的 store 为空。旧实现直接 newTab() 又建了一个空白
 * tab-M 并激活，用户看到起始主页，Agent 的 tab-N 却在后台。
 *
 * 本测试钉住修复链路：
 *   ① 主进程能按 scope 列出已有 tab，并返回尚未创建 guest 时记录的目标 URL；
 *   ② preload 暴露 listTabs；
 *   ③ BrowserPanel 挂载先 adopt，确认没有已有 tab 后才 newTab。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const UI = path.resolve(DESKTOP, '..', '..', 'packages', 'ui', 'src', 'components', 'BrowserPanel.vue');

function read(p) { return fs.readFileSync(p, 'utf8'); }

test('★★★ 主进程提供 browserView:listTabs，并带回已有 tab 的目标 URL', () => {
  const src = read(path.join(DESKTOP, 'main.cjs'));
  const i = src.indexOf("ipcMain.handle('browserView:listTabs'");
  assert.ok(i > -1, '缺少 browserView:listTabs handler');
  const body = src.slice(i, src.indexOf('// 关闭标签页', i));
  assert.match(body, /webviewTabs/);
  assert.match(body, /broadcastTabUrl\.get/);
  assert.match(body, /meta\.url/);
  assert.match(body, /activeTabForScope\(wantScope\)/);
});

test('★★★ Agent 首次 navigate/create tab 必须把目标 URL 写进主进程 meta', () => {
  const src = read(path.join(DESKTOP, 'main.cjs'));
  const nav = src.indexOf("if (!wc && action === 'navigate' && args.url)");
  assert.ok(nav > -1, '找不到首次 navigate 自建分支');
  const navBody = src.slice(nav, src.indexOf('// 某些动作即便没有已建 host', nav));
  assert.match(navBody, /selfMeta\.url\s*=\s*cleanUrl/);

  const nt = src.indexOf("case 'new_tab':");
  assert.ok(nt > -1, '找不到 new_tab 分支');
  const ntBody = src.slice(nt, src.indexOf("case 'switch_tab':", nt));
  assert.match(ntBody, /meta\.url\s*=\s*target/);
});

test('★★ preload 暴露 listTabs', () => {
  const src = read(path.join(DESKTOP, 'preload.cjs'));
  assert.match(src, /listTabs:\s*\(scope\)\s*=>\s*ipcRenderer\.invoke\('browserView:listTabs',\s*scope\)/);
});

test('★★★ BrowserPanel 先认领主进程已有 tab，只有没有时才新建空白页', () => {
  const src = read(UI);
  assert.match(src, /async function adoptExistingTabsFromMain/);
  assert.match(src, /bv\.listTabs\(browserScope\)/);
  const i = src.indexOf('const adopted = await adoptExistingTabsFromMain()');
  assert.ok(i > -1, '挂载路径没有调用 adoptExistingTabsFromMain');
  const after = src.slice(i, i + 220);
  assert.match(after, /if \(!adopted\) await newTab\(\)/, '认领失败时必须仍有空白页兜底');
});

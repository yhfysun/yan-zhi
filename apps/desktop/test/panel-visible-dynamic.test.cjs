/**
 * 面板可见性必须是「动态事实」，不能拿 `webviewPanelVisible` 这个全局缓存当硬闸门。
 *
 * 背景（2026-10-26 实报「面板就在旁边开着，agent 却弹框让我展开面板」）：
 *   `webviewPanelVisible` 是全局单一值、最后写入者说了算。BrowserPanel 可能同时存在于
 *   多个窗口（主窗口 + 分离出去的浏览器窗口）：任一侧收起都会 hide() 把全局置假，
 *   另一侧尺寸没变就**不会再发 resize** ⇒ 缓存永久为假 ⇒ 截图被拒、
 *   `get_tabs.panelVisible` 回假 ⇒ 模型照提示去"请用户展开面板"。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

test('panelReallyHidden 用宿主窗口动态核实（缓存只做快路径）', () => {
  assert.match(MAIN, /function panelReallyHidden\(wc\)/);
  assert.match(MAIN, /getOwnerBrowserWindow/);
  assert.match(MAIN, /webviewPanelVisible = true; \/\/ 动态事实纠正缓存/);
});

test('截图与「截图当前页」两处闸门都走动态判据', () => {
  const gates = MAIN.match(/isWebviewEngine\(\) && panelReallyHidden\(wc\)/g) || [];
  assert.ok(gates.length >= 2, `应有两处闸门（screenshot / captureTab），实际 ${gates.length}`);
});

test('get_tabs.panelVisible 不得直接回缓存', () => {
  assert.doesNotMatch(MAIN, /activeTabId,\s*panelVisible: webviewPanelVisible/);
  assert.match(MAIN, /panelVisible: !panelReallyHidden\(/);
});

test('Electron 的 "Script failed to execute" 必须翻译成可行动文案', () => {
  assert.match(MAIN, /Script failed to execute\|Execution context\|context was destroyed/);
  assert.match(MAIN, /不要改用 browser_run_script 去模拟点击\/填表/);
});

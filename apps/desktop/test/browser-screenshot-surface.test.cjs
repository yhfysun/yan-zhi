/**
 * 截图 surface 守门测试（2026-10-14）。
 *
 * ★★★ 背景 —— 「截图为什么必失败」定位过程：
 *   conv 96125908 在 16:45:51 → 16:51:27 之间 **8 次截图全失败**，清一色
 *   `Current display surface not available for capture`（首次仅 107ms 即抛，不是超时）；
 *   而**同期所有 JS 类动作全成功**（get_page_content 106ms OK / run_script OK / click OK）。
 *   16:55:55 渲染层 `onWebviewReady`（面板重新就绪）之后自动恢复。
 *
 *   根因：webview 引擎下**面板收起时 webview 只是宽度过渡归 0 + 透明（并非 display:none，
 *   见 BrowserPanel.vue 注释）**—— `<webview>` 的合成 surface 随之消失，Chromium 无法截图；
 *   而 guest webContents 仍活着，所以 JS 类动作照常成功。**代码造不出 surface**。
 *
 *   但主进程原先对这件事**完全不可诊断**：webview 引擎下 `browserView:resize` 与
 *   `browserView:hide` **双双早返回**（「webview 由渲染层 CSS 控制显隐」）。
 *   修法：这两个 IPC 渲染层本来就在发，主进程顺势**只记录**可见性（不新增 IPC、不改显隐），
 *   截图前据此**快速失败**并给出唯一有效的出路（改读 DOM），而不是白等 8 秒再抛同一句话。
 *
 * 本测试钉住三件事（接线被删/措辞被合并即红）。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');

describe('面板可见性记录（webview 引擎下主进程唯一的可见性信号源）', () => {
  test('声明了 webviewPanelVisible 且默认 true（拿不到信号时不误判成不可见）', () => {
    assert.match(mainSrc, /let webviewPanelVisible = true;/, '缺 webviewPanelVisible 声明');
  });

  test('★ browserView:hide 必须置 false —— 且在 webview 引擎早返回**之前**', () => {
    const idx = mainSrc.indexOf("ipcMain.handle('browserView:hide'");
    assert.ok(idx > -1, '未找到 browserView:hide handler');
    const body = mainSrc.slice(idx, idx + 600);
    const setIdx = body.indexOf('webviewPanelVisible = false');
    assert.ok(setIdx > -1, '★ browserView:hide 必须记录不可见（否则截图失败无法诊断）');
    const retIdx = body.indexOf('if (isWebviewEngine()) return');
    assert.ok(
      retIdx === -1 || setIdx < retIdx,
      `★ 记录必须在 isWebviewEngine() 早返回之前（置位@${setIdx} vs 返回@${retIdx}）—— 放到后面在 webview 引擎下永不执行`,
    );
  });

  test('★ browserView:resize 按非零宽高判定可见 —— 同样在 webview 引擎早返回之前', () => {
    const idx = mainSrc.indexOf("ipcMain.handle('browserView:resize'");
    assert.ok(idx > -1, '未找到 browserView:resize handler');
    const body = mainSrc.slice(idx, idx + 700);
    const setIdx = body.indexOf('webviewPanelVisible =');
    assert.ok(setIdx > -1, '★ browserView:resize 必须记录可见性（面板展开时靠它恢复）');
    assert.match(body.slice(setIdx, setIdx + 200), /Math\.round\(width\)\)\s*>\s*0/, '可见性应看宽度是否非零');
    const retIdx = body.indexOf('if (isWebviewEngine()) return');
    assert.ok(retIdx === -1 || setIdx < retIdx, '★ 记录必须在 isWebviewEngine() 早返回之前');
  });
});

describe('截图分支：不可见时快速失败 + 两种成因措辞分开', () => {
  /**
   * ★ 锚点必须唯一：main.cjs 里有**两处** `case 'screenshot': {` ——
   *   `doAction` 内联的简易实现（只回 base64）与 `runBrowserAction` 里的完整实现
   *   （落盘存档 + 本次新增的前置判断）。直接 indexOf 会命中前者，断言会整片错位
   *   （本测试第一版就是这么红的）。这里按"分支体内含 saveShotArchive"挑出完整实现。
   */
  function findFullScreenshotCase(src) {
    let from = 0;
    for (;;) {
      const i = src.indexOf("case 'screenshot': {", from);
      if (i < 0) return -1;
      if (src.slice(i, i + 1500).includes('saveShotArchive')) return i;
      from = i + 1;
    }
  }
  const start = findFullScreenshotCase(mainSrc);
  const end = start > -1 ? mainSrc.indexOf("case 'get_page_info': {", start) : -1;
  const body = start > -1 && end > start ? mainSrc.slice(start, end) : '';

  test('能定位到 screenshot 分支（改名/改格式后本测试需同步）', () => {
    assert.ok(body.length > 500, "未定位到 case 'screenshot' 分支");
  });

  test('★ 有"面板不可见 → 直接失败"的前置判断，且在 capturePage 之前', () => {
    // ★ 2026-10-27：闸门已从裸 `!webviewPanelVisible` 换成 `panelReallyHidden(wc)`
    //   （2026-10-26：全局缓存会被别的窗口的 hide() 置假且永不回真 → "面板开着却拒截图"）。
    //   用例此前没跟上，钉的是旧写法；代码本身没退化。
    const guardIdx = body.indexOf('panelReallyHidden(wc)');
    const captureIdx = body.indexOf('wc.capturePage()');
    assert.ok(guardIdx > -1, '★ 缺面板可见性前置判断 —— 否则又回到"白等 8s 再抛同一句话"');
    assert.ok(captureIdx > -1, '未找到 capturePage 调用（改名后本测试需同步）');
    assert.ok(guardIdx < captureIdx, '★ 前置判断必须在 capturePage 之前，否则省不掉无意义的等待');
  });

  test('★ 面板收起与窗口被遮挡的措辞必须区分（合并成一句就无人能定位）', () => {
    const guardIdx = body.indexOf('panelReallyHidden(wc)');
    const guardTail = body.slice(guardIdx, guardIdx + 700);
    assert.match(guardTail, /被收起/, '面板不可见那条要写明"面板/浏览器被收起"，而不是笼统说"页面不可见"');
    const throwIdx = body.indexOf('截图不可用：应用窗口被其他窗口遮挡或最小化');
    assert.ok(throwIdx > -1, '★ 面板可见仍失败时，措辞应写明"窗口被遮挡或最小化"，与面板收起区分开');
  });

  test('两种失败都明确指引改走 DOM 读法 + 不要重复调用（否则模型会反复重试截图）', () => {
    // 按语义匹配，不死抠措辞（两条实际分别写的"不要重复调用"/"不要再调用"）
    assert.ok(
      (body.match(/不要[^。]*调用 browser_screenshot/g) || []).length >= 2,
      '两条失败路径都要写明"不要…调用 browser_screenshot"',
    );
    assert.ok(
      (body.match(/browser_get_page_content/g) || []).length >= 2,
      '两条失败路径都要给出替代工具 browser_get_page_content',
    );
  });
});

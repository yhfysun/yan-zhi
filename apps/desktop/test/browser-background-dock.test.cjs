/**
 * 后台运行 + 编号层守卫（2026-10-23）。
 *
 * ★ 背景：
 *   ① 应用最小化后 pageAgent 动作失败。实测（apps/desktop/experiments/bg-runtime）：
 *      最小化时 `document.visibilityState` 恒为 hidden，`setBackgroundThrottling(false)`
 *      只能恢复 rAF/定时器，救不回 visibility ⇒ 抖音创作者中心等微前端停在"加载中"。
 *      窗口移出屏幕（不最小化）时 visible/rAF/截图全部正常。
 *   ② 用户看到同一批按钮出现两套编号（0-5 与 18-23）：编号层重绘被 150ms 节流
 *      "未到点就 return"丢掉，以及 MutationObserver 不监听 class/style。
 *   ③ 带标注截图失败时覆盖层清理不执行，编号永久留在页面上。
 *
 * 本测试钉住：窗口最小化时走后台停靠、节流判定同源、编号层补尾随重绘、覆盖层 finally 清理。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');

describe('后台停靠：最小化/关窗/任务迟到都切到"移出屏幕"', () => {
  test('声明了 dockedOffscreen 与 enterBackgroundDock/leaveBackgroundDock', () => {
    assert.match(mainSrc, /let dockedOffscreen = null;/, '缺 dockedOffscreen 声明');
    assert.match(mainSrc, /function enterBackgroundDock\(\)/, '缺 enterBackgroundDock');
    assert.match(mainSrc, /function leaveBackgroundDock\(focus = true\)/, '缺 leaveBackgroundDock');
  });

  test('停靠时窗口必须真正可见（否则 visibilityState 仍是 hidden）', () => {
    const start = mainSrc.indexOf('function enterBackgroundDock()');
    const body = mainSrc.slice(start, mainSrc.indexOf('function leaveBackgroundDock', start));
    // ★ 2026-10-23 用户实报「直接缩到任务框里就没了」：停靠时**保留**任务栏按钮，
    //   否则唯一入口只剩托盘；点任务栏图标会被 minimize 处理器拉回前台。
    assert.match(body, /setSkipTaskbar\(false\)/, '停靠必须保留任务栏按钮（用户能从任务栏找回）');
    assert.match(body, /setPosition\(-32000, -32000\)/, '停靠应把窗口移出屏幕');
    assert.match(body, /showInactive\(\)/, '从 hide() 进来的场景必须重新 show，否则仍 hidden');
    assert.match(body, /applyGuestThrottling\(\)/, '停靠时必须重算 guest 节流');
  });

  test('★ 已停靠时点任务栏图标要能把窗口拉回前台', () => {
    const idx = mainSrc.indexOf("mainWindow.on('minimize'");
    assert.ok(idx > -1, '未找到 minimize handler');
    const body = mainSrc.slice(idx, idx + 400);
    assert.match(body, /if \(dockedOffscreen\) \{ leaveBackgroundDock\(\); return; \}/, '停靠态点任务栏必须恢复窗口');
  });

  test('★ 恢复停靠必须回到原位置（用户实报「回来跑到左上角」）', () => {
    const start = mainSrc.indexOf('function leaveBackgroundDock');
    assert.ok(start > -1, '未找到 leaveBackgroundDock');
    const body = mainSrc.slice(start, start + 2000);
    assert.match(body, /win\.setBounds\(\{ x: saved\.x, y: saved\.y, width: saved\.width, height: saved\.height \}\)/,
      '恢复必须按停靠前保存的几何 setBounds（只 setPosition 会被系统 restore 覆盖）');
    assert.match(body, /win\.center\(\)/, '坐标非法时要居中兜底');
    const showAt = body.indexOf('win.show();');
    const boundsAt = body.indexOf('setBounds(');
    assert.ok(showAt > -1 && boundsAt > showAt, '位置必须在 show/restore 之后落，否则会被系统还原位置覆盖');
  });

  test('★ 自定义标题栏的最小化按钮：自动化中静默后台停靠，其余普通最小化（不弹任何确认框）', () => {
    const idx = mainSrc.indexOf("ipcMain.on('window-minimize'");
    assert.ok(idx > -1, '未找到 window-minimize handler');
    const body = mainSrc.slice(idx, idx + 1600);
    // 没有 agent 在自动化：用户预期优先，直接最小化
    assert.match(body, /!browserWorkInProgress\(\)\) \{ w\.minimize\(\); return; \}/, '无自动化时必须直接最小化');
    // 有 agent 在自动化：直接停靠（真最小化会让微前端停在"加载中"）
    assert.match(body, /if \(!enterBackgroundDock\(\)\)/, '自动化中最小化必须后台停靠');
    // ★ 2026-10-27 用户拍板：最小化不得再弹确认框（实报「最小化不能有提醒」）
    assert.ok(!/showMessageBox/.test(body), '★ 最小化不得再弹「浏览器任务运行中」确认框');
  });

  test('★ 没有存活网页时不算「任务在跑」（预览页没开不该弹最小化确认）', () => {
    const start = mainSrc.indexOf('function browserWorkInProgress()');
    assert.ok(start > -1, '未找到 browserWorkInProgress');
    const body = mainSrc.slice(start, mainSrc.indexOf('\n}', start) + 2);
    // ★ 2026-10-26 用户实报「预览页面没开也这样」：只按 10 分钟时间窗判定会让
    //   零页面的情况下也弹「浏览器任务运行中」。必须同时要求有存活 guest。
    assert.match(body, /hasLiveBrowserPage\(\)/, '★ 只按时间窗判定 → 没页面也会弹确认框');
    const liveStart = mainSrc.indexOf('function hasLiveBrowserPage()');
    assert.ok(liveStart > -1, '未找到 hasLiveBrowserPage');
    const liveBody = mainSrc.slice(liveStart, mainSrc.indexOf('\n}', liveStart) + 2);
    assert.match(liveBody, /allGuestWebContents\(\)\.length > 0/, '存活网页必须以实际 guest 为准');
  });

  // ★ 2026-10-27 用户实报：「pageAgent 停止了，页面开着没问题，但最小化不能还有提醒」。
  //   根因：判据是「10 分钟内有过 agent 动作」—— 那是"最近来过浏览器"，不是"此刻在自动化"。
  test('★ 只有真的在自动化才算「任务在跑」（收工后最小化不得再弹窗）', () => {
    const start = mainSrc.indexOf('function browserWorkInProgress()');
    assert.ok(start > -1, '未找到 browserWorkInProgress');
    const body = mainSrc.slice(start, mainSrc.indexOf('\n}', start) + 2);
    assert.match(body, /tabActionBusy\.size > 0/, '★ 缺"动作正在执行"判据 → 长动作期间会被当成空闲');
    assert.match(body, /BROWSER_ACTION_GRACE_MS/, '★ 必须用动作宽限，而不是 10 分钟时间窗');
    assert.ok(!/BACKGROUND_DOCK_IDLE_MS/.test(body), '★ 10 分钟"最近来过"判据会让收工后仍弹窗');
    const constAt = mainSrc.indexOf('const BROWSER_ACTION_GRACE_MS');
    assert.ok(constAt > -1, '未找到 BROWSER_ACTION_GRACE_MS');
    assert.match(mainSrc.slice(constAt, constAt + 400), /45 \* 1000/, '宽限必须与渲染层 BROWSER_LIVE_GRACE_MS 同为 45s');
  });

  test('★ 点 X 关窗（隐藏到托盘）任务在跑时也必须停靠', () => {
    const idx = mainSrc.indexOf("mainWindow.on('close'");
    assert.ok(idx > -1, '未找到 close handler');
    const body = mainSrc.slice(idx, idx + 500);
    assert.match(body, /browserWorkInProgress\(\) && enterBackgroundDock\(\)/, '★ 关窗路径漏了停靠');
  });

  test('★ 用户先最小化、任务后开始：动作到达时补停靠', () => {
    const idx = mainSrc.indexOf('async function runBrowserAction');
    assert.ok(idx > -1, '未找到 runBrowserAction');
    const body = mainSrc.slice(idx, idx + 4000);
    assert.match(body, /if \(convId\) \{[\s\S]{0,200}lastBrowserActionAt = Date\.now\(\)/, '必须只对 agent 路径记账');
    assert.match(body, /isWindowOffView\(\)\) enterBackgroundDock\(\)/, '★ 动作到达时窗口不在视野必须补停靠');
  });

  test('托盘恢复要认停靠态（停靠时 isVisible 仍为 true）', () => {
    const idx = mainSrc.indexOf('const createTray');
    const body = mainSrc.slice(idx, idx + 2500);
    assert.match(body, /dockedOffscreen/, '托盘切换必须处理停靠态');
    assert.match(body, /leaveBackgroundDock\(\)/, '托盘点击应能退出停靠');
  });
});

// ★★★ 主窗口重绘/崩溃兜底（2026-10-27 用户实报「浏览器操作我最小化了，应用直接黑屏了」）
describe('主窗口恢复重绘 + 渲染进程崩溃自愈', () => {
  test('恢复可见性时必须 invalidate 主窗口自身 webContents（GPU 合成层丢弃 = 黑屏）', () => {
    const idx = mainSrc.indexOf("for (const ev of ['restore', 'maximize'");
    assert.ok(idx > -1, '未找到恢复事件组');
    const body = mainSrc.slice(idx, idx + 1200);
    assert.match(body, /mainWindow\.webContents\.invalidate\(\)/, '恢复后必须强制重绘主窗口自身');
    assert.match(body, /setTimeout/, '必须有下一拍补绘（系统恢复动画晚一拍时首帧仍可能被丢弃）');
  });

  test('主窗口渲染进程崩溃必须有自动重载兜底（崩溃 = 永久黑屏）', () => {
    const idx = mainSrc.indexOf("mainWindow.webContents.on('render-process-gone'");
    assert.ok(idx > -1, '★ 主窗口 render-process-gone 零处理 → 崩溃即永久黑屏');
    const body = mainSrc.slice(idx, idx + 1500);
    assert.match(body, /MAIN_CRASH_RELOAD_LIMIT/, '必须有防循环上限');
    assert.match(body, /webContents\.reload\(\)/, '崩溃后必须自动重载（状态由后端兜底，比重启应用好）');
  });
});

describe('节流判定同源：任何新 guest 都按窗口可见性设置', () => {
  test('browser:wv:register 不再无条件 true', () => {
    const idx = mainSrc.indexOf("ipcMain.handle('browser:wv:register'");
    assert.ok(idx > -1, '未找到 register handler');
    const body = mainSrc.slice(idx, idx + 1800);
    assert.match(body, /setBackgroundThrottling\(!isWindowOffView\(\)\)/, '★ 注册时写死 true 会让最小化后导航一次就重新节流');
  });

  test('will-attach-webview 同样按窗口可见性设置', () => {
    assert.match(mainSrc, /webPreferences\.backgroundThrottling = !isWindowOffView\(\);/, '新挂载的 guest 也必须同源');
  });

  test('hide/show 与 minimize/restore 都重算节流', () => {
    for (const ev of ['minimize', 'restore', 'hide', 'show']) {
      assert.match(mainSrc, new RegExp(`mainWindow\\.on\\('${ev}'[\\s\\S]{0,200}applyGuestThrottling`), `${ev} 事件必须重算节流`);
    }
  });
});

describe('编号层：补尾随重绘 + 监听布局变化 + 失败清理', () => {
  test('★ 节流不能再"未到点直接丢"', () => {
    assert.doesNotMatch(mainSrc, /if\(now-lastPaint<150\)return;/, '★ 旧写法会永久丢帧，导致残留旧编号框');
    assert.match(mainSrc, /var wait=150-\(Date\.now\(\)-lastPaint\);/, '必须计算剩余等待时间');
    assert.match(mainSrc, /timer=setTimeout\(function\(\)\{timer=null;/, '必须补一次尾随重绘');
  });

  test('★ MutationObserver 必须监听 class/style（只监听 childList 会漏掉移动）', () => {
    assert.match(
      mainSrc,
      /attributes:true,attributeFilter:\['style','class','hidden','disabled','aria-hidden'\]/,
      '★ 缺 attributes 监听 → 靠 CSS 改位置的按钮编号框不跟随',
    );
  });

  test('transitionend/animationend 也要触发重绘，且在 dispose 里解绑', () => {
    const start = mainSrc.indexOf('var count=paint();');
    const body = mainSrc.slice(start, start + 2500);
    assert.match(body, /addEventListener\('transitionend',schedule,true\)/, '缺 transitionend');
    assert.match(body, /addEventListener\('animationend',schedule,true\)/, '缺 animationend');
    const dispose = body.slice(body.indexOf('function dispose()'));
    assert.match(dispose, /removeEventListener\('transitionend',schedule,true\)/, 'dispose 必须解绑 transitionend');
    assert.match(dispose, /removeEventListener\('animationend',schedule,true\)/, 'dispose 必须解绑 animationend');
  });

  test('★ 标注截图失败时覆盖层必须清理（finally）', () => {
    const idx = mainSrc.indexOf('if (args.annotate) {');
    assert.ok(idx > -1, '未找到 annotate 分支');
    const body = mainSrc.slice(idx, idx + 5000);
    const finallyIdx = body.indexOf('} finally {');
    assert.ok(finallyIdx > -1, '★ 覆盖层清理必须在 finally 里 —— capturePage 抛错时也要执行');
    // 清理语句用变量 overlayId（字面量只出现在上面声明处），按变量名 + remove 判定
    const finallyBody = body.slice(finallyIdx, finallyIdx + 600);
    assert.match(finallyBody, /getElementById\([^)]*overlayId/, '★ finally 里必须按 overlayId 移除标注覆盖层');
    assert.match(finallyBody, /p\.remove\(\)/, '★ finally 里必须真正移除覆盖层');
  });
});

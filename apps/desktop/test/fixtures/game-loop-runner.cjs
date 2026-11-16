// game-runloop-scenario.test.cjs 的 Electron 侧执行器：
// 起真 BrowserWindow 加载模拟游戏页，从 main.cjs 抽取 ===RUNLOOP-START/END=== 的
// 真实 executeRunLoop，用真实输入事件（sendInputEvent）+ 真实页面脚本跑完整个 plan，
// 把结果以 `RESULT:{json}` 打到 stdout，由父测试断言。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');

const MAIN = fs.readFileSync(process.env.YZ_MAIN_CJS, 'utf8');
const s = MAIN.indexOf('// ===RUNLOOP-START===');
const e = MAIN.indexOf('// ===RUNLOOP-END===');
if (s < 0 || e <= s) { console.error('RESULT:' + JSON.stringify({ fatal: 'main.cjs 缺少 RUNLOOP 哨兵块' })); process.exit(1); }
const block = MAIN.slice(s, e);
// 块内定义 `async function executeRunLoop(plan, io)` —— 包装成可直接调用的形态
const runLoop = new Function('plan', 'io', block + '\nreturn executeRunLoop(plan, io);');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true, width: 800, height: 600, useContentSize: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  try {
    await win.loadFile(process.env.YZ_FIXTURE);
    const wc = win.webContents;
    const io = {
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      keyDown: (k) => wc.sendInputEvent({ type: 'keyDown', keyCode: k }),
      keyUp: (k) => wc.sendInputEvent({ type: 'keyUp', keyCode: k }),
      // ★ clickCount:1 必须带 —— 缺了 Chromium 不把它合成 click 事件
      //   （主进程 run_loop 的 io 同款，见 main.cjs case 'run_loop'）
      mouseDown: (x, y) => wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }),
      mouseUp: (x, y) => wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }),
      mouseMove: (x, y) => wc.sendInputEvent({ type: 'mouseMove', x, y }),
      isAborted: () => false,
      runScript: (src) => wc.executeJavaScript(src),
      http: async () => { throw new Error('http 步在本测试禁用'); },
    };
    const plan = JSON.parse(fs.readFileSync(process.env.YZ_PLAN, 'utf8'));
    const res = await runLoop(plan, io);
    const level = await wc.executeJavaScript('window.__game.level');
    const popupGone = await wc.executeJavaScript("!document.getElementById('popup')");
    console.log('RESULT:' + JSON.stringify({ ...res, level, popupGone }));
  } catch (err) {
    console.log('RESULT:' + JSON.stringify({ fatal: String((err && err.message) || err).slice(0, 200) }));
  } finally {
    try { win.destroy(); } catch { /* ignore */ }
    setTimeout(() => app.exit(0), 50);
  }
});

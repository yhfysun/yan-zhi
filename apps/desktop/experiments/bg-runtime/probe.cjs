// 最小化可行性实验（一次性脚手架，不参与产品代码/测试）
//
// 问题：应用最小化后 pageAgent 动作失败。到底哪一层坏了？
//   ① visibilityState 是否 hidden（微前端按它停渲染）
//   ② rAF / 定时器是否停摆（backgroundThrottling 能否救）
//   ③ guest 自己的 capturePage 是否可用（产品截图失败的直接来源）
//
// 本版严格复刻产品默认：主窗口 backgroundThrottling=true，guest 也 true；
// 然后对比「最小化后什么都不做」与「最小化后调用 guest.setBackgroundThrottling(false)」。
//
// 跑法：apps/desktop/node_modules/.bin/electron probe.cjs

const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

app.setPath('userData', path.join(os.tmpdir(), 'exp-bg-runtime-userdata'));
const RESULT = path.join(__dirname, 'result.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emit(payload) {
  const text = JSON.stringify(payload, null, 2);
  try { fs.writeFileSync(RESULT, text, 'utf8'); } catch { /* stdout 为主通道 */ }
  process.stdout.write('\n=== 结果 ===\n' + text + '\n');
}

const PROBE = `(async () => {
  let raf = 0;
  let stop = false;
  const tick = () => { if (stop) return; raf++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const timerStart = Date.now();
  await new Promise(r => setTimeout(r, 300));
  const timerDelay = Date.now() - timerStart;
  await new Promise(r => setTimeout(r, 700));
  stop = true;
  return { visibility: document.visibilityState, hasFocus: document.hasFocus(),
           rafPerSecond: raf, timerDelay };
})()`;

async function main() {
  let guestWc = null;
  const win = new BrowserWindow({
    width: 1100, height: 760, show: true,
    // 产品主窗口就是 true（main.cjs:924），guest 由 will-attach-webview 显式设 true
    webPreferences: { webviewTag: true, backgroundThrottling: true },
  });
  win.webContents.on('did-attach-webview', (_e, wc) => { guestWc = wc; });
  await win.loadFile(path.join(__dirname, 'embedder.html'));
  await sleep(1500);
  if (!guestWc) throw new Error('guest 未挂上');

  const run = async (label) => {
    await sleep(600);
    let probe;
    try { probe = await guestWc.executeJavaScript(PROBE); } catch (e) { probe = { error: String((e && e.message) || e) }; }
    let capture = 'ok';
    try {
      const img = await guestWc.capturePage();
      capture = img.isEmpty() ? 'empty' : 'ok';
    } catch (e) { capture = 'THREW: ' + String((e && e.message) || e); }
    const row = { probe, guestCapture: capture, minimized: win.isMinimized(), visible: win.isVisible() };
    process.stdout.write('[' + label + '] ' + JSON.stringify(row) + '\n');
    return row;
  };

  const results = {};
  win.show(); win.focus(); await sleep(900);
  results.normal = await run('normal');

  // 产品现状：minimize 事件里对所有 guest 调 setBackgroundThrottling(false)。
  // 这里先测「不调」的基线，再测「调了」是否真的救得回来。
  win.minimize(); await sleep(1000);
  results.minimizedDefault = await run('minimized-default-throttled');

  try { guestWc.setBackgroundThrottling(false); } catch (e) { process.stdout.write('[warn] setBackgroundThrottling threw: ' + e.message + '\n'); }
  await sleep(1000);
  results.minimizedThrottlingOff = await run('minimized+throttleOff');

  win.restore(); await sleep(1000);
  results.restored = await run('restored');

  // 对照：窗口移出屏幕（不最小化）—— 用户看不见，但窗口仍 visible
  win.setPosition(-32000, -32000); await sleep(1000);
  results.offscreen = await run('offscreen-not-minimized');

  win.setPosition(100, 100); await sleep(300);
  emit({ ok: true, results });
  await sleep(200);
  app.exit(0);
}

app.whenReady().then(() => main().catch((e) => {
  emit({ ok: false, error: String((e && e.stack) || e) });
  setTimeout(() => app.exit(1), 200);
}));
setTimeout(() => { emit({ ok: false, error: 'hard timeout' }); app.exit(2); }, 60000);

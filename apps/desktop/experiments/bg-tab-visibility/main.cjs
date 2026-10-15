// P0 实验入口 —— 见 docs/background-tab-parallel-plan.md §0.5 / §4.4
//
// 测什么：
//   ① 后台标签页的**挂载形态**（铺满+opacity:0 / 移出视口 / 0×0 / display:none …）
//      各自的 guest 到底还在不在渲染 —— 判据是 rAF 活性与定时器节流，不是 visibilityState；
//   ② `visibilityState` 到底在什么条件下才会变 hidden（窗口最小化？）——
//      这决定了产品里那条"隐藏态"提示是不是"写了但不会响"。
//
// ★ 本目录是一次性实验脚手架，不属于产品代码，也不参与 `node --test`。
//   跑法：apps/desktop/node_modules/.bin/electron apps/desktop/experiments/bg-tab-visibility
//   结果：stdout + 同目录 result.json

const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// 独立 userData：绝不碰真实 app 的库/缓存（默认 userData 按 app 名共享）
app.setPath('userData', path.join(os.tmpdir(), 'exp-bg-tab-visibility-userdata'));

const RESULT_FILE = path.join(__dirname, 'result.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let dumped = false;
// 旁证：guest 到底有没有被创建/挂上（"不可见 ⇒ 连 guest 都不建"是另一类结论，需与 hidden 区分）
const attached = [];

function emit(payload) {
  const text = JSON.stringify(payload, null, 2);
  try { fs.writeFileSync(RESULT_FILE, text, 'utf8'); } catch { /* stdout 仍是主通道 */ }
  process.stdout.write('\n=== P0 实验结果 ===\n' + text + '\n');
}

async function main() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true, // ★ 必须真显示：窗口本身隐藏会让所有 guest 一起变 hidden，实验失去意义
    webPreferences: { webviewTag: true },
  });

  win.webContents.on('did-attach-webview', (_ev, guestWc) => {
    attached.push(guestWc.id);
    process.stdout.write('[attach] guest id=' + guestWc.id + '（累计 ' + attached.length + '）\n');
  });
  win.webContents.on('console-message', (...args) => {
    const ev = args[0];
    const msg = typeof ev === 'object' && ev && 'message' in ev ? ev.message : args[2];
    process.stdout.write('[embedder] ' + msg + '\n');
  });

  await win.loadFile(path.join(__dirname, 'embedder.html'));

  // 一轮探针（同一批 webview 全程不动，只有窗口状态在变）
  const round = async (label, before) => {
    if (before) await before();
    // ★ 等"真的出帧"再测（见 embedder 的 __whenPainted 注释）——否则测到的是"窗口还没热"的假 0 帧
    const paintedTicks = await win.webContents.executeJavaScript('window.__whenPainted()');
    const focused = win.isFocused();
    process.stdout.write('[round] ' + label + ' paintedTicks=' + paintedTicks + ' isFocused=' + focused + '\n');
    const data = await win.webContents.executeJavaScript('window.__start()');
    return { paintedTicks, focused, data };
  };

  // ★ 强制把窗口拉到前台：从后台 shell 启动时窗口常常不是前台，
  //   此时窗口级遮挡会让所有 guest 一起掉帧（首轮就栽在这上面）。
  const foreground = async () => {
    win.show();
    win.moveTop();
    win.focus();
    await sleep(600);
  };

  const results = {};
  results.normal = await round('normal', foreground);
  results.minimized = await round('minimized', () => { win.minimize(); return sleep(800); });
  results.restored = await round('restored', foreground);

  if (!dumped) {
    dumped = true;
    emit({ ok: true, attachedGuests: attached.length, results });
  }
  await sleep(300);
  app.exit(0);
}

app.whenReady().then(() =>
  main().catch((e) => {
    if (!dumped) { dumped = true; emit({ ok: false, error: String((e && e.message) || e) }); }
    setTimeout(() => app.exit(1), 300);
  }),
);

app.on('window-all-closed', () => { if (!dumped) { dumped = true; app.exit(0); } });

setTimeout(() => {
  if (!dumped) { dumped = true; process.stdout.write('硬超时退出（未取到结果）\n'); app.exit(2); }
}, 150 * 1000);

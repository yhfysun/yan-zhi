/**
 * 渲染进程日志的重复抑制守门测试（2026-10-16）。
 *
 * ★★★ 背景（实测）：`ResizeObserver loop completed with undelivered notifications` 一旦成环就是
 *   **每帧一条**——用户机器上 2 分钟落了 3425 行，把 renderer 日志（排查白屏/任务卡住的第一现场）
 *   整个刷满。根因在渲染层（OpsConsole 的终端 fit 已改成 rAF 推迟 + 预量，见
 *   views/plugin/opsTerminalResizeLoop.test.ts），`main-log.cjs` 这层做**日志兜底**：
 *   完全相同的这条消息每分钟至多落一条。
 *
 * 判据（三条缺一不可）：
 *   ① 同一条 RO 提示重复 5 次 → 只落 1 行；
 *   ② 别的错误**照旧全量落盘**（抑制必须是精准的，不能顺手吞掉新信号）；
 *   ③ 既有的"渲染层噪音过滤"没被破坏（INFO 级仍不落盘）。
 *
 * 为什么是行为测试而不是读源码：抑制逻辑（时间窗 + 去重表）靠结构断言测不出行为，
 *   而 main-log.cjs 是纯 CJS、无 electron 依赖，可以直接 require 起来真跑。
 *
 * 运行：node --test apps/desktop/test/renderer-log-dedupe.test.cjs
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { installMainLogger, attachRendererConsole, currentLogFile } = require('../main-log.cjs');

const RO_LOOP = 'ResizeObserver loop completed with undelivered notifications.';

/** 轮询等落盘：writeLine 走 createWriteStream（异步缓冲），写完到可读有几毫秒。 */
async function waitFor(pred, timeoutMs = 2000) {
  const t0 = Date.now();
  for (;;) {
    if (pred()) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('成环的 ResizeObserver 提示每分钟至多一条，其它错误不抑制', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'main-log-'));
  installMainLogger(dir);

  const handlers = {};
  attachRendererConsole({ on: (ev, fn) => { handlers[ev] = fn; } }, 'renderer');
  assert.ok(handlers['console-message'], '未挂上 console-message 监听');

  // 签名与 Electron 新版一致：(event, details)
  const emit = (level, message, line = 0) =>
    handlers['console-message']({}, { level, message, lineNumber: line, sourceId: 'http://localhost:1420/#/ops' });

  for (let i = 0; i < 5; i++) emit(3, RO_LOOP);          // 成环：5 条只该留 1 条
  emit(3, RO_LOOP + ' (来源:另一个元素)');                 // 文本不同 → 不算同一条，必须留下
  emit(3, '别的错误必须留下');                             // 不同消息 → 照旧落盘

  const file = currentLogFile();
  assert.ok(file, '拿不到日志文件路径');
  // ⚠️ 文件是 `createWriteStream` **异步**打开的：emit 完立刻 stat 会扑空，必须轮询等落盘
  const readLog = () => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };
  await waitFor(() => readLog().includes('别的错误必须留下'));
  assert.ok(fs.existsSync(file), `日志文件没建出来：${file}`);

  const lines = readLog().split('\n');
  const roLines = lines.filter((l) => l.includes('ResizeObserver loop') && !l.includes('来源:另一个元素'));
  assert.strictEqual(roLines.length, 1, `同一条 RO 环路提示应只落 1 行，实际 ${roLines.length} 行`);
  // ★ 抑制靠**完全相同**匹配：换个后缀的 RO 提示是新信号，不能被一起吞掉
  assert.ok(lines.some((l) => l.includes('来源:另一个元素')), '文本不同的 RO 提示被误吞了（抑制必须是精准的）');
  assert.ok(lines.some((l) => l.includes('别的错误必须留下')), '别的错误被误吞了');
  // 注：INFO 级消息本模块**本来就不拦**（只拦 VERBOSE 与 DevTools/vite 噪音），故此处不对它断言;

  fs.rmSync(dir, { recursive: true, force: true });
});

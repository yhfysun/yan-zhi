// 终端 ResizeObserver 环路守门测试 —— 防「控制台被 ResizeObserver loop 刷屏」回归。
//
// 背景（2026-10-16 用户实报 + 安装版日志实锤）：
//   renderer 日志在 2 分钟内落了 **3425 条** `ResizeObserver loop completed with undelivered
//   notifications`（16:03:58 → 16:05:45，正在 /ops 页开着终端）。成因是经典反模式：
//   **ResizeObserver 回调里同步改了被观察元素的布局** —— `fitAddon.fit()` 会写 xterm 的内部尺寸
//   → 布局再变 → RO 再次投递 → Chromium 每帧报一条。
//
// 修法（三处缺一不可，只做一半都会原地踏步）：
//   ① 回调里**不同步动布局**：fit 与上报一起推迟到下一帧（`requestAnimationFrame`）；
//   ② 同帧多次通知**合并**成一次（`fitFrame` 占位），否则突发通知会排出一串帧回调；
//   ③ `fitTerm` **预量**：`proposeDimensions()` 与当前行列一致就一行 DOM 都别碰
//      —— 不动 DOM 就绝不会触发下一次投递，这是把环掐死的根。
//   另外：销毁终端时要 **cancelAnimationFrame**，否则回调会在 `term.dispose()` 之后碰一次废对象。
//
// 为什么读源码断言而不是渲染测试：这几个判据全是结构性的（有没有 rAF / 有没有合并 / 有没有预量），
//   而真跑要起 xterm + 容器布局。同口径见 opsTerminalTransport.test.ts 等既有 ops 测试。
// ★ 每条断言都做过变异测试（见文件末尾记录）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const strip = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const CONSOLE = strip(read('OpsConsole.vue'));
const PANEL = strip(read('../../components/chat/ChatConsolePanel.vue'));
const SESSION = strip(read('opsSession.ts'));

/** 截取一段（取不到就抛，避免静默拿到空串让断言变"恒真"）。 */
function slice(src: string, from: string, end: string): string {
  const i = src.indexOf(from);
  expect(i, `源码里找不到起点：${from}`).toBeGreaterThan(-1);
  const j = src.indexOf(end, i + from.length);
  expect(j, `找不到结束标记：${end}`).toBeGreaterThan(-1);
  return src.slice(i, j);
}

describe('OpsConsole 终端：fit 不再在 RO 回调里同步改布局', () => {
  const watch = slice(CONSOLE, 'function watchTermSize(h: TermHandle', 'h.ro.observe(h.el)');

  it('★ RO 回调里不许直接调 fit（必须推迟到下一帧）', () => {
    const rafAt = watch.indexOf('requestAnimationFrame(');
    expect(rafAt, '没有 requestAnimationFrame 推迟').toBeGreaterThan(-1);
    const beforeRaf = watch.slice(0, rafAt);
    // 回调体（rAF 之前的部分）里出现 fitTerm / scheduleResizePost 就是原来那个成环写法
    expect(beforeRaf, 'RO 回调里同步调了 fitTerm（成环的根源）').not.toContain('fitTerm(');
    expect(beforeRaf, 'RO 回调里同步调了 scheduleResizePost').not.toContain('scheduleResizePost(');
    // rAF 之后才真的 fit
    expect(watch.slice(rafAt), 'rAF 里没有 fitTerm').toContain('fitTerm(w);');
  });

  it('同帧多次通知合并成一次（fitFrame 占位）', () => {
    expect(watch, '缺少合并判断').toMatch(/if \(h\.fitFrame !== null\) return;/);
    expect(watch, '未把帧句柄存进 fitFrame').toMatch(/h\.fitFrame = requestAnimationFrame\(/);
    expect(watch, '帧回调里没清空 fitFrame').toMatch(/h\.fitFrame = null;/);
  });

  it('★ fitTerm 先预量：行列没变就一行 DOM 都不碰', () => {
    const fit = slice(CONSOLE, 'function fitTerm(w: OpsWin)', '} catch {');
    expect(fit, '没有用 proposeDimensions 预量').toContain('proposeDimensions()');
    const guardAt = fit.indexOf('proposeDimensions()');
    const fitAt = fit.indexOf('h.fitAddon.fit()');
    expect(fitAt, '找不到真正的 fit 调用').toBeGreaterThan(-1);
    expect(guardAt, '预量必须排在 fit 之前').toBeLessThan(fitAt);
    expect(fit, '预量后没做「相同就返回」').toMatch(/next\.cols === h\.term\.cols && next\.rows === h\.term\.rows\) return;/);
  });

  it('销毁终端时撤掉排队中的那一帧', () => {
    const dispose = slice(CONSOLE, 'function disposeTerminal(w: OpsWin)', 'w.termOpen = false;');
    expect(dispose, 'dispose 未 cancelAnimationFrame（回调会碰已 dispose 的终端）').toMatch(/cancelAnimationFrame\(h\.fitFrame\)/);
    expect(dispose, 'dispose 未断开 RO（原有行为被破坏）').toMatch(/h\.ro\?\.disconnect\(\)/);
  });

  it('TermHandle 有 fitFrame 字段且初始化过', () => {
    expect(SESSION, 'TermHandle 缺 fitFrame 字段').toMatch(/fitFrame: number \| null;/);
    expect(CONSOLE, '建立句柄时没初始化 fitFrame').toMatch(/timer: null, fitFrame: null/);
  });
});

describe('ChatConsolePanel 本地控制台：同一反模式一并修掉', () => {
  const ro = slice(PANEL, 'const ro = new ResizeObserver(() => {', 's.resizeObserver = ro;');

  it('★ RO 回调里不同步 fit，且预量后再 fit', () => {
    const rafAt = ro.indexOf('requestAnimationFrame(');
    expect(rafAt, '没有 requestAnimationFrame 推迟').toBeGreaterThan(-1);
    expect(ro.slice(0, rafAt), 'RO 回调里同步调了 fit（成环的根源）').not.toContain('.fit()');
    // 合并判断在 rAF **之前**（同帧已排队就直接 return）
    expect(ro, '缺少合并判断').toMatch(/if \(s\.fitFrame !== null\) return;/);
    expect(ro, '未把帧句柄存进 fitFrame').toMatch(/s\.fitFrame = requestAnimationFrame\(/);
    const after = ro.slice(rafAt);
    expect(after, '没有用 proposeDimensions 预量').toContain('proposeDimensions()');
    expect(after, '找不到真正的 fit 调用').toMatch(/s\.fitAddon\?\.fit\(\)/);
  });

  it('teardown 时撤掉排队中的那一帧', () => {
    const teardown = slice(PANEL, 'function teardownSession(s: ConsoleSession)', 's.sessionId = ');
    expect(teardown, 'teardown 未 cancelAnimationFrame').toMatch(/cancelAnimationFrame\(s\.fitFrame\)/);
  });
});

// ---- 变异测试记录（临时改源码 → 对应断言必须报红，改回后全绿）----
//
// | 变异                                              | 触发断言 |
// |---------------------------------------------------|----------|
// | OpsConsole：RO 回调里直接 fitTerm(w)（改回旧写法） | 回调里不许直接调 fit |
// | OpsConsole：去掉 fitFrame 合并判断                 | 同帧多次通知合并 |
// | OpsConsole：fitTerm 去掉 proposeDimensions 预量    | 先预量 |
// | OpsConsole：dispose 不 cancelAnimationFrame        | 销毁时撤帧 |
// | ChatConsolePanel：RO 回调里同步 fit                | 回调里不同步 fit |
// | ChatConsolePanel：teardown 不撤帧                  | teardown 撤帧 |

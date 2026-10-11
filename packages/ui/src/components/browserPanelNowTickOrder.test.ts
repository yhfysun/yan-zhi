// BrowserPanel.vue 的「声明顺序 / TDZ」守门测试 —— 防 2026-10-11 那次重大回归。
//
// 背景（2026-10-11 用户实报）：
//   「最近运行的任务报错啊啊，而且页面很卡根本滚动不了。。。预览的浏览器页面也不会打开了」
//
//   三个现象同源，根因是 `BrowserPanel.vue` 里的 **暂时性死区（TDZ）**：
//     - `nowTick` 声明在"去 3s 轮询改造"时被挪到了使用它的 computed **之后**
//     - `watch(inputLocked, cb)` 在**创建时同步求值** inputLocked →
//       lockStaleByHardLimit → 读 `nowTick.value` → 此刻 const 尚未初始化
//     - 抛 `ReferenceError: Cannot access 'nowTick' before initialization`
//   后果（日志实证）：
//     ① setup 抛异常 → 组件挂载失败 → `<webview>` 从不创建
//        → 主进程 `自建后等待 guest wc=NULL(8s 超时)` → 预览浏览器打不开
//     ② 每次 update 重试刷爆主线程（"Unhandled error during execution of
//        component update" 反复出现）→ 页面卡死、滚不动
//     ③ 浏览器工具全挂（"该会话尚未绑定浏览器页面"）+ 任务循环拦截
//
// ★ 修复：保证声明顺序 nowTick → lockStaleByHardLimit → inputLocked → watch。
//   本测试把该顺序钉死 —— 若有人再重排代码，这里立刻红。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');

/** 取出 <script setup> 区块（含行号），供"声明顺序"类断言使用 */
function scriptSetupWithLines(src: string): { code: string; lineOffset: number } {
  const marker = '<script setup';
  const start = src.indexOf(marker);
  expect(start, '未找到 <script setup> 区块').toBeGreaterThanOrEqual(0);
  const end = src.indexOf('</' + 'script>', start);
  expect(end, '未找到 script 结束标签').toBeGreaterThan(start);
  // 计算 script 起始的**文件行号**（1-based）
  const lineOffset = src.slice(0, start).split('\n').length;
  return { code: src.slice(start, end), lineOffset };
}

/** 去掉注释，避免注释里的字样（如文档中提到的 `nowTick.value`）造成误判 */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*/gm, '');
}

describe('BrowserPanel · nowTick 声明顺序（TDZ 守门）', () => {
  const { code } = scriptSetupWithLines(PANEL);
  const clean = stripComments(code);
  const lines = clean.split('\n');

  it('★ nowTick 以 const 声明，且唯一', () => {
    const decls = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /(?:^|\s)const\s+nowTick\s*=/.test(l));
    expect(decls.length, `nowTick 应有且仅有一处 const 声明，实际 ${decls.length} 处`).toBe(1);
  });

  it('★★★ 所有 nowTick.value 的使用都必须在声明之后（无 TDZ）', () => {
    const declIdx = lines.findIndex((l) => /(?:^|\s)const\s+nowTick\s*=/.test(l));
    expect(declIdx, '未找到 nowTick 声明').toBeGreaterThanOrEqual(0);

    const useIdx = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /nowTick\.value/.test(l))
      .map(({ i }) => i);

    expect(useIdx.length, 'nowTick.value 竟无任何使用点，测试可能失焦').toBeGreaterThan(0);

    const beforeDecl = useIdx.filter((i) => i < declIdx);
    expect(
      beforeDecl,
      `★ TDZ 回归：以下行在 nowTick 声明之前就引用了 nowTick.value：` +
        beforeDecl.map((i) => `行偏移${i}`).join(', ') +
        `（声明在偏移${declIdx}）。watch(...) 创建时会同步求值 getter，` +
        `先引用后声明 => ReferenceError: Cannot access 'nowTick' before initialization`,
    ).toEqual([]);
  });

  it('★★ lockStaleByHardLimit 声明必须在 nowTick 之后（它直接读 nowTick.value）', () => {
    const nowIdx = lines.findIndex((l) => /(?:^|\s)const\s+nowTick\s*=/.test(l));
    const lockIdx = lines.findIndex((l) => /const\s+lockStaleByHardLimit\s*=/.test(l));
    expect(lockIdx, '未找到 lockStaleByHardLimit 声明').toBeGreaterThanOrEqual(0);
    expect(lockIdx, 'lockStaleByHardLimit 不能在 nowTick 之前（会触发 TDZ）').toBeGreaterThan(nowIdx);
  });

  it('★★ inputLocked 声明必须在 lockStaleByHardLimit 之后（依赖链顺序）', () => {
    const lockIdx = lines.findIndex((l) => /const\s+lockStaleByHardLimit\s*=/.test(l));
    const inputIdx = lines.findIndex((l) => /const\s+inputLocked\s*=/.test(l));
    expect(inputIdx, '未找到 inputLocked 声明').toBeGreaterThanOrEqual(0);
    expect(inputIdx, 'inputLocked 依赖 lockStaleByHardLimit，必须先有后者').toBeGreaterThan(lockIdx);
  });

  it('★★ watch(inputLocked, ...) 必须在 inputLocked 声明之后（创建即同步求值 getter）', () => {
    const inputIdx = lines.findIndex((l) => /const\s+inputLocked\s*=/.test(l));
    const watchIdx = lines.findIndex((l) => /watch\(\s*inputLocked\s*,/.test(l));
    expect(watchIdx, '未找到 watch(inputLocked, ...)').toBeGreaterThanOrEqual(0);
    expect(watchIdx, 'watch(inputLocked) 会立即求值，必须在 inputLocked 之后').toBeGreaterThan(inputIdx);
  });

  it('★ nowTick 的调度器（scheduleNowTick）与其 watch 也必须晚于 nowTick 声明', () => {
    const nowIdx = lines.findIndex((l) => /(?:^|\s)const\s+nowTick\s*=/.test(l));
    const schedIdx = lines.findIndex((l) => /function\s+scheduleNowTick\s*\(/.test(l));
    const watchIdx = lines.findIndex((l) => /watch\(\s*\(\)\s*=>\s*chatStore\.lastBrowserToolAt/.test(l));
    expect(schedIdx, '未找到 scheduleNowTick').toBeGreaterThanOrEqual(0);
    expect(watchIdx, '未找到 lastBrowserToolAt 的 watch').toBeGreaterThanOrEqual(0);
    expect(schedIdx, 'scheduleNowTick 引用了 nowTick，必须在声明之后').toBeGreaterThan(nowIdx);
    expect(watchIdx, 'lastBrowserToolAt 的 watch（immediate）会立即写 nowTick.value，必须在声明之后').toBeGreaterThan(nowIdx);
  });
});

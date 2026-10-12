// 关 tab 双重摘除竞态的守门测试（2026-10-12）—— 防回归。
//
// 背景（用户实报）：「浏览器打开多个 tab，关闭第一个 tab 就全部都关闭了」。
//
// 根因（渲染层双重摘除竞态）：
//   closeTab(tabId) 先缓存 idx → `await api.browserView.closeTab(tabId, true)` →
//   主进程 closeTabById 内部**无条件** broadcastTabClosed(tabId)（与 fromUi 无关）→
//   渲染层 onTabClosed 处理器**先于 invoke 返回**按 tabId splice 摘除了该 tab 壳 →
//   IPC 返回后渲染层用**关闭前算的旧 idx** 再 `splice(idx, 1)` →
//   把相邻 tab 误删（开 2 个关 1 个 → 两个都没了，用户视角就是"关一个全关"）。
//
// 修法：await IPC 之后一律**按 tabId 重算** findIndex 再 splice（找不到 = 广播路径已摘，幂等跳过）；
//   激活位顶替目标同样重算。ctxClose 的 'tab'/'left'/'right'/'others' 分支同修。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = packages/ui/src/components → 上溯 4 层到 repo 根
const REPO = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const PANEL = read('packages/ui/src/components/BrowserPanel.vue');

/** 取 `async function <name>(` 起、到下一个顶层 `async function` / 文件尾之间的函数体 */
function fnBody(name: string): string {
  const start = PANEL.indexOf(`async function ${name}(`);
  expect(start, `未找到 async function ${name}(`).toBeGreaterThanOrEqual(0);
  const rest = PANEL.slice(start + 1);
  const next = rest.search(/\nasync function \w+\(/);
  return next >= 0 ? rest.slice(0, next) : rest;
}

describe('★★★ 关 tab 必须按 tabId 重算下标（防 IPC 广播双重摘除误删相邻 tab）', () => {
  it('closeTab：await IPC 之后重算 findIndex，splice 不用 await 前算的 idx', () => {
    const body = fnBody('closeTab');
    const awaitIdx = body.indexOf('browserView.closeTab');
    expect(awaitIdx, 'closeTab 内未找到 await IPC 调用').toBeGreaterThanOrEqual(0);
    const afterAwait = body.slice(awaitIdx);
    expect(
      afterAwait,
      '★ closeTab 在 await IPC 后仍用旧 idx splice —— 主进程 broadcastTabClosed 先到时 onTabClosed 已摘壳，' +
      '旧 idx 会误删相邻 tab（2026-10-12 实报「开多个 tab 关第一个就全关」）',
    ).toMatch(/findIndex\(/);
    expect(afterAwait).toMatch(/splice\(\s*liveIdx\s*,/);
  });

  it('ctxClose（tab/left/right/others 分支）：await IPC 之后同样重算 findIndex', () => {
    const body = fnBody('ctxClose');
    const awaitIdx = body.indexOf('browserView.closeTab');
    expect(awaitIdx, 'ctxClose 内未找到 await IPC 调用').toBeGreaterThanOrEqual(0);
    const afterAwait = body.slice(awaitIdx);
    expect(
      afterAwait,
      '★ ctxClose 逐个关闭分支在 await IPC 后用旧 idx splice —— 同 closeTab 的竞态（误删相邻 tab）',
    ).toMatch(/findIndex\(/);
    expect(afterAwait).toMatch(/splice\(\s*liveIdx\s*,/);
  });

  it('★★ closeTab / ctxClose 函数体内不得再用 await 前算的 idx 直接 splice', () => {
    for (const name of ['closeTab', 'ctxClose']) {
      const body = fnBody(name);
      expect(
        body,
        `★ ${name} 仍存在 splice(idx, ...) —— await IPC 期间 tabs 可能已被广播路径摘除，旧 idx 必误删`,
      ).not.toMatch(/splice\(\s*idx\s*,/);
    }
  });

  it('★ onTabClosed 广播处理器保持同步 splice + idx<0 幂等保护（它是广播侧唯一摘除点）', () => {
    // 广播处理器内 idx 是同步刚算的、无 await 间隔，不存在竞态 —— 保持原样，
    // 但必须有 `if (idx < 0) return` 幂等保护，防止重复广播/未知 tabId 时 splice(-1) 误删末位。
    const i = PANEL.indexOf('onTabClosed?.(');
    expect(i, '未找到 onTabClosed 注册').toBeGreaterThanOrEqual(0);
    const block = PANEL.slice(i, i + 700);
    expect(block).toMatch(/if\s*\(idx\s*<\s*0\)\s*return/);
    expect(block).toMatch(/tabs\.value\.splice\(idx,\s*1\)/);
  });

  it('★ closeTab 的激活位顶替也用重算后的 liveIdx（不用过期 idx）', () => {
    const body = fnBody('closeTab');
    expect(
      body,
      '★ 顶替目标用了过期 idx —— 广播已摘壳时 tabs.value[idx] 指向的是另一个 tab',
    ).not.toMatch(/tabs\.value\[idx\]/);
  });
});

// 浏览器「执行流锁」测试（2026-10-15「导航跑偏」P0-① 第二层）
//
// 背景（实证）：浏览器是单活动页状态机 —— 两条逻辑流并发驱动同一会话锚页必然互踩
// （A 导航完 B 立刻覆盖 → A 读到 B 的页 → 判定"导航没生效" → 乒乓；实测单会话 57 次）。
// 第一层（同批 call_agent 串行化）覆盖主路径，本锁覆盖后台 async / PlanRunner 并行项 /
// 主循环与后台流并发这三条。
//
// 分层：① 锁本体**真跑**（FIFO / 有界超时 / 中止 / 幂等释放）；
//      ② 接线守卫（判据对了但没接上 = 静默失效，本项目多次栽过）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createFlowLock, tryAcquireFlow, acquireFlow, releaseFlow, flowOwnerOf,
} from '../src/services/browser-flow-lock.js';

const REPO = resolve(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));

describe('① 锁本体（真跑）', () => {
  it('空闲 → 拿到；被别的流占着 → false；**已属于自己** → true（幂等，供"先占位再进 ReAct"共用）', () => {
    const lock = createFlowLock();
    expect(tryAcquireFlow(lock, 'sub:A')).toBe(true);
    expect(flowOwnerOf(lock)).toBe('sub:A');
    expect(tryAcquireFlow(lock, 'sub:A'), '★ 同流重复取锁被拒 → 后台"先占位"路径会误报占用').toBe(true);
    expect(tryAcquireFlow(lock, 'sub:B')).toBe(false);
    expect(flowOwnerOf(lock), '★ 尝试失败不应改持有者').toBe('sub:A');
  });

  it('★ 释放唤醒下一个等待者（FIFO），非持有者释放是幂等 no-op', async () => {
    const lock = createFlowLock();
    tryAcquireFlow(lock, 'sub:A');
    const order: string[] = [];
    const pB = acquireFlow(lock, 'sub:B', undefined, 1000).then((ok) => { if (ok) order.push('B'); return ok; });
    const pC = acquireFlow(lock, 'sub:C', undefined, 1000).then((ok) => { if (ok) order.push('C'); return ok; });
    // 先到先得：B 拿、C 排
    releaseFlow(lock, 'sub:A');
    await pB;
    expect(order, '★ B 未先拿到（FIFO 被破坏）').toEqual(['B']);
    expect(flowOwnerOf(lock)).toBe('sub:B');
    // 非持有者释放不得把锁弄丢
    releaseFlow(lock, 'sub:X');
    expect(flowOwnerOf(lock), '★ 非持有者释放把锁释放了 → 并发失守').toBe('sub:B');
    releaseFlow(lock, 'sub:B');
    await pC;
    expect(order).toEqual(['B', 'C']);
    releaseFlow(lock, 'sub:C');
    expect(flowOwnerOf(lock), '★ 无人持有时应回到空闲').toBeNull();
    expect(tryAcquireFlow(lock, 'sub:D')).toBe(true);
  });

  it('★★ 等待**有界**：超时返回 false（绝不无限等）', async () => {
    const lock = createFlowLock();
    tryAcquireFlow(lock, 'sub:A');
    const t0 = Date.now();
    const ok = await acquireFlow(lock, 'sub:B', undefined, 60);
    expect(ok, '★ 超时未返回 false → 子任务会无限挂起').toBe(false);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
    // 超时的等待者必须**已出队**（否则 release 会把锁交给一个已死的 waiter → 锁永久丢失）
    releaseFlow(lock, 'sub:A');
    expect(flowOwnerOf(lock), '★ 超时者的残留占位 → 锁永久丢失').toBeNull();
  });

  it('★★ 任务中止 → 立即放弃等待（不把中止拖成超时）', async () => {
    const lock = createFlowLock();
    tryAcquireFlow(lock, 'sub:A');
    const ac = new AbortController();
    const p = acquireFlow(lock, 'sub:B', ac.signal, 5000);
    ac.abort();
    expect(await p).toBe(false);
    releaseFlow(lock, 'sub:A');
    expect(flowOwnerOf(lock)).toBeNull();
  });

  it('★ 已中止的任务不再入队（直接 false）', async () => {
    const lock = createFlowLock();
    tryAcquireFlow(lock, 'sub:A');
    const ac = new AbortController();
    ac.abort();
    expect(await acquireFlow(lock, 'sub:B', ac.signal, 5000)).toBe(false);
  });
});

describe('② 接线守卫（判据对了但没接上 = 静默失效）', () => {
  it('★★★ runSubAgent 必须**整个运行期**持锁 + finally 释放（覆盖后台/计划项/工作流）', () => {
    const i = LTM.indexOf('async function runSubAgent(');
    expect(i, '★ 锚点缺失：runSubAgent').toBeGreaterThan(-1);
    const seg = LTM.slice(i, LTM.indexOf('\nasync function runSubAgentImpl(', i));
    expect(seg, '★ 未取流锁 → 后台/并行计划项仍会并发驱动浏览器').toMatch(/acquireFlow\(/);
    expect(seg, '★ 未按"是否浏览器型"判定 → 非浏览器子智能体被无谓串行化').toMatch(/isBrowserCapableSubAgent\(|toolIdsIncludeBrowser\(/);
    expect(seg, '★ 缺 finally 释放 → 异常/中止路径把锁带走，后续浏览器任务全被挡').toMatch(/finally\s*\{[\s\S]*releaseFlow\(/);
    expect(seg, '★ 等待超时的文案必须说明"未启动"（不能静默或假装已启动）').toMatch(/未启动/);
  });

  it('★★★ 后台子任务必须**启动前先占位**（fire-and-forget 事后才发现就白跑一轮）', () => {
    const i = LTM.indexOf('async function startBackgroundSubAgent(');
    const seg = LTM.slice(i, LTM.indexOf('\nasync function runSubAgent(', i));
    expect(seg, '★ 未先占位 → 两个浏览器型后台任务并发抢锚').toMatch(/tryAcquireFlow\(/);
    expect(seg, '★ 占用时未给可行动文案（改同步/稍后再委派）').toMatch(/同步/);
    expect(seg, '★ 后台 finally 未释放（no-op 兜底缺失）').toMatch(/releaseFlow\(/);
  });

  it('★★★ 主循环的 browser_* 必须在后台流占用时**显式拒绝**（不静默并发、不等待撞超时）', () => {
    const i = LTM.indexOf('if (isBrowser) {');
    expect(i, '★ 锚点缺失：浏览器执行分支').toBeGreaterThan(-1);
    const seg = LTM.slice(i, i + 2600);
    expect(seg, '★ 主循环未检查流锁 → 与后台子任务并发驱动同一锚页（乒乓复发）')
      .toMatch(/flowOwnerOf\(task\.browserFlow\)/);
    expect(seg, '★ 仅在 depth===0（主循环）时判定 —— 子智能体自己持锁时不得自我拒绝').toMatch(/depth\s*===\s*0/);
    expect(seg, '★ 拒绝文案缺"等它完成后继续"的指引').toMatch(/等它完成后继续/);
  });

  it('★★ task 上必须有浏览器流锁字段（每任务一把，不跨会话）', () => {
    expect(LTM, '★ 缺 browserFlow 字段').toMatch(/browserFlow\?:\s*BrowserFlowLock/);
  });

  it('★★ 工作流型子智能体（workflow_json 含 browser_ 节点）也按浏览器型处理', () => {
    const i = LTM.indexOf('function isBrowserCapableSubAgent(');
    const body = LTM.slice(i, LTM.indexOf('\n}', i));
    expect(body, '★ 只查 builtin_tool_ids → 工作流里的浏览器节点漏判（并发抢锚仍有缝）')
      .toMatch(/workflow_json/);
  });
});

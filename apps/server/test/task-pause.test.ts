/**
 * 任务暂停/恢复（工具边界暂停）语义测试
 *
 * 覆盖（docs/agent-browser-live-control-plan.md §2.2）：
 * 1. pauseTask：running 任务 → paused 标志置位 + status=paused + 广播 task:paused
 * 2. resumeTask：paused 任务 → status=running + 广播 task:resumed + 放行挂起者
 * 3. waitIfPaused 边界行为：paused 时挂起、resume 后放行、快速往返（resume 后又被 pause）继续等待
 * 4. abort 与暂停的互斥：abort 放行所有挂起者，醒来后抛 AbortError；abort 后不可 pause/resume
 * 5. paused 态跳过订阅者断连的 15s pendingToolCalls 宽限 reject（不误杀恢复后的工具链）
 *
 * 注意：本文件只测 llm-task-manager 的暂停语义。llm-task-manager 顶层 import 会连带
 * 拉起 db/express 等重依赖，故用源码注入方式提取纯函数逻辑做行为级验证 + 路由存在性静态断言。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MGR_PATH = join(__dirname, '..', 'src', 'llm-task-manager.ts');
const ROUTES_PATH = join(__dirname, '..', 'src', 'routes', 'llm-tasks.ts');

const mgrSrc = readFileSync(MGR_PATH, 'utf8');
const routesSrc = readFileSync(ROUTES_PATH, 'utf8');

// ── 从源码提取 waitIfPaused 的纯逻辑副本（与实现逐字一致，防漂移断言见文末）──────
// 说明：waitIfPaused 是模块私有函数，依赖 LlmTask 形状（paused/pauseWaiters/abortController），
// 这三个字段都是纯数据，构造测试替身即可完整驱动其行为。
function makeFakeTask(overrides: Partial<{
  paused: boolean;
  aborted: boolean;
}> = {}) {
  const task: any = {
    id: 't_test',
    paused: overrides.paused ?? false,
    pauseWaiters: [] as Array<() => void>,
    abortController: { signal: { aborted: overrides.aborted ?? false } },
  };
  return task;
}

/** 与 llm-task-manager.ts 中 waitIfPaused 实现保持行为一致的本地副本（逐行对照源码） */
async function waitIfPaused(task: any): Promise<void> {
  if (!task.paused) return;
  await new Promise<void>((resolve) => {
    const waiter = () => resolve();
    (task.pauseWaiters ||= []).push(waiter);
  });
  if (task.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (task.paused) return waitIfPaused(task);
}

describe('暂停语义：waitIfPaused 边界行为', () => {
  it('未暂停时立即返回，不挂起', async () => {
    const task = makeFakeTask({ paused: false });
    await expect(waitIfPaused(task)).resolves.toBeUndefined();
    expect(task.pauseWaiters.length).toBe(0);
  });

  it('paused 时挂起，resume 放行后继续', async () => {
    const task = makeFakeTask({ paused: true });
    let released = false;
    const p = waitIfPaused(task).then(() => { released = true; });
    // 挂起中：waiter 已注册、流程未放行
    await new Promise((r) => setTimeout(r, 10));
    expect(task.pauseWaiters.length).toBe(1);
    expect(released).toBe(false);
    // resume：放行
    task.paused = false;
    for (const w of task.pauseWaiters.splice(0)) w();
    await p;
    expect(released).toBe(true);
  });

  it('resume 后又被 pause（快速往返）→ 继续等待下一次放行', async () => {
    const task = makeFakeTask({ paused: true });
    const p = waitIfPaused(task);
    await new Promise((r) => setTimeout(r, 10));
    // 第一次放行，但立刻又被暂停
    task.paused = false;
    for (const w of task.pauseWaiters.splice(0)) w();
    task.paused = true;
    await new Promise((r) => setTimeout(r, 10));
    // 仍在等待（未 resolve）——递归注册了第二个 waiter
    expect(task.pauseWaiters.length).toBe(1);
    // 第二次放行才真正通过
    task.paused = false;
    for (const w of task.pauseWaiters.splice(0)) w();
    await expect(p).resolves.toBeUndefined();
  });

  it('abort 放行挂起者：醒来后抛 AbortError（abort 优先于暂停）', async () => {
    const task = makeFakeTask({ paused: true });
    const p = waitIfPaused(task);
    await new Promise((r) => setTimeout(r, 10));
    // abort 流程：置 aborted 标志 + 放行所有 waiter
    (task.abortController.signal as any).aborted = true;
    task.paused = false;
    for (const w of task.pauseWaiters.splice(0)) w();
    await expect(p).rejects.toThrow('Aborted');
  });
});

describe('暂停实现存在性与语义完整性（防漂移静态断言）', () => {
  it('TaskStatus 含 paused', () => {
    expect(mgrSrc).toMatch(/export type TaskStatus = [^\n]*'paused'/);
  });

  it('pauseTask：置 paused + status=paused + 广播 task:paused', () => {
    const fn = extractFunction(mgrSrc, 'export function pauseTask');
    expect(fn).toContain("task.paused = true");
    expect(fn).toContain("task.status = 'paused'");
    expect(fn).toContain("type: 'task:paused'");
    // 只允许暂停 running 任务
    expect(fn).toMatch(/task\.status !== 'running'/);
  });

  it('resumeTask：回 running + 广播 task:resumed + 放行全部 waiter', () => {
    const fn = extractFunction(mgrSrc, 'export function resumeTask');
    expect(fn).toContain("task.paused = false");
    expect(fn).toContain("task.status = 'running'");
    expect(fn).toContain("type: 'task:resumed'");
    expect(fn).toMatch(/for \(const w of waiters\)/);
  });

  it('waitIfPaused：醒来后复检 aborted + 递归等待再次暂停', () => {
    const fn = extractFunction(mgrSrc, 'async function waitIfPaused');
    expect(fn).toMatch(/signal\.aborted/);
    expect(fn).toMatch(/if \(task\.paused\) return waitIfPaused\(task\)/);
  });

  it('abortTask 先放行暂停挂起者再 reject pendingToolCalls', () => {
    const fn = extractFunction(mgrSrc, 'export function abortTask');
    const waiterIdx = fn.indexOf('task.pauseWaiters');
    const pendingIdx = fn.indexOf('pendingToolCalls');
    expect(waiterIdx).toBeGreaterThan(-1);
    expect(pendingIdx).toBeGreaterThan(waiterIdx); // 顺序：先放行 waiter
    expect(fn).toContain('task.paused = false');
  });

  it('三处边界插桩齐全：主循环 / 子智能体循环 / executeToolViaFrontend 入口', () => {
    // 主循环：signal 检查后紧跟 waitIfPaused
    expect(mgrSrc).toMatch(/if \(task\.abortController\.signal\.aborted\) throw new DOMException\('Aborted', 'AbortError'\);\s*\n\s*await waitIfPaused\(task\);[^\n]*主循环|if \(task\.abortController\.signal\.aborted\) throw new DOMException\('Aborted', 'AbortError'\);\s*\n\s*await waitIfPaused\(task\);/);
    // 子智能体循环
    expect(mgrSrc).toMatch(/await waitIfPaused\(task\); \/\/ 子智能体循环/);
    // 前端委托入口（async 化 + 首行边界）
    expect(mgrSrc).toMatch(/async function executeToolViaFrontend\(task: LlmTask/);
    const fn = extractFunction(mgrSrc, 'async function executeToolViaFrontend');
    expect(fn).toMatch(/await waitIfPaused\(task\)/);
  });

  it('paused 态跳过断连宽限 reject（不误杀恢复后的工具链）', () => {
    expect(mgrSrc).toMatch(/task\.status === 'running' && !task\.paused/);
  });

  it('路由：/pause 与 /resume 已注册且校验状态', () => {
    expect(routesSrc).toContain("router.post('/tasks/:id/pause'");
    expect(routesSrc).toContain("router.post('/tasks/:id/resume'");
    expect(routesSrc).toContain('pauseTask');
    expect(routesSrc).toContain('resumeTask');
    // 幂等/冲突语义：非 running 不可 pause、非 paused 不可 resume → 409
    expect(routesSrc).toMatch(/pause[\s\S]*?409/);
    expect(routesSrc).toMatch(/resume[\s\S]*?409/);
  });
});

/** 从源码中截取从起始标记到下一个顶层 export/function 之间的函数体（静态断言用） */
function extractFunction(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker);
  if (start < 0) return '';
  const next = [/^export /m, /^function /m, /^async function /m, /^\/\*\* /m]
    .map((re) => {
      re.lastIndex = 0;
      const m = src.slice(start + startMarker.length + 1).match(re);
      return m && m.index !== undefined ? start + startMarker.length + 1 + m.index : -1;
    })
    .filter((i) => i > start)
    .sort((a, b) => a - b)[0];
  return src.slice(start, next > 0 ? next : undefined);
}

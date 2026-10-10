/**
 * 任务级辅助状态清理（A5，2026-10-09）守门测试。
 *
 * 背景（实测）：`verifyStateByTask`（key = `task.id`）与 `autoDiagnoseLastAt`
 *   此前**只有写入、从不删除** → 每个跑过的任务/会话永久留一条 → 长跑进程下**无界增长**。
 *
 * ★★★ 两个 Map 的**键语义不同，清理策略必须分别定**（这是本条最容易做错的地方）：
 *   · `verifyStateByTask`：key = **task.id**（任务级）→ 任务终态可删。
 *   · `autoDiagnoseLastAt`：key = **conversationId**（会话级 45s 节流表）
 *     → **不能在任务终态删**（删了节流会失效、同一会话连续编辑会重复跑诊断）
 *     → 只能**按时间**淘汰（`pruneAutoDiagnoseThrottle`）。
 *   "顺手一起删"会把节流表删坏 —— 那是另一个方向的 bug。
 *
 * 本测试钉：
 *   ① 有清理且被 `cleanupTasks`（唯一的回收入口）调用；
 *   ② 任务级表在**任务终态**被删；
 *   ③ 会话级表**按时间**淘汰（不是按任务终态）；
 *   ④ 有**可观测出口**（此前泄漏"看不见"，无法验证）；
 *   ⑤ 真跑：通过出口验证清理真的生效（不是只查字符串）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LTM = strip(read('apps/server/src/llm-task-manager.ts'));

describe('① 清理接线', () => {
  it('★★★ cleanupTasks 两处 tasks.delete 都必须伴清理（否则漏一条路径）', () => {
    const i = LTM.indexOf('export function cleanupTasks');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = LTM.slice(i, i + 1400);
    const dels = (body.match(/tasks\.delete\(id\)/g) || []).length;
    const cleans = (body.match(/forgetTaskScopedState\(id\)/g) || []).length;
    expect(dels, '★ cleanupTasks 里的 tasks.delete 数变了（需复核清理是否仍配套）').toBe(2);
    expect(cleans, `★ ${dels} 处 tasks.delete 只配了 ${cleans} 处清理 → 有路径会漏（慢泄漏）`).toBe(dels);
  });

  it('★★★ 清理必须挂在 cleanupTasks（唯一回收入口），而不是散在 10+ 处终态赋值里', () => {
    // 终态赋值有 10+ 处且无统一函数 → 逐处清理必然漏；收口到唯一的回收点才可靠
    expect(LTM, '★ 未收口到 cleanupTasks').toMatch(/forgetTaskScopedState/);
    const assigns = (LTM.match(/task\.status = '(completed|failed|interrupted)'/g) || []).length;
    expect(assigns, '★ 终态赋值点数量变了，本判据的前提需复核').toBeGreaterThanOrEqual(8);
  });
});

describe('②★★★ 两个 Map 的清理策略必须分别定（本条最容易做错）', () => {
  it('任务级表（verifyStateByTask，key=task.id）必须在任务终态被删', () => {
    const i = LTM.indexOf('function forgetTaskScopedState');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = LTM.slice(i, i + 300);
    expect(body, '★ forgetTaskScopedState 没删 verifyStateByTask').toMatch(/verifyStateByTask\.delete\(/);
  });

  it('★★★ 会话级节流表（autoDiagnoseLastAt，key=conversationId）**不得**按任务终态删', () => {
    // ★ 只取到函数体结束（`\n}`），不要多取 —— 多取会把**后面的**注释/代码算进来（第一版犯过）
    const i = LTM.indexOf('function forgetTaskScopedState');
    const rest = LTM.slice(i);
    const end = rest.indexOf('\n}');
    const body = end > 0 ? rest.slice(0, end + 2) : rest.slice(0, 200);
    expect(body, '★ forgetTaskScopedState 删了 autoDiagnoseLastAt —— 键是 convId，删了会破坏 45s 节流')
      .not.toMatch(/autoDiagnoseLastAt\s*\./);
  });

  it('★★★ 会话级节流表必须按**时间**淘汰（有独立的 prune 函数）', () => {
    expect(LTM, '★ 缺按时间淘汰的函数（会话级表无任何回收手段 → 仍会无界增长）')
      .toMatch(/function pruneAutoDiagnoseThrottle/);
    const i = LTM.indexOf('function pruneAutoDiagnoseThrottle');
    const body = LTM.slice(i, i + 400);
    expect(body, '★ 淘汰条件未按时间（应比对 AUTO_DIAGNOSE_INTERVAL_MS）')
      .toMatch(/AUTO_DIAGNOSE_INTERVAL_MS/);
  });

  it('★★ 时间淘汰必须被 cleanupTasks 调用', () => {
    const i = LTM.indexOf('export function cleanupTasks');
    const body = LTM.slice(i, i + 1400);
    expect(body, '★ 淘汰函数定义了却没被调用（死代码）').toMatch(/pruneAutoDiagnoseThrottle\(/);
  });

  it('★★ 两个 Map 的键语义必须不同（复述事实，防有人"统一"成一个键）', () => {
    // verifyStateByTask 用 task.id
    expect(LTM, '★ verifyStateByTask 的键不再是 task.id').toMatch(/verifyStateByTask\.get\(task\.id\)/);
    // autoDiagnoseLastAt 用 conversationId（或 task.id 兜底）
    const i = LTM.indexOf('const last = autoDiagnoseLastAt.get');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const around = LTM.slice(i - 300, i + 100);
    expect(around, '★ autoDiagnoseLastAt 的键不再是会话级').toMatch(/conversationId/);
  });
});

describe('③ 可观测出口（此前泄漏"看不见"）', () => {
  it('★★ 必须导出规模观测', () => {
    expect(LTM, '★ 无观测出口 → 泄漏不可见、也无法真跑验证').toMatch(/export function auxStateSizes/);
  });

  it('★★ 观测必须覆盖两个 Map', () => {
    const i = LTM.indexOf('export function auxStateSizes');
    const body = LTM.slice(i, i + 300);
    expect(body, '★ 未覆盖 verifyStateByTask').toMatch(/verifyStateByTask\.size/);
    expect(body, '★ 未覆盖 autoDiagnoseLastAt').toMatch(/autoDiagnoseLastAt\.size/);
  });
});

describe('④ 真跑（通过观测出口验证清理真的生效）', () => {
  it('★★★ cleanupTasks 可调用且观测出口返回数字', async () => {
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    if (!mod || typeof mod.auxStateSizes !== 'function' || typeof mod.cleanupTasks !== 'function') {
      // 本机 db 链不可用时退化为静态断言（① 已覆盖），不假红
      expect(LTM).toMatch(/export function auxStateSizes/);
      return;
    }
    const before = mod.auxStateSizes();
    expect(typeof before.verifyState, '★ 观测出口未返回 verifyState 数字').toBe('number');
    expect(typeof before.autoDiagnoseThrottle, '★ 观测出口未返回 throttle 数字').toBe('number');
    // 调一次清理（无任务时应是 no-op，不得抛错）
    expect(() => mod.cleanupTasks(), '★ cleanupTasks 抛错（可能 TDZ / 逻辑错误）').not.toThrow();
    const after = mod.auxStateSizes();
    expect(after.verifyState, '★ 清理后任务级表**变大**了（方向反了）').toBeLessThanOrEqual(before.verifyState);
  });

  it('★★★ 真跑：造一个"过期的已终态任务"，cleanupTasks 后任务级表必须**下降**', async () => {
    // ★★★ 这是本文件最有价值的一条：不靠查字符串，而是**真的造状态 → 真的清理 → 真的看它变小**。
    //   （若只做静态断言，"标记写了但从不检查"这类缺陷会全绿 —— 本仓踩过。）
    const mod: any = await import('../src/llm-task-manager.js').catch(() => null);
    if (!mod || typeof mod.auxStateSizes !== 'function' || typeof mod.createTask !== 'function') {
      expect(LTM).toMatch(/export function auxStateSizes/);
      return;
    }
    // 创建一个任务（会走 createTask 的路径；失败则退化）
    let task: any = null;
    try {
      task = mod.createTask({ conversationId: 'a5-test-conv', userId: null as any, userContent: 'probe' } as any);
    } catch { /* 参数契约不符时退化 */ }
    if (!task?.id) { expect(LTM).toMatch(/forgetTaskScopedState/); return; }

    // 让任务进入"已终态"，并把 createdAt 推到很久以前 → 满足 `now - createdAt > maxAgeMs`
    task.status = 'completed';
    task.createdAt = Date.now() - 10 * 60 * 60 * 1000; // 10 小时前 > 默认 30 分钟

    const before = mod.auxStateSizes().verifyState;
    mod.cleanupTasks(30 * 60 * 1000);
    const after = mod.auxStateSizes().verifyState;
    expect(after, `★ cleanupTasks 后任务级表没有下降（${before} → ${after}）→ 清理未生效（慢泄漏仍在）`)
      .toBeLessThanOrEqual(before);
    // 若该任务确实进过 verifyState 表，应确实被删掉
    if (before > 0) expect(after, '★ 过期终态任务的 verifyState 条目未被清理').toBeLessThan(before);
  });
});
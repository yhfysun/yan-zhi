// 计划步骤计时（2026-10-23）：时间戳只由服务端 task_step 状态迁移写入。
// 钉死的行为：running 幂等、done/failed 结算、返工累加 activeMs、计划级时间推导、重规划保留计时。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const conversations: Record<string, { space_id?: string | null; task_plan_json?: string | null }> = {
    c1: { space_id: null, task_plan_json: null },
  };
  const db = {
    prepare(sql: string): any {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT space_id FROM conversation WHERE id = \?$/.test(s)) {
        return { get: (id: string) => (conversations[id] ? { space_id: conversations[id].space_id ?? null } : undefined), all: () => [], run: () => {} };
      }
      if (/^SELECT id, dir_path FROM space WHERE id = \?$/.test(s)) {
        return { get: () => undefined, all: () => [], run: () => {} };
      }
      if (/^SELECT task_plan_json FROM conversation WHERE id = \?$/.test(s)) {
        return { get: (id: string) => (conversations[id] ? { task_plan_json: conversations[id].task_plan_json ?? null } : undefined), all: () => [], run: () => {} };
      }
      if (/^UPDATE conversation SET task_plan_json = \? WHERE id = \?$/.test(s)) {
        return {
          get: () => undefined, all: () => [],
          run: (json: string, id: string) => { if (conversations[id]) conversations[id].task_plan_json = json; },
        };
      }
      return { get: () => undefined, all: () => [], run: () => {} };
    },
    exec: () => {},
    pragma: () => {},
  };
  return { db, conversations, serverState: { workspaceDir: '' } };
});

vi.mock('../src/db.js', () => ({ db: hoisted.db }));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));

import {
  backendTaskPlan,
  backendTaskStep,
  loadPlanJson,
  stepElapsedMs,
} from '../src/services/task-plan-file';

const T0 = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  hoisted.conversations.c1.task_plan_json = null;
});
afterEach(() => {
  vi.useRealTimers();
});

async function planWithTwoSteps() {
  await backendTaskPlan('c1', { title: '测试计划', steps: [{ title: '第一步' }, { title: '第二步' }] });
  return loadPlanJson('c1')!;
}

describe('task_plan 初始化', () => {
  it('新计划只记创建时间，步骤计时等 running / done 才写入', async () => {
    const plan = await planWithTwoSteps();
    expect(plan.createdAt).toBe(T0);
    expect(plan.startedAt).toBeUndefined();
    expect(plan.finishedAt).toBeUndefined();
    expect(plan.steps[0].startedAt).toBeUndefined();
    expect(plan.steps[0].finishedAt).toBeUndefined();
  });
});

describe('task_step 时间迁移', () => {
  it('running 写 startedAt，重复 running 不覆盖', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    const first = loadPlanJson('c1')!;
    expect(first.steps[0].startedAt).toBe(T0);
    expect(first.startedAt).toBe(T0);

    vi.setSystemTime(T0 + 5_000);
    await backendTaskStep('c1', { index: 1, status: 'running' });
    expect(loadPlanJson('c1')!.steps[0].startedAt).toBe(T0);
  });

  it('done 写 finishedAt，重复 done 不覆盖（幂等）', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    vi.setSystemTime(T0 + 10_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });
    expect(loadPlanJson('c1')!.steps[0].finishedAt).toBe(T0 + 10_000);

    vi.setSystemTime(T0 + 20_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });
    expect(loadPlanJson('c1')!.steps[0].finishedAt).toBe(T0 + 10_000);
  });

  it('没经过 running 直接 done：起点回退到计划创建时间，完成的步骤仍有耗时记录', async () => {
    await planWithTwoSteps(); // createdAt = T0
    vi.setSystemTime(T0 + 30_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });
    const step = loadPlanJson('c1')!.steps[0];
    expect(step.startedAt).toBe(T0);
    expect(step.finishedAt).toBe(T0 + 30_000);
    expect(stepElapsedMs(step)).toBe(30_000);
  });

  it('后续步骤没标 running 直接 done：起点取上一个已结算步骤的结束点（时间线连续）', async () => {
    await planWithTwoSteps();
    vi.setSystemTime(T0 + 10_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });
    vi.setSystemTime(T0 + 25_000);
    await backendTaskStep('c1', { index: 2, status: 'done' });
    const plan = loadPlanJson('c1')!;
    expect(plan.steps[1].startedAt).toBe(T0 + 10_000);
    expect(stepElapsedMs(plan.steps[1])).toBe(15_000);
  });

  it('返工：done 后再 running → 累计 activeMs 并重新起算', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    vi.setSystemTime(T0 + 10_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });
    expect(stepElapsedMs(loadPlanJson('c1')!.steps[0])).toBe(10_000);

    vi.setSystemTime(T0 + 30_000);
    await backendTaskStep('c1', { index: 1, status: 'running' });
    let step = loadPlanJson('c1')!.steps[0];
    expect(step.activeMs).toBe(10_000);
    expect(step.startedAt).toBe(T0 + 30_000);
    expect(step.finishedAt).toBeUndefined();

    vi.setSystemTime(T0 + 35_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });
    step = loadPlanJson('c1')!.steps[0];
    expect(stepElapsedMs(step)).toBe(15_000); // 10s 上一轮 + 5s 本轮
  });

  it('failed 与 done 同样结算 finishedAt', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 2, status: 'running' });
    vi.setSystemTime(T0 + 3_000);
    await backendTaskStep('c1', { index: 2, status: 'failed' });
    const step = loadPlanJson('c1')!.steps[1];
    expect(step.status).toBe('failed');
    expect(stepElapsedMs(step)).toBe(3_000);
  });
});

describe('计划级时间', () => {
  it('startedAt 取最早步骤；全部终态后 finishedAt 取最晚结算时间', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    vi.setSystemTime(T0 + 4_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });
    let plan = loadPlanJson('c1')!;
    expect(plan.startedAt).toBe(T0);
    expect(plan.finishedAt).toBeUndefined(); // 第二步还没终态

    vi.setSystemTime(T0 + 6_000);
    await backendTaskStep('c1', { index: 2, status: 'running' });
    vi.setSystemTime(T0 + 9_000);
    await backendTaskStep('c1', { index: 2, status: 'done' });
    plan = loadPlanJson('c1')!;
    expect(plan.finishedAt).toBe(T0 + 9_000);

    // 任一步返工 → 计划重新变为未完成
    vi.setSystemTime(T0 + 12_000);
    await backendTaskStep('c1', { index: 2, status: 'running' });
    expect(loadPlanJson('c1')!.finishedAt).toBeUndefined();
  });
});

describe('重规划保留计时（服务端内部参数）', () => {
  it('重规划沿用原计划的创建时间（新步骤的耗时兜底起点不回退）', async () => {
    await planWithTwoSteps(); // createdAt = T0
    vi.setSystemTime(T0 + 60_000);
    await backendTaskPlan('c1', { title: '重规划', steps: [{ title: '新一步' }] }, []);
    expect(loadPlanJson('c1')!.createdAt).toBe(T0);
  });

  it('preserved 把状态与时间搬进新计划，不重新起算', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    vi.setSystemTime(T0 + 8_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });

    vi.setSystemTime(T0 + 20_000);
    await backendTaskPlan(
      'c1',
      { title: '重规划', steps: [{ title: '第一步' }, { title: '新第二步' }] },
      [{ index: 1, status: 'done', startedAt: T0, finishedAt: T0 + 8_000 }],
    );
    const plan = loadPlanJson('c1')!;
    expect(plan.steps[0].status).toBe('done');
    expect(stepElapsedMs(plan.steps[0])).toBe(8_000);
    expect(plan.steps[1].startedAt).toBeUndefined();
  });
});

describe('存量计划（无时间戳）', () => {
  it('loadPlanJson 原样返回，stepElapsedMs 为 0，不猜', () => {
    hoisted.conversations.c1.task_plan_json = JSON.stringify({
      title: '旧计划',
      steps: [{ title: '旧步骤', status: 'done' }],
    });
    const plan = loadPlanJson('c1')!;
    expect(plan.steps[0].startedAt).toBeUndefined();
    expect(stepElapsedMs(plan.steps[0])).toBe(0);
  });
});

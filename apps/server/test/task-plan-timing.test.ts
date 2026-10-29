// 计划步骤计时（2026-10-23）：时间戳只由服务端 task_step 状态迁移写入。
// 钉死的行为：running 幂等、done/failed 结算、返工累加 activeMs、计划级时间推导、重规划保留计时。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const conversations: Record<string, { space_id?: string | null; task_plan_json?: string | null }> = {
    c1: { space_id: null, task_plan_json: null },
  };
  /** 各会话的用户消息时间戳（升序）：重规划判定用它区分「同一轮内」与「用户又提了新要求」 */
  const userMessages: Record<string, number[]> = { c1: [] };
  /** 各会话的活动时间点（assistant/tool 消息）：等待时长统计用 */
  const activity: Record<string, number[]> = { c1: [] };
  const db = {
    prepare(sql: string): any {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT created_at FROM message WHERE conversation_id = \? AND created_at >= \? AND created_at <= \? AND role IN \('assistant', 'tool'\) ORDER BY created_at ASC LIMIT \?$/.test(s)) {
        return {
          get: () => undefined,
          all: (id: string, from: number, to: number) => (activity[id] || [])
            .filter((t) => t >= from && t <= to)
            .sort((a, b) => a - b)
            .map((t) => ({ created_at: t })),
          run: () => {},
        };
      }
      if (/^SELECT created_at FROM message WHERE conversation_id = \? AND role = 'user' ORDER BY created_at DESC LIMIT 1$/.test(s)) {
        return {
          get: (id: string) => {
            const arr = userMessages[id] || [];
            return arr.length ? { created_at: arr[arr.length - 1] } : undefined;
          },
          all: () => [], run: () => {},
        };
      }
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
  return { db, conversations, userMessages, activity, serverState: { workspaceDir: '' } };
});

vi.mock('../src/db.js', () => ({ db: hoisted.db }));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));

import {
  backendTaskPlan,
  backendTaskStep,
  loadPlanJson,
  stepBusyMs,
  stepElapsedMs,
} from '../src/services/task-plan-file';

const T0 = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  hoisted.conversations.c1.task_plan_json = null;
  hoisted.userMessages.c1 = [];
  hoisted.activity.c1 = [];
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
    await backendTaskStep('c1', { index: 1, status: 'running', note: '验证发现少了一集，返工' });
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

    // 任一步返工 → 计划重新变为未完成（返工必须带 note，见推进守卫）
    vi.setSystemTime(T0 + 12_000);
    await backendTaskStep('c1', { index: 2, status: 'running', note: '接口回读不一致，返工' });
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

describe('模型二次 task_plan 不重置计时（2026-10-27 实报）', () => {
  it('同一轮内重规划（用户没再说话）：沿用原计划创建时间', async () => {
    await planWithTwoSteps(); // createdAt = T0
    await backendTaskStep('c1', { index: 1, status: 'done' }); // 计划尚未终态

    vi.setSystemTime(T0 + 190_000);
    await backendTaskPlan('c1', {
      title: '换了个更细的计划',
      steps: [{ title: '新第一步' }, { title: '新第二步' }, { title: '新第三步' }],
    });

    // 实报：旧实现这里会把 createdAt 重置成"现在"，前 3 分钟的耗时凭空消失
    expect(loadPlanJson('c1')!.createdAt).toBe(T0);
  });

  it('标题重合的已完成步骤：状态与计时搬进新计划', async () => {
    await planWithTwoSteps(); // 第一步 / 第二步
    await backendTaskStep('c1', { index: 1, status: 'running' });
    vi.setSystemTime(T0 + 30_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });

    vi.setSystemTime(T0 + 60_000);
    await backendTaskPlan('c1', {
      title: '重规划',
      steps: [{ title: '新第一步' }, { title: '第一步' }],
    });

    const plan = loadPlanJson('c1')!;
    expect(plan.createdAt).toBe(T0);
    expect(plan.steps[0].status).toBe('pending');
    expect(plan.steps[1].status).toBe('done');
    expect(stepElapsedMs(plan.steps[1])).toBe(30_000);
  });

  it('计划已终态但仍在同一轮内：视为继续，沿用创建时间', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'done' });
    await backendTaskStep('c1', { index: 2, status: 'done' });
    expect(loadPlanJson('c1')!.finishedAt).toBe(T0);

    vi.setSystemTime(T0 + 60_000);
    await backendTaskPlan('c1', { title: '下一阶段', steps: [{ title: '收尾' }] });
    expect(loadPlanJson('c1')!.createdAt).toBe(T0);
  });

  it('用户已发新消息后再规划：视为新任务，创建时间重置', async () => {
    await planWithTwoSteps();
    hoisted.userMessages.c1.push(T0 + 100_000); // 用户在旧计划之后又提了新要求

    vi.setSystemTime(T0 + 200_000);
    await backendTaskPlan('c1', { title: '另一件事', steps: [{ title: '新任务第一步' }] });

    expect(loadPlanJson('c1')!.createdAt).toBe(T0 + 200_000);
  });
});

describe('task_step 推进守卫（2026-10-27）', () => {
  it('同一时刻只允许一个 running：别的步骤还开着时，推进另一步被拒', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });

    const msg = await backendTaskStep('c1', { index: 2, status: 'done' });
    expect(msg).toMatch(/第 1 步仍在进行中/);
    expect(loadPlanJson('c1')!.steps[1].status).toBe('pending');
  });

  it('目标步骤自己正在 running 时允许关闭（历史多 running 的脏数据不会锁死计划）', async () => {
    hoisted.conversations.c1.task_plan_json = JSON.stringify({
      title: '脏数据',
      createdAt: T0,
      steps: [
        { title: '第一步', status: 'running', startedAt: T0 },
        { title: '第二步', status: 'running', startedAt: T0 },
      ],
    });

    const msg = await backendTaskStep('c1', { index: 2, status: 'done' });
    expect(msg).toContain('第 2 步状态为 done');
    expect(loadPlanJson('c1')!.steps[1].status).toBe('done');
  });

  it('已完成的步骤无 note 重开：拒绝（实报的 14 分钟空窗就是这次无 note 重开造成的）', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'done' });

    vi.setSystemTime(T0 + 5_000);
    const msg = await backendTaskStep('c1', { index: 1, status: 'running' });
    expect(msg).toMatch(/返工/);
    const step = loadPlanJson('c1')!.steps[0];
    expect(step.status).toBe('done');
    expect(step.finishedAt).toBe(T0);
  });

  it('返工带 note：放行并累计 activeMs', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    vi.setSystemTime(T0 + 10_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });

    vi.setSystemTime(T0 + 20_000);
    const msg = await backendTaskStep('c1', { index: 1, status: 'running', note: '发现顺序不对，重做' });
    expect(msg).toContain('第 1 步状态为 running');
    const step = loadPlanJson('c1')!.steps[0];
    expect(step.activeMs).toBe(10_000);
    expect(step.note).toBe('发现顺序不对，重做');
  });

  it('未标 running 直接 done 仍然允许（兼容小模型，起点由 fallback 回退）', async () => {
    await planWithTwoSteps();
    const msg = await backendTaskStep('c1', { index: 1, status: 'done' });
    expect(msg).toContain('第 1 步状态为 done');
    expect(loadPlanJson('c1')!.steps[0].status).toBe('done');
  });
});

describe('等待时长与干活时长（2026-10-27 C）', () => {
  it('结算时把长间隙记为等待，stepBusyMs = 墙钟 − 等待', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    hoisted.activity.c1.push(T0 + 60_000); // 只在开始后 1 分钟有一条活动

    vi.setSystemTime(T0 + 20 * 60_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });

    const step = loadPlanJson('c1')!.steps[0];
    expect(step.waitMs).toBe(19 * 60_000); // 1 分钟→20 分钟这段一直没动静
    expect(stepElapsedMs(step)).toBe(20 * 60_000);
    expect(stepBusyMs(step)).toBe(60_000);
  });

  it('活动间隔都小于 3 分钟 → 不算等待', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    for (let m = 1; m <= 10; m++) hoisted.activity.c1.push(T0 + m * 60_000);

    vi.setSystemTime(T0 + 10 * 60_000);
    await backendTaskStep('c1', { index: 1, status: 'done' });

    const step = loadPlanJson('c1')!.steps[0];
    expect(step.waitMs).toBeUndefined();
    expect(stepBusyMs(step)).toBe(10 * 60_000);
  });

  it('返工重开后再次结算：等待时长累计', async () => {
    await planWithTwoSteps();
    await backendTaskStep('c1', { index: 1, status: 'running' });
    vi.setSystemTime(T0 + 10 * 60_000);
    await backendTaskStep('c1', { index: 1, status: 'done' }); // 整段无活动 → 等待 10 分钟

    vi.setSystemTime(T0 + 20 * 60_000);
    await backendTaskStep('c1', { index: 1, status: 'running', note: '等用户确认后返工' });
    hoisted.activity.c1.push(T0 + 20 * 60_000, T0 + 30 * 60_000);
    vi.setSystemTime(T0 + 30 * 60_000);
    await backendTaskStep('c1', { index: 1, status: 'done' }); // 本段中间 10 分钟无活动

    const step = loadPlanJson('c1')!.steps[0];
    expect(step.waitMs).toBe(20 * 60_000);
    expect(stepElapsedMs(step)).toBe(20 * 60_000); // 10 分钟返工累计 + 10 分钟本轮
    expect(stepBusyMs(step)).toBe(0);
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

// P1-9 测试：任务预算（resolveTaskBudgets + checkTaskBudgetHit）
// 2026-10-07 —— 预算策略在 @yan-zhi/shared/context-policy 唯一定义，server 主循环只做取参适配。
// （放在 core 侧跑：shared 包无 vitest 基建，core 已有且依赖 shared 工作区源码。）
import { describe, it, expect } from 'vitest';
import {
  TASK_TOKEN_BUDGET,
  TASK_WALL_CLOCK_BUDGET_MS,
  resolveTaskBudgets,
  checkTaskBudgetHit,
} from '@yan-zhi/shared';

describe('resolveTaskBudgets（P1-9）', () => {
  it('无配置 → 默认预算（token 100 万 / 墙钟 15 分钟）', () => {
    const b = resolveTaskBudgets(undefined);
    expect(b.tokenBudget).toBe(TASK_TOKEN_BUDGET);
    expect(b.tokenBudget).toBe(1_000_000);
    expect(b.wallClockMs).toBe(TASK_WALL_CLOCK_BUDGET_MS);
    expect(b.wallClockMs).toBe(15 * 60 * 1000);
  });

  it('agent config_json 覆盖：totalTokenBudget / wallClockMinutes', () => {
    const b = resolveTaskBudgets({ totalTokenBudget: 2_000_000, wallClockMinutes: 30 });
    expect(b.tokenBudget).toBe(2_000_000);
    expect(b.wallClockMs).toBe(30 * 60 * 1000);
  });

  it('非法值（0/负数/非数字）→ 回落默认，绝不抛错', () => {
    for (const bad of [{ totalTokenBudget: 0 }, { totalTokenBudget: -1 }, { totalTokenBudget: 'abc' }, { wallClockMinutes: -5 }, null, 'str']) {
      expect(() => resolveTaskBudgets(bad)).not.toThrow();
      expect(resolveTaskBudgets(bad).tokenBudget).toBe(TASK_TOKEN_BUDGET);
      expect(resolveTaskBudgets(bad).wallClockMs).toBe(TASK_WALL_CLOCK_BUDGET_MS);
    }
  });
});

describe('checkTaskBudgetHit（P1-9）', () => {
  const budgets = { tokenBudget: 1000, wallClockMs: 60_000 };

  it('未触达 → null', () => {
    expect(checkTaskBudgetHit(budgets, 999, 0, 59_999)).toBeNull();
  });

  it('token 触达 → {kind:tokens}，token 优先于墙钟', () => {
    const hit = checkTaskBudgetHit(budgets, 1000, 0, 10_000);
    expect(hit).toEqual({ kind: 'tokens', used: 1000, limit: 1000 });
    // token 超限即使墙钟也超了，仍报 tokens（同一触达只报主因）
    expect(checkTaskBudgetHit(budgets, 2000, 0, 120_000)!.kind).toBe('tokens');
  });

  it('墙钟触达 → {kind:wallclock, used=耗时, limit=预算}', () => {
    expect(checkTaskBudgetHit(budgets, 500, 0, 60_000)).toEqual({ kind: 'wallclock', used: 60_000, limit: 60_000 });
  });

  it('budgets 缺失（旧任务对象）→ 不设限', () => {
    expect(checkTaskBudgetHit(undefined, 10_000_000, 0, Date.now() + 1e9)).toBeNull();
  });

  it('totalTokens 非法值按 0 处理（防御）', () => {
    expect(checkTaskBudgetHit(budgets, NaN, 0, 1000)).toBeNull();
  });
});

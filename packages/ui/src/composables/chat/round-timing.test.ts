// 轮次与计划步骤耗时统计的行为契约（2026-10-23 用户需求：任务耗时 + 最耗时 Top3）
import { describe, it, expect } from 'vitest';
import {
  fmtDuration,
  roundElapsedMs,
  planElapsedMs,
  planStepElapsedMs,
  planStepDurations,
  slowestPlanSteps,
} from './round-timing';
import type { MessageRound } from './message-rounds';

function mkRound(): MessageRound {
  return {
    user: { id: 'u1', conversationId: 'c1', role: 'user', createdAt: 1_000 } as any,
    finalAssistant: { id: 'a2', conversationId: 'c1', role: 'assistant', createdAt: 20_000 } as any,
    steps: [
      {
        toolCalls: [{ id: 't1', name: 'browser_click' }, { id: 't2', name: 'python_exec' }],
        toolResults: [
          { callId: 't1', content: 'ok', isError: false, at: 5_000 },
          { callId: 't2', content: 'ok', isError: false, at: 15_000 },
        ],
        at: 2_000,
      },
      { toolCalls: [{ id: 't3', name: 'file_read' }], toolResults: [], at: 16_000 },
    ],
    allToolCalls: [],
  } as any;
}

describe('fmtDuration', () => {
  it('按量级给中文时长', () => {
    expect(fmtDuration(0)).toBe('—');
    expect(fmtDuration(42_000)).toBe('42 秒');
    expect(fmtDuration(90_000)).toBe('1 分 30 秒');
    expect(fmtDuration(120_000)).toBe('2 分');
    expect(fmtDuration(3_600_000 * 1.5)).toBe('1 小时 30 分');
  });
});

describe('roundElapsedMs', () => {
  it('从用户提问到最后一条消息（取最大时间）', () => {
    expect(roundElapsedMs(mkRound())).toBe(19_000);
  });
  it('没有提问时间且窗口内有消息 → 用最早消息兜底（分页缺轮头）', () => {
    const round = {
      user: null,
      finalAssistant: null,
      allToolCalls: [],
      steps: [{ toolCalls: [], toolResults: [{ callId: 'x', content: '', isError: false, at: 5_000 }], at: 3_000 }],
    };
    expect(roundElapsedMs(round as any)).toBe(2_000);
  });
  it('完全没有任何时间戳返回 0（不瞎猜）', () => {
    expect(roundElapsedMs({ steps: [], allToolCalls: [], user: null, finalAssistant: null } as any)).toBe(0);
  });
});

describe('planElapsedMs（服务端落盘的任务耗时）', () => {
  it('直接读记录的 createdAt → finishedAt，不依赖消息时间戳', () => {
    expect(planElapsedMs({ createdAt: 1_000, finishedAt: 61_000 })).toBe(60_000);
  });
  it('任务仍在跑时用 now 作为终点', () => {
    expect(planElapsedMs({ createdAt: 1_000 }, 6_000)).toBe(5_000);
  });
  it('存量计划没有 createdAt → 0（不猜）', () => {
    expect(planElapsedMs({ steps: [] })).toBe(0);
    expect(planElapsedMs(null)).toBe(0);
  });
});

describe('planStepElapsedMs', () => {
  it('已完成步骤 = finishedAt − startedAt + 返工累计', () => {
    expect(planStepElapsedMs({ startedAt: 1_000, finishedAt: 6_000 })).toBe(5_000);
    expect(planStepElapsedMs({ startedAt: 1_000, finishedAt: 6_000, activeMs: 3_000 })).toBe(8_000);
  });

  it('运行中步骤只有传入 now 才算时长（纯函数不读时钟）', () => {
    expect(planStepElapsedMs({ startedAt: 1_000 })).toBe(0);
    expect(planStepElapsedMs({ startedAt: 1_000 }, 4_000)).toBe(3_000);
  });

  it('没有时间戳（存量计划）返回 0，不猜', () => {
    expect(planStepElapsedMs({ title: '旧步骤' })).toBe(0);
    expect(planStepElapsedMs(null)).toBe(0);
  });
});

describe('planStepDurations / slowestPlanSteps', () => {
  const T0 = 1_000_000;
  const plan = {
    steps: [
      { title: '取正文', startedAt: T0, finishedAt: T0 + 10_000 },
      { title: '配音', startedAt: T0 + 10_000, finishedAt: T0 + 70_000 },
      { title: '合成视频', startedAt: T0 + 70_000, finishedAt: T0 + 250_000 },
      { title: '存量步骤（无时间戳）' },
    ],
  };

  it('只统计有计时的步骤，下标从 1 起', () => {
    expect(planStepDurations(plan)).toEqual([
      { index: 1, title: '取正文', ms: 10_000 },
      { index: 2, title: '配音', ms: 60_000 },
      { index: 3, title: '合成视频', ms: 180_000 },
    ]);
  });

  it('Top3 降序；无计划或全部无计时 → 空数组', () => {
    const top = slowestPlanSteps(plan, 3);
    expect(top.map((d) => d.title)).toEqual(['合成视频', '配音', '取正文']);
    expect(slowestPlanSteps(null).length).toBe(0);
    expect(slowestPlanSteps({ steps: [{ title: '旧步骤' }] }).length).toBe(0);
  });

  it('取不满 3 个就返回实际数量', () => {
    expect(slowestPlanSteps(plan, 2).map((d) => d.index)).toEqual([3, 2]);
  });
});

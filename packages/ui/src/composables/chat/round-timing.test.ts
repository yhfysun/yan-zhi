// 轮次耗时统计的行为契约（2026-10-23 用户需求：任务耗时 + 最耗时 Top3）
import { describe, it, expect } from 'vitest';
import { fmtDuration, roundElapsedMs, toolCallDurations, slowestToolCalls } from './round-timing';
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
  it('没有提问时间返回 0（不瞎猜）', () => {
    expect(roundElapsedMs({ steps: [], allToolCalls: [], user: null, finalAssistant: null } as any)).toBe(0);
  });
});

describe('toolCallDurations / slowestToolCalls', () => {
  it('每次调用 = 结果时间 − 发起时间，未完成的调用不计', () => {
    const d = toolCallDurations(mkRound());
    expect(d.map((x) => [x.name, x.ms])).toEqual([
      ['browser_click', 3_000],
      ['python_exec', 13_000],
    ]);
  });

  it('Top3 降序，取不满就返回实际数量', () => {
    const top = slowestToolCalls(mkRound(), 3);
    expect(top.length).toBe(2);
    expect(top[0].name).toBe('python_exec');
    expect(top[0].stepIndex).toBe(0);
  });

  it('后端已上报 durationMs 时优先用它', () => {
    const r = mkRound();
    (r.steps[0].toolCalls[0] as any).durationMs = 999;
    const d = toolCallDurations(r);
    expect(d.find((x) => x.name === 'browser_click')!.ms).toBe(999);
  });
});

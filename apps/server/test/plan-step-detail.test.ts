// 计划步骤运行详情（2026-10-23）：按时间窗聚合工具调用。
// 钉死的行为：调用与结果配对、无结果记未完成、错误标记、含等待判定、存量无时间戳不猜。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const conversations: Record<string, { task_plan_json?: string | null }> = { c1: { task_plan_json: null } };
  const state = { messageRows: [] as any[] };
  const db = {
    prepare(sql: string): any {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT task_plan_json FROM conversation WHERE id = \?$/.test(s)) {
        return {
          get: (id: string) => (conversations[id] ? { task_plan_json: conversations[id].task_plan_json ?? null } : undefined),
          all: () => [], run: () => {},
        };
      }
      if (/FROM message/.test(s)) {
        return { get: () => undefined, all: () => state.messageRows, run: () => {} };
      }
      return { get: () => undefined, all: () => [], run: () => {} };
    },
    exec: () => {},
    pragma: () => {},
  };
  return { db, conversations, state, serverState: { workspaceDir: '' } };
});

vi.mock('../src/db.js', () => ({ db: hoisted.db }));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));

import { aggregateToolCalls, buildPlanStepDetail } from '../src/services/plan-step-detail';

const T0 = 2_000_000;

beforeEach(() => {
  hoisted.conversations.c1.task_plan_json = null;
  hoisted.state.messageRows = [];
});
afterEach(() => {
  vi.useRealTimers();
});

function assistantRow(at: number, calls: Array<{ id: string; name: string }>, extra: Record<string, any> = {}) {
  return {
    id: 'm' + at,
    role: 'assistant',
    content: '',
    tool_calls_json: JSON.stringify(calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name } }))),
    tool_call_id: null,
    created_at: at,
    ...extra,
  };
}

function toolRow(at: number, callId: string, content: string) {
  return { id: 'r' + at, role: 'tool', content, tool_calls_json: null, tool_call_id: callId, created_at: at };
}

describe('aggregateToolCalls', () => {
  it('发起时间与结果时间配对算耗时，未完成取窗口末尾', () => {
    const rows = [
      assistantRow(T0, [{ id: 't1', name: 'browser_click' }, { id: 't2', name: 'python_exec' }]) as any,
      toolRow(T0 + 3_000, 't1', '{"ok":true}') as any,
    ];
    const { toolCalls } = aggregateToolCalls(rows, T0 + 10_000);
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toMatchObject({ name: 'browser_click', durationMs: 3_000, endedAt: T0 + 3_000, isError: false });
    expect(toolCalls[1]).toMatchObject({ name: 'python_exec', durationMs: 10_000, endedAt: null });
  });

  it('结果里的 isError 透传；超长结果只留预览并记原长', () => {
    const long = 'x'.repeat(500);
    const rows = [
      assistantRow(T0, [{ id: 't1', name: 'file_read' }]) as any,
      toolRow(T0 + 1_000, 't1', JSON.stringify({ isError: true, message: long })) as any,
    ];
    const { toolCalls } = aggregateToolCalls(rows, T0 + 2_000);
    expect(toolCalls[0].isError).toBe(true);
    expect(toolCalls[0].resultLength).toBeGreaterThan(500);
    expect(toolCalls[0].resultPreview.length).toBeLessThanOrEqual(201); // 200 + 省略号
  });

  it('按开始时间升序；带上子智能体名字', () => {
    const rows = [
      assistantRow(T0 + 5_000, [{ id: 't2', name: 'late' }], { parent_tool_call_id: 'p1', sub_agent_name: 'pageAgent' }) as any,
      assistantRow(T0, [{ id: 't1', name: 'early' }]) as any,
    ];
    const { toolCalls } = aggregateToolCalls(rows, T0 + 9_000);
    expect(toolCalls.map((c) => c.name)).toEqual(['early', 'late']);
    expect(toolCalls[1].subAgentName).toBe('pageAgent');
  });
});

describe('buildPlanStepDetail', () => {
  it('下标非法 → 400；没有计划 → 404', () => {
    expect(buildPlanStepDetail('c1', 0)).toMatchObject({ ok: false, code: 400 });
    expect(buildPlanStepDetail('c1', 1)).toMatchObject({ ok: false, code: 404 });
  });

  it('存量计划无时间戳 → timingAvailable=false，不查消息、不猜', () => {
    hoisted.conversations.c1.task_plan_json = JSON.stringify({
      title: '旧计划',
      steps: [{ title: '旧步骤', status: 'done' }],
    });
    const r = buildPlanStepDetail('c1', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detail.timingAvailable).toBe(false);
    expect(r.detail.durationMs).toBe(0);
    expect(r.detail.toolCalls).toHaveLength(0);
    expect(r.detail.containsWait).toBe(false);
  });

  it('按 startedAt..finishedAt 取该步工具调用', () => {
    hoisted.conversations.c1.task_plan_json = JSON.stringify({
      title: '计划',
      steps: [
        { title: '第一步', status: 'done', startedAt: T0, finishedAt: T0 + 12_000 },
        { title: '第二步', status: 'done', startedAt: T0 + 12_000, finishedAt: T0 + 20_000 },
      ],
    });
    hoisted.state.messageRows = [
      // 第一步窗内
      assistantRow(T0 + 1_000, [{ id: 'a1', name: 'file_read' }]) as any,
      toolRow(T0 + 2_000, 'a1', '{"ok":true}') as any,
      // 第二步窗内（mock 不按时间过滤，这里验证聚合只认窗口参数——真实 SQL 负责过滤）
      assistantRow(T0 + 15_000, [{ id: 'b1', name: 'python_exec' }]) as any,
      toolRow(T0 + 19_000, 'b1', 'done') as any,
    ];
    const r = buildPlanStepDetail('c1', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detail.timingAvailable).toBe(true);
    expect(r.detail.durationMs).toBe(12_000);
    expect(r.detail.toolCallCount).toBe(2);
  });

  it('≥10 分钟且没有工具调用 → containsWait', () => {
    hoisted.conversations.c1.task_plan_json = JSON.stringify({
      title: '计划',
      steps: [{ title: '等用户确认', status: 'done', startedAt: T0, finishedAt: T0 + 11 * 60_000 }],
    });
    const r = buildPlanStepDetail('c1', 1);
    if (!r.ok) throw new Error('unexpected');
    expect(r.detail.toolCallCount).toBe(0);
    expect(r.detail.containsWait).toBe(true);
  });

  it('运行中的步骤以当前时间作为窗口末尾（不臆造 finishedAt）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 5_000);
    hoisted.conversations.c1.task_plan_json = JSON.stringify({
      title: '计划',
      steps: [{ title: '进行中', status: 'running', startedAt: T0 }],
    });
    hoisted.state.messageRows = [assistantRow(T0 + 1_000, [{ id: 'a1', name: 'tool_x' }]) as any];
    const r = buildPlanStepDetail('c1', 1);
    if (!r.ok) throw new Error('unexpected');
    expect(r.detail.finishedAt).toBeNull();
    expect(r.detail.durationMs).toBe(5_000);
    expect(r.detail.toolCalls[0].durationMs).toBe(4_000); // 无结果 → 到窗口末尾
  });
});

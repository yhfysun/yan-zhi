/**
 * 流式 tool_call 分片累积的**防串位**测试（2026-10-10）。
 *
 * ★★★ 为什么必须钉住（实测故障）：
 *   模型一批输出**两个工具**（`task_plan` + `call_agent`）时，实测 `call_agent` 的
 *   `arguments` 只收到 **30 个字符**（`{"agentId": "a_builtin_page_ag`）→
 *   解析报「不是合法 JSON」→ 工具未执行 → **要派发的 pageAgent 从未被拉起**。
 *   用户侧表现：「pageAgent 页面不显示」「接管没生效」「禁用效果没了」。
 *
 * 根因：直接信任网关给的 `tc.index`，而各网关语义不一（从 1 开始 / 分片重复同一 index /
 *   干脆不带）→ 后一个工具的首个分片覆盖到前一个工具的槽位。
 *
 * 本文件用**真实失败形态**做用例，钉住「同批多工具的 arguments 不互相覆盖」这条不变量。
 */
import { describe, it, expect } from 'vitest';
import { accumulateToolCallDeltas } from '../src/llm-task-manager.js';

/** 造一个流式分片（只填关心的字段） */
const d = (o: Record<string, unknown>) => o as any;

describe('accumulateToolCallDeltas：同批多工具不串位', () => {
  it('★★★ 回归：两个工具、网关把 index 都报成 0 —— 参数不得互相覆盖', () => {
    const acc: any[] = [];
    // 工具 1：task_plan（分 3 片）
    accumulateToolCallDeltas(acc, [d({ index: 0, id: 'call_a', function: { name: 'task_plan', arguments: '{"steps":' } })]);
    accumulateToolCallDeltas(acc, [d({ index: 0, function: { arguments: '[{"title":"第一步"}]' } })]);
    accumulateToolCallDeltas(acc, [d({ index: 0, function: { arguments: '}' } })]);
    // 工具 2：call_agent（分 3 片，**index 也报 0** —— 这就是踩到的形态）
    accumulateToolCallDeltas(acc, [d({ index: 0, id: 'call_b', function: { name: 'call_agent', arguments: '{"agentId":"a_builtin_page_agent","input":"去抖音侦察' } })]);
    accumulateToolCallDeltas(acc, [d({ index: 0, function: { arguments: '登录态并读作品列表"}' } })]);

    expect(acc.length, '★ 两个工具必须各占一个槽位（被覆盖成一个了）').toBe(2);
    // 工具 1 完整
    expect(acc[0].function.name).toBe('task_plan');
    expect(JSON.parse(acc[0].function.arguments)).toEqual({ steps: [{ title: '第一步' }] });
    // 工具 2 完整 —— 这是本测试的核心（修复前只有前 30 字符）
    expect(acc[1].function.name).toBe('call_agent');
    expect(acc[1].id).toBe('call_b');
    const args2 = JSON.parse(acc[1].function.arguments);
    expect(args2.agentId).toBe('a_builtin_page_agent');
    expect(args2.input).toContain('去抖音侦察');
    expect(args2.input).toContain('作品列表');
  });

  it('★ 网关从 1 开始编号（index=1 / 2）也不串位', () => {
    const acc: any[] = [];
    accumulateToolCallDeltas(acc, [d({ index: 1, id: 'c1', function: { name: 'task_plan', arguments: '{"a":1}' } })]);
    accumulateToolCallDeltas(acc, [d({ index: 2, id: 'c2', function: { name: 'call_agent', arguments: '{"agentId":"page_agent"}' } })]);
    expect(acc.filter(Boolean).length).toBe(2);
    const names = acc.filter(Boolean).map((x) => x.function.name).sort();
    expect(names).toEqual(['call_agent', 'task_plan']);
    // 两个参数都完整
    for (const x of acc.filter(Boolean)) expect(() => JSON.parse(x.function.arguments)).not.toThrow();
  });

  it('★ 不带 index 的分片按顺序追加，不互相覆盖', () => {
    const acc: any[] = [];
    accumulateToolCallDeltas(acc, [d({ id: 'x1', function: { name: 'tool_a', arguments: '{"p":' } })]);
    accumulateToolCallDeltas(acc, [d({ id: 'x2', function: { name: 'tool_b', arguments: '{"q":' } })]);
    accumulateToolCallDeltas(acc, [d({ id: 'x1', function: { arguments: '1}' } })]);
    accumulateToolCallDeltas(acc, [d({ id: 'x2', function: { arguments: '2}' } })]);
    expect(acc.length).toBe(2);
    // 按 id 归位，而不是按到达顺序错配
    const a = acc.find((x) => x.id === 'x1')!;
    const b = acc.find((x) => x.id === 'x2')!;
    expect(JSON.parse(a.function.arguments)).toEqual({ p: 1 });
    expect(JSON.parse(b.function.arguments)).toEqual({ q: 2 });
  });

  it('★ 网关重发完整 arguments（非增量）→ 替换而非拼接（否则拼成非法 JSON）', () => {
    const acc: any[] = [];
    accumulateToolCallDeltas(acc, [d({ id: 'r1', function: { name: 'tool_x', arguments: '{"a":1' } })]);
    // 重发整段
    accumulateToolCallDeltas(acc, [d({ id: 'r1', function: { arguments: '{"a":1,"b":2}' } })]);
    expect(() => JSON.parse(acc[0].function.arguments), '拼接成了 {..}{..} 非法 JSON').not.toThrow();
    expect(JSON.parse(acc[0].function.arguments)).toEqual({ a: 1, b: 2 });
  });

  it('★ 正常增量分片仍按拼接（不能把增量误判成重发）', () => {
    const acc: any[] = [];
    accumulateToolCallDeltas(acc, [d({ id: 'i1', function: { name: 'tool_y', arguments: '{"a"' } })]);
    accumulateToolCallDeltas(acc, [d({ id: 'i1', function: { arguments: ':' } })]);
    accumulateToolCallDeltas(acc, [d({ id: 'i1', function: { arguments: '1}' } })]);
    expect(acc[0].function.arguments).toBe('{"a":1}');
    expect(JSON.parse(acc[0].function.arguments)).toEqual({ a: 1 });
  });

  it('★ 后续分片不带 id 时，槽位既有 id 不得被清掉（否则无法回填 tool 结果）', () => {
    const acc: any[] = [];
    accumulateToolCallDeltas(acc, [d({ id: 'keep_me', function: { name: 'tool_z', arguments: '{"a"' } })]);
    accumulateToolCallDeltas(acc, [d({ function: { arguments: ':1}' } })]);
    expect(acc[0].id, '★ id 被后续分片清掉了 → 工具结果无法配对').toBe('keep_me');
    expect(acc[0].function.arguments).toBe('{"a":1}');
  });

  it('★ 单工具常规场景不受影响（行为逐字不变）', () => {
    const acc: any[] = [];
    accumulateToolCallDeltas(acc, [d({ index: 0, id: 's1', function: { name: 'file_read', arguments: '' } })]);
    accumulateToolCallDeltas(acc, [d({ index: 0, function: { arguments: '{"path":' } })]);
    accumulateToolCallDeltas(acc, [d({ index: 0, function: { arguments: '"a.txt"}' } })]);
    expect(acc.length).toBe(1);
    expect(JSON.parse(acc[0].function.arguments)).toEqual({ path: 'a.txt' });
  });
});

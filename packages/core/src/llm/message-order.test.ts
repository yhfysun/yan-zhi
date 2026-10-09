/**
 * 发送前消息顺序规整 —— 守门测试（2026-10-09）。
 *
 * ★★★ 背景（用户实报「追加任务立即发送按钮又失效了点击无用」的隐形杀手）：
 *   「立即发送」把追加的 user 消息写在**当前轮**的
 *       assistant(tool_calls=[A,B])  ⟵ 工具还没跑完
 *       user:追加要求                  ⟵ 插入点（要立刻可见）
 *       tool(A) / tool(B)             ⟵ 稍后落库
 *   之间。库内可见性没问题，但原样回放给 OpenAI 兼容端点就是 400
 *   （`tool_calls must be followed by tool messages`）。
 *
 * ★ 本测试走**真实链路**：toApiMessage（内部形态 → API 形态）→ sanitizeToolMessages
 *   （含 healToolCallIds + orphan 剥离 + reorderToolGroups）。断言的是"上游实际收到的顺序"。
 */
import { describe, expect, it } from 'vitest';
import { LlmClient } from './client';

const client = new LlmClient({ id: 'p', apiUrl: 'http://x' } as any, { modelId: 'm' } as any);
/** 走真实发送前清洗链（tools 开启 → 保留 tool 协议） */
const send = (msgs: any[]) =>
  (client as any).sanitizeToolMessages(msgs.map((m) => (client as any).toApiMessage(m)), true);

const assistantWithCalls = (calls: Array<{ id: string; name: string; args?: string }>, content = '') => ({
  role: 'assistant',
  content,
  toolCalls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args ?? '{}' } })),
});
const toolMsg = (id: string, content = 'ok') => ({ role: 'tool', toolCallId: id, content });

describe('发送前顺序规整 · 工具组内不得夹入其它消息', () => {
  it('★★★ 核心：注入的 user 消息夹在 tool_calls 与其回执之间 → 被后移到组之后', () => {
    const out = send([
      { role: 'user', content: '开始任务' },
      assistantWithCalls([{ id: 'c1', name: 'file_read', args: '{"path":"a"}' }]),
      { role: 'user', content: '追加要求：改用表格' }, // ← 「立即发送」注入点
      toolMsg('c1'),
    ]);

    const roles = out.map((m: any) => m.role);
    // 修复前：assistant(tool_calls) → user → tool（后者不紧跟前者 → 上游 400）
    // 修复后：assistant(tool_calls) → tool → user
    expect(roles).toEqual(['user', 'assistant', 'tool', 'user']);
    const asstIdx = out.findIndex((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    expect(out[asstIdx + 1].role).toBe('tool');
    expect(out[asstIdx + 1].tool_call_id).toBe('c1');
  });

  it('★ 多工具组：夹心消息统一后移到对应组之后，组间相对顺序保持', () => {
    const out = send([
      assistantWithCalls([{ id: 'a1', name: 't1' }, { id: 'a2', name: 't2' }]),
      { role: 'user', content: '追加 A' },
      toolMsg('a1'),
      { role: 'user', content: '追加 B' },
      toolMsg('a2'),
    ]);
    const roles = out.map((m: any) => m.role);
    expect(roles).toEqual(['assistant', 'tool', 'tool', 'user', 'user']);
    // 两条追加消息按原相对顺序（A 在 B 前）
    const users = out.filter((m: any) => m.role === 'user').map((m: any) => m.content);
    expect(users).toEqual(['追加 A', '追加 B']);
  });

  it('★ 已正确的顺序：输出与输入逐项相同（幂等，不乱动）', () => {
    const input = [
      { role: 'user', content: '开始' },
      assistantWithCalls([{ id: 'c1', name: 'file_read' }]),
      toolMsg('c1'),
      { role: 'assistant', content: '完成' },
    ];
    const out = send(input);
    expect(out.map((m: any) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('★ 回执缺一条（没到齐）：不臆造回执，夹心消息仍后移，缺的交给 orphan 分支处理', () => {
    const out = send([
      assistantWithCalls([{ id: 'c1', name: 't1' }, { id: 'c2', name: 't2' }]),
      { role: 'user', content: '追加' },
      toolMsg('c1'), // c2 的回执始终没来
    ]);
    // c2 无回执 → sanitizeToolMessages 的 orphan 分支把 c2 剥掉，只留 c1
    const asst = out.find((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    expect(asst.tool_calls.map((tc: any) => tc.id)).toEqual(['c1']);
    expect(out.map((m: any) => m.role)).toEqual(['assistant', 'tool', 'user']);
  });
});
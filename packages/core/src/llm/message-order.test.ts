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

/**
 * ★★★ 2026-10-12 新增：**跨距回执归位**（修上游 400 `messages 参数非法` / code 1214）。
 *
 * 现场（会话 f0a901e3，10:52:21）：并发 `call_agent` 的组头先落库，主循环被追加消息推进
 * 新轮次，子结果 109 秒后才回来 → 组头 #1183 与回执 #1200 之间夹了 **16 条**
 * （含 1 条 user + 8 组完整 assistant/tool 对）→ 旧实现遇到新组头即 break，回执永远归不了位
 * → 违反 OpenAI「tool_calls 后必须紧跟配对 tool」→ 整轮 400 失败。
 */
describe('发送前顺序规整 · 跨距回执归位（2026-10-12）', () => {
  /** 校验输出满足 OpenAI 相邻约束：带 tool_calls 的 assistant 之后必须紧跟其配对 tool */
  const assertAdjacent = (out: any[]) => {
    for (let i = 0; i < out.length; i++) {
      const m = out[i];
      if (m.role === 'assistant' && m.tool_calls?.length) {
        let j = i + 1;
        for (const tc of m.tool_calls) {
          expect(out[j]?.role, `assistant#${i} 的 ${tc.id} 未紧跟配对 tool`).toBe('tool');
          expect(out[j]?.tool_call_id).toBe(tc.id);
          j++;
        }
      }
    }
  };

  it('★★★ 核心：组头与回执被 16 条消息隔开 → 回执被迁移到组头之后', () => {
    const out = send([
      assistantWithCalls([{ id: 'call_ab99', name: 'call_agent' }], '派只读核查'),
      { role: 'user', content: '任务：复核抖音某视频标题' },        // ← 追加注入
      assistantWithCalls([{ id: 'c2', name: 'browser_navigate' }]),
      toolMsg('c2'),
      assistantWithCalls([{ id: 'c3', name: 'browser_get_page_content' }]),
      toolMsg('c3'),
      assistantWithCalls([{ id: 'c4', name: 'browser_click' }]),
      toolMsg('c4'),
      { role: 'assistant', content: '结论性汇报' },
      toolMsg('call_ab99', '子智能体核查结果'),                    // ← 迟到 109 秒
      { role: 'assistant', content: '（调用失败）' },
    ]);

    assertAdjacent(out);
    // 组头之后必须紧跟它自己的回执（内容对得上）
    const hIdx = out.findIndex((m: any) => m.tool_calls?.[0]?.id === 'call_ab99');
    expect(out[hIdx + 1].role).toBe('tool');
    expect(out[hIdx + 1].tool_call_id).toBe('call_ab99');
    expect(out[hIdx + 1].content).toBe('子智能体核查结果');
    // 回执**只出现一次**（不重复引用）
    expect(out.filter((m: any) => m.tool_call_id === 'call_ab99').length).toBe(1);
  });

  it('★ 跨距归位后：其余组仍各自配对，且被跨过的消息数量不丢', () => {
    const out = send([
      assistantWithCalls([{ id: 'far', name: 'call_agent' }]),
      { role: 'user', content: '注入' },
      assistantWithCalls([{ id: 'n1', name: 't1' }]),
      toolMsg('n1'),
      { role: 'assistant', content: '中间正文' },
      toolMsg('far', '远距离回执'),
    ]);
    assertAdjacent(out);
    // 中间那条 assistant 正文不能因迁移而丢失
    expect(out.some((m: any) => m.content === '中间正文')).toBe(true);
    expect(out.some((m: any) => m.content === '注入')).toBe(true);
    // 回执总数守恒（2 条）
    expect(out.filter((m: any) => m.role === 'tool').length).toBe(2);
  });

  it('★ 幂等：顺序已正确（回执紧跟组头）时，不发生任何迁移', () => {
    const out = send([
      { role: 'user', content: '开始' },
      assistantWithCalls([{ id: 'c1', name: 't1' }]),
      toolMsg('c1'),
      assistantWithCalls([{ id: 'c2', name: 't2' }]),
      toolMsg('c2'),
    ]);
    expect(out.map((m: any) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool']);
    assertAdjacent(out);
  });

  it('★ 库里根本没有该回执（真 orphan）→ 绝不臆造，交给 orphan 分支剥离', () => {
    const out = send([
      assistantWithCalls([{ id: 'x1', name: 't1' }, { id: 'x2', name: 't2' }]),
      { role: 'user', content: '注入' },
      toolMsg('x1'), // x2 的回执从未落库
    ]);
    const asst = out.find((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    expect(asst.tool_calls.map((tc: any) => tc.id)).toEqual(['x1']);
    expect(out.filter((m: any) => m.role === 'tool').length).toBe(1);
  });

  it('★ 同批多工具、部分跨距：每条回执只被消费一次', () => {
    const out = send([
      assistantWithCalls([{ id: 'p1', name: 't1' }, { id: 'p2', name: 't2' }]),
      assistantWithCalls([{ id: 'q1', name: 't3' }]),
      toolMsg('q1'),
      toolMsg('p1', 'p1 回执'),
      toolMsg('p2', 'p2 回执'),
    ]);
    assertAdjacent(out);
    expect(out.filter((m: any) => m.tool_call_id === 'p1').length).toBe(1);
    expect(out.filter((m: any) => m.tool_call_id === 'p2').length).toBe(1);
    expect(out.filter((m: any) => m.tool_call_id === 'q1').length).toBe(1);
  });
});
// 「上游返回空 tool_call_id 导致历史被静默抹掉」的回归测试（2026-09-30，用户实报 high）。
//
// ★★★ 守的缺陷（从生产库两个会话定量确认）：
//   上游（实测百炼 deepseek-v4.1-flash、agnes 系列都有）流式返回的 tool_call **id 可能为空串**。
//   落库后 `assistant.tool_calls[].id = ''`、对应 tool 消息 `tool_call_id = null` →
//   `sanitizeToolMessages` 的「配对不上就丢弃」逻辑把整组「调用 + 结果」**静默抹掉** →
//   模型看到的历史变成：
//       user: 开始任务
//       assistant: 我来读取文件      ← 说了要调用，但调用记录没了
//       assistant: 继续              ← 工具结果也没了
//   → 模型学到"说了要调工具却什么都不带" → 继续吐 `arguments:"{}"` → **自我强化退化**。
//
// ★ 实测因果链（生产库统计）：
//     · 无 id 的调用 → 空参率 **90%**（312/345）
//     · 有 id 的调用 → 空参率 **30%**（126/420）
//     · 会话「下载御兽斋」id 缺失 60%、「第二章视频」缺失 0% —— 与两会话的严重程度吻合。
//
// ★ 修法：发送前**自愈**（healToolCallIds），按相邻顺序补合成 id，而不是丢弃。
//   为什么不在落库时修就够：历史消息可能是旧版本落库/压缩/迁移变形的，
//   **发送前自愈是最后一道、也是唯一可靠的一道**。
import { describe, expect, it } from 'vitest';
import { LlmClient } from './client';

const client = new LlmClient({ id: 'p', apiUrl: 'http://x' } as any, { modelId: 'm' } as any);
/** 走真实链路：toApiMessage（内部形态→API 形态）→ sanitizeToolMessages（发送前清洗） */
const send = (msgs: any[]) =>
  (client as any).sanitizeToolMessages(msgs.map((m) => (client as any).toApiMessage(m)), true);

describe('空 tool_call_id 的自愈（不丢历史）', () => {
  it('★★★ 核心场景：id 为空串时，调用与结果都必须保留并重新配对', () => {
    const out = send([
      { role: 'user', content: '开始任务' },
      {
        role: 'assistant',
        content: '我来读取文件',
        toolCalls: [{ id: '', type: 'function', function: { name: 'file_read', arguments: '{"path":"a.txt"}' } }],
      },
      { role: 'tool', content: '文件内容...', toolCallId: undefined },
      { role: 'assistant', content: '继续' },
    ]);

    const withTc = out.filter((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    const tools = out.filter((m: any) => m.role === 'tool');
    expect(withTc, '★ 调用记录被抹掉了（这正是空参退化的成因）').toHaveLength(1);
    expect(tools, '★ 工具结果被抹掉了').toHaveLength(1);
    // 配对必须成立
    expect(withTc[0].tool_calls[0].id).toBe(tools[0].tool_call_id);
    expect(String(withTc[0].tool_calls[0].id).trim()).not.toBe('');
    // 参数不能丢
    expect(withTc[0].tool_calls[0].function.arguments).toBe('{"path":"a.txt"}');
  });

  it('★★ 反例对照：修复前的逻辑会把整组抹掉（固定缺陷现场）', () => {
    // 旧逻辑：ids 集合里没有 '' → kept 为空 → 剥离 tool_calls；tool 消息也因 id 不在集合被丢
    const raw = [
      { role: 'assistant', content: 'x', tool_calls: [{ id: '', type: 'function', function: { name: 'f', arguments: '{}' } }] },
      { role: 'tool', content: 'r', tool_call_id: undefined },
    ];
    const idsOld = new Set(raw.filter((m) => m.role === 'tool' && (m as any).tool_call_id).map((m) => (m as any).tool_call_id));
    const keptOld = (raw[0] as any).tool_calls.filter((tc: any) => tc?.id && idsOld.has(tc.id));
    expect(keptOld, '旧逻辑下 kept 必然为空（= 调用记录被抹掉）').toHaveLength(0);

    // 新逻辑（走真实链路）保留并配对
    const fixed = send([
      { role: 'assistant', content: 'x', toolCalls: [{ id: '', type: 'function', function: { name: 'f', arguments: '{}' } }] },
      { role: 'tool', content: 'r', toolCallId: undefined },
    ]);
    expect(fixed.some((m: any) => m.tool_calls?.length), '★ 新逻辑必须保留调用记录').toBe(true);
    expect(fixed.filter((m: any) => m.role === 'tool')).toHaveLength(1);
  });

  it('★ 不传 tools 的模型（sendTools=false）走降级路径：tool 降级为 user 且带前缀', () => {
    const one = (client as any).sanitizeToolMessages(
      [{ role: 'tool', content: '结果', tool_call_id: undefined }],
      false,
    );
    expect(one[0].role).toBe('user');
    expect(String(one[0].content)).toContain('[工具结果]');
  });

  it('★★ 多个调用同批 + 全部缺 id → 按顺序一一配对（不能串位）', () => {
    const out = send([
      {
        role: 'assistant',
        content: '并行读三个文件',
        toolCalls: [
          { id: '', type: 'function', function: { name: 'file_read', arguments: '{"path":"a"}' } },
          { id: '', type: 'function', function: { name: 'file_read', arguments: '{"path":"b"}' } },
          { id: '', type: 'function', function: { name: 'file_list', arguments: '{"path":"c"}' } },
        ],
      },
      { role: 'tool', content: 'A', toolCallId: undefined },
      { role: 'tool', content: 'B', toolCallId: undefined },
      { role: 'tool', content: 'C', toolCallId: undefined },
    ]);
    const at = out.find((m: any) => m.role === 'assistant' && m.tool_calls?.length);
    const tools = out.filter((m: any) => m.role === 'tool');
    expect(at.tool_calls).toHaveLength(3);
    expect(tools).toHaveLength(3);
    // ★ 同序配对：第 k 个 tool 结果对上第 k 个调用（不能串位）
    const ids = at.tool_calls.map((t: any) => t.id);
    expect(new Set(ids).size, '★ 补出来的 id 必须互不相同').toBe(3);
    expect(tools.map((t: any) => t.tool_call_id)).toEqual(ids);
    // 结果内容与调用的参数顺序一致
    expect(at.tool_calls[0].function.arguments).toBe('{"path":"a"}');
    expect(tools[0].content).toBe('A');
    expect(at.tool_calls[2].function.arguments).toBe('{"path":"c"}');
    expect(tools[2].content).toBe('C');
  });

  it('★★ 已有正确 id 时**绝不改写**（自愈只动"确实缺"的）', () => {
    const out = send([
      {
        role: 'assistant',
        content: 'x',
        toolCalls: [{ id: 'call_real_1', type: 'function', function: { name: 'file_read', arguments: '{"path":"a"}' } }],
      },
      { role: 'tool', content: 'r', toolCallId: 'call_real_1' },
    ]);
    const at = out.find((m: any) => m.tool_calls?.length);
    expect(at.tool_calls[0].id).toBe('call_real_1');
    expect(out.filter((m: any) => m.role === 'tool')[0].tool_call_id).toBe('call_real_1');
  });

  it('★ 部分缺 id（混合批次）→ 缺的补、有的保留', () => {
    const out = send([
      {
        role: 'assistant',
        content: 'x',
        toolCalls: [
          { id: 'call_ok', type: 'function', function: { name: 'a', arguments: '{"x":1}' } },
          { id: '', type: 'function', function: { name: 'b', arguments: '{"x":2}' } },
        ],
      },
      { role: 'tool', content: 'R1', toolCallId: 'call_ok' },
      { role: 'tool', content: 'R2', toolCallId: undefined },
    ]);
    const at = out.find((m: any) => m.tool_calls?.length);
    const tools = out.filter((m: any) => m.role === 'tool');
    expect(at.tool_calls[0].id).toBe('call_ok');           // 原有保留
    expect(at.tool_calls[1].id).not.toBe('call_ok');        // 缺失另补
    expect(tools[0].tool_call_id).toBe('call_ok');
    expect(tools[1].tool_call_id).toBe(at.tool_calls[1].id);
  });

  it('★ 自愈后仍要满足"每个 tool_calls 都有对应 tool 消息"（上游 400 校验）', () => {
    const out = send([
      { role: 'assistant', content: '', toolCalls: [{ id: '', type: 'function', function: { name: 'f', arguments: '{}' } }] },
      { role: 'tool', content: 'r', toolCallId: undefined },
    ]);
    const callIds = new Set<string>();
    for (const m of out as any[]) {
      if (m.tool_calls) for (const t of m.tool_calls) callIds.add(t.id);
    }
    const toolIds = new Set((out as any[]).filter((m) => m.role === 'tool').map((m) => m.tool_call_id));
    for (const id of callIds) {
      expect(toolIds.has(id), `调用 ${id} 缺少对应的 tool 消息 → 上游会 400`).toBe(true);
    }
  });
});
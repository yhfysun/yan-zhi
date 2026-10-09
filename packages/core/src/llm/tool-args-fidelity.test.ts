// 工具调用参数「历史回放保真」与上下文压缩的单测。
//
// ★ 守的核心 bug（2026-09-29，high）：回放历史时 tool_calls 的参数被洗成 `{}` ——
//   `client.ts:toApiMessage` 里 `name` 两种形态都认、`arguments` 只读顶层，
//   而落库的是 DeltaToolCall（参数在 `function.arguments`）→ 实测生产库 220 个样本
//   命中率 100%。模型看到"自己上一轮参数为空"→ 模仿空参→ 自我强化退化循环。
//
// ★ 第二次修的：`ContextWindow` 的 `tokenCount()` 不计 toolCalls、`summarize()` 丢弃
//   toolCalls → 压缩后连「正常调用」的样本都不剩；且阈值口径不一致导致压缩几乎不触发。
import { describe, expect, it } from 'vitest';
import type { Message } from '@yan-zhi/shared';
import { toAnthropicMessages } from './anthropic';
import { LlmClient } from './client';
import { COMPRESS_TRIGGER_RATIO, ContextWindow } from '../compress/window';

const msg = (m: Partial<Message>): Message =>
  ({
    id: 'm1',
    conversationId: 'c1',
    role: 'user',
    createdAt: 0,
    ...m,
  }) as Message;

/** 直接调用真实实现（不只是复刻语义），确保实现改动能真正让测试变红。 */
const apiOf = (m: Message) => {
  const client = new LlmClient({ id: 'p', apiUrl: 'http://x' } as any, { modelId: 'm' } as any);
  return (client as any).toApiMessage(m) as { tool_calls?: Array<{ function: { name: string; arguments: string } }> };
};

/** 落库形态：OpenAI 流式 DeltaToolCall（名字/参数在 function 里） */
const deltaToolCalls = [
  { index: 0, id: 'call_1', type: 'function', function: { name: 'python_exec', arguments: '{"code":"print(1)"}' } },
  { index: 1, id: 'call_2', type: 'function', function: { name: 'file_read', arguments: '{"path":"/tmp/a.txt"}' } },
];

/** 内部形态：ToolCall（名字/参数在顶层） */
const internalToolCalls = [
  { id: 'call_3', toolName: 'python_exec', arguments: '{"code":"print(2)"}' },
  { id: 'call_4', toolName: 'python_exec', arguments: { code: 'print(3)' } },
];

describe('工具调用参数在历史回放中不丢失', () => {
  it('toApiMessage 保留 DeltaToolCall（落库形态）的参数 —— 回归主 bug', () => {
    const out = apiOf(msg({ role: 'assistant', content: '', toolCalls: deltaToolCalls as any }));
    expect(out.tool_calls!.map((t) => t.function.name)).toEqual(['python_exec', 'file_read']);
    expect(out.tool_calls!.map((t) => t.function.arguments)).toEqual([
      '{"code":"print(1)"}',
      '{"path":"/tmp/a.txt"}',
    ]);
    // 关键：不得有一个参数变成 "{}"
    expect(out.tool_calls!.every((t) => t.function.arguments !== '{}')).toBe(true);
  });

  it('toApiMessage 同样保留内部 ToolCall（顶层形态）的参数', () => {
    const out = apiOf(msg({ role: 'assistant', toolCalls: internalToolCalls as any }));
    expect(out.tool_calls!.map((t) => t.function.name)).toEqual(['python_exec', 'python_exec']);
    expect(out.tool_calls!.map((t) => t.function.arguments)).toEqual([
      '{"code":"print(2)"}',
      '{"code":"print(3)"}',
    ]);
  });

  it('toAnthropicMessages 对两种形态都能取出参数（Claude 路径同类遗漏）', () => {
    const r = toAnthropicMessages([
      msg({ role: 'assistant', content: '', toolCalls: deltaToolCalls as any }),
    ]);
    const blocks = r.messages[0].content as any[];
    const uses = blocks.filter((b) => b.type === 'tool_use');
    expect(uses).toHaveLength(2);
    expect(uses[0].name).toBe('python_exec');
    expect(uses[0].input).toEqual({ code: 'print(1)' });
    expect(uses[1].input).toEqual({ path: '/tmp/a.txt' });
  });

  it('反例对照：若只读顶层 arguments，DeltaToolCall 会全变空 —— 固定根因', () => {
    const wrong = (tc: any) => (typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}));
    const out = deltaToolCalls.map(wrong);
    expect(out).toEqual(['{}', '{}']); // 证明 bug 真实存在且方向明确
  });
});

describe('ContextWindow 计入并保留 toolCalls', () => {
  const withTools = msg({
    role: 'assistant',
    content: '',
    toolCalls: deltaToolCalls as any,
  });

  it('tokenCount 计入 toolCalls（此前完全漏算）', () => {
    const cw = new ContextWindow(10_000_000, 6);
    const withoutTools = msg({ role: 'assistant', content: '' });
    const a = cw.tokenCount([withoutTools]);
    const b = cw.tokenCount([withTools]);
    expect(b).toBeGreaterThan(a);
  });

  it('无摘要模型时的兜底摘要保留工具调用信息', async () => {
    const cw = new ContextWindow(1, 1); // 阈值极小 + 未设摘要模型 → 走兜底
    // ★ 2026-10-09 同步：用例改为**完整配对**的 tool_calls 组（2 调用 ↔ 2 应答）。
    //   原用例只回 1 个结果（2 调用 ↔ 1 应答），属"残缺调用组" → 2026-10-08 新增的
    //   **悬空调用保护**（见 window.ts：结果未齐全的组必须整体拽进保留窗口）会把切点
    //   前移到该组之前 → `cut < 2` 早退守卫放弃本次压缩 → 不产摘要（原用例因此变红）。
    //   那是实现有意的保守：宁可原样发送，也不产"摘要覆盖 0~1 条"的畸形结果。
    //   本用例要钉的语义（兜底摘要把 tool_calls 带进摘要）不变，只是构造需配对完整。
    const out = await cw.compress([
      msg({ role: 'user', content: '开始' }),
      withTools,
      msg({ role: 'tool', content: 'ok', toolCallId: 'call_1' }),
      msg({ role: 'tool', content: 'ok', toolCallId: 'call_2' }),
      msg({ role: 'assistant', content: '收尾' }),
    ]);
    const summaryMsg = out.find((m) => m.id === 'summary');
    expect(summaryMsg).toBeDefined();
    expect(String(summaryMsg!.content)).toContain('python_exec');
  });

  it('forContextWindow 把上下文窗口换算成触发阈值（口径统一，不传 100 万级）', () => {
    const cw = ContextWindow.forContextWindow(1_048_576, 6);
    // 阈值必须显著小于上下文窗口，否则等于关掉压缩
    expect((cw as any).maxTokens).toBe(Math.floor(1_048_576 * COMPRESS_TRIGGER_RATIO));
    expect((cw as any).maxTokens).toBeLessThan(1_048_576);
  });

  it('forContextWindow 对非法/缺失输入回落到合理默认', () => {
    for (const bad of [0, -1, NaN, undefined as any]) {
      const cw = ContextWindow.forContextWindow(bad, 6);
      expect((cw as any).maxTokens).toBeGreaterThan(0);
    }
  });

  it('压缩边界仍不与 tool 消息中间切开（不产生孤儿 tool）', async () => {
    const cw = new ContextWindow(1, 2);
    const out = await cw.compress([
      msg({ role: 'user', content: 'q' }),
      withTools,
      msg({ role: 'tool', content: 'r1', toolCallId: 'call_1' }),
      msg({ role: 'tool', content: 'r2', toolCallId: 'call_2' }),
    ]);
    // 保留窗口的起始不能是 tool
    const kept = out.slice(1);
    if (kept.length) expect(kept[0].role).not.toBe('tool');
  });
});
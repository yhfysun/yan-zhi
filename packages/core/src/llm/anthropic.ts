// Anthropic (Claude) Messages API 适配层
// 将内部 Message[] 与 OpenAI 格式 tools 转换成 Anthropic 约定，
// 并把 Anthropic 的 SSE 流解析成与 OpenAI 路径一致的 ChatChunk。
import type { Message, ChatChunk, DeltaToolCall } from '@yan-zhi/shared';

/** 将工具入参（可能是 JSON 字符串或对象）统一解析为对象 */
function parseInput(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args || '{}');
    } catch {
      return {};
    }
  }
  return (args as Record<string, unknown>) || {};
}

export interface AnthropicRequest {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: unknown[] }>;
}

/**
 * 将内部 Message[] 转换为 Anthropic 请求：
 * - system 角色的消息提取为顶层 `system` 字段
 * - user/assistant 转成 content block 数组
 * - assistant 的 toolCalls 转成 tool_use block
 * - tool 角色的消息聚合为紧跟其后的 user 消息中的 tool_result block
 */
export function toAnthropicMessages(messages: Message[]): AnthropicRequest {
  let system: string | undefined;
  const out: AnthropicRequest['messages'] = [];
  let pendingToolResults: Array<Record<string, unknown>> = [];

  const flushToolResults = () => {
    if (pendingToolResults.length) {
      out.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const m of messages) {
    if (m.role === 'system') {
      const text = m.content || '';
      system = system ? `${system}\n\n${text}` : text;
      continue;
    }
    if (m.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content || '',
      });
      continue;
    }
    flushToolResults();
    if (m.role === 'user') {
      out.push({ role: 'user', content: [{ type: 'text', text: m.content || '' }] });
    } else if (m.role === 'assistant') {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls || []) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.toolName,
          input: parseInput(tc.arguments),
        });
      }
      out.push({ role: 'assistant', content });
    }
  }
  flushToolResults();
  return { system: system || undefined, messages: out };
}

/** 将 OpenAI 格式 tools（{type:'function', function:{name,description,parameters}}）转成 Anthropic 格式 */
export function toAnthropicTools(tools: unknown[] | undefined): Array<Record<string, unknown>> {
  if (!tools || !tools.length) return [];
  return tools.map((t: any) => {
    const fn = t.function || {};
    return {
      name: fn.name,
      description: fn.description || '',
      input_schema: fn.parameters || { type: 'object', properties: {} },
    };
  });
}

/**
 * 解析 Anthropic 流式 SSE，产出与 OpenAI 路径一致的 ChatChunk。
 * Anthropic 事件使用 `event:` / `data:` 行，data 为 JSON，type 字段形如
 * message_start / content_block_start / content_block_delta / message_delta / message_stop。
 */
export async function* parseAnthropicSSE(stream: ReadableStream<Uint8Array>): AsyncIterable<ChatChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = '';
  let dataStr = '';
  // content_block.index -> 顺序 tool index（保证 toolCalls 按 0,1,2 连续）
  const blockToTool: Record<number, number> = {};
  let toolSeq = 0;
  let inputTokens = 0;

  const reset = () => {
    eventType = '';
    dataStr = '';
  };

  const processLines = function* (lines: string[]): Generator<ChatChunk> {
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (eventType && dataStr) {
          let ev: any = null;
          try {
            ev = JSON.parse(dataStr);
          } catch {
            ev = null;
          }
          if (ev) {
            const type = ev.type || eventType;
            if (type === 'message_start') {
              inputTokens = ev.message?.usage?.input_tokens ?? 0;
            } else if (type === 'content_block_start') {
              if (ev.content_block?.type === 'tool_use') {
                const toolIdx = toolSeq++;
                blockToTool[ev.index] = toolIdx;
                const tc: DeltaToolCall = {
                  index: toolIdx,
                  id: ev.content_block.id,
                  type: 'function',
                  function: { name: ev.content_block.name, arguments: '' },
                };
                yield { delta: { toolCalls: [tc] } } as ChatChunk;
              }
            } else if (type === 'content_block_delta') {
              const d = ev.delta || {};
              if (d.type === 'text_delta') {
                yield { delta: { content: d.text } } as ChatChunk;
              } else if (d.type === 'input_json_delta') {
                const toolIdx = blockToTool[ev.index];
                if (toolIdx !== undefined) {
                  const tc: DeltaToolCall = { index: toolIdx, function: { arguments: d.partial_json } };
                  yield { delta: { toolCalls: [tc] } } as ChatChunk;
                }
              } else if (d.type === 'thinking_delta') {
                yield { delta: { reasoningContent: d.thinking } } as ChatChunk;
              }
            } else if (type === 'message_delta') {
              const usage = ev.usage
                ? { promptTokens: inputTokens, completionTokens: ev.usage.output_tokens ?? 0 }
                : undefined;
              yield { finishReason: ev.delta?.stop_reason, usage } as ChatChunk;
            }
          }
          reset();
        }
        continue;
      }
      if (trimmed.startsWith('event:')) {
        eventType = trimmed.slice(6).trim();
      } else if (trimmed.startsWith('data:')) {
        dataStr = trimmed.slice(5).trim();
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      yield* processLines(lines);
    }
    // 处理流末尾可能残留、无尾随空行的最后一帧
    if (buffer.trim()) {
      yield* processLines(buffer.split('\n'));
    }
  } finally {
    reader.releaseLock();
  }
}

/** 将 Anthropic 非流式响应转换为 ChatChunk */
export function anthropicResponseToChunk(data: any): ChatChunk {
  const text = (data?.content || [])
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('');
  const toolCalls: DeltaToolCall[] = (data?.content || [])
    .filter((c: any) => c.type === 'tool_use')
    .map((c: any, i: number) => ({
      index: i,
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
    }));
  return {
    delta: {
      content: text || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    },
    finishReason: data?.stop_reason,
    usage: data?.usage
      ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens }
      : undefined,
  };
}

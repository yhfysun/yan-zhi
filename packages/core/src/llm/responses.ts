// OpenAI Responses API 适配层（2026-10-17）
// 将内部 Message[] 与 OpenAI 格式 tools 转换成 Responses 约定（instructions + input[]），
// 并把 Responses 的 SSE 流解析成与 OpenAI Chat / Anthropic 两条路径**同形**的 ChatChunk。
//
// ★★ 为什么要同形：下游（accumulateToolCallDeltas、任务主循环、UI 渲染）只认 ChatChunk。
//    若 Responses 产出另一种形状，就得在下游加 `if (protocol === 'openai-responses')` ——
//    那等于把协议差异下沉到业务层，加第四种协议时还要再改一遍。
//    ⇒ 本模块的验收标准就是「下游一行都不用改」（见 responses.test.ts）。
import type { Message, ChatChunk, DeltaToolCall } from '@yan-zhi/shared';
import { normalizeResponsesUsage } from '@yan-zhi/shared';
import { parseSseFrames, type SseFrame } from './sse-frames.js';

export interface ResponsesInput {
  instructions?: string;
  input: Array<Record<string, unknown>>;
}

/** 取消息里的纯文本（content 可能是 string、也可能是 [{type:'text',...}]） */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : String(content);
  const parts: string[] = [];
  for (const b of content as any[]) {
    if (!b) continue;
    if (typeof b === 'string') { parts.push(b); continue; }
    if (b.type === 'text' && b.text != null) parts.push(String(b.text));
  }
  return parts.join('');
}

/** 取消息里的图片 URL 列表（OpenAI 风格 content 数组里的 image_url 块） */
function imageUrlsOf(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const b of content as any[]) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'image_url') {
      const u = String(b.image_url?.url || b.url || '');
      if (u) out.push(u);
    } else if (b.type === 'image' && (b.image_url || b.url)) {
      out.push(String(b.image_url || b.url));
    }
  }
  return out;
}

/**
 * 内部 Message[] → Responses 的 `{ instructions, input[] }`。
 *
 * ★ system 消息在 Responses 里没有对应 item，只能进 `instructions` ⇒ 多条 system **必须合并**
 *   （直接丢弃第二条会静默丢掉系统提示里的一半约束，而症状是"模型不遵守规则"而不是报错）。
 *
 * ★ `reasoning_content` **不回传**：与现有 OpenAI 路径同口径（回传会污染历史、且多数网关不认）。
 */
export function toResponsesInput(
  /**
   * ★ 类型是 `unknown[]` 而不是 `Message[]`：调用方（`client.ts`）传的是
   *   `toApiMessage()` 的产物（OpenAI 形状的 Record），**不是**内部 `Message`。
   *   必须经过 `toApiMessage` —— 多模态展开（`imageParts` → `image_url` 块）只发生在那里，
   *   直接传原始 `Message` 会**静默丢掉所有图片**。
   */
  messages: unknown[],
): ResponsesInput {
  const systemParts: string[] = [];
  const input: Array<Record<string, unknown>> = [];

  for (const m of messages || []) {
    const role = String((m as any)?.role || '');
    if (role === 'system') {
      const t = textOf((m as any).content);
      if (t) systemParts.push(t);
      continue;
    }

    // 工具结果：Responses 用独立的 function_call_output item（没有 role 字段）
    if (role === 'tool') {
      const callId = String((m as any).tool_call_id || (m as any).toolCallId || '');
      if (!callId) continue; // 没有 call_id 的孤儿结果无法挂回，丢弃比造一个假 id 安全
      input.push({
        type: 'function_call_output',
        call_id: callId,
        output: textOf((m as any).content),
      });
      continue;
    }

    // assistant 的工具调用：转成 function_call item（**在文本之前**，顺序与请求历史一致）
    const calls = (m as any).tool_calls || (m as any).toolCalls;
    if (role === 'assistant' && Array.isArray(calls) && calls.length) {
      for (const c of calls) {
        const fn = c?.function || {};
        input.push({
          type: 'function_call',
          call_id: String(c?.id || fn?.name || ''),
          name: String(fn?.name || ''),
          arguments: typeof fn?.arguments === 'string' ? fn.arguments : JSON.stringify(fn?.arguments ?? {}),
        });
      }
    }

    const text = textOf((m as any).content);
    const images = imageUrlsOf((m as any).content);
    if (!text && !images.length) continue; // 纯工具调用、无文本的 assistant 消息不再发一个空 item

    const content: Array<Record<string, unknown>> = [];
    if (text) content.push({ type: role === 'assistant' ? 'output_text' : 'input_text', text });
    for (const url of images) content.push({ type: 'input_image', image_url: url });
    input.push({ role: role === 'assistant' ? 'assistant' : 'user', content });
  }

  const instructions = systemParts.join('\n\n').trim();
  return { instructions: instructions || undefined, input };
}

/** OpenAI 风格 tools → Responses 风格（**去掉 `function.` 包装**，字段平铺） */
export function toResponsesTools(tools: unknown[] | undefined): Array<Record<string, unknown>> {
  if (!tools || !tools.length) return [];
  return tools.map((t: any) => {
    const fn = t?.function || t || {};
    return {
      type: 'function',
      name: fn.name,
      description: fn.description || '',
      parameters: fn.parameters || { type: 'object', properties: {} },
    };
  });
}

/** ToolChoiceOption → Responses 的 tool_choice */
export function toResponsesToolChoice(tc: unknown): unknown {
  if (tc == null || tc === 'auto') return 'auto';
  if (tc === 'required') return 'required';
  if (tc === 'none') return 'none';
  if (typeof tc === 'object' && tc !== null) {
    const name = (tc as any).name || (tc as any)?.function?.name;
    if (name) return { type: 'function', name };
  }
  return 'auto';
}

/** Responses usage → ChatChunk.usage（与 OpenAI Chat 路径**同形**：cached 是 prompt 的子集） */
function usageToChunkUsage(usage: any): ChatChunk['usage'] | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  return {
    promptTokens: Number(usage.input_tokens) || 0,
    completionTokens: Number(usage.output_tokens) || 0,
    cachedTokens: Number(usage.input_tokens_details?.cached_tokens) || undefined,
    // ★ 计价明细（2026-10-17）：在协议边界归一化。
    //   注意字段名与 Chat Completions 不同（input_tokens_details），**不要**用 OpenAI 的归一化函数。
    detail: normalizeResponsesUsage(usage),
  };
}

/**
 * 解析 Responses 流式 SSE，产出与 OpenAI Chat 路径同形的 ChatChunk。
 *
 * ★ `toolCalls` 的 `index` 从 0 **连续**递增（与 OpenAI / Anthropic 两条路径一致）——
 *   下游 `accumulateToolCallDeltas` 依赖 index 分组，不连续会导致参数串到别的工具上。
 */
export async function* parseResponsesSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<ChatChunk> {
  // item_id -> 顺序 index（Responses 用 item_id 关联，而下游认 index）
  const itemToIndex = new Map<string, number>();
  let nextIndex = 0;
  let sawFunctionCall = false;
  let terminated = false;

  for await (const frame of parseSseFrames(stream)) {
    const ev = frame.json;
    if (!ev || typeof ev !== 'object') continue;
    // 网关可能省略 event: 行，把类型放在 JSON 里；两个来源都认
    const type = String(ev.type || frame.eventType || '');

    if (type === 'response.output_text.delta') {
      if (ev.delta) yield { delta: { content: String(ev.delta) } };
    } else if (type === 'response.reasoning_text.delta' || type === 'response.reasoning_summary_text.delta') {
      if (ev.delta) yield { delta: { reasoningContent: String(ev.delta) } };
    } else if (type === 'response.output_item.added') {
      const item = ev.item || {};
      if (item.type === 'function_call') {
        sawFunctionCall = true;
        const idx = nextIndex++;
        if (item.id || item.call_id) itemToIndex.set(String(item.id || item.call_id), idx);
        const tc: DeltaToolCall = {
          index: idx,
          id: String(item.call_id || item.id || ''),
          type: 'function',
          function: { name: String(item.name || ''), arguments: '' },
        };
        yield { delta: { toolCalls: [tc] } };
      }
    } else if (type === 'response.function_call_arguments.delta') {
      const idx = itemToIndex.get(String(ev.item_id || ''));
      if (idx !== undefined && ev.delta) {
        yield { delta: { toolCalls: [{ index: idx, function: { arguments: String(ev.delta) } }] } };
      }
    } else if (type === 'response.output_item.done') {
      // 末帧给完整字段（含最终 arguments），用来兜住"分片丢帧"的情况
      const item = ev.item || {};
      if (item.type === 'function_call') {
        const idx = itemToIndex.get(String(item.id || item.call_id || '')) ?? 0;
        const tc: DeltaToolCall = {
          index: idx,
          id: String(item.call_id || item.id || ''),
          type: 'function',
          function: { name: String(item.name || ''), arguments: String(item.arguments || '') },
        };
        yield { delta: { toolCalls: [tc] } };
      }
    } else if (type === 'response.completed') {
      const resp = ev.response || {};
      yield {
        finishReason: sawFunctionCall ? 'tool_calls' : 'stop',
        usage: usageToChunkUsage(resp.usage),
        terminated: true,
      };
      terminated = true;
    } else if (type === 'response.incomplete') {
      // 通常是 max_output_tokens 截断：与 OpenAI 的 finish_reason='length' 同义
      yield {
        finishReason: 'length',
        usage: usageToChunkUsage((ev.response || {}).usage),
        terminated: true,
      };
      terminated = true;
    }
  }

  // ★ 收尾标记：与 OpenAI / Anthropic 两条路径同判据 —— 未见终态事件 = 流被掐断，
  //   上层据此走续写/报错，**不能**当成正常完成（否则 content 为空却 emit task:completed）。
  if (!terminated) yield { terminated: false };
}

/**
 * Responses 的 400 降级判据 —— **纯函数**（与 OpenAI 的 `shouldRetryWithoutTools` 同思路，
 * 但**不能复用同一个函数**：两套请求体结构不同，混用必然漂移）。
 *
 * ★ 为什么需要：Responses 各家实现子集不一（部分网关不认 `instructions` / `temperature` /
 *   `reasoning` / `top_p`），而上新协议最常见的失败就是"刚上线即遇 400"。
 *   剥掉这些可选字段重试一次，能把"完全不可用"变成"功能略减但能用"。
 *
 * 保守口径：只对 **400** 生效（402/429/5xx 剥字段重试没有意义），且文案命中任一条即剥。
 */
export function shouldRetryWithoutResponsesOnlyFields(status: number, text: string): boolean {
  if (status !== 400) return false;
  const t = String(text ?? '');
  if (!t) return true; // 空响应体的 400：看不到原因，试一次降级比直接报错有用
  return /temperature|top_p|reasoning|instructions|unknown[_ ]?param|unsupported|not supported|不支持|参数/i.test(t);
}

/** 非流式响应（chat() / chatTest()）→ ChatChunk */
export function responsesResultToChunk(data: any): ChatChunk {
  const out: ChatChunk = {};
  const resp = data?.output && Array.isArray(data.output) ? data : (data?.response || data);
  const items: any[] = Array.isArray(resp?.output) ? resp.output : [];

  const texts: string[] = [];
  const reasoning: string[] = [];
  const toolCalls: DeltaToolCall[] = [];
  let idx = 0;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (!c) continue;
        if (c.type === 'output_text' && c.text) texts.push(String(c.text));
        else if (c.type === 'reasoning_text' && c.text) reasoning.push(String(c.text));
      }
    } else if (item.type === 'function_call') {
      toolCalls.push({
        index: idx++,
        id: String(item.call_id || item.id || ''),
        type: 'function',
        function: { name: String(item.name || ''), arguments: String(item.arguments || '') },
      });
    }
  }

  const content = texts.join('');
  const rc = reasoning.join('');
  if (content || rc) {
    out.delta = {};
    if (content) out.delta.content = content;
    if (rc) out.delta.reasoningContent = rc;
  }
  if (toolCalls.length) {
    out.delta = out.delta || {};
    out.delta.toolCalls = toolCalls;
  }
  out.finishReason = toolCalls.length ? 'tool_calls' : (String(resp?.status) === 'incomplete' ? 'length' : 'stop');
  out.usage = usageToChunkUsage(resp?.usage);
  out.terminated = true;
  return out;
}

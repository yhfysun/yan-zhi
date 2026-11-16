import type { ChatChunk, TokenUsageDetail } from '@yan-zhi/shared';

function usageForResponses(detail: TokenUsageDetail): Record<string, unknown> {
  return {
    input_tokens: detail.inputTokens,
    input_tokens_details: { cached_tokens: detail.cacheReadTokens },
    output_tokens: detail.outputTokens,
    total_tokens: detail.inputTokens + detail.outputTokens,
  };
}

function usageForAnthropic(detail: TokenUsageDetail): Record<string, number> {
  return {
    input_tokens: detail.inputTokens,
    cache_read_input_tokens: detail.cacheReadTokens,
    cache_creation_input_tokens: detail.cacheWriteTokens,
    output_tokens: detail.outputTokens,
  };
}

export function buildResponsesResult(
  id: string,
  model: string,
  chunk: ChatChunk,
  detail: TokenUsageDetail,
  createdAt = Date.now(),
): Record<string, unknown> {
  const output: Array<Record<string, unknown>> = [];
  const content = String(chunk.delta?.content || '');
  const reasoning = String(chunk.delta?.reasoningContent || '');
  if (content || reasoning) {
    output.push({
      id: `msg_${id}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: content, annotations: [] }],
    });
  }
  for (const [index, call] of (chunk.delta?.toolCalls || []).entries()) {
    const fn = (call.function || {}) as Record<string, unknown>;
    output.push({
      id: `fc_${id}_${index}`,
      type: 'function_call',
      status: 'completed',
      call_id: String(call.id || `call_${index}`),
      name: String(fn.name || ''),
      arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {}),
    });
  }
  return {
    id: `resp_${id}`,
    object: 'response',
    created_at: Math.floor(createdAt / 1000),
    status: 'completed',
    model,
    output,
    output_text: content,
    usage: usageForResponses(detail),
  };
}

export function buildAnthropicMessage(
  id: string,
  model: string,
  chunk: ChatChunk,
  detail: TokenUsageDetail,
): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  const text = String(chunk.delta?.content || '');
  if (text) content.push({ type: 'text', text });
  for (const [index, call] of (chunk.delta?.toolCalls || []).entries()) {
    const fn = (call.function || {}) as Record<string, unknown>;
    let input: unknown = {};
    if (typeof fn.arguments === 'string') {
      try {
        input = JSON.parse(fn.arguments);
      } catch {
        input = {};
      }
    } else {
      input = fn.arguments || {};
    }
    content.push({
      type: 'tool_use',
      id: String(call.id || `toolu_${index}`),
      name: String(fn.name || ''),
      input,
    });
  }
  const stopReason = chunk.delta?.toolCalls?.length
    ? 'tool_use'
    : chunk.finishReason === 'length' ? 'max_tokens' : 'end_turn';
  return {
    id: `msg_${id}`,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: usageForAnthropic(detail),
  };
}

export function responsesUsage(detail: TokenUsageDetail): Record<string, unknown> {
  return usageForResponses(detail);
}

export function anthropicUsage(detail: TokenUsageDetail): Record<string, unknown> {
  return usageForAnthropic(detail);
}

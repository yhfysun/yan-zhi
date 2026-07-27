// SSE 流式响应解析
import type { ChatChunk } from '@yan-zhi/shared';

const DONE = 'DONE';

export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncIterable<ChatChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === DONE || !data) continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          yield {
            delta: {
              content: delta?.content,
              reasoningContent: delta?.reasoning_content,
              toolCalls: delta?.tool_calls,
            },
            finishReason: json.choices?.[0]?.finish_reason,
            usage: json.usage
              ? { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens }
              : undefined,
          };
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

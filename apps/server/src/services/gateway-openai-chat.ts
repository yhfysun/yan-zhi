import type { Message, Role, ToolCall } from '@yan-zhi/shared';

export class GatewayRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayRequestError';
  }
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  if (!Array.isArray(content)) {
    throw new GatewayRequestError(422, 'invalid_content', 'message.content 必须是字符串或文本块数组');
  }
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      throw new GatewayRequestError(422, 'invalid_content', 'content 文本块格式不正确');
    }
    const block = item as Record<string, unknown>;
    if (block.type === 'text' || block.type === 'input_text') {
      parts.push(String(block.text || ''));
      continue;
    }
    if (block.type === 'image_url' || block.type === 'image') {
      throw new GatewayRequestError(422, 'unsupported_image_input', '第一版本地网关暂不支持图片输入');
    }
    throw new GatewayRequestError(422, 'unsupported_content', `不支持的 content 类型: ${String(block.type || '')}`);
  }
  return parts.join('');
}

function normalizeRole(role: unknown): Role {
  if (role === 'system' || role === 'developer') return 'system';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool') return 'tool';
  return 'user';
}

function normalizeToolCalls(raw: unknown): ToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const call = item as Record<string, unknown>;
    const fn = (call.function && typeof call.function === 'object' ? call.function : {}) as Record<string, unknown>;
    const toolName = String(fn.name || call.name || '').trim();
    if (!toolName) continue;
    const rawArgs = fn.arguments ?? call.arguments ?? {};
    let args: unknown = rawArgs;
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        args = rawArgs;
      }
    }
    out.push({
      id: String(call.id || `call_${out.length + 1}`),
      messageId: '',
      toolName,
      arguments: args,
    });
  }
  return out.length ? out : undefined;
}

export function normalizeGatewayMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new GatewayRequestError(422, 'invalid_messages', 'messages 必须是非空数组');
  }
  if (raw.length > 500) {
    throw new GatewayRequestError(422, 'too_many_messages', 'messages 最多 500 条');
  }
  let totalChars = 0;
  const messages: Message[] = raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new GatewayRequestError(422, 'invalid_messages', `messages[${index}] 格式不正确`);
    }
    const source = item as Record<string, unknown>;
    const content = contentToText(source.content);
    totalChars += content.length;
    if (totalChars > 2_000_000) {
      throw new GatewayRequestError(413, 'request_too_large', '消息正文超过 2,000,000 字符');
    }
    return {
      id: `gw_${index}`,
      conversationId: '',
      role: normalizeRole(source.role),
      content,
      toolCalls: normalizeToolCalls(source.tool_calls),
      toolCallId: typeof source.tool_call_id === 'string' ? source.tool_call_id : undefined,
      reasoningContent: typeof source.reasoning_content === 'string' ? source.reasoning_content : undefined,
      createdAt: 0,
    };
  });
  for (const message of messages) {
    if (message.role === 'tool' && !message.toolCallId) {
      throw new GatewayRequestError(422, 'invalid_tool_message', 'tool 消息必须带 tool_call_id');
    }
  }
  return messages;
}

function clampMaxTokens(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 2048;
  return Math.min(65_536, Math.max(1, Math.floor(n)));
}

export interface NormalizedGatewayChat {
  messages: Message[];
  tools?: unknown[];
  temperature?: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  toolChoice?: 'auto' | 'required' | 'none' | { type: 'function'; name: string };
  responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown };
}

export function normalizeGatewayChat(body: unknown): NormalizedGatewayChat {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new GatewayRequestError(422, 'invalid_request', '请求体必须是 JSON 对象');
  }
  const source = body as Record<string, unknown>;
  const rawChoice = source.tool_choice;
  let toolChoice: NormalizedGatewayChat['toolChoice'];
  if (rawChoice === 'auto' || rawChoice === 'required' || rawChoice === 'none') {
    toolChoice = rawChoice;
  } else if (rawChoice && typeof rawChoice === 'object') {
    const choice = rawChoice as Record<string, any>;
    const name = String(choice.function?.name || choice.name || '').trim();
    if (choice.type === 'function' && name) toolChoice = { type: 'function', name };
  }
  const rawFormat = source.response_format as Record<string, unknown> | undefined;
  const responseFormat = rawFormat?.type === 'json_object' || rawFormat?.type === 'json_schema'
    ? {
        type: rawFormat.type,
        ...(rawFormat.type === 'json_schema' && rawFormat.json_schema
          ? { json_schema: rawFormat.json_schema }
          : {}),
      } as NormalizedGatewayChat['responseFormat']
    : undefined;
  return {
    messages: normalizeGatewayMessages(source.messages),
    tools: Array.isArray(source.tools) && source.tools.length ? source.tools.slice(0, 128) : undefined,
    temperature: Number.isFinite(Number(source.temperature)) ? Number(source.temperature) : undefined,
    maxTokens: clampMaxTokens(source.max_completion_tokens ?? source.max_tokens),
    topP: Number.isFinite(Number(source.top_p)) ? Number(source.top_p) : undefined,
    frequencyPenalty: Number.isFinite(Number(source.frequency_penalty)) ? Number(source.frequency_penalty) : undefined,
    presencePenalty: Number.isFinite(Number(source.presence_penalty)) ? Number(source.presence_penalty) : undefined,
    toolChoice,
    responseFormat,
  };
}

export function openAiError(status: number, code: string, message: string): {
  error: { message: string; type: string; code: string };
} {
  const type = status === 401
    ? 'authentication_error'
    : status === 403
      ? 'permission_error'
      : status === 429 || status === 402
        ? 'quota_error'
        : status >= 500 ? 'upstream_error' : 'invalid_request_error';
  return { error: { message, type, code } };
}

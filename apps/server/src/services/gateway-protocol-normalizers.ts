import type { Message, Role, ToolCall } from '@yan-zhi/shared';
import { GatewayRequestError, type NormalizedGatewayChat } from './gateway-openai-chat.js';

function textBlocks(content: unknown, allowToolBlocks = false): {
  text: string;
  toolCalls?: ToolCall[];
  toolMessages?: Message[];
} {
  if (typeof content === 'string') return { text: content };
  if (content == null) return { text: '' };
  if (!Array.isArray(content)) {
    throw new GatewayRequestError(422, 'invalid_content', 'content 必须是字符串或内容块数组');
  }
  const texts: string[] = [];
  const toolCalls: ToolCall[] = [];
  const toolMessages: Message[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      throw new GatewayRequestError(422, 'invalid_content', '内容块格式不正确');
    }
    const block = item as Record<string, any>;
    if (block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') {
      texts.push(String(block.text || ''));
      continue;
    }
    if (block.type === 'image' || block.type === 'image_url') {
      throw new GatewayRequestError(422, 'unsupported_image_input', '本地网关暂不支持图片输入');
    }
    if (allowToolBlocks && block.type === 'tool_use') {
      toolCalls.push({
        id: String(block.id || `call_${toolCalls.length + 1}`),
        messageId: '',
        toolName: String(block.name || ''),
        arguments: block.input ?? {},
      });
      continue;
    }
    if (allowToolBlocks && block.type === 'tool_result') {
      toolMessages.push({
        id: `tool_${toolMessages.length}`,
        conversationId: '',
        role: 'tool',
        content: typeof block.content === 'string'
          ? block.content
          : textBlocks(block.content).text,
        toolCallId: String(block.tool_use_id || ''),
        createdAt: 0,
      });
      continue;
    }
    throw new GatewayRequestError(422, 'unsupported_content', `不支持的内容块: ${String(block.type || '')}`);
  }
  return { text: texts.join(''), toolCalls: toolCalls.length ? toolCalls : undefined, toolMessages };
}

function roleOf(value: unknown): Role {
  if (value === 'assistant') return 'assistant';
  if (value === 'tool') return 'tool';
  return value === 'system' || value === 'developer' ? 'system' : 'user';
}

function normalizeResponsesTools(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: unknown[] = [];
  for (const item of raw.slice(0, 128)) {
    if (!item || typeof item !== 'object') continue;
    const tool = item as Record<string, any>;
    if (tool.type !== 'function') continue;
    out.push({
      type: 'function',
      function: {
        name: String(tool.name || tool.function?.name || ''),
        description: String(tool.description || tool.function?.description || ''),
        parameters: tool.parameters || tool.function?.parameters || { type: 'object', properties: {} },
      },
    });
  }
  return out.length ? out : undefined;
}

function normalizeAnthropicTools(raw: unknown): unknown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: unknown[] = [];
  for (const item of raw.slice(0, 128)) {
    if (!item || typeof item !== 'object') continue;
    const tool = item as Record<string, any>;
    const name = String(tool.name || tool.function?.name || '');
    if (!name) continue;
    out.push({
      type: 'function',
      function: {
        name,
        description: String(tool.description || ''),
        parameters: tool.input_schema || tool.parameters || { type: 'object', properties: {} },
      },
    });
  }
  return out.length ? out : undefined;
}

function normalizeToolChoice(raw: unknown): NormalizedGatewayChat['toolChoice'] {
  if (raw === 'auto' || raw === 'required' || raw === 'none') return raw;
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, any>;
  if (value.type === 'tool' && value.name) return { type: 'function', name: String(value.name) };
  if (value.type === 'function' && value.name) return { type: 'function', name: String(value.name) };
  if (value.type === 'any') return 'required';
  if (value.type === 'auto') return 'auto';
  if (value.type === 'none') return 'none';
  return undefined;
}

export function normalizeResponsesRequest(body: unknown): NormalizedGatewayChat {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new GatewayRequestError(422, 'invalid_request', '请求体必须是 JSON 对象');
  }
  const source = body as Record<string, any>;
  const messages: Message[] = [];
  if (typeof source.instructions === 'string' && source.instructions.trim()) {
    messages.push({
      id: 'instructions', conversationId: '', role: 'system',
      content: source.instructions, createdAt: 0,
    });
  }
  if (typeof source.input === 'string') {
    messages.push({ id: 'input', conversationId: '', role: 'user', content: source.input, createdAt: 0 });
  } else if (Array.isArray(source.input)) {
    for (const [index, raw] of source.input.entries()) {
      if (!raw || typeof raw !== 'object') {
        throw new GatewayRequestError(422, 'invalid_input', `input[${index}] 格式不正确`);
      }
      const item = raw as Record<string, any>;
      if (item.type === 'function_call') {
        messages.push({
          id: `fc_${index}`, conversationId: '', role: 'assistant', createdAt: 0,
          content: '',
          toolCalls: [{
            id: String(item.call_id || item.id || `call_${index}`),
            messageId: '',
            toolName: String(item.name || ''),
            arguments: typeof item.arguments === 'string' ? safeJson(item.arguments) : item.arguments || {},
          }],
        });
        continue;
      }
      if (item.type === 'function_call_output') {
        messages.push({
          id: `fco_${index}`, conversationId: '', role: 'tool',
          content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''),
          toolCallId: String(item.call_id || ''), createdAt: 0,
        });
        continue;
      }
      const parsed = textBlocks(item.content);
      messages.push({
        id: `input_${index}`, conversationId: '', role: roleOf(item.role),
        content: parsed.text, toolCalls: parsed.toolCalls, createdAt: 0,
      });
    }
  } else {
    throw new GatewayRequestError(422, 'invalid_input', 'input 必须是字符串或数组');
  }
  if (!messages.some((message) => message.role !== 'system')) {
    throw new GatewayRequestError(422, 'invalid_input', 'input 至少需要一条用户或工具消息');
  }
  return {
    messages,
    tools: normalizeResponsesTools(source.tools),
    temperature: Number.isFinite(Number(source.temperature)) ? Number(source.temperature) : undefined,
    maxTokens: clampTokens(source.max_output_tokens),
    topP: Number.isFinite(Number(source.top_p)) ? Number(source.top_p) : undefined,
    toolChoice: normalizeToolChoice(source.tool_choice),
  };
}

export function normalizeAnthropicRequest(body: unknown): NormalizedGatewayChat {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new GatewayRequestError(422, 'invalid_request', '请求体必须是 JSON 对象');
  }
  const source = body as Record<string, any>;
  if (!Array.isArray(source.messages) || source.messages.length === 0) {
    throw new GatewayRequestError(422, 'invalid_messages', 'messages 必须是非空数组');
  }
  const messages: Message[] = [];
  if (source.system != null) {
    messages.push({
      id: 'system', conversationId: '', role: 'system',
      content: textBlocks(source.system).text, createdAt: 0,
    });
  }
  for (const [index, raw] of source.messages.entries()) {
    if (!raw || typeof raw !== 'object') {
      throw new GatewayRequestError(422, 'invalid_messages', `messages[${index}] 格式不正确`);
    }
    const item = raw as Record<string, any>;
    const parsed = textBlocks(item.content, true);
    messages.push({
      id: `message_${index}`,
      conversationId: '',
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: parsed.text,
      toolCalls: parsed.toolCalls,
      createdAt: 0,
    });
    for (const toolMessage of parsed.toolMessages || []) {
      messages.push({ ...toolMessage, id: `${toolMessage.id}_${index}` });
    }
  }
  return {
    messages,
    tools: normalizeAnthropicTools(source.tools),
    temperature: Number.isFinite(Number(source.temperature)) ? Number(source.temperature) : undefined,
    maxTokens: clampTokens(source.max_tokens),
    topP: Number.isFinite(Number(source.top_p)) ? Number(source.top_p) : undefined,
    toolChoice: normalizeToolChoice(source.tool_choice),
  };
}

function clampTokens(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(65_536, Math.max(1, Math.floor(n))) : 2048;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

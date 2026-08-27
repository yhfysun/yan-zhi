import type { ChatHistoryItem, ChatModelFunctions } from 'node-llama-cpp';

export interface OpenAiTool {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LocalChatMessage {
  role?: string;
  content?: string | null | Array<unknown>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

interface ChatHistoryModelItem {
  type: 'model';
  response: Array<
    | string
    | {
        type: 'functionCall';
        name: string;
        params: unknown;
        result: unknown;
        startsNewChunk?: boolean;
      }
  >;
}

function resolveOpenAiText(content: LocalChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return String(item.text);
        return '';
      })
      .join('');
  }
  return '';
}

function parseSerializedJson(value: string): unknown {
  const text = value.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function openAiToolsToNodeLlamaFunctions(tools: OpenAiTool[] = []): ChatModelFunctions {
  const functions: Record<string, { description?: string; params?: Record<string, unknown> }> = {};

  for (const tool of tools) {
    const name = tool.function?.name;
    if (tool.type !== 'function' || !name || functions[name]) continue;

    functions[name] = {
      ...(tool.function?.description ? { description: tool.function.description } : {}),
      ...(tool.function?.parameters ? { params: tool.function.parameters } : {}),
    };
  }

  return functions as ChatModelFunctions;
}

/**
 * 把 OpenAI 风格消息转换为 node-llama-cpp 的完整历史。
 *
 * 与 engine 之前只支持纯文本的实现不同，这里把 assistant.tool_calls
 * 和紧随其后的 role=tool 结果合成为 ChatModelFunctionCall，供 LlamaChat
 * 做原生 function calling。
 */
export function localMessagesToChatHistory(messages: LocalChatMessage[]): {
  history: ChatHistoryItem[];
  systemPrompt?: string;
} {
  const history: ChatHistoryItem[] = [];
  const toolResults = new Map<string, string>();
  let systemPrompt: string | undefined;

  for (const message of messages) {
    if (message.role === 'tool') {
      const id = message.tool_call_id || message.name;
      if (id) toolResults.set(id, resolveOpenAiText(message.content));
    }
  }

  for (const message of messages) {
    const role = message.role || '';
    const content = resolveOpenAiText(message.content);

    if (role === 'system') {
      if (content) {
        systemPrompt = systemPrompt ? `${systemPrompt}\n${content}` : content;
        history.push({ type: 'system', text: content });
      }
      continue;
    }

    if (role === 'user') {
      history.push({ type: 'user', text: content || '' });
      continue;
    }

    if (role === 'assistant') {
      const last = history.at(-1);
      const modelItem: ChatHistoryModelItem =
        last?.type === 'model'
          ? (last as ChatHistoryModelItem)
          : { type: 'model', response: [] };

      if (modelItem !== last) history.push(modelItem as ChatHistoryItem);
      if (content) modelItem.response.push(content);

      const toolCalls = message.tool_calls || [];
      for (let index = 0; index < toolCalls.length; index += 1) {
        const toolCall = toolCalls[index];
        const result = toolResults.get(toolCall.id);
        if (result === undefined) continue;

        modelItem.response.push({
          type: 'functionCall',
          name: toolCall.function.name,
          params: parseSerializedJson(toolCall.function.arguments),
          result: parseSerializedJson(result),
          startsNewChunk: index === 0 ? true : undefined,
        });
      }
    }
  }

  return { history, systemPrompt };
}

// Anthropic Messages API 请求体构造（服务端手写直连调用复用）。
// 与 packages/core/src/llm/anthropic.ts 的语义保持一致：
//  - system 角色合并为顶层 system 字段（Anthropic 不允许在 messages 内放 system）
//  - 其余角色的 content（字符串）必须包装为 [{ type: 'text', text }] 内容块数组
//    （直接传 { role, content: string } 会被 Anthropic 拒绝，返回 400）

export interface SimpleMessage {
  role: string;
  content: string;
}

export interface AnthropicBody {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
  stream: false;
}

/** 将简单 {role, content} 消息列表转换为合法的 Anthropic 请求体。
 *  - system 角色：合并为顶层 system 字段
 *  - tool 角色：Anthropic 无此角色，兜底成 user 文本块（这些调用场景不传 tool 消息）
 *  - 其它角色：content 字符串包成 text 内容块 */
export function buildAnthropicBody(
  messages: SimpleMessage[],
  modelId: string,
  maxTokens: number,
): AnthropicBody {
  let system = '';
  const out: AnthropicBody['messages'] = [];
  for (const m of messages) {
    const text = m.content || '';
    if (m.role === 'system') {
      system = system ? `${system}\n\n${text}` : text;
      continue;
    }
    if (m.role === 'tool') {
      out.push({ role: 'user', content: [{ type: 'text', text: `[工具结果] ${text}` }] });
      continue;
    }
    out.push({ role: m.role, content: [{ type: 'text', text }] });
  }
  const body: AnthropicBody = {
    model: modelId,
    max_tokens: maxTokens,
    messages: out,
    stream: false,
  };
  if (system) body.system = system;
  return body;
}

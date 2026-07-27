// LLM 客户端 - 遵循 OpenAI Chat Completions 协议
import type { Platform, Model, Message, ChatChunk, ChatRequest } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../platform/types';
import { parseSSE } from './stream';

export class LlmClient {
  constructor(
    private platform: Platform,
    private model: Model,
  ) {}

  /** 将内部 Message 转成 OpenAI API 约定的 snake_case 格式 */
  private toApiMessage(m: Message): Record<string, unknown> {
    const out: Record<string, unknown> = { role: m.role };
    if (m.content !== undefined) out.content = m.content;
    if (m.toolCalls?.length) {
      out.tool_calls = m.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: (tc as any).toolName || (tc as any).function?.name,
          arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}),
        },
      }));
    }
    if (m.toolCallId) out.tool_call_id = m.toolCallId;
    return out;
  }

  private get baseUrl() { return this.platform.apiUrl.replace(/\/$/, ''); }

  private async buildHeaders(): Promise<HeadersInit> {
    const adapter = getPlatformAdapter();
    const apiKey = await adapter.keyring.get(`platform:${this.platform.id}:apikey`);
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey || ''}`,
      ...this.platform.headers,
    };
  }

  async *chatStream(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; signal?: AbortSignal },
  ): AsyncIterable<ChatChunk> {
    const headers = await this.buildHeaders();
    const apiMessages = messages.map(m => this.toApiMessage(m));
    const body: any = {
      model: this.model.modelId,
      messages: apiMessages,
      tools: options?.tools,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      stream: true,
    };
    if (options?.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }
    const url = `${this.baseUrl}/v1/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options?.signal,
      });
    } catch (e: any) {
      // 浏览器 CORS 拦截或网络不通时 fetch 直接抛 TypeError
      throw new Error(
        `请求失败（可能是 CORS 跨域拦截或网络不通）: ${e?.message || e}。URL: ${url}`,
      );
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      let hint = '';
      if (res.status === 401) hint = '（API Key 无效或未配置）';
      else if (res.status === 404) hint = `（URL 不对，请检查平台 API URL。当前请求: ${url}）`;
      else if (res.status === 429) hint = '（请求频率超限）';
      throw new Error(`LLM 请求失败: ${res.status} ${res.statusText}${hint}${text ? ` ${text.slice(0, 200)}` : ''}`);
    }
    yield* parseSSE(res.body);
  }

  async chat(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number },
  ): Promise<ChatChunk> {
    const headers = await this.buildHeaders();
    const body: ChatRequest = {
      model: this.model.modelId,
      messages: messages.map(m => this.toApiMessage(m)),
      tools: options?.tools,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      stream: false,
    };
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LLM 请求失败: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return {
      delta: {
        content: data.choices?.[0]?.message?.content,
        reasoningContent: data.choices?.[0]?.message?.reasoning_content,
        toolCalls: data.choices?.[0]?.message?.tool_calls,
      },
      finishReason: data.choices?.[0]?.finish_reason,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  async listModels(): Promise<{ id: string; type?: string }[]> {
    const headers = await this.buildHeaders();
    const res = await fetch(`${this.baseUrl}/v1/models`, { headers });
    if (!res.ok) throw new Error(`拉取模型失败: ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((m: { id: string; type?: string }) => ({ id: m.id, type: m.type }));
  }

  async ping(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  /** 按 PRD 规范发 max_tokens=5 的小请求验证模型可用性 */
  async chatTest(): Promise<{ ok: boolean; durationMs: number; finishReason?: string; content?: string; msg?: string }> {
    const start = Date.now();
    try {
      const headers = await this.buildHeaders();
      const body: ChatRequest = {
        model: this.model.modelId,
        messages: [
          { id: 't', conversationId: '', role: 'user', content: 'ping', createdAt: 0 },
        ],
        maxTokens: 5,
        stream: false,
      };
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const durationMs = Date.now() - start;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, durationMs, msg: `HTTP ${res.status} ${res.statusText} ${text.slice(0, 120)}` };
      }
      const data = await res.json();
      return {
        ok: true,
        durationMs,
        finishReason: data.choices?.[0]?.finish_reason,
        content: data.choices?.[0]?.message?.content,
      };
    } catch (e: any) {
      return { ok: false, durationMs: Date.now() - start, msg: e?.message || '请求异常' };
    }
  }

  async embeddings(input: string[]): Promise<number[][]> {
    const headers = await this.buildHeaders();
    const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.model.modelId, input }),
    });
    if (!res.ok) throw new Error(`Embedding 请求失败: ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((d: { embedding: number[] }) => d.embedding);
  }
}

// LLM 客户端 - 同时支持 OpenAI Chat Completions 与 Anthropic Messages 协议
// 浏览器端通过 PlatformAdapter.llmProxyBase 走后端代理（/api/llm/*），避免 CORS 且不暴露 API Key；
// server 端（无 llmProxyBase）直连上游。
import type { Platform, Model, Message, ChatChunk, ChatRequest } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../platform/types';
import { parseSSE } from './stream';
import {
  toAnthropicMessages,
  toAnthropicTools,
  parseAnthropicSSE,
  anthropicResponseToChunk,
} from './anthropic';

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
  private get isAnthropic() { return this.platform.protocol === 'anthropic'; }
  /** Anthropic 官方协议不提供 embeddings 接口，上层 UI 应据此隐藏相关入口。 */
  get supportsEmbeddings() { return !this.isAnthropic; }

  /** 后端 LLM 代理基址（浏览器端注入）；server 端无此字段则直连上游 */
  private get proxyBase(): string | undefined {
    try { return getPlatformAdapter().llmProxyBase; } catch { return undefined; }
  }

  private async buildHeaders(): Promise<HeadersInit> {
    const adapter = getPlatformAdapter();
    const apiKey = await adapter.keyring.get(`platform:${this.platform.id}:apikey`);
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey || ''}`,
      ...this.platform.headers,
    };
  }

  /** Anthropic 鉴权头：x-api-key + anthropic-version（不使用 Bearer） */
  private async buildAnthropicHeaders(): Promise<HeadersInit> {
    const adapter = getPlatformAdapter();
    const apiKey = await adapter.keyring.get(`platform:${this.platform.id}:apikey`);
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey || '',
      'anthropic-version': '2023-06-01',
      ...this.platform.headers,
    };
  }

  /** 走后端代理时的鉴权头：带本地 JWT token（后端 authMiddleware 放行本地模式） */
  private proxyAuthHeaders(): HeadersInit {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (token) h['Authorization'] = `Bearer ${token}`;
    } catch {}
    return h;
  }

  /** 统一 POST：有代理走后端 /api/llm/<path>（body 包 platformId + payload），无则直连上游。
   *  upstreamPath 形如 'v1/chat/completions' / 'v1/messages' / 'v1/embeddings' */
  private async upstreamFetch(
    upstreamPath: string,
    body: any,
    options?: { signal?: AbortSignal; anthropic?: boolean },
  ): Promise<Response> {
    const proxy = this.proxyBase;
    if (proxy) {
      const proxyPath = upstreamPath.replace(/^v1\//, '');
      return fetch(`${proxy}/${proxyPath}`, {
        method: 'POST',
        headers: this.proxyAuthHeaders(),
        body: JSON.stringify({ platformId: this.platform.id, payload: body }),
        signal: options?.signal,
      });
    }
    const headers = options?.anthropic ? await this.buildAnthropicHeaders() : await this.buildHeaders();
    return fetch(`${this.baseUrl}/${upstreamPath}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal,
    });
  }

  async *chatStream(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; signal?: AbortSignal },
  ): AsyncIterable<ChatChunk> {
    if (this.isAnthropic) {
      yield* this.anthropicStream(messages, options);
      return;
    }
    const apiMessages = messages.map(m => this.toApiMessage(m));
    const body: any = {
      model: this.model.modelId,
      messages: apiMessages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      stream: true,
    };
    if (options?.tools?.length) body.tools = options.tools;
    if (options?.responseFormat) body.response_format = options.responseFormat;
    if (options?.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }
    const urlDesc = this.proxyBase ? `${this.proxyBase}/chat/completions` : `${this.baseUrl}/v1/chat/completions`;
    let res: Response;
    try {
      res = await this.upstreamFetch('v1/chat/completions', body, { signal: options?.signal });
    } catch (e: any) {
      const sig = options?.signal;
      if (sig?.aborted || e?.name === 'AbortError') {
        const reason = (sig?.reason as any)?.message || e?.message || 'Aborted';
        throw new Error(`请求被中止（${reason}）。URL: ${urlDesc}`);
      }
      throw new Error(`请求失败（代理或网络不通）: ${e?.message || e}。URL: ${urlDesc}`);
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      // Ollama 小模型不支持 tools：去掉 tools + 清理消息中的 tool_calls/tool 角色后重试
      if (res.status === 400 && /does not support tools/i.test(text) && body.tools) {
        delete body.tools;
        body.messages = (body.messages as any[]).map((m: any) => {
          if (m.role === 'tool') return { role: 'user', content: `[工具结果] ${m.content || ''}` };
          if (m.tool_calls) { const { tool_calls, tool_call_id, ...rest } = m; return rest; }
          return m;
        }).filter((m: any) => m.content || m.role !== 'assistant');
        const retryRes = await this.upstreamFetch('v1/chat/completions', body, { signal: options?.signal });
        if (retryRes.ok && retryRes.body) {
          yield* parseSSE(retryRes.body);
          return;
        }
      }
      let hint = '';
      if (res.status === 401) hint = '（API Key 无效或未配置）';
      else if (res.status === 404) hint = `（URL 不对，请检查平台 API URL。当前请求: ${urlDesc}）`;
      else if (res.status === 429) hint = '（请求频率超限）';
      throw new Error(`LLM 请求失败: ${res.status} ${res.statusText}${hint}${text ? ` ${text.slice(0, 200)}` : ''}`);
    }
    yield* parseSSE(res.body);
  }

  private async *anthropicStream(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; signal?: AbortSignal },
  ): AsyncIterable<ChatChunk> {
    const { system, messages: aMessages } = toAnthropicMessages(messages);
    const body: any = {
      model: this.model.modelId,
      max_tokens: options?.maxTokens ?? 4096,
      messages: aMessages,
      stream: true,
    };
    if (system) body.system = system;
    const tools = toAnthropicTools(options?.tools as any[]);
    if (tools.length) body.tools = tools;
    if (options?.temperature != null) body.temperature = options.temperature;
    if (options?.topP != null) body.top_p = options.topP;
    const urlDesc = this.proxyBase ? `${this.proxyBase}/messages` : `${this.baseUrl}/v1/messages`;
    let res: Response;
    try {
      res = await this.upstreamFetch('v1/messages', body, { signal: options?.signal, anthropic: true });
    } catch (e: any) {
      const sig = options?.signal;
      if (sig?.aborted || e?.name === 'AbortError') {
        const reason = (sig?.reason as any)?.message || e?.message || 'Aborted';
        throw new Error(`请求被中止（${reason}）。URL: ${urlDesc}`);
      }
      throw new Error(`请求失败（代理或网络不通）: ${e?.message || e}。URL: ${urlDesc}`);
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      let hint = '';
      if (res.status === 401) hint = '（API Key 无效或未配置）';
      else if (res.status === 404) hint = `（URL 不对，请检查平台 API URL。当前请求: ${urlDesc}）`;
      else if (res.status === 429) hint = '（请求频率超限）';
      throw new Error(`LLM 请求失败: ${res.status} ${res.statusText}${hint}${text ? ` ${text.slice(0, 200)}` : ''}`);
    }
    yield* parseAnthropicSSE(res.body);
  }

  async chat(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; signal?: AbortSignal },
  ): Promise<ChatChunk> {
    if (this.isAnthropic) {
      return this.anthropicChat(messages, options);
    }
    // toApiMessage 返回 OpenAI 约定的 snake_case Record，与内部 Message 类型不同构；
    // 与 chatStream 一致用 any 规避 ChatRequest.messages: Message[] 的类型摩擦。
    const body: any = {
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
    if (options?.responseFormat) body.response_format = options.responseFormat;
    const res = await this.upstreamFetch('v1/chat/completions', body, { signal: options?.signal });
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

  private async anthropicChat(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; signal?: AbortSignal },
  ): Promise<ChatChunk> {
    const { system, messages: aMessages } = toAnthropicMessages(messages);
    const body: any = {
      model: this.model.modelId,
      max_tokens: options?.maxTokens ?? 4096,
      messages: aMessages,
      stream: false,
    };
    if (system) body.system = system;
    const tools = toAnthropicTools(options?.tools as any[]);
    if (tools.length) body.tools = tools;
    if (options?.temperature != null) body.temperature = options.temperature;
    if (options?.topP != null) body.top_p = options.topP;
    const res = await this.upstreamFetch('v1/messages', body, { signal: options?.signal, anthropic: true });
    if (!res.ok) throw new Error(`LLM 请求失败: ${res.status} ${res.statusText}`);
    const data = await res.json();
    return anthropicResponseToChunk(data);
  }

  async listModels(): Promise<{ id: string; type?: string }[]> {
    if (this.isAnthropic) {
      // Anthropic 官方无公开模型列表接口；兼容网关（如 OpenRouter）可能支持
      try {
        const res = await this.fetchModels();
        if (!res.ok) return [];
        const data = await res.json().catch(() => null);
        return (data?.data || []).map((m: { id: string; type?: string }) => ({ id: m.id, type: m.type }));
      } catch {
        return [];
      }
    }
    const res = await this.fetchModels();
    if (!res.ok) throw new Error(`拉取模型失败: ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((m: { id: string; type?: string }) => ({ id: m.id, type: m.type }));
  }

  /** GET /v1/models：有代理走后端 /api/llm/models?platformId=，否则直连 */
  private async fetchModels(): Promise<Response> {
    const proxy = this.proxyBase;
    if (proxy) {
      return fetch(`${proxy}/models?platformId=${encodeURIComponent(this.platform.id)}`, {
        headers: this.proxyAuthHeaders(),
      });
    }
    const headers = this.isAnthropic ? await this.buildAnthropicHeaders() : await this.buildHeaders();
    return fetch(`${this.baseUrl}/v1/models`, { headers });
  }

  async ping(): Promise<boolean> {
    if (this.isAnthropic) {
      // 无模型时仅做连通性探测（不校验鉴权）；有模型时用小请求验证可用性
      try {
        if (this.model?.modelId) return (await this.chatTest()).ok;
        const res = await this.fetchModels();
        return res.status < 500;
      } catch {
        return false;
      }
    }
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  /** 按 PRD 规范发 max_tokens=5 的小请求验证模型可用性 */
  async chatTest(): Promise<{ ok: boolean; durationMs: number; finishReason?: string; content?: string; msg?: string }> {
    if (this.isAnthropic) return this.anthropicChatTest();
    const start = Date.now();
    try {
      const body: ChatRequest = {
        model: this.model.modelId,
        messages: [
          { id: 't', conversationId: '', role: 'user', content: 'ping', createdAt: 0 },
        ],
        maxTokens: 5,
        stream: false,
      };
      const res = await this.upstreamFetch('v1/chat/completions', body);
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

  private async anthropicChatTest(): Promise<{ ok: boolean; durationMs: number; finishReason?: string; content?: string; msg?: string }> {
    const start = Date.now();
    try {
      const body = {
        model: this.model.modelId,
        max_tokens: 5,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
        stream: false,
      };
      const res = await this.upstreamFetch('v1/messages', body, { anthropic: true });
      const durationMs = Date.now() - start;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, durationMs, msg: `HTTP ${res.status} ${res.statusText} ${text.slice(0, 120)}` };
      }
      const data = await res.json();
      const chunk = anthropicResponseToChunk(data);
      return {
        ok: true,
        durationMs,
        finishReason: chunk.finishReason,
        content: chunk.delta?.content,
      };
    } catch (e: any) {
      return { ok: false, durationMs: Date.now() - start, msg: e?.message || '请求异常' };
    }
  }

  async embeddings(input: string[]): Promise<number[][]> {
    if (this.isAnthropic) {
      throw new Error('Anthropic 协议不支持 embeddings 接口（请使用支持 embeddings 的平台）');
    }
    const res = await this.upstreamFetch('v1/embeddings', { model: this.model.modelId, input });
    if (!res.ok) throw new Error(`Embedding 请求失败: ${res.status}`);
    const data = await res.json();
    return (data.data || []).map((d: { embedding: number[] }) => d.embedding);
  }

  /**
   * 多模态图片分析：发一次性 vision 请求（非流式），返回模型文本回复。
   * 不走 Message 类型（content 仍为 string），仅在此方法内构造多模态 body。
   * - OpenAI 协议：content 数组含 image_url（data URL）
   * - Anthropic 协议：content 数组含 image block（base64 source）
   */
  async visionAnalyze(
    imageBase64: string,
    mime: string,
    prompt: string,
    options?: { maxTokens?: number; temperature?: number; signal?: AbortSignal },
  ): Promise<string> {
    if (this.isAnthropic) {
      const body = {
        model: this.model.modelId,
        max_tokens: options?.maxTokens ?? 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
          ],
        }],
        stream: false,
      };
      const res = await this.upstreamFetch('v1/messages', body, { signal: options?.signal, anthropic: true });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`vision 请求失败: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const parts = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '');
      return parts.join('');
    }
    const body = {
      model: this.model.modelId,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } },
        ],
      }],
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature,
      stream: false,
    };
    const res = await this.upstreamFetch('v1/chat/completions', body, { signal: options?.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`vision 请求失败: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

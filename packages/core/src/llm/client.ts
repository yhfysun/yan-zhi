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

/** 能力测试种类：chat=基础问答、vision=视觉识图、function_call=工具调用、embedding=向量、image=图片生成、video=视频生成 */
export type CapabilityTestKind = 'chat' | 'vision' | 'function_call' | 'embedding' | 'image' | 'video';

export interface CapabilityTestResult {
  kind: CapabilityTestKind;
  label: string;
  ok: boolean;
  durationMs: number;
  /** 通过后应自动勾选的能力：chat → reasoning（能问答即具备推理）；image → image；video → video */
  capability?: string;
  msg: string;
  /** 模型实际回答摘要，便于人工判断误判 */
  detail?: string;
}

export const CAPABILITY_TEST_LABELS: Record<CapabilityTestKind, string> = {
  chat: '基础问答',
  vision: '视觉识图',
  function_call: '工具调用',
  embedding: '向量嵌入',
  image: '图片生成',
  video: '视频生成',
};

/** 视觉能力测试用图：16×16 纯红 PNG（79B 内嵌，不依赖外部资源） */
const VISION_TEST_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4o6ZGEmIY1TCqYfhqAAATqigQ9JeO5gAAAABJRU5ErkJggg==';

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

  /**
   * 发送前清洗 tool 消息，杜绝上游 400 "tool_calls must be followed by tool messages"。
   * - sendTools=false（模型不支持 function calling）：剥除 assistant 的 tool_calls、把 tool 角色
   *   降级为 user（携带 [工具结果] 前缀），否则上游对「无 tools 数组却带 tool 角色/tool_calls」直接 400。
   * - sendTools=true：保留 assistant.tool_calls，但剥除没有对应 tool 消息的孤儿 tool_call，并丢弃
   *   孤儿 tool 消息，保证每个 tool_calls 都紧随其回应，配对完整。
   * 两种情况下都丢弃剥除 tool_calls 后变为空内容且无 tool_calls 的 assistant 消息。
   */
  private sanitizeToolMessages(messages: any[], sendTools: boolean): any[] {
    const stripToolMeta = (m: any) => {
      const { tool_calls, tool_call_id, ...rest } = m;
      return rest;
    };
    if (!sendTools) {
      return messages
        .map((m) => {
          if (m.role === 'tool') return { role: 'user', content: `[工具结果] ${m.content || ''}` };
          return stripToolMeta(m);
        })
        .filter((m) => m.content || m.role !== 'assistant');
    }
    const toolCallIds = new Set(
      messages
        .filter((m) => m.role === 'tool' && m.tool_call_id)
        .map((m) => m.tool_call_id as string),
    );
    const out: any[] = [];
    for (const m of messages) {
      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        const kept = m.tool_calls.filter((tc: any) => tc?.id && toolCallIds.has(tc.id));
        if (kept.length === 0) {
          out.push(stripToolMeta(m));
        } else {
          out.push({ ...m, tool_calls: kept });
        }
      } else if (m.role === 'tool') {
        if (toolCallIds.has(m.tool_call_id)) out.push(m);
      } else {
        out.push(m);
      }
    }
    return out.filter(
      (m) => m.role !== 'assistant' || (m.content && String(m.content).trim()) || (Array.isArray(m.tool_calls) && m.tool_calls.length),
    );
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
    const apiMessages = this.sanitizeToolMessages(messages.map(m => this.toApiMessage(m)), !!options?.tools?.length);
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
      // 工具相关 400 兜底：模型不支持 tools / 历史含孤儿 tool_calls（未配对）。
      // 去掉 tools 并把 tool 角色降级为 user 后重试，避免把 400 直接抛给用户。
      if (res.status === 400 && /does not support tools|tool_calls must be followed|insufficient tool messages following tool_calls/i.test(text) && body.tools) {
        delete body.tools;
        body.messages = this.sanitizeToolMessages(body.messages as any[], false);
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
      messages: this.sanitizeToolMessages(messages.map(m => this.toApiMessage(m)), !!options?.tools?.length),
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

  /**
   * 单项能力测试。返回结构化结果，命中即代表该模型具备对应能力
   * （chat 通过 → reasoning：推理本质上就是多步问答，能正常问答即默认具备）。
   */
  async capabilityTest(kind: CapabilityTestKind, retried = false): Promise<CapabilityTestResult> {
    const start = Date.now();
    const label = CAPABILITY_TEST_LABELS[kind] || kind;
    const fail = (msg: string, detail?: string): CapabilityTestResult => ({
      kind, label, ok: false, durationMs: Date.now() - start, msg, detail,
    });
    try {
      if (kind === 'chat') {
        // max_tokens 给足：推理型模型（如 agnes-2.5-flash）会先吐 reasoning_content，
        // 给太小会只剩思考、正文为空 → 误判成不可用
        const r = await this.chat(
          [{ id: 't', conversationId: '', role: 'user', content: '请只回答一个数字：1+1 等于几？', createdAt: 0 }],
          { maxTokens: 128 },
        );
        const text = String(r.delta?.content || '').trim();
        const think = String(r.delta?.reasoningContent || '').trim();
        if (!text && !think) return fail('未返回任何内容');
        return {
          kind, label, ok: true, durationMs: Date.now() - start, capability: 'reasoning',
          msg: text ? '问答正常' : '问答正常（仅返回思考过程，未给出最终答案）',
          detail: (text || think).slice(0, 120),
        };
      }

      if (kind === 'vision') {
        const imagePart = this.isAnthropic
          ? { type: 'image', source: { type: 'base64', media_type: 'image/png', data: VISION_TEST_PNG_B64 } }
          : { type: 'image_url', image_url: { url: `data:image/png;base64,${VISION_TEST_PNG_B64}` } };
        const r = await this.chat(
          [{ id: 't', conversationId: '', role: 'user', content: [
            { type: 'text', text: '这张图片的主色调是什么？只回答一个颜色词，例如：红色。' },
            imagePart,
          ] as any, createdAt: 0 }],
          { maxTokens: 128 },
        );
        const text = String(r.delta?.content || r.delta?.reasoningContent || '').trim();
        if (!text) return fail('未返回任何内容');
        // 模型/网关不支持图片时通常不会报错，而是回一段"我看不到图片"——按拒答判失败
        const refused = /无法(查看|识别|看到|处理)|看不到|不能(查看|识别|看到)|不支持(图|视)|不是图片|没有图|i can'?t see|i cannot see|unable to (see|view)|no image|text only/i.test(text);
        if (refused) return fail('模型拒绝/无法读取图片', text.slice(0, 120));
        return {
          kind, label, ok: true, durationMs: Date.now() - start, capability: 'vision',
          msg: '识图正常', detail: text.slice(0, 120),
        };
      }

      if (kind === 'function_call') {
        const tools = [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: '查询指定城市今天的天气',
            parameters: { type: 'object', properties: { city: { type: 'string', description: '城市名' } }, required: ['city'] },
          },
        }];
        const r = await this.chat(
          [{ id: 't', conversationId: '', role: 'user', content: '北京今天天气怎么样？请调用工具查询。', createdAt: 0 }],
          { tools, maxTokens: 160 },
        );
        const calls = r.delta?.toolCalls || [];
        const name = calls[0] ? (calls[0] as any).function?.name || (calls[0] as any).toolName : '';
        if (!calls.length) {
          // 有些网关把工具调用以纯文本吐出，给个温和提示但仍判失败（能力不可靠）
          return fail('未返回 tool_calls', String(r.delta?.content || '').slice(0, 120));
        }
        return {
          kind, label, ok: true, durationMs: Date.now() - start, capability: 'function_call',
          msg: name ? `已调用 ${name}` : '工具调用正常',
        };
      }

      if (kind === 'embedding') {
        const res = await this.upstreamFetch('v1/embeddings', { model: this.model.modelId, input: ['ping'] });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return fail(`HTTP ${res.status} ${res.statusText}`, text.slice(0, 120));
        }
        const data = await res.json();
        const vec = data?.data?.[0]?.embedding;
        if (!Array.isArray(vec) || !vec.length) return fail('未返回向量');
        return { kind, label, ok: true, durationMs: Date.now() - start, msg: `向量维度 ${vec.length}` };
      }

      // video：视频生成（提交异步任务即算受理通过，不等待出片——完整出片要 1-5 分钟，
      // 每次测试会消耗一次生成额度）。mode:'text' 是 agnes 专有约定，其他平台不带。
      if (kind === 'video') {
        const isAgnes = /agnes-ai\.com/i.test(this.baseUrl);
        const res = await this.upstreamFetch('v1/videos', {
          model: this.model.modelId,
          prompt: 'a red balloon floating gently in the sky',
          seconds: '5',
          size: '720P',
          ...(isAgnes ? { mode: 'text' } : {}),
        });
        const text = await res.text().catch(() => '');
        if (!res.ok) return fail(`HTTP ${res.status} ${res.statusText}`, text.slice(0, 120));
        let taskId = '';
        try {
          const j = JSON.parse(text);
          taskId = String(j?.task_id || j?.taskId || j?.id || '');
        } catch { /* ignore */ }
        if (!taskId) return fail('任务提交未返回 task_id', text.slice(0, 120));
        return {
          kind, label, ok: true, durationMs: Date.now() - start, capability: 'video',
          msg: '视频任务已受理（异步出片通常 1-5 分钟，本次测试提交了 5 秒 720P 任务）',
          detail: taskId,
        };
      }

      // image：图片生成（最小尺寸，成本可控）
      const res = await this.upstreamFetch('v1/images/generations', {
        model: this.model.modelId,
        prompt: 'a small red dot on a white background',
        n: 1,
        size: '256x256',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return fail(`HTTP ${res.status} ${res.statusText}`, text.slice(0, 120));
      }
      const data = await res.json();
      const first = data?.data?.[0];
      if (!first?.url && !first?.b64_json) return fail('未返回图片');
      return { kind, label, ok: true, durationMs: Date.now() - start, capability: 'image', msg: '生图正常' };
    } catch (e: any) {
      const msg = e?.message || '请求异常';
      // 网络抖动（首连超时/连接被重置）与限流（429）都很常见，稍等后自动重试一次，避免误判成"模型不支持"
      if (!retried && /fetch failed|network|ETIMEDOUT|ECONNRESET|socket hang up|terminated|\b429\b|too many requests/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 1500));
        return this.capabilityTest(kind, true);
      }
      return fail(msg);
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

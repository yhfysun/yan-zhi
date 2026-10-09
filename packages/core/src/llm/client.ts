// LLM 客户端 - 同时支持 OpenAI Chat Completions 与 Anthropic Messages 协议
// 浏览器端通过 PlatformAdapter.llmProxyBase 走后端代理（/api/llm 下的接口），避免 CORS 且不暴露 API Key；
// server 端（无 llmProxyBase）直连上游。
import type { Platform, Model, Message, ChatChunk, ChatRequest } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../platform/types';
import { parseSSE } from './stream';
// 发送前顺序规整（2026-10-09）：把夹在 tool_calls 与其配对 tool 消息之间的「运行中追加消息」后移。
// 见 message-order.ts 顶部 —— 「立即发送」注入点天然落在组中间，不规整则每次重放撞上游 400
// （`tool_calls must be followed by tool messages`）。
import { reorderToolGroups } from './message-order';
import {
  toAnthropicMessages,
  toAnthropicTools,
  parseAnthropicSSE,
  anthropicResponseToChunk,
} from './anthropic';

/**
 * 工具调用强制策略（2026-10-07，P0-1）。
 * - 'auto'：模型自主决定（默认，与不传一致）；
 * - 'required'：必须调用至少一个工具（OpenAI: tool_choice="required"；Anthropic: {type:'any'}）；
 * - 'none'：禁止工具调用；
 * - 指定工具：强制调用某个工具（结构化输出 coercion 的标准做法）。
 * 端点不支持时由上层降级（重试 400 时剥离 tool_choice 重发）。
 */
export type ToolChoiceOption = 'auto' | 'required' | 'none' | { type: 'function'; name: string };

/** ToolChoiceOption → Anthropic tool_choice 值 */
export function toAnthropicToolChoice(tc: ToolChoiceOption): unknown {
  if (tc === 'auto') return { type: 'auto' };
  if (tc === 'required') return { type: 'any' };
  if (tc === 'none') return { type: 'none' };
  return { type: 'tool', name: tc.name };
}

/** ToolChoiceOption → OpenAI tool_choice 值（原样，协议同形） */
export function toOpenAIToolChoice(tc: ToolChoiceOption): unknown {
  return tc;
}

/** 能力测试种类：chat=基础问答、vision=视觉识图、function_call=工具调用、embedding=向量、image=图片生成、video=视频生成 */
export type CapabilityTestKind = 'chat' | 'vision' | 'function_call' | 'embedding' | 'image' | 'video';

/**
 * 协议鉴权头的**唯一实现**（横切收敛 P2，2026-10-04）。
 * 此前 client.buildHeaders / buildAnthropicHeaders / llm-proxy.upstreamHeaders /
 * memory-dreaming.callModel / scheduled-tasks.callModel 各写一份
 * （`anthropic-version: '2023-06-01'` 裸写 4 处），改协议头必漏。
 * anthropic → x-api-key + anthropic-version；其余 → Bearer（key 为空则不带鉴权头）。
 */
export function buildProtocolHeaders(protocol: string, apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (protocol === 'anthropic') {
    h['x-api-key'] = apiKey || '';
    h['anthropic-version'] = '2023-06-01';
  } else if (apiKey) {
    h['Authorization'] = `Bearer ${apiKey}`;
  }
  return h;
}

/**
 * 上游非 2xx 响应 → 可行动的错误信息（client 内 4 份复制的 hint 块收口）。
 * maxChars：流式路径截断 200，非流式 500。
 */
export function upstreamErrorMessage(
  status: number,
  statusText: string,
  urlDesc: string,
  text: string,
  maxChars = 500,
): string {
  let hint = '';
  if (status === 401) hint = '（API Key 无效或未配置）';
  else if (status === 404) hint = `（URL 不对，请检查平台 API URL。当前请求: ${urlDesc}）`;
  else if (status === 429) hint = '（请求频率超限）';
  return `LLM 请求失败: ${status} ${statusText}${hint}${text ? ` ${text.slice(0, maxChars)}` : ''}`;
}

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

/**
 * ★ P0-2（2026-10-07）：Anthropic prompt caching —— 稳定前缀打 cache_control 断点。
 *
 * 为什么必须做：ReAct 主循环每步重发 system prompt + 全量工具定义，而这两段在任务期间
 * 逐字节稳定 —— 正是前缀缓存的理想命中区（Anthropic 缓存 token 按 10% 计价，长任务
 * 200 步循环是成本/延迟的主杠杆）。OpenAI 端 ≥1024 token 自动缓存，无需代码；
 * Anthropic 需显式 cache_control。
 *
 * 阈值：system 短于 4096 字符时断点的收益覆盖不了成本，直接发字符串（两种形态都合法）。
 * 工具定义始终随 system 稳定 → 在最后一个 tool 上打断点（cache 是前缀累积的，
 * 断点位置 = "到此为止都缓存"，放最后一段稳定内容上即可）。
 */
const ANTHROPIC_CACHE_MIN_CHARS = 4096;

/** ★ 导出供测试：system 段的缓存断点包装（短 system 直接发字符串） */
export function anthropicSystemField(system: string): unknown {
  return system.length >= ANTHROPIC_CACHE_MIN_CHARS
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;
}

/** ★ 导出供测试：在最后一个 tool 上打 cache 断点（前缀累积语义） */
export function markAnthropicToolsCached(tools: unknown[]): void {
  const last = tools[tools.length - 1] as Record<string, unknown> | undefined;
  if (last && typeof last === 'object') last.cache_control = { type: 'ephemeral' };
}

export class LlmClient {
  constructor(
    private platform: Platform,
    private model: Model,
  ) {}

  /**
   * 将内部 Message 转成 OpenAI API 约定的 snake_case 格式。
   *
   * ★★★ 取字段必须**两种形态都认**（2026-09-29 排障，high）：
   *   落库/回放的 tool_calls 是 OpenAI 流式 `DeltaToolCall` 形态 —— 名字与参数在
   *   `tc.function.name` / `tc.function.arguments`；而内部 `ToolCall` 形态在顶层
   *   `tc.toolName` / `tc.arguments`。两者**不同构**。
   *
   *   此前 `name` 两种都认、`arguments` 只读顶层 → 每次回放都把参数洗成 `{}`
   *   （实测生产库 220 个 tool_call 样本：顶层 arguments 0 个、function.arguments 220 个，
   *   **命中率 100%**）→ 模型看到"自己上一轮参数为空" → 模仿空参 → 自我强化退化循环
   *   （表现为「工具调用经常不传参数」，实测 python_exec 空参率 77.9%，且随会话内
   *   调用序号从 26.5% 单调升到 75.4%）。
   *
   *   ★ 教训：同一个 map 里「有的字段有兜底、有的没有」是高危信号 ——
   *     必须逐个字段核对两种形态的取法，不能只核对一个字段就以为整块对了。
   */
  private toApiMessage(m: Message): Record<string, unknown> {
    const out: Record<string, unknown> = { role: m.role };
    if (m.content !== undefined) out.content = m.content;
    if (m.toolCalls?.length) {
      out.tool_calls = m.toolCalls.map(tc => {
        const anyTc = tc as any;
        // 参数：优先取嵌套（落库的 DeltaToolCall），再退回顶层（内部 ToolCall）
        const rawArgs = anyTc.function?.arguments ?? anyTc.arguments;
        return {
          id: tc.id,
          type: 'function',
          function: {
            name: anyTc.function?.name || anyTc.toolName,
            arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {}),
          },
        };
      });
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

    // ★★★ 先做一轮**自愈**（2026-09-30，用户实报空参真因）：
    //
    // 上游（实测百炼 deepseek-v4.1-flash / agnes 系列都有）流式返回的 tool_call **id 可能为空串**。
    // 落库后 assistant.tool_calls[].id = '' 、对应 tool 消息 tool_call_id = null →
    // **配对不上** → 下面"配对不上就丢弃"的逻辑会把整组「调用 + 结果」**静默抹掉** →
    // 模型看到的历史变成：
    //     user: 开始任务
    //     assistant: 我来读取文件      ← 说了要调用，但调用记录没了
    //     assistant: 继续              ← 工具结果也没了
    // → **模型学到"说了要调工具却什么都不带"**，于是继续吐 `arguments:"{}"` → 自我强化退化。
    //
    // 实测统计（生产库两个会话）：**无 id 的调用空参率 90%（312/345）**，
    // 有 id 的只有 30%（126/420）—— 因果链明确。
    //
    // 修法：**在发送前按相邻顺序补齐**（而不是丢弃）。这比"落库时补 id"更稳：
    // 历史消息可能是旧版本落库的、或经压缩/迁移变形的，发送前自愈是最后一道、也是唯一可靠的一道。
    const healed = this.healToolCallIds(messages);

    const toolCallIds = new Set(
      healed
        .filter((m) => m.role === 'tool' && m.tool_call_id)
        .map((m) => m.tool_call_id as string),
    );

    // ★★★ 剥离「未执行的空参调用 + 它的错误回执」整组（2026-09-30 收口，剩余污染源）。
    //
    // ★ 决定性实验证据（用编译产物跑真实生产库会话）：
    //   老会话 deed2862 库内 69.3% 空参 → 走完整 sanitizeToolMessages 后**仍是 69.3%** ——
    //   即：id 自愈已生效（不再抹历史），但**存量坏历史被原样回放**。
    //   生产库里这些坏样本的形态是**成组**的：
    //     assistant: content="" + tool_calls=[{name:"python_exec", arguments:"{}"}]   ← 模型吐的空参
    //     tool:      tool_call_id=<同 id>  content="工具 python_exec 未执行：arguments 缺少必填参数（code）…"
    //   （回执是我们的拦截提示，不是真实工具结果）→ 每轮都完整地演示"可以不带参数"，模型照抄。
    //
    // ★ 判据（三条同时成立才剥离，保守、不误伤）：
    //   ① 该调用**参数为空**（`{}` / 空串）——有参数的真实调用一律不动；
    //   ② 它有配对的 tool 回执，且回执文本是**我们的"未执行"拦截文案**（`未执行：arguments 缺少必填参数`）
    //      —— 真实工具回执不含这句，故不会误删「模型给了参数但工具报错」的正常历史；
    //   ③ 剥离后若 assistant 内容为空则整条去掉；**保留**了内容则只去掉 tool_calls 那段。
    //   ★ 为什么要剥而不是"留着让模型少犯错"：空参回执对模型**没有任何有效信息**
    //     （缺哪个参数、该怎么改，当前轮已通过拦截提示给过模型；历史里留着只会被模仿）。
    //   ★ 与「无撤销」的取舍：这是**发送前**的只读清洗，不写库 —— 库里历史保持原貌可查。
    const UNEXECUTED_MARK = '未执行：arguments 缺少必填参数';
    /** tool_call_id → 是否是"未执行"拦截回执 */
    const unexecutedIds = new Set<string>();
    for (const m of healed) {
      if (m.role !== 'tool' || !m.tool_call_id) continue;
      if (typeof m.content === 'string' && m.content.includes(UNEXECUTED_MARK)) {
        unexecutedIds.add(m.tool_call_id as string);
      }
    }

    const out: any[] = [];
    for (const m of healed) {
      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
        // 先剥掉「未执行」的坏调用；剩下的再做配对过滤
        const live = m.tool_calls.filter(
          (tc: any) => !(tc?.id && unexecutedIds.has(tc.id)),
        );
        if (live.length === 0) {
          // 该 assistant 原本**只因**坏调用而存在 → 连同其错误回执一起剥离
          if (!(m.content && String(m.content).trim())) continue;
          out.push(stripToolMeta(m)); // 有正文则保留正文（去掉 tool_calls 元数据）
          continue;
        }
        const kept = live.filter((tc: any) => tc?.id && toolCallIds.has(tc.id));
        if (kept.length === 0) {
          out.push(stripToolMeta(m));
        } else {
          out.push({ ...m, tool_calls: kept });
        }
      } else if (m.role === 'tool') {
        if (unexecutedIds.has(m.tool_call_id)) continue; // 坏回执一并剥离
        if (toolCallIds.has(m.tool_call_id)) out.push(m);
      } else {
        out.push(m);
      }
    }
    // ★★★ 顺序规整（2026-10-09）：配对已完整（上面按 id 收口 + healToolCallIds 补 id），
    //   但**相邻顺序**仍可能违规 —— 运行中「立即发送」注入的 user 消息天然落在
    //   assistant(tool_calls) 与它的 tool 回执之间（注入时工具还没跑完）。OpenAI 兼容端点
    //   要求回执**紧跟**调用，中间夹一条 user 就 400（`tool_calls must be followed by tool messages`）。
    //   这里把这类"夹心"消息后移到整组之后；只读规整，库内顺序不动（与本次清洗同一取向）。
    //   ★ 必须在**所有过滤之后**做：先保证集内消息都已配对，再摆顺序，避免把会被剥掉的
    //     消息也算进位移。
    return reorderToolGroups(
      out.filter(
        (m) => m.role !== 'assistant' || (m.content && String(m.content).trim()) || (Array.isArray(m.tool_calls) && m.tool_calls.length),
      ),
    );
  }

  /**
   * 发送前自愈：给缺 id 的 tool_calls 与缺 tool_call_id 的 tool 消息**按相邻顺序**补上合成 id。
   *
   * 规则（保守，只动"确实缺"的，绝不改写已有 id）：
   *   1. assistant 的 tool_calls 里 id 为空/缺失 → 生成 `call_heal_<n>`；
   *   2. 紧随其后的 tool 消息若 tool_call_id 为空 → 按**顺序**依次匹配到上一条 assistant 的 tool_calls。
   *
   * ★ 为什么必须做（而不是只在落库时补）：见 sanitizeToolMessages 顶部注释 ——
   *   配对不上会被"丢弃"策略抹掉整组历史，那是空参退化的直接成因。
   * ★ 顺序匹配是正确的：OpenAI 协议要求 tool 消息与 tool_calls **同序**，
   *   生产库里 "批大小=N, 紧随tool=N" 的形态占绝大多数（实测 526/543 批为 1:1）。
   */
  private healToolCallIds(messages: any[]): any[] {
    const out = messages.map((m) => ({ ...m }));
    let seq = 0;
    for (let i = 0; i < out.length; i++) {
      const m = out[i];
      if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || m.tool_calls.length === 0) continue;
      // ① 补 assistant.tool_calls 的 id
      const missingIdx: number[] = [];
      m.tool_calls = m.tool_calls.map((tc: any, k: number) => {
        if (tc && typeof tc.id === 'string' && tc.id.trim()) return tc;
        missingIdx.push(k);
        return { ...tc, id: `call_heal_${Date.now().toString(36)}_${seq++}` };
      });
      if (missingIdx.length === 0) continue;
      // ② 紧随其后的 tool 消息：缺 id 的按顺序对上刚补的 id
      let cursor = 0;
      for (let j = i + 1; j < out.length && out[j].role === 'tool'; j++) {
        const t = out[j];
        if (t.tool_call_id && String(t.tool_call_id).trim()) { cursor++; continue; }
        // 找到该位置对应的 tool_call（已补过 id 的）
        const target = m.tool_calls[Math.min(cursor, m.tool_calls.length - 1)];
        if (target?.id) t.tool_call_id = target.id;
        cursor++;
      }
    }
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
    return { ...buildProtocolHeaders('openai', apiKey || ''), ...this.platform.headers };
  }

  /** Anthropic 鉴权头：x-api-key + anthropic-version（不使用 Bearer） */
  private async buildAnthropicHeaders(): Promise<HeadersInit> {
    const adapter = getPlatformAdapter();
    const apiKey = await adapter.keyring.get(`platform:${this.platform.id}:apikey`);
    return { ...buildProtocolHeaders('anthropic', apiKey || ''), ...this.platform.headers };
  }

  /** 走后端代理时的鉴权头：本地 JWT token + 授权码。
   *
   *  ★ 必须带 x-license：后端授权门禁（YZ_LICENSE_GUARD=1）会校验每个 /api 请求的
   *    x-license 头，缺失一律 403「未提供授权码」。历史上这里只带了 Authorization，
   *    症状很具迷惑性 —— 同一个「测试」动作，走 apiFetch 的路径（POST /llm/preview-models）
   *    自动带上了 x-license 所以正常，而走 LlmClient 代理的路径（GET /llm/models、
   *    聊天流、拉模型列表）全部 403，看起来像「某个功能坏了」而非「认证头漏了」。
   *
   *  授权码通过适配器注入（见 PlatformAdapter.getLicenseCode）：它是平台相关的存储
   *  （桌面端 keyring 加密 + 内存缓存），core 不该直接读。未注入时（如 server 端
   *  直连上游、不经过本函数）跳过，不影响原有行为。 */
  private proxyAuthHeaders(): HeadersInit {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (token) h['Authorization'] = `Bearer ${token}`;
    } catch {}
    try {
      const license = getPlatformAdapter().getLicenseCode?.();
      if (license) h['x-license'] = license;
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

  /** 瞬时网络错误重试的 upstreamFetch（2026-10-06）：仅重试「连接建立」阶段的网络层
   *  抛错（fetch failed / ECONNRESET / socket hang up 等），HTTP 非 2xx 状态原样返回
   *  交由调用方按状态码处理；中止信号直接抛出。
   *  ★ 长任务（小说推文等无人值守）跑几十分钟，任何一次模型调用的瞬时断连都会
   *  杀死整个任务 —— 必须自动吸收抖动（与 capabilityTest 的重试判定同一正则口径）。 */
  private async upstreamFetchRetry(url: string, body: unknown, opts?: { signal?: AbortSignal; anthropic?: boolean }, retries = 2): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await this.upstreamFetch(url, body, opts);
      } catch (e: any) {
        const sig = opts?.signal;
        if (sig?.aborted || e?.name === 'AbortError') throw e;
        const msg = e?.message || '';
        if (attempt < retries && /fetch failed|network|ETIMEDOUT|ECONNRESET|socket hang up|terminated/i.test(msg)) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        throw e;
      }
      // ★ 可重试的 HTTP 状态（2026-10-07）：429（频率/过载）与 5xx（上游网关抖动）此前**原样返回**
      //   → 直接把长任务打死，用户看到「调用失败：429 Too Many Requests / The system is currently overloaded」。
      //   实测（10-07 12:58~13:08）上游过载高发，长任务被一次 429 杀掉代价过高。
      //   只在**未开始消费响应体**时重试（此处必然成立：SSE 尚未 yield），尊重 Retry-After。
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15000) : (attempt + 1) * 2000;
        try { await res.text(); } catch { /* 丢弃响应体，释放连接 */ }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return res;
    }
  }

  async *chatStream(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
  ): AsyncIterable<ChatChunk> {
    if (this.isAnthropic) {
      yield* this.anthropicStream(messages, options);
      return;
    }
    const apiMessages = this.sanitizeToolMessages(messages.map(m => this.toApiMessage(m)), !!options?.tools?.length);
    // ★ OpenAI 兼容端点只认 snake_case（max_tokens / top_p / frequency_penalty / presence_penalty）。
    //   此前误发驼峰 maxTokens / topP，上游会**静默忽略** → 用户在智能体里设的 maxTokens 根本没生效，
    //   长输出被服务端默认上限截断（表现为：工具调用只吐出工具名、arguments 被切空成 {}）。
    //   undefined 不会被 JSON.stringify 序列化，这里保持只用显式提供的参数。
    const body: any = {
      model: this.model.modelId,
      messages: apiMessages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      stream: true,
    };
    if (options?.tools?.length) body.tools = options.tools;
    if (options?.responseFormat) body.response_format = options.responseFormat;
    // P0-1：tool_choice 强制策略（仅在有 tools 时才有意义）
    if (options?.tools?.length && options?.toolChoice) body.tool_choice = toOpenAIToolChoice(options.toolChoice);
    if (options?.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }
    const urlDesc = this.proxyBase ? `${this.proxyBase}/chat/completions` : `${this.baseUrl}/v1/chat/completions`;
    let res: Response;
    try {
      res = await this.upstreamFetchRetry('v1/chat/completions', body, { signal: options?.signal });
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
      if (res.status === 400 && /does not support tools|tool_calls must be followed|insufficient tool messages following tool_calls|tool_choice/i.test(text) && body.tools) {
        delete body.tools;
        // P0-1：tool_choice 不被端点支持（或依赖 tools）时一并剥离重试
        delete body.tool_choice;
        body.messages = this.sanitizeToolMessages(body.messages as any[], false);
        const retryRes = await this.upstreamFetch('v1/chat/completions', body, { signal: options?.signal });
        if (retryRes.ok && retryRes.body) {
          yield* parseSSE(retryRes.body);
          return;
        }
      }
      throw new Error(upstreamErrorMessage(res.status, res.statusText, urlDesc, text, 200));
    }
    yield* parseSSE(res.body);
  }

  private async *anthropicStream(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
  ): AsyncIterable<ChatChunk> {
    // ★★ 必须走与 OpenAI 路径**同一道**发送前清洗（2026-09-30 收口时发现漏了这里）：
    //   否则「存量空参坏历史剥离」「空 tool_call_id 自愈」在 Anthropic 协议下全部失效 ——
    //   典型的**入口漂移**：同一语义有多个入口，只修一个必然漏。
    //   ★ 先 toApiMessage 转成 OpenAI 约定形态（清洗逻辑按 `tool_calls[].function.arguments` 取参），
    //     再由 toAnthropicMessages 转 Anthropic block —— 两步解耦，清洗只有一份实现。
    const cleaned = this.sanitizeToolMessages(
      messages.map((m) => this.toApiMessage(m)),
      !!options?.tools?.length,
    ) as unknown as Message[];
    const { system, messages: aMessages } = toAnthropicMessages(cleaned);
    const body: any = {
      model: this.model.modelId,
      max_tokens: options?.maxTokens ?? 4096,
      messages: aMessages,
      stream: true,
    };
    if (system) body.system = anthropicSystemField(system);
    const tools = toAnthropicTools(options?.tools as any[]);
    if (tools.length) {
      body.tools = tools;
      markAnthropicToolsCached(tools);
    }
    // P0-1：Anthropic tool_choice（required→any；指定工具→{type:'tool',name}）
    if (tools.length && options?.toolChoice) body.tool_choice = toAnthropicToolChoice(options.toolChoice);
    if (options?.temperature != null) body.temperature = options.temperature;
    if (options?.topP != null) body.top_p = options.topP;
    const urlDesc = this.proxyBase ? `${this.proxyBase}/messages` : `${this.baseUrl}/v1/messages`;
    let res: Response;
    try {
      res = await this.upstreamFetchRetry('v1/messages', body, { signal: options?.signal, anthropic: true });
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
      throw new Error(upstreamErrorMessage(res.status, res.statusText, urlDesc, text, 200));
    }
    yield* parseAnthropicSSE(res.body);
  }

  async chat(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
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
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      frequency_penalty: options?.frequencyPenalty,
      presence_penalty: options?.presencePenalty,
      stream: false,
    };
    if (options?.responseFormat) body.response_format = options.responseFormat;
    if (options?.tools?.length && options?.toolChoice) body.tool_choice = toOpenAIToolChoice(options.toolChoice);
    const res = await this.upstreamFetchRetry('v1/chat/completions', body, { signal: options?.signal });
    if (!res.ok) {
      // ★ 非流式路径此前只抛 `${status} ${statusText}`，从**不读取响应体** →
      //   上游返回 400 时用户只能看到光秃秃的「400 Bad Request」，真实原因（如
      //   response_format 不支持 / 消息格式错误）被丢弃，排障全靠猜。
      //   现与 chatStream 对齐：读 body + 带上真实请求 URL，让原因可见。
      const text = await res.text().catch(() => '');
      const urlDesc = this.proxyBase ? `${this.proxyBase}/chat/completions` : `${this.baseUrl}/v1/chat/completions`;
      throw new Error(upstreamErrorMessage(res.status, res.statusText, urlDesc, text));
    }
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
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
  ): Promise<ChatChunk> {
    // ★ 与 anthropicStream 同理：走同一道发送前清洗（见该处注释）
    const cleaned = this.sanitizeToolMessages(
      messages.map((m) => this.toApiMessage(m)),
      !!options?.tools?.length,
    ) as unknown as Message[];
    const { system, messages: aMessages } = toAnthropicMessages(cleaned);
    const body: any = {
      model: this.model.modelId,
      max_tokens: options?.maxTokens ?? 4096,
      messages: aMessages,
      stream: false,
    };
    if (system) body.system = anthropicSystemField(system);
    const tools = toAnthropicTools(options?.tools as any[]);
    if (tools.length) {
      body.tools = tools;
      markAnthropicToolsCached(tools);
    }
    if (tools.length && options?.toolChoice) body.tool_choice = toAnthropicToolChoice(options.toolChoice);
    if (options?.temperature != null) body.temperature = options.temperature;
    if (options?.topP != null) body.top_p = options.topP;
    const res = await this.upstreamFetchRetry('v1/messages', body, { signal: options?.signal, anthropic: true });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const urlDesc = this.proxyBase ? `${this.proxyBase}/messages` : `${this.baseUrl}/v1/messages`;
      throw new Error(upstreamErrorMessage(res.status, res.statusText, urlDesc, text));
    }
    const data = await res.json();
    return anthropicResponseToChunk(data);
  }

  async listModels(): Promise<{ id: string; type?: string }[]> {
    if (this.isAnthropic) {
      // 拉取失败（上游不支持 /v1/models 等）时返回空列表，由 UI 引导手动添加模型 ID
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
      const res = await this.upstreamFetchRetry('v1/chat/completions', body);
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
      const res = await this.upstreamFetchRetry('v1/messages', body, { signal: options?.signal, anthropic: true });
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
    const res = await this.upstreamFetchRetry('v1/chat/completions', body, { signal: options?.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`vision 请求失败: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

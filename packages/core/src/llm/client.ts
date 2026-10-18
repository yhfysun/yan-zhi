// LLM 客户端 - 同时支持 OpenAI Chat Completions 与 Anthropic Messages 协议
// 浏览器端通过 PlatformAdapter.llmProxyBase 走后端代理（/api/llm 下的接口），避免 CORS 且不暴露 API Key；
// server 端（无 llmProxyBase）直连上游。
import type { Platform, Model, Message, ChatChunk, ChatRequest, TokenUsageDetail } from '@yan-zhi/shared';
import { isResponsesProtocol, normalizeOpenAiUsage } from '@yan-zhi/shared';
import { getPlatformAdapter } from '../platform/types';
import { parseSSE } from './stream';
import { withUsageHook, type UsageCallback } from './usage-hook.js';
// ★ 上游 URL 的**唯一实现**（2026-10-17）：本文件不再出现任何 'v1/...' 字面量 ——
//   版本段由 base 决定，国产厂商（火山 /api/v3、智谱 /api/paas/v4、百炼 /compatible-mode/v1）
//   的 base 自带版本段，无条件拼 v1 必然 404。详见 api-path.ts 文件头。
import { resolveUpstreamUrl, upstreamRelPath, type UpstreamKind } from './api-path.js';
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
import {
  toResponsesInput,
  toResponsesTools,
  toResponsesToolChoice,
  parseResponsesSSE,
  responsesResultToChunk,
  shouldRetryWithoutResponsesOnlyFields,
} from './responses.js';

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
 * 用量回调元信息（2026-10-17，费用账本接线用）—— 定义在 usage-hook.ts（纯函数、可单测），
 * 这里转售以保持「从 client 导入」的既有路径。
 */
export type { UsageCallback, UsageMeta } from './usage-hook.js';

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
/** 从上游响应体提取错误码（OpenAI 兼容 / 网关各异），拿不到返回 ''。 */
export function upstreamErrorCode(text: string): string {
  if (!text) return '';
  try {
    const j = JSON.parse(text);
    const c = j?.error?.code ?? j?.code;
    if (typeof c === 'string' && c) return c;
  } catch { /* 非 JSON，退回正则 */ }
  const m = /"code"\s*:\s*"([^"]+)"/.exec(text);
  return m ? m[1] : '';
}

export function upstreamErrorMessage(
  status: number,
  statusText: string,
  urlDesc: string,
  text: string,
  maxChars = 500,
): string {
  const code = upstreamErrorCode(text);
  const probe = `${code} ${text}`.toLowerCase();
  // ★ 2026-10-14：403 此前**无任何提示** → 用户只看到「LLM 请求失败: 403 Forbidden {json}」。
  //   实测两例：AgnesAI 中转 `insufficient_user_quota`（额度用尽）、百炼 `invalid_api_key`。
  //   按 code/报文区分配额耗尽与鉴权，给出可行动指引（换平台/模型或充值）。
  const quota = /insufficient_user_quota|insufficient_quota|exceeded[_-]?quota|quota|余额|额度|欠费/.test(probe);
  const badKey = /invalid_api_key|incorrect api key|unauthorized|api[ _-]?key/.test(probe);
  let hint = '';
  if (status === 401) hint = '（API Key 无效或未配置）';
  else if (status === 403) hint = quota
    ? `（上游额度已用尽：该平台账号余额不足，请更换平台/模型或充值${code ? `，code=${code}` : ''}）`
    : badKey
      ? `（API Key 无权限或无效${code ? `，code=${code}` : ''}）`
      : `（上游拒绝访问（403）：无权限/额度用尽/被风控，请检查平台配置${code ? `，code=${code}` : ''}）`;
  else if (status === 404) hint = `（URL 不对，请检查平台 API URL。当前请求: ${urlDesc}）`;
  else if (status === 429) hint = '（请求频率超限）';
  return `LLM 请求失败: ${status} ${statusText}${hint}${text ? ` ${text.slice(0, maxChars)}` : ''}`;
}

/**
 * 上游非 2xx 抛出的错误：把 HTTP `status`/`code` 挂在 Error 上。
 *
 * ★ 2026-10-14：此前一律 `new Error(...)`（无 status），而候选池故障转移
 *   `isPoolFailoverable` 优先读 `err.status` —— 生产里恒为 undefined，只能落到
 *   报文正则，而该正则又不含 401/403/配额字样 ⇒ 「配额耗尽 / Key 失效」这类
 *   **本该换平台/模型**的错误被当成不可恢复，直接打死长任务。带上 status 即修好。
 */
export class LlmUpstreamError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = '') {
    super(message);
    this.name = 'LlmUpstreamError';
    this.status = status;
    this.code = code;
  }
}

export function makeUpstreamError(
  status: number,
  statusText: string,
  urlDesc: string,
  text: string,
  maxChars = 500,
): LlmUpstreamError {
  return new LlmUpstreamError(
    status,
    upstreamErrorMessage(status, statusText, urlDesc, text, maxChars),
    upstreamErrorCode(text),
  );
}

/**
 * 400 是否应走「剥离 tool 协议降级重试」（**纯函数，可单测**）。
 *
 * ★★★ 2026-10-12（修上游 400 `messages 参数非法` / code 1214，会话 f0a901e3 10:52:21）：
 *   原实现把判据写成一条内联正则，只认 OpenAI 官方文案（`tool_calls must be followed` 等）。
 *   而**网关文案各异**：new-api 系返回笼统的「messages 参数非法。请检查文档。」→ 匹配不上
 *   ⇒ 明明有「去掉 tools + 把 tool 角色降级为 user」这条路却走不到 ⇒ 400 直接抛给用户。
 *
 * @param text 上游响应体
 * @param messages 本次请求的 messages（用于结构判据）
 * @param hasTools 本次请求是否带了 tools
 * @returns true = 应降级重试
 *
 * ★ 结构判据（`hasToolHistory`）是本次扩的关键：只要历史里**有 tool 协议痕迹**
 *   （role:'tool' 或带 tool_calls 的 assistant），就把 400 视为「可能 tool 协议不被接受」。
 *   降级本身安全（只改发送形态、不写库），比把 400 直接抛给用户划算。
 */
export function shouldRetryWithoutTools(text: string, messages: any[], hasTools: boolean): boolean {
  if (!hasTools) return false;
  const toolProtoRe = /does not support tools|tool_calls must be followed|insufficient tool messages following tool_calls|tool_choice|messages 参数非法|invalid.*messages|messages.*invalid|invalid_request_error/i;
  if (toolProtoRe.test(text)) return true;
  return Array.isArray(messages)
    && messages.some((m) => m?.role === 'tool' || (Array.isArray(m?.tool_calls) && m.tool_calls.length));
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

/**
 * 计算 assistant 消息该带的 `reasoning_content` 值（**纯函数，可单测**）。
 *
 * ★★★ 2026-10-10 实据修复（第二版）—— 第一版只回传**非空** reasoning，仍会 400：
 *   DeepSeek 系「思考模式」要求：只要是 assistant 消息（尤其带 tool_calls 的），
 *   `reasoning_content` 字段**必须存在**；模型某轮只吐 tool_calls 不吐 reasoning 时
 *   落库为 NULL ⇒ 旧判据 `if (m.reasoningContent)` 为假 ⇒ **字段整个缺失** ⇒ 整轮 400。
 *   实测现场：会话 f0a901e3 的 22:46:28 消息（有 tool_calls / reasoning 为 NULL）
 *   → 下一轮 `400 The reasoning_content in the thinking mode must be passed back to the API.`
 *
 * @returns 该带的值；`undefined` 表示**不该带该字段**（不设这个 key）。
 *   · assistant + 有 tool_calls 或 content 非空 → 有 reasoning 用原文，没有用 `''`（兜底空串）
 *   · 其余（user / tool / 空 assistant）→ undefined（不带，避免污染上游）
 *
 * ★ 为什么空串比省略字段安全：`reasoning_content` 在 OpenAI 规范里是未知字段，多数网关忽略；
 *   需要它的网关缺了就 400。⇒ 两害相权，带上（哪怕空串）更安全。
 */
export function resolveReasoningField(m: {
  role?: string;
  content?: unknown;
  toolCalls?: unknown[];
  reasoningContent?: string;
}): string | undefined {
  const hasPayload = (m.toolCalls?.length ?? 0) > 0
    || (typeof m.content === 'string' && m.content.length > 0);
  if (m.role !== 'assistant' || !hasPayload) return undefined;
  return m.reasoningContent ? m.reasoningContent : '';
}

/**
 * Token 池故障转移：一次请求内最多换几把 Key（2026-10-13）。
 *
 * ★ 为什么是 3：与 server 端 token-pool 的 `MAX_RETRY` 同量级。上限的意义是"别在
 *   池里全是死 Key 时把一次调用拖成 N 次超时"，而不是"3 把就一定够"。
 */
export const MAX_KEY_SWAPS = 3;

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
    // ★★★ 多模态展开（C1，2026-10-09）：有 `imageParts` 时把 content 组装成
    //   `[{type:'text'},{type:'image_url'}]` —— 这是**唯一**会产出数组形态的地方，
    //   因此 `sanitizeToolMessages`（对字符串做拼接）等下游处理**不会受影响**。
    //   ★ 两协议共用本函数：`toAnthropicMessages` 侧已有 `toAnthropicBlocks` 认得
    //     `image_url` 块（`anthropic.ts:49-55`），无需再改。
    if (m.imageParts?.length) {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ type: 'text', text: m.content });
      for (const p of m.imageParts) {
        // 空 base64 跳过（避免产出上游无法解析的空图块 → 400）
        if (!p?.base64) continue;
        parts.push({ type: 'image_url', image_url: { url: `data:${p.mime || 'image/jpeg'};base64,${p.base64}` } });
      }
      // 全是空图块时退回纯文本（不能让 content 变成空数组）
      if (parts.some((p) => p.type === 'image_url')) out.content = parts;
      else if (m.content !== undefined) out.content = m.content;
    } else if (m.content !== undefined) {
      out.content = m.content;
    }
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
    // ★★★ 带回 `reasoning_content`（2026-10-10 实据修复，两次迭代）：
    //   【第一版】只把「历史里有 reasoning 的」回传 —— **不够**。实测仍 400：
    //     模型中某一轮**只吐 tool_calls、没吐 reasoning**（落库 reasoning_content=NULL），
    //     回传时 `if (m.reasoningContent)` 为假 ⇒ **字段整个缺失** ⇒ DeepSeek 思考模式
    //     要求「带 tool_calls 的 assistant 消息必须带该字段」⇒ 整轮 400、任务 failed。
    //     实据：会话 f0a901e3 的 22:46:28 消息（tc=1 / rc=NULL）→ 下一轮即 400。
    //   【第二版】判据抽到 `shouldCarryReasoning()`（纯函数、可单测），
    //     没有 reasoning 时兜底**空字符串**（不是省略字段）。
    //   ★ 为什么敢无条件带：`reasoning_content` 在 OpenAI 规范里是**未知字段**，多数网关忽略
    //     （不会因此报错）；而需要它的网关（DeepSeek 系 / new-api）**缺了就 400**。
    const reasoning = resolveReasoningField(m);
    if (reasoning !== undefined) out.reasoning_content = reasoning;
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
  /** ★ Responses API（2026-10-17 新增）：与 Chat Completions 是**两条不同的请求体/事件结构**，
   *  不能复用 OpenAI 的组装与解析，也不能复用 Anthropic 的。三者在此分派。 */
  private get isResponses() { return isResponsesProtocol(this.platform.protocol); }
  /** Anthropic 官方协议不提供 embeddings 接口，上层 UI 应据此隐藏相关入口。 */
  get supportsEmbeddings() { return !this.isAnthropic; }

  /** 后端 LLM 代理基址（浏览器端注入）；server 端无此字段则直连上游 */
  private get proxyBase(): string | undefined {
    try { return getPlatformAdapter().llmProxyBase; } catch { return undefined; }
  }

  /** @param apiKeyOverride Token 池轮换时指定的 Key（见 upstreamFetchRetry）。不传则走 keyring。 */
  private async buildHeaders(apiKeyOverride?: string): Promise<HeadersInit> {
    const adapter = getPlatformAdapter();
    const apiKey = apiKeyOverride ?? await adapter.keyring.get(`platform:${this.platform.id}:apikey`);
    return { ...buildProtocolHeaders('openai', apiKey || ''), ...this.platform.headers };
  }

  /** Anthropic 鉴权头：x-api-key + anthropic-version（不使用 Bearer） */
  private async buildAnthropicHeaders(apiKeyOverride?: string): Promise<HeadersInit> {
    const adapter = getPlatformAdapter();
    const apiKey = apiKeyOverride ?? await adapter.keyring.get(`platform:${this.platform.id}:apikey`);
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
   *
   * ★★ 参数是**接口种类**（`'chat' | 'messages' | 'responses' | ...`），**不是路径字符串**。
   *   版本段由 base 决定（见 `api-path.ts` 文件头）：火山 `/api/v3`、智谱 `/api/paas/v4`、
   *   百炼 `/compatible-mode/v1` 的 base **自带版本段**，再无条件拼一个 `v1/` 上去必然 404，
   *   而症状是"平台连不上"而不是"路径错了"，极难排查。
   *   ⇒ 全仓**只有** `api-path.ts` 知道 URL 长什么样，这里只说"我要调哪类接口"。
   */
  private async upstreamFetch(
    kind: UpstreamKind,
    body: any,
    options?: { signal?: AbortSignal; anthropic?: boolean; apiKey?: string },
  ): Promise<Response> {
    const proxy = this.proxyBase;
    if (proxy) {
      // 代理侧只要相对路径（**不带版本段**）：最终 URL 由 llm-proxy 用同一个 resolveUpstreamUrl 拼
      return fetch(`${proxy}/${upstreamRelPath(kind)}`, {
        method: 'POST',
        headers: this.proxyAuthHeaders(),
        body: JSON.stringify({ platformId: this.platform.id, payload: body }),
        signal: options?.signal,
      });
    }
    const headers = options?.anthropic
      ? await this.buildAnthropicHeaders(options?.apiKey)
      : await this.buildHeaders(options?.apiKey);
    return fetch(this.resolveUrl(kind), {
      method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal,
    });
  }

  /**
   * 直连时的完整 URL —— **唯一出口**（`api-path.ts` 是唯一实现）。
   */
  private resolveUrl(kind: UpstreamKind): string {
    return resolveUpstreamUrl(this.baseUrl, kind);
  }

  /**
   * 报错信息里展示给用户的 URL —— **必须与真实请求 URL 同源**。
   *
   * ★ 为什么单独抽一个方法：历史上 `urlDesc` 是手拼的字符串，改了请求 URL 却忘了改它 ⇒
   *   用户看到的地址根本不是实际请求的地址，**下一次排查会被这份错误信息带偏**。
   */
  private describeUrl(kind: UpstreamKind): string {
    const proxy = this.proxyBase;
    return proxy ? `${proxy}/${upstreamRelPath(kind)}` : this.resolveUrl(kind);
  }

  /** 瞬时网络错误重试的 upstreamFetch（2026-10-06）：仅重试「连接建立」阶段的网络层
   *  抛错（fetch failed / ECONNRESET / socket hang up 等），HTTP 非 2xx 状态原样返回
   *  交由调用方按状态码处理；中止信号直接抛出。
   *  ★ 长任务（小说推文等无人值守）跑几十分钟，任何一次模型调用的瞬时断连都会
   *  杀死整个任务 —— 必须自动吸收抖动（与 capabilityTest 的重试判定同一正则口径）。
   *
   *  ★★★ Token 池轮换（2026-10-13）：401/403 时换池里的下一把 Key 重试。
   *   背景（真实故障）：`PlatformAdapter.llmKeyPool`（types.ts:80）声明"设置后 LlmClient
   *   直连失败会自动换 Key 重试并回写失败记录"，适配器（node-adapter.ts 的
   *   llmKeyPoolAdapter）也实现了 acquire/reportSuccess/reportFailure —— 但**本类从未
   *   调用过它**。于是 keyring 只剩"从池里随机取一把"当初始 Key 的作用，取到死 Key
   *   就直接 401 失败收场：`platform_api_key.fail_count` 长期恒为 0（实测 agens-guest
   *   池 11 把 Key 全为 0），死 Key 每轮仍按权重被发出去，表现为「偶发 401 打死长任务」
   *   （10-10 ~ 10-13 共 5 次，跨 3 个会话）。
   *   现在：失败即回写（池内权重衰减、10 分钟窗口），并换下一把（excludeIds 保证同一次
   *   请求内不重复试同一把）。
   *
   *  只在**直连**时轮换：走后端代理（llmProxyBase）时 Key 由 llm-proxy 服务端持有且已
   *  自行轮换，core 手里没有 Key 可换（见 types.ts:44 注释）。
   */
  private async upstreamFetchRetry(kind: UpstreamKind, body: unknown, opts?: { signal?: AbortSignal; anthropic?: boolean }, retries = 2): Promise<Response> {
    // Token 池（仅 server 端直连路径注入）。无池时行为与改动前完全一致。
    const pool = this.proxyBase ? undefined : (() => {
      try { return getPlatformAdapter().llmKeyPool; } catch { return undefined; }
    })();
    let tokenId: string | null = null;
    let apiKey: string | undefined;
    const triedIds: string[] = [];
    let keySwaps = 0;
    if (pool) {
      try {
        // ★ Token 级停用闸（2026-10-18）：建过池的平台，acquire 取不到可用 Key 时**不得**
        //   回退 keyring 主 Key —— 否则把池内 Token 全停用后，过期的旧 Key 会从 keyring
        //   "复活"继续打 401（keyring 里存的就是当初那把）。只有「从未建过池」的老平台
        //   才保留 keyring 兜底（适配器未实现 hasAny 时按"建过池"保守处理）。
        if (pool.hasAny && !(await pool.hasAny(this.platform.id))) {
          /* 无池：apiKey 保持 undefined → buildHeaders 走 keyring 主 Key（原行为） */
        } else {
          const t = await pool.acquire(this.platform.id, triedIds);
          if (t) { tokenId = t.id; apiKey = t.apiKey; triedIds.push(t.id); }
          else { apiKey = ''; } // 有池但全停用/耗尽 ⇒ 空 Key（不发 Authorization），让失败如实暴露
        }
      } catch { /* 取 Key 失败 → 按无池处理，回退 keyring 主 Key */ }
    }
    /** 失败回写：只记「这个 Key 本身可能就是问题」的状态（401/403 鉴权、429 限流、5xx 上游）。
     *  400 这类是**请求**问题（工具 schema/参数非法），记到 Key 头上会把好 Key 冤枉降权。 */
    const reportFailureIfKeyRelated = (status: number) => {
      if (!pool || !tokenId) return;
      if (status === 401 || status === 403 || status === 429 || status >= 500) {
        try { pool.reportFailure(tokenId); } catch { /* 回写失败不影响主流程 */ }
      }
    };

    for (let attempt = 0; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await this.upstreamFetch(kind, body, { ...opts, apiKey });
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
      // ★ 鉴权失败 → 换下一把 Key。不等待：换 Key 与退避是两件事，池里有活 Key 应立即见效。
      if ((res.status === 401 || res.status === 403) && pool && keySwaps < MAX_KEY_SWAPS) {
        reportFailureIfKeyRelated(res.status);
        try { await res.text(); } catch { /* 丢弃响应体，释放连接 */ }
        let next: { id: string; apiKey: string } | null = null;
        try { next = await pool.acquire(this.platform.id, triedIds); } catch { next = null; }
        if (!next) return res; // 池里没有没试过的了 → 如实返回本次失败，由上层落库给用户看
        tokenId = next.id; apiKey = next.apiKey; triedIds.push(next.id); keySwaps++;
        continue;
      }
      // ★ 可重试的 HTTP 状态（2026-10-07）：429（频率/过载）与 5xx（上游网关抖动）此前**原样返回**
      //   → 直接把长任务打死，用户看到「调用失败：429 Too Many Requests / The system is currently overloaded」。
      //   实测（10-07 12:58~13:08）上游过载高发，长任务被一次 429 杀掉代价过高。
      //   只在**未开始消费响应体**时重试（此处必然成立：SSE 尚未 yield），尊重 Retry-After。
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        reportFailureIfKeyRelated(res.status);
        const ra = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 15000) : (attempt + 1) * 2000;
        try { await res.text(); } catch { /* 丢弃响应体，释放连接 */ }
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      // 走到这里 = 本次请求已定案（成功，或不可重试的失败）：成功的 Key 回写以衰减历史失败计数
      if (pool && tokenId) {
        if (res.ok) { try { pool.reportSuccess(tokenId); } catch { /* 忽略 */ } }
        else reportFailureIfKeyRelated(res.status);
      }
      return res;
    }
  }

  async *chatStream(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; toolChoice?: ToolChoiceOption; signal?: AbortSignal; onUsage?: UsageCallback },
  ): AsyncIterable<ChatChunk> {
    // ★ 费用接线（2026-10-17）：onUsage 钩子包在**最外层** —— 三条协议路径与各自的
    //   重试/降级分支因此全部覆盖。挂在某个分支上必然漏（本项目"同一语义多处收口"的老教训）。
    const inner = this.chatStreamInner(messages, options);
    if (!options?.onUsage) {
      yield* inner;
      return;
    }
    yield* withUsageHook(inner, options.onUsage, this.usageMeta());
  }

  /** chatStream 的协议分派 + 重试/降级（抽出来只为让 onUsage 钩子能整体包住它，行为不变） */
  private async *chatStreamInner(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
  ): AsyncIterable<ChatChunk> {
    if (this.isResponses) {
      yield* this.responsesStream(messages, options);
      return;
    }
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
    const urlDesc = this.describeUrl('chat');
    let res: Response;
    try {
      res = await this.upstreamFetchRetry('chat', body, { signal: options?.signal });
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
      //
      // ★★★ 2026-10-12 扩判据（修上游 400 `messages 参数非法` / code 1214）：
      //   原正则只认 OpenAI 官方文案，网关文案各异（new-api 返回笼统的「messages 参数非法」）
      //   ⇒ 明明有「剥离 tool 协议降级重试」这条路却走不到。判据抽到 shouldRetryWithoutTools
      //     （纯函数、可单测），并补一条**结构判据**：历史含 tool 痕迹即视为可疑 → 降级重试。
      if (res.status === 400 && shouldRetryWithoutTools(text, body.messages as any[], !!body.tools)) {
        delete body.tools;
        // P0-1：tool_choice 不被端点支持（或依赖 tools）时一并剥离重试
        delete body.tool_choice;
        body.messages = this.sanitizeToolMessages(body.messages as any[], false);
        const retryRes = await this.upstreamFetch('chat', body, { signal: options?.signal });
        if (retryRes.ok && retryRes.body) {
          yield* parseSSE(retryRes.body);
          return;
        }
      }
      throw makeUpstreamError(res.status, res.statusText, urlDesc, text, 200);
    }
    yield* parseSSE(res.body);
  }

  /** Responses API 流式（2026-10-17）。请求体与事件结构都与 Chat Completions 不同，独立一条。 */
  private async *responsesStream(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
  ): AsyncIterable<ChatChunk> {
    // system 消息在 Responses 里没有对应 item ⇒ 合并进 instructions（toResponsesInput 已处理）
    const { instructions, input } = toResponsesInput(messages.map(m => this.toApiMessage(m)));
    const body: any = {
      model: this.model.modelId,
      input,
      stream: true,
    };
    if (instructions) body.instructions = instructions;
    if (options?.temperature != null) body.temperature = options.temperature;
    // ★ Responses 的输出上限叫 max_output_tokens（不是 max_tokens）
    if (options?.maxTokens != null) body.max_output_tokens = options.maxTokens;
    if (options?.topP != null) body.top_p = options.topP;
    if (options?.tools?.length) body.tools = toResponsesTools(options.tools);
    if (options?.tools?.length && options?.toolChoice) body.tool_choice = toResponsesToolChoice(options.toolChoice);
    if (options?.reasoningEffort) body.reasoning = { effort: options.reasoningEffort };

    const urlDesc = this.describeUrl('responses');
    let res: Response;
    try {
      res = await this.upstreamFetchRetry('responses', body, { signal: options?.signal });
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
      // 各家对 Responses 的支持子集不一（部分网关不认 instructions/temperature/reasoning）
      // ⇒ 剥掉这些**可选**字段重试一次（有 tools 时连 tools 一起剥，降级成纯文本）。
      if (shouldRetryWithoutResponsesOnlyFields(res.status, text)) {
        delete body.temperature;
        delete body.top_p;
        delete body.reasoning;
        delete body.instructions;
        const retryRes = await this.upstreamFetch('responses', body, { signal: options?.signal });
        if (retryRes.ok && retryRes.body) {
          yield* parseResponsesSSE(retryRes.body);
          return;
        }
        if (!retryRes.ok && retryRes.status === 400 && body.tools) {
          delete body.tools;
          delete body.tool_choice;
          const finalRes = await this.upstreamFetch('responses', body, { signal: options?.signal });
          if (finalRes.ok && finalRes.body) {
            yield* parseResponsesSSE(finalRes.body);
            return;
          }
        }
      }
      throw makeUpstreamError(res.status, res.statusText, urlDesc, text, 200);
    }
    yield* parseResponsesSSE(res.body);
  }

  /** Responses 非流式（chat() 分派） */
  private async responsesChat(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
  ): Promise<ChatChunk> {
    const { instructions, input } = toResponsesInput(messages.map(m => this.toApiMessage(m)));
    const body: any = { model: this.model.modelId, input, stream: false };
    if (instructions) body.instructions = instructions;
    if (options?.temperature != null) body.temperature = options.temperature;
    if (options?.maxTokens != null) body.max_output_tokens = options.maxTokens;
    if (options?.topP != null) body.top_p = options.topP;
    if (options?.tools?.length) body.tools = toResponsesTools(options.tools);
    if (options?.tools?.length && options?.toolChoice) body.tool_choice = toResponsesToolChoice(options.toolChoice);

    const urlDesc = this.describeUrl('responses');
    let res = await this.upstreamFetchRetry('responses', body, { signal: options?.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (shouldRetryWithoutResponsesOnlyFields(res.status, text)) {
        delete body.temperature;
        delete body.top_p;
        delete body.instructions;
        res = await this.upstreamFetch('responses', body, { signal: options?.signal });
        if (!res.ok && body.tools) {
          delete body.tools;
          delete body.tool_choice;
          res = await this.upstreamFetch('responses', body, { signal: options?.signal });
        }
      }
      if (!res.ok) {
        const text2 = await res.text().catch(() => '');
        throw makeUpstreamError(res.status, res.statusText, urlDesc, text2 || text, 200);
      }
    }
    const data = await res.json().catch(() => null);
    return responsesResultToChunk(data);
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
    const urlDesc = this.describeUrl('messages');
    let res: Response;
    try {
      res = await this.upstreamFetchRetry('messages', body, { signal: options?.signal, anthropic: true });
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
      throw makeUpstreamError(res.status, res.statusText, urlDesc, text, 200);
    }
    yield* parseAnthropicSSE(res.body);
  }

  async chat(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; toolChoice?: ToolChoiceOption; signal?: AbortSignal; onUsage?: UsageCallback },
  ): Promise<ChatChunk> {
    const chunk = await this.chatInner(messages, options);
    if (options?.onUsage) {
      // 非流式一次回调（detail 可能 undefined = 上游没给 usage，调用方自行估算）
      try {
        options.onUsage(chunk.usage?.detail, this.usageMeta());
      } catch { /* 记账失败绝不能炸掉生成 */ }
    }
    return chunk;
  }

  /** chat 的协议分派（抽出来同 chatStreamInner：让 onUsage 能在统一位置回调） */
  private async chatInner(
    messages: Message[],
    options?: { tools?: unknown[]; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown }; toolChoice?: ToolChoiceOption; signal?: AbortSignal },
  ): Promise<ChatChunk> {
    if (this.isResponses) {
      return this.responsesChat(messages, options);
    }
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
    const res = await this.upstreamFetchRetry('chat', body, { signal: options?.signal });
    if (!res.ok) {
      // ★ 非流式路径此前只抛 `${status} ${statusText}`，从**不读取响应体** →
      //   上游返回 400 时用户只能看到光秃秃的「400 Bad Request」，真实原因（如
      //   response_format 不支持 / 消息格式错误）被丢弃，排障全靠猜。
      //   现与 chatStream 对齐：读 body + 带上真实请求 URL，让原因可见。
      const text = await res.text().catch(() => '');
      const urlDesc = this.describeUrl('chat');
      throw makeUpstreamError(res.status, res.statusText, urlDesc, text);
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
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            // ★ D1 可观测（2026-10-09）：OpenAI 缓存命中字段
            cachedTokens: data.usage.prompt_tokens_details?.cached_tokens,
            // ★ 计价明细（2026-10-17 补）：**协议边界归一化**。此处此前漏了 detail
            //   （流式 parseSSE 有、非流式没有）⇒ 非流式调用（自评/总结/计划重划）
            //   全部走估算，金额虚高。与 stream.ts 同一函数，别在这里另写一套。
            detail: normalizeOpenAiUsage(data.usage),
          }
        : undefined,
    };
  }

  /**
   * 回调元信息：**实际发出请求的**平台/模型（故障转移后与任务快照可能不同）。
   * 钩子本体（"只回调一次/取最后一份/抛错不回调"）在 usage-hook.ts —— 纯函数、可单测。
   */
  private usageMeta(): { platformId?: string; modelId?: string } {
    return { platformId: this.platform?.id, modelId: this.model?.modelId };
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
    const res = await this.upstreamFetchRetry('messages', body, { signal: options?.signal, anthropic: true });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const urlDesc = this.describeUrl('messages');
      throw makeUpstreamError(res.status, res.statusText, urlDesc, text);
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
    return fetch(this.resolveUrl('models'), { headers });
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
    if (this.isResponses) return this.responsesChatTest();
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
      const res = await this.upstreamFetchRetry('chat', body);
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

  private async responsesChatTest(): Promise<{ ok: boolean; durationMs: number; finishReason?: string; content?: string; msg?: string }> {
    const start = Date.now();
    try {
      // Responses 的输出上限叫 max_output_tokens（不是 max_tokens），发最小请求验证可用性
      const body = {
        model: this.model.modelId,
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
        max_output_tokens: 5,
        stream: false,
      };
      const res = await this.upstreamFetchRetry('responses', body);
      const durationMs = Date.now() - start;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, durationMs, msg: `HTTP ${res.status} ${res.statusText} ${text.slice(0, 120)}` };
      }
      const data = await res.json().catch(() => null);
      const chunk = responsesResultToChunk(data);
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

  private async anthropicChatTest(): Promise<{ ok: boolean; durationMs: number; finishReason?: string; content?: string; msg?: string }> {
    const start = Date.now();
    try {
      const body = {
        model: this.model.modelId,
        max_tokens: 5,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
        stream: false,
      };
      const res = await this.upstreamFetch('messages', body, { anthropic: true });
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
        const res = await this.upstreamFetch('embeddings', { model: this.model.modelId, input: ['ping'] });
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
        const res = await this.upstreamFetch('videos', {
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
      const res = await this.upstreamFetch('images', {
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
    const res = await this.upstreamFetch('embeddings', { model: this.model.modelId, input });
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
      const res = await this.upstreamFetchRetry('messages', body, { signal: options?.signal, anthropic: true });
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
    const res = await this.upstreamFetchRetry('chat', body, { signal: options?.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`vision 请求失败: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

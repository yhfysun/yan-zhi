/**
 * 用量归一化 —— 三协议 → 同一份 `TokenUsageDetail`（2026-10-17）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么必须有这个模块：三家对「缓存」的语义是**相反**的
 *
 * | 协议               | 输入（全价）                   | 缓存命中                                  | 缓存写入                     |
 * | ---------------- | ------------------------ | ------------------------------------- | ------------------------ |
 * | OpenAI chat      | `prompt_tokens - cached` | `prompt_tokens_details.cached_tokens` | 0（自动缓存，无写入费）            |
 * | Anthropic        | `input_tokens`           | `cache_read_input_tokens`             | `cache_creation_input_tokens` |
 * | OpenAI Responses | `input_tokens - cached`  | `input_tokens_details.cached_tokens`  | 0                        |
 *
 * **关键**：OpenAI 的 `cached` 是 `prompt_tokens` 的**子集**（prompt 已经把它算进去了）；
 * Anthropic 的 `cache_read_input_tokens` **不在** `input_tokens` 里（要单独加）。
 *
 * 直接拿 `prompt_tokens`（或 `ChatChunk.usage.promptTokens`）去乘单价，两者必错其一：
 * OpenAI 会把缓存命中的部分**按全价重复算一遍**，Anthropic 会**整个漏掉**缓存读取量。
 * 而这两个错误都不报错，只表现为"金额和账单对不上"，且长会话下偏差会持续放大。
 *
 * ---
 * ## ★ 为什么不动 `ChatChunk.usage` 的旧字段
 *
 * `promptTokens / completionTokens / cachedTokens` 现在是**混合语义**（喂 token 预算用的），
 * 全仓多处依赖。改它 = 同时动两套口径。
 *
 * ⇒ 本模块**新增** `detail?: TokenUsageDetail` 字段（挂在同一处），旧字段语义冻结：
 *   · 旧字段 → 继续喂 `task.totalTokens` 的 token 预算
 *   · 新字段 → 喂成本计算
 *
 * ---
 * ## ★ 归一化必须发生在「协议边界」，不能下沉到计价
 *
 * 计价函数（`model-cost.ts`）只认 `TokenUsageDetail`，**不认协议**。
 * 一旦在计价里写 `if (protocol === 'anthropic')`，就等于把"协议差异"沉到了最底层，
 * 加第四种协议时要改计价 —— 而计价是有等式断言的核心逻辑，不该被协议变动波及。
 */

/** 归一化后的用量明细（**计价唯一输入**） */
export interface TokenUsageDetail {
  /** 全价输入（**未**命中缓存的部分） */
  inputTokens: number;
  /** 缓存命中读取（按 `cacheRead` 单价计） */
  cacheReadTokens: number;
  /** 缓存写入（按 `cacheWrite` 单价计；OpenAI 自动缓存为 0） */
  cacheWriteTokens: number;
  /** 输出 */
  outputTokens: number;
  /** 推理 token，**仅观测不参与计价**（厂商已把它算进 `output_tokens` 并按 output 价收费） */
  reasoningTokens?: number;
  /** true = 上游没给 usage，本条是按内容长度估算的（UI 显示 `≈`） */
  estimated?: boolean;
}

/**
 * token 粗估 —— **不要在本模块再定义一个 `estimateTokens`**。
 *
 * ★★★ 2026-10-18 事故（我造成的，记在这里防止重犯）：
 *   本模块第一版导出了一个自己的 `estimateTokens(content, reasoning)`（口径 = 长度/2），
 *   而 `@yan-zhi/shared` 里**早已存在** `estimateTokens(text)`（`utils/index.ts`，
 *   按字符类别分别计价：CJK 1.5、非 ASCII 1、ASCII 字母数字 4 字符 1 token…）。
 *   两个同名导出经 `export *` 后**后者静默覆盖前者** ⇒ 全仓调用方（含**上下文压缩判据**）
 *   一夜之间退回简陋口径 —— 而那个"按词数估算 ⇒ 无空格代码只算 1 token ⇒ 低估 5000 倍
 *   ⇒ 压缩永不触发 ⇒ 上游 400"的 bug 正是既有实现专门修掉的。
 *   `tsc` 不会报错，只有 `apps/server/test/token-estimate.test.ts` 打红才暴露出来。
 *
 * ⇒ 规矩：**新增导出前先 grep 全仓同名符号**。`export *` 的重名是静默覆盖，不是编译错误。
 *
 * 需要估算时直接用既有的 `estimateTokens`（从 `@yan-zhi/shared` 导入）。
 * 待办：`llm-task-manager.ts` 里三处重复的 `Math.round((content + reasoning) / 2)`
 * 应改为调用既有实现（口径更准），但该改动会改变 token 预算触发点，需单独评估。
 */

/** 安全取数：只认有限非负数，其它一律 0（中转站什么都可能返回） */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 构造一条空明细（用于"完全没拿到 usage"的场景） */
export function emptyUsageDetail(estimated = false): TokenUsageDetail {
  return { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, estimated };
}

/**
 * OpenAI Chat Completions → `TokenUsageDetail`。
 *
 * ★ `cached` 是 `prompt` 的**子集** ⇒ 全价输入 = `prompt - cached`（不能直接用 prompt）。
 *
 * ★ 防御：中转站乱报时可能 `cached > prompt`（实测有网关把两者搞反），
 *   此时**钳制** cached 到 prompt（全价输入下限为 0，绝不能出现负数 —— 负费用会让账本越跑越小）。
 */
export function normalizeOpenAiUsage(raw: unknown): TokenUsageDetail {
  const u = (raw ?? {}) as Record<string, any>;
  const prompt = num(u.prompt_tokens);
  const cachedRaw = num(u.prompt_tokens_details?.cached_tokens);
  const cached = Math.min(cachedRaw, prompt);
  return {
    inputTokens: Math.max(0, prompt - cached),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
    outputTokens: num(u.completion_tokens),
    reasoningTokens: num(u.completion_tokens_details?.reasoning_tokens) || undefined,
  };
}

/**
 * Anthropic Messages → `TokenUsageDetail`。
 *
 * ★ 与 OpenAI **语义相反**：`cache_read_input_tokens` / `cache_creation_input_tokens`
 *   **不在** `input_tokens` 里 ⇒ 全价输入直接用 `input_tokens`，不要做减法。
 *
 * ★ 两个来源要合并：输入侧在 `message_start.message.usage`，输出侧在 `message_delta.usage`。
 *   所以**两个参数都传**才是完整的；只传一个会得到 `outputTokens = 0`（费用凭空少一大截）。
 *
 * ★ `cache_creation_input_tokens` 是本次新增采集项（改之前根本没读 ⇒ 缓存写入费必然漏计；
 *   长 system prompt 场景这笔钱不小，因为每次改写 system 都要重新付费写入）。
 */
export function normalizeAnthropicUsage(start?: unknown, delta?: unknown): TokenUsageDetail {
  const s = (start ?? {}) as Record<string, any>;
  const d = (delta ?? {}) as Record<string, any>;
  return {
    inputTokens: num(s.input_tokens),
    cacheReadTokens: num(s.cache_read_input_tokens),
    cacheWriteTokens: num(s.cache_creation_input_tokens),
    outputTokens: num(d.output_tokens) || num(s.output_tokens),
  };
}

/**
 * OpenAI Responses → `TokenUsageDetail`。
 *
 * ★ 与 Chat Completions 同口径（`input_tokens` 含 cached），但字段挂在不同位置
 *   （`input_tokens_details.cached_tokens`），且输出字段叫 `output_tokens`。
 *   **不要**复用 `normalizeOpenAiUsage` —— 字段名不同，复用只会静默全 0。
 */
export function normalizeResponsesUsage(raw: unknown): TokenUsageDetail {
  const u = (raw ?? {}) as Record<string, any>;
  const input = num(u.input_tokens);
  const cachedRaw = num(u.input_tokens_details?.cached_tokens);
  const cached = Math.min(cachedRaw, input);
  return {
    inputTokens: Math.max(0, input - cached),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
    outputTokens: num(u.output_tokens),
    reasoningTokens: num(u.output_tokens_details?.reasoning_tokens) || undefined,
  };
}

/**
 * usage 是否**缺失**（不是"为 0"，而是"没给"）。
 *
 * ★ 判据必须是「全 0 且响应非空」：中转站/部分网关会返回 `usage: {prompt:0, completion:0}`，
 *   直接当 0 用 ⇒ 费用恒 ¥0 ⇒ 阈值永不触发。这种情况必须走估算并标 `estimated`。
 */
export function isMissingUsage(d: TokenUsageDetail | undefined | null): boolean {
  if (!d) return true;
  return d.inputTokens + d.cacheReadTokens + d.cacheWriteTokens + d.outputTokens <= 0;
}

/** 累加两条明细（账本 / 会话累计用） */
export function addUsageDetail(a: TokenUsageDetail, b: TokenUsageDetail): TokenUsageDetail {
  return {
    inputTokens: (a.inputTokens || 0) + (b.inputTokens || 0),
    cacheReadTokens: (a.cacheReadTokens || 0) + (b.cacheReadTokens || 0),
    cacheWriteTokens: (a.cacheWriteTokens || 0) + (b.cacheWriteTokens || 0),
    outputTokens: (a.outputTokens || 0) + (b.outputTokens || 0),
    reasoningTokens: (a.reasoningTokens || 0) + (b.reasoningTokens || 0) || undefined,
    estimated: Boolean(a.estimated && b.estimated),
  };
}

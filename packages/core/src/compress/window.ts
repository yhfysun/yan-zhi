// 上下文滑动窗口压缩
import type { Message } from '@yan-zhi/shared';
import { estimateTokens } from '@yan-zhi/shared';
import { LlmClient } from '../llm/client';
import type { Model, Platform } from '@yan-zhi/shared';

/**
 * 压缩触发点系数：阈值 = 模型上下文窗口 × 该系数。
 *
 * ★★★ 为什么需要它（2026-09-29 排障）：此前调用侧直接把 `model.contextWindow`（100 万级）
 *   当阈值传给本类，而判据 `tokenCount()` 是**保守低估**的估算（实测约为真实 token 的一半），
 *   两者不是同一个量纲 → 压缩几乎永不触发，上下文无限膨胀
 *   （实测单会话 1156 条消息 / 真实 prompt ≈ 22 万 token）。
 *
 * 取 0.5 是**双重保守**：① 估算函数偏低，需要留出低估余量；
 *   ② 还要给本轮输出与工具结果留出空间，避免"刚压缩完又超限"。
 *   这是经验值，不是精确换算 —— 若要收紧/放宽，改这里一个数即可。
 */
export const COMPRESS_TRIGGER_RATIO = 0.5;

/**
 * 分级压缩：**先裁剪超长老工具输出，再考虑整段摘要**（2026-09-29，对齐 CodeBuddy 的多级压缩）。
 *
 * ★ 为什么需要（此前是"单级瀑布"）：只有"整段摘要"一档，一旦触发就丢前文、只留一条摘要。
 *   但长任务里真正吃 token 的往往是**少数几条超长工具输出**（cmd_exec 的日志、
 *   file_read 的大文件、python_exec 的 stdout），单条上限 64KB、保留窗口 6 条 → 最坏 384KB 常驻。
 *   把这些老输出裁成"首尾 + 截断标记"就能省下绝大部分，**且完全不破坏对话结构**
 *   （tool 消息仍在、配对仍完整、模型仍能看到"我调用过什么、结果大概是什么"）。
 *
 * 顺序：① 先对**保留窗口之外**的老 tool 消息做裁剪 → 若已降到阈值以下就**不摘要**
 *       （保住了全部对话结构，比丢前文温和得多）；② 仍超限才走整段摘要。
 */
export const COMPRESS_TOOL_CAP_CHARS = 8 * 1024;

/**
 * 摘要缓存：跨 step 复用「已摘要过的前缀」，避免**每一步都重发一次全量摘要 LLM 请求**。
 *
 * ★★★ 为什么必须存在（2026-10-01 排障，high）：
 *   ReAct 主循环每一步都执行
 *     `messagesToSend = loadMessages(convId)`  →  每步都是**全量**历史
 *     `if (needsCompression(...)) compress(...)`  →  每步都超阈值
 *   而 `compress` 对「保留窗口之外的整段前文」每次都重新调一次 LLM 生成摘要
 *   —— 上下文越长，**每一个 step 都白白多付一次摘要调用**（既慢又烧 token）。
 *   实测生产库长会话（1156 条消息）每步都触发一次。
 *
 * 判据：把上次被摘要的**消息 id 序列（指纹）**与摘要文本一起存下来。下一次若
 *   ① 指纹仍是被压缩段的前缀（说明历史只往后追加、没被编辑/删改），且
 *   ② 新增部分规模可控（新增 token 未超过上次摘要的一倍），
 * 就复用旧摘要，只对**新增的那一段**做增量摘要，再把两段摘要拼起来。
 * 否则退回全量摘要（保证正确性优先）。
 *
 * 指纹按 id 序列比对：历史只追加时前缀必然完全一致；一旦消息被删除/编辑
 * （id 序列变化）即判为不命中 —— 宁可多花一次调用，也不给模型错误的摘要。
 */
export interface SummaryCache {
  /** 上次被摘要的**全部**消息 id（顺序敏感，作为前缀指纹） */
  ids: string[];
  /** 上次生成的摘要文本 */
  summary: string;
}

/**
 * 合成消息 id 的唯一清单 —— 这些消息**不在 `message` 表里**，是压缩/组装时现造的。
 *
 * ★★★ 之所以收进 core（2026-10-03）：`coveredIds` 的**读侧前缀比对**要求
 *   「覆盖的 id 必须是当前消息列表的严格前缀」。一旦某个合成 id 混进 `coveredIds`，
 *   前缀比对会因这个"凭空多出的 id"整段失效 → 摘要被误判报废 → 每步重算。
 *   （旧实现两处各写一份：`context-snapshot.ts` 只列了 `__summary__`，漏了 `'summary'` ——
 *    而 core 压缩产出的合成 id 恰恰是 `'summary'`，正是漏的那个。）
 *
 *   `sys` 是系统提示词消息的固定 id（每轮现造，不落库）；`summary` / `__summary__`
 *   分别是 core 压缩产物与 server 组装时使用的摘要占位 id，两者并存以向后兼容。
 */
export const SYNTHETIC_MESSAGE_IDS: ReadonlySet<string> = new Set(['sys', 'summary', '__summary__']);

/** 该 id 是否为**不落库**的合成消息（`coveredIds` 必须把它们排除在外）。 */
export function isSyntheticMessageId(id: string): boolean {
  return SYNTHETIC_MESSAGE_IDS.has(id);
}

/**
 * 判断 `prev` 是否为 `cur` 的**严格前缀**（顺序敏感的逐项比对，i 从 0 起）。
 *
 * ★★★ 这是读/写两侧共用的**唯一**前缀判据（2026-10-03 收敛）：
 *   此前 core 的 `isPrefix`（overlap 用）与 server 的 `every((id,i)=>ids[i]===id)`
 *   是同义实现的两份复制 —— 一旦某处改成"从第 1 条起比"就静默错位。
 *   ⇒ 只留一个定义，任何前缀语义都调它。
 */
export function isIdPrefix(prev: string[], cur: string[]): boolean {
  if (!Array.isArray(prev) || !Array.isArray(cur) || prev.length > cur.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== cur[i]) return false;
  }
  return true;
}

/**
 * **写侧坐标**：一次压缩「被摘要代表、可从历史中省掉」的消息 id 序列。
 *
 * ★★★ 覆盖段恒为**从会话首条起的一段连续前缀**（2026-10-03 定案）：
 *   压缩把历史分成「被摘要段（含头部，consumed）/ 最近保留窗口」两段。`consumed` 必须
 *   从会话首条起连续 —— 因为读侧要按"前缀"判定摘要是否仍适用，并据此
 *   `rawMessages.slice(consumed.length)` 取增量；一旦覆盖段不从 0 起（旧实现把
 *   keepFirst 头部排除在外、每轮原文重发，覆盖段从 idx=2 起），读侧切片会**错位**：
 *   既把已覆盖的消息当增量重复发送，又让前缀比对第 0 条即失败 → 摘要每轮判废、
 *   每步全量重压（实测单会话 111 条摘要、每步 25s+）。
 *
 * ★ 头部（首轮任务目标）**也并入覆盖段**（随被摘要段一起进摘要）：覆盖段才连续；
 *   目标内容由摘要指令的 `## 任务目标` 强制原样保留来保证不丢。
 * ★ 只收真实消息 id（`isSyntheticMessageId` 过滤）：合成消息不落库，进前缀会整段失效。
 * ★ 顺序原样保留：读侧依赖"连续前缀"，一旦重排即判废重算。
 */
export function coveredIdsForCompression(consumed: Message[]): string[] {
  return consumed.map((m) => String(m.id || '')).filter((id) => id && !isSyntheticMessageId(id));
}

/**
 * **读侧判据**：`coveredIds` 是否是当前消息 id 列表的**严格前缀**（i 从 0 起）。
 *
 * ★ 与 `coveredIdsForCompression` 成对 —— 写侧从**会话首条**起连续产出覆盖段，
 *   读侧从**会话首条**起逐项校验，两端共用本函数即**物理上**不可能再错位。
 *   命中后 `rawMessages.slice(covered.length)` 即"摘要之后的新消息"。
 * ★ 空覆盖视为无效（没有摘要就谈不上覆盖）；覆盖比列表还长也无效（历史被删短了）。
 */
export function isCoveredPrefix(coveredIds: string[], allIds: string[]): boolean {
  if (!Array.isArray(coveredIds) || coveredIds.length === 0) return false;
  return isIdPrefix(coveredIds, allIds);
}

/**
 * 只取「属于本次会话主线」的消息：**剔除子智能体消息**。
 *
 * ★★★ 为什么必须有（2026-10-02）：`loadMessages` 只按 `conversation_id` 过滤，
 *   而子智能体消息与主会话**共用同一个 conversation_id**（靠 `parent_tool_call_id` 区分）
 *   → 子智能体的每一步都会混进主智能体的上下文。而子智能体存在的全部意义就是
 *   **上下文隔离**（Claude Code 文档明说：subagent 只把最终结果回传给父级）。
 *   混进来之后：① 主上下文被无关中间过程灌满；② token 计数虚高、压缩提前触发；
 *   ③ 模型看到两套并行的工具调用序列，容易串味。
 *
 * ★ 两种形态都认：本仓库既有 `parentToolCallId`（内存形态）也有 `parent_tool_call_id`
 *   （DB 行形态）。同一个 map 里「有的字段有兜底、有的没有」是本项目的经典坑，
 *   这里对两个键同时判，不给静默失效留口子。
 */
export function visibleMessages(messages: Message[]): Message[] {
  return messages.filter((m) => {
    const any = m as any;
    const pid = any.parentToolCallId ?? any.parent_tool_call_id;
    return !pid;
  });
}

/**
 * 预算兜底：压缩后若仍超 `budget`，按「代价从大到小」继续降。
 *
 * 顺序（与主流一致，见 LibreChat 的 contextPruning 两级）：
 *   ① 先把**最长的 tool 输出**硬清成占位符（结构保留、内容丢弃）；
 *   ② 仍超 → 从**最老的**非 system 消息开始丢（成组丢，保持 tool 配对）。
 *
 * ★ 为什么放在 core：这是纯逻辑，不依赖存储层；且必须与 `compress` 用**同一个**
 *   `tokenCount`，否则「一边算一边降」两边口径不一致，会降不准。
 */
export function enforceBudget(messages: Message[], budget: number, opts?: { placeholder?: string }): Message[] {
  const placeholder = opts?.placeholder ?? '[历史工具结果已清理以释放上下文]';
  if (budget <= 0) return messages;

  // ① 长工具输出 → 占位符（从最长开始，直到降到预算内）
  let out = messages.slice();
  const toolIdx = out
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.role === 'tool' && (m.content || '').length > 512)
    .sort((a, b) => (b.m.content || '').length - (a.m.content || '').length);
  for (const { i } of toolIdx) {
    if (sumTokens(out) <= budget) return out;
    out = out.map((m, j) => (j === i ? { ...m, content: placeholder } : m));
  }
  if (sumTokens(out) <= budget) return out;

  // ② 从最老的开始丢（保 system；成组丢：丢 assistant(tool_calls) 时连带其 tool 应答）
  let head = 0;
  while (head < out.length && out[head].role === 'system') head++;
  let drop = head;
  while (drop < out.length && sumTokens(out.slice(0, head).concat(out.slice(drop))) > budget) {
    drop++;
    // 若切点落在 tool 上，说明它配对的 assistant 已被丢 → 一并跳过孤児 tool
    while (drop < out.length && out[drop].role === 'tool') drop++;
  }
  return out.slice(0, head).concat(out.slice(drop));
}

/** 与 ContextWindow.tokenCount 同口径的独立求和（供 enforceBudget 使用，避免实例化） */
function sumTokens(messages: Message[]): number {
  const w = new ContextWindow(0);
  return w.tokenCount(messages);
}

/** 把超长文本裁成 头部 75% + 尾部 25%（错误信息/结论常在末尾），未超限原样返回。 */
export function capLongText(text: string, max: number = COMPRESS_TOOL_CAP_CHARS): string {
  if (!text || text.length <= max) return text;
  const marker = `\n…[已压缩：原文 ${text.length} 字符，此处为节选]…\n`;
  const head = Math.max(Math.floor((max - marker.length) * 0.75), 0);
  const tail = Math.max(max - head - marker.length, 0);
  if (head + tail <= 0) return text.slice(0, max);
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}

/**
 * ★★★ 常态裁剪「保留窗口之外」的老工具结果（D4，2026-10-09）。
 *
 * ★ 为什么必须有（实测）：`capLongText` 此前**唯一调用点**是 `compress` 内部的第 ① 级裁剪
 *   （见下方 `compress` 里那处）—— 也就是**只有超阈值触发压缩时才会裁**。
 *   于是低于阈值时，老的大工具输出（`python_exec` 的长 stdout、`file_read` 的长文件、
 *   `browser_get_page_content` 的长正文）**全量进入上下文**，逐条推高 token，
 *   让会话更早撞上阈值、更早被迫走"丢前文换摘要"这种**有损**路径。
 *   ⇒ 把"裁老工具输出"从"压缩时才做"提升为**每步常态**，逼近成熟产品的 microcompact
 *     （持续淘汰旧的大结果，而不是攒到阈值再一次性处理）。
 *
 * ★ 三条安全性（少一条都可能引入新 bug）：
 *   ① **只改 `content` 字符串长度，不动消息结构** —— 不增删消息、不改顺序，
 *      因此 tool_calls ↔ tool 的配对**不可能被破坏**（这是裁剪能常态化、而"丢消息"不能的前提）；
 *   ② **幂等**：已裁过的文本必然 < 上限，再裁是 no-op（`capLongText` 自身保证）；
 *   ③ **只裁保留窗口之外**：最近 `keepRecent` 条保持原文 —— 否则会出现"模型刚读到、
 *      下一步就没了"的诡异行为（那是比费 token 更糟的体验）。
 *
 * @param keepRecent 保留最近多少条 tool 结果原文（与 compress 的 keepRecent 同口径）
 */
export function capStaleToolResults(
  messages: Message[],
  keepRecent = 6,
  maxChars: number = COMPRESS_TOOL_CAP_CHARS,
): Message[] {
  if (!messages.length || keepRecent < 0) return messages;
  // 定位"保留窗口"的起点：只裁它之前的 tool 消息
  const boundary = Math.max(0, messages.length - keepRecent);
  let changed = false;
  const out = messages.map((m, i) => {
    if (i >= boundary) return m;                    // 保留窗口内 → 原文
    if (m.role !== 'tool') return m;                // 只处理 tool 结果
    const text = m.content || '';
    if (text.length <= maxChars) return m;          // 未超限 → 不动（幂等）
    changed = true;
    return { ...m, content: capLongText(text, maxChars) };
  });
  return changed ? out : messages;                  // 无变化返回原引用（避免无谓的响应式/比对开销）
}

export class ContextWindow {
  private summaryClient: LlmClient | null = null;

  constructor(
    /**
     * **触发阈值**（不是"预算"—— 预算换算已完成后才传进来）。
     *
     * ★★★ 两种入口传进来的东西**语义不同**，务必分清（2026-10-02 修**过度压缩**）：
     *   · `forContextWindow(cw)` → 传 `标称窗口 × COMPRESS_TRIGGER_RATIO`：
     *     因为 `tokenCount` 估算偏低，乘 0.5 是**估算误差余量**（"怕算不准就早点压"）。
     *   · `forBudget(usable)`    → 传 `usable` **原值**：usable 已是
     *     「标称 × 25%（有效比例）− 输出预留」的结论，**不能再乘一次系数** ——
     *     否则 1M 模型会被压到 124K（只用到标称 12%），白白扔掉一半有效窗口。
     *   ★ 判据：**同一个系数不能同时承担"估算补偿"和"预算折算"两种语义**；
     *     一旦叠加就是本仓库反复出现的"串联两个保守兜底 → 过度保守"。
     */
    private maxTokens: number = 8000,
    private keepRecent: number = 6,
    private summaryPlatform?: Platform,
    private summaryModel?: Model,
    /**
     * 头部保护条数（**2026-10-03 起为兼容保留，不再影响切分**）。
     *
     * ★★★ 语义变更：旧实现用它把「首轮任务目标」以**原文每轮重发**、不进摘要。
     *   但摘要指令**本就强制保留** `## 任务目标`（用户最初的原始问题）+ `## 已完成` / `## 待办`，
     *   即"原始问题 / 处理了什么 / 还没处理什么"；再单独重发头部 = 多余的第二套机制，
     *   且它让覆盖段从 idx=keepFirst 起 → 与读侧「从 0 起前缀」坐标冲突
     *   → 摘要每轮判废、每步全量重压。
     *   ⇒ 头部现**并入被摘要段**，覆盖段恒从首条起连续；首轮目标由摘要承载。
     *   ★ 参数保留仅为兼容既有调用（主循环/子智能体仍传 2），当前**无行为影响**。
     */
    private keepFirst: number = 0,
  ) {}

  /**
   * 推荐入口：按**模型上下文窗口**创建（内部换算成触发阈值）。
   * ★ 请用本方法而不是 `new ContextWindow(model.contextWindow)` —— 直接传上下文窗口
   *   会把阈值抬到 100 万级，等于关掉压缩（见 COMPRESS_TRIGGER_RATIO 注释）。
   *
   * ★★ 说明：`contextWindow` 缺失/不合理时的**保守兜底已上移到调用侧**（32K，见
   *   `apps/server/src/constants.ts` 的 `resolveContextWindow`）—— 因为"该按多少窗口估算"
   *   是**运行环境**的知识（依赖模型/平台配置），core 是纯逻辑包不该替宿主猜。
   *   这里只做"非法值不得把阈值算成 0/NaN"的防御。
   */
  static forContextWindow(contextWindow: number, keepRecent = 6, keepFirst = 0): ContextWindow {
    const cw = Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 8000;
    return new ContextWindow(Math.max(1, Math.floor(cw * COMPRESS_TRIGGER_RATIO)), keepRecent, undefined, undefined, keepFirst);
  }

  /**
   * 按「可用预算（已扣掉输出预留）」创建。
   *
   * ★ 与 `forContextWindow` 的分工：
   *   · `forContextWindow(cw)` = 按模型**标称窗口** × 0.5 → 触发阈值（**估算误差余量**）；
   *   · `forBudget(usable)`  = 按**已扣输出预留的可用预算** → 触发阈值（**分层预算**）。
   *   两者不可混用：前者是"我怕算不准"，后者是"我得给输出留地方"。
   *   ★ 对齐 Roo Code 的 `allowedTokens = cw×(1-10%) - reservedTokens(maxTokens)`。
   *
   * ★★★ 2026-10-02 关键修正：**预算不可再乘 COMPRESS_TRIGGER_RATIO**。
   *   预算值（标称 × 25% − 输出预留）本身已经是"该用多少"的结论，再乘 0.5 变双重折扣：
   *   1M 模型 → 有效 248K → 阈值被压到 **124K**（只用到标称 12%）→ **过度压缩、白扔一半有效窗口**。
   *   ⇒ 这里显式传 `triggerRatio = 1.0`，让 `maxTokens` 就是阈值本身。
   *   （`forContextWindow` 保留 0.5 不变 —— 那条路径输入是标称窗口，确实需要保守余量。）
   */
  static forBudget(usableTokens: number, keepRecent = 6, keepFirst = 0): ContextWindow {
    const u = Number.isFinite(usableTokens) && usableTokens > 0 ? usableTokens : 8000;
    // ★ 直接传 u（不乘系数）：u 已是"该用多少"的结论，再乘一次就是双重折扣（见构造器注释）。
    return new ContextWindow(Math.max(1, Math.floor(u)), keepRecent, undefined, undefined, keepFirst);
  }

  /** 设置摘要用的 LLM 客户端 */
  setSummaryModel(platform: Platform, model: Model): void {
    this.summaryPlatform = platform;
    this.summaryModel = model;
    this.summaryClient = new LlmClient(platform, model);
  }

  /**
   * 统计 token 数。
   * ★★★ 必须计入 `toolCalls`（2026-09-29 排障）：工具的**参数全在 toolCalls 里**
   *   （尤其 python_exec / file_write 的 code/content，往往是单条消息最长的那部分）。
   *   此前只算 content + reasoningContent → 实测漏算约 13% 的字符，
   *   叠加阈值口径错误，压缩几乎永不触发，上下文无限膨胀。
   */
  tokenCount(messages: Message[]): number {
    return messages.reduce(
      (sum, m) =>
        sum +
        estimateTokens(m.content || '') +
        estimateTokens(m.reasoningContent || '') +
        estimateTokens(this.toolCallsToText(m)),
      0,
    );
  }

  /** 把 tool_calls 序列化成可估算的文本（两种形态都认：嵌套 DeltaToolCall 与顶层 ToolCall）。 */
  private toolCallsToText(m: Message): string {
    const tcs = (m as any).toolCalls;
    if (!Array.isArray(tcs) || tcs.length === 0) return '';
    try {
      return tcs
        .map((tc: any) => {
          const name = tc?.function?.name || tc?.toolName || '';
          const raw = tc?.function?.arguments ?? tc?.arguments;
          const args = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
          return `${name}${args}`;
        })
        .join(' ');
    } catch {
      return '';
    }
  }

  /** 压缩上下文（可选 beforeCompress hook：压缩丢失前抢救细节，由调用侧注入，core 不依赖存储层） */
  async compress(
    messages: Message[],
    opts?: {
      beforeCompress?: (toCompress: Message[]) => Promise<void>;
      /** 分级压缩中「裁剪老工具输出」这一档的最大字符数（默认 8KB） */
      toolCapChars?: number;
      /**
       * 摘要缓存（跨 step 复用）。命中时只对**新增部分**做增量摘要，
       * 避免每步重发全量摘要请求。未提供则每次全量摘要（历史行为）。
       * 见 SummaryCache 注释。
       */
      summaryCache?: SummaryCache;
      /** 摘要调用超时（ms）。超时则跳过摘要、退回「裁剪后的原样」，绝不阻塞主循环。默认 20000。 */
      summaryTimeoutMs?: number;
      /**
       * 压缩完成回调（供调用侧**把摘要落库**）。
       *
       * ★★★ 为什么必须有（2026-10-02，本方案的核心）：此前压缩结果只赋回**局部变量**
       *   `messagesToSend`，不落库 → 下一步 `loadMessages` 又是全量 → 又超阈值 → 又压缩。
       *   虽然 `summaryCache` 挡住了「重发 LLM 请求」，但**每步仍在重算、且历史从未真正变短**。
       *   ⇒ 落库后，下一步读到的就是"摘要 + 增量"，压缩本身成为**持久化事实**
       *     （对齐 OpenHands 把 `Condensation` 写回事件日志 / Claude Code 的 compact_boundary）。
       *
       * ★ 回调只做"告知"，由调用侧决定写哪张表 —— core 保持纯逻辑、不依赖存储层
       *   （与 `beforeCompress` 同一取向）。
       */
      onCompressed?: (info: { coveredIds: string[]; summary: string; tokens: number }) => void | Promise<void>;
    },
  ): Promise<Message[]> {
    if (this.tokenCount(messages) <= this.maxTokens) {
      return messages;
    }

    // ★ 第 ① 级：先裁剪超长老工具输出（不动对话结构、tool 配对完整）。
    //   很多长任务只靠这一档就能降到阈值以下 —— 比"丢前文换一条摘要"温和得多。
    //   只有裁剪后仍超限，才进入第 ② 级整段摘要。
    const toolCapChars = opts?.toolCapChars ?? COMPRESS_TOOL_CAP_CHARS;
    const trimmed = messages.map((m) => {
      if (m.role !== 'tool') return m;
      const text = m.content || '';
      if (text.length <= toolCapChars) return m;
      return { ...m, content: capLongText(text, toolCapChars) };
    });
    if (this.tokenCount(trimmed) <= this.maxTokens) return trimmed; // 裁剪即够 → 保住全部消息

    // ★★★ 覆盖段恒为「从会话首条起的连续前缀」（2026-10-03 定案，A 方案）。
    //
    //   切分只有一处：保留最近 `keepRecent` 条，其余（**含头部**）全部并入被摘要段。
    //
    //   为什么不再单独保留"头部原文重发"（旧 keepFirst 实现的 B 方案）：
    //     摘要有损，但摘要指令**本就强制保留** `## 任务目标`（= 用户最初的原始问题）
    //     与 `## 已完成 / ## 待办` —— 即"原始问题 / 处理了什么 / 还没处理什么"。
    //     既然如此，再"每轮原文重发头部"就是**多余的第二套机制**，且它把覆盖段推到
    //     idx=keepFirst，使覆盖段不再是「从 0 起的前缀」→ 与读侧前缀比对/切片坐标冲突
    //     → 摘要每轮判废、每步全量重压（实测单会话 111 条摘要、每步 25s+）。
    //   ⇒ 头部**并入被摘要段**，覆盖段自然从首条起连续；首轮目标由摘要承载（摘要指令保证）。
    //     ★ 后果：`keepFirst` 不再影响切分（保留参数仅为兼容既有调用，语义已并入摘要）。
    //
    //   切窗边界对齐：保留窗口绝不能从 tool 消息中间开始（否则产生孤儿 tool，
    //   严格上游 400，兜底清洗只能丢弃 → tool 返回值丢失）。回退到该组 tool 应答
    //   所属的 assistant（带 tool_calls）处，整对保留，返回值一条不丢。
    //
    // ★★★ 2026-10-08 再补一层：**未被应答的 tool_calls 必须整体拽进保留窗口**。
    //   场景（长任务实测）：模型连着发起多个工具调用（assistant(tool_calls) 与
    //   tool(result) 成对出现，一次重连/断流期间可能连着好几对），而 `keepRecent=6`
    //   只数**消息条数** —— 6 条很容易把一个**正在等结果**的调用挤出保留窗口。
    //   挤出之后模型看到的上下文里，自己刚发的调用只剩摘要里一句
    //   "[调用工具] browser_click…"、**没有结果** → 模型判自己搞完了、或换参重发
    //   （实测表现："pageAgent 在执行吗？啥进度没有？"）。压缩在这里**制造了一种
    //   模型无法正确推理的残缺状态**，比"丢细节"更严重。
    //   ⇒ 切点若落在"最后一个 assistant(tool_calls) 之后"，回退到**该 assistant 之前**，
    //     把「调用 + 结果（含尚未返回的）」整组保住。代价是保留窗口略大，可接受。
    let cut = trimmed.length - this.keepRecent;
    while (cut > 0 && trimmed[cut].role === 'tool') cut--;
    // 悬空调用保护：把**结果尚未齐全**的工具调用组整体拽进保留窗口。
    //   判据（纯从消息序列推断，不依赖外部状态）：
    //     · assistant 带 tool_calls → 其应答 tool 消息**紧随其后**；
    //     · 数一下紧随的 tool 消息条数 n；若 n < tool_calls.length，说明这组**不完整**
    //       （结果还没回来，或部分没回来）→ 切点前移到该 assistant 之前，整组退回保留窗。
    //   ★ 只对"不完整"的组前移 —— 完整的组留在被摘要段里没问题（摘要有损但结构自洽）。
    //     若无条件前移，保留窗口会被撑到几乎全部历史，压缩形同失效。
    //   ★ 只扫切点附近有限深度：再往前的组早已整体落在被摘要段内，不构成"残缺状态"。
    for (let scan = cut - 1; scan >= 0 && scan >= cut - this.keepRecent * 4; scan--) {
      const m = trimmed[scan] as any;
      const tcs = m.toolCalls;
      if (m.role !== 'assistant' || !Array.isArray(tcs) || tcs.length === 0) continue;
      // 数紧随其后的 tool 消息条数（连续段）
      let n = 0;
      while (scan + 1 + n < trimmed.length && trimmed[scan + 1 + n].role === 'tool') n++;
      if (n >= tcs.length) continue; // 该组结果齐全 → 留在被摘要段，继续往前找
      cut = scan;                    // 该组残缺 → 切点前移到它之前
      while (cut > 0 && trimmed[cut].role === 'tool') cut--;
      break;
    }
    if (cut <= 0) return trimmed; // 无法在保住配对的前提下压缩，保持原样发送

    // ★ 前移保护的兜底：悬空调用保护可能把 cut 推得很靠前（极端情况：整段历史都是
    //   未应答的调用）。若此时被摘要段已小到"压了也没用"（不足 2 条），放弃本次压缩
    //   —— 与 `cut <= 0` 同性质：宁可原样发送（让 enforceBudget 那层硬降兜底），
    //   也不要产出一个"摘要覆盖 0~1 条"的畸形结果。`toKeep` 全保时模型仍能看到完整链条。
    if (cut < 2) return trimmed;

    const toCompress = trimmed.slice(0, cut); // 被摘要段：从首条起连续前缀
    const toKeep = trimmed.slice(cut);        // 保留窗口：最近 keepRecent 条（含悬空调用组）

    // 压缩前钩子：把即将被摘要吞掉的细节先落盘（失败不阻塞压缩）
    if (opts?.beforeCompress) {
      try { await opts.beforeCompress(toCompress); } catch {}
    }

    // ★★ 增量摘要：命中缓存前缀时，只摘要「新增的那一段」，把新摘要接在旧摘要后面。
    //   见 SummaryCache 注释 —— 这是"每步重发一次全量摘要"的解药。
    let summary: string;
    const cache = opts?.summaryCache;
    const ids = toCompress.map((m) => m.id);
    const hit = cache && cache.summary && this.isPrefix(cache.ids, ids) ? cache.ids.length : -1;
    if (hit >= 0) {
      if (hit === ids.length) {
        // 前缀完全一致（历史未被追加） → 直接复用，零 LLM 调用
        summary = cache!.summary;
      } else {
        const fresh = toCompress.slice(hit);
        // 新增部分过大（超过已摘要段规模的一半）时，增量收益低且拼接摘要易失真 → 退回全量
        const freshTokens = this.tokenCount(fresh);
        const oldTokens = this.tokenCount(toCompress.slice(0, hit));
        if (freshTokens > Math.max(oldTokens * 0.5, 512)) {
          summary = await this.summarizeWithTimeout(toCompress, opts?.summaryTimeoutMs);
        } else {
          const delta = await this.summarizeWithTimeout(fresh, opts?.summaryTimeoutMs);
          summary = delta ? `${cache!.summary}\n\n## 后续进展（增量）\n${delta}` : cache!.summary;
        }
      }
    } else {
      summary = await this.summarizeWithTimeout(toCompress, opts?.summaryTimeoutMs);
    }

    // 写回缓存供下一个 step 复用（调用方持有同一对象即生效）
    if (cache) {
      cache.ids = ids;
      cache.summary = summary;
    }

    // ★ 通知调用侧「本次压缩覆盖了哪些消息」→ 由调用侧落库（core 不碰存储）。
    //   ★★★ 覆盖段 = 被摘要段 = **从会话首条起的连续前缀** —— 读侧据此
    //     `rawMessages.slice(covered.length)` 取增量，并以前缀比对判摘要是否仍适用。
    //     写读两端共用 coveredIdsForCompression / isCoveredPrefix，坐标唯一（2026-10-03 修根因）。
    //   失败不阻塞主循环：落库失败只是"这次压缩没持久化"，功能仍正确（下一步会重算）。
    if (opts?.onCompressed) {
      const coveredIds = coveredIdsForCompression(toCompress);
      try {
        await opts.onCompressed({ coveredIds, summary, tokens: this.tokenCount(toCompress) });
      } catch {}
    }

    return [
      {
        id: 'summary',
        conversationId: toKeep[0]?.conversationId || '',
        role: 'system',
        content: `前文摘要：${summary}`,
        createdAt: Date.now(),
      },
      ...toKeep,
    ];
  }

  /** 判断 `prev` 是否为 `cur` 的**前缀**（严格按顺序逐项比对 id）。 */
  private isPrefix(prev: string[], cur: string[]): boolean {
    // 委托到模块级 isIdPrefix：前缀语义**只有一处定义**（2026-10-03 收敛，杜绝两套坐标）
    return isIdPrefix(prev, cur);
  }

  /** 带超时的摘要：超时/异常一律降级为「裁剪后的简版」，绝不阻塞主循环。 */
  private async summarizeWithTimeout(messages: Message[], timeoutMs = 20000): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(''), timeoutMs);
      });
      const result = await Promise.race([this.summarize(messages).catch(() => ''), timeout]);
      return result || this.fallbackSummary(messages);
    } catch {
      return this.fallbackSummary(messages);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 摘要不可用时的降级文本（截断版，不调 LLM） */
  private fallbackSummary(messages: Message[]): string {
    const render = (m: Message) => {
      const tools = this.toolCallsToText(m);
      const parts = [m.content || ''];
      if (tools) parts.push(`[调用工具] ${tools}`);
      return `${m.role}: ${parts.filter(Boolean).join(' ')}`;
    };
    return messages.map(render).join('\n').slice(0, 500) + '...';
  }

  /** 生成摘要 */
  private async summarize(messages: Message[]): Promise<string> {
    // ★★★ 摘要输入必须**带上 tool_calls**（2026-09-29 排障）：
    //   此前 `map((m) => m.content || '')` 直接丢弃 toolCalls —— 而「模型如何调用工具」
    //   恰恰是它最需要模仿的行为样本。丢掉之后，历史里只剩 keepRecent 窗口内的调用，
    //   一旦那些调用是空参，模型就持续模仿空参（自我强化退化循环）。
    //   这里保留工具**名字与参数原文**，让摘要里始终存在「用完整参数调用工具」的示范。
    const render = (m: Message) => {
      const tools = this.toolCallsToText(m);
      const parts = [m.content || ''];
      if (tools) parts.push(`[调用工具] ${tools}`);
      return `${m.role}: ${parts.filter(Boolean).join(' ')}`;
    };

    if (!this.summaryClient || !this.summaryModel) {
      // 无摘要模型时退回同一份降级实现（避免截断逻辑两处各写一份而漂移）
      return this.fallbackSummary(messages);
    }

    const summaryMessages: Message[] = [
      {
        id: 'sum-instr',
        conversationId: '',
        role: 'system',
        content: [
          '请把以下对话压缩成结构化摘要，不超过 400 字，分节输出：',
          '## 任务目标',
          '## 已完成',
          '## 关键决定',
          '## 待办/下一步',
          '铁律（不可妥协）：文件路径、URL、命令、ID、函数名、API Key 占位符、错误信息原文等所有不透明标识符（opaque identifiers）必须原样保留、一字不改，禁止缩写、改写或省略。',
          '关键数据（数值、版本号、配置项）同样原样保留。',
        ].join('\n'),
        createdAt: Date.now(),
      },
      {
        id: 'sum-input',
        conversationId: '',
        role: 'user',
        content: messages.map(render).join('\n'),
        createdAt: Date.now(),
      },
    ];

    const result = await this.summaryClient.chat(summaryMessages, {
      maxTokens: 800,
      temperature: 0.3,
    });

    return result.delta?.content || '';
  }

  /** 判断是否需要压缩 */
  needsCompression(messages: Message[]): boolean {
    return this.tokenCount(messages) > this.maxTokens;
  }
}

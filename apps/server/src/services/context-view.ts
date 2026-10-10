/**
 * 上下文组装 —— ReAct 主循环与子智能体循环的**唯一出口**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么要有这个模块（2026-10-02）
 *
 * ① **收敛入口**：此前主循环（`llm-task-manager.ts` 内联）与子智能体循环**各写了一遍**
 *    「加载历史 → 判超限 → 压缩 → 拼 llmMessages」。同一语义两处实现必然漂移
 *    —— 本项目已因这个模式栽过多次（`MESSAGE_LIST_COLS`、空转判据、允许根）。
 *
 * ② **压缩落库（本方案要修的核心缺口）**：此前压缩结果只赋回**局部变量**
 *    `messagesToSend`，不落库 → 下一步 `loadMessages` 又是全量 → 又超阈值 → 又压缩。
 *    `SummaryCache` 只挡住了"重发 LLM 摘要请求"，**历史从未真正变短**（每步仍 O(n)）。
 *    现在压缩经 `onCompressed` 落 `message_summary` 表 → 下一步读到「摘要 + 增量」。
 *    对齐 OpenHands 把 `Condensation` 写回事件日志 / Claude Code 的 `compact_boundary`。
 *
 * ③ **子智能体隔离**：`loadMessages` 只按 conversation_id 过滤，而子智能体消息与主会话
 *    **共用同一 conversation_id**（靠 `parent_tool_call_id` 区分）→ 子智能体的每一步都会
 *    混进主上下文。子智能体存在的全部意义就是上下文隔离（Claude Code：subagent 只回传
 *    最终结果）→ 必须显式剔除。
 * ═══════════════════════════════════════════════════════════════════════════
 */
import type { Message, Model } from '@yan-zhi/shared';
import { effectiveContextLimit, MAX_SESSION_MESSAGES } from '@yan-zhi/shared';
import { ContextWindow, enforceBudget, isCoveredPrefix, isSyntheticMessageId, capStaleToolResults, type SummaryCache } from '@yan-zhi/core';
import { getLatestMessageSummary, insertMessageSummary } from '../db.js';
// constants.ts 是**零依赖模块**（它自己的注释就写明"必须能被任意模块安全引入"），
// 因此这里直接静态引用，不需要延迟注入 —— 窗口解析口径必须只有一处。
import { resolveContextWindow, SAFE_CONTEXT_WINDOW } from '../constants.js';

/** 合成摘要消息的固定 id：**不属于 `message` 表**，前缀比对时必须剔除 */
export const SYNTHETIC_SUMMARY_ID = '__summary__';

/**
 * 只保留「本智能体主线」的消息：**剔除子智能体消息**（按 parent_tool_call_id）。
 *
 * ★ 与 core 的 `visibleMessages` 同一判据，但作用在 DB 行形态上（`rowToMsg` 产出 camelCase，
 *   而两种键在历史包袱里都存在）→ 两个键**同时判**，不给静默失效留口子。
 *   刻意不引 core：这是热路径，判据只有一行，不值得跨包多一跳。
 */
export function mainlineMessages(messages: Message[]): Message[] {
  return messages.filter((m) => {
    const any = m as any;
    return !(any.parentToolCallId ?? any.parent_tool_call_id);
  });
}

/**
 * 「有效窗口」—— 标称窗口里**能真正用好**的那部分（不带输出预留）。
 *
 * ★★★ 这是**唯一一处**把「有效比例折扣」作用到窗口上的地方（`buildContextView` 调它）。
 *
 * ★★★ 为什么「标称 ≠ 可用」（本模块的存在理由）：
 *   用户原话：「很多大模型号称支持 1M，但上下文过多后效果就不好了，最优的上下文就是 258K」。
 *   这个判断有实证支撑（详见 `@yan-zhi/shared/utils/context-policy.ts` 的出处）：
 *   · Chroma Context Rot（18 个前沿模型全部退化，单靠长度掉 7.9%，中段位置掉 30+ 点）
 *     → 生产建议按标称窗口的 **25–30%** 设预算；
 *   · RULER：需要多步推理时有效窗口只有标称的 50–65%；
 *   · 社区甜点区：GPT-4.1 / Llama 4 long 均 ≈ **256K**，LongCodeBench 显示多数模型
 *     **256K 之后编程能力已崩** —— 与用户说的 258K 完全吻合。
 *   此前按 `resolveContextWindow(cw)`（标称值，1M 模型 = 1M）算，等于假设
 *   "能塞 1M 就能用好 1M" —— 恰恰是被上述研究证伪的那个假设。
 *   现在：`标称 × 25%`（带 16K 下限）→ 1M 模型落在 ~256K，正对甜点区。
 *
 * ★ 与 `resolveContextWindow` 的分工（三层，别混）：
 *   ① `resolveContextWindow`  = "窗口到底多大"（含未声明时 32K 保守兜底）；
 *   ② `effectiveContextLimit` = "其中多少能真正用好"（有效性折扣，定义在 shared）；
 *   ③ 本函数                  = 把 ① 喂给 ② 并**处理 sentinel 语义**（见下）。
 *
 * ⚠️ 两层折扣**绝不能叠加**（2026-10-02 实测踩到）：
 *   `resolveContextWindow(1M)` 会把"等于建库默认值"的 1M 判为**不可信** → 退回 32K；
 *   若再乘 25% 就变成 8K → 可用区只剩 4K → **压缩触发得离谱地早**（双重保守）。
 *   ⇒ 只有在"声明值被信任"时才叠加有效性折扣；已退回 SAFE 兜底时，说明我们本就按小窗口算了，
 *     该值**本身就是**有效值。
 *   ★ 这与 `resolveContextWindow` 用的是同一套 sentinel 语义（它内部也按 `=== 默认值` 判不可信），
 *     不是新引入的隐式约定。
 */
export function effectiveWindowOf(contextWindow: unknown): number {
  const declared = resolveContextWindow(contextWindow);
  // 已退回 SAFE 兜底 → 本就在按小窗口保守估算，该值本身就是有效值（不再叠折扣，见上方注释）
  return declared === SAFE_CONTEXT_WINDOW ? declared : effectiveContextLimit(declared);
}

/** 输出预留：夹在 4K~16K（给模型留出生成空间，否则"刚压完又超限"） */
export function resolveOutputReserve(maxTokens?: number): number {
  return Math.min(Math.max(Number(maxTokens) || 8192, 4096), 16384);
}

/**
 * 条数闸门：把消息数压到 `MAX_SESSION_MESSAGES` 以内（从最老的成组丢）。
 *
 * ★ 为什么 token 预算之外还要这道闸门：退化不只由 token 数驱动 —— 「很多条很短的调用」
 *   同样会让中段失效（长任务平均 50 次工具调用，而中段调用恰好落在 U 形曲线谷底）。
 *   ★ 成组丢：绝不把 helper(tool_calls) 与其 tool 应答拆开（拆了就是孤儿 tool → 上游 400）。
 */
function enforceMessageCount(messages: Message[], maxCount = MAX_SESSION_MESSAGES): Message[] {
  if (messages.length <= maxCount) return messages;
  let head = 0;
  while (head < messages.length && messages[head].role === 'system') head++;
  let drop = messages.length - maxCount + head;
  // 切点落在 tool 上说明它配对的 assistant 已被丢 → 一并跳过孤儿 tool
  while (drop < messages.length && messages[drop].role === 'tool') drop++;
  return messages.slice(0, head).concat(messages.slice(drop));
}

/** 上下文组装结果（便于测试与审计） */
export interface ContextViewResult {
  /** 真正发给大模型的历史消息（首条可能是「前文摘要」system） */
  messages: Message[];
  /** 本次是否发生了压缩（用于向 UI 报告「此处已压缩」） */
  compacted: boolean;
  /** 被最新摘要覆盖的消息 id（相对原始 message 表的连续前缀；无压缩时为空） */
  coveredIds: string[];
  /** 压缩后的估算 token */
  tokens: number;
}

export interface BuildContextViewOpts {
  conversationId: string;
  userId: string;
  /** 主智能体传"全量（调用方已剔除子智能体）"；子智能体传它自己那条链的消息 */
  rawMessages: Message[];
  model: Model;
  /** 输出预留用的 maxTokens */
  maxTokens?: number;
  keepRecent: number;
  /** 头部保留条数（首轮任务目标不该被摘要吃掉；0 = 历史行为"只留尾部"） */
  keepFirst?: number;
  /** 摘要缓存（跨 step 复用，避免重发全量摘要 LLM 请求） */
  summaryCache: SummaryCache;
  /** 挂摘要模型；不传则只做裁剪 + 降级摘要（无 LLM，测试友好） */
  setSummaryModel?: (cw: ContextWindow) => void;
  beforeCompress?: (toCompress: Message[]) => Promise<void>;
  /** false = 不做落库（子智能体摘要不写 message_summary，避免污染主会话读出） */
  persist?: boolean;
  /**
   * ★ D3-转（2026-10-10）：**强制压缩**（手动入口用）—— 跳过"是否超阈值"的判定。
   *
   * ★ 为什么需要：自动压缩只在超过 `target`（有效窗口，标称×25%）时触发；
   *   而用户有时**明知上下文很满**（想省钱/提速）却没有手段"现在压一下、轻装继续"。
   * ★ 为什么不用另写一份压缩：`ContextWindow.compress()` 本就可直接调用
   *   （不需要 `needsCompression` 先为真）⇒ **走同一条流水线**，
   *   摘要/落库/缓存复用全部不变（另写一份必然漂移）。
   * ★ 安全性：仍受 `hardCap` 兜底与 `enforceBudget` 保护，且 `compress` 内部
   *   在 `cut<=0`（无法保住 tool 配对）时会**原样返回** —— 手动触发不会产出畸形结果。
   */
  forceCompress?: boolean;
}

/**
 * 组装一次请求的历史上下文。
 *
 * 三步（对应 OpenHands 的 `View.from_events()`）：
 *   ① 读：**最新摘要 + 摘要之后的新消息**（而不是每步全量）；
 *   ② 压：超预算才压；结果经 `onCompressed` **落库** → 下一步读到的就是短历史；
 *   ③ 返：把「旧摘要 + 近期原文」按顺序拼好。
 */
export async function buildContextView(opts: BuildContextViewOpts): Promise<ContextViewResult> {
  const {
    conversationId, userId, rawMessages, model,
    keepRecent, keepFirst = 0, summaryCache, setSummaryModel,
    beforeCompress, maxTokens, persist = true, forceCompress = false,
  } = opts;

  // ★★★ 压缩**目标** vs **硬上限**（2026-10-02 修"过度压缩"，两个数别混）：
  //   · target  = 有效窗口（标称 × 25%，1M 模型 → 256K）= **该用多少** → 压缩触发点；
  //   · hardCap = target − 输出预留 = 253952 ≈ 248K = **绝不能超** → 硬兜底阈值。
  //   为什么不能直接用 hardCap 当触发点：`ContextWindow` 内部**不再**乘估算余量
  //   （见 core 构造器注释 —— 预算路径不叠系数），所以传进去的数就是触发阈值本身。
  //   若再扣一次输出预留，1M 模型会被压到 124K（只用到标称 12%）→ **白扔一半有效窗口**。
  //   ★ 判据：**"该用多少"与"绝不能超"是两个数**；把后者当前者 = 过度保守。
  const target = effectiveWindowOf(model.contextWindow);
  const reserve = resolveOutputReserve(maxTokens);
  // ★★★ 极小窗口防御（2026-10-02 实测踩到）：当 `target ≤ reserve`（如测试用 800 窗口、
  //   或被限流的 2K 端点）时，`target − reserve` 会塌成 0/负数 → hardCap=1 →
  //   `enforceBudget(payload, 1)` 把上下文**清成空**（m0 全丢、tokens=0）。
  //   ⇒ hardCap 设 1024 绝对下限（再小就无法构成一次有效请求）；且**触发点不得低于
  //     hardCap**（threshold < cap 会出现"没触发压缩却被硬降"的倒挂）。
  const hardCap = Math.max(1024, target - reserve);
  const trigger = Math.max(target, hardCap);

  // ── ① 读：最新摘要 + 摘要之后的新消息 ──────────────────────────────────
  let covered: string[] = [];
  let prefixSummary = '';
  if (persist) {
    const last = getLatestMessageSummary(conversationId);
    if (last && last.summary) {
      // 失效判定：摘要覆盖的消息必须仍**逐项顺序存在**（严格前缀比对，i 从 0 起）。
      // ★ 绝不能只看长度 —— 消息被编辑/删除后长度可能不变，但那已是另一段历史，
      //   复用旧摘要会把错误的"前情"喂给模型（与 summaryCache.isPrefix 同一判据）。
      // ★★★ 判据统一取自 core 的 `isCoveredPrefix`（2026-10-03 修根因）：
      //   写侧 `coveredIdsForCompression` 从**会话首条**起连续产出覆盖段，
      //   读侧这里从**会话首条**起逐项校验 —— 两端共用同一函数，不可能再错位。
      //   旧实现读侧手写 `every((id,i)=>ids[i]===id)`，与写侧（曾跳过 keepFirst 头部）
      //   是两套坐标 → 第 0 条即 mismatch → 摘要每轮判废、每步重算全量（实测 25s+/步）。
      if (isCoveredPrefix(last.messageIds, rawMessages.map((m) => m.id))) {
        covered = last.messageIds;
        prefixSummary = last.summary;
      }
    }
  }
  const baseMessages = covered.length ? rawMessages.slice(covered.length) : rawMessages;

  // ── ② 压：超预算才压；旧摘要作为**一条合成消息**参与压缩 ────────────────
  //   ★★★ 关键：压缩是**增量**的 —— 本次只对"上条摘要之后的新消息"做摘要。
  //     若新摘要不吸收旧摘要，信息就丢了（旧摘要行仍在库里，但读取只认**最新**一条）。
  //     把旧摘要作为一条 system 消息前置，压缩自然把它一起摘要进去 → **无损累积**。
  //     等价于 OpenHands 把 Condensation 串成链条、Claude Code 在摘要中保留前文要点。
  const head: Message[] = prefixSummary
    ? [{ id: SYNTHETIC_SUMMARY_ID, conversationId, role: 'system', content: `前文摘要：${prefixSummary}`, createdAt: 0 } as Message]
    : [];
  let payload: Message[] = [...head, ...baseMessages];

  // ── ②' 常态裁剪：把「保留窗口之外」的老工具结果压到 8KB（D4，2026-10-09）─────
  //   ★ 此前 `capLongText` **只在 compress 内部**被调（即"只有超阈值才裁"）→ 低于阈值时，
  //     `python_exec` 的长 stdout / `file_read` 的长文件 / 长正文**全量进上下文**，
  //     逐条推高 token、更早撞阈值，更早被迫走"丢前文换摘要"这条**有损**路径。
  //   ★ 提升为**每步常态**：只改 content 长度、不动消息结构 ⇒ tool 配对不可能被破坏；
  //     幂等；且**只裁保留窗口之外**（最近 keepRecent 条保原文，避免"刚读到就没了"）。
  //   ★ 放在压缩判定**之前**：先温和裁剪，若已降到阈值下就**不必走整段摘要**（保住全部对话结构）。
  payload = capStaleToolResults(payload, keepRecent);

  const cw = ContextWindow.forBudget(trigger, keepRecent, keepFirst);
  if (setSummaryModel) setSummaryModel(cw);

  let compacted = false;
  let mergedCovered = covered;
  // ★ D3-转（2026-10-10）：`forceCompress`（手动入口）→ **跳过阈值判定**直接压。
  //   自动路径行为完全不变（仍按 `needsCompression`）。
  if (forceCompress || cw.needsCompression(payload)) {
    payload = await cw.compress(payload, {
      summaryCache,
      beforeCompress,
      onCompressed: persist
        ? async ({ coveredIds: ids, summary, tokens }) => {
            // messageIds 必须是**相对原始 message 表**的连续前缀 = 旧覆盖段 + 新覆盖段。
            // 合成消息（`summary` / `__summary__` / `sys`，全部由 core 的
            // `isSyntheticMessageId` 判定）不落库，必须剔除，
            // 否则下一步前缀比对会因这个凭空多出的 id 而整段失效。
            // ★★★ 用 core 的统一判据而非手写白名单（2026-10-03）：
            //   旧写法只过滤 `'__summary__'`，而 core 压缩产出的合成 id 是 `'summary'`
            //   —— 恰好是漏掉的那个，等于过滤形同虚设。
            mergedCovered = [...covered, ...ids.filter((x) => !isSyntheticMessageId(x))];
            insertMessageSummary({ conversationId, userId, messageIds: mergedCovered, summary, tokens });
          }
        : undefined,
    });
    compacted = true;
  }

  // ── ③ 兜底：仍超限则硬降 ───────────────────────────────────────────────
  //   ★ 为什么需要（对齐 Roo Code 的「压缩后仍超限 → 强制滑动窗口」）：
  //     compress 在三种情况下会**原样返回**（`cut<=0` / 无法保住 tool 配对 / 摘要降级后仍长），
  //     此时若不再兜一层，整段历史会直接怼给上游 → 超窗口报 400。
  //     `enforceBudget` 两级降：最长工具输出先替换成占位符，再从最老的成组丢弃。
  //   ★ 触发概率极低（正常情况下摘要已足够），但**正是它把"偶发 400"变成"不 400"**。
  const budgetHardCap = hardCap;
  if (cw.tokenCount(payload) > budgetHardCap) {
    payload = enforceBudget(payload, budgetHardCap);
    compacted = true;
  }
  // 条数闸门（第二道）：token 没超但"条数很多"同样会让中段失效，一并收口
  const beforeCount = payload.length;
  payload = enforceMessageCount(payload);
  if (payload.length < beforeCount) compacted = true;

  return { messages: payload, compacted, coveredIds: mergedCovered, tokens: cw.tokenCount(payload) };
}
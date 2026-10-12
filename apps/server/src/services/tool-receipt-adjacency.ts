/**
 * tool 回执与组头的**相邻性判定** —— 纯逻辑（2026-10-12）。
 *
 * ★★★ 为什么单独成模块（而非留在 llm-task-manager.ts）：
 *   项目约定「纯逻辑必须抽独立模块才可单测」—— `llm-task-manager.ts` 拖着重依赖
 *   （db / express / executors），单测里引不动。本函数是判据，抽出来才能钉住回归。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 背景（会话 f0a901e3 实锤上游 400 `messages 参数非法` / code 1214，10:52:21）：
 *   并发 `call_agent`（长耗时子 ReAct）的组头先落库，主循环被「追加消息」推进了新轮次，
 *   子结果 **109 秒后才回来** → 组头（#1183）与回执（#1200）之间夹了 **16 条**
 *   （1 条 user + 8 组完整 assistant/tool 对）→ 违反 OpenAI
 *   「带 tool_calls 的 assistant 之后**必须紧跟**配对 tool 消息」→ 整轮 400 失败。
 *
 * 发送侧最终由 `reorderToolGroups`（packages/core）的**跨距归位**兜住，
 * 但「凭什么会被拉开这么远」此前**零现场证据**，每次都要翻库反推 → 本模块供落库侧告警用。
 * ★ 只发现、只告警：不改库、不改顺序（库内顺序是可查原貌，让位由发送前清洗负责）。
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** 判定所需的**最小消息形态**（从 DB 行映射而来） */
export interface AdjacencyProbe {
  role: string;
  toolCallId?: string | null;
  toolCalls?: Array<{ id?: string }> | null;
}

/**
 * 计算「组头与其回执之间夹了多少条消息」。
 *
 * @param tail 该会话**最近落库的消息**，**旧 → 新**排列（末尾 = 最新）。
 *             （调用方若用 `ORDER BY created_at DESC` 取回，需自行 reverse。）
 * @param toolCallId 本次要落库的回执对应的调用 id
 * @returns
 *   · `-1` —— 找不到组头（异常形态；配对问题另由 orphan 逻辑处理）
 *   · `0`  —— 紧邻（健康：组头就是最后一条）
 *   · `>0` —— 被拉开（需告警）
 */
export function gapBetweenToolHeadAndReceipt(tail: AdjacencyProbe[], toolCallId: string): number {
  if (!toolCallId) return -1;
  // 从最新往回找**最近的**含该 id 的组头
  for (let k = tail.length - 1; k >= 0; k--) {
    const m = tail[k];
    if (m?.role !== 'assistant' || !Array.isArray(m.toolCalls) || m.toolCalls.length === 0) continue;
    if (!m.toolCalls.some((tc) => tc?.id === toolCallId)) continue;
    // 组头在 index k；它之后（更新）的消息条数 = 间隔
    return tail.length - 1 - k;
  }
  return -1;
}

/** 该间隔是否达到「需告警」阈值（>0 即异常：健康的回执应当紧跟组头） */
export function shouldWarnOnGap(gap: number): boolean {
  return gap > 0;
}

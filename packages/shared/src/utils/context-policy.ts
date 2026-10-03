/**
 * 有效上下文策略 —— 「标称窗口 ≠ 可用窗口」的**唯一定义处**（2026-10-02）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么必须有这个模块
 *
 * 用户原话：「好像最优的上下文就是 258K 啊，如果超出了是不是应该有优化策略？现在虽然很多大模型
 *   号称支持 1M 但是上下文过多后效果就不好了」。
 *
 * **这个判断是对的，且有 2025–2026 年的系统性证据**：
 *
 * ① **Context Rot（Chroma，2026）**：测了 18 个前沿模型（含标称 1M 窗口的），
 *    **无一例外**都随长度退化；单靠"长度"就掉 **7.9%**（连干扰内容都去掉也一样）；
 *    相关信息落在 20 篇文档的**第 5–15 位**（中段）时掉 **30+ 个百分点**。
 *    ⇒ 他们的生产建议：**按标称窗口的 25–30% 设定预算**。
 *
 * ② **RULER（NVIDIA，COLM 2024）**：17 个长上下文模型 × 13 类任务，
 *    需要多跳推理/聚合时，**有效上下文普遍只有标称的 50–65%**。
 *
 * ③ **Lost in the Middle（Liu et al.）**：U 形曲线 —— 开头与结尾召回好，中段最差（掉 30%+）。
 *    这个形状**不随窗口变大而消失**（注意力是序列长度的二次方，token 越多关系越被稀释）。
 *
 * ④ **社区实测甜点区（2026）**：GPT-4.1（标称 1M+）≈ **256K**、Llama 4 long（1M–10M）≈ **256K**、
 *    Gemini 2.5 Pro（2M）≈ 500K。**LongCodeBench 更直接：多数模型的编程能力在 256K 之后已经崩了。**
 *    ⇒ 用户说的「258K」正是这一档 —— 对编程/长任务，**256K 就是大窗口模型的实际天花板**。
 *
 * ⑤ **Aider 作者 Aider/Paul Gauthier 的经验值更低**：25–30K 之后模型就开始"犯迷糊"。
 *    ⇒ 说明"能塞多少"与"该塞多少"相差一个数量级。
 *
 * ---
 * ## 本模块的结论（工程化的表述）
 *
 * ```
 * 标称窗口（模型 API 上限）        ← 只用来看"怎么算安全"，从不当作目标
 *   × 25%                          ← 有效占比上限（Chroma 的生产建议；RULER 的 50–65% 是更乐观口径，
 *                                     这里取更保守的 25%，且对 1M 模型正好落在 ~256K，与社区甜点区一致）
 *   = 有效可用预算
 *   − 输出预留（4K~16K）
 *   = 实际装载历史的上限
 * ```
 *
 * ★ 为什么用**比例**而不是硬编码 256K：比例能自动适配小窗口模型（32K 模型不该也按 256K 估），
 *   且对 1M 窗口恰好收敛到用户的直觉值 —— 一个公式同时解释两种情况。
 * ★ 但小窗口别被压得太狠：比例会算出 32K×25% = 8K（太紧），故设 16K 下限兜底。
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 有效上下文占比上限：**实际可用 = 标称窗口 × 该系数**。
 *
 * ★ 取值依据见文件头：Chroma 生产建议 25–30% 的保守端；RULER 的 50–65% 是乐观端，
 *   而"取更保守值"的代价只是多几次压缩（且压缩现在已落库、成本很低），
 *   取乐观值的代价是模型在中段丢事实且**没有任何错误信号** —— 误判成本不对称。
 */
export const EFFECTIVE_CONTEXT_RATIO = 0.25;

/**
 * 有效预算的绝对下限：小窗口模型（32K）按 25% 只有 8K，太紧 → 抬到 16K。
 * ★ 只对 `标称窗口 × 比例 < 16K` 的情况生效；大窗口模型不受影响。
 */
export const EFFECTIVE_CONTEXT_FLOOR = 16384;

/**
 * 单会话消息条数上限（token 预算之外的**第二道**闸门）。
 *
 * ★ 为什么需要：token 数不是唯一退化维度。实测经验（Manus 生产数据）—— 一个复杂任务平均
 *   **50 次工具调用**，而"中间那些调用"恰好落在 U 形曲线的谷底（开头有 primacy bias、
 *   结尾有 recency bias，中段两头不靠）。即使每条都很短，条数一多中段照样失效。
 *   ⇒ 长任务里"很多条短消息"和"少数条长消息"是**两种不同的病**，要两道闸门分别治。
 */
export const MAX_SESSION_MESSAGES = 400;

/**
 * 计算**有效可用预算**（token）：`标称窗口 × 比例`，带小窗口下限。
 *
 * ★ 调用方必须传入**已解析过的**窗口（服务端走 `resolveContextWindow`，含 32K 保守兜底）——
 *   "窗口多大"与"能用多少"是两个不同的判断，本函数只管后者（避免把两件事耦合在一起）。
 */
export function effectiveContextLimit(declaredWindow: number): number {
  const w = Number(declaredWindow);
  if (!Number.isFinite(w) || w <= 0) return EFFECTIVE_CONTEXT_FLOOR;
  const byRatio = Math.floor(w * EFFECTIVE_CONTEXT_RATIO);
  return Math.max(Math.min(w, EFFECTIVE_CONTEXT_FLOOR), Math.min(byRatio, w));
}

/** 用量档位：给 UI 一个统一口径（不要各页面自己拍阈值） */
export type ContextUsageLevel = 'ok' | 'watch' | 'over';

/**
 * 按**有效预算**判定用量档位（而不是按标称窗口 —— 那会让人以为还剩很多）。
 * @param usedTokens 当前上下文估算 token
 * @param declaredWindow 标称窗口
 */
export function contextUsageLevel(usedTokens: number, declaredWindow: number): ContextUsageLevel {
  const limit = effectiveContextLimit(declaredWindow);
  if (!Number.isFinite(usedTokens) || usedTokens <= 0) return 'ok';
  const pct = usedTokens / limit;
  if (pct >= 1) return 'over';
  if (pct >= 0.8) return 'watch';
  return 'ok';
}

/** 用量百分比（相对**有效预算**，0–100，封顶 100） */
export function contextUsagePercent(usedTokens: number, declaredWindow: number): number {
  const limit = effectiveContextLimit(declaredWindow);
  if (!Number.isFinite(usedTokens) || usedTokens <= 0 || limit <= 0) return 0;
  return Math.min(100, Math.round((usedTokens / limit) * 100));
}
/**
 * 服务端全局常量（零依赖模块）。
 *
 * 为什么要单独一个文件：常量必须能被任意模块安全引入。
 * 之前 DEFAULT_CONTEXT_WINDOW 挂在 agens-platform/service.ts 下，而该模块顶层
 * `import { db }` → 纯逻辑模块（如 mcp/search-backend.ts）一旦引用常量就会连带
 * 加载 better-sqlite3 原生模块，在测试环境（无 ABI 匹配的 .node）直接炸。
 *
 * 前端对应口径：packages/ui/src/utils/context-window.ts 的 DEFAULT_CONTEXT_WINDOW，两处必须同值。
 */

/** 新建/读取模型时的默认上下文窗口：1M（token 数） */
export const DEFAULT_CONTEXT_WINDOW = 1048576;

/**
 * 「实际可用上下文窗口」的保守下限：32K。
 *
 * ★★★ 为什么需要（2026-09-29）：压缩触发阈值 = 上下文窗口 × 0.5（见 `COMPRESS_TRIGGER_RATIO`）。
 *   若模型/平台未声明 `contextWindow`，此前会兜底成 `DEFAULT_CONTEXT_WINDOW`（1M）
 *   → 阈值 = 52 万 → **等价于关掉压缩**，长任务一路膨胀到上游报 400。
 *   真实世界里绝大多数未声明窗口的模型（含各种中转网关、自建端点）都在 8K~128K，
 *   按 1M 估算是**乐观偏差**；这里取 32K 作为保守估计 —— 宁可早压缩，不可超限失败。
 *
 * ★ 与 `DEFAULT_CONTEXT_WINDOW` 的分工（别混用）：
 *   · `DEFAULT_CONTEXT_WINDOW` = **建库默认值**（用户没填时写进 model 表的值，可以是 1M）；
 *   · `SAFE_CONTEXT_WINDOW`   = **压缩阈值估算用**（拿不到可信窗口时的保守假设）。
 *   两者语义不同：前者是"用户没配置，先假设它很大"，后者是"我不知道有多大，按小的算"。
 */
export const SAFE_CONTEXT_WINDOW = 32768;

/**
 * 解析「用于压缩阈值估算的上下文窗口」。
 *
 * 取值优先级：显式声明且**合理**的窗口 > SAFE_CONTEXT_WINDOW。
 * 「合理」判据（两条任一命中即视为不可信 → 退回保守值）：
 *   ① 非法（NaN / <= 0 / 非数字）；
 *   ② **恰好等于建库默认值 1M** —— 这几乎必然意味着"用户根本没填，是我们写进去的默认值"，
 *      而不是"这个模型真的有 1M 窗口"（真有 1M 的模型用户会主动声明，且值往往不是这个整数）。
 * ★ 为什么敢按"等于默认值"就判不可信：这是**误判成本不对称**的选择 ——
 *   判错（其实是真 1M）只是压缩得早一点，功能不受影响；
 *   判对（其实是没填）则避免了"压缩永不触发 → 长任务 400"。
 */
export function resolveContextWindow(declared: unknown): number {
  const n = typeof declared === 'number' ? declared : Number(declared);
  if (!Number.isFinite(n) || n <= 0) return SAFE_CONTEXT_WINDOW;
  if (n === DEFAULT_CONTEXT_WINDOW) return SAFE_CONTEXT_WINDOW;
  return n;
}

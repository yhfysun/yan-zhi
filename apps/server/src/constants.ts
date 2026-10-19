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

/**
 * 智能体（agent）默认采样参数 —— 定义已**下沉到 `@yan-zhi/shared`**（前端也要用同一份）。
 *
 * ★★★ 为什么下沉（2026-10-10 实据事故）：
 *   `maxTokens` 此前散落 **7 处**硬编码（server: db.ts 表定义 / routes/agents.ts /
 *   routes/marketplace.ts / index.ts 迁移；ui: stores/agent.ts 4 处）——
 *   改一处忘一处，直接导致「源码 65536、库里表定义仍是 2048」的口径撕裂：
 *     · 旧库 `agent` 表定义是 `max_tokens INTEGER DEFAULT 2048`；
 *     · `CREATE TABLE IF NOT EXISTS` **不会修改已存在的表** → 表默认永远是 2048；
 *     · 内置 agent seed 的 INSERT **不写 max_tokens** → 拿表默认 → 新种子 agent 又变回 2048；
 *     · `deepseek-flash` 是**推理模型**（实测光"只输出数字"就吐 1311 字 reasoning）
 *       → 2048 被 reasoning 占满 → `content` 恒空 + `finish_reason='length'`
 *       → 用户只看到「助手未返回有效内容」，真因却是"输出预算被思考吃光"。
 *   ⇒ 这里**重导出** shared 的定义，保持 server 侧既有 import 路径不变（零迁移成本）。
 *   与 `DEFAULT_CONTEXT_WINDOW` 的两处同值约定相比，这里是更强的一步：**同一份定义**。
 */
export { DEFAULT_AGENT_PARAMS, LEGACY_AGENT_MAX_TOKENS } from '@yan-zhi/shared';

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
 * 取值优先级：正数 → 原样采用（**包括 1M**；2026-10-19 用户拍板：默认就是真 1M）；
 * 非法/缺失（NULL 才是"未声明"·D7 约定）→ SAFE_CONTEXT_WINDOW。
 *
 * ★ 判据变更史（别回退）：
 *   旧实现把"恰好等于建库默认值 1M"判为"用户没填"→ 32K，理由是当时拉模型会**一律**写 1M，
 *   "没填"与"真 1M"同形。D7 已把两条写入路径改为"未填存 NULL"、拉模型改为按家族推断，
 *   同形问题不再存在；继续把 1M 判不可信会让真 1M 模型（实测生产库含 glm-5.3-prime /
 *   deepseek-v4.1-flash 等）全部被按 32K 估 → 长任务反复压缩丢结果。
 *   ⇒ 现在：NULL/非法 = 未声明（32K 保守兜底）；任何正数（含 1048576）= 可信声明值。
 */
export function resolveContextWindow(declared: unknown): number {
  const n = typeof declared === 'number' ? declared : Number(declared);
  if (!Number.isFinite(n) || n <= 0) return SAFE_CONTEXT_WINDOW;
  return n;
}

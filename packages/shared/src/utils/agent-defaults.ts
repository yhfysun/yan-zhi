/**
 * 智能体（agent）默认采样参数 —— **前后端共用的单一真相源**。
 *
 * ★★★ 为什么必须收敛到一处（2026-10-10 实据事故）：
 *   `maxTokens` 此前散落 **7 处**硬编码（server: db.ts 表定义 / routes/agents.ts /
 *   routes/marketplace.ts / index.ts 迁移；ui: stores/agent.ts 4 处）——
 *   改一处忘一处，直接导致「**源码 65536、库里表定义仍是 2048**」的口径撕裂：
 *     · 旧库 `agent` 表定义是 `max_tokens INTEGER DEFAULT 2048`；
 *     · `CREATE TABLE IF NOT EXISTS` **不会修改已存在的表** → 表默认永远是 2048；
 *     · 内置 agent seed 的 INSERT **不写 max_tokens** → 拿表默认 → 新种子 agent 又变回 2048；
 *     · `deepseek-flash` 是**推理模型**（实测光"只输出数字"就吐 1311 字 reasoning）
 *       → 2048 被 reasoning 占满 → `content` 恒空 + `finish_reason='length'`
 *       → 用户只看到「助手未返回有效内容」，真因却是"输出预算被思考吃光"。
 *   ⇒ 任何地方需要"智能体默认参数"，都必须引这里，**不得再硬编码**。
 *
 * ★ 为什么放 shared 而不是 server/constants.ts：
 *   前端 `stores/agent.ts` 也需要同口径的默认值（新建表单初值 / 读取兜底）。
 *   两处各写一份必然漂移（本项目已有多次"平行实现行为漂移"教训），故下沉到共享包。
 *   与 `DEFAULT_CONTEXT_WINDOW`（ui/utils/context-window.ts + server/constants.ts 两处同值）
 *   的旧约定相比，这里是**更强的一步**：直接同一份定义。
 */
export const DEFAULT_AGENT_PARAMS = {
  /** 采样温度 */
  temperature: 0.7,
  /**
   * 单次输出上限（token）。
   * ★ 取 65536（而非历史默认 2048）—— 推理模型（deepseek 系 / o 系 / R1 等）的
   *   reasoning 与 content **共享**这同一份预算，2048 会被思考吃光导致正文为空。
   *   实测一次"详细执行计划"消耗 7734 token（仅占 65536 的 12%），余量充足。
   */
  maxTokens: 65536,
  /** 核采样 */
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
} as const;

/**
 * 历史遗留的 max_tokens 旧默认值。
 * ★ 仅用于**识别并升级**停在旧值的行（server 启动时的幂等兜底迁移），
 *   **不得**当作默认值使用。
 */
export const LEGACY_AGENT_MAX_TOKENS = 2048;

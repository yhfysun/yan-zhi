/**
 * 费用账本（2026-10-17）—— 会话累计 + 逐次明细的**唯一写入口**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 两条铁律
 *
 * ① **累加必须是原子的**（`INSERT ... ON CONFLICT DO UPDATE SET cost = cost + excluded.cost`）。
 *    不要"先读再写"：多端/多任务并发操作同一会话时会**丢账**。
 *    丢账的表现是"金额偶尔变少"，极难复现。
 *
 * ② **判定读库，不读内存**。见 `conversation_usage` 建表注释：内存累计会在进程重启后归零，
 *    让阈值被绕过。本模块提供 `getConversationUsage()` 作为判定的**唯一事实来源**。
 *
 * ---
 * ## 明细表 `usage_event` 为什么要有 `price_snapshot_json`
 *
 * 平台/模型被删、或用户改了单价之后，历史费用就**无法解释**了
 * （"为什么这条调用是 ¥0.8？现在这个模型明明是 ¥0.2"）。
 * 每次调用把**当时的单价快照**存下来，历史才经得起追问。
 */

import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import {
  UPSERT_CONVERSATION_USAGE,
  INSERT_USAGE_EVENT,
  UPDATE_NOTICE_STATE,
} from '../usage-ledger-sql.js';
import {
  addUsageDetail,
  emptyUsageDetail,
  normalizePricing,
  computeCost,
  resolvePresetPricing,
  maybeNoticeCost,
  DEFAULT_COST_BUDGET,
  type TokenUsageDetail,
  type ModelPricing,
  type CostBudgetConfig,
  type CostNoticeState,
} from '@yan-zhi/shared';

/** 明细里的调用来源（与方案 §3.1 口径一致） */
export type UsageSource = 'main' | 'sub_agent' | 'summary' | 'judge' | 'probe';

/** 计费种类：`token` 走单价；`image`/`video` 按次（**当前一律计入 unpriced**） */
export type UsageKind = 'token' | 'image' | 'video';

export interface RecordUsageInput {
  conversationId: string;
  taskId?: string;
  userId?: string;
  platformId?: string;
  modelId?: string;
  source: UsageSource;
  kind?: UsageKind;
  units?: number;
  detail?: TokenUsageDetail;
  pricing?: ModelPricing | undefined;
  /** 汇率（美元平台用）；不传走默认 */
  usdToCny?: number;
  estimated?: boolean;
}

export interface ConversationUsage {
  conversationId: string;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  costCny: number;
  unpricedCalls: number;
  costNoticedUnits: number;
  costWarnedAt: number;
}

/**
 * 解析模型单价 —— **唯一实现**（用户配置优先，否则内置参考价）。
 *
 * ★ 为什么内置价必须存在：计价对"未配价"的处置是 `unpriced:true, cny=0`。
 *   若只有用户配置而没有内置价 ⇒ 所有模型都是"未知" ⇒ **费用恒 ¥0 ⇒ 阈值永不触发**。
 */
export function resolveModelPricing(modelId: string, rawPricing?: unknown): ModelPricing | undefined {
  const manual = normalizePricing(rawPricing);
  if (manual && manual.configured) return manual;
  const preset = resolvePresetPricing(modelId);
  return preset?.pricing;
}

/**
 * 记一次调用。
 *
 * ★ 调用方**只在一次调用结束后调用一次**：流式路径里 `usage` 会在多个 chunk 重复出现，
 *   在循环里逐 chunk 记会**重复计费**（金额翻倍且不报错）。
 */
export function recordUsage(input: RecordUsageInput): { costCny: number; unpriced: boolean } {
  const detail = input.detail || emptyUsageDetail(true);
  const kind = input.kind || 'token';
  let costCny = 0;
  let unpriced = false;

  if (kind === 'token') {
    const r = computeCost(detail, input.pricing, { usdToCny: input.usdToCny });
    costCny = r.cny;
    unpriced = r.unpriced;
  } else {
    // ★ 生图/生视频按次计费，当前没有单价模型 ⇒ **一律计入 unpriced**，
    //   绝不能当 ¥0 —— 静默记 0 会让用户以为不要钱。
    unpriced = true;
  }

  const now = Date.now();
  const id = randomUUID();

  db.prepare(INSERT_USAGE_EVENT).run(
    id,
    input.conversationId,
    input.taskId || null,
    input.userId || 'guest',
    input.platformId || null,
    input.modelId || null,
    input.source,
    kind,
    kind === 'token' ? null : (input.units ?? null),
    detail.inputTokens || 0,
    detail.cacheReadTokens || 0,
    detail.cacheWriteTokens || 0,
    detail.outputTokens || 0,
    costCny,
    input.pricing ? JSON.stringify(input.pricing) : null,
    input.estimated || detail.estimated ? 1 : 0,
    now,
  );

  // ★ 原子累加：不读改写（并发安全）
  db.prepare(UPSERT_CONVERSATION_USAGE).run(
    input.conversationId,
    input.userId || 'guest',
    detail.inputTokens || 0,
    detail.cacheReadTokens || 0,
    detail.cacheWriteTokens || 0,
    detail.outputTokens || 0,
    costCny,
    unpriced ? 1 : 0,
    now,
  );

  return { costCny, unpriced };
}

function rowToUsage(row: any): ConversationUsage | undefined {
  if (!row) return undefined;
  return {
    conversationId: row.conversation_id,
    inputTokens: Number(row.input_tokens) || 0,
    cacheReadTokens: Number(row.cache_read_tokens) || 0,
    cacheWriteTokens: Number(row.cache_write_tokens) || 0,
    outputTokens: Number(row.output_tokens) || 0,
    costCny: Number(row.cost_cny) || 0,
    unpricedCalls: Number(row.unpriced_calls) || 0,
    costNoticedUnits: Number(row.cost_noticed_units) || 0,
    costWarnedAt: Number(row.cost_warned_at) || 0,
  };
}

/** 读会话累计（**阈值判定的唯一事实来源**） */
export function getConversationUsage(conversationId: string): ConversationUsage | undefined {
  const row = db.prepare('SELECT * FROM conversation_usage WHERE conversation_id = ?').get(conversationId) as any;
  return rowToUsage(row);
}

/** 读提醒去重状态（落库值；勿放内存） */
export function getNoticeState(conversationId: string): CostNoticeState {
  const u = getConversationUsage(conversationId);
  return { noticedUnits: u?.costNoticedUnits || 0, warned: (u?.costWarnedAt || 0) > 0 };
}

/** 写回提醒去重状态 */
export function saveNoticeState(conversationId: string, next: CostNoticeState): void {
  const now = Date.now();
  db.prepare(UPDATE_NOTICE_STATE).run(conversationId, now, next.noticedUnits, next.warned ? now : 0);
}

/**
 * 判定「本次要不要提醒」并**顺手写回去重状态**。
 *
 * ★ 判定前**现读**配置（与 `liveMaxSteps()` 同口径）：用户在设置里调低阈值应当立即生效，
 *   若把配置在任务创建时快照，用户会以为"改了没反应"。
 */
export function checkAndSaveNotice(
  conversationId: string,
  cfg: CostBudgetConfig | undefined,
): ReturnType<typeof maybeNoticeCost> {
  const used = getConversationUsage(conversationId)?.costCny || 0;
  const state = getNoticeState(conversationId);
  const r = maybeNoticeCost(used, cfg, state);
  // 只有状态真的变了才写库（避免每轮无条件 UPDATE）
  if (r.next.noticedUnits !== state.noticedUnits || r.next.warned !== state.warned) {
    saveNoticeState(conversationId, r.next);
  }
  return r;
}

/** 会话明细（对账 / 报表用） */
export function listUsageEvents(conversationId: string, limit = 200): any[] {
  return db
    .prepare('SELECT * FROM usage_event WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?')
    .all(conversationId, limit) as any[];
}

/** 读取预算配置（`app_config` key `cost_budget`），缺失时给默认值 */
export function getCostBudgetConfig(): CostBudgetConfig {
  try {
    const row = db.prepare("SELECT value FROM app_config WHERE key = 'cost_budget'").get() as any;
    if (row?.value) {
      const v = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      return { ...DEFAULT_COST_BUDGET, ...(v || {}) };
    }
  } catch {
    // 表未建 / JSON 坏 ⇒ 回落默认（默认 hardStopCny=0 ⇒ 永不停，符合 D4）
  }
  return { ...DEFAULT_COST_BUDGET };
}

/** 汇总明细（供"花费构成"展示） */
export function summarizeByModel(conversationId: string): Array<{ label: string; cny: number }> {
  const rows = db
    .prepare(
      `SELECT COALESCE(model_id, '(未知模型)') AS model_id, SUM(COALESCE(cost_cny, 0)) AS cny
       FROM usage_event WHERE conversation_id = ? GROUP BY model_id ORDER BY cny DESC`,
    )
    .all(conversationId) as any[];
  return rows.map((r) => ({ label: String(r.model_id), cny: Number(r.cny) || 0 }));
}

/** 按来源汇总（主循环 / 子智能体 / 总结 / 自评 —— 对账时能看出钱花在哪一环） */
export function summarizeBySource(conversationId: string): Array<{ source: string; cny: number; calls: number }> {
  const rows = db
    .prepare(
      `SELECT source, SUM(COALESCE(cost_cny, 0)) AS cny, COUNT(*) AS calls
       FROM usage_event WHERE conversation_id = ? GROUP BY source ORDER BY cny DESC`,
    )
    .all(conversationId) as any[];
  return rows.map((r) => ({ source: String(r.source), cny: Number(r.cny) || 0, calls: Number(r.calls) || 0 }));
}

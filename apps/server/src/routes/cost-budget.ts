/**
 * 费用预算与账单查询（2026-10-17 方案 §3.5.1 / §3.4 的 HTTP 面）。
 *
 * 两个端点：
 *   GET/PUT /api/cost-budget            —— 全局预算配置（设置 → 通用「费用预算」块）
 *   GET /api/cost-budget/conversation/:id/usage —— 会话费用（会话头金额 + 明细弹层）
 *
 * ★ 为什么查询读**库**而不是前端累加事件：刷新页面后事件不重放（任务结束就连不上），
 *   而 conversation_usage 是每次调用原子累加的 ⇒ 刷新后金额不丢（验收标准 9）。
 *   运行中由 task:cost 事件做增量刷新，两者不冲突（事件值本身就是库累计）。
 */
import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  getCostBudgetConfig, getConversationUsage, summarizeByModel, summarizeBySource, listUsageEvents,
} from '../services/usage-ledger.js';
import { db } from '../db.js';
import type { CostBudgetConfig } from '@yan-zhi/shared';

const router = Router();
router.use(authMiddleware);

/** 配置清洗：**只认白名单字段**，坏值回落默认（绝不把 NaN 写进 app_config） */
function sanitizeConfig(input: unknown): CostBudgetConfig {
  const d = getCostBudgetConfig();
  const v = (input ?? {}) as Record<string, unknown>;
  const num = (x: unknown, fallback: number, min: number, max: number): number => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : d.enabled,
    limitCny: num(v.limitCny, d.limitCny, 0, 1e9), // 0 = 关闭提醒（仍统计）
    warnRatio: num(v.warnRatio, d.warnRatio, 0.01, 1),
    hardStopCny: num(v.hardStopCny, d.hardStopCny, 0, 1e9), // 0 = 永不停（D4 出厂值）
    usdToCny: num(v.usdToCny, d.usdToCny, 0.01, 1000),
    persistWarningInChat: typeof v.persistWarningInChat === 'boolean' ? v.persistWarningInChat : d.persistWarningInChat,
  };
}

// GET /api/cost-budget —— 当前配置（缺失时回落默认，前端直接渲染）
router.get('/', (_req: Request, res: Response) => {
  res.json({ data: getCostBudgetConfig() });
});

// PUT /api/cost-budget —— 保存（设置页「保存」一步到位；判定前现读，改了下轮即生效）
router.put('/', (req: Request, res: Response) => {
  const cfg = sanitizeConfig(req.body);
  db.prepare(
    'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run('cost_budget', JSON.stringify(cfg), Date.now());
  res.json({ data: cfg });
});

// GET /api/cost-budget/conversation/:id/usage —— 会话费用明细
router.get('/conversation/:id/usage', (req: Request, res: Response) => {
  const convId = String(req.params.id || '');
  const usage = getConversationUsage(convId);
  res.json({
    data: {
      conversationId: convId,
      costCny: usage?.costCny || 0,
      unpricedCalls: usage?.unpricedCalls || 0,
      inputTokens: usage?.inputTokens || 0,
      cacheReadTokens: usage?.cacheReadTokens || 0,
      cacheWriteTokens: usage?.cacheWriteTokens || 0,
      outputTokens: usage?.outputTokens || 0,
      byModel: summarizeByModel(convId),
      bySource: summarizeBySource(convId),
      recent: listUsageEvents(convId, 20).map((r) => ({
        id: r.id,
        modelId: r.model_id,
        source: r.source,
        kind: r.kind,
        costCny: Number(r.cost_cny) || 0,
        estimated: !!r.estimated,
        createdAt: r.created_at,
      })),
      notice: { noticedUnits: usage?.costNoticedUnits || 0, warned: (usage?.costWarnedAt || 0) > 0 },
    },
  });
});

export default router;

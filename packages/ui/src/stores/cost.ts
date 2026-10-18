import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { CostBudgetConfig } from '@yan-zhi/shared';
import { api } from '../api/client';

/**
 * 费用账本的 UI 侧状态（2026-10-17 方案 §3.4 / §3.5 / §3.7）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ 数据口径：**库为准，事件为增量刷新**。
 *   打开会话时 `loadUsage()` 拉一次库累计（刷新页面金额不丢 —— 验收 9）；
 *   任务运行中后端每轮 emit `task:cost`（同一份库累计）做实时刷新。
 *   两者不冲突：事件里的 usedCny 本身就是库累计值，不是前端自己累加的。
 *
 * ★ 提醒（`task:cost_notice`）**只进本 store，不进消息流**：
 *   落进消息会进上下文 ⇒ 后续每轮输入都多带这段 ⇒ 提醒自身在推高它提醒的数字（坑 #15）。
 */

export interface ConvUsage {
  costCny: number;
  unpricedCalls: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  byModel: Array<{ label: string; cny: number }>;
  bySource: Array<{ source: string; cny: number; calls: number }>;
  recent: Array<{ id: string; modelId: string; source: string; costCny: number; estimated: boolean; createdAt: number }>;
  /** 生效的提醒档位（可能是智能体级的更严者，见后端 resolveAgentCostLimit） */
  limitCny: number;
}

export interface CostNotice {
  kind: 'warn' | 'exceeded';
  text: string;
  usedCny: number;
  limitCny: number;
  units: number;
  /** 用户点了「知道了」—— 仅本窗口内不再显示（后端去重档位已落库，刷新后会按需再提醒） */
  dismissed: boolean;
}

const emptyUsage = (): ConvUsage => ({
  costCny: 0, unpricedCalls: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0,
  byModel: [], bySource: [], recent: [], limitCny: 5,
});

export const useCostStore = defineStore('cost', () => {
  const budget = ref<CostBudgetConfig | null>(null);
  const usageByConv = ref<Record<string, ConvUsage>>({});
  const noticesByConv = ref<Record<string, CostNotice>>({});
  const usageLoading = ref<Record<string, boolean>>({});

  // ── 配置（设置 → 通用「费用预算」） ─────────────────────────────────────────

  async function loadBudget(): Promise<void> {
    try {
      const r = await api.get<any>('/cost-budget');
      budget.value = ('data' in r ? r.data : r) as CostBudgetConfig;
    } catch {
      budget.value = null; // 读不到 ⇒ 设置页显示默认值，不阻塞
    }
  }

  async function saveBudget(cfg: Partial<CostBudgetConfig>): Promise<boolean> {
    try {
      const r = await api.put<any>('/cost-budget', cfg);
      budget.value = ('data' in r ? r.data : r) as CostBudgetConfig;
      return true;
    } catch {
      return false;
    }
  }

  // ── 会话账单 ───────────────────────────────────────────────────────────────

  async function loadUsage(convId: string): Promise<void> {
    if (!convId) return;
    usageLoading.value[convId] = true;
    try {
      const r = await api.get<any>(`/cost-budget/conversation/${encodeURIComponent(convId)}/usage`);
      const d = ('data' in r ? r.data : r) as any;
      usageByConv.value[convId] = {
        ...emptyUsage(),
        costCny: Number(d?.costCny) || 0,
        unpricedCalls: Number(d?.unpricedCalls) || 0,
        inputTokens: Number(d?.inputTokens) || 0,
        cacheReadTokens: Number(d?.cacheReadTokens) || 0,
        cacheWriteTokens: Number(d?.cacheWriteTokens) || 0,
        outputTokens: Number(d?.outputTokens) || 0,
        byModel: Array.isArray(d?.byModel) ? d.byModel : [],
        bySource: Array.isArray(d?.bySource) ? d.bySource : [],
        recent: Array.isArray(d?.recent) ? d.recent : [],
        limitCny: Number(d?.notice?.limitCny) || budget.value?.limitCny || 5,
      };
    } catch {
      // 读不到 ⇒ 保持空态（后端不可用时聊天功能不该被账单拖垮）
      if (!usageByConv.value[convId]) usageByConv.value[convId] = emptyUsage();
    } finally {
      usageLoading.value[convId] = false;
    }
  }

  function usageOf(convId: string | undefined): ConvUsage {
    if (!convId) return emptyUsage();
    if (!usageByConv.value[convId]) usageByConv.value[convId] = emptyUsage();
    return usageByConv.value[convId];
  }

  function costOf(convId: string | undefined): number {
    return convId ? usageOf(convId).costCny : 0;
  }

  // ── SSE 事件（chat store 的 switch 转调这两个） ─────────────────────────────

  /** task:cost：每轮增量 + 累计（驱动会话头金额小字） */
  function applyCostEvent(convId: string, ev: { usedCny?: number; limitCny?: number; kind?: string | null }): void {
    const u = usageOf(convId);
    if (Number.isFinite(Number(ev.usedCny))) u.costCny = Number(ev.usedCny);
    if (Number.isFinite(Number(ev.limitCny))) u.limitCny = Number(ev.limitCny);
  }

  /** task:cost_notice：提醒（驱动提示条；**不进消息流**，坑 #15） */
  function applyNoticeEvent(convId: string, ev: { kind?: string; text?: string; usedCny?: number; limitCny?: number; units?: number }): void {
    const u = usageOf(convId);
    if (Number.isFinite(Number(ev.usedCny))) u.costCny = Number(ev.usedCny);
    if (Number.isFinite(Number(ev.limitCny))) u.limitCny = Number(ev.limitCny);
    noticesByConv.value[convId] = {
      kind: ev.kind === 'warn' ? 'warn' : 'exceeded',
      text: String(ev.text || ''),
      usedCny: Number(ev.usedCny) || 0,
      limitCny: Number(ev.limitCny) || u.limitCny,
      units: Number(ev.units) || 0,
      dismissed: false,
    };
  }

  function dismissNotice(convId: string): void {
    const n = noticesByConv.value[convId];
    if (n) n.dismissed = true;
  }

  /** 当前应展示的提醒（未 dismiss 的最近一条；同档位重复提醒会被后端去重，这里只取最新） */
  function activeNotice(convId: string | undefined): CostNotice | null {
    if (!convId) return null;
    const n = noticesByConv.value[convId];
    return n && !n.dismissed ? n : null;
  }

  /** 切会话时清掉旧会话的提醒展示态（数据保留，回切还能看到） */
  function resetNoticeView(convId: string): void {
    const n = noticesByConv.value[convId];
    if (n) n.dismissed = false;
  }

  return {
    budget, usageByConv, noticesByConv, usageLoading,
    loadBudget, saveBudget,
    loadUsage, usageOf, costOf,
    applyCostEvent, applyNoticeEvent, dismissNotice, activeNotice, resetNoticeView,
  };
});

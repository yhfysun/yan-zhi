import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * cost store 的行为测试（2026-10-18）。
 *
 * ★ 钉的是三条**会真实咬人**的判据：
 *   ① 打开会话从**库**拉金额（刷新不丢，验收 9）—— 不是前端自己累加事件；
 *   ② task:cost / task:cost_notice 只改 store，**不产生消息**（坑 #15：提醒进上下文会自我推高成本）；
 *   ③ 提醒 dismiss 仅本窗口（后端档位去重已落库，刷新后按需再提醒）。
 */

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));
vi.mock('../api/client', () => ({
  api: {
    get: apiMocks.get,
    put: apiMocks.put,
  },
}));

import { useCostStore } from './cost';

beforeEach(() => {
  setActivePinia(createPinia());
  apiMocks.get.mockReset();
  apiMocks.put.mockReset();
});

describe('loadUsage：读库（刷新后金额不丢的地基）', () => {
  it('把后端 usage 响应铺进 store（含按模型/按来源/明细）', async () => {
    apiMocks.get.mockResolvedValue({
      data: {
        conversationId: 'c1', costCny: 0.42, unpricedCalls: 2,
        inputTokens: 1000, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200,
        byModel: [{ label: 'deepseek-v4-pro', cny: 0.35 }],
        bySource: [{ source: 'main', cny: 0.3, calls: 5 }],
        recent: [{ id: 'e1', modelId: 'deepseek-v4-pro', source: 'main', costCny: 0.3, estimated: false, createdAt: 1 }],
        notice: { noticedUnits: 0, warned: false },
      },
    });
    const s = useCostStore();
    await s.loadUsage('c1');
    expect(s.costOf('c1')).toBe(0.42);
    const u = s.usageOf('c1');
    expect(u.byModel).toEqual([{ label: 'deepseek-v4-pro', cny: 0.35 }]);
    expect(u.bySource[0].source).toBe('main');
    expect(u.recent.length).toBe(1);
  });

  it('★ 后端不可用 ⇒ 空态兜底（账单读不到不拖垮聊天）', async () => {
    apiMocks.get.mockRejectedValue(new Error('network'));
    const s = useCostStore();
    await s.loadUsage('c1');
    expect(s.costOf('c1')).toBe(0);
  });

  it('未知会话 ⇒ 0（会话头小字不渲染）', () => {
    const s = useCostStore();
    expect(s.costOf('nope')).toBe(0);
  });
});

describe('SSE 事件：只进 store，不产生消息', () => {
  it('task:cost 更新累计与档位', () => {
    const s = useCostStore();
    s.applyCostEvent('c1', { usedCny: 1.23, limitCny: 5, kind: null });
    expect(s.costOf('c1')).toBe(1.23);
    expect(s.usageOf('c1').limitCny).toBe(5);
    // 事件**不**碰消息相关状态（本 store 根本没有消息概念）
    expect(s.usageByConv.c1.recent).toEqual([]);
  });

  it('task:cost_notice 生成可展示的提醒（含多行文案原样透传）', () => {
    const s = useCostStore();
    const text = '本会话累计花费约 ¥5.03，已超过你设置的 ¥5.00 —— 任务继续运行，不会自动停止。\n提示：开新会话继续会更省。';
    s.applyNoticeEvent('c1', { kind: 'exceeded', text, usedCny: 5.03, limitCny: 5, units: 1 });
    const n = s.activeNotice('c1');
    expect(n?.kind).toBe('exceeded');
    expect(n?.text).toBe(text);
    expect(n?.usedCny).toBe(5.03);
    // 累计同步（提示条与金额小字同源）
    expect(s.costOf('c1')).toBe(5.03);
  });

  it('★ dismiss 仅本窗口；resetNoticeView 后同一条提醒重新可见', () => {
    const s = useCostStore();
    s.applyNoticeEvent('c1', { kind: 'warn', text: '预警', usedCny: 4, limitCny: 5, units: 0 });
    expect(s.activeNotice('c1')).not.toBeNull();
    s.dismissNotice('c1');
    expect(s.activeNotice('c1')).toBeNull();
    s.resetNoticeView('c1');
    expect(s.activeNotice('c1')?.kind).toBe('warn');
  });

  it('未 dismiss 时只展示最新一条（后端档位去重防刷屏）', () => {
    const s = useCostStore();
    s.applyNoticeEvent('c1', { kind: 'warn', text: '第一笔', usedCny: 4, limitCny: 5, units: 0 });
    s.applyNoticeEvent('c1', { kind: 'exceeded', text: '第二笔', usedCny: 5.2, limitCny: 5, units: 1 });
    expect(s.activeNotice('c1')?.text).toBe('第二笔');
  });
});

describe('预算配置：读与存', () => {
  it('loadBudget 拉取配置', async () => {
    apiMocks.get.mockResolvedValue({ data: { enabled: true, limitCny: 12, warnRatio: 0.9, hardStopCny: 0, usdToCny: 7.2 } });
    const s = useCostStore();
    await s.loadBudget();
    expect(s.budget?.limitCny).toBe(12);
  });

  it('saveBudget PUT 后用响应更新本地', async () => {
    apiMocks.put.mockResolvedValue({ data: { enabled: false, limitCny: 0, warnRatio: 0.8, hardStopCny: 0, usdToCny: 7.1 } });
    const s = useCostStore();
    const ok = await s.saveBudget({ enabled: false, limitCny: 0 });
    expect(ok).toBe(true);
    expect(apiMocks.put).toHaveBeenCalledWith('/cost-budget', { enabled: false, limitCny: 0 });
    expect(s.budget?.enabled).toBe(false);
  });

  it('★ 保存失败返回 false（设置页据此提示重试，不假装成功）', async () => {
    apiMocks.put.mockRejectedValue(new Error('500'));
    const s = useCostStore();
    expect(await s.saveBudget({ limitCny: 3 })).toBe(false);
  });
});

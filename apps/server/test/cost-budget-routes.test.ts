/**
 * 费用预算路由测试（2026-10-18）—— 真 express + 真 temp DB 走完整 HTTP 链路。
 *
 * ★ 为什么必须真跑：`sanitizeConfig` 的钳位逻辑（坏值回落默认）是"写错不报错、
 *   表现为用户设置了 ¥5 却存成 NaN"的典型缺陷形态，静态断言抓不住。
 *   会话账单端点同理：刷新后金额不丢（验收 9）依赖的正是这个端点读**库**。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { db } from '../src/db.js';
import costBudgetRouter from '../src/routes/cost-budget.js';
import { recordUsage } from '../src/services/usage-ledger.js';
import { resolveModelPricing } from '../src/services/usage-ledger.js';

const app = express();
app.use(express.json());
app.use('/api/cost-budget', costBudgetRouter);

let server: Server | null = null;
let base = '';

beforeAll(async () => {
  await new Promise<void>((r) => {
    server = app.listen(0, '127.0.0.1', () => r());
  });
  base = `http://127.0.0.1:${(server!.address() as any).port}/api/cost-budget`;
});

afterAll(async () => {
  await new Promise<void>((r) => server!.close(() => r()));
});

beforeEach(() => {
  db.prepare('DELETE FROM usage_event').run();
  db.prepare('DELETE FROM conversation_usage').run();
  db.prepare("DELETE FROM app_config WHERE key = 'cost_budget'").run();
});

const getJson = async (path: string) => (await fetch(`${base}${path}`)).json();
const putJson = async (path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

describe('GET /api/cost-budget：默认配置', () => {
  it('无 app_config 行 ⇒ 回落默认（limit 5 / warn 0.8 / hardStop 0 = 永不停）', async () => {
    const { data } = await getJson('/');
    expect(data).toMatchObject({ enabled: true, limitCny: 5, warnRatio: 0.8, hardStopCny: 0 });
    expect(data.usdToCny).toBeGreaterThan(0);
  });
});

describe('PUT /api/cost-budget：保存与钳位', () => {
  it('合法值 ⇒ 保存后 GET 读回一致', async () => {
    const { status, json } = await putJson('/', { enabled: true, limitCny: 12.5, warnRatio: 0.9, hardStopCny: 0, usdToCny: 7.2, persistWarningInChat: false });
    expect(status).toBe(200);
    expect(json.data.limitCny).toBe(12.5);
    const { data } = await getJson('/');
    expect(data.limitCny).toBe(12.5);
    expect(data.usdToCny).toBe(7.2);
  });

  it('★ 坏值一律钳位/回落（绝不把 NaN 写进 app_config）', async () => {
    const { json } = await putJson('/', { limitCny: -5, warnRatio: 5, hardStopCny: 'abc', usdToCny: 0, enabled: 'yes' });
    expect(json.data.limitCny, '负档位钳到 0（= 关闭提醒仍统计）').toBe(0);
    expect(json.data.warnRatio, '>1 的预警比例钳到 1').toBe(1);
    expect(json.data.usdToCny, '0 汇率回落默认').toBeGreaterThan(0);
    expect(json.data.enabled, '非布尔回落默认 true').toBe(true);
  });

  it('★ hardStopCny=0 是出厂语义（永不停），保存 0 不被当成"没填"', async () => {
    await putJson('/', { hardStopCny: 0 });
    const { data } = await getJson('/');
    expect(data.hardStopCny).toBe(0);
  });
});

describe('GET /api/cost-budget/conversation/:id/usage：会话账单', () => {
  it('空会话 ⇒ 全 0（前端显示空而不是报错）', async () => {
    const { data } = await getJson('/conversation/c_empty/usage');
    expect(data.costCny).toBe(0);
    expect(data.byModel).toEqual([]);
    expect(data.bySource).toEqual([]);
    expect(data.recent).toEqual([]);
  });

  it('★ 明细之和 == 累计（对账等式），按模型/按来源分组正确', async () => {
    recordUsage({
      conversationId: 'c_bill', source: 'main', platformId: 'p1', modelId: 'deepseek-v4-pro',
      detail: { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      pricing: resolveModelPricing('deepseek-v4-pro', undefined),
    });
    recordUsage({
      conversationId: 'c_bill', source: 'sub_agent', platformId: 'p1', modelId: 'deepseek-v4-flash',
      detail: { inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 50 },
      pricing: resolveModelPricing('deepseek-v4-flash', undefined),
    });
    recordUsage({
      conversationId: 'c_bill', source: 'judge', platformId: 'p1', modelId: 'unknown-xyz',
      detail: { inputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
      pricing: resolveModelPricing('unknown-xyz', undefined),
    });

    const { data } = await getJson('/conversation/c_bill/usage');
    const sum = data.recent.reduce((s: number, r: any) => s + r.costCny, 0);
    expect(data.costCny).toBeCloseTo(sum, 8);
    expect(data.unpricedCalls, 'unknown-xyz 未配价 ⇒ 计数 1').toBe(1);

    const byModel = Object.fromEntries(data.byModel.map((m: any) => [m.label, m.cny]));
    expect(Object.keys(byModel).sort()).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro', 'unknown-xyz']);
    const bySource = Object.fromEntries(data.bySource.map((s: any) => [s.source, s.calls]));
    expect(bySource).toEqual({ main: 1, sub_agent: 1, judge: 1 });

    // 最近明细按时间升序，最多 20 条
    expect(data.recent.length).toBe(3);
    expect(data.recent[0].source).toBe('main');
    expect(data.recent[2].modelId).toBe('unknown-xyz');
  });

  it('★ 刷新场景（验收 9）：端点读库 ⇒ 金额与落库值逐分不差', async () => {
    recordUsage({
      conversationId: 'c_refresh', source: 'main', platformId: 'p1', modelId: 'deepseek-v4-pro',
      detail: { inputTokens: 600, cacheReadTokens: 400, cacheWriteTokens: 0, outputTokens: 200 },
      pricing: resolveModelPricing('deepseek-v4-pro', undefined),
    });
    const first = await getJson('/conversation/c_refresh/usage');
    const second = await getJson('/conversation/c_refresh/usage');
    expect(second.data.costCny).toBe(first.data.costCny);
    expect(second.data.costCny).toBeCloseTo(0.01092, 8);
  });
});

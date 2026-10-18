import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

/**
 * UI 端定价单位落库迁移（坑 #20，2026-10-18）—— **真跑假库**。
 *
 * ★ 为什么必须有这一层：`packages/ui/src/stores/platform.ts` 的离线直连库分支
 *   （`addModel` / `updateModel`）**也是直接写 `model` 表**的。只迁 server 端 ⇒
 *   本端读到的仍是旧「元/千」值，用户一编辑就原样写回 ⇒ 同一条记录两端单位不一致，
 *   金额时大时小 1000 倍、极难复现。
 *
 * ★ 钉的是"真跑了"而不是"写着呢"：这里的断言直接看**假库里的行**有没有被改写。
 */

/** 内存假库：按 SQL 前缀路由，记录所有调用 */
function makeDb(rows: { id: string; platform_id: string; model_id: string; pricing_json: string | null }[]) {
  const calls: string[] = [];
  const config = new Map<string, string>();
  return {
    calls,
    config,
    db: {
      async query<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
        calls.push(sql);
        if (sql.includes('app_config')) {
          const key = String((params || [])[0]);
          return (config.has(key) ? [{ value: config.get(key) }] : []) as any;
        }
        return rows.map((r) => ({ ...r })) as any;
      },
      async exec(sql: string, params?: unknown[]): Promise<void> {
        calls.push(sql);
        if (sql.includes('app_config')) {
          config.set(String((params || [])[0]), String((params || [])[1]));
          return;
        }
        if (/^UPDATE model SET pricing_json/i.test(sql)) {
          const id = String((params || [])[1]);
          const row = rows.find((r) => r.id === id);
          if (row) row.pricing_json = String((params || [])[0]);
        }
      },
      async transaction<T>(fn: () => Promise<T>): Promise<T> { return fn(); },
    },
  };
}

const dbMocks = vi.hoisted(() => ({
  adapter: null as any,
}));

// 离线直连库分支：`useServerApi: false`（线上恒 true，但这条分支存在就必须带迁移）
vi.mock('./auth', () => ({ useAuthStore: () => ({ useServerApi: false }) }));
vi.mock('@yan-zhi/core', () => ({
  getPlatformAdapter: () => dbMocks.adapter,
  LlmClient: class { async chatTest() { return { ok: true, durationMs: 1, msg: '' }; } },
}));
vi.mock('../api/client', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getWithRetry: vi.fn() }));

/**
 * ★ 每个用例都要**全新模块实例**：迁移的「本会话只跑一次」是模块级标志位，
 *   不 resetModules 的话第一个用例跑完，后面的用例全都只是"跳过"（假绿）。
 */
async function freshStore() {
  vi.resetModules();
  setActivePinia(createPinia());
  const mod = await import('./platform');
  return mod.usePlatformStore();
}

function seed() {
  return [
    { id: 'm_old', platform_id: 'p1', model_id: 'old-model', pricing_json: JSON.stringify({ input: 0.002, output: 0.008 }) },
    { id: 'm_done', platform_id: 'p1', model_id: 'done-model', pricing_json: JSON.stringify({ unit: 'per_1m', input: 2, output: 8, configured: true }) },
    { id: 'm_empty', platform_id: 'p1', model_id: 'empty-model', pricing_json: '{}' },
  ];
}

describe('UI 端离线直连库：loadModels 前先迁移定价单位', () => {
  let rows: ReturnType<typeof seed>;
  let fake: ReturnType<typeof makeDb>;

  beforeEach(() => {
    setActivePinia(createPinia());
    rows = seed();
    fake = makeDb(rows);
    dbMocks.adapter = { db: fake.db, keyring: { get: async () => null, set: async () => undefined } };
  });

  it('★ 真改写：0.002 元/千 → 2 元/百万；已 per_1m / 空 {} 不动', async () => {
    const store = await freshStore();
    await store.loadModels();

    expect(JSON.parse(rows[0].pricing_json!).unit).toBe('per_1m');
    expect(JSON.parse(rows[0].pricing_json!).input).toBe(2);
    expect(JSON.parse(rows[0].pricing_json!).output).toBe(8);
    expect(rows[1].pricing_json).toBe(JSON.stringify({ unit: 'per_1m', input: 2, output: 8, configured: true }));
    expect(rows[2].pricing_json).toBe('{}');

    // 读出来的模型也已经是「元/百万」口径（下一步编辑保存就不会把旧单位写回）
    const loaded = store.models.find((m: any) => m.id === 'm_old') as any;
    expect(loaded.pricing.input).toBe(2);
  });

  it('★ 只跑一次：第二次 loadModels 不再扫表（标记位生效 or 会话内只跑一次）', async () => {
    const store = await freshStore();
    await store.loadModels();
    const scanCount = fake.calls.filter((s) => /SELECT id, pricing_json FROM model/i.test(s)).length;
    expect(scanCount).toBe(1);

    await store.loadModels();
    const after = fake.calls.filter((s) => /SELECT id, pricing_json FROM model/i.test(s)).length;
    expect(after).toBe(1); // 标记位落在 app_config 上了 ⇒ 不再重复扫
    expect(fake.config.size).toBe(1);
  });

  it('★ 迁移失败不阻塞读模型（读时 normalizePricing 仍兜底）', async () => {
    // 只让"迁移的扫表"炸，正常读模型仍可用
    dbMocks.adapter = {
      db: {
        async query(sql: string) {
          if (/SELECT id, pricing_json FROM model/i.test(sql)) throw new Error('no such table: app_config');
          return rows.map((r) => ({ ...r })) as any;
        },
        async exec() { throw new Error('boom'); },
        async transaction(fn: any) { return fn(); },
      },
      keyring: { get: async () => null, set: async () => undefined },
    };
    const store = await freshStore();
    await expect(store.loadModels()).resolves.toBeUndefined();
    expect(store.models.length).toBe(3);
    // 库没被改写 —— 这是"最坏情况"：金额仍由读时兜底算对，不会 1000 倍漂移
    expect(JSON.parse(rows[0].pricing_json!).input).toBe(0.002);
  });
});

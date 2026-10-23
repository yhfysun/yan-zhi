// 店铺业务工具 · 行为级测试（2026-10-22 重构 P0）。
//
// 钉住三件事：
//   ① 写工具获批后**真的落库**（不是只回一句"去平台后台执行"）；
//   ② 闸门语义不变：未确认只出变更单、生产缺批准仍拒绝；
//   ③ 本地业务优先：无货源不持库存、库存不足如实失败、订单发货推进状态。
//
// ★ 真 SQL（sql.js 内存库，与 CI 回退路径同源）：判据是 SQL 语义，mock 证明不了行为。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openSqlite } from '../src/services/sqlite-driver.js';
import type { YzSqliteDb } from '../src/services/sqlite-driver.js';
import { __setDbForTest } from '../src/shop/store.js';
import * as store from '../src/shop/store.js';
import { runShopAction } from '../src/shop/actions.js';
import { makeShopTools, __setStorageForTest, type PluginStorage } from '../src/plugins/shop-ops.js';

process.env.YZ_TEST_FORCE_SQLJS = '1';

const DDL = `
  CREATE TABLE IF NOT EXISTS shop_product (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, sku TEXT NOT NULL, title TEXT NOT NULL,
    image_url TEXT, category TEXT, supply_mode TEXT NOT NULL DEFAULT 'stocked', source_ref TEXT,
    cost_cents INTEGER NOT NULL DEFAULT 0, price_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CNY', stock INTEGER NOT NULL DEFAULT 0,
    safety_stock INTEGER NOT NULL DEFAULT 0, listing_status TEXT NOT NULL DEFAULT 'draft',
    attrs_json TEXT DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE(shop_id, sku)
  );
  CREATE TABLE IF NOT EXISTS shop_order (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, order_no TEXT NOT NULL, buyer TEXT,
    amount_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'CNY',
    status TEXT NOT NULL DEFAULT 'pending', items_json TEXT NOT NULL DEFAULT '[]',
    address_json TEXT DEFAULT '{}', attrs_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL, paid_at INTEGER,
    UNIQUE(shop_id, order_no)
  );
  CREATE TABLE IF NOT EXISTS shop_shipment (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, order_id TEXT NOT NULL, carrier TEXT,
    tracking_no TEXT, status TEXT NOT NULL DEFAULT 'pending', shipped_at INTEGER,
    delivered_at INTEGER, note TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shop_stock_move (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, product_id TEXT NOT NULL, kind TEXT NOT NULL,
    qty INTEGER NOT NULL, before_qty INTEGER NOT NULL, after_qty INTEGER NOT NULL,
    reason TEXT, actor TEXT NOT NULL DEFAULT 'human', created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shop_purchase (
    id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, order_id TEXT NOT NULL, product_id TEXT,
    sku TEXT NOT NULL, offer_ref TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1,
    unit_cost_cents INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'planned',
    note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
`;

interface AuditEntry { action?: string; connection?: string; ok?: boolean; note?: string }

let conn: YzSqliteDb;
let auditMap: Map<string, unknown>;

function memStorage(): PluginStorage {
  auditMap = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return auditMap.get(key) as T | undefined; },
    async set(key: string, value: unknown) { auditMap.set(key, value); },
  };
}

const auditOf = (): AuditEntry[] => (auditMap.get('audit') as AuditEntry[]) || [];

/** 建一条店铺连接并注入存储；返回连接 id */
async function withShop(opts: { shopType?: 'demo' | 'test' | 'production'; supplyMode?: 'stocked' | 'dropship'; platform?: string } = {}): Promise<string> {
  const id = 'shop-1';
  const storage = memStorage();
  await storage.set('connections', [{
    id, platform: opts.platform ?? 'amazon', site: 'US', shopName: '测试店',
    tag: opts.shopType === 'production' ? '生产' : '测试',
    shopType: opts.shopType ?? 'demo',
    supplyMode: opts.supplyMode ?? 'stocked',
    secretEnc: '', createdAt: 1,
  }]);
  __setStorageForTest(storage);
  return id;
}

function textOf(r: unknown): string {
  const c = (r as { content?: Array<{ text?: string }> }).content;
  return c?.[0]?.text ?? '';
}

async function run(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = makeShopTools().find((t) => t.name === name);
  expect(tool, `★ 工具 ${name} 不存在`).toBeTruthy();
  return textOf(await tool!.execute(args as never));
}

beforeEach(async () => {
  const opened = await openSqlite(':memory:');
  conn = opened.db;
  conn.exec(DDL);
  __setDbForTest(conn);
});

afterEach(() => {
  __setDbForTest(null);
  __setStorageForTest(null);
  try { conn?.close(); } catch { /* 已关闭 */ }
});

describe('AI 工具 · 本地业务库闭环', () => {
  it('★★ 新建商品：未确认不落库；确认后落库并写审计', async () => {
    const shopId = await withShop();
    const args = { shopName: '测试店', sku: 'SKU-100', title: '测试商品', price: 19.9, cost: 8 };

    const ticket = await run('shop_product_create', args);
    expect(ticket).toContain('新建商品变更单');
    expect(ticket).toContain('未执行');
    expect(store.listProducts(shopId, {})).toHaveLength(0);

    const done = await run('shop_product_create', { ...args, confirmed: true });
    expect(done).toContain('✓ 已批准并已执行');
    const products = store.listProducts(shopId, {});
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe('SKU-100');
    expect(products[0].priceCents).toBe(1990);
    expect(auditOf().some((e) => e.action === 'write.product_create.executed' && e.ok)).toBe(true);
  });

  it('★★ 改价：按 SKU 命中本地库后直接改库并回读', async () => {
    const shopId = await withShop();
    store.createProduct(shopId, {
      sku: 'SKU-001', title: '收纳架', supplyMode: 'stocked', costCents: 800,
      priceCents: 2999, currency: 'USD', stock: 10, safetyStock: 5, listingStatus: 'online',
    });

    const text = await run('shop_price_update', {
      shopName: '测试店', sku: 'SKU-001', currentPrice: 29.99, newPrice: 27.99, reason: '调价', confirmed: true,
    });
    expect(text).toContain('✓ 已批准并已执行');
    expect(store.findProductBySku(shopId, 'SKU-001')?.priceCents).toBe(2799);
  });

  it('★★ 改库存：写库存流水；出库超过库存时如实失败且不改数', async () => {
    const shopId = await withShop();
    const prod = store.createProduct(shopId, {
      sku: 'SKU-002', title: '厨具', supplyMode: 'stocked', costCents: 0,
      priceCents: 1000, currency: 'CNY', stock: 5, safetyStock: 0, listingStatus: 'online',
    });

    const ok = await run('shop_stock_update', {
      shopName: '测试店', sku: 'SKU-002', currentStock: 5, newStock: 2, reason: '盘点', confirmed: true,
    });
    expect(ok).toContain('✓ 已批准并已执行');
    expect(store.getProduct(shopId, prod.id)?.stock).toBe(2);
    expect(store.listStockMoves(shopId, {})).toHaveLength(1);

    const toZero = await run('shop_stock_update', {
      shopName: '测试店', sku: 'SKU-002', currentStock: 2, newStock: 0, reason: '售罄', confirmed: true,
    });
    expect(toZero).toContain('✓ 已批准并已执行');
    expect(store.getProduct(shopId, prod.id)?.stock).toBe(0);

    // 目标与现值一致 = 没有改动，闸门放行但执行如实失败（不假装成功）
    const noop = await run('shop_stock_update', {
      shopName: '测试店', sku: 'SKU-002', currentStock: 0, newStock: 0, reason: '无变化', confirmed: true,
    });
    expect(noop).toContain('执行失败');
    expect(store.getProduct(shopId, prod.id)?.stock).toBe(0);
  });

  it('★★ 无货源商品：改库存被如实拒绝（不持库存）', async () => {
    const shopId = await withShop({ supplyMode: 'dropship' });
    store.createProduct(shopId, {
      sku: 'SKU-D1', title: '无货源商品', supplyMode: 'dropship', sourceRef: 'https://detail.1688.com/x',
      costCents: 500, priceCents: 1999, currency: 'CNY', stock: 0, safetyStock: 0, listingStatus: 'online',
    });
    const text = await run('shop_stock_update', {
      shopName: '测试店', sku: 'SKU-D1', currentStock: 0, newStock: 3, reason: '补货', confirmed: true,
    });
    expect(text).toContain('执行失败');
    expect(text).toContain('不持库存');
  });

  it('★★ 订单发货：写入发货单并推进订单状态', async () => {
    const shopId = await withShop();
    store.createOrder(shopId, {
      orderNo: 'T-1', buyer: '买家A', amountCents: 2999, currency: 'USD', status: 'paid',
      items: [{ sku: 'SKU-001', title: '收纳架', qty: 1, priceCents: 2999 }],
    });
    const text = await run('shop_order_ship', {
      shopName: '测试店', orderNo: 'T-1', carrier: 'sf-express', trackingNo: 'SF123', reason: '正常发货', confirmed: true,
    });
    expect(text).toContain('✓ 已批准并已执行');
    expect(store.findOrderByNo(shopId, 'T-1')?.status).toBe('shipped');
    expect(store.listShipments(shopId, {})).toHaveLength(1);
  });

  it('★ 看板与列表读本地库；生产店铺的写操作仍需额外批准', async () => {
    const shopId = await withShop({ shopType: 'production' });
    store.createProduct(shopId, {
      sku: 'SKU-P', title: '生产品', supplyMode: 'stocked', costCents: 0,
      priceCents: 1000, currency: 'CNY', stock: 1, safetyStock: 2, listingStatus: 'online',
    });
    const dash = await run('shop_dashboard', { shopName: '测试店' });
    expect(dash).toContain('今日订单');
    expect(dash).toContain('SKU-P');

    const denied = await run('shop_price_update', {
      shopName: '测试店', sku: 'SKU-P', currentPrice: 10, newPrice: 9, reason: '促销', confirmed: true,
    });
    expect(denied).toContain('额外人工批准');
    expect(store.findProductBySku(shopId, 'SKU-P')?.priceCents).toBe(1000);
  });

  it('★ 平台后台：演示店铺只返回跳转计划', async () => {
    await withShop({ shopType: 'demo' });
    const text = await run('shop_platform_open', { shopName: '测试店' });
    expect(text).toContain('跳转计划');
    expect(text).toContain('不会真正触达平台');
  });

  it('★ 模拟订单：演示店可造单并直接可发货；生产店铺拒绝且不动库存', async () => {
    const shopId = await withShop({ shopType: 'demo' });
    store.createProduct(shopId, {
      sku: 'SKU-M', title: '模拟品', supplyMode: 'stocked', costCents: 100,
      priceCents: 1000, currency: 'CNY', stock: 7, safetyStock: 0, listingStatus: 'online',
    });
    const ctx = { id: shopId, platform: 'amazon', shopName: '测试店', shopType: 'demo' as const, supplyMode: 'stocked' as const, hasSecret: false };
    const out = await runShopAction(ctx, 'order.mock', { qty: 2, buyer: '模拟买家' }, 'human');
    expect(out.kind).toBe('done');
    const orders = store.listOrders(shopId, {});
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('paid');
    expect(orders[0].amountCents).toBe(2000);
    // 模拟订单不动库存
    expect(store.findProductBySku(shopId, 'SKU-M')?.stock).toBe(7);

    const denied = await runShopAction({ ...ctx, shopType: 'production' }, 'order.mock', {}, 'human');
    expect(denied.kind).toBe('unsupported');
    if (denied.kind === 'unsupported') expect(denied.reason).toContain('生产店铺');
  });

  it('★ 删除商品：级联清理库存流水，并解除采购单的 product_id 关联', async () => {
    const shopId = await withShop();
    const p = store.createProduct(shopId, {
      sku: 'SKU-DEL', title: '待删商品', supplyMode: 'stocked', costCents: 100,
      priceCents: 1000, currency: 'CNY', stock: 0, safetyStock: 0, listingStatus: 'online',
    });
    store.changeStock({ shopId, productId: p.id, kind: 'in', qty: 5, reason: '初始入库', actor: 'human' });
    const purchase = store.createPurchase(shopId, {
      orderId: 'order-x', productId: p.id, sku: p.sku, offerRef: 'https://detail.1688.com/offer/1.html',
      qty: 1, unitCostCents: 100,
    });
    expect(store.listStockMoves(shopId, { productId: p.id })).toHaveLength(1);

    expect(store.deleteProduct(shopId, p.id)).toBe(true);
    expect(store.getProduct(shopId, p.id)).toBeUndefined();
    expect(store.listStockMoves(shopId, { productId: p.id })).toHaveLength(0);
    expect(store.getPurchase(shopId, purchase.id)?.productId).toBeUndefined();
    // 采购单本身保留（历史记录不能丢）
    expect(store.getPurchase(shopId, purchase.id)?.sku).toBe('SKU-DEL');
  });
});

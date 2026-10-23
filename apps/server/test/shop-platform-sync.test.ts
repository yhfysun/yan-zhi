// 本地 ↔ 平台同步 · 行为测试（2026-10-22）。
//
// mock fetch，不请求真实平台。覆盖：
//   ① 平台 → 本地导入商品（SKU upsert + 平台 ID 写入 attrs）
//   ② 本地 → 平台推送价格（用 attrs 的 variantId）
//   ③ 平台 → 本地导入订单（可重复执行不重复插入）
//   ④ 发货回填平台（淘宝 tid/company_code/out_sid）
//   ⑤ 能力不支持/缺平台 ID 时如实失败并写 sync=failed
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openSqlite } from '../src/services/sqlite-driver.js';
import type { YzSqliteDb } from '../src/services/sqlite-driver.js';
import { __setDbForTest } from '../src/shop/store.js';
import * as store from '../src/shop/store.js';
import type { ShopContext } from '../src/shop/types.js';
import { parseShopifyCreds } from '../src/services/platform-api/shopify.js';
import { parseTaobaoCreds } from '../src/services/platform-api/taobao.js';
import {
  importOrdersFromPlatform, importProductsFromPlatform, pushProductToPlatform, pushShipmentToPlatform,
} from '../src/shop/sync.js';
import { runShopAction } from '../src/shop/actions.js';

// 与 shop-business-tools 一致：SQL 语义测试走 sql.js 内存库（避免原生 ABI/临时文件差异）
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

let conn: YzSqliteDb;
const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; try { conn?.close(); } catch { /* ignore */ } });

function mockFetch(status: number, body: unknown, capture?: Array<{ url: string; init?: RequestInit }>): void {
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    capture?.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

function shopOf(platform: string): ShopContext {
  return { id: 'shop-1', platform, shopName: '测试店', shopType: 'test', supplyMode: 'stocked', hasSecret: true };
}

beforeEach(async () => {
  const opened = await openSqlite(':memory:');
  conn = opened.db;
  conn.exec(DDL);
  __setDbForTest(conn);
});

const shopifyCreds = () => parseShopifyCreds(JSON.stringify({
  shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x', currency: 'USD',
}))!;

describe('本地 ↔ 平台同步', () => {
  it('★★ 平台 → 本地：导入商品并写入平台 ID / sync 状态；重复导入按 SKU 更新', async () => {
    mockFetch(200, {
      products: [{
        id: 1, title: '陶瓷杯', status: 'active', image: { src: 'https://img/x.png' },
        variants: [{ id: 11, sku: 'CUP-1', price: '19.90' }],
      }],
    });
    const summary = await importProductsFromPlatform(shopOf('shopify'), shopifyCreds(), { limit: 10 });
    expect(summary.errors).toEqual([]);
    expect(summary.imported).toBe(1);

    const p = store.findProductBySku('shop-1', 'CUP-1')!;
    expect(p.priceCents).toBe(1990);
    expect(p.currency).toBe('USD');
    expect(p.listingStatus).toBe('online');
    expect(p.attrs).toMatchObject({
      platform: 'shopify', platformProductId: '1', platformVariantId: '11', platformSkuId: 'CUP-1',
      sync: { status: 'synced' },
    });

    // 第二次导入：同 SKU 更新，不重复插入
    mockFetch(200, {
      products: [{
        id: 1, title: '陶瓷杯（新）', status: 'active',
        variants: [{ id: 11, sku: 'CUP-1', price: '21.00' }],
      }],
    });
    const again = await importProductsFromPlatform(shopOf('shopify'), shopifyCreds(), { limit: 10 });
    expect(again.updated).toBe(1);
    expect(store.listProducts('shop-1', {})).toHaveLength(1);
    expect(store.findProductBySku('shop-1', 'CUP-1')?.priceCents).toBe(2100);
  });

  it('★★ 本地 → 平台：按 attrs 的 variantId 推送价格；平台成功后 sync=synced', async () => {
    const prod = store.createProduct('shop-1', {
      sku: 'CUP-1', title: '陶瓷杯', supplyMode: 'stocked', costCents: 0,
      priceCents: 1990, currency: 'USD', stock: 5, safetyStock: 0, listingStatus: 'online',
      attrs: { platform: 'shopify', platformProductId: '1', platformVariantId: '11', platformSkuId: 'CUP-1' },
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(200, { variant: { id: 11, price: '19.90' } }, calls);

    const r = await pushProductToPlatform(shopOf('shopify'), shopifyCreds(), prod.id, ['price']);
    expect(r.ok).toBe(true);
    expect(calls[0].url).toContain('/variants/11.json');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ variant: { id: 11, price: '19.90' } });
    expect(store.getProduct('shop-1', prod.id)?.attrs.sync).toMatchObject({ status: 'synced' });
  });

  it('★ 缺平台 ID / 平台不支持时如实失败，并写 sync=failed', async () => {
    const prod = store.createProduct('shop-1', {
      sku: 'CUP-2', title: '无映射商品', supplyMode: 'stocked', costCents: 0,
      priceCents: 1000, currency: 'CNY', stock: 1, safetyStock: 0, listingStatus: 'online',
    });
    const r = await pushProductToPlatform(shopOf('shopify'), shopifyCreds(), prod.id, ['price']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('platformVariantId');
    expect(store.getProduct('shop-1', prod.id)?.attrs.sync).toMatchObject({ status: 'failed' });

    const noStock = await pushProductToPlatform(shopOf('shopify'), shopifyCreds(), prod.id, ['stock']);
    expect(noStock.ok).toBe(false);
    expect(noStock.message).toContain('不支持');
  });

  it('★★ 平台 → 本地：导入订单（含明细与平台订单号），重复执行只更新', async () => {
    mockFetch(200, {
      orders: [{
        id: 9001, name: '#1001', email: 'buyer@example.com', total_price: '39.80',
        currency: 'USD', financial_status: 'paid', fulfillment_status: null,
        created_at: '2026-10-20T10:00:00Z',
        line_items: [{ sku: 'CUP-1', title: '陶瓷杯', quantity: 2, price: '19.90' }],
      }],
    });
    const s1 = await importOrdersFromPlatform(shopOf('shopify'), shopifyCreds(), { limit: 10 });
    expect(s1.imported).toBe(1);
    const o = store.findOrderByNo('shop-1', '#1001')!;
    expect(o.amountCents).toBe(3980);
    expect(o.status).toBe('paid');
    expect(o.items).toHaveLength(1);
    expect(o.attrs).toMatchObject({ platform: 'shopify', platformOrderId: '9001', sync: { status: 'synced' } });

    const s2 = await importOrdersFromPlatform(shopOf('shopify'), shopifyCreds(), { limit: 10 });
    expect(s2.updated).toBe(1);
    expect(store.listOrders('shop-1', {})).toHaveLength(1);
  });

  it('★★ 发货回填：淘宝按平台订单号 + 物流编码回填运单', async () => {
    const order = store.createOrder('shop-1', {
      orderNo: 'TID-1', buyer: '买家', amountCents: 1000, currency: 'CNY', status: 'shipped',
      items: [], attrs: { platform: 'taobao', platformOrderId: 'TID-1' },
    });
    const creds = parseTaobaoCreds(JSON.stringify({ appKey: 'k', appSecret: 's', session: 'sess' }))!;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(200, { taobao_logistics_offline_send_response: { shipping: { tid: 'TID-1' } } }, calls);

    const r = await pushShipmentToPlatform(shopOf('taobao'), creds, order.id, {
      trackingNo: 'SF123456', carrier: 'sf-express', companyCode: 'SF',
    });
    expect(r.ok).toBe(true);
    const form = new URLSearchParams(String(calls[0].init?.body));
    expect(form.get('method')).toBe('taobao.logistics.offline.send');
    expect(form.get('tid')).toBe('TID-1');
    expect(form.get('out_sid')).toBe('SF123456');
    expect(store.getOrder('shop-1', order.id)?.attrs.sync).toMatchObject({ status: 'synced' });
  });

  it('★★ 无货源采购：创建采购单 → 1688 跳转计划 → 状态流转（付款人工）', async () => {
    store.createProduct('shop-1', {
      sku: 'SKU-D1', title: '无货源商品', supplyMode: 'dropship',
      sourceRef: 'https://detail.1688.com/offer/123.html', costCents: 800,
      priceCents: 1999, currency: 'CNY', stock: 0, safetyStock: 0, listingStatus: 'online',
    });
    const order = store.createOrder('shop-1', {
      orderNo: 'ORD-D1', buyer: '买家', amountCents: 1999, currency: 'CNY', status: 'paid',
      items: [{ sku: 'SKU-D1', title: '无货源商品', qty: 2, priceCents: 1999 }],
    });
    const ctx: ShopContext = { ...shopOf('taobao'), supplyMode: 'dropship' };

    const created = await runShopAction(ctx, 'purchase.create', { orderId: order.id }, 'human');
    expect(created.kind).toBe('done');
    const list = store.listPurchases('shop-1', { orderId: order.id });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ sku: 'SKU-D1', qty: 2, unitCostCents: 800, status: 'planned' });
    expect(list[0].offerRef).toContain('1688.com');

    const jump = await runShopAction(ctx, 'purchase.jump', { purchaseId: list[0].id }, 'human');
    expect(jump.kind).toBe('jump');
    if (jump.kind === 'jump') {
      expect(jump.plan.url).toContain('1688.com');
      expect(jump.plan.automatable).toBe(false);
      expect(jump.plan.steps.join(' ')).toContain('付款必须由你人工完成');
    }

    const paid = await runShopAction(ctx, 'purchase.updateStatus', { purchaseId: list[0].id, status: 'paid' }, 'human');
    expect(paid.kind).toBe('done');
    expect(store.getPurchase('shop-1', list[0].id)?.status).toBe('paid');

    // 已付款订单之外不允许创建采购
    const pendingOrder = store.createOrder('shop-1', {
      orderNo: 'ORD-P', amountCents: 100, currency: 'CNY', status: 'pending', items: [],
    });
    const denied = await runShopAction(ctx, 'purchase.create', { orderId: pendingOrder.id }, 'human');
    expect(denied.kind).toBe('unsupported');
  });

  it('★ 平台状态倒退：本地 shipped 不被平台 paid 覆盖，计入 conflicts', async () => {
    store.createOrder('shop-1', {
      orderNo: '#2001', amountCents: 1000, currency: 'USD', status: 'shipped',
      items: [], attrs: { platform: 'shopify', platformOrderId: '2001' },
    });
    mockFetch(200, {
      orders: [{
        id: 2001, name: '#2001', total_price: '10.00', currency: 'USD',
        financial_status: 'paid', fulfillment_status: null,
        created_at: '2026-10-20T00:00:00Z', line_items: [],
      }],
    });
    const s = await importOrdersFromPlatform(shopOf('shopify'), shopifyCreds(), { limit: 10 });
    expect(s.conflicts).toBe(1);
    expect(store.findOrderByNo('shop-1', '#2001')?.status).toBe('shipped');
    expect(store.findOrderByNo('shop-1', '#2001')?.attrs.sync).toMatchObject({ status: 'failed' });
  });

  it('★ local-first 冲突策略：已有商品价格不被平台覆盖', async () => {
    store.createProduct('shop-1', {
      sku: 'CUP-L', title: '本地标题', supplyMode: 'stocked', costCents: 0,
      priceCents: 1990, currency: 'USD', stock: 5, safetyStock: 0, listingStatus: 'online',
    });
    mockFetch(200, {
      products: [{
        id: 2, title: '平台标题', status: 'active',
        variants: [{ id: 22, sku: 'CUP-L', price: '21.00' }],
      }],
    });
    const s = await importProductsFromPlatform(shopOf('shopify'), shopifyCreds(), { limit: 10, policy: 'local-first' });
    expect(s.updated).toBe(1);
    const p = store.findProductBySku('shop-1', 'CUP-L')!;
    expect(p.priceCents).toBe(1990);
    expect(p.title).toBe('本地标题');
    // 平台 ID 仍然写入，后续推送可用
    expect(p.attrs.platformVariantId).toBe('22');
  });

  it('★ 拼多多商品价格按分解析（1990 → 1990），不再乘 100', async () => {
    mockFetch(200, {
      pdd_goods_list_get_response: {
        goods_list: [{ goods_id: 9, outer_id: 'PDD-1', goods_name: '拼多多商品', goods_price: '1990', quantity: 5, is_onsale: 1 }],
      },
    });
    const creds = { clientId: 'c', clientSecret: 's', accessToken: 't' };
    const s = await importProductsFromPlatform(shopOf('pdd'), creds, { limit: 10 });
    expect(s.imported).toBe(1);
    expect(store.findProductBySku('shop-1', 'PDD-1')?.priceCents).toBe(1990);
  });

  it('★ 亚马逊价格未知/缺卖家 SKU 时拒绝推送，避免把平台价改成 0', async () => {
    const p = store.createProduct('shop-1', {
      sku: 'ASIN-1', title: '亚马逊商品', supplyMode: 'stocked', costCents: 0,
      priceCents: 0, currency: 'USD', stock: 3, safetyStock: 0, listingStatus: 'draft',
      attrs: { platform: 'amazon', platformProductId: 'ASIN-1', platformSkuId: 'SELLER-1', productType: 'PRODUCT', priceUnknown: true },
    });
    const r = await pushProductToPlatform(shopOf('amazon'), {}, p.id, ['price']);
    expect(r.ok).toBe(false);
    expect(r.results[0].message).toContain('价格未知');
  });

  it('★ 采购单先整体校验：缺一条货源时不产生任何采购单（无部分写入）', async () => {
    store.createProduct('shop-1', {
      sku: 'HAS-SRC', title: '有货源', supplyMode: 'dropship', sourceRef: 'https://detail.1688.com/offer/1.html',
      costCents: 800, priceCents: 1999, currency: 'CNY', stock: 0, safetyStock: 0, listingStatus: 'online',
    });
    store.createProduct('shop-1', {
      sku: 'NO-SRC', title: '缺货源', supplyMode: 'dropship',
      costCents: 800, priceCents: 1999, currency: 'CNY', stock: 0, safetyStock: 0, listingStatus: 'online',
    });
    const order = store.createOrder('shop-1', {
      orderNo: 'ORD-PART', amountCents: 3998, currency: 'CNY', status: 'paid',
      items: [
        { sku: 'HAS-SRC', title: '有货源', qty: 1, priceCents: 1999 },
        { sku: 'NO-SRC', title: '缺货源', qty: 1, priceCents: 1999 },
      ],
    });
    const ctx: ShopContext = { ...shopOf('taobao'), supplyMode: 'dropship' };
    const out = await runShopAction(ctx, 'purchase.create', { orderId: order.id }, 'human');
    expect(out.kind).toBe('unsupported');
    expect(store.listPurchases('shop-1', { orderId: order.id })).toHaveLength(0);
  });

  it('★★ 亚马逊全量 Listing：无关键词时走 searchListingsItems，保存卖家 SKU 与价格', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('api.amazon.com')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        items: [{
          sku: 'AMZ-SKU-1',
          summaries: [{ itemName: '亚马逊商品', asin: 'B0TEST', productType: 'PRODUCT', status: 'BUYABLE' }],
          offers: [{ price: { amount: '19.90', currency: 'USD' } }],
        }],
        pagination: {},
        numberOfResults: 1,
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const creds = {
      clientId: 'c', clientSecret: 's', refreshToken: 'r',
      awsAccessKeyId: 'AK', awsSecretAccessKey: 'SK',
      marketplaceIds: 'ATVPDKIKX0DER', sellerId: 'SELLER',
    };
    const s = await importProductsFromPlatform(shopOf('amazon'), creds, { limit: 20 });
    expect(s.errors).toEqual([]);
    const p = store.findProductBySku('shop-1', 'AMZ-SKU-1')!;
    expect(p.priceCents).toBe(1990);
    expect(p.currency).toBe('USD');
    expect(p.listingStatus).toBe('online');
    expect(p.attrs).toMatchObject({ platformSkuId: 'AMZ-SKU-1', platformProductId: 'B0TEST', priceUnknown: false });
    expect(calls.some((u) => u.includes('/listings/2021-08-01/items/SELLER'))).toBe(true);
  });
});

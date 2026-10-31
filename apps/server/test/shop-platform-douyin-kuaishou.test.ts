// 抖店 / 快手小店 · 客户端与同步行为测试（2026-10-30 接入）。
//
// 不请求真实平台：mock fetch，只验证
//   ① 凭据解析；② 签名算法与请求形状（对官方文档规则逐条核对）；
//   ③ 错误分步（auth/rate/api）；④ dispatch 路由；⑤ 本地库同步（导入/推送/发货）。
// 真实凭据联调属交付后动作（用户同事有真实抖店账号）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { openSqlite } from '../src/services/sqlite-driver.js';
import type { YzSqliteDb } from '../src/services/sqlite-driver.js';
import { __setDbForTest } from '../src/shop/store.js';
import * as store from '../src/shop/store.js';
import type { ShopContext } from '../src/shop/types.js';
import { parseDouyinCreds, douyinRequest } from '../src/services/platform-api/douyin.js';
import { parseKuaishouCreds, ksRequest } from '../src/services/platform-api/kuaishou.js';
import {
  importOrdersFromPlatform, importProductsFromPlatform, pushProductToPlatform, pushShipmentToPlatform,
} from '../src/shop/sync.js';
import { runPlatformAction } from '../src/services/platform-api/dispatch.js';

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

const douyinCreds = () => parseDouyinCreds(JSON.stringify({ appKey: '3409409348479354011', appSecret: 'sec', accessToken: 'tok' }))!;
const kuaishouCreds = () => parseKuaishouCreds(JSON.stringify({ appKey: 'ks710724317041866789', signSecret: 'signsec', accessToken: 'tok' }))!;

describe('抖店客户端', () => {
  it('凭据解析：appKey/appSecret/accessToken 缺一不可', () => {
    expect(parseDouyinCreds(JSON.stringify({ appKey: 'k', appSecret: 's' }))).toBeNull();
    expect(parseDouyinCreds(JSON.stringify({ appKey: 'k', appSecret: 's', accessToken: 't' })))
      .toMatchObject({ appKey: 'k', appSecret: 's', accessToken: 't' });
    expect(parseDouyinCreds('not json')).toBeNull();
  });

  it('★ 签名形状：POST /order/searchList，query 带公共参数（hmac-sha256），param_json 放 body；签名可复算', async () => {
    const cap: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(200, { code: 10000, msg: 'success', data: { shop_order_list: [] } }, cap);
    const creds = douyinCreds();
    const r = await douyinRequest(creds, 'order.searchList', { size: '20', page: '0' });
    expect(r.ok).toBe(true);

    const call = cap[0]!;
    expect(call.url).toContain('https://openapi-fxg.jinritemai.com/order/searchList?');
    const q = new URL(call.url).searchParams;
    expect(q.get('method')).toBe('order.searchList');
    expect(q.get('sign_method')).toBe('hmac-sha256');
    expect(q.get('access_token')).toBe('tok');
    expect(q.get('timestamp')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // param_json 在 body 且 key 字典序（page 在 size 前）
    expect(String(call.init?.body)).toBe('{"page":"0","size":"20"}');

    // 签名可复算：app_key, method, param_json, timestamp, v 按字典序拼 k+v，secret 包裹，HMAC-SHA256
    const sign = q.get('sign')!;
    const concat = `app_key${q.get('app_key')}methodorder.searchListparam_json${String(call.init?.body)}timestamp${q.get('timestamp')}v2`;
    const expectSign = createHmac('sha256', 'sec').update(`sec${concat}sec`, 'utf8').digest('hex');
    expect(sign).toBe(expectSign);
  });

  it('★ token 过期 30002 → auth；服务繁忙 → rate；成功之外的 code 不算成功', async () => {
    mockFetch(200, { code: 30002, msg: 'access_token已过期' });
    const expired = await douyinRequest(douyinCreds(), 'product.listV2', {});
    expect(expired.ok).toBe(false);
    expect(expired.step).toBe('auth');

    mockFetch(200, { code: 8, msg: '服务繁忙' });
    const busy = await douyinRequest(douyinCreds(), 'product.listV2', {});
    expect(busy.ok).toBe(false);
    expect(busy.step).toBe('rate');

    mockFetch(200, { code: 50002, msg: '业务处理失败', sub_code: 'isv.business-failed:60021' });
    const biz = await douyinRequest(douyinCreds(), 'order.logisticsAdd', {});
    expect(biz.ok).toBe(false);
    expect(biz.step).toBe('api');
    expect(biz.message).toContain('60021');
  });

  it('★ dispatch 路由：douyin:product.price 映射 sku.editPrice（分）；product.listing 上下架分流', async () => {
    const cap: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(200, { code: 10000, msg: 'success', data: {} }, cap);
    const creds = douyinCreds();

    expect((await runPlatformAction('douyin', creds, 'product.price', { productId: '11', skuId: '22', price: 2799 })).ok).toBe(true);
    expect(JSON.parse(String(cap[0]!.init?.body))).toMatchObject({ product_id: '11', sku_id: '22', price: '2799' });

    expect((await runPlatformAction('douyin', creds, 'product.listing', { productId: '11', online: false })).ok).toBe(true);
    expect(cap[1]!.url).toContain('/product/setOffline?');
    expect(JSON.parse(String(cap[1]!.init?.body))).toMatchObject({ product_id: '11' });

    // 改标题：如实拒绝（全量编辑接口未接）
    const t = await runPlatformAction('douyin', creds, 'product.update', { productId: '11', title: '新标题' });
    expect(t.ok).toBe(false);
    expect(t.message).toContain('editV2');
  });
});

describe('快手客户端', () => {
  it('凭据解析：appKey/signSecret/accessToken 必填，appSecret 可缺省', () => {
    expect(parseKuaishouCreds(JSON.stringify({ appKey: 'k', signSecret: 's' }))).toBeNull();
    const full = parseKuaishouCreds(JSON.stringify({ appKey: 'k', signSecret: 's', accessToken: 't' }))!;
    expect(full).toMatchObject({ appKey: 'k', signSecret: 's', accessToken: 't' });
    expect(full.appSecret).toBeUndefined();
  });

  it('★ 签名形状：GET /open/item/list/get，七参数字典序 + &signSecret=… 后 HMAC-SHA256 → Base64', async () => {
    const cap: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(200, { result: 1, data: { items: [] } }, cap);
    const creds = kuaishouCreds();
    const r = await ksRequest(creds, 'open.item.list.get', { pageSize: 20, pageNumber: 1 }, 'GET');
    expect(r.ok).toBe(true);

    const call = cap[0]!;
    expect(call.url).toContain('https://openapi.kwaixiaodian.com/open/item/list/get?');
    const q = new URL(call.url).searchParams;
    expect(q.get('method')).toBe('open.item.list.get');
    expect(q.get('signMethod')).toBe('HMAC_SHA256');
    expect(q.get('version')).toBe('1');
    // param key 字典序（pageNumber 在 pageSize 前）
    expect(q.get('param')).toBe('{"pageNumber":1,"pageSize":20}');

    // 签名可复算
    const sign = q.get('sign')!;
    const concat = `access_token=${q.get('access_token')}&appkey=${q.get('appkey')}&method=open.item.list.get&param=${q.get('param')}&signMethod=HMAC_SHA256&timestamp=${q.get('timestamp')}&version=1&signSecret=signsec`;
    const expectSign = createHmac('sha256', 'signsec').update(concat, 'utf8').digest('base64');
    expect(sign).toBe(expectSign);
  });

  it('★ POST 写请求：URL 只带 appkey，其余参数走 form body', async () => {
    const cap: Array<{ url: string; init?: RequestInit }> = [];
    mockFetch(200, { result: 1, data: {} }, cap);
    await ksRequest(kuaishouCreds(), 'open.seller.order.goods.deliver', { orderId: 123, expressCode: 4, expressNo: 'SF001' }, 'POST');
    const call = cap[0]!;
    expect(call.url).toBe('https://openapi.kwaixiaodian.com/open/seller/order/goods/deliver?appkey=ks710724317041866789');
    const form = new URLSearchParams(String(call.init?.body));
    expect(form.get('method')).toBe('open.seller.order.goods.deliver');
    expect(form.get('signMethod')).toBe('HMAC_SHA256');
    expect(JSON.parse(form.get('param')!)).toMatchObject({ orderId: 123, expressCode: 4, expressNo: 'SF001' });
  });

  it('★ result≠1 → 失败；授权类错误 → auth', async () => {
    mockFetch(200, { result: 500, error_msg: 'token 失效，请重新授权' });
    const bad = await ksRequest(kuaishouCreds(), 'open.user.seller.get', {}, 'GET');
    expect(bad.ok).toBe(false);
    expect(bad.step).toBe('auth');

    mockFetch(200, { result: 7, error_msg: '请求过于频繁' });
    const busy = await ksRequest(kuaishouCreds(), 'open.item.list.get', {}, 'GET');
    expect(busy.ok).toBe(false);
    expect(busy.step).toBe('rate');
  });
});

describe('抖店 / 快手 · 本地库同步', () => {
  it('★★ 抖店：导入商品（SKU 拆条 + 平台 ID）→ 推价格/库存 → 导入订单（状态映射）→ 回填运单', async () => {
    // ① 商品导入：product.listV2
    mockFetch(200, {
      code: 10000, msg: 'success',
      data: {
        product_list: [{
          product_id: 35001, name: '陶瓷马克杯', status: 0,
          img: [{ url: 'https://img.example/cup.png' }],
          skus: [
            { sku_id: 90101, code: 'CUP-WHITE', market_price: 1990, stock_num: 15 },
            { sku_id: 90102, code: 'CUP-BLACK', market_price: 2190, stock_num: 8 },
          ],
        }],
      },
    });
    const s1 = await importProductsFromPlatform(shopOf('douyin'), douyinCreds(), { limit: 20 });
    expect(s1.errors).toEqual([]);
    expect(s1.imported).toBe(2);
    const white = store.findProductBySku('shop-1', 'CUP-WHITE')!;
    expect(white.priceCents).toBe(1990);
    expect(white.stock).toBe(15);
    expect(white.listingStatus).toBe('online');
    expect(white.attrs).toMatchObject({
      platform: 'douyin', platformProductId: '35001', platformSkuId: '90101', sync: { status: 'synced' },
    });

    // ② 推价格：sku.editPrice
    const cap: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      cap.push({ url: String(url), init });
      return new Response(JSON.stringify({ code: 10000, msg: 'success', data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const push = await pushProductToPlatform(shopOf('douyin'), douyinCreds(), white.id, ['price', 'stock']);
    expect(push.ok).toBe(true);
    const editCall = cap.find((c) => c.url.includes('/sku/editPrice'))!;
    const stockCall = cap.find((c) => c.url.includes('/sku/syncStock'))!;
    expect(JSON.parse(String(editCall.init?.body))).toMatchObject({ product_id: '35001', sku_id: '90101', price: '1990' });
    // 库存走 sku.syncStock（按 sku_id 全量）
    expect(stockCall, '库存推送应走 sku/syncStock').toBeTruthy();

    // ③ 订单导入：order.searchList（main_status=2 备货中 → paid）
    const now = Math.floor(Date.now() / 1000);
    mockFetch(200, {
      code: 10000, msg: 'success',
      data: {
        shop_order_list: [{
          order_id: '4791717922061698637',
          main_status: 2,
          pay_amount: 35000,
          create_time: now - 600,
          post_addr: { detail: '重庆市江北区观音桥街道' },
        }],
      },
    });
    const so = await importOrdersFromPlatform(shopOf('douyin'), douyinCreds(), { limit: 20 });
    expect(so.errors).toEqual([]);
    expect(so.imported).toBe(1);
    const order = store.listOrders('shop-1', {}).find((o) => o.orderNo === '4791717922061698637')!;
    expect(order.status).toBe('paid');
    expect(order.amountCents).toBe(35000);

    // ④ 回填运单：order.logisticsAdd（重新挂捕获 mock：上面的已被订单导入覆盖）
    cap.length = 0;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      cap.push({ url: String(url), init });
      return new Response(JSON.stringify({ code: 10000, msg: 'success', data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const ship = await pushShipmentToPlatform(shopOf('douyin'), douyinCreds(), order.id, {
      trackingNo: 'SF1154705663665', carrier: '顺丰', companyCode: 'shunfeng',
    });
    expect(ship.ok).toBe(true);
    const shipCall = cap.find((c) => c.url.includes('/order/logisticsAdd'));
    expect(shipCall, '发货应调用 order.logisticsAdd').toBeTruthy();
    const lastBody = JSON.parse(String(shipCall!.init?.body));
    expect(lastBody).toMatchObject({ order_id: '4791717922061698637', company_code: 'shunfeng', logistics_code: 'SF1154705663665' });
  });

  it('★★ 快手：导入商品 → 导入订单（30 已付款 → paid；游标到底）→ 回填运单（expressCode 数字）', async () => {
    // ① 商品导入：open.item.list.get
    mockFetch(200, {
      result: 1,
      data: {
        items: [{
          kwaiItemId: 4193319911, title: '保温水壶', price: 8900, itemStatus: 1,
        }],
      },
    });
    const s1 = await importProductsFromPlatform(shopOf('kuaishou'), kuaishouCreds(), { limit: 20 });
    expect(s1.errors).toEqual([]);
    expect(s1.imported).toBe(1);
    const product = store.findProductBySku('shop-1', '4193319911')!;
    expect(product.priceCents).toBe(8900);
    expect(product.attrs).toMatchObject({ platform: 'kuaishou', platformProductId: '4193319911' });

    // ② 订单导入：open.seller.order.pcursor.list；pcursor=nomore 停止翻页
    const now = Date.now();
    mockFetch(200, {
      result: 1,
      data: {
        pcursor: 'nomore',
        orderInfoList: [{
          oid: 2317600197445775, status: 30, totalFee: 12000, createTime: now - 120000,
          address: { consignee: '李四' },
        }],
      },
    });
    const so = await importOrdersFromPlatform(shopOf('kuaishou'), kuaishouCreds(), { limit: 20 });
    expect(so.errors).toEqual([]);
    expect(so.imported).toBe(1);
    const order = store.listOrders('shop-1', {}).find((o) => o.orderNo === '2317600197445775')!;
    expect(order.status).toBe('paid');
    expect(order.amountCents).toBe(12000);

    // ③ 推价格：open.item.edit
    const cap: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      cap.push({ url: String(url), init });
      return new Response(JSON.stringify({ result: 1, data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const push = await pushProductToPlatform(shopOf('kuaishou'), kuaishouCreds(), product.id, ['price']);
    expect(push.ok).toBe(true);
    const editForm = new URLSearchParams(String(cap[0]!.init?.body));
    expect(cap[0]!.url).toContain('/open/item/edit?');
    expect(JSON.parse(editForm.get('param')!)).toMatchObject({ kwaiItemId: 4193319911, price: 8900 });

    // ④ 回填运单：open.seller.order.goods.deliver（expressCode 数字编码）
    const ship = await pushShipmentToPlatform(shopOf('kuaishou'), kuaishouCreds(), order.id, {
      trackingNo: 'JD7523456789', carrier: '京东', companyCode: '4',
    });
    expect(ship.ok).toBe(true);
    const deliverForm = new URLSearchParams(String(cap.find((c) => c.url.includes('/open/seller/order/goods/deliver'))!.init?.body));
    expect(JSON.parse(deliverForm.get('param')!)).toMatchObject({ orderId: 2317600197445775, expressCode: 4, expressNo: 'JD7523456789' });
  });

  it('★ 缺平台标识/缺物流编码时如实失败，不假装成功', async () => {
    // 快手缺 companyCode（expressCode）
    const order = store.createOrder('shop-1', {
      orderNo: 'KS-TEST-1', amountCents: 1000, currency: 'CNY', status: 'paid',
      items: [], address: {}, createdAt: Date.now(),
      attrs: { platform: 'kuaishou', platformOrderId: '999' },
    });
    const ship = await pushShipmentToPlatform(shopOf('kuaishou'), kuaishouCreds(), order.id, {
      trackingNo: 'SF001', carrier: '顺丰',
    });
    expect(ship.ok).toBe(false);
    expect(ship.message).toContain('expressCode');

    // 抖店缺 skuId 的库存推送
    const p = store.createProduct('shop-1', {
      sku: 'DY-NO-SKU', title: '无平台SKU商品', supplyMode: 'stocked', costCents: 0,
      priceCents: 1000, currency: 'CNY', stock: 1, safetyStock: 0, listingStatus: 'online',
      attrs: { platform: 'douyin', platformProductId: '777' },
    });
    const push = await pushProductToPlatform(shopOf('douyin'), douyinCreds(), p.id, ['price']);
    expect(push.ok).toBe(false);
    expect(push.results[0]!.message).toContain('platformSkuId');
  });
});

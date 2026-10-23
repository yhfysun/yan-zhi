// 平台 API 客户端 · 签名/请求形状测试（2026-10-22）。
//
// 不请求真实平台：mock fetch，只验证
//   ① 凭据解析与 SSRF 防护；② 签名算法与参数摆放；③ 错误分步（auth/rate/api）。
// 真实凭据联调属于交付后动作（见各文件注释里的官方文档链接）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  normalizeShopDomain, parseShopifyCreds, shopifyTest, shopifyListProducts,
} from '../src/services/platform-api/shopify.js';
import { tiktokSign, parseTiktokCreds, tiktokTest } from '../src/services/platform-api/tiktok.js';
import { stableStringify, parseWinitCreds, winitTest } from '../src/services/platform-api/winit.js';
import { topSign, pddSign, sortedParamConcat } from '../src/services/platform-api/sign.js';
import { parseTaobaoCreds, taobaoTest } from '../src/services/platform-api/taobao.js';
import { parsePddCreds, pddTest } from '../src/services/platform-api/pdd.js';
import { parseAli1688Creds, ali1688Test } from '../src/services/platform-api/ali1688.js';
import { runPlatformAction } from '../src/services/platform-api/dispatch.js';
import { platformApiOf, platformCapabilitiesOf, platformCredentialFieldsOf } from '../src/services/platform-api/index.js';
import { amazonSearchListings } from '../src/services/platform-api/amazon.js';
import { spApiRequest, type AmazonSpApiCreds } from '../src/services/amazon-sp-api.js';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function mockFetch(status: number, body: unknown, capture?: { url?: string; init?: RequestInit }): void {
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (capture) { capture.url = String(url); capture.init = init; }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('Shopify 客户端', () => {
  it('★ 域名规范化：只接受 *.myshopify.com，拒绝任意域名/内网域名/IP（防 SSRF）', () => {
    expect(normalizeShopDomain('https://demo.myshopify.com/admin')).toBe('demo.myshopify.com');
    expect(normalizeShopDomain(' demo.myshopify.com/ ')).toBe('demo.myshopify.com');
    expect(normalizeShopDomain('127.0.0.1')).toBeNull();
    expect(normalizeShopDomain('localhost')).toBeNull();
    expect(normalizeShopDomain('http://demo.myshopify.com@evil.com')).toBeNull();
    expect(normalizeShopDomain('')).toBeNull();
    // 收紧后的回归：任意域名 / DNS 绕过 / 内网域名都不能通过
    expect(normalizeShopDomain('evil.com')).toBeNull();
    expect(normalizeShopDomain('127.0.0.1.nip.io')).toBeNull();
    expect(normalizeShopDomain('metadata.google.internal')).toBeNull();
    expect(normalizeShopDomain('demo.myshopify.com.evil.com')).toBeNull();
  });

  it('凭据解析：缺 token 或域名不合法返回 null；默认 API 版本 2024-10', () => {
    expect(parseShopifyCreds(JSON.stringify({ shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x' })))
      .toMatchObject({ shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x', apiVersion: '2024-10' });
    expect(parseShopifyCreds(JSON.stringify({ shopDomain: 'demo.myshopify.com' }))).toBeNull();
    expect(parseShopifyCreds('not json')).toBeNull();
  });

  it('★ 连通性自检：请求 shop.json、带 token 头；401 → auth', async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    mockFetch(200, { shop: { name: '演示店', domain: 'demo.myshopify.com' } }, cap);
    const creds = parseShopifyCreds(JSON.stringify({ shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x' }))!;
    const r = await shopifyTest(creds);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('演示店');
    expect(cap.url).toContain('/admin/api/2024-10/shop.json');
    expect((cap.init?.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('shpat_x');

    mockFetch(401, { errors: 'Invalid API key or access token' });
    const bad = await shopifyTest(creds);
    expect(bad.ok).toBe(false);
    expect(bad.step).toBe('auth');
  });

  it('★ 商品列表：limit/status 进 query，429 → rate', async () => {
    const cap: { url?: string } = {};
    mockFetch(200, { products: [{ id: 1, title: '收纳架' }] }, cap);
    const creds = parseShopifyCreds(JSON.stringify({ shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x' }))!;
    const r = await shopifyListProducts(creds, { limit: 10, status: 'active' });
    expect(r.ok).toBe(true);
    expect(r.products).toHaveLength(1);
    expect(cap.url).toContain('/products.json?limit=10&status=active');

    mockFetch(429, { errors: 'Too Many Requests' });
    const limited = await shopifyListProducts(creds);
    expect(limited.ok).toBe(false);
    expect(limited.step).toBe('rate');
  });

  it('★★ 发货走 fulfillment 流程：先取 fulfillment_orders，再 POST /fulfillments.json', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('fulfillment_orders.json')) {
        return new Response(JSON.stringify({
          fulfillment_orders: [
            { id: 555, status: 'open' },
            { id: 556, status: 'in_progress' },
            { id: 557, status: 'closed' },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ fulfillment: { id: 777, status: 'success', tracking_info: { number: 'SF123' } } }), { status: 200 });
    }) as unknown as typeof fetch;
    const creds = parseShopifyCreds(JSON.stringify({ shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x' }))!;
    const r = await runPlatformAction('shopify', creds, 'order.ship', {
      orderId: '9001', trackingNumber: 'SF123', trackingCompany: 'SF', notifyCustomer: true,
    });
    expect(r.ok).toBe(true);
    expect(calls[0].url).toContain('/orders/9001/fulfillment_orders.json');
    expect(calls[1].url).toContain('/fulfillments.json');
    const body = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      fulfillment: {
        line_items_by_fulfillment_order: [{ fulfillment_order_id: 555 }, { fulfillment_order_id: 556 }],
        tracking_info: { number: 'SF123', company: 'SF' },
        notify_customer: true,
      },
    });
  });

  it('★★ 商品分页：Link rel=next 提取 page_info，下一页带 page_info 且不再带 status', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return new Response(JSON.stringify({ products: [{ id: 1 }] }), {
          status: 200,
          headers: { link: '<https://demo.myshopify.com/admin/api/2024-10/products.json?limit=2&page_info=abc>; rel="next"' },
        });
      }
      return new Response(JSON.stringify({ products: [{ id: 2 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const creds = parseShopifyCreds(JSON.stringify({ shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x' }))!;
    const first = await shopifyListProducts(creds, { limit: 2, status: 'active' });
    expect(first.products).toHaveLength(1);
    expect(first.nextPageInfo).toBe('abc');
    const second = await shopifyListProducts(creds, { limit: 2, pageInfo: first.nextPageInfo });
    expect(second.nextPageInfo).toBe('');
    expect(calls[1]).toContain('page_info=abc');
    expect(calls[1]).not.toContain('status=');
  });

  it('★★ 全量 Listing：GET /listings/2021-08-01/items/{sellerId}，pageToken 翻页', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('api.amazon.com')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      }
      const spCalls = calls.filter((x) => x.includes('sellingpartnerapi'));
      if (spCalls.length === 1) {
        return new Response(JSON.stringify({
          items: [{
            sku: 'SELLER-1',
            summaries: [{ itemName: '商品一', asin: 'B0X', productType: 'PRODUCT', status: 'BUYABLE' }],
            offers: [{ price: { amount: '19.90', currency: 'USD' } }],
          }],
          pagination: { nextToken: 'tok2' },
          numberOfResults: 2,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        items: [{ sku: 'SELLER-2', summaries: [{ itemName: '商品二', asin: 'B0Y' }] }],
        pagination: {},
        numberOfResults: 2,
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const creds = {
      clientId: 'c', clientSecret: 's', refreshToken: 'r',
      awsAccessKeyId: 'AK', awsSecretAccessKey: 'SK',
      marketplaceIds: 'ATVPDKIKX0DER', sellerId: 'SELLER',
    };
    const first = await amazonSearchListings(creds, { pageSize: 20 });
    expect(first.items[0].sku).toBe('SELLER-1');
    expect(first.nextToken).toBe('tok2');
    const second = await amazonSearchListings(creds, { pageSize: 20, pageToken: 'tok2' });
    expect(second.items[0].sku).toBe('SELLER-2');

    const spCalls = calls.filter((x) => x.includes('sellingpartnerapi'));
    expect(spCalls[0]).toContain('/listings/2021-08-01/items/SELLER');
    expect(spCalls[0]).toContain('includedData=summaries%2Coffers');
    expect(spCalls[1]).toContain('pageToken=tok2');
  });
});

describe('TikTok Shop 客户端', () => {
  it('★ 签名结构：HMAC-SHA256 小写 hex，查询参数参与签名', () => {
    const sig = tiktokSign('/product/202309/products/activate', { app_key: 'k', timestamp: 1 }, '{"product_ids":["1"]}', 'secret');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    const sig2 = tiktokSign('/product/202309/products/activate', { app_key: 'k', timestamp: 2 }, '{"product_ids":["1"]}', 'secret');
    expect(sig2).not.toBe(sig);
  });

  it('凭据解析：缺 shopCipher / accessToken 返回 null', () => {
    const ok = parseTiktokCreds(JSON.stringify({ appKey: 'a', appSecret: 's', accessToken: 't', shopCipher: 'c' }));
    expect(ok).not.toBeNull();
    expect(parseTiktokCreds(JSON.stringify({ appKey: 'a', appSecret: 's', accessToken: 't' }))).toBeNull();
  });

  it('★ 自检：调 /authorization/202309/shops，带 access token 头；业务 code≠0 如实报错', async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    mockFetch(200, { code: 0, data: { shops: [{ name: '演示店', cipher: 'c1' }] } }, cap);
    const creds = parseTiktokCreds(JSON.stringify({ appKey: 'a', appSecret: 's', accessToken: 't', shopCipher: 'c1' }))!;
    const r = await tiktokTest(creds);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('演示店');
    expect(cap.url).toContain('/authorization/202309/shops');
    expect(cap.url).toContain('sign=');
    expect((cap.init?.headers as Record<string, string>)['x-tts-access-token']).toBe('t');

    mockFetch(200, { code: 36009002, message: 'rate limit' });
    const bad = await tiktokTest(creds);
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('36009002');
  });
});

describe('WINIT 客户端', () => {
  it('★ data 稳定序列化：递归按 key 排序', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('凭据解析：五项必填缺一不可', () => {
    const full = { appKey: 'k', token: 't', platform: 'p', clientId: 'id', clientSecret: 's' };
    expect(parseWinitCreds(JSON.stringify(full))).not.toBeNull();
    expect(parseWinitCreds(JSON.stringify({ ...full, clientSecret: '' }))).toBeNull();
  });

  it('★ 自检：单入口 POST，body 带 action/sign/client_sign/data 字符串；失败码如实报', async () => {
    const cap: { init?: RequestInit } = {};
    mockFetch(200, { code: '0', data: { warehouseList: [{}, {}] } }, cap);
    const creds = parseWinitCreds(JSON.stringify({ appKey: 'k', token: 't', platform: 'p', clientId: 'id', clientSecret: 's' }))!;
    const r = await winitTest(creds);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('2 个仓库');
    const body = JSON.parse(String(cap.init?.body)) as Record<string, string>;
    expect(body.action).toBe('queryWarehouse');
    expect(body.sign).toMatch(/^[0-9A-F]{32}$/);
    expect(body.client_sign).toMatch(/^[0-9A-F]{32}$/);
    expect(body.data).toBe('{}');
    expect(body.client_id).toBe('id');

    mockFetch(200, { code: '03010250004', message: '访问太频繁' });
    const bad = await winitTest(creds);
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('03010250004');
  });
});

describe('淘宝 / 拼多多 / 1688', () => {
  it('★ 三平台签名都是 md5(secret + 排序 k+v + secret) 大写（1688 与 TOP 同构）', () => {
    const params = { b: '2', a: '1' };
    expect(sortedParamConcat(params)).toBe('a1b2');
    const expected = createHash('md5').update('sa1b2s', 'utf8').digest('hex').toUpperCase();
    expect(topSign(params, 's')).toBe(expected);
    expect(pddSign(params, 's')).toBe(expected);
  });

  it('凭据解析：三者都要求 appKey/secret + 授权令牌', () => {
    expect(parseTaobaoCreds(JSON.stringify({ appKey: 'k', appSecret: 's' }))).toBeNull();
    expect(parsePddCreds(JSON.stringify({ clientId: 'c', clientSecret: 's' }))).toBeNull();
    expect(parseAli1688Creds(JSON.stringify({ appKey: 'k', appSecret: 's' }))).toBeNull();
  });

  it('★ 淘宝自检：POST 表单带 method/timestamp/sign；限流错误 → rate', async () => {
    const cap: { init?: RequestInit } = {};
    mockFetch(200, { taobao_time_get_response: { time: '2026-10-22 22:00:00' } }, cap);
    const creds = parseTaobaoCreds(JSON.stringify({ appKey: 'k', appSecret: 's', session: 'sess' }))!;
    const r = await taobaoTest(creds);
    expect(r.ok).toBe(true);
    const body = String(cap.init?.body);
    const form = new URLSearchParams(body);
    expect(form.get('method')).toBe('taobao.time.get');
    expect(form.get('timestamp')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(form.get('sign')).toMatch(/^[0-9A-F]{32}$/);

    mockFetch(200, { error_response: { code: 7, msg: 'App Call Limited' } });
    const limited = await taobaoTest(creds);
    expect(limited.ok).toBe(false);
    expect(limited.step).toBe('rate');
  });

  it('★ 拼多多自检：JSON body 的 timestamp 是秒（10 位）；限流码 70031 → rate', async () => {
    const cap: { init?: RequestInit } = {};
    mockFetch(200, { pdd_time_get_response: { time: 1761000000 } }, cap);
    const creds = parsePddCreds(JSON.stringify({ clientId: 'c', clientSecret: 's', accessToken: 't' }))!;
    const r = await pddTest(creds);
    expect(r.ok).toBe(true);
    const body = JSON.parse(String(cap.init?.body)) as Record<string, unknown>;
    expect(body.type).toBe('pdd.time.get');
    expect(String(body.timestamp)).toMatch(/^\d{10}$/);
    expect(String(body.sign)).toMatch(/^[0-9A-F]{32}$/);

    mockFetch(200, { error_response: { error_code: 70031, error_msg: '调用过于频繁' } });
    const limited = await pddTest(creds);
    expect(limited.ok).toBe(false);
    expect(limited.step).toBe('rate');
  });

  it('★ 1688 自检：param2 路径 + _aop_signature/_aop_timestamp（毫秒），错误码如实报', async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    mockFetch(200, { result: { totalRecords: 3 } }, cap);
    const creds = parseAli1688Creds(JSON.stringify({ appKey: 'k', appSecret: 's', accessToken: 't' }))!;
    const r = await ali1688Test(creds);
    expect(r.ok).toBe(true);
    expect(cap.url).toContain('/param2/1/com.alibaba.product/alibaba.product.list.get/k');
    const body = String(cap.init?.body);
    expect(body).toMatch(/_aop_signature=[0-9A-F]{32}/);
    expect(body).toMatch(/_aop_timestamp=\d{13}/);

    mockFetch(200, { errorCode: '401', errorMessage: 'no right to access' });
    const bad = await ali1688Test(creds);
    expect(bad.ok).toBe(false);
    expect(bad.step).toBe('auth');
  });
});

describe('统一分发 · 能力路由', () => {
  it('★ Shopify 改价：按 variantId PUT，价格字符串；未实现的能力如实拒绝', async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    mockFetch(200, { variant: { id: 123, price: '27.99' } }, cap);
    const creds = parseShopifyCreds(JSON.stringify({ shopDomain: 'demo.myshopify.com', accessToken: 'shpat_x' }))!;
    const r = await runPlatformAction('shopify', creds, 'product.price', { variantId: '123', price: '27.99' });
    expect(r.ok).toBe(true);
    expect(cap.url).toContain('/variants/123.json');
    expect(JSON.parse(String(cap.init?.body))).toEqual({ variant: { id: 123, price: '27.99' } });

    const noStock = await runPlatformAction('shopify', creds, 'product.stock', { productId: '1', quantity: 5 });
    expect(noStock.ok).toBe(false);
    expect(noStock.message).toContain('尚未实现');
  });

  it('★ 淘宝 / 拼多多 / 1688 的动作参数映射正确', async () => {
    // 淘宝改库存
    let cap: { init?: RequestInit } = {};
    mockFetch(200, { taobao_item_quantity_update_response: {} }, cap);
    const tb = parseTaobaoCreds(JSON.stringify({ appKey: 'k', appSecret: 's', session: 'sess' }))!;
    expect((await runPlatformAction('taobao', tb, 'product.stock', { numIid: '9001', quantity: 12 })).ok).toBe(true);
    expect(new URLSearchParams(String(cap.init?.body)).get('method')).toBe('taobao.item.quantity.update');

    // 拼多多改价（分）
    cap = {};
    mockFetch(200, { pdd_goods_sku_price_update_response: {} }, cap);
    const pdd = parsePddCreds(JSON.stringify({ clientId: 'c', clientSecret: 's', accessToken: 't' }))!;
    expect((await runPlatformAction('pdd', pdd, 'product.price', {
      goodsId: '77', skuPriceList: [{ skuId: '9', groupPriceCents: 2799 }],
    })).ok).toBe(true);
    const pddBody = JSON.parse(String(cap.init?.body)) as Record<string, unknown>;
    expect(pddBody.type).toBe('pdd.goods.sku.price.update');
    expect(pddBody.sku_price_list).toEqual([{ sku_id: 9, group_price: 2799 }]);

    // 1688 上下架
    cap = {};
    mockFetch(200, { result: { success: true } }, cap);
    const ali = parseAli1688Creds(JSON.stringify({ appKey: 'k', appSecret: 's', accessToken: 't' }))!;
    expect((await runPlatformAction('1688', ali, 'product.listing', { productIds: ['11'], online: false })).ok).toBe(true);
    expect(cap.url).toContain('/com.alibaba.product/alibaba.product.expire/');
  });
});

describe('Amazon SP-API', () => {
  it('★★ SigV4 用 AWS region（eu→eu-west-1），body 请求把 content-type 纳入签名', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('api.amazon.com')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const creds: AmazonSpApiCreds = {
      clientId: 'c', clientSecret: 's', refreshToken: 'r',
      awsAccessKeyId: 'AK', awsSecretAccessKey: 'SK', region: 'eu', marketplaceIds: ['M'],
    };
    await spApiRequest(creds, 'PATCH', '/listings/2021-08-01/items/SELLER/SKU', { marketplaceIds: 'M' }, { productType: 'X', patches: [] });

    const sp = calls.find((c) => c.url.includes('sellingpartnerapi-eu'));
    expect(sp, '应打到欧洲 SP-API 域名').toBeTruthy();
    const headers = sp!.init?.headers as Record<string, string>;
    expect(headers.authorization).toContain('/eu-west-1/execute-api/aws4_request');
    expect(headers.authorization).toContain('content-type');
    expect(headers['x-amz-access-token']).toBe('tok');
  });
});

describe('注册表', () => {
  it('★ 已接入客户端的能力与凭据字段可查询；没有客户端的平台回落空数组', () => {
    expect(platformApiOf('shopify')?.label).toContain('Shopify');
    expect(platformCapabilitiesOf('shopify')).toContain('order.list');
    expect(platformCapabilitiesOf('tiktok')).toContain('product.stock');
    expect(platformCapabilitiesOf('winit')).toContain('order.ship');
    expect(platformCapabilitiesOf('amazon')).toContain('order.ship');
    expect(platformCapabilitiesOf('taobao')).toContain('product.listing');
    expect(platformCapabilitiesOf('pdd')).toContain('order.ship');
    expect(platformCapabilitiesOf('1688')).toContain('product.stock');
    expect(platformCredentialFieldsOf('shopify').some((f) => f.key === 'accessToken' && f.secret)).toBe(true);
    expect(platformCredentialFieldsOf('amazon').some((f) => f.key === 'sellerId')).toBe(true);
    expect(platformCredentialFieldsOf('taobao').some((f) => f.key === 'session' && f.secret)).toBe(true);
    expect(platformApiOf('nonexistent-platform')).toBeUndefined();
    expect(platformCredentialFieldsOf('nonexistent-platform')).toEqual([]);
  });
});

describe('诚实性 · 2xx 空/非 JSON 不能算成功', () => {
  it('★ 淘宝自检遇到 HTML 登录页/网关错误页 → 失败且 step=api', async () => {
    mockFetch(200, '<html>please login</html>');
    const creds = parseTaobaoCreds(JSON.stringify({ appKey: 'k', appSecret: 's', session: 'sess' }))!;
    const r = await taobaoTest(creds);
    expect(r.ok).toBe(false);
    expect(r.step).toBe('api');
  });

  it('★ 万邑通空 200 → 失败，不再返回“已连接”', async () => {
    mockFetch(200, '');
    const creds = parseWinitCreds(JSON.stringify({ appKey: 'k', token: 't', platform: 'p', clientId: 'id', clientSecret: 's' }))!;
    const r = await winitTest(creds);
    expect(r.ok).toBe(false);
    expect(r.step).toBe('api');
  });

  it('★ 缺少业务码的 JSON（{}）不能被当成成功', async () => {
    mockFetch(200, {});
    const creds = parseWinitCreds(JSON.stringify({ appKey: 'k', token: 't', platform: 'p', clientId: 'id', clientSecret: 's' }))!;
    const r = await winitTest(creds);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('无法识别');
  });
});

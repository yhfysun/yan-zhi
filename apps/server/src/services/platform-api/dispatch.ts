/**
 * 平台 API 统一分发（2026-10-22）：把「动作名 + payload」映射到各平台客户端函数。
 *
 * ★ 这是"所有能力接入"的运行时入口：插件（AI 工具 / 路由）只调 runPlatformAction，
 *   不关心平台差异；能力矩阵没标 implemented 的动作会返回 unsupported，绝不假装成功。
 *
 * payload 里需要平台侧标识（SKU / productId / variantId / orderId 等），因为本地库
 * 存的是自己的 id；后续适配器会用 attrs_json 里的平台 id 做映射。
 */
import type { PlatformApiCapability, PlatformApiProbe, PlatformCredentialValues } from './types.js';
import { platformApiOf } from './index.js';
import { amazonConfirmShipment, amazonFbaInventory, amazonGetListing, amazonListOrders, amazonSearchCatalog, amazonUpdatePrice, amazonUpdateStock, amazonUpdateTitle } from './amazon.js';
import {
  shopifyCreateFulfillment, shopifyGetFulfillment, shopifyGetProduct, shopifyGetVariant,
  shopifyListFulfillmentOrders, shopifyListOrders, shopifyListProducts, shopifyUpdateProduct, shopifyUpdateVariantPrice,
} from './shopify.js';
import { tiktokGetProduct, tiktokListOrders, tiktokListProducts, tiktokSetListing, tiktokShipPackage, tiktokUpdateInventory, tiktokUpdatePrice, tiktokUpdateProduct } from './tiktok.js';
import { taobaoGetItem, taobaoListOrders, taobaoListProducts, taobaoSetListing, taobaoShipOffline, taobaoUpdateItem, taobaoUpdateStock } from './taobao.js';
import { pddGetGoods, pddListOrders, pddListProducts, pddSetListing, pddShip, pddUpdateSkuPrice, pddUpdateStock, pddUpdateTitle } from './pdd.js';
import { ali1688GetProduct, ali1688ListOrders, ali1688ListProducts, ali1688SetListing, ali1688ShipOffline, ali1688UpdateStock, ali1688UpdateTitle } from './ali1688.js';
import { douyinEditSkuPrice, douyinLaunchProduct, douyinListOrders, douyinListProducts, douyinLogisticsAdd, douyinRequest, douyinSetOffline, douyinSyncStock } from './douyin.js';
import { kuaishouEditItem, kuaishouGetItem, kuaishouListOrders, kuaishouListProducts, kuaishouOrderDeliver } from './kuaishou.js';
import { winitCreateOutbound, winitInventory, winitListOutbound, winitListProducts } from './winit.js';

export interface PlatformActionResult {
  ok: boolean;
  data?: unknown;
  message?: string;
  step?: PlatformApiProbe['step'];
}

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string): string => String(p[k] ?? '').trim();
const num = (p: Payload, k: string): number => Number(p[k] ?? 0);
const bool = (p: Payload, k: string): boolean => p[k] === true || p[k] === 'true' || p[k] === 1;

/** 把各客户端返回的异构结果归一 */
function norm(r: unknown): PlatformActionResult {
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (typeof o.ok === 'boolean') {
      const data = o.data ?? o.products ?? o.orders ?? o.product ?? o.variant ?? o.message ?? undefined;
      return {
        ok: o.ok,
        data: o.ok ? data : undefined,
        message: o.ok ? (typeof o.message === 'string' ? o.message : undefined) : String(o.message ?? '平台返回失败'),
        step: o.step as PlatformApiProbe['step'] | undefined,
      };
    }
  }
  return { ok: true, data: r };
}

function required(p: Payload, keys: string[]): string | null {
  const missing = keys.filter((k) => p[k] === undefined || p[k] === null || String(p[k]).trim() === '');
  return missing.length ? `缺少参数：${missing.join('、')}` : null;
}

export async function runPlatformAction(
  platformId: string,
  creds: PlatformCredentialValues,
  action: PlatformApiCapability,
  payload: Payload = {},
): Promise<PlatformActionResult> {
  const client = platformApiOf(platformId);
  if (!client) return { ok: false, message: `「${platformId}」还没有 API 客户端`, step: 'creds' };
  if (action === 'test') return { ...(await client.test(creds)) };
  if (!client.capabilities.includes(action)) {
    return { ok: false, message: `「${client.label}」尚未实现能力：${action}（会在平台后台/跳转计划中完成）`, step: 'api' };
  }

  try {
  switch (`${platformId}:${action}`) {
    // ---------- Shopify ----------
    case 'shopify:product.list':
      return norm(await shopifyListProducts(creds, { limit: num(payload, 'limit') || 50 }));
    case 'shopify:product.update': {
      const missing = required(payload, ['productId']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await shopifyUpdateProduct(creds, str(payload, 'productId'), {
        title: payload.title != null ? String(payload.title) : undefined,
        status: payload.status === 'active' || payload.status === 'draft' || payload.status === 'archived' ? payload.status : undefined,
      }));
    }
    case 'shopify:product.price': {
      const missing = required(payload, ['variantId', 'price']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await shopifyUpdateVariantPrice(creds, str(payload, 'variantId'), String(payload.price)));
    }
    case 'shopify:order.list':
      return norm(await shopifyListOrders(creds, { limit: num(payload, 'limit') || 50 }));
    case 'shopify:order.ship': {
      // ★ Shopify 必须走 fulfillment 流程：订单 → fulfillment_orders → 创建 fulfillment
      const missing = required(payload, ['orderId', 'trackingNumber']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      const fo = await shopifyListFulfillmentOrders(creds, str(payload, 'orderId'));
      if (!fo.ok) return { ok: false, message: fo.message, step: fo.step };
      const open = (fo.fulfillmentOrders || []).filter((x) => {
        const s = String(x.status ?? '');
        return s === 'open' || s === 'in_progress' || s === 'scheduled';
      });
      if (!open.length) {
        return { ok: false, step: 'api', message: '该订单没有可履约的 fulfillment order（可能已发货、已取消或无待发商品）' };
      }
      const created = await shopifyCreateFulfillment(creds, {
        fulfillmentOrderIds: open.map((x) => String(x.id ?? '')).filter(Boolean),
        trackingNumber: str(payload, 'trackingNumber'),
        trackingCompany: payload.trackingCompany ? String(payload.trackingCompany) : undefined,
        notifyCustomer: bool(payload, 'notifyCustomer'),
      });
      if (!created.ok) return { ok: false, message: created.message, step: created.step };
      return { ok: true, data: created.fulfillment, message: `已创建 Shopify fulfillment（订单 ${str(payload, 'orderId')}）` };
    }

    // ---------- Amazon ----------
    case 'amazon:product.list':
      return norm(await amazonSearchCatalog(creds, {
        keywords: payload.keywords ? String(payload.keywords) : undefined,
        identifiers: Array.isArray(payload.identifiers) ? payload.identifiers.map(String) : undefined,
        identifiersType: payload.identifiersType ? String(payload.identifiersType) : undefined,
        pageSize: num(payload, 'pageSize') || 10,
      }));
    case 'amazon:product.update': {
      const missing = required(payload, ['sku', 'productType', 'title']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await amazonUpdateTitle(creds, str(payload, 'sku'), str(payload, 'productType'), String(payload.title)));
    }
    case 'amazon:product.price': {
      const missing = required(payload, ['sku', 'productType', 'amount']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await amazonUpdatePrice(creds, str(payload, 'sku'), str(payload, 'productType'), num(payload, 'amount'), String(payload.currency || 'USD')));
    }
    case 'amazon:product.stock': {
      const missing = required(payload, ['sku', 'productType', 'quantity']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await amazonUpdateStock(creds, str(payload, 'sku'), str(payload, 'productType'), num(payload, 'quantity')));
    }
    case 'amazon:inventory.get':
      return norm(await amazonFbaInventory(creds, {
        sellerSkus: Array.isArray(payload.sellerSkus) ? payload.sellerSkus.map(String) : undefined,
      }));
    case 'amazon:order.list':
      return norm(await amazonListOrders(creds, {
        createdAfter: payload.createdAfter ? String(payload.createdAfter) : undefined,
        statuses: Array.isArray(payload.statuses) ? payload.statuses.map(String) : undefined,
        maxResults: num(payload, 'maxResults') || 50,
      }));
    case 'amazon:order.ship': {
      const missing = required(payload, ['orderId', 'carrierCode', 'trackingNumber']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      if (!Array.isArray(payload.orderItems) || !payload.orderItems.length) {
        return { ok: false, message: '缺少 orderItems（[{orderItemId, quantity}]，来自订单详情）', step: 'creds' };
      }
      return norm(await amazonConfirmShipment(creds, str(payload, 'orderId'), {
        carrierCode: str(payload, 'carrierCode'),
        trackingNumber: str(payload, 'trackingNumber'),
        orderItems: (payload.orderItems as Array<Record<string, unknown>>).map((i) => ({
          orderItemId: String(i.orderItemId ?? ''),
          quantity: Number(i.quantity ?? 1),
        })),
      }));
    }

    // ---------- 淘宝 / 天猫 ----------
    case 'taobao:product.list':
      return norm(await taobaoListProducts(creds, { pageNo: num(payload, 'pageNo') || 1, pageSize: num(payload, 'pageSize') || 20 }));
    case 'taobao:product.update': {
      const missing = required(payload, ['numIid']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await taobaoUpdateItem(creds, str(payload, 'numIid'), { title: payload.title != null ? String(payload.title) : undefined }));
    }
    case 'taobao:product.price': {
      const missing = required(payload, ['numIid', 'price']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await taobaoUpdateItem(creds, str(payload, 'numIid'), { price: String(payload.price) }));
    }
    case 'taobao:product.stock': {
      const missing = required(payload, ['numIid', 'quantity']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await taobaoUpdateStock(creds, str(payload, 'numIid'), num(payload, 'quantity'), {
        skuId: payload.skuId ? String(payload.skuId) : undefined,
        outerId: payload.outerId ? String(payload.outerId) : undefined,
        type: payload.type === 2 ? 2 : 1,
      }));
    }
    case 'taobao:product.listing': {
      const missing = required(payload, ['numIid']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await taobaoSetListing(creds, str(payload, 'numIid'), bool(payload, 'online')));
    }
    case 'taobao:order.list':
      return norm(await taobaoListOrders(creds, {
        startCreated: payload.startCreated ? String(payload.startCreated) : undefined,
        endCreated: payload.endCreated ? String(payload.endCreated) : undefined,
        status: payload.status ? String(payload.status) : undefined,
        pageNo: num(payload, 'pageNo') || 1,
        pageSize: num(payload, 'pageSize') || 20,
      }));
    case 'taobao:order.ship': {
      const missing = required(payload, ['tid', 'companyCode', 'outSid']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await taobaoShipOffline(creds, str(payload, 'tid'), str(payload, 'companyCode'), str(payload, 'outSid')));
    }

    // ---------- 拼多多 ----------
    case 'pdd:product.list':
      return norm(await pddListProducts(creds, { page: num(payload, 'page') || 1, pageSize: num(payload, 'pageSize') || 20 }));
    case 'pdd:product.update': {
      const missing = required(payload, ['goodsId', 'title']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await pddUpdateTitle(creds, str(payload, 'goodsId'), String(payload.title)));
    }
    case 'pdd:product.price': {
      const missing = required(payload, ['goodsId']);
      if (missing || !Array.isArray(payload.skuPriceList)) {
        return { ok: false, message: '缺少 goodsId / skuPriceList（[{skuId, groupPriceCents, singlePriceCents}]）', step: 'creds' };
      }
      return norm(await pddUpdateSkuPrice(creds, str(payload, 'goodsId'), payload.skuPriceList as Array<{ skuId: string | number; groupPriceCents?: number; singlePriceCents?: number }>));
    }
    case 'pdd:product.stock': {
      const missing = required(payload, ['goodsId', 'quantity']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await pddUpdateStock(creds, str(payload, 'goodsId'), num(payload, 'quantity'), {
        skuId: payload.skuId != null ? String(payload.skuId) : undefined,
        outerId: payload.outerId ? String(payload.outerId) : undefined,
        updateType: payload.updateType === 2 ? 2 : 1,
      }));
    }
    case 'pdd:product.listing': {
      const missing = required(payload, ['goodsId']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await pddSetListing(creds, str(payload, 'goodsId'), bool(payload, 'online')));
    }
    case 'pdd:order.list':
      return norm(await pddListOrders(creds, {
        startConfirmAt: payload.startConfirmAt ? String(payload.startConfirmAt) : undefined,
        endConfirmAt: payload.endConfirmAt ? String(payload.endConfirmAt) : undefined,
        page: num(payload, 'page') || 1,
        pageSize: num(payload, 'pageSize') || 20,
      }));
    case 'pdd:order.ship': {
      const missing = required(payload, ['orderSn', 'logisticsId', 'trackingNumber']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await pddShip(creds, str(payload, 'orderSn'), num(payload, 'logisticsId'), str(payload, 'trackingNumber')));
    }

    // ---------- 1688 ----------
    case '1688:product.list':
      return norm(await ali1688ListProducts(creds, { pageNo: num(payload, 'pageNo') || 1, pageSize: num(payload, 'pageSize') || 20 }));
    case '1688:product.update': {
      const missing = required(payload, ['productId', 'title']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await ali1688UpdateTitle(creds, str(payload, 'productId'), String(payload.title)));
    }
    case '1688:product.stock': {
      const missing = required(payload, ['productId']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await ali1688UpdateStock(creds, str(payload, 'productId'), {
        amount: payload.amount != null ? num(payload, 'amount') : undefined,
        increment: bool(payload, 'increment'),
      }));
    }
    case '1688:product.listing': {
      if (!Array.isArray(payload.productIds)) {
        return { ok: false, message: '缺少 productIds（数组）', step: 'creds' };
      }
      return norm(await ali1688SetListing(creds, payload.productIds.map(String), bool(payload, 'online')));
    }
    case '1688:order.list':
      return norm(await ali1688ListOrders(creds, {
        page: num(payload, 'page') || 1,
        pageSize: num(payload, 'pageSize') || 20,
        orderStatus: payload.orderStatus ? String(payload.orderStatus) : undefined,
      }));
    case '1688:order.ship': {
      const missing = required(payload, ['orderId', 'cpCode', 'mailNo']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await ali1688ShipOffline(creds, {
        orderId: str(payload, 'orderId'), cpCode: str(payload, 'cpCode'), mailNo: str(payload, 'mailNo'),
      }));
    }

    // ---------- TikTok Shop ----------
    case 'tiktok:product.list':
      return norm(await tiktokListProducts(creds, { pageSize: num(payload, 'pageSize') || 20 }));
    case 'tiktok:product.update': {
      const missing = required(payload, ['productId', 'title']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await tiktokUpdateProduct(creds, str(payload, 'productId'), { productName: String(payload.title) }));
    }
    case 'tiktok:product.price': {
      const missing = required(payload, ['productId', 'skuId', 'amount']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await tiktokUpdatePrice(creds, str(payload, 'productId'), str(payload, 'skuId'), String(payload.amount), String(payload.currency || 'USD')));
    }
    case 'tiktok:product.stock': {
      const missing = required(payload, ['productId', 'skuId', 'warehouseId', 'quantity']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await tiktokUpdateInventory(creds, str(payload, 'productId'), str(payload, 'skuId'), str(payload, 'warehouseId'), num(payload, 'quantity')));
    }
    case 'tiktok:product.listing': {
      const missing = required(payload, ['productId']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await tiktokSetListing(creds, str(payload, 'productId'), bool(payload, 'online')));
    }
    case 'tiktok:order.list':
      return norm(await tiktokListOrders(creds, { pageSize: num(payload, 'pageSize') || 20, status: payload.status ? String(payload.status) : undefined }));
    case 'tiktok:order.ship': {
      const missing = required(payload, ['packageId', 'trackingNumber', 'shippingProviderId']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await tiktokShipPackage(creds, str(payload, 'packageId'), str(payload, 'trackingNumber'), str(payload, 'shippingProviderId')));
    }

    // ---------- 万邑通 ----------
    case 'winit:product.list':
      return norm(await winitListProducts(creds, { pageNo: num(payload, 'pageNo') || 1, pageSize: num(payload, 'pageSize') || 50 }));
    case 'winit:inventory.get':
      return norm(await winitInventory(creds, {
        productCode: payload.productCode ? String(payload.productCode) : undefined,
        warehouseCode: payload.warehouseCode ? String(payload.warehouseCode) : undefined,
      }));
    case 'winit:order.list':
      return norm(await winitListOutbound(creds, { pageNum: num(payload, 'pageNum') || 1, pageSize: num(payload, 'pageSize') || 50 }));
    case 'winit:order.ship': {
      if (!payload.order || typeof payload.order !== 'object') {
        return { ok: false, message: '缺少 order（出库单明细：仓库/收件人/productList 等）', step: 'creds' };
      }
      return norm(await winitCreateOutbound(creds, payload.order as Record<string, unknown>));
    }

    // ---------- 抖店（抖音小店） ----------
    case 'douyin:product.list':
      return norm(await douyinListProducts(creds, { page: num(payload, 'page') || 1, pageSize: num(payload, 'pageSize') || 20 }));
    case 'douyin:product.update':
      // 抖店没有单独「改标题」接口：编辑走 product.editV2 全量编辑（要完整商品字段，风险大未接），
      // 如实说明，不让 AI 误以为改成功。
      return { ok: false, step: 'api', message: '抖店改标题需走 product.editV2 全量编辑接口（需完整商品字段，风险高未接入），请到抖店后台修改' };
    case 'douyin:product.price': {
      const missing = required(payload, ['productId', 'skuId', 'price']);
      if (missing) return { ok: false, message: `${missing}（单位：分）`, step: 'creds' };
      return norm(await douyinEditSkuPrice(creds, str(payload, 'productId'), str(payload, 'skuId'), Math.round(num(payload, 'price'))));
    }
    case 'douyin:product.stock': {
      const missing = required(payload, ['skuId', 'quantity']);
      if (missing) return { ok: false, message: `${missing}（sku.syncStock 全量同步）`, step: 'creds' };
      return norm(await douyinSyncStock(creds, str(payload, 'skuId'), Math.round(num(payload, 'quantity'))));
    }
    case 'douyin:product.listing': {
      const missing = required(payload, ['productId']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await (bool(payload, 'online')
        ? douyinLaunchProduct(creds, str(payload, 'productId'))
        : douyinSetOffline(creds, str(payload, 'productId'))));
    }
    case 'douyin:order.list':
      return norm(await douyinListOrders(creds, {
        page: num(payload, 'page') || 0,
        pageSize: num(payload, 'pageSize') || 20,
        mainStatus: payload.mainStatus ? String(payload.mainStatus) : undefined,
      }));
    case 'douyin:order.ship': {
      const missing = required(payload, ['orderId', 'companyCode', 'trackingNumber']);
      if (missing) return { ok: false, message: `抖店发货需要${missing}（companyCode 从 order.logisticsCompanyList 查）`, step: 'creds' };
      return norm(await douyinLogisticsAdd(creds, str(payload, 'orderId'), str(payload, 'companyCode'), str(payload, 'trackingNumber')));
    }

    // ---------- 快手小店 ----------
    case 'kuaishou:product.list':
      return norm(await kuaishouListProducts(creds, { page: num(payload, 'page') || 1, pageSize: num(payload, 'pageSize') || 20 }));
    case 'kuaishou:product.update': {
      const missing = required(payload, ['kwaiItemId', 'title']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await kuaishouEditItem(creds, str(payload, 'kwaiItemId'), { title: String(payload.title) }));
    }
    case 'kuaishou:product.price': {
      const missing = required(payload, ['kwaiItemId', 'price']);
      if (missing) return { ok: false, message: `${missing}（单位：分）`, step: 'creds' };
      return norm(await kuaishouEditItem(creds, str(payload, 'kwaiItemId'), { priceCents: Math.round(num(payload, 'price')) }));
    }
    case 'kuaishou:product.stock': {
      const missing = required(payload, ['kwaiItemId', 'quantity']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await kuaishouEditItem(creds, str(payload, 'kwaiItemId'), { stock: Math.round(num(payload, 'quantity')) }));
    }
    case 'kuaishou:product.listing': {
      const missing = required(payload, ['kwaiItemId']);
      if (missing) return { ok: false, message: missing, step: 'creds' };
      return norm(await kuaishouEditItem(creds, str(payload, 'kwaiItemId'), { online: bool(payload, 'online') }));
    }
    case 'kuaishou:order.list':
      return norm(await kuaishouListOrders(creds, { pageSize: num(payload, 'pageSize') || 20, pcursor: payload.pcursor ? String(payload.pcursor) : undefined }));
    case 'kuaishou:order.ship': {
      const missing = required(payload, ['orderId', 'expressCode', 'trackingNumber']);
      if (missing) return { ok: false, message: `快手发货需要${missing}（expressCode 从快递公司列表接口查，数字编码）`, step: 'creds' };
      return norm(await kuaishouOrderDeliver(creds, str(payload, 'orderId'), str(payload, 'expressCode'), str(payload, 'trackingNumber')));
    }

    default:
      return { ok: false, message: `「${client.label}」的 ${action} 尚未接入`, step: 'api' };
  }
  } catch (e) {
    // ★ 客户端内部抛错（如 Amazon SP-API 非 2xx）也要归一成可读结果，
    //   不能让路由层拿到一个未捕获异常变成 500「请求失败」。
    return { ok: false, step: 'api', message: `平台请求异常：${(e as Error).message || String(e)}` };
  }
}

export interface PlatformReadback {
  supported: boolean;
  ok?: boolean;
  data?: unknown;
  message?: string;
}

/**
 * 写操作后的回读（硬约束：获批执行后必须回读并审计）。
 * ★ 只覆盖客户端确实提供了读接口的动作；没有读接口的平台如实返回 supported:false，
 *   由调用方在结果里说明“平台未提供回读”，而不是假装读到了。
 */
export async function readbackPlatformAction(
  platformId: string,
  creds: PlatformCredentialValues,
  action: PlatformApiCapability,
  payload: Payload = {},
): Promise<PlatformReadback> {
  try {
    switch (`${platformId}:${action}`) {
      case 'shopify:product.price': {
        const r = await shopifyGetVariant(creds, str(payload, 'variantId')) as { ok: boolean; variant?: unknown; message?: string };
        return { supported: true, ok: r.ok, data: r.variant, message: r.message };
      }
      case 'shopify:product.update': {
        const r = await shopifyGetProduct(creds, str(payload, 'productId')) as { ok: boolean; product?: unknown; message?: string };
        return { supported: true, ok: r.ok, data: r.product, message: r.message };
      }
      case 'shopify:order.ship': {
        // 发货后回读订单的履约单状态
        const r = await shopifyListFulfillmentOrders(creds, str(payload, 'orderId')) as { ok: boolean; fulfillmentOrders?: unknown; message?: string };
        return { supported: true, ok: r.ok, data: r.fulfillmentOrders, message: r.message };
      }
      case 'amazon:product.price':
      case 'amazon:product.update':
      case 'amazon:product.stock': {
        const r = await amazonGetListing(creds, str(payload, 'sku'));
        return { supported: true, ok: true, data: r };
      }
      case 'taobao:product.price':
      case 'taobao:product.update':
      case 'taobao:product.stock':
      case 'taobao:product.listing': {
        const r = await taobaoGetItem(creds, str(payload, 'numIid'));
        return { supported: true, ok: r.ok, data: r.data, message: r.message };
      }
      case 'pdd:product.price':
      case 'pdd:product.update':
      case 'pdd:product.stock':
      case 'pdd:product.listing': {
        const r = await pddGetGoods(creds, str(payload, 'goodsId'));
        return { supported: true, ok: r.ok, data: r.data, message: r.message };
      }
      case '1688:product.update':
      case '1688:product.stock':
      case '1688:product.listing': {
        const productId = payload.productId ? str(payload, 'productId') : (Array.isArray(payload.productIds) ? String((payload.productIds as unknown[])[0] ?? '') : '');
        const r = await ali1688GetProduct(creds, productId);
        return { supported: true, ok: r.ok, data: r.data, message: r.message };
      }
      case 'tiktok:product.price':
      case 'tiktok:product.update':
      case 'tiktok:product.stock':
      case 'tiktok:product.listing': {
        const r = await tiktokGetProduct(creds, str(payload, 'productId'));
        return { supported: true, ok: r.ok, data: r.data, message: r.message };
      }
      case 'douyin:product.price':
      case 'douyin:product.stock':
      case 'douyin:product.listing': {
        // 抖店回读：product.detail 按商品 ID 查详情（价格/库存/上下架状态都在）
        const r = await douyinRequest(creds, 'product.detail', { product_id: str(payload, 'productId') });
        return { supported: true, ok: r.ok, data: r.data, message: r.message };
      }
      case 'kuaishou:product.price':
      case 'kuaishou:product.update':
      case 'kuaishou:product.stock':
      case 'kuaishou:product.listing': {
        const r = await kuaishouGetItem(creds, str(payload, 'kwaiItemId'));
        return { supported: true, ok: r.ok, data: r.data, message: r.message };
      }
      case 'winit:order.ship': {
        const order = (payload.order && typeof payload.order === 'object') ? payload.order as Record<string, unknown> : {};
        const trackingNo = String(order.trackingNo ?? order.trackingNumber ?? order.mailNo ?? '');
        const r = await winitListOutbound(creds, { trackingNo: trackingNo || undefined, pageSize: 5 });
        return { supported: true, ok: r.ok, data: r.data, message: r.message };
      }
      default:
        return { supported: false, message: '该平台客户端暂未实现写后回读' };
    }
  } catch (e) {
    return { supported: true, ok: false, message: `回读失败：${(e as Error).message || String(e)}` };
  }
}

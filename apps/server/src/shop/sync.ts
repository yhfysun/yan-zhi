/**
 * 本地业务库 ↔ 平台 API 同步（2026-10-22）。
 *
 * 两个方向：
 *   importProducts / importOrders：平台 → 本地（按 SKU / 订单号 upsert，平台 ID 写进 attrs_json）
 *   pushProduct / pushShipment：本地 → 平台（用 attrs 里的平台 ID 调 runPlatformAction）
 *
 * ★ 诚实边界：
 *   - 没有平台 ID（或平台没有对应能力）时如实失败，不伪造"已同步"；
 *   - 每次同步结果写 attrs.sync = { status: synced|failed, at, error }，界面据此显示角标；
 *   - 金额一律整数分；平台返回的元/字符串价格在这里统一换算。
 */
import * as store from './store.js';
import type { ListingStatus, OrderItem, OrderStatus, Product, ShopContext } from './types.js';
import type { PlatformCredentialValues } from '../services/platform-api/types.js';
import { readbackPlatformAction, runPlatformAction, type PlatformReadback } from '../services/platform-api/dispatch.js';
import { shopifyListOrders, shopifyListProducts } from '../services/platform-api/shopify.js';
import { amazonGetOrderItems, amazonListOrders, amazonSearchCatalog, amazonSearchListings } from '../services/platform-api/amazon.js';
import { taobaoListOrders, taobaoListProducts } from '../services/platform-api/taobao.js';
import { pddListOrders, pddListProducts } from '../services/platform-api/pdd.js';
import { ali1688ListOrders, ali1688ListProducts } from '../services/platform-api/ali1688.js';
import { tiktokListOrders, tiktokListProducts } from '../services/platform-api/tiktok.js';
import { winitListProducts } from '../services/platform-api/winit.js';

export interface SyncSummary {
  imported: number;
  updated: number;
  skipped: number;
  /** 平台值与本地状态冲突、按策略保留本地值的条数（D：冲突策略可审计） */
  conflicts: number;
  errors: string[];
}

/** 冲突策略：local-first=本地字段优先（库存/价格不被平台覆盖）；platform-first=平台值优先 */
export type SyncPolicy = 'local-first' | 'platform-first';

export interface SyncOptions {
  policy?: SyncPolicy;
  /** 失败重试（仅对网络/限流生效；默认开启） */
  retry?: boolean;
}

export interface PushFieldResult {
  field: string;
  ok: boolean;
  message?: string;
  /** 写后回读结果（硬约束：获批执行后必须回读并审计） */
  readback?: PlatformReadback;
}
export interface PushResult {
  ok: boolean;
  message: string;
  results: PushFieldResult[];
  /** 全部成功且至少回读一项时为 true */
  verified?: boolean;
}

const retryable = (step?: string): boolean => step === 'rate' || step === 'network';

/** 只对网络/限流重试的只读包装；写操作绝不自动重试（避免重复下单/重复发货） */
async function retryRead<R extends { ok: boolean; step?: string }>(fn: () => Promise<R>, enabled = true): Promise<R> {
  let r = await fn();
  for (let i = 0; enabled && !r.ok && retryable(r.step) && i < 2; i++) {
    await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    r = await fn();
  }
  return r;
}

const yuanToCents = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const asCents = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
/** 拼多多价格字段是“分”；兼容少数返回带小数的元字符串 */
const pddPriceCents = (v: unknown): number => {
  if (v === undefined || v === null || v === '') return 0;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? Math.round(Number(s)) : yuanToCents(s);
};
const asInt = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const strOr = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : String(v));

function syncStamped(attrs: Record<string, unknown>, ok: boolean, error?: string): Record<string, unknown> {
  return { ...attrs, sync: { status: ok ? 'synced' : 'failed', at: Date.now(), ...(error ? { error } : {}) } };
}

// ======================= 商品：平台 → 本地 =======================

interface NormProduct {
  sku: string;
  title: string;
  priceCents: number;
  currency: string;
  stock?: number;
  listingStatus: ListingStatus;
  imageUrl?: string;
  attrs: Record<string, unknown>;
}

function upsertPlatformProduct(
  shop: ShopContext,
  norm: NormProduct,
  policy: SyncPolicy = 'local-first',
): { kind: 'created' | 'updated'; warning?: string } {
  const cur = store.findProductBySku(shop.id, norm.sku);
  let warning: string | undefined;
  if (cur) {
    // ★ 冲突策略：local-first 不动本地价格/标题/库存（库存以本地经营为准）；
    //   platform-first 才用平台值覆盖。平台 ID 与 sync 状态两边都会更新。
    if (policy === 'platform-first' && shop.supplyMode !== 'dropship' && norm.stock != null && norm.stock !== cur.stock) {
      try {
        store.changeStock({ shopId: shop.id, productId: cur.id, kind: 'adjust', qty: norm.stock - cur.stock, reason: '平台同步', actor: 'human' });
      } catch (e) {
        warning = `库存未同步：${(e as Error).message}`;
      }
    }
    const attrs = syncStamped({ ...(cur.attrs || {}), ...norm.attrs }, !warning, warning);
    const patch: Parameters<typeof store.updateProduct>[2] = policy === 'platform-first'
      ? {
        title: norm.title || cur.title,
        imageUrl: norm.imageUrl ?? cur.imageUrl,
        priceCents: norm.priceCents || cur.priceCents,
        currency: norm.currency || cur.currency,
        listingStatus: norm.listingStatus,
        attrs,
      }
      : { attrs };
    store.updateProduct(shop.id, cur.id, patch);
    return { kind: 'updated', warning };
  }
  const created = store.createProduct(shop.id, {
    sku: norm.sku,
    title: norm.title || norm.sku,
    imageUrl: norm.imageUrl,
    supplyMode: shop.supplyMode,
    sourceRef: typeof norm.attrs.sourceRef === 'string' ? norm.attrs.sourceRef : undefined,
    costCents: 0,
    priceCents: norm.priceCents,
    currency: norm.currency || 'CNY',
    stock: 0,
    safetyStock: 0,
    listingStatus: norm.listingStatus,
    attrs: syncStamped(norm.attrs, true),
  });
  if (shop.supplyMode !== 'dropship' && (norm.stock || 0) > 0) {
    try {
      store.changeStock({ shopId: shop.id, productId: created.id, kind: 'in', qty: norm.stock!, reason: '平台同步', actor: 'human' });
    } catch (e) {
      warning = `库存未同步：${(e as Error).message}`;
      store.updateProduct(shop.id, created.id, { attrs: syncStamped(norm.attrs, false, warning) });
    }
  }
  return { kind: 'created', warning };
}

function normShopifyProducts(data: Array<Record<string, unknown>>, currency: string): NormProduct[] {
  const out: NormProduct[] = [];
  for (const p of data) {
    const variants = Array.isArray(p.variants) ? p.variants as Array<Record<string, unknown>> : [];
    for (const v of variants) {
      const sku = strOr(v.sku) || `${p.id}-${v.id}`;
      const status = strOr(p.status);
      out.push({
        sku,
        title: strOr(p.title, sku),
        priceCents: yuanToCents(v.price),
        currency,
        stock: undefined,
        listingStatus: status === 'active' ? 'online' : status === 'draft' ? 'draft' : 'offline',
        imageUrl: (p.image as { src?: string } | undefined)?.src,
        attrs: {
          platform: 'shopify',
          platformProductId: strOr(p.id),
          platformVariantId: strOr(v.id),
          platformSkuId: strOr(v.sku),
        },
      });
    }
  }
  return out;
}

function normAmazonProducts(items: Array<Record<string, unknown>>): NormProduct[] {
  const out: NormProduct[] = [];
  for (const it of items) {
    const asin = strOr(it.asin);
    if (!asin) continue;
    const summaries = Array.isArray(it.summaries) ? it.summaries as Array<Record<string, unknown>> : [];
    const s = summaries[0] || {};
    // 卖家 SKU 只有卖家自己的 Listing 才有；目录搜索返回的是 ASIN。
    // Listings 写接口（改价/库存/标题）只认卖家 SKU，不能拿 ASIN 冒充。
    const sellerSku = strOr(it.sellerSku ?? s.sellerSku);
    out.push({
      sku: sellerSku || asin,
      title: strOr(s.itemName, asin),
      priceCents: 0,
      currency: 'USD',
      listingStatus: 'draft',
      attrs: {
        platform: 'amazon', platformProductId: asin, platformSkuId: sellerSku,
        productType: strOr(s.productType), priceUnknown: true,
      },
    });
  }
  return out;
}

/** Search Listings Items：卖家自己的 SKU + summary/offers（全量同步用） */
function normAmazonListings(items: Array<Record<string, unknown>>): NormProduct[] {
  const out: NormProduct[] = [];
  for (const it of items) {
    const sku = strOr(it.sku);
    if (!sku) continue;
    const summaries = Array.isArray(it.summaries) ? it.summaries as Array<Record<string, unknown>> : [];
    const s = summaries[0] || {};
    const offers = Array.isArray(it.offers) ? it.offers as Array<Record<string, unknown>> : [];
    const priceObj = (offers[0]?.price as { amount?: unknown; currency?: unknown } | undefined);
    const priceCents = priceObj?.amount != null ? yuanToCents(priceObj.amount) : 0;
    const status = strOr(s.status).toUpperCase();
    const image = s.mainProductImage as { link?: unknown } | undefined;
    out.push({
      sku,
      title: strOr(s.itemName, sku),
      priceCents,
      currency: strOr(priceObj?.currency, 'USD'),
      listingStatus: status === 'BUYABLE' || status === 'DISCOVERABLE' ? 'online' : 'draft',
      imageUrl: image?.link ? String(image.link) : undefined,
      attrs: {
        platform: 'amazon', platformProductId: strOr(s.asin), platformSkuId: sku,
        productType: strOr(s.productType), priceUnknown: priceObj?.amount == null,
      },
    });
  }
  return out;
}

function normTaobaoProducts(data: Record<string, unknown>): NormProduct[] {
  const items = ((data.items as { item?: Array<Record<string, unknown>> } | undefined)?.item) || [];
  return items.map((it) => {
    const numIid = strOr(it.num_iid);
    return {
      sku: strOr(it.outer_id) || numIid,
      title: strOr(it.title, numIid),
      priceCents: yuanToCents(it.price),
      currency: 'CNY',
      stock: asInt(it.num),
      listingStatus: strOr(it.approve_status) === 'onsale' ? 'online' : 'offline',
      attrs: { platform: 'taobao', platformProductId: numIid, platformSkuId: strOr(it.outer_id) },
    } as NormProduct;
  });
}

function normPddProducts(data: Record<string, unknown>): NormProduct[] {
  const list = (data.goods_list || data.goodsList || data.list || []) as Array<Record<string, unknown>>;
  return list.map((it) => {
    const goodsId = strOr(it.goods_id ?? it.goodsId);
    return {
      sku: strOr(it.outer_id ?? it.outerId) || goodsId,
      title: strOr(it.goods_name ?? it.goodsName, goodsId),
      priceCents: pddPriceCents(it.goods_price ?? it.goodsPrice ?? it.price),
      currency: 'CNY',
      stock: asInt(it.quantity ?? it.goods_quantity),
      listingStatus: Number(it.is_onsale ?? it.isOnsale ?? 1) ? 'online' : 'offline',
      attrs: { platform: 'pdd', platformProductId: goodsId, platformSkuId: strOr(it.sku_id ?? it.skuId) },
    } as NormProduct;
  });
}

function norm1688Products(data: Record<string, unknown>): NormProduct[] {
  const result = (data.result as Record<string, unknown> | undefined) || data;
  const list = (result.result || result.list || result.productList || []) as Array<Record<string, unknown>>;
  return list.map((it) => {
    const id = strOr(it.productID ?? it.productId);
    const saleInfo = (it.saleInfo as Record<string, unknown> | undefined) || {};
    const ranges = (saleInfo.priceRanges as Array<Record<string, unknown>> | undefined) || [];
    return {
      sku: strOr(it.outerId ?? it.sku) || id,
      title: strOr(it.subject, id),
      priceCents: yuanToCents(ranges[0]?.price ?? it.price),
      currency: 'CNY',
      listingStatus: strOr(it.status) === 'published' ? 'online' : 'offline',
      attrs: { platform: '1688', platformProductId: id },
    } as NormProduct;
  });
}

function normTiktokProducts(data: Record<string, unknown>): NormProduct[] {
  const list = (data.products || []) as Array<Record<string, unknown>>;
  const out: NormProduct[] = [];
  for (const p of list) {
    const pid = strOr(p.id);
    const status = strOr(p.status).toUpperCase();
    const skus = Array.isArray(p.skus) ? p.skus as Array<Record<string, unknown>> : [];
    for (const s of skus) {
      const inv = Array.isArray(s.inventory) ? s.inventory as Array<Record<string, unknown>> : [];
      out.push({
        sku: strOr(s.seller_sku) || `${pid}-${strOr(s.id)}`,
        title: strOr(p.title, pid),
        priceCents: yuanToCents((s.price as Record<string, unknown> | undefined)?.amount),
        currency: strOr((s.price as Record<string, unknown> | undefined)?.currency, 'USD'),
        stock: asInt(inv[0]?.quantity),
        listingStatus: status.includes('ACTIVE') || status.includes('LIVE') ? 'online' : 'draft',
        attrs: {
          platform: 'tiktok', platformProductId: pid, platformSkuId: strOr(s.id), platformWarehouseId: strOr(inv[0]?.warehouse_id),
        },
      });
    }
  }
  return out;
}

function normWinitProducts(data: Record<string, unknown>): NormProduct[] {
  const list = (data.list || data.items || data.records || []) as Array<Record<string, unknown>>;
  return list.map((it) => {
    const code = strOr(it.productCode ?? it.skuCode ?? it.code);
    return {
      sku: strOr(it.skuCode) || code,
      title: strOr(it.chineseName ?? it.productName ?? it.name, code),
      priceCents: 0,
      currency: 'CNY',
      stock: asInt(it.quantity ?? it.stock),
      listingStatus: 'online',
      attrs: { platform: 'winit', platformProductId: code },
    } as NormProduct;
  });
}

export async function importProductsFromPlatform(
  shop: ShopContext,
  creds: PlatformCredentialValues,
  opts: { keywords?: string; asins?: string[]; limit?: number; pages?: number } & SyncOptions = {},
): Promise<SyncSummary> {
  const sum: SyncSummary = { imported: 0, updated: 0, skipped: 0, conflicts: 0, errors: [] };
  const policy: SyncPolicy = opts.policy === 'local-first' ? 'local-first' : 'platform-first';
  const retry = opts.retry !== false;
  const pages = Math.max(1, Math.min(opts.pages ?? 1, 20));
  let norms: NormProduct[] = [];
  const pushAll = (list: NormProduct[]): void => {
    for (const n of list) {
      try {
        n.sku = n.sku.trim();
        if (!n.sku) { sum.skipped++; continue; }
        const r = upsertPlatformProduct(shop, n, policy);
        if (r.kind === 'created') sum.imported++; else sum.updated++;
        if (r.warning) sum.errors.push(`${n.sku}: ${r.warning}`);
      } catch (e) {
        sum.skipped++;
        sum.errors.push(`${n.sku || '?'}: ${(e as Error).message}`);
      }
    }
  };

  if (shop.platform === 'shopify') {
    let pageInfo = '';
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => shopifyListProducts(creds, {
        limit: opts.limit ?? 50,
        ...(pageInfo ? { pageInfo } : {}),
      }), retry);
      if (!r.ok) { sum.errors.push(r.message || 'Shopify 商品读取失败'); break; }
      norms.push(...normShopifyProducts(r.products || [], strOr(creds.currency, 'USD')));
      pageInfo = r.nextPageInfo || '';
      if (!pageInfo) break;
    }
  } else if (shop.platform === 'amazon') {
    if (opts.keywords || opts.asins?.length) {
      // 关键词/ASIN 搜索走 Catalog（返回 ASIN，价格未知，不适合直接推送）
      try {
        const r = await retryRead(async () => {
          try {
            const data = await amazonSearchCatalog(creds, { keywords: opts.keywords, identifiers: opts.asins, pageSize: opts.limit ?? 10 });
            return { ok: true, data };
          } catch (e) {
            return { ok: false, step: 'api', message: (e as Error).message };
          }
        }, retry);
        if (!r.ok) { sum.errors.push(`亚马逊商品读取失败：${r.message}`); return sum; }
        norms = normAmazonProducts((r.data as { items?: Array<Record<string, unknown>> }).items || []);
      } catch (e) {
        sum.errors.push(`亚马逊商品读取失败：${(e as Error).message}`);
        return sum;
      }
    } else {
      // 无关键词时走 Search Listings Items：全量卖家 SKU（最多 1000 条）
      let token = '';
      for (let page = 1; page <= pages; page++) {
        try {
          const r = await amazonSearchListings(creds, { pageSize: 20, pageToken: token || undefined });
          norms.push(...normAmazonListings(r.items));
          token = r.nextToken;
          if (!token) break;
        } catch (e) {
          sum.errors.push(`亚马逊 Listing 读取失败：${(e as Error).message}`);
          break;
        }
      }
    }
  } else if (shop.platform === 'taobao') {
    const pageSize = opts.limit ?? 20;
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => taobaoListProducts(creds, { pageNo: page, pageSize }), retry);
      if (!r.ok) { sum.errors.push(r.message || '淘宝商品读取失败'); break; }
      const list = normTaobaoProducts(r.data || {});
      norms.push(...list);
      if (list.length < pageSize) break;
    }
  } else if (shop.platform === 'pdd') {
    const pageSize = opts.limit ?? 20;
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => pddListProducts(creds, { page, pageSize }), retry);
      if (!r.ok) { sum.errors.push(r.message || '拼多多商品读取失败'); break; }
      const list = normPddProducts(r.data || {});
      norms.push(...list);
      if (list.length < pageSize) break;
    }
  } else if (shop.platform === '1688') {
    const pageSize = Math.min(opts.limit ?? 20, 20);
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => ali1688ListProducts(creds, { pageNo: page, pageSize }), retry);
      if (!r.ok) { sum.errors.push(r.message || '1688 商品读取失败'); break; }
      const list = norm1688Products(r.data || {});
      norms.push(...list);
      if (list.length < pageSize) break;
    }
  } else if (shop.platform === 'tiktok') {
    let token = '';
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => tiktokListProducts(creds, { pageSize: opts.limit ?? 20, pageToken: token || undefined }), retry);
      if (!r.ok) { sum.errors.push(r.message || 'TikTok 商品读取失败'); break; }
      const list = normTiktokProducts(r.data || {});
      norms.push(...list);
      token = String((r.data as { next_page_token?: unknown } | undefined)?.next_page_token ?? '');
      if (!token || !list.length) break;
    }
  } else if (shop.platform === 'winit') {
    const r = await retryRead(() => winitListProducts(creds, { pageSize: opts.limit ?? 50 }), retry);
    if (!r.ok) { sum.errors.push(r.message || '万邑通商品读取失败'); return sum; }
    norms = normWinitProducts(r.data || {});
  } else {
    sum.errors.push(`「${shop.platform}」没有商品导入适配`);
    return sum;
  }
  pushAll(norms);
  return sum;
}

// ======================= 商品：本地 → 平台 =======================

const WRITE_FIELDS = ['price', 'stock', 'title', 'listing'] as const;
export type SyncField = (typeof WRITE_FIELDS)[number];

function platformIdOf(p: Product, key: string): string {
  const v = (p.attrs as Record<string, unknown> | undefined)?.[key];
  return v === undefined || v === null ? '' : String(v);
}

/** 按平台构建某个字段的 action + payload；返回 error 表示该平台/商品不支持 */
function buildProductAction(
  platform: string, p: Product, field: SyncField,
): { action: 'product.price' | 'product.stock' | 'product.update' | 'product.listing'; payload: Record<string, unknown> } | { error: string } {
  const productId = platformIdOf(p, 'platformProductId');
  const skuId = platformIdOf(p, 'platformSkuId');
  switch (`${platform}:${field}`) {
    case 'shopify:price': {
      const variantId = platformIdOf(p, 'platformVariantId');
      if (!variantId) return { error: '缺少 platformVariantId（先从平台导入商品）' };
      return { action: 'product.price', payload: { variantId, price: (p.priceCents / 100).toFixed(2) } };
    }
    case 'amazon:price': {
      const sellerSku = platformIdOf(p, 'platformSkuId');
      if (!sellerSku) return { error: '缺少卖家 SKU（ASIN 不能用于 Listings 写接口；请在商品 attrs 补 platformSkuId）' };
      if (p.attrs?.priceUnknown === true || p.priceCents <= 0) {
        return { error: '价格未知或为 0，拒绝推送到亚马逊（避免把平台价改成 0）' };
      }
      return { action: 'product.price', payload: { sku: sellerSku, productType: platformIdOf(p, 'productType'), amount: p.priceCents / 100, currency: p.currency } };
    }
    case 'amazon:stock': {
      const sellerSku = platformIdOf(p, 'platformSkuId');
      if (!sellerSku) return { error: '缺少卖家 SKU（ASIN 不能用于 Listings 写接口）' };
      return { action: 'product.stock', payload: { sku: sellerSku, productType: platformIdOf(p, 'productType'), quantity: p.stock } };
    }
    case 'amazon:title': {
      const sellerSku = platformIdOf(p, 'platformSkuId');
      if (!sellerSku) return { error: '缺少卖家 SKU（ASIN 不能用于 Listings 写接口）' };
      return { action: 'product.update', payload: { sku: sellerSku, productType: platformIdOf(p, 'productType'), title: p.title } };
    }
    case 'taobao:price':
      if (!productId) return { error: '缺少 platformProductId（num_iid）' };
      return { action: 'product.price', payload: { numIid: productId, price: (p.priceCents / 100).toFixed(2) } };
    case 'taobao:stock':
      if (!productId) return { error: '缺少 platformProductId（num_iid）' };
      return { action: 'product.stock', payload: { numIid: productId, quantity: p.stock, ...(skuId ? { skuId } : {}) } };
    case 'taobao:title':
      if (!productId) return { error: '缺少 platformProductId（num_iid）' };
      return { action: 'product.update', payload: { numIid: productId, title: p.title } };
    case 'taobao:listing':
      if (!productId) return { error: '缺少 platformProductId（num_iid）' };
      return { action: 'product.listing', payload: { numIid: productId, online: p.listingStatus === 'online' } };
    case 'pdd:price':
      if (!productId) return { error: '缺少 platformProductId（goods_id）' };
      return { action: 'product.price', payload: { goodsId: productId, skuPriceList: [{ skuId: skuId || productId, groupPriceCents: p.priceCents, singlePriceCents: p.priceCents }] } };
    case 'pdd:stock':
      if (!productId) return { error: '缺少 platformProductId（goods_id）' };
      return { action: 'product.stock', payload: { goodsId: productId, quantity: p.stock, ...(skuId ? { skuId } : {}) } };
    case 'pdd:title':
      if (!productId) return { error: '缺少 platformProductId（goods_id）' };
      return { action: 'product.update', payload: { goodsId: productId, title: p.title } };
    case 'pdd:listing':
      if (!productId) return { error: '缺少 platformProductId（goods_id）' };
      return { action: 'product.listing', payload: { goodsId: productId, online: p.listingStatus === 'online' } };
    case '1688:stock':
      if (!productId) return { error: '缺少 platformProductId' };
      return { action: 'product.stock', payload: { productId, amount: p.stock } };
    case '1688:title':
      if (!productId) return { error: '缺少 platformProductId' };
      return { action: 'product.update', payload: { productId, title: p.title } };
    case '1688:listing':
      if (!productId) return { error: '缺少 platformProductId' };
      return { action: 'product.listing', payload: { productIds: [productId], online: p.listingStatus === 'online' } };
    case 'tiktok:price':
      if (!productId || !skuId) return { error: '缺少 platformProductId / platformSkuId' };
      return { action: 'product.price', payload: { productId, skuId, amount: (p.priceCents / 100).toFixed(2), currency: p.currency } };
    case 'tiktok:stock': {
      const warehouseId = platformIdOf(p, 'platformWarehouseId');
      if (!productId || !skuId || !warehouseId) return { error: '缺少 productId / skuId / warehouseId' };
      return { action: 'product.stock', payload: { productId, skuId, warehouseId, quantity: p.stock } };
    }
    case 'tiktok:title':
      if (!productId) return { error: '缺少 platformProductId' };
      return { action: 'product.update', payload: { productId, title: p.title } };
    case 'tiktok:listing':
      if (!productId) return { error: '缺少 platformProductId' };
      return { action: 'product.listing', payload: { productId, online: p.listingStatus === 'online' } };
    default:
      return { error: `「${platform}」不支持 ${field} 同步` };
  }
}

export async function pushProductToPlatform(
  shop: ShopContext,
  creds: PlatformCredentialValues,
  productId: string,
  fields: SyncField[] = ['price', 'stock'],
): Promise<PushResult> {
  const p = store.getProduct(shop.id, productId);
  if (!p) return { ok: false, message: '商品不存在', results: [] };
  const requested = fields.filter((f) => (WRITE_FIELDS as readonly string[]).includes(f));
  const results: PushFieldResult[] = [];
  for (const field of requested) {
    const plan = buildProductAction(shop.platform, p, field);
    if ('error' in plan) { results.push({ field, ok: false, message: plan.error }); continue; }
    const r = await runPlatformAction(shop.platform, creds, plan.action, plan.payload);
    if (!r.ok) {
      results.push({ field, ok: false, message: r.message });
      continue;
    }
    // ★ 写后回读：平台返回 200 不代表值已生效；把回读结果一并返回并进审计。
    const readback = await readbackPlatformAction(shop.platform, creds, plan.action, plan.payload);
    results.push({ field, ok: true, readback });
  }
  const okResults = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const allOk = results.length > 0 && failed.length === 0;
  const firstErr = failed[0]?.message;
  const verified = okResults.some((r) => r.readback?.supported && r.readback.ok === true);
  store.updateProduct(shop.id, p.id, { attrs: syncStamped({ ...(p.attrs || {}) }, allOk, firstErr) });

  if (allOk) {
    const readbackNote = verified
      ? '回读已核对'
      : okResults.some((r) => r.readback?.supported === false)
        ? '该平台客户端未提供回读，结果以平台响应为准'
        : '回读未成功，结果以平台响应为准';
    return {
      ok: true,
      message: `已同步 ${okResults.length} 项到 ${shop.platform}（${readbackNote}）`,
      results,
      verified,
    };
  }
  // ★ 部分成功是真实存在的：明确列出成功/失败，不把整次操作说成“什么都没改”
  const okNote = okResults.length ? `已成功 ${okResults.length} 项（${okResults.map((r) => r.field).join('、')}）` : '没有任何字段成功';
  return {
    ok: false,
    message: `同步未全部成功：${okNote}；失败 ${failed.length} 项${firstErr ? `（首个失败：${firstErr}）` : ''}`,
    results,
    verified,
  };
}

// ======================= 订单：平台 → 本地 =======================

interface NormOrder {
  orderNo: string;
  buyer?: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  items: OrderItem[];
  createdAt: number;
  attrs: Record<string, unknown>;
}

const ORDER_RANK: Record<OrderStatus, number> = {
  pending: 0, paid: 1, sourcing: 2, shipped: 3, completed: 4, refunded: 5,
};

/**
 * 平台状态 → 本地状态只允许“前进”，不允许倒退：
 * shipped 的订单不能被平台仍返回的 paid 改回去；completed/refunded 是终态。
 * 退款（refunded）视为终态，允许从任何未终态进入。
 */
export function canApplyPlatformOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (from === 'completed' || from === 'refunded') return false;
  if (to === 'refunded') return true;
  return ORDER_RANK[to] > ORDER_RANK[from];
}

function upsertPlatformOrder(shopId: string, n: NormOrder): 'created' | 'updated' | 'conflict' {
  const cur = store.findOrderByNo(shopId, n.orderNo);
  if (cur) {
    let conflict = false;
    if (cur.status !== n.status) {
      if (canApplyPlatformOrderStatus(cur.status, n.status)) {
        store.setOrderStatus(shopId, cur.id, n.status);
      } else {
        // 保留本地状态（冲突策略的硬底线：订单状态不倒退），但平台 ID/同步时间仍更新
        conflict = true;
      }
    }
    store.setOrderAttrs(shopId, cur.id, syncStamped({ ...(cur.attrs || {}), ...n.attrs }, !conflict, conflict ? `平台状态 ${n.status} 低于本地 ${cur.status}，已保留本地` : undefined));
    return conflict ? 'conflict' : 'updated';
  }
  store.createOrder(shopId, {
    orderNo: n.orderNo,
    buyer: n.buyer,
    amountCents: n.amountCents,
    currency: n.currency,
    status: n.status,
    items: n.items,
    address: {},
    createdAt: n.createdAt,
    paidAt: n.status === 'pending' ? undefined : n.createdAt,
    attrs: syncStamped(n.attrs, true),
  });
  return 'created';
}

function mapOrderStatus(platform: string, raw: string): OrderStatus {
  const s = raw.toUpperCase();
  if (platform === 'shopify') {
    if (/CANCEL|REFUND/.test(s)) return 'refunded';
    if (/FULFILL/.test(s)) return 'shipped';
    if (/PAID/.test(s)) return 'paid';
    return 'pending';
  }
  if (platform === 'amazon') {
    if (/CANCEL/.test(s)) return 'refunded';
    if (/DELIVER/.test(s)) return 'completed';
    if (/SHIP/.test(s)) return 'shipped';
    return 'paid';
  }
  if (platform === 'taobao') {
    if (/WAIT_BUYER_PAY/.test(s)) return 'pending';
    if (/WAIT_SELLER_SEND/.test(s)) return 'paid';
    if (/WAIT_BUYER_CONFIRM/.test(s)) return 'shipped';
    if (/TRADE_FINISHED/.test(s)) return 'completed';
    if (/TRADE_CLOSED/.test(s)) return 'refunded';
    return 'paid';
  }
  if (platform === 'pdd') {
    const n = Number(raw);
    if (n === 0) return 'pending';
    if (n === 2 || n === 3) return 'shipped';
    if (n === 4) return 'completed';
    return 'paid';
  }
  if (platform === 'tiktok') {
    if (/CANCEL/.test(s)) return 'refunded';
    if (/COMPLETE|DELIVER/.test(s)) return 'completed';
    if (/SHIP|TRANSIT/.test(s)) return 'shipped';
    return 'paid';
  }
  if (platform === '1688') {
    if (/WAIT_BUYER_PAY/.test(s)) return 'pending';
    if (/WAIT_SELLER_SEND/.test(s)) return 'paid';
    if (/WAIT_BUYER_CONFIRM|SEND_GOODS/.test(s)) return 'shipped';
    if (/SUCCESS|FINISHED/.test(s)) return 'completed';
    if (/CLOSE|CANCEL/.test(s)) return 'refunded';
    return 'paid';
  }
  return 'paid';
}

export async function importOrdersFromPlatform(
  shop: ShopContext,
  creds: PlatformCredentialValues,
  opts: { limit?: number; pages?: number } & SyncOptions = {},
): Promise<SyncSummary> {
  const sum: SyncSummary = { imported: 0, updated: 0, skipped: 0, conflicts: 0, errors: [] };
  const retry = opts.retry !== false;
  const pages = Math.max(1, Math.min(opts.pages ?? 1, 20));
  const upsertAll = (list: NormOrder[]): void => {
    for (const n of list) {
      try {
        if (!n.orderNo) { sum.skipped++; continue; }
        const r = upsertPlatformOrder(shop.id, n);
        if (r === 'created') sum.imported++;
        else if (r === 'conflict') sum.conflicts++;
        else sum.updated++;
      } catch (e) {
        sum.skipped++;
        sum.errors.push(`${n.orderNo || '?'}: ${(e as Error).message}`);
      }
    }
  };

  if (shop.platform === 'shopify') {
    let pageInfo = '';
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => shopifyListOrders(creds, {
        limit: opts.limit ?? 50,
        ...(pageInfo ? { pageInfo } : {}),
      }), retry);
      if (!r.ok) { sum.errors.push(r.message || 'Shopify 订单读取失败'); break; }
      upsertAll((r.orders || []).map((o): NormOrder => ({
        orderNo: strOr(o.name) || strOr(o.id),
        buyer: strOr(o.email) || undefined,
        amountCents: yuanToCents(o.total_price),
        currency: strOr(o.currency, 'USD'),
        status: mapOrderStatus('shopify', strOr(o.fulfillment_status) || strOr(o.financial_status)),
        items: (Array.isArray(o.line_items) ? o.line_items as Array<Record<string, unknown>> : []).map((li) => ({
          sku: strOr(li.sku), title: strOr(li.title), qty: asInt(li.quantity) || 1, priceCents: yuanToCents(li.price),
        })),
        createdAt: Date.parse(strOr(o.created_at)) || Date.now(),
        attrs: { platform: 'shopify', platformOrderId: strOr(o.id) },
      })));
      pageInfo = r.nextPageInfo || '';
      if (!pageInfo) break;
    }
  } else if (shop.platform === 'amazon') {
    try {
      const r = await amazonListOrders(creds, { maxResults: Math.min(opts.limit ?? 20, 50) });
      const orders = ((r.payload as { Orders?: Array<Record<string, unknown>> } | undefined)?.Orders) || [];
      const norms: NormOrder[] = [];
      for (const o of orders.slice(0, 20)) {
        const id = strOr(o.AmazonOrderId);
        if (!id) continue;
        let items: OrderItem[] = [];
        let orderItems: Array<{ orderItemId: string; quantity: number }> = [];
        try {
          const it = await amazonGetOrderItems(creds, id);
          const list = ((it.payload as { OrderItems?: Array<Record<string, unknown>> } | undefined)?.OrderItems) || [];
          items = list.map((x) => ({
            sku: strOr(x.SellerSKU), title: strOr(x.Title), qty: asInt(x.QuantityOrdered) || 1,
            priceCents: yuanToCents((x.ItemPrice as { Amount?: unknown } | undefined)?.Amount),
          }));
          // ★ 确认发货要按明细实际数量，不能把所有明细都写成 1
          orderItems = list
            .map((x) => ({ orderItemId: strOr(x.OrderItemId), quantity: Math.max(1, asInt(x.QuantityOrdered)) }))
            .filter((x) => x.orderItemId);
        } catch (e) {
          sum.errors.push(`${id} 明细读取失败：${(e as Error).message}`);
        }
        const total = o.OrderTotal as { Amount?: unknown; CurrencyCode?: unknown } | undefined;
        norms.push({
          orderNo: id,
          buyer: strOr((o.BuyerInfo as { BuyerName?: unknown } | undefined)?.BuyerName) || undefined,
          amountCents: yuanToCents(total?.Amount),
          currency: strOr(total?.CurrencyCode, 'USD'),
          status: mapOrderStatus('amazon', strOr(o.OrderStatus)),
          items,
          createdAt: Date.parse(strOr(o.PurchaseDate)) || Date.now(),
          attrs: { platform: 'amazon', platformOrderId: id, orderItems },
        });
      }
      upsertAll(norms);
    } catch (e) {
      sum.errors.push(`亚马逊订单读取失败：${(e as Error).message}`);
      return sum;
    }
  } else if (shop.platform === 'taobao') {
    const pageSize = opts.limit ?? 20;
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => taobaoListOrders(creds, { pageNo: page, pageSize }), retry);
      if (!r.ok) { sum.errors.push(r.message || '淘宝订单读取失败'); break; }
      const trades = ((r.data?.trades as { trade?: Array<Record<string, unknown>> } | undefined)?.trade) || [];
      upsertAll(trades.map((t): NormOrder => ({
        orderNo: strOr(t.tid),
        buyer: strOr(t.receiver_name) || undefined,
        amountCents: yuanToCents(t.payment),
        currency: 'CNY',
        status: mapOrderStatus('taobao', strOr(t.status)),
        items: [],
        createdAt: Date.parse(strOr(t.created)) || Date.now(),
        attrs: { platform: 'taobao', platformOrderId: strOr(t.tid) },
      })));
      if (trades.length < pageSize) break;
    }
  } else if (shop.platform === 'pdd') {
    const pageSize = opts.limit ?? 20;
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => pddListOrders(creds, { page, pageSize }), retry);
      if (!r.ok) { sum.errors.push(r.message || '拼多多订单读取失败'); break; }
      const list = ((r.data?.order_list || r.data?.orderList || []) as Array<Record<string, unknown>>);
      upsertAll(list.map((o): NormOrder => ({
        orderNo: strOr(o.order_sn ?? o.orderSn),
        buyer: strOr(o.buyer_name ?? o.receiver_name) || undefined,
        amountCents: asCents(o.pay_amount ?? o.order_amount),
        currency: 'CNY',
        status: mapOrderStatus('pdd', strOr(o.order_status ?? o.orderStatus)),
        items: [],
        createdAt: Date.parse(strOr(o.created_time ?? o.createdTime)) || Date.now(),
        attrs: { platform: 'pdd', platformOrderId: strOr(o.order_sn ?? o.orderSn) },
      })));
      if (list.length < pageSize) break;
    }
  } else if (shop.platform === '1688') {
    const pageSize = Math.min(opts.limit ?? 20, 20);
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => ali1688ListOrders(creds, { page, pageSize }), retry);
      if (!r.ok) { sum.errors.push(r.message || '1688 订单读取失败'); break; }
      const result = (r.data?.result as Record<string, unknown> | undefined) || {};
      const list = ((result.result || result.orderList || result.list || []) as Array<Record<string, unknown>>);
      upsertAll(list.map((o): NormOrder => ({
        orderNo: strOr(o.orderId ?? o.id),
        buyer: strOr(o.buyerLoginId) || undefined,
        amountCents: yuanToCents(o.totalAmount ?? o.sumPayment),
        currency: 'CNY',
        status: mapOrderStatus('1688', strOr(o.orderStatus)),
        items: [],
        createdAt: Date.parse(strOr(o.createTime ?? o.gmtCreate)) || Date.now(),
        attrs: { platform: '1688', platformOrderId: strOr(o.orderId ?? o.id) },
      })));
      if (list.length < pageSize) break;
    }
  } else if (shop.platform === 'tiktok') {
    let token = '';
    for (let page = 1; page <= pages; page++) {
      const r = await retryRead(() => tiktokListOrders(creds, { pageSize: opts.limit ?? 20, pageToken: token || undefined }), retry);
      if (!r.ok) { sum.errors.push(r.message || 'TikTok 订单读取失败'); break; }
      const list = ((r.data?.orders || []) as Array<Record<string, unknown>>);
      upsertAll(list.map((o): NormOrder => {
        const payment = (o.payment as Record<string, unknown> | undefined) || {};
        const amountObj = payment.total_amount as Record<string, unknown> | undefined;
        const pkgs = (o.packages as Array<Record<string, unknown>> | undefined) || [];
        return {
          orderNo: strOr(o.id),
          buyer: strOr(o.buyer_email) || undefined,
          amountCents: yuanToCents(amountObj?.amount ?? payment.total_amount),
          currency: strOr(amountObj?.currency, 'USD'),
          status: mapOrderStatus('tiktok', strOr(o.status)),
          items: [],
          createdAt: Date.parse(strOr(o.create_time)) || Date.now(),
          attrs: { platform: 'tiktok', platformOrderId: strOr(o.id), packageId: strOr(pkgs[0]?.id) },
        };
      }));
      token = String((r.data as { next_page_token?: unknown } | undefined)?.next_page_token ?? '');
      if (!token || !list.length) break;
    }
  } else {
    sum.errors.push(`「${shop.platform}」没有订单导入适配`);
  }
  return sum;
}

// ======================= 发货：本地 → 平台 =======================

export interface ShipPushInput {
  trackingNo: string;
  carrier: string;
  /** 平台额外标识：淘宝 companyCode / 拼多多 logisticsId / 1688 cpCode / TikTok shippingProviderId */
  companyCode?: string;
  logisticsId?: number;
  cpCode?: string;
  shippingProviderId?: string;
}

export async function pushShipmentToPlatform(
  shop: ShopContext,
  creds: PlatformCredentialValues,
  orderId: string,
  input: ShipPushInput,
): Promise<{ ok: boolean; message: string; readback?: PlatformReadback }> {
  const order = store.getOrder(shop.id, orderId);
  if (!order) return { ok: false, message: '订单不存在' };
  const attrs = (order.attrs || {}) as Record<string, unknown>;
  const platformOrderId = strOr(attrs.platformOrderId);
  if (!platformOrderId) return { ok: false, message: '该订单没有平台订单号（先从平台导入订单）' };

  let payload: Record<string, unknown> | null = null;
  if (shop.platform === 'taobao') {
    if (!input.companyCode) return { ok: false, message: '淘宝回填运单需要 companyCode（物流公司编码）' };
    payload = { tid: platformOrderId, companyCode: input.companyCode, outSid: input.trackingNo };
  } else if (shop.platform === 'pdd') {
    if (!input.logisticsId) return { ok: false, message: '拼多多回填运单需要 logisticsId（pdd.logistics.companies.get 可查）' };
    payload = { orderSn: platformOrderId, logisticsId: input.logisticsId, trackingNumber: input.trackingNo };
  } else if (shop.platform === '1688') {
    if (!input.cpCode) return { ok: false, message: '1688 回填运单需要 cpCode（物流公司编码）' };
    payload = { orderId: platformOrderId, cpCode: input.cpCode, mailNo: input.trackingNo };
  } else if (shop.platform === 'amazon') {
    const items = Array.isArray(attrs.orderItems)
      ? attrs.orderItems as Array<{ orderItemId?: unknown; quantity?: unknown }>
      : (Array.isArray(attrs.orderItemIds) ? (attrs.orderItemIds as string[]).map((id) => ({ orderItemId: id, quantity: 1 })) : []);
    const orderItems = items
      .map((x) => ({ orderItemId: strOr(x.orderItemId), quantity: Math.max(1, asInt(x.quantity)) }))
      .filter((x) => x.orderItemId);
    if (!orderItems.length) return { ok: false, message: '缺少订单明细（重新从平台导入订单后再试）' };
    payload = {
      orderId: platformOrderId,
      carrierCode: input.companyCode || input.carrier,
      trackingNumber: input.trackingNo,
      orderItems,
    };
  } else if (shop.platform === 'shopify') {
    payload = {
      orderId: platformOrderId,
      trackingNumber: input.trackingNo,
      trackingCompany: input.companyCode || input.carrier,
      notifyCustomer: true,
    };
  } else if (shop.platform === 'tiktok') {
    const packageId = strOr(attrs.packageId);
    if (!packageId || !input.shippingProviderId) {
      return { ok: false, message: 'TikTok 回填需要 packageId（订单详情）与 shippingProviderId' };
    }
    payload = { packageId, trackingNumber: input.trackingNo, shippingProviderId: input.shippingProviderId };
  } else {
    return { ok: false, message: `「${shop.platform}」暂不支持运单回填（万邑通请走出库单）` };
  }

  const r = await runPlatformAction(shop.platform, creds, 'order.ship', payload);
  const readback = r.ok ? await readbackPlatformAction(shop.platform, creds, 'order.ship', payload) : undefined;
  store.setOrderAttrs(shop.id, order.id, syncStamped({ ...attrs }, r.ok, r.ok ? undefined : r.message));
  if (!r.ok) return { ok: false, message: r.message || '平台回填失败', readback };
  const note = readback
    ? (readback.supported === false
      ? '（该平台未提供回读，结果以平台响应为准）'
      : readback.ok === false ? `（回读失败，请到平台后台核对：${readback.message || '未知原因'}）` : '（已回读核对）')
    : '';
  return { ok: true, message: `运单已回填平台${note}`, readback };
}

/** 供界面/测试判断某平台支持哪些同步字段（attrs 齐全时） */
export function supportedSyncFields(platform: string): SyncField[] {
  return WRITE_FIELDS.filter((field) => {
    const probe: Product = {
      id: '', shopId: '', sku: 'S', title: 'T', supplyMode: 'stocked', costCents: 0, priceCents: 100,
      currency: 'CNY', stock: 1, safetyStock: 0, listingStatus: 'online', attrs: {
        platform, platformProductId: '1', platformVariantId: '1', platformSkuId: '1', platformWarehouseId: '1', productType: 'PRODUCT',
      }, createdAt: 0, updatedAt: 0,
    };
    return !('error' in buildProductAction(platform, probe, field));
  });
}

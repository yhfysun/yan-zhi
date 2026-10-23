/**
 * Shopify Admin API 客户端（2026-10-22 P1 首个真实店铺平台）。
 *
 * 为什么先接 Shopify：私有 App 的 Admin API token 在店铺后台即可生成，不需要企业入驻/应用审核。
 *
 * 已实现能力（能力矩阵只标真正做了的）：
 *   test / product.list / product.update / product.price / order.list
 * 未实现（回落 JumpPlan，不假装同步）：product.stock（要 inventory_item_id + location_id）、
 *   product.listing（语义是 published_at / publication）、order.ship（要 fulfillment 流程）。
 *
 * ★ 安全：域名与 token 只从 secretEnc 解出；请求独占 header；超时 15s；拒绝 IP 字面量与内网域名（防 SSRF）。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';

const DEFAULT_API_VERSION = '2024-10';
const TIMEOUT_MS = 15000;

export interface ShopifyCreds extends PlatformCredentialValues {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  currency: string;
}

export const SHOPIFY_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'shopDomain', label: '店铺域名', required: true,
    placeholder: 'your-store.myshopify.com',
    hint: '填 Shopify 后台「设置 → 域名」里的 *.myshopify.com 域名（不要带 https:// 或路径）。',
  },
  {
    key: 'accessToken', label: 'Admin API token', required: true, secret: true,
    placeholder: 'shpat_…',
    hint: '在「设置 → 应用和销售渠道 → 开发应用」创建私有 App，勾选 read_products/read_orders（要写再加 write_products）。',
  },
  {
    key: 'apiVersion', label: 'API 版本',
    placeholder: DEFAULT_API_VERSION,
    defaultValue: DEFAULT_API_VERSION,
    hint: '默认 2024-10；Shopify 每年递增，可按后台支持的版本调整。',
  },
  {
    key: 'currency', label: '店铺币种',
    placeholder: 'USD',
    defaultValue: 'USD',
    hint: '从平台导入商品时作为默认币种（后台 Settings → Store details 可查）。',
  },
];

/**
 * 规范化店铺域名：只接受 `xxx.myshopify.com`。
 *
 * ★ 不接受的输入：带协议/路径、IP 字面量、localhost、任意第三方域名。
 *   之前只校验“像域名”，`evil.com` / `127.0.0.1.nip.io` / `metadata.internal`
 *   都能通过，服务端会带 token 去请求用户填的主机（SSRF）。Admin API 本来只服务
 *   *.myshopify.com，收紧到这一条不会损失能力。
 */
export function normalizeShopDomain(input: string): string | null {
  let s = String(input || '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\s+/g, '');
  if (!s) return null;
  if (s.includes('@') || s.includes(':') || s.includes('?') || s.includes('#')) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(s)) return null;
  return s;
}

function versionOf(creds: PlatformCredentialValues): string {
  const v = String(creds.apiVersion || '').trim();
  return /^\d{4}-\d{2}$/.test(v) ? v : DEFAULT_API_VERSION;
}

export function parseShopifyCreds(raw: string): ShopifyCreds | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const shopDomain = normalizeShopDomain(String(o.shopDomain ?? ''));
  const accessToken = String(o.accessToken ?? '').trim();
  if (!shopDomain || !accessToken) return null;
  return {
    shopDomain, accessToken,
    apiVersion: versionOf(o as PlatformCredentialValues),
    currency: String(o.currency ?? 'USD').trim().toUpperCase() || 'USD',
  };
}

interface FetchResult {
  ok: boolean;
  status: number;
  json?: Record<string, unknown>;
  error?: string;
  step?: PlatformApiProbe['step'];
  /** Shopify REST 的 Link 头（游标分页） */
  link?: string;
}

/** 从 Link 头里取 rel="next" 的 page_info；没有返回空串 */
export function shopifyNextPageInfo(link?: string): string {
  if (!link) return '';
  const next = link.split(',').find((part) => /rel="next"/.test(part));
  if (!next) return '';
  const m = /<([^>]+)>/.exec(next);
  if (!m) return '';
  try {
    return new URL(m[1]).searchParams.get('page_info') || '';
  } catch {
    return '';
  }
}

async function shopifyFetch(
  creds: PlatformCredentialValues,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<FetchResult> {
  const domain = normalizeShopDomain(String(creds.shopDomain || ''));
  if (!domain) return { ok: false, status: 0, error: '店铺域名不合法：填 xxx.myshopify.com，不要带协议或路径', step: 'creds' };
  const token = String(creds.accessToken || '').trim();
  if (!token) return { ok: false, status: 0, error: '缺少 Admin API token', step: 'creds' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${domain}/admin/api/${versionOf(creds)}${path}`, {
      method: init.method ?? 'GET',
      signal: controller.signal,
      // ★ 不跟随重定向：域名被劫持/跳登录页时不能把 token 带到另一个地址
      redirect: 'error',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    let json: Record<string, unknown> | undefined;
    try { json = text ? JSON.parse(text) as Record<string, unknown> : undefined; } catch { /* 非 JSON */ }
    if (res.ok) {
      if (!text.trim()) return { ok: false, status: res.status, step: 'api', error: 'Shopify 返回空响应，无法确认执行结果' };
      if (!json) return { ok: false, status: res.status, step: 'api', error: 'Shopify 返回非 JSON 响应（可能被网关/登录页拦截）' };
      return { ok: true, status: res.status, json, link: res.headers.get('link') ?? undefined };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, step: 'auth', error: `鉴权失败（HTTP ${res.status}）：token 无效或缺少对应权限（read_products / read_orders / write_products）` };
    }
    if (res.status === 429) {
      return { ok: false, status: res.status, step: 'rate', error: '触发 Shopify 限流（HTTP 429）：Admin API 按店铺限速，稍后重试或降低频率' };
    }
    const detail = String((json as { errors?: unknown } | undefined)?.errors ?? text.slice(0, 200));
    return { ok: false, status: res.status, step: 'api', error: `Shopify 返回 HTTP ${res.status}：${detail || '未知错误'}` };
  } catch (e) {
    const msg = (e as Error).name === 'AbortError'
      ? `请求超时（${TIMEOUT_MS / 1000}s）`
      : (e as Error).message;
    return { ok: false, status: 0, step: 'network', error: `网络不可达：${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

/** 连通性自检：只读 shop.json，不产生任何写操作 */
export async function shopifyTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  const r = await shopifyFetch(creds, '/shop.json');
  if (!r.ok) return { ok: false, message: r.error || '自检失败', step: r.step };
  const shop = (r.json as { shop?: { name?: string; domain?: string; myshopify_domain?: string } } | undefined)?.shop;
  const who = shop?.name || shop?.myshopify_domain || shop?.domain || '未知店铺';
  return { ok: true, message: `已连接 Shopify：${who}` };
}

/** 商品列表（只读；适配器后续用于「平台 → 本地」对账） */
export async function shopifyListProducts(
  creds: PlatformCredentialValues,
  opts: { limit?: number; status?: 'active' | 'draft' | 'archived' | 'any'; pageInfo?: string } = {},
): Promise<{ ok: boolean; products?: Array<Record<string, unknown>>; nextPageInfo?: string; message?: string; step?: PlatformApiProbe['step'] }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 250);
  // page_info 游标分页时不能再带 status 过滤（Shopify 要求参数与游标一致）
  const q = new URLSearchParams({ limit: String(limit) });
  if (opts.pageInfo) q.set('page_info', opts.pageInfo);
  else q.set('status', opts.status ?? 'any');
  const r = await shopifyFetch(creds, `/products.json?${q.toString()}`);
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return {
    ok: true,
    products: ((r.json as { products?: Array<Record<string, unknown>> } | undefined)?.products) || [],
    nextPageInfo: shopifyNextPageInfo(r.link),
  };
}

/** 订单列表（只读） */
export async function shopifyListOrders(
  creds: PlatformCredentialValues,
  opts: { limit?: number; status?: 'open' | 'closed' | 'cancelled' | 'any'; pageInfo?: string } = {},
): Promise<{ ok: boolean; orders?: Array<Record<string, unknown>>; nextPageInfo?: string; message?: string; step?: PlatformApiProbe['step'] }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 250);
  const q = new URLSearchParams({ limit: String(limit) });
  if (opts.pageInfo) q.set('page_info', opts.pageInfo);
  else q.set('status', opts.status ?? 'any');
  const r = await shopifyFetch(creds, `/orders.json?${q.toString()}`);
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return {
    ok: true,
    orders: ((r.json as { orders?: Array<Record<string, unknown>> } | undefined)?.orders) || [],
    nextPageInfo: shopifyNextPageInfo(r.link),
  };
}

/** 更新商品（标题 / 状态等；价格在 variant 上，见 shopifyUpdateVariantPrice） */
export async function shopifyUpdateProduct(
  creds: PlatformCredentialValues,
  productId: string | number,
  patch: { title?: string; status?: 'active' | 'draft' | 'archived' },
): Promise<{ ok: boolean; product?: Record<string, unknown>; message?: string; step?: PlatformApiProbe['step'] }> {
  const id = String(productId || '').trim();
  if (!id) return { ok: false, message: '缺少商品 id', step: 'creds' };
  const body: Record<string, unknown> = { id: Number(id) || id };
  if (patch.title != null) body.title = patch.title;
  if (patch.status != null) body.status = patch.status;
  const r = await shopifyFetch(creds, `/products/${encodeURIComponent(id)}.json`, { method: 'PUT', body: { product: body } });
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return { ok: true, product: (r.json as { product?: Record<string, unknown> } | undefined)?.product };
}

/** 改价（价格挂在 variant 上，需要 variant id） */
export async function shopifyUpdateVariantPrice(
  creds: PlatformCredentialValues,
  variantId: string | number,
  price: string | number,
): Promise<{ ok: boolean; variant?: Record<string, unknown>; message?: string; step?: PlatformApiProbe['step'] }> {
  const id = String(variantId || '').trim();
  if (!id) return { ok: false, message: '缺少 variant id（商品价格挂在规格上）', step: 'creds' };
  const value = typeof price === 'number' ? price.toFixed(2) : String(price).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return { ok: false, message: '价格格式不合法', step: 'creds' };
  const r = await shopifyFetch(creds, `/variants/${encodeURIComponent(id)}.json`, {
    method: 'PUT',
    body: { variant: { id: Number(id) || id, price: value } },
  });
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return { ok: true, variant: (r.json as { variant?: Record<string, unknown> } | undefined)?.variant };
}

/** 读商品（回读用） */
export async function shopifyGetProduct(creds: PlatformCredentialValues, productId: string | number) {
  const id = String(productId || '').trim();
  if (!id) return { ok: false, message: '缺少商品 id', step: 'creds' as const };
  const r = await shopifyFetch(creds, `/products/${encodeURIComponent(id)}.json`);
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return { ok: true, product: (r.json as { product?: Record<string, unknown> } | undefined)?.product };
}

/** 读规格（价格回读用） */
export async function shopifyGetVariant(creds: PlatformCredentialValues, variantId: string | number) {
  const id = String(variantId || '').trim();
  if (!id) return { ok: false, message: '缺少 variant id', step: 'creds' as const };
  const r = await shopifyFetch(creds, `/variants/${encodeURIComponent(id)}.json`);
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return { ok: true, variant: (r.json as { variant?: Record<string, unknown> } | undefined)?.variant };
}

/**
 * 履约单：Shopify 发货必须走 fulfillment 流程 —— 先取订单的 fulfillment_orders，
 * 再对其中 open/in_progress 的单创建 fulfillment。直接调 /orders/{id}/fulfillments 已废弃。
 */
export async function shopifyListFulfillmentOrders(creds: PlatformCredentialValues, orderId: string | number) {
  const id = String(orderId || '').trim();
  if (!id) return { ok: false, message: '缺少订单 id', step: 'creds' as const };
  const r = await shopifyFetch(creds, `/orders/${encodeURIComponent(id)}/fulfillment_orders.json`);
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  const list = (r.json as { fulfillment_orders?: Array<Record<string, unknown>> } | undefined)?.fulfillment_orders;
  return { ok: true, fulfillmentOrders: Array.isArray(list) ? list : [] };
}

export async function shopifyCreateFulfillment(
  creds: PlatformCredentialValues,
  input: {
    /** 一个订单可能拆成多个 fulfillment order（多仓/多包裹），一次履约全部带上 */
    fulfillmentOrderIds: Array<string | number>;
    trackingNumber: string;
    trackingCompany?: string;
    notifyCustomer?: boolean;
  },
) {
  const ids = (input.fulfillmentOrderIds || []).map((x) => String(x || '').trim()).filter(Boolean);
  const tracking = String(input.trackingNumber || '').trim();
  if (!ids.length || !tracking) return { ok: false, message: '缺少 fulfillment order id 或运单号', step: 'creds' as const };
  const body = {
    fulfillment: {
      line_items_by_fulfillment_order: ids.map((id) => ({ fulfillment_order_id: Number(id) || id })),
      tracking_info: {
        number: tracking,
        ...(input.trackingCompany ? { company: input.trackingCompany } : {}),
      },
      notify_customer: input.notifyCustomer === true,
    },
  };
  const r = await shopifyFetch(creds, '/fulfillments.json', { method: 'POST', body });
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return { ok: true, fulfillment: (r.json as { fulfillment?: Record<string, unknown> } | undefined)?.fulfillment };
}

/** 读履约单（发货回读用） */
export async function shopifyGetFulfillment(creds: PlatformCredentialValues, fulfillmentId: string | number) {
  const id = String(fulfillmentId || '').trim();
  if (!id) return { ok: false, message: '缺少 fulfillment id', step: 'creds' as const };
  const r = await shopifyFetch(creds, `/fulfillments/${encodeURIComponent(id)}.json`);
  if (!r.ok) return { ok: false, message: r.error, step: r.step };
  return { ok: true, fulfillment: (r.json as { fulfillment?: Record<string, unknown> } | undefined)?.fulfillment };
}

export const shopifyPlatformClient: PlatformApiClient = {
  id: 'shopify',
  label: 'Shopify Admin API',
  credentialFields: SHOPIFY_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.price', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseShopifyCreds(raw),
  test: shopifyTest,
};

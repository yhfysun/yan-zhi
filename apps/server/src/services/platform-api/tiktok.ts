/**
 * TikTok Shop Partner Open API 客户端（2026-10-22）。
 *
 * 官方文档（需登录 Partner Center）：
 *   签名 https://partner.tiktokshop.com/docv2/page/sign-your-api-request
 *   授权店铺 GET /authorization/202309/shops
 *   商品/订单/发货见函数注释。
 *
 * 鉴权：app_key/app_secret（应用级）+ access_token（头 x-tts-access-token）+ shop_cipher（query，参与签名）。
 * 签名：app_secret + path + 排序后的 key+value 串 + 原始 body + app_secret，再 HMAC-SHA256（小写 hex）。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import { hmacSha256Hex, sortedParamConcat } from './sign.js';
import { fetchJson, errorDetail } from './http.js';

const DEFAULT_BASE = 'https://open-api.tiktokglobalshop.com';
const SANDBOX_BASE = 'https://open-api-sandbox.tiktokglobalshop.com';

export const TIKTOK_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'appKey', label: 'App Key', required: true,
    hint: '登录 TikTok Shop Partner Center（partner.tiktokshop.com）→ 应用管理 → 你的应用，复制 App Key。',
  },
  {
    key: 'appSecret', label: 'App Secret', required: true, secret: true,
    hint: '同一应用的 App Secret（只用于签名，不会随请求发出）。',
  },
  {
    key: 'accessToken', label: 'Access Token', required: true, secret: true,
    hint: '用官方授权页（services.tiktokshop.com/open/authorize）让店铺授权后，用 auth_code 换 token；有效期见返回的 access_token_expire_in（绝对时间戳）。',
  },
  {
    key: 'shopCipher', label: 'Shop Cipher', required: true,
    hint: '调 GET /authorization/202309/shops 返回的 shops[].cipher，参与每次请求签名。',
  },
  {
    key: 'baseUrl', label: 'API 域名',
    options: [
      { label: '生产 open-api.tiktokglobalshop.com', value: DEFAULT_BASE },
      { label: '沙箱 open-api-sandbox.tiktokglobalshop.com', value: SANDBOX_BASE },
    ],
    defaultValue: DEFAULT_BASE,
    hint: '联调可用沙箱；正式经营用生产。',
  },
];

export function parseTiktokCreds(raw: string): PlatformCredentialValues | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const appKey = String(o.appKey ?? '').trim();
  const appSecret = String(o.appSecret ?? '').trim();
  const accessToken = String(o.accessToken ?? '').trim();
  const shopCipher = String(o.shopCipher ?? '').trim();
  if (!appKey || !appSecret || !accessToken || !shopCipher) return null;
  return {
    appKey, appSecret, accessToken, shopCipher,
    baseUrl: String(o.baseUrl ?? DEFAULT_BASE).trim() || DEFAULT_BASE,
  };
}

function baseOf(creds: PlatformCredentialValues): string {
  return String(creds.baseUrl || '') === SANDBOX_BASE ? SANDBOX_BASE : DEFAULT_BASE;
}

/**
 * 签名：app_secret + path + sorted(key+value) + rawBody + app_secret → HMAC-SHA256(hex)
 * 注意：body 必须与真正发送的字符串逐字一致，签名后不能再序列化一次。
 */
export function tiktokSign(
  path: string,
  query: Record<string, unknown>,
  rawBody: string,
  appSecret: string,
): string {
  const signBase = `${appSecret}${path}${sortedParamConcat(query)}${rawBody}${appSecret}`;
  return hmacSha256Hex(appSecret, signBase);
}

interface TiktokCallResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: PlatformApiProbe['step'];
}

/** 统一请求：自动补公共参数（app_key/timestamp/shop_cipher/sign）与 access token 头 */
export async function tiktokRequest(
  creds: PlatformCredentialValues,
  method: 'GET' | 'POST',
  path: string,
  query: Record<string, unknown> = {},
  body?: Record<string, unknown>,
): Promise<TiktokCallResult> {
  const appKey = String(creds.appKey || '').trim();
  const appSecret = String(creds.appSecret || '').trim();
  const accessToken = String(creds.accessToken || '').trim();
  const shopCipher = String(creds.shopCipher || '').trim();
  if (!appKey || !appSecret || !accessToken) {
    return { ok: false, step: 'creds', message: '缺少 appKey / appSecret / accessToken —— 按表单提示到 Partner Center 获取' };
  }
  const rawBody = body !== undefined ? JSON.stringify(body) : '';
  const q: Record<string, unknown> = {
    ...query,
    app_key: appKey,
    timestamp: Math.floor(Date.now() / 1000),
  };
  // 授权店铺接口不需要 shop_cipher；其他店铺级接口必须带，且参与签名
  if (shopCipher && path !== '/authorization/202309/shops') q.shop_cipher = shopCipher;
  q.sign = tiktokSign(path, q, rawBody, appSecret);

  const qs = Object.entries(q).map(([k, v]) => [k, String(v)] as [string, string]);
  const url = `${baseOf(creds)}${path}?${new URLSearchParams(qs).toString()}`;
  const r = await fetchJson(url, {
    method,
    headers: { 'x-tts-access-token': accessToken },
    body: body !== undefined ? rawBody : undefined,
  });
  if (!r.ok) return { ok: false, step: r.step, message: r.error };
  const json = r.json || {};
  if (json.code === undefined || json.code === null) {
    return { ok: false, step: 'api', message: 'TikTok 返回了无法识别的响应（缺少业务码），不能确认结果' };
  }
  const code = Number(json.code ?? 0);
  if (code !== 0) {
    const msg = errorDetail(json, `业务错误 code=${code}`);
    const step = /perm|scope|author/i.test(msg) ? 'auth' : 'api';
    return { ok: false, step, message: `TikTok 业务错误（code ${code}）：${msg}` };
  }
  return { ok: true, data: (json.data as Record<string, unknown>) || {} };
}

export async function tiktokTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  const r = await tiktokRequest(creds, 'GET', '/authorization/202309/shops');
  if (!r.ok) return { ok: false, message: r.message || '自检失败', step: r.step };
  const shops = (r.data as { shops?: Array<{ name?: string; cipher?: string }> } | undefined)?.shops || [];
  const first = shops[0];
  return {
    ok: true,
    message: shops.length
      ? `已连接 TikTok Shop：${first?.name || first?.cipher || '已授权店铺'}（共 ${shops.length} 家）`
      : '凭据可用，但该应用尚未被任何店铺授权（去授权页完成授权）',
  };
}

// ---------- 业务能力 ----------
export async function tiktokListProducts(creds: PlatformCredentialValues, opts: { pageSize?: number; pageToken?: string } = {}) {
  return tiktokRequest(creds, 'POST', '/product/202502/products/search', {
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 100),
    ...(opts.pageToken ? { page_token: opts.pageToken } : {}),
  }, {});
}

/** 商品详情（写后回读用） */
export async function tiktokGetProduct(creds: PlatformCredentialValues, productId: string | number) {
  return tiktokRequest(creds, 'GET', `/product/202502/products/${encodeURIComponent(String(productId || ''))}`);
}

export async function tiktokUpdateProduct(creds: PlatformCredentialValues, productId: string, patch: { productName?: string }) {
  return tiktokRequest(creds, 'POST', `/product/202309/products/${encodeURIComponent(productId)}/partial_edit`, {}, {
    ...(patch.productName != null ? { product_name: patch.productName } : {}),
  });
}

/** 改价：需要 SKU id（价格挂在 SKU 上） */
export async function tiktokUpdatePrice(creds: PlatformCredentialValues, productId: string, skuId: string, amount: string, currency = 'USD') {
  return tiktokRequest(creds, 'POST', `/product/202309/products/${encodeURIComponent(productId)}/prices/update`, {}, {
    skus: [{ id: skuId, price: { amount: String(amount), currency } }],
  });
}

/** 改库存：需要 SKU id + warehouse_id（绝对值） */
export async function tiktokUpdateInventory(creds: PlatformCredentialValues, productId: string, skuId: string, warehouseId: string, quantity: number) {
  return tiktokRequest(creds, 'POST', `/product/202309/products/${encodeURIComponent(productId)}/inventory/update`, {}, {
    skus: [{ id: skuId, inventory: [{ warehouse_id: warehouseId, quantity }] }],
  });
}

export async function tiktokSetListing(creds: PlatformCredentialValues, productId: string, online: boolean) {
  const action = online ? 'activate' : 'deactivate';
  return tiktokRequest(creds, 'POST', `/product/202309/products/${action}`, {}, { product_ids: [productId] });
}

export async function tiktokListOrders(creds: PlatformCredentialValues, opts: { pageSize?: number; pageToken?: string; status?: string } = {}) {
  return tiktokRequest(creds, 'POST', '/order/202309/orders/search', {
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 100),
    ...(opts.pageToken ? { page_token: opts.pageToken } : {}),
  }, {
    ...(opts.status ? { order_status: opts.status } : {}),
  });
}

/** 发货：package_id 来自订单详情 packages[].id；自发货需 shipping_provider_id */
export async function tiktokShipPackage(
  creds: PlatformCredentialValues,
  packageId: string,
  trackingNo: string,
  shippingProviderId: string,
) {
  return tiktokRequest(creds, 'POST', `/fulfillment/202309/packages/${encodeURIComponent(packageId)}/ship`, {}, {
    self_shipment: { tracking_number: trackingNo, shipping_provider_id: shippingProviderId },
  });
}

export const tiktokPlatformClient: PlatformApiClient = {
  id: 'tiktok',
  label: 'TikTok Shop Open API',
  credentialFields: TIKTOK_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.price', 'product.stock', 'product.listing', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseTiktokCreds(raw),
  test: tiktokTest,
};

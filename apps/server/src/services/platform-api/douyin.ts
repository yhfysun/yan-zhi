/**
 * 抖店（抖音小店）开放平台客户端（2026-10-30）。
 *
 * 官方文档：https://op.jinritemai.com/docs/guide-docs/10/23
 * 网关：https://openapi-fxg.jinritemai.com（仅正式环境，无沙箱）
 * 签名：param_json 的 key 字典序排序后序列化为严格 JSON（特殊字符转义），再与
 *       method / app_key / timestamp / v 按参数名字典序拼 k+v（access_token 与
 *       sign_method 不参与），secret 前后包裹做 HMAC-SHA256（官方推荐，md5 将下线）。
 * 时间戳：yyyy-MM-dd HH:mm:ss，GMT+8。官方允许 param_json 过长时放 body，
 *       这里统一 POST：公共参数走 query，param_json 放 body（原始串，参与签名）。
 *
 * 能力：test / product.list / product.update / product.price / product.stock /
 *       product.listing / order.list / order.ship
 * 方法名：product.listV2 / sku.editPrice / sku.syncStock / product.launchProduct /
 *         product.setOffline / order.searchList / order.logisticsAdd
 * 订单状态（main_status）：1 待确认/待支付 · 103 部分支付 · 105 已支付 · 2 备货中 ·
 *                         101 部分发货 · 3 已发货 · 4 已取消 · 5 已完成 · 21/22/39 退款完结
 * 返回：{ code, msg, sub_code, data }；code=10000 成功。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import { hmacSha256Hex } from './sign.js';
import { fetchJson, errorDetail } from './http.js';

const GATEWAY = 'https://openapi-fxg.jinritemai.com';

export const DOUYIN_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'appKey', label: 'App Key', required: true,
    hint: '抖店开放平台 op.jinritemai.com → 控制台 → 应用列表，复制应用的 App Key（19 位纯数字）。',
  },
  {
    key: 'appSecret', label: 'App Secret', required: true, secret: true,
    hint: '同一应用的 App Secret（签名密钥，不会随请求发出）。',
  },
  {
    key: 'accessToken', label: 'Access Token', required: true, secret: true,
    hint: '商家授权后换取（拼授权页 URL → 商家确认 → 拿 code 换 token）；授权 90 天有效，过期需重新授权。',
  },
];

export function parseDouyinCreds(raw: string): PlatformCredentialValues | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const appKey = String(o.appKey ?? '').trim();
  const appSecret = String(o.appSecret ?? '').trim();
  const accessToken = String(o.accessToken ?? '').trim();
  if (!appKey || !appSecret || !accessToken) return null;
  return { appKey, appSecret, accessToken };
}

/** GMT+8 的 yyyy-MM-dd HH:mm:ss（抖店网关按北京时间校验） */
function douyinTime(d = new Date()): string {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`;
}

/**
 * 业务参数编码：key 字典序 → 严格 JSON（无空格）+ 特殊字符转义。
 * 官方要求：& → &、< → <、> → >、\b → \u0008（gson disableHtmlEscaping 语义）。
 */
function encodeParamJson(params: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== null).sort()) {
    sorted[k] = params[k];
  }
  return JSON.stringify(sorted)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

/** method 名转官方 URI：order.searchList → /order/searchList（点换斜杠，大小写保持原样） */
function toPath(method: string): string {
  return '/' + method.replace(/\./g, '/');
}

export interface DouyinResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: PlatformApiProbe['step'];
}

export async function douyinRequest(
  creds: PlatformCredentialValues,
  method: string,
  params: Record<string, unknown> = {},
): Promise<DouyinResult> {
  const appKey = String(creds.appKey || '').trim();
  const appSecret = String(creds.appSecret || '').trim();
  const accessToken = String(creds.accessToken || '').trim();
  if (!appKey || !appSecret || !accessToken) {
    return { ok: false, step: 'creds', message: '缺少 appKey / appSecret / accessToken —— 按表单提示到抖店开放平台获取' };
  }
  const paramJson = encodeParamJson(params);
  const ts = douyinTime();
  // 签名素材：app_key, method, param_json, timestamp, v（access_token 与 sign_method 不参与），
  // 按参数名字典序拼 k+v，secret 前后包裹，HMAC-SHA256(secret) → hex 小写。
  const concat = [`app_key${appKey}`, `method${method}`, `param_json${paramJson}`, `timestamp${ts}`, 'v2']
    .sort()
    .join('');
  const sign = hmacSha256Hex(appSecret, `${appSecret}${concat}${appSecret}`);
  const query = new URLSearchParams({
    method, app_key: appKey, access_token: accessToken, timestamp: ts, v: '2',
    sign_method: 'hmac-sha256', sign,
  });
  const r = await fetchJson(`${GATEWAY}${toPath(method)}?${query.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: paramJson,
  });
  if (!r.ok) return { ok: false, step: r.step, message: r.error };
  const json = r.json || {};
  const code = Number(json.code);
  if (code !== 10000) {
    const sc = String(json.sub_code ?? '');
    const detail = errorDetail(json, `${json.msg || ''}（错误码 ${code}${sc ? `/${sc}` : ''}）`.trim());
    const step = [1, 2, 30001, 30002, 30003, 30004, 30005, 30006].includes(code) ? 'auth'
      : [8, 9].includes(code) || /频繁|繁忙|限流|busy|limit/i.test(detail) ? 'rate'
      : 'api';
    return { ok: false, step, message: `抖店错误（${code}${sc ? `/${sc}` : ''}）：${detail}` };
  }
  return { ok: true, data: (json.data as Record<string, unknown>) || {} };
}

// ---------- 业务能力 ----------

export async function douyinTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  // 用 sku.list（带 product_id=0 会参数错）不如直接 product.listV2 拉一页：只读、无害
  const r = await douyinRequest(creds, 'product.listV2', { page: '1', size: '1' });
  if (!r.ok) return { ok: false, message: r.message || '自检失败', step: r.step };
  return { ok: true, message: '已连接抖店开放平台' };
}

/** 批量查询商品列表（一页最多 100，page 从 1 开始） */
export async function douyinListProducts(
  creds: PlatformCredentialValues,
  opts: { page?: number; pageSize?: number; status?: number } = {},
) {
  return douyinRequest(creds, 'product.listV2', {
    page: String(Math.max(1, opts.page ?? 1)),
    size: String(Math.min(Math.max(opts.pageSize ?? 20, 1), 100)),
    ...(opts.status != null ? { status: String(opts.status) } : {}),
  });
}

/** 编辑 SKU 价格（单位：分） */
export async function douyinEditSkuPrice(
  creds: PlatformCredentialValues,
  productId: string | number,
  skuId: string | number,
  priceCents: number,
) {
  return douyinRequest(creds, 'sku.editPrice', {
    product_id: String(productId),
    sku_id: String(skuId),
    price: String(Math.max(0, Math.trunc(priceCents))),
  });
}

/** 修改 SKU 库存（全量同步；stock_num 支持设 0，不能小于 0） */
export async function douyinSyncStock(
  creds: PlatformCredentialValues,
  skuId: string | number,
  quantity: number,
) {
  return douyinRequest(creds, 'sku.syncStock', {
    sku_id: String(skuId),
    stock_num: String(Math.max(0, Math.trunc(quantity))),
    incremental: 'false',
  });
}

/** 上架商品 */
export async function douyinLaunchProduct(creds: PlatformCredentialValues, productId: string | number) {
  return douyinRequest(creds, 'product.launchProduct', { product_id: String(productId) });
}

/** 下架商品 */
export async function douyinSetOffline(creds: PlatformCredentialValues, productId: string | number) {
  return douyinRequest(creds, 'product.setOffline', { product_id: String(productId) });
}

/**
 * 订单列表查询。
 * 官方限制：最大查近 90 天；update_time_start / create_time_start 必传一个；
 * page 从 0 开始；size ≤ 100；combine_status 只支持 1 个元素。
 * 默认按更新时间查最近 24 小时。
 */
export async function douyinListOrders(
  creds: PlatformCredentialValues,
  opts: { page?: number; pageSize?: number; mainStatus?: string; startTimeSec?: number; endTimeSec?: number } = {},
) {
  const end = opts.endTimeSec ?? Math.floor(Date.now() / 1000);
  const start = opts.startTimeSec ?? end - 24 * 3600;
  return douyinRequest(creds, 'order.searchList', {
    order_by: 'update_time',
    order_asc: 'false',
    page: String(Math.max(0, opts.page ?? 0)),
    size: String(Math.min(Math.max(opts.pageSize ?? 20, 1), 100)),
    update_time_start: String(start),
    update_time_end: String(end),
    ...(opts.mainStatus ? { combine_status: [{ main_status: opts.mainStatus }] } : {}),
  });
}

/** 整单发货（company_code 从 order.logisticsCompanyList 查；无 API 拉取能力，默认顺丰可在 payload 换） */
export async function douyinLogisticsAdd(
  creds: PlatformCredentialValues,
  orderId: string,
  companyCode: string,
  trackingNo: string,
) {
  return douyinRequest(creds, 'order.logisticsAdd', {
    order_id: orderId,
    company_code: companyCode,
    logistics_code: trackingNo,
  });
}

/** 快递公司列表（发货前查 company_code 用，只读） */
export async function douyinLogisticsCompanies(creds: PlatformCredentialValues) {
  return douyinRequest(creds, 'order.logisticsCompanyList', {});
}

export const douyinPlatformClient: PlatformApiClient = {
  id: 'douyin',
  label: '抖店（抖音小店）开放平台',
  credentialFields: DOUYIN_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.price', 'product.stock', 'product.listing', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseDouyinCreds(raw),
  test: douyinTest,
};

/**
 * 拼多多开放平台客户端（2026-10-22）。
 *
 * 官方文档：https://open.pinduoduo.com/application/document/api
 * 签名：md5(client_secret + 参数按名升序 k+v 串 + client_secret) 大写；时间戳为 **UNIX 秒**（10 位）；
 *       数组/对象参数先 JSON 序列化再参与签名。
 * 注意：官方目前只提供正式环境（无沙箱）；订单查询限制成交时间 3 个月内、
 *       start_confirm_at 与 end_confirm_at 间隔 ≤24 小时、page_size ≤100。
 *
 * 能力：test / product.list / product.update(标题) / product.price / product.stock /
 *       product.listing / order.list / order.ship。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import { pddSign } from './sign.js';
import { fetchJson, errorDetail } from './http.js';

const GATEWAY = 'https://gw-api.pinduoduo.com/api/router';

export const PDD_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'clientId', label: 'Client ID', required: true,
    hint: '登录拼多多开放平台 open.pinduoduo.com → 应用管理 → 你的应用，复制 client_id。',
  },
  {
    key: 'clientSecret', label: 'Client Secret', required: true, secret: true,
    hint: '同一应用的 client_secret（只用于签名，不会随请求发出）。',
  },
  {
    key: 'accessToken', label: 'Access Token', required: true, secret: true,
    hint: '商家后台授权（mms.pinduoduo.com/open.html?client_id=…）后用 auth_code 调 /oauth/token 换取；授权过期需重新授权。',
  },
];

export function parsePddCreds(raw: string): PlatformCredentialValues | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const clientId = String(o.clientId ?? '').trim();
  const clientSecret = String(o.clientSecret ?? '').trim();
  const accessToken = String(o.accessToken ?? '').trim();
  if (!clientId || !clientSecret || !accessToken) return null;
  return { clientId, clientSecret, accessToken };
}

interface PddResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: PlatformApiProbe['step'];
}

/** 签名要求把数组/对象先序列化成字符串 */
function signable(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

export async function pddRequest(
  creds: PlatformCredentialValues,
  type: string,
  params: Record<string, unknown> = {},
): Promise<PddResult> {
  const clientId = String(creds.clientId || '').trim();
  const clientSecret = String(creds.clientSecret || '').trim();
  const accessToken = String(creds.accessToken || '').trim();
  if (!clientId || !clientSecret || !accessToken) {
    return { ok: false, step: 'creds', message: '缺少 clientId / clientSecret / accessToken —— 按表单提示到拼多多开放平台获取' };
  }
  const all: Record<string, unknown> = {
    type,
    client_id: clientId,
    access_token: accessToken,
    timestamp: Math.floor(Date.now() / 1000),
    data_type: 'JSON',
    version: 'V1',
    ...params,
  };
  const sign = pddSign(signable(all) as Record<string, unknown>, clientSecret);
  const body = { ...all, sign };

  const r = await fetchJson(GATEWAY, { method: 'POST', body });
  if (!r.ok) return { ok: false, step: r.step, message: r.error };
  const json = r.json || {};
  const err = json.error_response as Record<string, unknown> | undefined;
  if (err) {
    const code = String(err.error_code ?? err.sub_code ?? '');
    const detail = errorDetail(err, `错误码 ${code || '未知'}`);
    const step = ['20031'].includes(code) ? 'auth'
      : ['70031', '52101'].includes(code) || /频繁|limit/i.test(detail) ? 'rate' : 'api';
    return { ok: false, step, message: `拼多多错误（${code}）：${detail}` };
  }
  const key = Object.keys(json).find((k) => k.endsWith('_response'));
  if (!key) {
    return { ok: false, step: 'api', message: '拼多多返回了无法识别的响应（缺少 xxx_response），不能确认结果' };
  }
  return { ok: true, data: json[key] as Record<string, unknown> };
}

export async function pddTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  const r = await pddRequest(creds, 'pdd.time.get');
  if (!r.ok) return { ok: false, message: r.message || '自检失败', step: r.step };
  const t = (r.data as { time?: number | string } | undefined)?.time;
  return { ok: true, message: `已连接拼多多${t ? `（服务器时间 ${t}）` : ''}` };
}

// ---------- 业务能力 ----------
export async function pddListProducts(creds: PlatformCredentialValues, opts: { page?: number; pageSize?: number } = {}) {
  return pddRequest(creds, 'pdd.goods.list.get', {
    page: opts.page ?? 1,
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 100),
    is_onsale: 1,
  });
}

/** 商品详情（写后回读用） */
export async function pddGetGoods(creds: PlatformCredentialValues, goodsId: string | number) {
  return pddRequest(creds, 'pdd.goods.detail.get', { goods_id: Number(goodsId) || goodsId });
}

export async function pddUpdateTitle(creds: PlatformCredentialValues, goodsId: string | number, goodsName: string) {
  return pddRequest(creds, 'pdd.goods.information.update', { goods_id: Number(goodsId) || goodsId, goods_name: goodsName });
}

/** 改价：价格单位是分；sku_price_list 形如 [{sku_id, group_price, single_price}] */
export async function pddUpdateSkuPrice(
  creds: PlatformCredentialValues,
  goodsId: string | number,
  skuPriceList: Array<{ skuId: string | number; groupPriceCents?: number; singlePriceCents?: number }>,
) {
  return pddRequest(creds, 'pdd.goods.sku.price.update', {
    goods_id: Number(goodsId) || goodsId,
    sku_price_list: skuPriceList.map((s) => ({
      sku_id: Number(s.skuId) || s.skuId,
      ...(s.groupPriceCents != null ? { group_price: s.groupPriceCents } : {}),
      ...(s.singlePriceCents != null ? { single_price: s.singlePriceCents } : {}),
    })),
  });
}

export async function pddUpdateStock(
  creds: PlatformCredentialValues,
  goodsId: string | number,
  quantity: number,
  opts: { skuId?: string | number; outerId?: string; updateType?: 1 | 2 } = {},
) {
  return pddRequest(creds, 'pdd.goods.quantity.update', {
    goods_id: Number(goodsId) || goodsId,
    quantity: Math.max(0, Math.trunc(quantity)),
    update_type: opts.updateType ?? 1,
    ...(opts.skuId != null ? { sku_id: Number(opts.skuId) || opts.skuId } : {}),
    ...(opts.outerId ? { outer_id: opts.outerId } : {}),
  });
}

export async function pddSetListing(creds: PlatformCredentialValues, goodsId: string | number, online: boolean) {
  return pddRequest(creds, 'pdd.goods.sale.status.set', {
    goods_id: Number(goodsId) || goodsId,
    is_onsale: online ? 1 : 0,
  });
}

function pddTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function pddListOrders(
  creds: PlatformCredentialValues,
  opts: { startConfirmAt?: string; endConfirmAt?: string; status?: number; page?: number; pageSize?: number } = {},
) {
  // 官方限制：区间 ≤24h，只查 3 个月内成交订单；未传时默认最近 24 小时
  const end = opts.endConfirmAt || pddTime(Date.now());
  const start = opts.startConfirmAt || pddTime(Date.now() - 23 * 3600 * 1000);
  return pddRequest(creds, 'pdd.order.list.get', {
    start_confirm_at: start,
    end_confirm_at: end,
    page: opts.page ?? 1,
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 100),
    ...(opts.status != null ? { order_status: opts.status } : {}),
  });
}

/** 发货：logistics_id 为拼多多物流公司 id（pdd.logistics.companies.get 可查） */
export async function pddShip(creds: PlatformCredentialValues, orderSn: string, logisticsId: number, trackingNumber: string) {
  return pddRequest(creds, 'pdd.logistics.online.send', {
    order_sn: orderSn,
    logistics_id: logisticsId,
    tracking_number: trackingNumber,
  });
}

export async function pddLogisticsCompanies(creds: PlatformCredentialValues) {
  return pddRequest(creds, 'pdd.logistics.companies.get', {});
}

export const pddPlatformClient: PlatformApiClient = {
  id: 'pdd',
  label: '拼多多开放平台',
  credentialFields: PDD_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.price', 'product.stock', 'product.listing', 'order.list', 'order.ship'],
  parseCreds: (raw) => parsePddCreds(raw),
  test: pddTest,
};

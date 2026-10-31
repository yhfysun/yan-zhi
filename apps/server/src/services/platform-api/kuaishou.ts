/**
 * 快手小店（快手电商开放平台）客户端（2026-10-30）。
 *
 * 官方文档：https://open.kwaixiaodian.com/docs/dev
 * 网关：https://openapi.kwaixiaodian.com
 * 路径：method 名的点转斜杠（open.item.list.get → /open/item/list/get）
 * 签名：把 access_token / appkey / method / param / signMethod / timestamp / version
 *       按 key 字典序拼 k=v&…，末尾加 &signSecret=xxx，HMAC-SHA256(signSecret) → Base64。
 *       param 为业务参数 JSON 序列化后的串。
 * 时间戳：毫秒。请求方式：GET（query 全带）或 POST（URL 只带 appkey，其余 form 表单）；
 *       读接口走 GET，写接口走 POST（与官方 SDK 默认一致）。
 *
 * 能力：test / product.list / product.update / product.price / product.stock /
 *       product.listing / order.list / order.ship
 * 方法名：open.item.list.get / open.item.get / open.item.edit / open.seller.order.pcursor.list /
 *         open.seller.order.goods.deliver / open.user.seller.get
 * 订单状态 status：10 待付款 · 30 已付款 · 40 已发货 · 50 已签收 · 70 订单成功 · 80 订单失败
 * 返回：{ result, data, error_msg }；result=1 成功（个别接口用 code=0，做兼容）。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import { hmacSha256Base64 } from './sign.js';
import { fetchJson, errorDetail } from './http.js';

const GATEWAY = 'https://openapi.kwaixiaodian.com';

export const KUAISHOU_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'appKey', label: 'App ID（appkey）', required: true,
    hint: '快手电商开放平台 open.kwaixiaodian.com → 应用中心，复制应用的 AppID（ks 开头）。',
  },
  {
    key: 'signSecret', label: 'Sign Secret（签名密钥）', required: true, secret: true,
    hint: '应用详情里的「签名密钥 signSecret」（只用于加签，不随请求发出）。',
  },
  {
    key: 'appSecret', label: 'App Secret', required: true, secret: true,
    hint: '应用详情里的 App Secret（OAuth 换 token 用，与 signSecret 是两个值）。',
  },
  {
    key: 'accessToken', label: 'Access Token', required: true, secret: true,
    hint: '商家授权后换取（授权链接 → 商家确认 → 拿 auth_code 换 token）；刷新 token 时 refresh_token 也会更新，注意持久化。',
  },
];

export function parseKuaishouCreds(raw: string): PlatformCredentialValues | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const appKey = String(o.appKey ?? '').trim();
  const signSecret = String(o.signSecret ?? '').trim();
  const accessToken = String(o.accessToken ?? '').trim();
  // appSecret 只在换/刷 token 时需要，直连调用可缺省 → 不作为必填校验
  if (!appKey || !signSecret || !accessToken) return null;
  return { appKey, signSecret, accessToken, ...(String(o.appSecret ?? '').trim() ? { appSecret: String(o.appSecret).trim() } : {}) };
}

/** 稳定序列化业务参数（key 排序，避免同一请求因键序不同签出不同的名） */
function encodeParam(params: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== null).sort()) {
    sorted[k] = params[k];
  }
  return JSON.stringify(sorted);
}

/** method 名转路径：open.item.list.get → /open/item/list/get */
function toPath(method: string): string {
  return '/' + method.replace(/\./g, '/');
}

export interface KuaishouResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: PlatformApiProbe['step'];
}

/** 业务参数表单字段（GET 时不给 Content-Type） */
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' } as const;

export async function ksRequest(
  creds: PlatformCredentialValues,
  api: string,
  params: Record<string, unknown>,
  httpMethod: 'GET' | 'POST',
): Promise<KuaishouResult> {
  const appKey = String(creds.appKey || '').trim();
  const signSecret = String(creds.signSecret || '').trim();
  const accessToken = String(creds.accessToken || '').trim();
  if (!appKey || !signSecret || !accessToken) {
    return { ok: false, step: 'creds', message: '缺少 appKey / signSecret / accessToken —— 按表单提示到快手电商开放平台获取' };
  }
  const param = encodeParam(params);
  const timestamp = String(Date.now());
  const version = '1';
  // 签名串：固定七参数按字典序 k=v& 拼接，末尾 &signSecret=…（signSecret 只进签名不进请求）
  const concat = [
    `access_token=${accessToken}`,
    `appkey=${appKey}`,
    `method=${api}`,
    `param=${param}`,
    'signMethod=HMAC_SHA256',
    `timestamp=${timestamp}`,
    `version=${version}`,
    `signSecret=${signSecret}`,
  ].join('&');
  const sign = hmacSha256Base64(signSecret, concat);
  const base: Record<string, string> = {
    method: api, access_token: accessToken, param,
    signMethod: 'HMAC_SHA256', timestamp, version, sign,
  };
  if (httpMethod === 'POST') {
    // POST：URL 只带 appkey，其余走 form body
    const body = new URLSearchParams({ ...base, appkey: appKey }).toString();
    const r = await fetchJson(`${GATEWAY}${toPath(api)}?appkey=${encodeURIComponent(appKey)}`, {
      method: 'POST', headers: { ...FORM }, body,
    });
    return parseKsResponse(r);
  }
  const query = new URLSearchParams({ ...base, appkey: appKey });
  const r = await fetchJson(`${GATEWAY}${toPath(api)}?${query.toString()}`);
  return parseKsResponse(r);
}

function parseKsResponse(r: { ok: boolean; step?: PlatformApiProbe['step']; error?: string; json?: Record<string, unknown> }): KuaishouResult {
  if (!r.ok) return { ok: false, step: r.step, message: r.error };
  const json = r.json || {};
  // 官方主口径 result=1；兼容部分接口的 code=0
  const result = Number(json.result ?? json.code);
  const success = result === 1 || result === 0;
  if (!success) {
    const detail = errorDetail(json, String(json.error_msg ?? json.msg ?? `错误码 ${result}`));
    const step = /token|授权|登录/i.test(detail) ? 'auth' : /频繁|繁忙|限流|busy|limit/i.test(detail) ? 'rate' : 'api';
    return { ok: false, step, message: `快手错误（${result}）：${detail}` };
  }
  return { ok: true, data: (json.data as Record<string, unknown>) || {} };
}

// ---------- 业务能力 ----------

/** 连通性自检：商家信息接口，只读无害 */
export async function kuaishouTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  const r = await ksRequest(creds, 'open.user.seller.get', {}, 'GET');
  if (!r.ok) return { ok: false, message: r.message || '自检失败', step: r.step };
  const d = r.data || {};
  const nick = String((d as { sellerNick?: unknown }).sellerNick ?? '');
  return { ok: true, message: `已连接快手小店${nick ? `（${nick}）` : ''}` };
}

/** 商品列表（pageNumber 从 1 开始，pageSize 10~100） */
export async function kuaishouListProducts(
  creds: PlatformCredentialValues,
  opts: { page?: number; pageSize?: number } = {},
) {
  return ksRequest(creds, 'open.item.list.get', {
    pageNumber: Math.max(1, opts.page ?? 1),
    pageSize: Math.min(Math.max(opts.pageSize ?? 20, 10), 100),
  }, 'GET');
}

/** 商品详情（写后回读用） */
export async function kuaishouGetItem(creds: PlatformCredentialValues, kwaiItemId: string | number) {
  return ksRequest(creds, 'open.item.get', { kwaiItemId: Number(kwaiItemId) || kwaiItemId }, 'GET');
}

/**
 * 编辑商品（open.item.edit 为全量编辑接口：改标题/价格/库存都走它）。
 * 这里只封装用到的字段；kwaiItemId 必填，其余按需带。
 */
export async function kuaishouEditItem(
  creds: PlatformCredentialValues,
  kwaiItemId: string | number,
  patch: { title?: string; priceCents?: number; stock?: number; online?: boolean },
) {
  const body: Record<string, unknown> = { kwaiItemId: Number(kwaiItemId) || kwaiItemId };
  if (patch.title != null) body.title = patch.title;
  if (patch.priceCents != null) body.price = Math.max(0, Math.trunc(patch.priceCents));
  if (patch.stock != null) body.stockNum = Math.max(0, Math.trunc(patch.stock));
  if (patch.online != null) body.itemStatus = patch.online ? 1 : 0;
  return ksRequest(creds, 'open.item.edit', body, 'POST');
}

/**
 * 订单列表（游标方式）。
 * 官方限制：beginTime/endTime 为毫秒，范围 ≤1 天（活动期可能缩短到小时级），
 * 最多查 90 天内；pcursor 首次传空串，返回 "nomore" 表示到底。
 */
export async function kuaishouListOrders(
  creds: PlatformCredentialValues,
  opts: { pcursor?: string; beginTimeMs?: number; endTimeMs?: number; pageSize?: number } = {},
) {
  const end = opts.endTimeMs ?? Date.now();
  const begin = opts.beginTimeMs ?? end - 23 * 3600 * 1000; // 官方限制范围 ≤1 天，留 1h 余量
  return ksRequest(creds, 'open.seller.order.pcursor.list', {
    type: 1, // 全部状态
    queryType: 2, // 按更新时间查（增量拉取友好）
    beginTime: begin,
    endTime: end,
    pageSize: Math.min(Math.max(opts.pageSize ?? 20, 1), 100),
    ...(opts.pcursor ? { pcursor: opts.pcursor } : {}),
  }, 'GET');
}

/** 发货（不支持拆单多次发货；expressCode 从快递公司列表接口取数字 code） */
export async function kuaishouOrderDeliver(
  creds: PlatformCredentialValues,
  orderId: string,
  expressCode: string,
  expressNo: string,
) {
  return ksRequest(creds, 'open.seller.order.goods.deliver', {
    orderId: Number(orderId) || orderId,
    expressCode: Number(expressCode),
    expressNo,
  }, 'POST');
}

/** 快递公司列表（发货前查 expressCode 用，只读） */
export async function kuaishouExpressCompanies(creds: PlatformCredentialValues) {
  return ksRequest(creds, 'open.express.company.list', {}, 'GET');
}

export const kuaishouPlatformClient: PlatformApiClient = {
  id: 'kuaishou',
  label: '快手小店开放平台',
  credentialFields: KUAISHOU_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.price', 'product.stock', 'product.listing', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseKuaishouCreds(raw),
  test: kuaishouTest,
};

/**
 * 淘宝 / 天猫 TOP 客户端（2026-10-22）。
 *
 * 官方文档：
 *   签名 https://open.taobao.com/doc.htm?docId=101617&docType=1
 *   公共参数 https://developer.alibaba.com/docs/doc.htm?articleId=105423&docType=1&treeId=351
 *   API 文档中心 https://open.taobao.com/api.htm
 *
 * 鉴权：app_key + app_secret（应用级）+ session（卖家授权后的 top session key）。
 * 签名：md5(app_secret + 参数按名升序 k+v 串 + app_secret) 大写；时间戳 GMT+8。
 *
 * 能力（方法名均来自官方文档）：
 *   test taobao.time.get / product.list taobao.items.onsale.get / 标题·价格 taobao.item.update /
 *   库存 taobao.item.quantity.update / 上下架 taobao.item.update.listing|delisting /
 *   订单 taobao.trades.sold.get / 发货 taobao.logistics.offline.send。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import { topSign } from './sign.js';
import { fetchJson, errorDetail } from './http.js';

const PROD_GATEWAY = 'https://eco.taobao.com/router/rest';
const SANDBOX_GATEWAY = 'http://gw.api.tbsandbox.com/router/rest';

export const TAOBAO_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'appKey', label: 'App Key', required: true,
    hint: '登录淘宝开放平台 open.taobao.com → 控制台 → 应用管理 → 你的应用，复制 App Key。',
  },
  {
    key: 'appSecret', label: 'App Secret', required: true, secret: true,
    hint: '同一应用的 App Secret（只用于签名，不会随请求发出）。',
  },
  {
    key: 'session', label: 'Top Session', required: true, secret: true,
    hint: '卖家登录授权后拿到的 session（形如 6100…）；自用型应用可用 taobao.top.auth.token.create 换取。卖家中心重新授权会使旧 session 失效。',
  },
  {
    key: 'gateway', label: '网关',
    options: [
      { label: '正式 eco.taobao.com', value: PROD_GATEWAY },
      { label: '沙箱 gw.api.tbsandbox.com', value: SANDBOX_GATEWAY },
    ],
    defaultValue: PROD_GATEWAY,
    hint: '沙箱可用性以开放平台控制台为准；正式经营用生产网关。',
  },
];

export function parseTaobaoCreds(raw: string): PlatformCredentialValues | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const appKey = String(o.appKey ?? '').trim();
  const appSecret = String(o.appSecret ?? '').trim();
  const session = String(o.session ?? '').trim();
  if (!appKey || !appSecret || !session) return null;
  return {
    appKey, appSecret, session,
    gateway: String(o.gateway ?? PROD_GATEWAY) === SANDBOX_GATEWAY ? SANDBOX_GATEWAY : PROD_GATEWAY,
  };
}

/** 北京时间字符串（TOP 要求 GMT+8，不依赖运行机器时区） */
function beijingTimestamp(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

interface TopResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: PlatformApiProbe['step'];
}

export async function topRequest(
  creds: PlatformCredentialValues,
  method: string,
  params: Record<string, unknown> = {},
): Promise<TopResult> {
  const appKey = String(creds.appKey || '').trim();
  const appSecret = String(creds.appSecret || '').trim();
  const session = String(creds.session || '').trim();
  if (!appKey || !appSecret || !session) {
    return { ok: false, step: 'creds', message: '缺少 appKey / appSecret / session —— 按表单提示到淘宝开放平台获取' };
  }
  const common: Record<string, string> = {
    method,
    app_key: appKey,
    session,
    timestamp: beijingTimestamp(),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
  };
  const business: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') business[k] = String(v);
  }
  const all = { ...common, ...business };
  const sign = topSign(all, appSecret);
  const body = new URLSearchParams({ ...all, sign }).toString();

  const gateway = String(creds.gateway || '') === SANDBOX_GATEWAY ? SANDBOX_GATEWAY : PROD_GATEWAY;
  const r = await fetchJson(gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) return { ok: false, step: r.step, message: r.error };
  const json = r.json || {};
  if (json.error_response) {
    const detail = errorDetail(json, '未知错误');
    const raw = json.error_response as Record<string, unknown>;
    const code = String(raw.code ?? raw.error_code ?? '');
    const step = /limited|throttl|频繁/i.test(detail) ? 'rate' : /permission|scope|session|auth/i.test(detail) ? 'auth' : 'api';
    return { ok: false, step, message: `淘宝错误（${code}）：${detail}` };
  }
  const key = Object.keys(json).find((k) => k.endsWith('_response'));
  if (!key) {
    return { ok: false, step: 'api', message: '淘宝返回了无法识别的响应（缺少 xxx_response），不能确认结果' };
  }
  return { ok: true, data: json[key] as Record<string, unknown> };
}

export async function taobaoTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  const r = await topRequest(creds, 'taobao.time.get');
  if (!r.ok) return { ok: false, message: r.message || '自检失败', step: r.step };
  const t = (r.data as { time?: string } | undefined)?.time;
  return { ok: true, message: `已连接淘宝 TOP${t ? `（服务器时间 ${t}）` : ''}` };
}

// ---------- 业务能力 ----------
export async function taobaoListProducts(creds: PlatformCredentialValues, opts: { pageNo?: number; pageSize?: number } = {}) {
  return topRequest(creds, 'taobao.items.onsale.get', {
    fields: 'num_iid,title,price,num,outer_id,approve_status',
    page_no: opts.pageNo ?? 1,
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 100),
  });
}

/** 单商品详情（写后回读用） */
export async function taobaoGetItem(creds: PlatformCredentialValues, numIid: string | number) {
  return topRequest(creds, 'taobao.item.get', {
    num_iid: String(numIid || ''),
    fields: 'num_iid,title,price,num,outer_id,approve_status',
  });
}

/** 标题 / 价格等字段更新统一走 taobao.item.update（SKU 价格可另走 taobao.item.sku.price.update） */
export async function taobaoUpdateItem(creds: PlatformCredentialValues, numIid: string, patch: { title?: string; price?: string | number }) {
  return topRequest(creds, 'taobao.item.update', {
    num_iid: numIid,
    ...(patch.title != null ? { title: patch.title } : {}),
    ...(patch.price != null ? { price: String(patch.price) } : {}),
  });
}

/** 库存：type=1 全量 / 2 增量；无 SKU 商品可只传 num_iid + quantity */
export async function taobaoUpdateStock(
  creds: PlatformCredentialValues,
  numIid: string,
  quantity: number,
  opts: { skuId?: string; outerId?: string; type?: 1 | 2 } = {},
) {
  return topRequest(creds, 'taobao.item.quantity.update', {
    num_iid: numIid,
    quantity,
    type: opts.type ?? 1,
    ...(opts.skuId ? { sku_id: opts.skuId } : {}),
    ...(opts.outerId ? { outer_id: opts.outerId } : {}),
  });
}

export async function taobaoSetListing(creds: PlatformCredentialValues, numIid: string, online: boolean) {
  return topRequest(creds, online ? 'taobao.item.update.listing' : 'taobao.item.update.delisting', { num_iid: numIid });
}

export async function taobaoListOrders(
  creds: PlatformCredentialValues,
  opts: { startCreated?: string; endCreated?: string; status?: string; pageNo?: number; pageSize?: number } = {},
) {
  return topRequest(creds, 'taobao.trades.sold.get', {
    fields: 'tid,status,payment,created,receiver_name,num_iid,title',
    page_no: opts.pageNo ?? 1,
    page_size: Math.min(Math.max(opts.pageSize ?? 20, 1), 100),
    use_has_next: true,
    ...(opts.startCreated ? { start_created: opts.startCreated } : {}),
    ...(opts.endCreated ? { end_created: opts.endCreated } : {}),
    ...(opts.status ? { status: opts.status } : {}),
  });
}

/** 线下发货（自己联系物流）：把运单号回填到淘宝订单 */
export async function taobaoShipOffline(
  creds: PlatformCredentialValues,
  tid: string,
  companyCode: string,
  outSid: string,
) {
  return topRequest(creds, 'taobao.logistics.offline.send', { tid, company_code: companyCode, out_sid: outSid });
}

export const taobaoPlatformClient: PlatformApiClient = {
  id: 'taobao',
  label: '淘宝 / 天猫 TOP',
  credentialFields: TAOBAO_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.price', 'product.stock', 'product.listing', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseTaobaoCreds(raw),
  test: taobaoTest,
};

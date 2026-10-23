/**
 * 1688（阿里巴巴开放平台）客户端（2026-10-22）。
 *
 * 官方文档：签名 https://open.1688.com/doc/signature.htm
 *           商品 API https://open.1688.com/api/overview.htm?id=product_new
 *           交易 API https://open.1688.com/api/overview.htm?id=trade_new
 *
 * 网关：POST https://gw.open.1688.com/openapi/param2/1/{namespace}/{apiName}/{appKey}
 * 签名：剔除 _aop_signature 与空值，参数名 ASCII 升序拼 k+v，
 *       md5(appSecret + 拼接串 + appSecret) 大写；_aop_timestamp 为毫秒并参与签名。
 *
 * 能力：test（product.list.get 轻量探测）/ product.list / product.update(标题) /
 *       product.stock / product.listing(expire|republish) / order.list / order.ship。
 * 注意：标题字段是 productInfo.subject（不是 title）；上下架用 expire/republish，
 *       repost 只是"重发提升排序"，不等于上架。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import { ali1688Sign } from './sign.js';
import { fetchJson, errorDetail } from './http.js';

const BASE = 'https://gw.open.1688.com/openapi/param2/1';

export const ALI1688_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'appKey', label: 'App Key', required: true,
    hint: '登录 1688 开放平台 open.1688.com → 控制台 → 应用管理 → 你的应用，复制 App Key。',
  },
  {
    key: 'appSecret', label: 'App Secret', required: true, secret: true,
    hint: '同一应用的 App Secret（只用于签名，不会随请求发出）。',
  },
  {
    key: 'accessToken', label: 'Access Token', required: true, secret: true,
    hint: '卖家通过 auth.1688.com/oauth/authorize 授权后换取 access_token（system.oauth2/getToken 系列）。',
  },
];

export function parseAli1688Creds(raw: string): PlatformCredentialValues | null {
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const appKey = String(o.appKey ?? '').trim();
  const appSecret = String(o.appSecret ?? '').trim();
  const accessToken = String(o.accessToken ?? '').trim();
  if (!appKey || !appSecret || !accessToken) return null;
  return { appKey, appSecret, accessToken };
}

interface AliResult {
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
  step?: PlatformApiProbe['step'];
}

/** apiName 形如 'com.alibaba.product/alibaba.product.list.get' */
export async function ali1688Request(
  creds: PlatformCredentialValues,
  apiName: string,
  params: Record<string, unknown> = {},
): Promise<AliResult> {
  const appKey = String(creds.appKey || '').trim();
  const appSecret = String(creds.appSecret || '').trim();
  const accessToken = String(creds.accessToken || '').trim();
  if (!appKey || !appSecret || !accessToken) {
    return { ok: false, step: 'creds', message: '缺少 appKey / appSecret / accessToken —— 按表单提示到 1688 开放平台获取' };
  }
  const signed: Record<string, string> = { access_token: accessToken, _aop_timestamp: String(Date.now()) };
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    signed[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  const signature = ali1688Sign(signed, appSecret);
  const body = new URLSearchParams({ ...signed, _aop_signature: signature }).toString();
  // apiName 形如 com.alibaba.product/alibaba.product.list.get → 路径是 /param2/1/{namespace}/{apiName}
  const [namespace, api] = apiName.split('/');
  const url = `${BASE}/${namespace}/${api}/${encodeURIComponent(appKey)}`;

  const r = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) return { ok: false, step: r.step, message: r.error };
  const json = r.json || {};
  const errCode = json.errorCode ?? json.error_code;
  if (errCode) {
    const detail = errorDetail(json, `错误码 ${String(errCode)}`);
    const step = /token|auth|permission|no.?right/i.test(detail) ? 'auth'
      : /limit|frequen|频繁/i.test(detail) ? 'rate' : 'api';
    return { ok: false, step, message: `1688 错误（${String(errCode)}）：${detail}` };
  }
  if (!Object.prototype.hasOwnProperty.call(json, 'result')) {
    return { ok: false, step: 'api', message: '1688 返回了无法识别的响应（缺少 result），不能确认结果' };
  }
  return { ok: true, data: (json.result as Record<string, unknown>) || {} };
}

export async function ali1688Test(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  // 官方没有 time/ping：用最小分页的只读商品列表做鉴权探测
  const r = await ali1688Request(creds, 'com.alibaba.product/alibaba.product.list.get', { pageNo: 1, pageSize: 1 });
  if (!r.ok) return { ok: false, message: r.message || '自检失败', step: r.step };
  const total = (r.data as { totalRecords?: number } | undefined)?.totalRecords;
  return { ok: true, message: `已连接 1688 开放平台${total != null ? `（商品 ${total} 个）` : ''}` };
}

// ---------- 业务能力 ----------
export async function ali1688ListProducts(
  creds: PlatformCredentialValues,
  opts: { pageNo?: number; pageSize?: number; statusList?: string } = {},
) {
  return ali1688Request(creds, 'com.alibaba.product/alibaba.product.list.get', {
    pageNo: opts.pageNo ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 20, 1), 20),
    ...(opts.statusList ? { statusList: opts.statusList } : {}),
  });
}

/** 商品详情（写后回读用） */
export async function ali1688GetProduct(creds: PlatformCredentialValues, productId: string | number) {
  return ali1688Request(creds, 'com.alibaba.product/alibaba.product.get', { productID: Number(productId) || productId });
}

/** 编辑商品：productInfo 结构与类目 schema 相关；标题字段是 subject */
export async function ali1688EditProduct(
  creds: PlatformCredentialValues,
  productId: string | number,
  productInfo: Record<string, unknown>,
) {
  return ali1688Request(creds, 'com.alibaba.product/alibaba.product.edit', {
    productID: Number(productId) || productId,
    productInfo,
    webSite: '1688',
  });
}

export function ali1688UpdateTitle(creds: PlatformCredentialValues, productId: string | number, subject: string) {
  return ali1688EditProduct(creds, productId, { productID: Number(productId) || productId, subject });
}

export async function ali1688UpdateStock(
  creds: PlatformCredentialValues,
  productId: string | number,
  change: { amount?: number; skuStocks?: Array<{ skuId: string | number; stockChange: number }>; increment?: boolean },
) {
  const entry: Record<string, unknown> = {
    productID: Number(productId) || productId,
    increaceModify: !!change.increment,
    ...(change.amount != null ? { productAmountChange: Math.trunc(change.amount) } : {}),
    ...(change.skuStocks?.length
      ? { skuStocks: change.skuStocks.map((s) => ({ skuId: Number(s.skuId) || s.skuId, stockChange: Math.trunc(s.stockChange) })) }
      : {}),
  };
  return ali1688Request(creds, 'com.alibaba.product/alibaba.product.modifyStock', {
    productStockChange: [entry],
    webSite: '1688',
  });
}

export async function ali1688SetListing(creds: PlatformCredentialValues, productIds: Array<string | number>, online: boolean) {
  const ids = productIds.map((id) => Number(id) || id);
  return ali1688Request(
    creds,
    online ? 'com.alibaba.product/alibaba.product.republish' : 'com.alibaba.product/alibaba.product.expire',
    { productIds: ids, webSite: '1688' },
  );
}

export async function ali1688ListOrders(
  creds: PlatformCredentialValues,
  opts: { page?: number; pageSize?: number; orderStatus?: string; createStartTime?: string; createEndTime?: string } = {},
) {
  return ali1688Request(creds, 'com.alibaba.trade/alibaba.trade.getSellerOrderList', {
    page: opts.page ?? 1,
    pageSize: Math.min(Math.max(opts.pageSize ?? 20, 1), 20),
    ...(opts.orderStatus ? { orderStatus: opts.orderStatus } : {}),
    ...(opts.createStartTime ? { createStartTime: opts.createStartTime } : {}),
    ...(opts.createEndTime ? { createEndTime: opts.createEndTime } : {}),
  });
}

/** 线下发货：sendGoods 为订单/明细，extBody 里带物流公司与运单号 */
export async function ali1688ShipOffline(
  creds: PlatformCredentialValues,
  input: { orderId: string | number; orderEntryIds?: Array<string | number>; cpCode: string; logisticsCpName?: string; mailNo: string },
) {
  return ali1688Request(creds, 'com.alibaba.logistics/alibaba.logistics.OpDeliverySendOrder.offline', {
    sendGoods: [{
      orderId: Number(input.orderId) || input.orderId,
      ...(input.orderEntryIds?.length ? { orderEntryIds: input.orderEntryIds.map((x) => Number(x) || x) } : {}),
    }],
    extBody: JSON.stringify({
      cpCode: input.cpCode,
      ...(input.logisticsCpName ? { logisticsCpName: input.logisticsCpName } : {}),
      mailNo: input.mailNo,
    }),
  });
}

export const ali1688PlatformClient: PlatformApiClient = {
  id: '1688',
  label: '1688 开放平台',
  credentialFields: ALI1688_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.stock', 'product.listing', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseAli1688Creds(raw),
  test: ali1688Test,
};

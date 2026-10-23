/**
 * 亚马逊 SP-API 平台客户端（2026-10-22）：把底层 amazon-sp-api.ts 包装成统一的 PlatformApiClient。
 *
 * 官方要点（见 amazon-sp-api.ts 注释）：
 *   - SigV4 用 AWS region（na→us-east-1 / eu→eu-west-1 / fe→us-west-2）；
 *   - 标题/价格/库存都通过 Listings PATCH 写；Product Pricing 只读；FBA 库存只读；
 *   - 确认发货走 POST /orders/v0/orders/{orderId}/shipmentConfirmation（不是 /shipment）。
 *
 * 能力：test / product.list / product.update(title) / product.price / product.stock(MFN) /
 *   order.list / order.ship。listing 状态不可直接写，故不标 product.listing。
 */
import type {
  PlatformApiClient, PlatformApiProbe, PlatformCredentialField, PlatformCredentialValues,
} from './types.js';
import {
  parseSpApiCreds, spApiCheck, spApiRequest, type AmazonSpApiCreds,
} from '../amazon-sp-api.js';

export const AMAZON_CREDENTIAL_FIELDS: PlatformCredentialField[] = [
  {
    key: 'clientId', label: 'LWA Client ID', required: true,
    hint: '卖家中心 → 开发者中心 → 开发应用（LWA）：复制 Client ID（形如 amzn1.application-oa2-client.xxx）。',
  },
  {
    key: 'clientSecret', label: 'LWA Client Secret', required: true, secret: true,
    hint: '同一 LWA 应用的 Client Secret。',
  },
  {
    key: 'refreshToken', label: 'Refresh Token', required: true, secret: true,
    hint: '用 LWA 授权流程（Seller Central 自助授权）换取 refresh token（形如 Atzr|…）。',
  },
  {
    key: 'awsAccessKeyId', label: 'IAM Access Key ID', required: true,
    hint: 'AWS IAM 用户的 Access Key（SP-API 调用必须用 SigV4 签名，不能只用 LWA）。',
  },
  {
    key: 'awsSecretAccessKey', label: 'IAM Secret Access Key', required: true, secret: true,
    hint: '对应 IAM 用户的 Secret。建议使用专用于 SP-API 的 IAM 用户并最小授权。',
  },
  {
    key: 'awsSessionToken', label: 'IAM Session Token', secret: true,
    hint: '仅当使用 STS 临时凭据时填写；长期 IAM 用户留空。',
  },
  {
    key: 'region', label: '分区',
    options: [
      { label: '北美 na（US/CA/MX/BR）', value: 'na' },
      { label: '欧洲 eu（EU/IN/SA/AE…）', value: 'eu' },
      { label: '远东 fe（JP/AU/SG）', value: 'fe' },
    ],
    defaultValue: 'na',
    hint: '决定 SP-API 域名与 SigV4 区域（na→us-east-1 / eu→eu-west-1 / fe→us-west-2）。',
  },
  {
    key: 'marketplaceIds', label: 'Marketplace ID',
    placeholder: 'ATVPDKIKX0DER',
    hint: '默认站点 marketplace id（美国 ATVPDKIKX0DER）。业务接口必填，多个用英文逗号分隔。',
  },
  {
    key: 'sellerId', label: 'Seller ID',
    hint: '卖家 ID（Listings 接口路径需要；卖家中心账户信息里可查）。',
  },
];

interface AmazonCreds extends PlatformCredentialValues {
  clientId: string; clientSecret: string; refreshToken: string;
  awsAccessKeyId: string; awsSecretAccessKey: string;
  awsSessionToken: string;
  region: 'na' | 'eu' | 'fe';
  /** 逗号分隔的 marketplace id 串（与表单字段一致） */
  marketplaceIds: string;
  sellerId: string;
}

export function parseAmazonCreds(raw: string): AmazonCreds | null {
  const base = parseSpApiCreds(raw);
  if (!base) return null;
  let o: Record<string, unknown> = {};
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  // 自检只需要 LWA + IAM；Marketplace/Seller ID 由业务动作按需校验
  if (!base.awsAccessKeyId || !base.awsSecretAccessKey) return null;
  return {
    ...(base as unknown as PlatformCredentialValues),
    clientId: base.clientId,
    clientSecret: base.clientSecret,
    refreshToken: base.refreshToken,
    awsAccessKeyId: base.awsAccessKeyId,
    awsSecretAccessKey: base.awsSecretAccessKey,
    awsSessionToken: base.awsSessionToken ?? '',
    region: base.region || 'na',
    marketplaceIds: String(o.marketplaceIds ?? ''),
    sellerId: String(o.sellerId ?? ''),
  } as AmazonCreds;
}

function toSpCreds(creds: PlatformCredentialValues): AmazonSpApiCreds {
  return {
    clientId: String(creds.clientId || ''),
    clientSecret: String(creds.clientSecret || ''),
    refreshToken: String(creds.refreshToken || ''),
    awsAccessKeyId: String(creds.awsAccessKeyId || ''),
    awsSecretAccessKey: String(creds.awsSecretAccessKey || ''),
    awsSessionToken: creds.awsSessionToken ? String(creds.awsSessionToken) : undefined,
    region: (creds.region === 'eu' || creds.region === 'fe' ? creds.region : 'na'),
    marketplaceIds: String(creds.marketplaceIds || '').split(',').map((s) => s.trim()).filter(Boolean),
    sellerId: creds.sellerId ? String(creds.sellerId) : undefined,
  };
}

function firstMarketplace(creds: PlatformCredentialValues): string {
  const id = String(creds.marketplaceIds || '').split(',')[0]?.trim();
  if (!id) throw new Error('缺少 Marketplace ID（在凭据里填默认站点，如美国 ATVPDKIKX0DER）');
  return id;
}

function requireSellerId(creds: PlatformCredentialValues): string {
  const id = String(creds.sellerId || '').trim();
  if (!id) throw new Error('缺少 Seller ID（Listings 接口路径需要）');
  return id;
}

export async function amazonTest(creds: PlatformCredentialValues): Promise<PlatformApiProbe> {
  const r = await spApiCheck(toSpCreds(creds));
  if (r.ok) return { ok: true, message: `${r.note || 'SP-API 已连通'}${r.marketplaces.length ? `（${r.marketplaces.join('、')}）` : ''}` };
  const step = r.step === 'creds' ? 'creds' : r.step === 'lwa' ? 'auth' : r.step === 'sigv4' ? 'auth' : 'api';
  return { ok: false, step, message: r.reason };
}

// ---------- 业务能力 ----------
export async function amazonSearchCatalog(
  creds: PlatformCredentialValues,
  opts: { keywords?: string; identifiers?: string[]; identifiersType?: string; pageSize?: number },
): Promise<Record<string, unknown>> {
  const q: Record<string, string> = {
    marketplaceIds: firstMarketplace(creds),
    pageSize: String(Math.min(Math.max(opts.pageSize ?? 10, 1), 20)),
  };
  if (opts.identifiers?.length) {
    q.identifiers = opts.identifiers.slice(0, 20).join(',');
    q.identifiersType = opts.identifiersType || 'ASIN';
  } else if (opts.keywords) {
    q.keywords = opts.keywords;
  }
  return spApiRequest(toSpCreds(creds), 'GET', '/catalog/2022-04-01/items', q) as Promise<Record<string, unknown>>;
}

/**
 * 全量 Listing 搜索（Search Listings Items）：返回卖家自己的 SKU（不是 ASIN），
 * 支持 pageToken 游标，最多翻到 1000 条。用于「全量同步」商品。
 */
export async function amazonSearchListings(
  creds: PlatformCredentialValues,
  opts: { pageSize?: number; pageToken?: string; includedData?: string } = {},
): Promise<{ items: Array<Record<string, unknown>>; nextToken: string; numberOfResults: number }> {
  const sellerId = requireSellerId(creds);
  const q: Record<string, string> = {
    marketplaceIds: firstMarketplace(creds),
    includedData: opts.includedData || 'summaries,offers',
    pageSize: String(Math.min(Math.max(opts.pageSize ?? 20, 1), 20)),
  };
  if (opts.pageToken) q.pageToken = opts.pageToken;
  const data = await spApiRequest(
    toSpCreds(creds), 'GET',
    `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`,
    q,
  ) as Record<string, unknown>;
  const items = (data.items as Array<Record<string, unknown>> | undefined) || [];
  const pagination = data.pagination as { nextToken?: unknown } | undefined;
  return {
    items,
    nextToken: String(pagination?.nextToken ?? data.nextToken ?? ''),
    numberOfResults: Number(data.numberOfResults ?? items.length),
  };
}

export async function amazonGetListing(creds: PlatformCredentialValues, sku: string): Promise<Record<string, unknown>> {
  const sellerId = requireSellerId(creds);
  return spApiRequest(
    toSpCreds(creds), 'GET',
    `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
    { marketplaceIds: firstMarketplace(creds), includedData: 'summaries,attributes,offers,fulfillmentAvailability,issues' },
  ) as Promise<Record<string, unknown>>;
}

/** 通用 PATCH：patches 形如 [{op:'replace'|'merge', path:'/attributes/xxx', value:...}] */
export async function amazonPatchListing(
  creds: PlatformCredentialValues,
  sku: string,
  productType: string,
  patches: Array<{ op: 'add' | 'replace' | 'merge' | 'delete'; path: string; value?: unknown }>,
): Promise<Record<string, unknown>> {
  const sellerId = requireSellerId(creds);
  return spApiRequest(
    toSpCreds(creds), 'PATCH',
    `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
    { marketplaceIds: firstMarketplace(creds), includedData: 'issues' },
    { productType, patches },
  ) as Promise<Record<string, unknown>>;
}

export function amazonUpdateTitle(creds: PlatformCredentialValues, sku: string, productType: string, title: string, languageTag = 'en_US') {
  const marketplaceId = firstMarketplace(creds);
  return amazonPatchListing(creds, sku, productType, [{
    op: 'replace',
    path: '/attributes/item_name',
    value: [{ value: title, language_tag: languageTag, marketplace_id: marketplaceId }],
  }]);
}

/** 改价：官方推荐 merge 只改 purchasable_offer 的价格段 */
export async function amazonUpdatePrice(
  creds: PlatformCredentialValues,
  sku: string,
  productType: string,
  amount: number,
  currency = 'USD',
  audience: 'ALL' | 'B2B' = 'ALL',
): Promise<Record<string, unknown>> {
  const marketplaceId = firstMarketplace(creds);
  return amazonPatchListing(creds, sku, productType, [{
    op: 'merge',
    path: '/attributes/purchasable_offer',
    value: [{
      marketplace_id: marketplaceId,
      currency,
      audience,
      our_price: [{ schedule: [{ value_with_tax: Number(amount) }] }],
    }],
  }]);
}

/** 改库存（MFN）：merge fulfillment_availability 只改 quantity */
export function amazonUpdateStock(creds: PlatformCredentialValues, sku: string, productType: string, quantity: number) {
  return amazonPatchListing(creds, sku, productType, [{
    op: 'merge',
    path: '/attributes/fulfillment_availability',
    value: [{ fulfillment_channel_code: 'DEFAULT', quantity: Math.max(0, Math.trunc(quantity)) }],
  }]);
}

export async function amazonListOrders(
  creds: PlatformCredentialValues,
  opts: { createdAfter?: string; statuses?: string[]; maxResults?: number; nextToken?: string } = {},
): Promise<Record<string, unknown>> {
  const q: Record<string, string> = {
    MarketplaceIds: firstMarketplace(creds),
    CreatedAfter: opts.createdAfter || new Date(Date.now() - 7 * 86400000).toISOString(),
    MaxResultsPerPage: String(Math.min(Math.max(opts.maxResults ?? 50, 1), 100)),
  };
  if (opts.statuses?.length) q.OrderStatuses = opts.statuses.join(',');
  if (opts.nextToken) q.NextToken = opts.nextToken;
  return spApiRequest(toSpCreds(creds), 'GET', '/orders/v0/orders', q) as Promise<Record<string, unknown>>;
}

/** 订单明细（导入订单时补 items / orderItemId，确认发货要用） */
export async function amazonGetOrderItems(creds: PlatformCredentialValues, orderId: string): Promise<Record<string, unknown>> {
  return spApiRequest(
    toSpCreds(creds), 'GET',
    `/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`,
  ) as Promise<Record<string, unknown>>;
}

/** 确认发货（不是 /shipment，那个是 Easy Ship 状态更新） */
export async function amazonConfirmShipment(
  creds: PlatformCredentialValues,
  orderId: string,
  input: {
    carrierCode: string;
    trackingNumber: string;
    orderItems: Array<{ orderItemId: string; quantity: number }>;
    carrierName?: string;
    packageReferenceId?: string;
    shipDate?: string;
  },
): Promise<Record<string, unknown>> {
  const marketplaceId = firstMarketplace(creds);
  const body = {
    marketplaceId,
    packageDetail: {
      packageReferenceId: input.packageReferenceId || `pkg-${Date.now().toString(36)}`,
      carrierCode: input.carrierCode,
      carrierName: input.carrierName,
      trackingNumber: input.trackingNumber,
      shipDate: input.shipDate || new Date().toISOString(),
      orderItems: input.orderItems,
    },
  };
  return spApiRequest(
    toSpCreds(creds), 'POST',
    `/orders/v0/orders/${encodeURIComponent(orderId)}/shipmentConfirmation`,
    {}, body,
  ) as Promise<Record<string, unknown>>;
}

/** FBA 库存（只读） */
export async function amazonFbaInventory(
  creds: PlatformCredentialValues,
  opts: { sellerSkus?: string[] } = {},
): Promise<Record<string, unknown>> {
  const marketplaceId = firstMarketplace(creds);
  const q: Record<string, string> = {
    details: 'true',
    granularityType: 'Marketplace',
    granularityId: marketplaceId,
    marketplaceIds: marketplaceId,
  };
  if (opts.sellerSkus?.length) q.sellerSkus = opts.sellerSkus.slice(0, 50).join(',');
  return spApiRequest(toSpCreds(creds), 'GET', '/fba/inventory/v1/summaries', q) as Promise<Record<string, unknown>>;
}

export const amazonPlatformClient: PlatformApiClient = {
  id: 'amazon',
  label: 'Amazon SP-API',
  credentialFields: AMAZON_CREDENTIAL_FIELDS,
  capabilities: ['test', 'product.list', 'product.update', 'product.price', 'product.stock', 'inventory.get', 'order.list', 'order.ship'],
  parseCreds: (raw) => parseAmazonCreds(raw),
  test: amazonTest,
};

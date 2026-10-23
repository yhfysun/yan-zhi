// 店铺业务接口封装（2026-10-22 重构方案 §6/§11）。
//
// 职责：
//   - 商品 / 订单 / 发货 / 库存 / 看板的读接口 + 写动作；
//   - 业务数据的状态放**模块作用域**（与 shopSession 同理由：router-view 无 keep-alive，
//     切模式/切项目会销毁组件，状态放组件里会丢）；
//   - 写动作统一返回 error 字符串（空串 = 成功），成功后自动刷新该店业务数据与看板。
//
// ★ 前端只调 /plugin/shop-ops/*，永远不直连平台（方案 §2 铁律）。
import { ref } from 'vue';
import { api } from '../../../api/client';

// ---------- 领域类型（与后端 apps/server/src/shop/types.ts 对齐） ----------
export type ShopType = 'demo' | 'test' | 'production';
export type SupplyMode = 'stocked' | 'dropship';
export type ListingStatus = 'draft' | 'online' | 'offline';
export type OrderStatus = 'pending' | 'paid' | 'sourcing' | 'shipped' | 'completed' | 'refunded';
export type ShipmentStatus = 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'exception';

export interface BizProduct {
  id: string; shopId: string; sku: string; title: string;
  imageUrl?: string; category?: string;
  supplyMode: SupplyMode; sourceRef?: string;
  costCents: number; priceCents: number; currency: string;
  stock: number; safetyStock: number; listingStatus: ListingStatus;
  /** 平台侧标识与同步状态（platformProductId / platformVariantId / sync.status 等） */
  attrs?: Record<string, unknown>;
  createdAt: number; updatedAt: number;
}

export interface BizOrderItem { sku: string; title: string; qty: number; priceCents: number }

export interface BizOrder {
  id: string; shopId: string; orderNo: string; buyer?: string;
  amountCents: number; currency: string; status: OrderStatus;
  items: BizOrderItem[]; address: Record<string, unknown>;
  /** 平台订单号与同步状态（platformOrderId / sync.status 等） */
  attrs?: Record<string, unknown>;
  createdAt: number; paidAt?: number;
}

export interface BizShipment {
  id: string; shopId: string; orderId: string;
  carrier?: string; trackingNo?: string; status: ShipmentStatus;
  shippedAt?: number; deliveredAt?: number; note?: string; createdAt: number;
}

export interface BizStockMove {
  id: string; shopId: string; productId: string;
  kind: 'in' | 'out' | 'adjust'; qty: number;
  beforeQty: number; afterQty: number; reason?: string;
  actor: 'human' | 'ai'; createdAt: number;
}

export type PurchaseStatus = 'planned' | 'ordered' | 'paid' | 'received' | 'cancelled';
export interface BizPurchase {
  id: string; shopId: string; orderId: string; productId?: string;
  sku: string; offerRef: string; qty: number; unitCostCents: number;
  status: PurchaseStatus; note?: string; createdAt: number; updatedAt: number;
}

export interface BizDashboard {
  shopId: string; shopType: ShopType; supplyMode: SupplyMode;
  todaySalesCents: number; todayOrders: number;
  orderStatusCounts: Record<string, number>;
  pendingShip: number;
  lowStock: Array<{ sku: string; title: string; stock: number; safetyStock: number; daysLeft: number | null }>;
  recentOrders: Array<{ orderNo: string; buyer?: string; amountCents: number; status: OrderStatus; createdAt: number }>;
}

export interface JumpPlan {
  kind: 'jump'; url: string; title: string; steps: string[]; automatable: boolean;
}

// ---------- 模块级业务状态（切页签/切模式不丢） ----------
export const bizProducts = ref<BizProduct[]>([]);
export const bizOrders = ref<BizOrder[]>([]);
export const bizShipments = ref<BizShipment[]>([]);
export const bizMoves = ref<BizStockMove[]>([]);
export const bizPurchases = ref<BizPurchase[]>([]);
export const bizDashboard = ref<BizDashboard | null>(null);
export const bizLoading = ref(false);
export const bizError = ref('');
/** 最近一次写动作的回执（成功摘要），用于页面顶部轻提示 */
export const bizLastSummary = ref('');
/** 当前业务数据属于哪家店 —— 切店必须清空，避免张店数据显示成李店 */
export const bizShopId = ref('');

type Outcome<T> =
  | { kind: 'done'; summary: string; data?: T }
  | { kind: 'jump'; plan: JumpPlan }
  | { kind: 'unsupported'; reason: string };

function errText(r: unknown): string {
  return (r as { error?: string }).error || '请求失败';
}

/** 解包后端 outcome：done 返回数据，其余转成用户能读的错误 */
function unpack<T>(r: unknown): { error: string; data?: T; summary?: string; jump?: JumpPlan } {
  if (!('data' in (r as object))) return { error: errText(r) };
  const out = (r as { data: Outcome<T> }).data;
  if (out.kind === 'done') return { error: '', data: out.data, summary: out.summary };
  if (out.kind === 'jump') return { error: '', jump: out.plan };
  return { error: out.reason || '该平台/动作暂不支持' };
}

function clearBiz(): void {
  bizProducts.value = [];
  bizOrders.value = [];
  bizShipments.value = [];
  bizMoves.value = [];
  bizDashboard.value = null;
  bizError.value = '';
  bizLastSummary.value = '';
}

async function loadAll(shopId: string): Promise<void> {
  bizLoading.value = true;
  bizError.value = '';
  try {
    const [p, o, s, m, d, pu] = await Promise.all([
      api.get<Outcome<BizProduct[]>>(`/plugin/shop-ops/products?shopId=${encodeURIComponent(shopId)}`),
      api.get<Outcome<BizOrder[]>>(`/plugin/shop-ops/orders?shopId=${encodeURIComponent(shopId)}`),
      api.get<Outcome<BizShipment[]>>(`/plugin/shop-ops/shipments?shopId=${encodeURIComponent(shopId)}`),
      api.get<Outcome<BizStockMove[]>>(`/plugin/shop-ops/stock/moves?shopId=${encodeURIComponent(shopId)}`),
      api.get<Outcome<BizDashboard>>(`/plugin/shop-ops/dashboard?shopId=${encodeURIComponent(shopId)}`),
      api.get<Outcome<BizPurchase[]>>(`/plugin/shop-ops/purchases?shopId=${encodeURIComponent(shopId)}`),
    ]);
    const pe = unpack<BizProduct[]>(p);
    const oe = unpack<BizOrder[]>(o);
    const se = unpack<BizShipment[]>(s);
    const me = unpack<BizStockMove[]>(m);
    const de = unpack<BizDashboard>(d);
    const pue = unpack<BizPurchase[]>(pu);
    const firstErr = pe.error || oe.error || se.error || me.error || de.error || pue.error;
    if (firstErr) { bizError.value = firstErr; return; }
    bizProducts.value = pe.data || [];
    bizOrders.value = oe.data || [];
    bizShipments.value = se.data || [];
    bizMoves.value = me.data || [];
    bizDashboard.value = de.data || null;
    bizPurchases.value = pue.data || [];
  } catch (e) {
    bizError.value = (e as Error).message || '业务数据加载失败';
  } finally {
    bizLoading.value = false;
  }
}

/** 切店/首次进入时调用；同店重复调用不重拉（force 可强制） */
export async function loadShopBiz(shopId: string, force = false): Promise<void> {
  if (!shopId) { bizShopId.value = ''; clearBiz(); return; }
  if (!force && bizShopId.value === shopId) return;
  if (bizShopId.value !== shopId) clearBiz();
  bizShopId.value = shopId;
  await loadAll(shopId);
}

export async function refreshShopBiz(): Promise<void> {
  if (bizShopId.value) await loadAll(bizShopId.value);
}

async function act(path: string, body: unknown, shopId: string): Promise<string> {
  const r = await api.post<Outcome<unknown>>(path, { ...(body as object), shopId });
  const u = unpack<unknown>(r);
  if (u.error) return u.error;
  bizLastSummary.value = u.summary || '';
  await loadAll(shopId);
  return '';
}

// ---------- 商品 ----------
export interface ProductPayload {
  sku: string; title: string; priceCents: number; costCents: number;
  stock: number; safetyStock: number; category?: string;
  sourceRef?: string; imageUrl?: string; listingStatus?: ListingStatus;
}

export function createProductApi(shopId: string, payload: ProductPayload): Promise<string> {
  return act('/plugin/shop-ops/products', payload, shopId);
}

export function updateProductApi(shopId: string, id: string, payload: Partial<ProductPayload>): Promise<string> {
  return act(`/plugin/shop-ops/products/${encodeURIComponent(id)}`, payload, shopId);
}

export async function deleteProductApi(shopId: string, id: string): Promise<string> {
  const r = await api.delete<Outcome<unknown>>(`/plugin/shop-ops/products/${encodeURIComponent(id)}?shopId=${encodeURIComponent(shopId)}`);
  const u = unpack<unknown>(r);
  if (u.error) return u.error;
  bizLastSummary.value = u.summary || '';
  await loadAll(shopId);
  return '';
}

export function setListingApi(shopId: string, id: string, online: boolean): Promise<string> {
  return act(`/plugin/shop-ops/products/${encodeURIComponent(id)}/listing`, { listing: online ? 'online' : 'offline' }, shopId);
}

export function setPriceApi(shopId: string, id: string, priceCents: number): Promise<string> {
  return act(`/plugin/shop-ops/products/${encodeURIComponent(id)}/price`, { newPriceCents: priceCents }, shopId);
}

export function changeStockApi(shopId: string, id: string, kind: 'in' | 'out' | 'adjust', qty: number, reason?: string): Promise<string> {
  return act(`/plugin/shop-ops/products/${encodeURIComponent(id)}/stock`, { kind, qty, reason }, shopId);
}

export function batchProductApi(shopId: string, ids: string[], action: 'listing' | 'price', payload: { listing?: 'online' | 'offline'; newPriceCents?: number }): Promise<string> {
  return act('/plugin/shop-ops/products/batch', { ids, action, ...payload }, shopId);
}

// ---------- 订单 / 发货 ----------
export function markOrderSourcedApi(shopId: string, orderId: string): Promise<string> {
  return act(`/plugin/shop-ops/orders/${encodeURIComponent(orderId)}/source`, {}, shopId);
}

/** 模拟订单（演示/测试店铺专用：造一条订单走发货闭环；生产店铺后端会拒绝） */
export function mockOrderApi(shopId: string, payload: { productId?: string; qty?: number; buyer?: string; status?: 'pending' | 'paid' }): Promise<string> {
  return act('/plugin/shop-ops/orders/mock', payload, shopId);
}

export interface ShipPayload {
  carrier: string;
  trackingNo: string;
  note?: string;
  /** 发货后把运单回填到平台 */
  pushPlatform?: boolean;
  approveProduction?: boolean;
  /** 平台物流标识：淘宝/亚马逊 companyCode、拼多多 logisticsId、1688 cpCode、TikTok shippingProviderId */
  companyCode?: string;
  logisticsId?: number;
  cpCode?: string;
  shippingProviderId?: string;
}

export async function shipOrderApi(
  shopId: string,
  orderId: string,
  payload: ShipPayload,
): Promise<{ error: string; platformSync?: { ok: boolean; message: string } }> {
  const r = await api.post<{ outcome: Outcome<unknown>; platformSync?: { ok: boolean; message: string } }>(
    `/plugin/shop-ops/orders/${encodeURIComponent(orderId)}/ship`,
    { ...payload, shopId, confirmed: true },
  );
  if (!('data' in r)) return { error: errText(r) };
  const u = unpack<unknown>({ data: r.data.outcome });
  if (u.error) return { error: u.error };
  bizLastSummary.value = u.summary || '';
  await loadAll(shopId);
  return { error: '', platformSync: r.data.platformSync };
}

// ---------- 本地 ↔ 平台同步 ----------
export interface SyncSummary { imported: number; updated: number; skipped: number; conflicts?: number; errors: string[] }
export interface PushFieldResult { field: string; ok: boolean; message?: string }
export interface PushProductResult { ok: boolean; message: string; results: PushFieldResult[] }

/** 平台 → 本地：导入商品 */
export async function importProductsApi(
  shopId: string,
  opts: { keywords?: string; asins?: string[]; limit?: number; policy?: 'local-first' | 'platform-first'; approveProduction?: boolean } = {},
): Promise<{ error: string; summary?: SyncSummary }> {
  const r = await api.post<SyncSummary>(`/plugin/shop-ops/connections/${encodeURIComponent(shopId)}/sync/products`, opts);
  if (!('data' in r)) return { error: errText(r) };
  await loadAll(shopId);
  return { error: '', summary: r.data };
}

/** 平台 → 本地：导入订单 */
export async function importOrdersApi(
  shopId: string,
  opts: { limit?: number; approveProduction?: boolean } = {},
): Promise<{ error: string; summary?: SyncSummary }> {
  const r = await api.post<SyncSummary>(`/plugin/shop-ops/connections/${encodeURIComponent(shopId)}/sync/orders`, opts);
  if (!('data' in r)) return { error: errText(r) };
  await loadAll(shopId);
  return { error: '', summary: r.data };
}

/** 本地 → 平台：推送商品字段（生产店铺需 approveProduction；confirmed 表示用户已在弹窗确认） */
export async function pushProductApi(
  shopId: string,
  productId: string,
  fields: Array<'price' | 'stock' | 'title' | 'listing'>,
  approveProduction = false,
): Promise<{ error: string; result?: PushProductResult; ticket?: string }> {
  const r = await api.post<PushProductResult | { kind: 'ticket'; summary: string }>(`/plugin/shop-ops/products/${encodeURIComponent(productId)}/sync`, {
    shopId, fields, approveProduction, confirmed: true,
  });
  if (!('data' in r)) return { error: errText(r) };
  const data = r.data as PushProductResult | { kind: 'ticket'; summary: string };
  if ((data as { kind?: string }).kind === 'ticket') return { error: '', ticket: (data as { summary: string }).summary };
  await loadAll(shopId);
  return { error: '', result: data as PushProductResult };
}

/** 本地 → 平台：回填运单（confirmed 表示用户已在弹窗确认） */
export async function pushShipmentApi(
  shopId: string,
  orderId: string,
  payload: { trackingNo: string; carrier: string; companyCode?: string; logisticsId?: number; cpCode?: string; shippingProviderId?: string; approveProduction?: boolean },
): Promise<{ error: string; result?: { ok: boolean; message: string }; ticket?: string }> {
  const r = await api.post<{ ok: boolean; message: string } | { kind: 'ticket'; summary: string }>(`/plugin/shop-ops/orders/${encodeURIComponent(orderId)}/push-shipment`, {
    ...payload, shopId, confirmed: true,
  });
  if (!('data' in r)) return { error: errText(r) };
  const data = r.data as { ok: boolean; message: string } | { kind: 'ticket'; summary: string };
  if ((data as { kind?: string }).kind === 'ticket') return { error: '', ticket: (data as { summary: string }).summary };
  await loadAll(shopId);
  return { error: '', result: data as { ok: boolean; message: string } };
}

// ---------- 同步增强（D） ----------
export interface SyncRunEntry {
  at: number;
  shopId: string;
  shopName: string;
  trigger: 'manual' | 'scheduled';
  imported: number;
  updated: number;
  conflicts: number;
  errors: number;
  ok: boolean;
  note?: string;
}

export async function fullSyncApi(
  shopId: string,
  approveProduction = false,
): Promise<{ error: string; entry?: SyncRunEntry }> {
  const r = await api.post<SyncRunEntry>(`/plugin/shop-ops/connections/${encodeURIComponent(shopId)}/sync/all`, { approveProduction });
  if (!('data' in r)) return { error: errText(r) };
  await loadAll(shopId);
  return { error: '', entry: r.data };
}

export async function saveSyncConfigApi(
  shopId: string,
  cfg: { syncPolicy?: 'local-first' | 'platform-first'; syncIntervalMin?: number },
): Promise<string> {
  const r = await api.patch(`/plugin/shop-ops/connections/${encodeURIComponent(shopId)}/sync-config`, cfg);
  if (!('data' in r)) return errText(r);
  return '';
}

export async function syncLogApi(shopId: string): Promise<{ error: string; entries: SyncRunEntry[] }> {
  const r = await api.get<SyncRunEntry[]>(`/plugin/shop-ops/sync/log?shopId=${encodeURIComponent(shopId)}`);
  if (!('data' in r)) return { error: errText(r), entries: [] };
  return { error: '', entries: r.data || [] };
}

// ---------- 统一平台动作（前后端唯一契约；后端按平台分发） ----------
export interface PlatformActionResponse {
  kind: 'ticket' | 'done' | 'failed';
  action?: string;
  summary?: string;
  result?: { ok: boolean; message?: string; step?: string; data?: unknown };
  readback?: { supported: boolean; ok?: boolean; message?: string; data?: unknown };
  requiresProductionApproval?: boolean;
}

export async function platformActionApi(
  shopId: string,
  action: string,
  payload: Record<string, unknown> = {},
  opts: { confirmed?: boolean; approveProduction?: boolean } = {},
): Promise<{ error: string; data?: PlatformActionResponse }> {
  const r = await api.post<PlatformActionResponse>(`/plugin/shop-ops/connections/${encodeURIComponent(shopId)}/platform-action`, {
    action, payload, confirmed: opts.confirmed === true, approveProduction: opts.approveProduction === true,
  });
  if (!('data' in r)) return { error: errText(r) };
  const d = r.data as PlatformActionResponse;
  if (d.kind === 'failed') return { error: d.result?.message || d.summary || '平台执行失败', data: d };
  return { error: '', data: d };
}

// ---------- 无货源采购 ----------
export async function createPurchasesApi(
  shopId: string,
  orderId: string,
  payload: { items?: Array<{ sku: string; qty?: number; offerRef?: string; unitCostCents?: number }>; note?: string; approveProduction?: boolean } = {},
): Promise<{ error: string; purchases?: BizPurchase[] }> {
  const r = await api.post<Outcome<BizPurchase[]>>(`/plugin/shop-ops/orders/${encodeURIComponent(orderId)}/purchase`, {
    ...payload, shopId,
  });
  const u = unpack<BizPurchase[]>(r);
  if (u.error) return { error: u.error };
  bizLastSummary.value = u.summary || '';
  await loadAll(shopId);
  return { error: '', purchases: u.data };
}

export async function updatePurchaseStatusApi(
  shopId: string,
  purchaseId: string,
  status: PurchaseStatus,
  approveProduction = false,
): Promise<string> {
  const r = await api.post<Outcome<unknown>>(`/plugin/shop-ops/purchases/${encodeURIComponent(purchaseId)}/status`, {
    status, approveProduction, shopId,
  });
  const u = unpack<unknown>(r);
  if (u.error) return u.error;
  bizLastSummary.value = u.summary || '';
  await loadAll(shopId);
  return '';
}

export async function purchaseJumpApi(shopId: string, purchaseId: string): Promise<{ error: string; plan?: JumpPlan }> {
  const r = await api.post<Outcome<unknown>>(`/plugin/shop-ops/purchases/${encodeURIComponent(purchaseId)}/jump`, { shopId });
  const u = unpack<unknown>(r);
  if (u.error) return { error: u.error };
  return { error: '', plan: u.jump };
}

export function purchasesForOrder(orderId: string): BizPurchase[] {
  return bizPurchases.value.filter((p) => p.orderId === orderId);
}

/** 同步状态角标：synced / failed / ''（未同步或本地数据） */export function syncStatusOf(attrs: Record<string, unknown> | undefined): 'synced' | 'failed' | '' {
  const s = (attrs?.sync as { status?: string } | undefined)?.status;
  return s === 'synced' ? 'synced' : s === 'failed' ? 'failed' : '';
}

/** 平台订单号（导入后才有；决定能否回填运单） */
export function platformOrderIdOf(order: BizOrder): string {
  const id = order.attrs?.platformOrderId;
  return id === undefined || id === null ? '' : String(id);
}

export interface TrackEvent { time: string; description: string; location?: string; status?: string }
export interface TrackResult { ok: boolean; provider?: string; trackingNo?: string; events: TrackEvent[]; message?: string; step?: string }

export async function trackShipmentApi(shopId: string, shipmentId: string): Promise<{ error: string; result?: TrackResult }> {
  const r = await api.post<TrackResult>(`/plugin/shop-ops/shipments/${encodeURIComponent(shipmentId)}/track`, { shopId });
  if (!('data' in r)) return { error: errText(r) };
  return { error: '', result: r.data };
}

// ---------- 店铺模式 / 平台后台 ----------
export async function updateShopModeApi(shopId: string, patch: { shopType?: ShopType; supplyMode?: SupplyMode }): Promise<string> {
  const r = await api.patch(`/plugin/shop-ops/shops/${encodeURIComponent(shopId)}`, patch);
  if (!('data' in r)) return errText(r);
  return '';
}

export async function openPlatformApi(shopId: string): Promise<{ error: string; plan?: JumpPlan }> {
  const r = await api.post<Outcome<unknown>>(`/plugin/shop-ops/shops/${encodeURIComponent(shopId)}/open`, {});
  const u = unpack<unknown>(r);
  if (u.error) return { error: u.error };
  if (!u.jump) return { error: '该店铺的平台后台已在本地完成，无需跳转' };
  return { error: '', plan: u.jump };
}

export async function markJumpDoneApi(shopId: string, note?: string): Promise<string> {
  const r = await api.post(`/plugin/shop-ops/shops/${encodeURIComponent(shopId)}/jump-done`, { note });
  if (!('data' in r)) return errText(r);
  return '';
}

// ---------- 展示辅助 ----------
export const SHOP_TYPE_META: Record<ShopType, { label: string; tag: 'info' | 'warning' | 'danger' }> = {
  demo: { label: '演示', tag: 'info' },
  test: { label: '测试', tag: 'warning' },
  production: { label: '生产', tag: 'danger' },
};
export const SUPPLY_META: Record<SupplyMode, { label: string; tag: 'success' | 'warning' }> = {
  stocked: { label: '有货源', tag: 'success' },
  dropship: { label: '无货源', tag: 'warning' },
};
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tag: 'info' | 'warning' | 'success' | 'danger' | 'primary' }> = {
  pending: { label: '待付款', tag: 'info' },
  paid: { label: '待发货', tag: 'warning' },
  sourcing: { label: '采购中', tag: 'primary' },
  shipped: { label: '已发货', tag: 'success' },
  completed: { label: '已完成', tag: 'success' },
  refunded: { label: '已退款', tag: 'danger' },
};
export const SHIPMENT_STATUS_META: Record<ShipmentStatus, { label: string; tag: 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: '待发出', tag: 'info' },
  shipped: { label: '已发出', tag: 'warning' },
  in_transit: { label: '运输中', tag: 'warning' },
  delivered: { label: '已签收', tag: 'success' },
  exception: { label: '异常', tag: 'danger' },
};
export const LISTING_STATUS_META: Record<ListingStatus, { label: string; tag: 'info' | 'success' | 'warning' }> = {
  draft: { label: '草稿', tag: 'info' },
  online: { label: '在售', tag: 'success' },
  offline: { label: '已下架', tag: 'warning' },
};

/** 金额展示（整数分 → 当地币种） */
export function money(cents: number, currency = 'CNY'): string {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency || 'CNY' }).format(amount);
  } catch {
    return `${currency || 'CNY'} ${amount.toFixed(2)}`;
  }
}

/** 毫秒时间戳 → YYYY-MM-DD HH:mm */
export function fmtTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 店铺业务数据的 SQL 读写层（2026-10-22 重构方案 §4）。
 *
 * ★ 单一真源：商品/订单/发货/库存流水全部落 SQLite。
 * ★ 金额一律整数分；日期一律毫秒时间戳。
 * ★ 库存变更在事务内：UPDATE ... WHERE stock >= ? 防超卖 + 同事务写流水。
 */
import type { YzSqliteDb } from '../services/sqlite-driver.js';
import type {
  Product, Order, Shipment, StockMove, OrderItem, ShopDashboard,
  Actor, ListingStatus, OrderStatus, ShipmentStatus, SupplyMode, ShopType,
} from './types.js';

let currentDb: YzSqliteDb | null = null;

/** 插件 activate 时注入 db 单例；测试用 __setDbForTest 注入替身 */
export function initShopStore(database: YzSqliteDb): void {
  currentDb = database;
}

export function __setDbForTest(d: YzSqliteDb | null): void {
  currentDb = d;
}

function requireDb(): YzSqliteDb {
  if (!currentDb) throw new Error('店铺业务表未初始化：请先 initShopStore(db)');
  return currentDb;
}

// ---------- 行 → 领域对象映射（JSON 列在此解析） ----------

function safeParse(v: unknown): unknown {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  try { return JSON.parse(v); } catch { return undefined; }
}

function mapProduct(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    sku: String(r.sku),
    title: String(r.title),
    imageUrl: r.image_url == null ? undefined : String(r.image_url),
    category: r.category == null ? undefined : String(r.category),
    supplyMode: String(r.supply_mode) as Product['supplyMode'],
    sourceRef: r.source_ref == null ? undefined : String(r.source_ref),
    costCents: Number(r.cost_cents) || 0,
    priceCents: Number(r.price_cents) || 0,
    currency: String(r.currency || 'CNY'),
    stock: Number(r.stock) || 0,
    safetyStock: Number(r.safety_stock) || 0,
    listingStatus: String(r.listing_status) as ListingStatus,
    attrs: (safeParse(r.attrs_json) ?? {}) as Record<string, unknown>,
    createdAt: Number(r.created_at) || 0,
    updatedAt: Number(r.updated_at) || 0,
  };
}
function mapOrder(r: Record<string, unknown>): Order {
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    orderNo: String(r.order_no),
    buyer: r.buyer == null ? undefined : String(r.buyer),
    amountCents: Number(r.amount_cents) || 0,
    currency: String(r.currency || 'CNY'),
    status: String(r.status) as OrderStatus,
    items: (safeParse(r.items_json) ?? []) as OrderItem[],
    address: (safeParse(r.address_json) ?? {}) as Record<string, unknown>,
    createdAt: Number(r.created_at) || 0,
    paidAt: r.paid_at == null ? undefined : Number(r.paid_at),
  };
}


function mapShipment(r: Record<string, unknown>): Shipment {
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    orderId: String(r.order_id),
    carrier: r.carrier == null ? undefined : String(r.carrier),
    trackingNo: r.tracking_no == null ? undefined : String(r.tracking_no),
    status: String(r.status) as ShipmentStatus,
    shippedAt: r.shipped_at == null ? undefined : Number(r.shipped_at),
    deliveredAt: r.delivered_at == null ? undefined : Number(r.delivered_at),
    note: r.note == null ? undefined : String(r.note),
    createdAt: Number(r.created_at) || 0,
  };
}

// ---------- 商品 CRUD ----------
export interface ProductInput {
  sku: string; title: string; imageUrl?: string; category?: string;
  supplyMode: SupplyMode; sourceRef?: string;
  costCents: number; priceCents: number; currency: string;
  stock: number; safetyStock: number; listingStatus: ListingStatus;
}

// ---------- 商品 CRUD ----------
export interface ProductInput {
  sku: string; title: string; imageUrl?: string; category?: string;
  supplyMode: SupplyMode; sourceRef?: string;
  costCents: number; priceCents: number; currency: string;
  stock: number; safetyStock: number; listingStatus: ListingStatus;
}

export function listProducts(shopId: string, opts: { status?: ListingStatus; search?: string; limit?: number; offset?: number } = {}): Product[] {
  const where: string[] = ['shop_id = ?']; const params: unknown[] = [shopId];
  if (opts.status) { where.push('listing_status = ?'); params.push(opts.status); }
  if (opts.search) { where.push('(sku LIKE ? OR title LIKE ?)'); params.push(`%${opts.search}%`, `%${opts.search}%`); }
  const sql = `SELECT * FROM shop_product WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
  params.push(opts.limit ?? 200, opts.offset ?? 0);
  return (requireDb().prepare(sql).all(...params) as Record<string, unknown>[]).map(mapProduct);
}

// ---------- 库存流水 ----------
export function listStockMoves(shopId: string, opts: { productId?: string; limit?: number; offset?: number } = {}): StockMove[] {
  const where: string[] = ['shop_id = ?']; const params: unknown[] = [shopId];
  if (opts.productId) { where.push('product_id = ?'); params.push(opts.productId); }
  const sql = `SELECT * FROM shop_stock_move WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(opts.limit ?? 100, opts.offset ?? 0);
  return (requireDb().prepare(sql).all(...params) as Record<string, unknown>[]).map(mapStockMove);
}

function mapStockMove(r: Record<string, unknown>): StockMove {
  return {
    id: String(r.id),
    shopId: String(r.shop_id),
    productId: String(r.product_id),
    kind: String(r.kind) as StockMove['kind'],
    qty: Number(r.qty) || 0,
    beforeQty: Number(r.before_qty) || 0,
    afterQty: Number(r.after_qty) || 0,
    reason: r.reason == null ? undefined : String(r.reason),
    actor: String(r.actor) as StockMove['actor'],
    createdAt: Number(r.created_at) || 0,
  };
}

// ---------- 看板聚合 ----------

// ---------- 看板聚合 ----------
export function dashboard(shopId: string, shopType: ShopType, supplyMode: SupplyMode): ShopDashboard {
  const d = requireDb();
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const ds = dayStart.getTime();
  const statusRows = d.prepare('SELECT status, COUNT(*) c FROM shop_order WHERE shop_id=? AND created_at>=? GROUP BY status').all(shopId, ds) as Record<string, unknown>[];
  const amountRows = d.prepare('SELECT COALESCE(SUM(amount_cents),0) s FROM shop_order WHERE shop_id=? AND created_at>=? AND status NOT IN (?,?)').get(shopId, ds, 'pending', 'refunded') as Record<string, unknown>;
  const orderStatusCounts: Record<string, number> = {};
  for (const r of statusRows) orderStatusCounts[String(r.status)] = Number(r.c);
  const todaySalesCents = Number(amountRows.s) || 0;
  const todayOrders = statusRows.reduce((n: number, r) => n + Number(r.c), 0);
  const pendingShip = (orderStatusCounts['paid'] ?? 0) + (orderStatusCounts['sourcing'] ?? 0);
  const recentRows = d.prepare('SELECT order_no, buyer, amount_cents, status, created_at FROM shop_order WHERE shop_id=? ORDER BY created_at DESC LIMIT 5').all(shopId) as Record<string, unknown>[];
  const recentOrders = recentRows.map((r) => ({ orderNo: String(r.order_no), buyer: r.buyer == null ? undefined : String(r.buyer), amountCents: Number(r.amount_cents) || 0, status: String(r.status) as OrderStatus, createdAt: Number(r.created_at) || 0 }));
  let lowStock: ShopDashboard['lowStock'] = [];
  if (supplyMode !== 'dropship') {
    const prodRows = d.prepare('SELECT sku, title, stock, safety_stock FROM shop_product WHERE shop_id=? AND stock>0 AND stock<=safety_stock').all(shopId) as Record<string, unknown>[];
    lowStock = prodRows.map((r) => ({ sku: String(r.sku), title: String(r.title), stock: Number(r.stock) || 0, safetyStock: Number(r.safety_stock) || 0, daysLeft: null }));
  }
  return { shopId, shopType, supplyMode, todaySalesCents, todayOrders, orderStatusCounts, pendingShip, lowStock, recentOrders };
}

export function getProduct(shopId: string, id: string): Product | undefined {
  const r = requireDb().prepare('SELECT * FROM shop_product WHERE shop_id = ? AND id = ?').get(shopId, id) as Record<string, unknown> | undefined;
  return r ? mapProduct(r) : undefined;
}


function spId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createProduct(shopId: string, input: ProductInput): Product {
  const id = spId('sp');
  const now = Date.now();
  requireDb().prepare('INSERT INTO shop_product (id, shop_id, sku, title, image_url, category, supply_mode, source_ref, cost_cents, price_cents, currency, stock, safety_stock, listing_status, attrs_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, shopId, input.sku, input.title, input.imageUrl ?? null, input.category ?? null, input.supplyMode, input.sourceRef ?? null,
      Math.round(input.costCents), Math.round(input.priceCents), input.currency || 'CNY', input.stock, input.safetyStock, input.listingStatus, '{}', now, now);
  return getProduct(shopId, id)!;
}

export function updateProduct(shopId: string, id: string, patch: Partial<ProductInput>): Product | undefined {
  const cur = getProduct(shopId, id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch };
  requireDb().prepare('UPDATE shop_product SET title=?, image_url=?, category=?, cost_cents=?, price_cents=?, currency=?, safety_stock=?, updated_at=? WHERE shop_id=? AND id=?')
    .run(next.title, next.imageUrl ?? null, next.category ?? null, next.costCents, next.priceCents, next.currency, next.safetyStock, Date.now(), shopId, id);
  return getProduct(shopId, id);
}

export function deleteProduct(shopId: string, id: string): boolean {
  const r = requireDb().prepare('DELETE FROM shop_product WHERE shop_id=? AND id=?').run(shopId, id);
  return r.changes > 0;
}

export function setListing(shopId: string, id: string, status: 'online' | 'offline'): Product | undefined {
  const cur = getProduct(shopId, id);
  if (!cur) return undefined;
  if (cur.listingStatus === status) return cur;
  requireDb().prepare('UPDATE shop_product SET listing_status=?, updated_at=? WHERE shop_id=? AND id=?')
    .run(status, Date.now(), shopId, id);
  return getProduct(shopId, id);
}

export interface PriceChange { beforeCents: number; afterCents: number; product: Product; }

export function setPrice(shopId: string, id: string, newCents: number): PriceChange | undefined {
  const cur = getProduct(shopId, id);
  if (!cur) return undefined;
  const before = cur.priceCents;
  requireDb().prepare('UPDATE shop_product SET price_cents=?, updated_at=? WHERE shop_id=? AND id=?')
    .run(Math.round(newCents), Date.now(), shopId, id);
  const after = getProduct(shopId, id);
  if (!after) return undefined;
  return { beforeCents: before, afterCents: after.priceCents, product: after };
}

export function changeStock(input: { shopId: string; productId: string; kind: 'in' | 'out' | 'adjust'; qty: number; reason?: string; actor: Actor }): { move: StockMove; product: Product } {
  const d = requireDb();
  const prod = getProduct(input.shopId, input.productId);
  if (!prod) throw new Error('商品不存在：' + input.productId);
  if (prod.supplyMode === 'dropship') throw new Error('无货源商品不持库存，请走采购流程');
  if (!Number.isInteger(input.qty) || input.qty === 0) throw new Error('qty 必须是非零整数');
  const sign = input.kind === 'in' ? 1 : -1;
  const delta = input.kind === 'adjust' ? input.qty : sign * Math.abs(input.qty);
  const before = prod.stock;
  const after = before + delta;
  if (after < 0) throw new Error('库存不足');
  d.prepare('UPDATE shop_product SET stock=?, updated_at=? WHERE shop_id=? AND id=?')
    .run(after, Date.now(), input.shopId, input.productId);
  const mvId = spId('mv');
  d.prepare('INSERT INTO shop_stock_move (id, shop_id, product_id, kind, qty, before_qty, after_qty, reason, actor, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(mvId, input.shopId, input.productId, input.kind, delta, before, after, input.reason ?? null, input.actor, Date.now());
  const move: StockMove = { id: mvId, shopId: input.shopId, productId: input.productId, kind: input.kind, qty: delta, beforeQty: before, afterQty: after, reason: input.reason, actor: input.actor, createdAt: Date.now() };
  return { move, product: { ...prod, stock: after } };
}

// ---------- 订单 ----------

export interface OrderInput {
  orderNo: string; buyer?: string; amountCents: number; currency: string;
  status: OrderStatus; items: OrderItem[]; address?: Record<string, unknown>;
  createdAt?: number; paidAt?: number;
}

export function listOrders(shopId: string, opts: { status?: OrderStatus; search?: string; limit?: number; offset?: number } = {}): Order[] {
  const where: string[] = ['shop_id = ?']; const params: unknown[] = [shopId];
  if (opts.status) { where.push('status = ?'); params.push(opts.status); }
  if (opts.search) { where.push('(order_no LIKE ? OR buyer LIKE ?)'); params.push(`%${opts.search}%`, `%${opts.search}%`); }
  const sql = `SELECT * FROM shop_order WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(opts.limit ?? 200, opts.offset ?? 0);
  return (requireDb().prepare(sql).all(...params) as Record<string, unknown>[]).map(mapOrder);
}

export function getOrder(shopId: string, id: string): Order | undefined {
  const r = requireDb().prepare('SELECT * FROM shop_order WHERE shop_id = ? AND id = ?').get(shopId, id) as Record<string, unknown> | undefined;
  return r ? mapOrder(r) : undefined;
}

export function createOrder(shopId: string, input: OrderInput): Order {
  const id = spId('so');
  const now = input.createdAt ?? Date.now();
  requireDb().prepare('INSERT INTO shop_order (id, shop_id, order_no, buyer, amount_cents, currency, status, items_json, address_json, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, shopId, input.orderNo, input.buyer ?? null, input.amountCents, input.currency || 'CNY', input.status, JSON.stringify(input.items), JSON.stringify(input.address ?? {}), now, input.paidAt ?? null);
  return getOrder(shopId, id)!;
}
export function markOrderSourced(shopId: string, id: string): Order | undefined {
  const cur = getOrder(shopId, id);
  if (!cur) return undefined;
  if (cur.status !== 'paid') return cur;
  requireDb().prepare('UPDATE shop_order SET status=? WHERE shop_id=? AND id=?').run('sourcing', shopId, id);
  return getOrder(shopId, id);
}

export function shipOrder(shopId: string, orderId: string, carrier: string, trackingNo: string, note?: string): { order: Order; shipment: Shipment } | undefined {
  const cur = getOrder(shopId, orderId);
  if (!cur) return undefined;
  const sid = spId('ss');
  const now = Date.now();
  requireDb().prepare('INSERT INTO shop_shipment (id, shop_id, order_id, carrier, tracking_no, status, shipped_at, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(sid, shopId, orderId, carrier, trackingNo, 'shipped', now, note ?? null, now);
  requireDb().prepare('UPDATE shop_order SET status=? WHERE shop_id=? AND id=?').run('shipped', shopId, orderId);
  return { order: getOrder(shopId, orderId)!, shipment: getShipment(shopId, sid)! };
}

export function getShipment(shopId: string, id: string): Shipment | undefined {
  const r = requireDb().prepare('SELECT * FROM shop_shipment WHERE shop_id = ? AND id = ?').get(shopId, id) as Record<string, unknown> | undefined;
  return r ? mapShipment(r) : undefined;
}

export function listShipments(shopId: string, opts: { status?: ShipmentStatus; limit?: number; offset?: number } = {}): Shipment[] {
  const where: string[] = ['shop_id = ?']; const params: unknown[] = [shopId];
  if (opts.status) { where.push('status = ?'); params.push(opts.status); }
  const sql = `SELECT * FROM shop_shipment WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(opts.limit ?? 200, opts.offset ?? 0);
  return (requireDb().prepare(sql).all(...params) as Record<string, unknown>[]).map(mapShipment);
}

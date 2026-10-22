/**
 * 店铺运营领域类型（2026-10-22 重构方案 §2/§4）。
 *
 * 三层概念（用户拍板，不可混）：
 * - 店铺类型 shopType：demo 演示 / test 测试 / production 生产 —— 店铺属性
 * - 货源模式 supplyMode：stocked 有货源 / dropship 无货源 —— 店铺属性
 * - 人工/AI 是工作台切换（前端 lead），不是店铺属性
 */
export type ShopType = 'demo' | 'test' | 'production';
export type SupplyMode = 'stocked' | 'dropship';
export type ListingStatus = 'draft' | 'online' | 'offline';
export type OrderStatus =
  | 'pending' | 'paid' | 'sourcing' | 'shipped' | 'completed' | 'refunded';
export type ShipmentStatus = 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'exception';
export type StockMoveKind = 'in' | 'out' | 'adjust';
export type Actor = 'human' | 'ai';

export type ActionKind =
  | 'product.list' | 'product.create' | 'product.update' | 'product.delete'
  | 'product.publish' | 'product.price' | 'product.stock'
  | 'order.list' | 'order.markSourced' | 'order.ship'
  | 'shipment.list' | 'shipment.track'
  | 'stock.moves' | 'shop.dashboard' | 'shop.open';

/** 跳转计划：平台无 API 时返回；前端内嵌 BrowserPanel 打开，automatable=true 时 pageAgent 可代跑非资金动作 */
export interface JumpPlan {
  kind: 'jump';
  url: string;
  title: string;
  steps: string[];
  automatable: boolean;
}
export type ActionOutcome =
  | { kind: 'done'; summary: string; data?: unknown }
  | { kind: 'jump'; plan: JumpPlan }
  | { kind: 'unsupported'; reason: string };

/** 后端视角的店铺上下文：连接对象 + 派生属性，进适配器与动作层 */
export interface ShopContext {
  id: string;
  platform: string;
  site?: string;
  shopName: string;
  shopType: ShopType;
  supplyMode: SupplyMode;
  /** 是否配置了 API 凭据（永不含密文本身） */
  hasSecret: boolean;
}

/** 订单明细行（items_json 的解析后形态，store 层负责 JSON.parse/stringify） */
export interface OrderItem {
  sku: string;
  title: string;
  qty: number;
  priceCents: number;
}

export interface Product {
  id: string;
  shopId: string;
  sku: string;
  title: string;
  imageUrl?: string;
  category?: string;
  supplyMode: SupplyMode;
  /** 无货源必填：1688 链接 / 供应商货号 */
  sourceRef?: string;
  costCents: number;
  priceCents: number;
  currency: string;
  /** 无货源恒 0，不参与口径 */
  stock: number;
  safetyStock: number;
  listingStatus: ListingStatus;
  attrs: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Order {
  id: string;
  shopId: string;
  orderNo: string;
  buyer?: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  items: OrderItem[];
  address: Record<string, unknown>;
  createdAt: number;
  paidAt?: number;
}

export interface Shipment {
  id: string;
  shopId: string;
  orderId: string;
  carrier?: string;
  trackingNo?: string;
  status: ShipmentStatus;
  shippedAt?: number;
  deliveredAt?: number;
  note?: string;
  createdAt: number;
}

export interface StockMove {
  id: string;
  shopId: string;
  productId: string;
  kind: StockMoveKind;
  qty: number;
  beforeQty: number;
  afterQty: number;
  reason?: string;
  actor: Actor;
  createdAt: number;
}

/** 看板聚合（shop.dashboard / GET /dashboard） */
export interface ShopDashboard {
  shopId: string;
  shopType: ShopType;
  supplyMode: SupplyMode;
  todaySalesCents: number;
  todayOrders: number;
  orderStatusCounts: Record<string, number>;
  pendingShip: number;
  /** 低库存商品（stock <= safetyStock），无货源店恒空 */
  lowStock: Array<{ sku: string; title: string; stock: number; safetyStock: number; daysLeft: number | null }>;
  recentOrders: Array<{ orderNo: string; buyer?: string; amountCents: number; status: OrderStatus; createdAt: number }>;
}

export interface ShopAdapter {
  readonly id: string;
  supports(action: ActionKind): boolean;
  run(shop: ShopContext, action: ActionKind, payload: Record<string, unknown>): Promise<ActionOutcome>;
}


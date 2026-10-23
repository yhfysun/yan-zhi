/**
 * 店铺动作执行层（2026-10-22 重构方案 §4）：适配器路由 + 统一执行 + 跳转计划。
 *
 * P0 判定：demo 店 → local（直接读写本地库）；test/production 库 → 本地业务动作直接执行，
 * 平台侧动作（shop.open）一律返回 JumpPlan（内嵌 BrowserPanel 打开）,P1 再接 API。
 */
import * as store from './store.js';
import type { ShopContext, ActionKind, ActionOutcome, JumpPlan, ListingStatus, OrderStatus, ShipmentStatus, PurchaseStatus } from './types.js';

/** 金额/数量入参归一：空值 → undefined；非数字 → undefined（由调用方给默认值） */
function toCents(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}
function toInt(v: unknown, min = 0): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.trunc(n)) : undefined;
}
function listingStatusOf(v: unknown): ListingStatus | undefined {
  return v === 'draft' || v === 'online' || v === 'offline' ? v : undefined;
}

/** 采购跳转地址：offerRef 是链接就直接用；纯数字视为 1688 offer id；其他按关键词搜 */
function purchaseUrl(offerRef: string): string {
  if (/^https?:\/\//i.test(offerRef)) return offerRef;
  if (/^\d{6,}$/.test(offerRef)) return `https://detail.1688.com/offer/${offerRef}.html`;
  return `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(offerRef)}`;
}

function purchaseJumpPlan(shopName: string, offerRef: string, sku: string, qty: number): JumpPlan {
  return {
    kind: 'jump',
    url: purchaseUrl(offerRef),
    title: `1688 采购 · ${sku}`,
    steps: [
      '确认登录了 1688 采购账号（登录由你自己完成）',
      `核对货源与规格：${sku}，采购数量 ${qty}`,
      '加入采购单并核对单价、运费与到货时效',
      '走到「提交订单」为止就停下 —— 付款必须由你人工完成',
      `付款完成后回来标记采购状态，并在 ${shopName} 订单上填供应商运单号`,
    ],
    // 付款是资金动作，必须人工；pageAgent 只能代跑加购/填单等非资金步骤
    automatable: false,
  };
}

export function resolveAdapter(shop: ShopContext, action: ActionKind): string {
  if (shop.shopType === 'demo') return 'local';
  if (action === 'shop.open') return 'jump';
  return 'local';
}

/** 平台注册表由插件 activate 时注入（避免 actions ↔ shop-ops 循环 import） */
let platformLookup: (platformId: string) => { url: string; label: string } = () => ({ url: '', label: '未知平台' });
export function setPlatformLookup(fn: (platformId: string) => { url: string; label: string }): void { platformLookup = fn; }

/** 平台后台 URL：跳转计划的落点（SHOP_PLATFORMS 的 entryUrl） */
function platformEntryOf(platformId: string): { url: string; label: string } {
  const { url, label } = platformLookup(platformId);
  return { url, label };
}

/** shop.open：返回平台后台跳转计划（演示店铺也返回，只是提示语不同） */
export function buildJumpPlan(shop: ShopContext): JumpPlan {
  const { url, label } = platformEntryOf(shop.platform);
  const isDemo = shop.shopType === 'demo';
  return {
    kind: 'jump',
    url,
    title: label + (isDemo ? '（演示店铺：不会真正触达平台）' : ''),
    steps: isDemo
      ? ['这是一家演示店铺', '跳转计划仅作演示，不会真正触达平台', '真实操作请切换到测试/生产店铺']
      : ['确认已登录平台商家后台', '按平台规则完成操作', '完成后回到控制台点「已处理」留审计'],
    automatable: !isDemo,
  };
}

/** 统一动作执行：resolveAdapter 后按类型分发；P0 全部走 local，shop.open 返回 JumpPlan */
export async function runShopAction(shop: ShopContext, action: ActionKind, payload: Record<string, unknown> = {}, actor: 'human' | 'ai' = 'human'): Promise<ActionOutcome> {
  const adapter = resolveAdapter(shop, action);
  if (adapter === 'jump') {
    return { kind: 'jump', plan: buildJumpPlan(shop) };
  }
  try {
    return runLocalAction(shop, action, payload, actor);
  } catch (e) {
    // 业务校验失败（SKU 重复 / 库存不足 / 状态不允许）走 unsupported，让界面与模型如实说明
    return { kind: 'unsupported', reason: (e as Error).message };
  }
}

function runLocalAction(shop: ShopContext, action: ActionKind, payload: Record<string, unknown>, actor: 'human' | 'ai'): ActionOutcome {
  switch (action) {
    case 'purchase.list': {
      const data = store.listPurchases(shop.id, {
        orderId: payload.orderId ? String(payload.orderId) : undefined,
        status: payload.status ? String(payload.status) as PurchaseStatus : undefined,
      });
      return { kind: 'done', summary: `共 ${data.length} 条采购单`, data };
    }
    case 'purchase.create': {
      const orderId = String(payload.orderId ?? '');
      const order = store.getOrder(shop.id, orderId);
      if (!order) return { kind: 'unsupported', reason: '订单不存在' };
      if (order.status !== 'paid' && order.status !== 'sourcing') {
        return { kind: 'unsupported', reason: `订单 ${order.orderNo} 当前状态为 ${order.status}，只有已付款/采购中订单可创建采购` };
      }
      const items: Array<Record<string, unknown>> = Array.isArray(payload.items) && payload.items.length
        ? payload.items as Array<Record<string, unknown>>
        : order.items.map((i) => ({ sku: i.sku, qty: i.qty }));
      // ★ 先整体校验，再落库：避免“前几条已创建、后面缺货源才报失败”的部分写入
      const prepared: Array<{ sku: string; qty: number; offerRef: string; productId?: string; unitCostCents: number; note?: string }> = [];
      for (const raw of items) {
        const sku = String(raw.sku ?? '').trim();
        if (!sku) continue;
        const qty = Math.max(1, toInt(raw.qty) ?? 1);
        const prod = store.findProductBySku(shop.id, sku);
        const offerRef = String(raw.offerRef ?? prod?.sourceRef ?? '').trim();
        if (!offerRef) {
          return { kind: 'unsupported', reason: `商品 ${sku} 缺少货源链接（sourceRef），请先在商品页补上 1688 链接/货号` };
        }
        prepared.push({
          sku, qty, offerRef, productId: prod?.id,
          unitCostCents: toCents(raw.unitCostCents) ?? prod?.costCents ?? 0,
          note: raw.note ? String(raw.note) : undefined,
        });
      }
      if (!prepared.length) return { kind: 'unsupported', reason: '没有可创建的采购明细（sku 为空或订单没有明细）' };
      const created: unknown[] = [];
      let reused = 0;
      for (const p of prepared) {
        const exist = store.findPurchaseByOrderSku(shop.id, orderId, p.sku);
        if (exist) { reused++; created.push(exist); continue; }
        created.push(store.createPurchase(shop.id, {
          orderId, productId: p.productId, sku: p.sku, offerRef: p.offerRef, qty: p.qty,
          unitCostCents: p.unitCostCents, note: p.note,
        }));
      }
      return { kind: 'done', summary: `已创建 ${created.length - reused} 条采购单${reused ? `（${reused} 条已存在，未重复创建）` : ''}（付款需人工完成）`, data: created };
    }
    case 'purchase.updateStatus': {
      const id = String(payload.purchaseId ?? '');
      const status = String(payload.status ?? '') as PurchaseStatus;
      if (!['planned', 'ordered', 'paid', 'received', 'cancelled'].includes(status)) {
        return { kind: 'unsupported', reason: 'status 只能是 planned/ordered/paid/received/cancelled' };
      }
      const p = store.updatePurchaseStatus(shop.id, id, status);
      if (!p) return { kind: 'unsupported', reason: '采购单不存在' };
      return { kind: 'done', summary: `采购单 ${p.sku} 状态已改为 ${status}`, data: p };
    }
    case 'purchase.jump': {
      const id = String(payload.purchaseId ?? '');
      const p = store.getPurchase(shop.id, id);
      if (!p) return { kind: 'unsupported', reason: '采购单不存在' };
      return { kind: 'jump', plan: purchaseJumpPlan(shop.shopName, p.offerRef, p.sku, p.qty) };
    }
    case 'stock.moves': {
      const data = store.listStockMoves(shop.id, {
        productId: payload.productId ? String(payload.productId) : undefined,
        limit: toInt(payload.limit, 1),
        offset: toInt(payload.offset, 0),
      });
      return { kind: 'done', summary: `共 ${data.length} 条库存流水`, data };
    }
    case 'shop.dashboard': {
      const data = store.dashboard(shop.id, shop.shopType, shop.supplyMode);
      return { kind: 'done', summary: '看板已聚合', data };
    }
    case 'product.list': {
      const data = store.listProducts(shop.id, {
        status: listingStatusOf(payload.status),
        search: payload.search ? String(payload.search) : undefined,
        limit: toInt(payload.limit, 1),
        offset: toInt(payload.offset, 0),
      });
      return { kind: 'done', summary: `共 ${data.length} 个商品`, data };
    }
    case 'product.create': {
      const p = payload;
      const sku = String(p.sku ?? '').trim();
      const title = String(p.title ?? '').trim();
      if (!sku || !title) return { kind: 'unsupported', reason: 'sku/title 必填' };
      const supplyMode = p.supplyMode === 'stocked' || p.supplyMode === 'dropship' ? p.supplyMode : shop.supplyMode;
      const isDrop = supplyMode === 'dropship';
      if (isDrop && !String(p.sourceRef ?? '').trim()) {
        return { kind: 'unsupported', reason: '无货源商品必须填 sourceRef（1688 链接 / 供应商货号）' };
      }
      const initialStock = isDrop ? 0 : (toInt(p.stock) ?? 0);
      const prod = store.createProduct(shop.id, {
        sku,
        title,
        imageUrl: p.imageUrl ? String(p.imageUrl) : undefined,
        category: p.category ? String(p.category) : undefined,
        supplyMode,
        sourceRef: p.sourceRef ? String(p.sourceRef) : undefined,
        costCents: toCents(p.costCents) ?? 0,
        priceCents: toCents(p.priceCents) ?? 0,
        currency: p.currency ? String(p.currency) : 'CNY',
        // ★ 初始库存走 changeStock 入库（写流水），这里先建 0，避免库存翻倍
        stock: 0,
        safetyStock: isDrop ? 0 : (toInt(p.safetyStock) ?? 0),
        listingStatus: listingStatusOf(p.listingStatus) ?? 'draft',
      });
      // 新建时有初始库存：补一条入库流水，库存页与看板才有来源可查
      if (initialStock > 0) {
        store.changeStock({ shopId: shop.id, productId: prod.id, kind: 'in', qty: initialStock, reason: '新建商品初始库存', actor });
      }
      return { kind: 'done', summary: `商品已创建：${prod.sku}`, data: store.getProduct(shop.id, prod.id) ?? prod };
    }
    case 'product.publish': {
      const p = payload;
      const online = p.listing != null ? String(p.listing) !== 'offline' : p.online !== false;
      const prod = store.setListing(shop.id, String(p.productId ?? ''), online ? 'online' : 'offline');
      if (!prod) return { kind: 'unsupported', reason: '商品不存在' };
      return { kind: 'done', summary: `${prod.sku} 已${online ? '上架' : '下架'}（本地库）`, data: prod };
    }
    case 'product.price': {
      const p = payload;
      const newCents = toCents(p.newPriceCents) ?? toCents(p.priceCents);
      if (newCents == null || newCents < 0) return { kind: 'unsupported', reason: 'newPriceCents 必填且不能为负' };
      const r = store.setPrice(shop.id, String(p.productId ?? ''), newCents);
      if (!r) return { kind: 'unsupported', reason: '商品不存在' };
      return { kind: 'done', summary: `价格已改：${r.beforeCents} → ${r.afterCents} 分`, data: r.product };
    }
    case 'product.stock': {
      const p = payload;
      const qty = Number(p.qty ?? 0);
      const kind = (p.kind === 'in' || p.kind === 'out' || p.kind === 'adjust') ? p.kind : 'adjust';
      const r = store.changeStock({ shopId: shop.id, productId: String(p.productId ?? ''), kind, qty, reason: p.reason ? String(p.reason) : undefined, actor });
      return { kind: 'done', summary: `库存已变动：${r.move.beforeQty} → ${r.move.afterQty}`, data: r.product };
    }
    case 'order.list': {
      const data = store.listOrders(shop.id, {
        status: payload.status ? String(payload.status) as OrderStatus : undefined,
        search: payload.search ? String(payload.search) : undefined,
        limit: toInt(payload.limit, 1),
        offset: toInt(payload.offset, 0),
      });
      return { kind: 'done', summary: `共 ${data.length} 条订单`, data };
    }
    case 'order.markSourced': {
      const p = payload;
      const o = store.markOrderSourced(shop.id, String(p.orderId ?? ''));
      if (!o) return { kind: 'unsupported', reason: '订单不存在' };
      if (o.status !== 'sourcing') return { kind: 'unsupported', reason: `订单 ${o.orderNo} 当前状态为 ${o.status}，只有已付款订单可标记采购` };
      return { kind: 'done', summary: `订单 ${o.orderNo} 已标记采购`, data: o };
    }
    case 'order.ship': {
      const p = payload;
      const carrier = String(p.carrier ?? '').trim();
      const trackingNo = String(p.trackingNo ?? '').trim();
      if (!carrier || !trackingNo) return { kind: 'unsupported', reason: 'carrier / trackingNo 必填' };
      const cur = store.getOrder(shop.id, String(p.orderId ?? ''));
      if (!cur) return { kind: 'unsupported', reason: '订单不存在' };
      if (cur.status !== 'paid' && cur.status !== 'sourcing') {
        return { kind: 'unsupported', reason: `订单 ${cur.orderNo} 当前状态为 ${cur.status}，只有待发货/采购中订单可发货` };
      }
      const r = store.shipOrder(shop.id, cur.id, carrier, trackingNo, p.note ? String(p.note) : undefined);
      if (!r) return { kind: 'unsupported', reason: '订单不存在' };
      return { kind: 'done', summary: `订单 ${r.order.orderNo} 已发货：${r.shipment.trackingNo ?? ''}`, data: r.shipment };
    }
    case 'order.mock': {
      // 演示/测试店铺专用：造一条订单来试发货闭环。生产店铺拒绝。
      if (shop.shopType === 'production') return { kind: 'unsupported', reason: '生产店铺不允许模拟订单' };
      const p = payload;
      const prod = p.productId
        ? store.getProduct(shop.id, String(p.productId))
        : store.listProducts(shop.id, {})[0];
      if (!prod) return { kind: 'unsupported', reason: '先在商品页建一个商品，再模拟订单' };
      const qty = Math.max(1, toInt(p.qty) ?? 1);
      const status = p.status === 'pending' ? 'pending' : 'paid';
      const order = store.createOrder(shop.id, {
        orderNo: 'MOCK-' + Date.now().toString(36).toUpperCase(),
        buyer: p.buyer ? String(p.buyer) : '模拟买家',
        amountCents: prod.priceCents * qty,
        currency: prod.currency,
        status,
        items: [{ sku: prod.sku, title: prod.title, qty, priceCents: prod.priceCents }],
        address: { name: '模拟收货人', city: '演示市' },
        paidAt: status === 'paid' ? Date.now() : undefined,
      });
      // ★ 模拟订单不动库存：它是为了试发货/状态流转，不是真实成交
      return { kind: 'done', summary: `已模拟订单 ${order.orderNo}（${status === 'paid' ? '待发货' : '待付款'}）`, data: order };
    }
    case 'shipment.list': {
      const data = store.listShipments(shop.id, {
        status: payload.status ? String(payload.status) as ShipmentStatus : undefined,
        limit: toInt(payload.limit, 1),
        offset: toInt(payload.offset, 0),
      });
      return { kind: 'done', summary: `共 ${data.length} 条发货单`, data };
    }
    case 'shipment.track': {
      return { kind: 'unsupported', reason: '轨迹查询走既有物流客户端（P0 由 shop_track_query 承担）' };
    }
    case 'product.update': {
      const p = payload;
      const cur = store.getProduct(shop.id, String(p.productId ?? ''));
      if (!cur) return { kind: 'unsupported', reason: '商品不存在' };
      const upd = store.updateProduct(shop.id, cur.id, {
        title: p.title != null ? String(p.title) : undefined,
        imageUrl: p.imageUrl != null ? String(p.imageUrl) : undefined,
        category: p.category != null ? String(p.category) : undefined,
        sourceRef: p.sourceRef != null ? String(p.sourceRef) : undefined,
        costCents: toCents(p.costCents),
        priceCents: toCents(p.priceCents),
        safetyStock: toInt(p.safetyStock),
      });
      return { kind: 'done', summary: `商品 ${cur.sku} 已更新`, data: upd };
    }
    case 'product.delete': {
      const p = payload;
      const ok = store.deleteProduct(shop.id, String(p.productId ?? ''));
      return ok ? { kind: 'done', summary: '商品已删除' } : { kind: 'unsupported', reason: '商品不存在' };
    }
    case 'shop.open': {
      return { kind: 'jump', plan: buildJumpPlan(shop) };
    }
    default:
      return { kind: 'unsupported', reason: 'P0 暂不支持：' + action };
  }
}

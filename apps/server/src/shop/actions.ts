/**
 * 店铺动作执行层（2026-10-22 重构方案 §4）：适配器路由 + 统一执行 + 跳转计划。
 *
 * P0 判定：demo 店 → local（直接读写本地库）；test/production 库 → 本地业务动作直接执行，
 * 平台侧动作（shop.open）一律返回 JumpPlan（内嵌 BrowserPanel 打开）,P1 再接 API。
 */
import * as store from './store.js';
import type { ShopContext, ActionKind, ActionOutcome, JumpPlan } from './types.js';

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
export async function runShopAction(shop: ShopContext, action: ActionKind, payload: Record<string, unknown>, actor: 'human' | 'ai' = 'human'): Promise<ActionOutcome> {
  const adapter = resolveAdapter(shop, action);
  if (adapter === 'jump') {
    return { kind: 'jump', plan: buildJumpPlan(shop) };
  }
  switch (action) {
    case 'stock.moves': {
      const data = store.listStockMoves(shop.id, {});
      return { kind: 'done', summary: `共 ${data.length} 条库存流水`, data };
    }
    case 'shop.dashboard': {
      const data = store.dashboard(shop.id, shop.shopType, shop.supplyMode);
      return { kind: 'done', summary: '看板已聚合', data };
    }
    case 'product.list': {
      const data = store.listProducts(shop.id, {});
      return { kind: 'done', summary: `共 ${data.length} 个商品`, data };
    }
    case 'product.create': {
      const p = payload as unknown as { sku?: string; title?: string };
      if (!p.sku || !p.title) return { kind: 'unsupported', reason: 'sku/title 必填' };
      const prod = store.createProduct(shop.id, { sku: String(p.sku), title: String(p.title), supplyMode: shop.supplyMode, costCents: 0, priceCents: 0, currency: 'CNY', stock: 0, safetyStock: 0, listingStatus: 'draft' });
      return { kind: 'done', summary: `商品已创建：${prod.sku}`, data: prod };
    }
    case 'product.publish': {
      const p = payload as unknown as { productId?: string; online?: boolean };
      const prod = store.setListing(shop.id, String(p.productId ?? ''), p.online === false ? 'offline' : 'online');
      if (!prod) return { kind: 'unsupported', reason: '商品不存在' };
      return { kind: 'done', summary: `${prod.sku} 已${p.online === false ? '下架' : '上架'}（本地库）`, data: prod };
    }
    case 'product.price': {
      const p = payload as unknown as { productId?: string; newPriceCents?: number };
      const r = store.setPrice(shop.id, String(p.productId ?? ''), Number(p.newPriceCents ?? 0));
      if (!r) return { kind: 'unsupported', reason: '商品不存在' };
      return { kind: 'done', summary: `价格已改：${r.beforeCents} → ${r.afterCents} 分`, data: r.product };
    }
    case 'product.stock': {
      const p = payload as unknown as { productId?: string; kind?: string; qty?: number };
      const qty = Number(p.qty ?? 0);
      const kind = (p.kind === 'in' || p.kind === 'out' || p.kind === 'adjust') ? p.kind : 'adjust';
      const r = store.changeStock({ shopId: shop.id, productId: String(p.productId ?? ''), kind, qty, actor });
      return { kind: 'done', summary: `库存已变动：${r.move.beforeQty} → ${r.move.afterQty}`, data: r.product };
    }
    case 'order.markSourced': {
      const p = payload as unknown as { orderId?: string };
      const o = store.markOrderSourced(shop.id, String(p.orderId ?? ''));
      if (!o) return { kind: 'unsupported', reason: '订单不存在或状态不允许' };
      return { kind: 'done', summary: `订单 ${o.orderNo} 已标记采购`, data: o };
    }
    case 'order.ship': {
      const p = payload as unknown as { orderId?: string; carrier?: string; trackingNo?: string };
      const r = store.shipOrder(shop.id, String(p.orderId ?? ''), String(p.carrier ?? ''), String(p.trackingNo ?? ''));
      if (!r) return { kind: 'unsupported', reason: '订单不存在' };
      return { kind: 'done', summary: `订单 ${r.order.orderNo} 已发货：${r.shipment.trackingNo ?? ''}`, data: r.shipment };
    }
    case 'shipment.track': {
      const p = payload as unknown as { shipmentId?: string };
      return { kind: 'unsupported', reason: '轨迹查询走既有物流客户端（P1 接入），P0 由 shop_track_query 承担' };
    }
    case 'product.update': {
      const p = payload as unknown as { productId?: string; title?: string; costCents?: number; priceCents?: number };
      const cur = store.getProduct(shop.id, String(p.productId ?? ''));
      if (!cur) return { kind: 'unsupported', reason: '商品不存在' };
      const upd = store.updateProduct(shop.id, cur.id, {
        title: p.title != null ? String(p.title) : undefined,
        costCents: p.costCents != null ? Math.round(Number(p.costCents)) : undefined,
        priceCents: p.priceCents != null ? Math.round(Number(p.priceCents)) : undefined,
      });
      return { kind: 'done', summary: `商品 ${cur.sku} 已更新`, data: upd };
    }
    case 'order.list': {
      const data = store.listOrders(shop.id, {});
      return { kind: 'done', summary: `共 ${data.length} 条订单`, data };
    }
    case 'shipment.list': {
      const data = store.listShipments(shop.id, {});
      return { kind: 'done', summary: `共 ${data.length} 条发货单`, data };
    }
    case 'shop.open': {
      return { kind: 'jump', plan: buildJumpPlan(shop) };
    }
    case 'product.delete': {
      const p = payload as unknown as { productId?: string };
      const ok = store.deleteProduct(shop.id, String(p.productId ?? ''));
      return ok ? { kind: 'done', summary: '商品已删除' } : { kind: 'unsupported', reason: '商品不存在' };
    }
    default:
      return { kind: 'unsupported', reason: 'P0 暂不支持：' + action };
  }
}

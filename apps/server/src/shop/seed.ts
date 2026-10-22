/**
 * 演示业务数据种子（2026-10-22 重构方案 §5）：按店铺模板生成商品/订单/发货/流水。
 * 幂等：按 shop_id 覆盖更新，不重复插入。全合成数据。
 */
import * as store from './store.js';
import type { SupplyMode } from './types.js';

interface SeedShop { shopName: string; supplyMode: SupplyMode; platform: string; currency: string; }

const SEED_SHOPS: SeedShop[] = [
  { shopName: '演示 · 亚马逊家居店', supplyMode: 'stocked', platform: 'amazon', currency: 'USD' },
  { shopName: '演示 · 天猫女装店', supplyMode: 'stocked', platform: 'taobao', currency: 'CNY' },
  { shopName: '演示 · 无货源百货店', supplyMode: 'dropship', platform: 'amazon', currency: 'USD' },
];

interface SeedProduct { sku: string; title: string; category: string; cost: number; price: number; stock: number; safety: number; sourceRef?: string; }
const PRODUCTS: SeedProduct[] = [
  { sku: 'SKU-001', title: '竹制收纳架 三层', category: '家居收纳', cost: 8.2, price: 29.99, stock: 41, safety: 30 },
  { sku: 'SKU-002', title: '硅胶厨具 6 件套', category: '厨房', cost: 6.5, price: 24.99, stock: 128, safety: 40 },
  { sku: 'SKU-003', title: '折叠沥水架', category: '厨房', cost: 5.1, price: 18.99, stock: 12, safety: 30 },
  { sku: 'SKU-004', title: 'LED 感应夜灯', category: '灯具', cost: 3.9, price: 15.99, stock: 302, safety: 50 },
  { sku: 'SKU-005', title: '儿童学习凳', category: '家具', cost: 9.8, price: 32.99, stock: 66, safety: 30 },
  { sku: 'SKU-006', title: '毛绒玩偶', category: '玩具', cost: 4.2, price: 12.99, stock: 50, safety: 20 },
];

/** 给一个店铺播种：商品 + 订单 + 发货 + 流水；幂等（按 shop_id 清后重建） */
export function seedShopBusinessData(shopId: string, shopName: string, supplyMode: SupplyMode, currency: string): void {
  const existing = store.listProducts(shopId, {});
  if (existing.length > 0) return; // 幂等：已有数据不重播
  for (const p of PRODUCTS) {
    const isDrop = supplyMode === 'dropship';
    const prod = store.createProduct(shopId, {
      sku: isDrop ? p.sku + '-D' : p.sku,
      title: p.title,
      category: p.category,
      supplyMode,
      sourceRef: isDrop ? 'https://detail.1688.com/offer/demo-synthetic.html' : undefined,
      costCents: Math.round(p.cost * 100),
      priceCents: Math.round(p.price * 100),
      currency,
      stock: isDrop ? 0 : p.stock,
      safetyStock: isDrop ? 0 : p.safety,
      listingStatus: 'online',
    });
    if (!isDrop && p.stock > 0) {
      store.changeStock({ shopId, productId: prod.id, kind: 'in', qty: p.stock, reason: '演示种子入库', actor: 'human' });
    }
  }
  // 订单：8 条不同状态
  const prods = store.listProducts(shopId, {});
  const statuses = ['pending', 'paid', 'sourcing', 'shipped', 'completed', 'refunded', 'paid', 'completed'] as const;
  for (let i = 0; i < 8; i++) {
    const p = prods[i % prods.length];
    const st = statuses[i];
    store.createOrder(shopId, {
      orderNo: '20261022-00' + String(i + 1),
      buyer: '演示买家' + String(i + 1),
      amountCents: p.priceCents,
      currency,
      status: st,
      items: [{ sku: p.sku, title: p.title, qty: 1, priceCents: p.priceCents }],
      address: { name: '演示收货人', city: '演示市' },
      paidAt: (st === 'pending') ? undefined : Date.now() - 86400000 * (i + 1),
    });
  }
  // 发货：给 shipped/completed 订单生成发货单
  const orders = store.listOrders(shopId, {});
  for (const o of orders) {
    if (o.status !== 'shipped' && o.status !== 'completed') continue;
    store.shipOrder(shopId, o.id, 'sf-express', 'SF' + String(Date.now()).slice(-9));
  }
}

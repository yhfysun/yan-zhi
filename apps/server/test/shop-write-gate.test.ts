// 店铺运营写操作闸门（P2 打样：申请改价）的守门测试。
//
// 这个闸门要防的是**"模型自己批准自己"**：
//   shop_price_update 在未确认时会返回变更单但**拒绝执行**；生产店铺还要额外人工批准。
//   2026-10-16 ops-shell 那边同类缺陷（生产写操作被模型自行放行）实修过，
//   本文件把"未确认 / 生产未批准一律不放行"钉死在此。
//
// ★ 依赖注入而非真密钥：`__setStorageForTest` 注入内存替身，工具不碰真实数据文件。
import { describe, it, expect, afterEach } from 'vitest';
import { validateManifest } from '@yan-zhi/core';
import {
  buildConnection,
  __runConnectionSyncForTest,
  makeShopTools,
  __setStorageForTest,
  shopOpsManifest,
  type PluginStorage,
} from '../src/plugins/shop-ops.js';

/** 内存插件存储替身（get/set 语义与 ctx.storage 一致） */
function memStorage(): { s: PluginStorage; map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  const s: PluginStorage = {
    async get<T>(key: string) { return map.get(key) as T | undefined; },
    async set(key: string, value: unknown) { map.set(key, value); },
  };
  return { s, map };
}

interface AuditEntry { action?: string; connection?: string; detail?: string; note?: string; ok?: boolean }

/** 建一条店铺连接并注入存储；返回底层 map 以便断言审计 */
async function withShop(tag?: string): Promise<Map<string, unknown>> {
  const { s, map } = memStorage();
  await s.set('connections', [{
    id: 'shop-1', platform: 'amazon', site: 'US', shopName: '测试店', tag, secretEnc: '', createdAt: 1,
  }]);
  __setStorageForTest(s);
  return map;
}

function textOf(r: unknown): string {
  const c = (r as { content?: Array<{ text?: string }> }).content;
  return c?.[0]?.text ?? '';
}

async function run(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = makeShopTools().find((t) => t.name === name);
  expect(tool, `★ 工具 ${name} 不存在`).toBeTruthy();
  return textOf(await tool!.execute(args as never));
}

const auditOf = (map: Map<string, unknown>): AuditEntry[] => (map.get('audit') as AuditEntry[]) || [];

afterEach(() => { __setStorageForTest(null); });

describe('写操作闸门 · 申请改价', () => {
  it('★★ 未确认（不带 confirmed）→ 只给变更单，**拒绝执行**，并留 denied 审计', async () => {
    const map = await withShop('测试');
    const text = await run('shop_price_update', {
      shopName: '测试店', sku: 'B0TEST', currentPrice: 19.9, newPrice: 17.9, reason: '清库存',
    });
    expect(text).toContain('改价变更单');
    expect(text).toContain('未执行');
    expect(text).toContain('confirmed: true');
    // 只给单子不给执行指引（"✓ 已批准"不应出现）
    expect(text).not.toContain('✓ 已批准');

    const audit = auditOf(map);
    expect(audit.at(-1)?.action).toBe('write.price_update.denied');
    expect(audit.at(-1)?.note).toBe('未确认');
  });

  it('★★ 生产店铺：即使 confirmed=true，缺 approveProduction 仍拒绝', async () => {
    const map = await withShop('生产');
    const text = await run('shop_price_update', {
      shopName: '测试店', sku: 'B0TEST', currentPrice: 19.9, newPrice: 17.9, reason: '清库存', confirmed: true,
    });
    expect(text).toContain('生产');
    expect(text).toContain('额外人工批准');
    expect(text).not.toContain('✓ 已批准');
    expect(auditOf(map).at(-1)?.note).toBe('生产店铺未额外批准');
  });

  it('★ 生产店铺：confirmed + approveProduction 都给了才放行', async () => {
    const map = await withShop('生产');
    const text = await run('shop_price_update', {
      shopName: '测试店', sku: 'B0TEST', currentPrice: 19.9, newPrice: 17.9,
      reason: '清库存', confirmed: true, approveProduction: true,
    });
    expect(text).toContain('✓ 已批准');
    expect(text).toContain('pageAgent');
    expect(text).toContain('回滚方式');
    expect(auditOf(map).at(-1)?.action).toBe('write.price_update.approved');
  });

  it('非生产店铺（测试标签 / 未标标签）：confirmed=true 即放行', async () => {
    for (const tag of ['测试', undefined]) {
      const map = await withShop(tag);
      const text = await run('shop_price_update', {
        shopName: '测试店', sku: 'B0TEST', currentPrice: 100, newPrice: 90, reason: '促销', confirmed: true,
      });
      expect(text).toContain('✓ 已批准');
      expect(auditOf(map).at(-1)?.action).toBe('write.price_update.approved');
    }
  });

  it('参数不合规时不产生"已批准"：店铺不存在 / 缺理由 / 价格非正', async () => {
    const map = await withShop('测试');
    expect(await run('shop_price_update', { shopName: '不存在的店', sku: 'A', currentPrice: 1, newPrice: 2, reason: 'x' }))
      .toContain('未找到店铺');
    expect(await run('shop_price_update', { shopName: '测试店', sku: 'A', currentPrice: 1, newPrice: 2, reason: '' }))
      .toContain('reason 必填');
    expect(await run('shop_price_update', { shopName: '测试店', sku: 'A', currentPrice: 1, newPrice: 0, reason: 'x' }))
      .toContain('必须是正数');
    expect(auditOf(map).some((e) => e.action === 'write.price_update.approved')).toBe(false);
  });
});

describe('写操作记录 · shop_write_log', () => {
  it('列出申请/被拒/已批准三类记录，且可按店铺过滤', async () => {
    await withShop('测试');
    await run('shop_price_update', { shopName: '测试店', sku: 'B0A', currentPrice: 10, newPrice: 9, reason: 'a' });
    await run('shop_price_update', { shopName: '测试店', sku: 'B0B', currentPrice: 10, newPrice: 9, reason: 'b', confirmed: true });

    const all = await run('shop_write_log', {});
    expect(all).toContain('write.price_update.denied');
    expect(all).toContain('write.price_update.approved');

    expect(await run('shop_write_log', { shopName: '没改过的店' })).toContain('还没有写操作记录');
  });
});

describe('写操作闸门 · 七个动作一起守门', () => {
  const WRITE_TOOLS = [
    'shop_price_update', 'shop_stock_update', 'shop_listing_publish', 'shop_listing_create',
    'shop_campaign_apply', 'shop_reply_send', 'shop_order_place',
  ];
  /** 每个写工具的最小合法入参（**故意不带 confirmed**） */
  const MIN_ARGS: Record<string, Record<string, unknown>> = {
    shop_price_update: { shopName: '测试店', sku: 'B0A', currentPrice: 10, newPrice: 9, reason: 'r' },
    shop_stock_update: { shopName: '测试店', sku: 'B0A', currentStock: 5, newStock: 3, reason: 'r' },
    shop_listing_publish: { shopName: '测试店', sku: 'B0A', listing: 'offline', reason: 'r' },
    shop_listing_create: { shopName: '测试店', sourceRef: 'https://detail.1688.com/x', title: '标题', price: 19.9, reason: 'r' },
    shop_campaign_apply: { shopName: '测试店', campaign: '双11 预热场', skus: 'B0A,B0B', dealPrice: 15, reason: 'r' },
    shop_reply_send: { shopName: '测试店', threadId: '买家A', replyText: '您好，物流我帮您查一下', reason: 'r' },
    shop_order_place: { shopName: '测试店', offerRef: 'https://detail.1688.com/y', qty: 100, unitPrice: 8.5, reason: 'r' },
  };

  it('★★★ 七个写动作在未确认时【全部】拒绝执行 —— 漏一个就等于"模型自己批准自己"', async () => {
    for (const name of WRITE_TOOLS) {
      const map = await withShop('测试');
      const text = await run(name, MIN_ARGS[name]);
      expect(text, `${name} 未确认却给了执行指引`).not.toContain('✓ 已批准');
      expect(text, `${name} 未说明未执行`).toContain('未执行');
      expect(text, `${name} 未提示如何放行`).toContain('confirmed: true');
      expect(auditOf(map).at(-1)?.action, `${name} 的审计动作名不对`).toBe(`write.${name.slice('shop_'.length)}.denied`);
      expect(auditOf(map).at(-1)?.note).toBe('未确认');
    }
  });

  it('★★ 七个写动作在生产店铺上：confirmed=true 仍全部被拒（缺 approveProduction）', async () => {
    for (const name of WRITE_TOOLS) {
      const map = await withShop('生产');
      const text = await run(name, { ...MIN_ARGS[name], confirmed: true });
      expect(text, `${name} 生产店铺未被拦住`).not.toContain('✓ 已批准');
      expect(text).toContain('额外人工批准');
      expect(auditOf(map).at(-1)?.note).toBe('生产店铺未额外批准');
    }
  });

  it('★ 七个写动作在非生产店铺上：加 approveProduction 后全部放行（至少不因闸门被拦）', async () => {
    for (const name of WRITE_TOOLS) {
      await withShop('测试');
      const text = await run(name, { ...MIN_ARGS[name], confirmed: true, approveProduction: true });
      expect(text, `${name} 已确认却仍被拦`).toContain('✓ 已批准');
    }
  });

  it('★★ 采购下单的硬边界：执行指引必须写明付款由人工完成', async () => {
    await withShop('测试');
    const text = await run('shop_order_place', { ...MIN_ARGS.shop_order_place, confirmed: true });
    expect(text).toContain('付款必须由用户人工完成');
    expect(text).toContain('提交订单');
  });

  it('★ 回消息必须原样带回文案，且涉及退款/承诺时要标注需人工处理', async () => {
    await withShop('测试');
    const plain = await run('shop_reply_send', { ...MIN_ARGS.shop_reply_send, confirmed: true });
    expect(plain).toContain('您好，物流我帮您查一下');

    await withShop('测试');
    const risky = await run('shop_reply_send', {
      shopName: '测试店', threadId: '买家B', replyText: '我给您安排退款', reason: 'r', confirmed: true,
    });
    expect(risky).toContain('需人工处理');
  });
});

describe('守门 · 声明与清单必须同步', () => {
  it('★★★ 清单必须能通过真实的 validateManifest —— 未知权限会让**整个插件系统初始化**失败', () => {
    // 2026-10-16 实测：P2 声明了 shop-write 却没登记进 packages/core 的 VALID_PERMS，
    // validateManifest 在 registerBuiltin 里抛错 → 中断整个插件初始化 →
    // **所有**插件（含无关的 ops-shell / sec-lab）后端路由全不挂载，前端全量 404。
    // 这条断言把"清单合法性"钉在测试里：加权限必须同时改 types.ts 与 manifest.ts。
    expect(() => validateManifest(shopOpsManifest)).not.toThrow();
  });

  it('★★ manifest 必须声明 shop-write 权限，且两个写相关工具都登记在 tools 清单里', () => {
    expect(shopOpsManifest.permissions).toContain('shop-write');
    expect(shopOpsManifest.contributes?.tools).toContain('shop_price_update');
    expect(shopOpsManifest.contributes?.tools).toContain('shop_write_log');
  });

  it('★ 实际注册的工具集合与 manifest 的 tools 清单一致（漏登记 = 模型看不到）', () => {
    const actual = makeShopTools().map((t) => t.name).sort();
    const declared = [...(shopOpsManifest.contributes?.tools ?? [])].sort();
    expect(actual).toEqual(declared);
  });
});

describe('连接编辑 · 三层语义不能丢', () => {
  const base = {
    id: 'shop-1', platform: 'amazon', site: 'US', shopName: '演示店', tag: '测试',
    shopType: 'demo', supplyMode: 'dropship', demo: true, secretEnc: 'enc', createdAt: 1,
  } as never;

  it('★★ 只改连接信息时，shopType / supplyMode / demo 原样保留', () => {
    const next = buildConnection({ platform: 'amazon', site: 'US', shopName: '演示店', secret: '' }, base);
    expect(next.shopType).toBe('demo');
    expect(next.supplyMode).toBe('dropship');
    expect(next.demo).toBe(true);
    expect(next.secretEnc).toBe('enc');
  });

  it('★ 显式传入新类型时才覆盖（供 PATCH /shops/:id 使用）', () => {
    const next = buildConnection({
      platform: 'amazon', site: 'US', shopName: '演示店', secret: '',
      shopType: 'test', supplyMode: 'stocked',
    }, base);
    expect(next.shopType).toBe('test');
    expect(next.supplyMode).toBe('stocked');
    expect(next.demo).toBe(true);
  });
});

describe('同步增强 · 审计汇总', () => {
  it('★ 无凭据时如实失败，并写 syncLog + sync.run 审计（不静默）', async () => {
    const map = await withShop('测试');
    const conn = {
      id: 'shop-1', platform: 'amazon', site: 'US', shopName: '测试店', tag: '测试',
      shopType: 'test', supplyMode: 'stocked', secretEnc: '', createdAt: 1,
    } as never;
    const entry = await __runConnectionSyncForTest(conn, 'manual');
    expect(entry.ok).toBe(false);
    expect(entry.note).toContain('未配置 API 凭据');

    const log = (map.get('syncLog') as Array<{ trigger: string; ok: boolean }>) || [];
    expect(log[0]).toMatchObject({ trigger: 'manual', ok: false });
    const audit = auditOf(map);
    expect(audit.some((e) => e.action === 'sync.run' && e.ok === false)).toBe(true);
  });
});

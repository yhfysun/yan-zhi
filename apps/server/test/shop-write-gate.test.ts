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

// manifest 新字段校验（mode-pluginization P0）：engine / ownedTables / ui.entry / contributes.mode。
//
// validateManifest 在 registerBuiltin/registerInstalled 里被调用，一抛就中断整个插件系统初始化
// （2026-10-16 shop-write 事故的教训），所以新字段的"非法即拒绝"必须逐条钉住。
import { describe, it, expect } from 'vitest';
import { validateManifest } from '@yan-zhi/core';

const base = { id: 'demo-plugin', name: '示例', version: '0.1.0' };

describe('validateManifest 新增字段', () => {
  it('合法新字段全部通过', () => {
    const m = validateManifest({
      ...base,
      engine: '^0.1',
      ownedTables: ['shop_product', 'shop_order'],
      ui: { entry: 'frontend/index.mjs' },
      contributes: {
        mode: { key: 'clip', label: '剪辑模式', route: '/clip', entry: 'frontend/index.mjs', chatPlacement: 'center' },
      },
    });
    expect(m.engine).toBe('^0.1');
  });

  it('旧形态 ui: string 仍然兼容', () => {
    expect(() => validateManifest({ ...base, ui: 'legacy.vue' })).not.toThrow();
  });

  it('engine 非法值拒绝', () => {
    for (const bad of ['abc', '', 'latest', 123, null]) {
      expect(() => validateManifest({ ...base, engine: bad as unknown as string }), `engine=${String(bad)}`).toThrow();
    }
    for (const ok of ['^0.1', '~0.1.1', '0.1', '0.1.0', '>=0.1']) {
      expect(() => validateManifest({ ...base, engine: ok })).not.toThrow();
    }
  });

  it('ownedTables 表名非法拒绝（防越权摸主库）', () => {
    expect(() => validateManifest({ ...base, ownedTables: ['Shop'] })).toThrow();
    expect(() => validateManifest({ ...base, ownedTables: ['1x'] })).toThrow();
    expect(() => validateManifest({ ...base, ownedTables: ['a;b'] })).toThrow();
    expect(() => validateManifest({ ...base, ownedTables: 'shop_product' as unknown as string[] })).toThrow();
    expect(() => validateManifest({ ...base, ownedTables: ['shop_product'] })).not.toThrow();
  });

  it('ui 对象形态非法值拒绝', () => {
    expect(() => validateManifest({ ...base, ui: 123 as unknown as object })).toThrow();
    expect(() => validateManifest({ ...base, ui: { entry: '' } })).toThrow();
    expect(() => validateManifest({ ...base, ui: { entry: 'frontend/index.mjs' } })).not.toThrow();
  });

  it('contributes.mode 非法值拒绝（key 会进会话列与路由表）', () => {
    expect(() => validateManifest({ ...base, contributes: { mode: { key: 'Clip', label: 'x', route: '/x' } } })).toThrow();
    expect(() => validateManifest({ ...base, contributes: { mode: { key: 'clip', label: 'x', route: 'clip' } } })).toThrow();
    expect(() => validateManifest({ ...base, contributes: { mode: { key: 'clip', label: 'x', route: '/clip', chatPlacement: 'weird' } } })).toThrow();
    expect(() => validateManifest({ ...base, contributes: { mode: { key: 'clip', label: 'x', route: '/clip' } } })).not.toThrow();
  });
});

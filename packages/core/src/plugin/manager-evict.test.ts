import { describe, expect, it, vi } from 'vitest';
import { PluginManager } from './manager';

function managerWithRows(rows: Array<{ id: string; state: string }>): { mgr: PluginManager; exec: ReturnType<typeof vi.fn> } {
  const exec = vi.fn(async () => undefined);
  const adapter = {
    db: {
      exec,
      query: vi.fn(async () => rows.map((r) => ({
        id: r.id,
        manifest: JSON.stringify({
          id: r.id,
          name: r.id,
          version: '1.0.0',
          permissions: [],
          contributes: { mode: { key: r.id.replace('-mode', ''), route: `/${r.id}` } },
        }),
        state: r.state,
        config: null,
        source: 'builtin',
        error: null,
      }))),
    },
  } as any;
  return { mgr: new PluginManager(adapter), exec };
}

describe('PluginManager.evictUnavailable', () => {
  it('把未包含在当前构建里的 enabled 插件移出运行时列表，但保留数据库状态', async () => {
    const { mgr, exec } = managerWithRows([
      { id: 'office-core', state: 'enabled' },
      { id: 'clip-mode', state: 'enabled' },
    ]);

    await mgr.init();
    expect(mgr.list().map((p) => p.manifest.id).sort()).toEqual(['clip-mode', 'office-core']);

    const removed = await mgr.evictUnavailable(['clip-mode']);
    expect(removed).toEqual(['clip-mode']);
    expect(mgr.list().map((p) => p.manifest.id)).toEqual(['office-core']);
    expect(mgr.get('clip-mode')).toBeUndefined();
    // 只做运行时内存隐藏；没有 DELETE / UPDATE plugin 表
    const stateWrites = exec.mock.calls.filter(([sql]) => /(?:DELETE\s+FROM|UPDATE)\s+plugin/i.test(String(sql)));
    expect(stateWrites).toEqual([]);
  });

  it('幂等：不存在的插件不报错、不重复返回', async () => {
    const { mgr } = managerWithRows([{ id: 'office-core', state: 'enabled' }]);
    await mgr.init();
    expect(await mgr.evictUnavailable(['clip-mode', 'clip-mode'])).toEqual([]);
    expect(mgr.list().map((p) => p.manifest.id)).toEqual(['office-core']);
  });
});

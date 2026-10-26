// 统一插件清单（build/plugins.catalog.json）契约测试（mode-pluginization P0）。
//
// 清单是"打包包含哪些插件"的唯一真相源，三条底线用测试钉死：
//   1. office-core 永在 —— 任何档位预设都必须包含它（办公模式 = 应用基座，永不被裁剪）；
//   2. 依赖关系合法 —— requires 必须指向存在的插件，且不允许环（否则打包自动勾选死循环）；
//   3. 清单与磁盘一致 —— 非 glob 的 frontendView 文件必须真实存在（搬家/改名忘改清单立刻红）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const catalogPath = fileURLToPath(new URL('../../../build/plugins.catalog.json', import.meta.url));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const plugins = catalog.plugins as Record<string, Record<string, unknown>>;
const uiSrcDir = fileURLToPath(new URL('../../../packages/ui/src/', import.meta.url));

describe('plugins.catalog.json 契约', () => {
  it('条目结构合法（kind/label/条目 id kebab-case）', () => {
    expect(Object.keys(plugins).length).toBeGreaterThan(5);
    for (const [id, entry] of Object.entries(plugins)) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(['mode', 'resource', 'feature'], `${id} kind`).toContain(entry.kind);
      expect(typeof entry.label, `${id} label`).toBe('string');
      if (entry.backendEntry) expect(entry.manifestExport, `${id} 需声明 manifestExport`).toBeTruthy();
    }
  });

  it('office-core 是唯一 core 且 modeKey=office', () => {
    const cores = Object.entries(plugins).filter(([, e]) => e.core === true);
    expect(cores.map(([id]) => id)).toEqual(['office-core']);
    expect(plugins['office-core'].modeKey).toBe('office');
  });

  it('每个档位预设都必须包含 office-core', () => {
    for (const [edition, list] of Object.entries(catalog.editionPresets as Record<string, string[]>)) {
      expect(list, `${edition} 预设必须含 office-core`).toContain('office-core');
      for (const id of list) expect(plugins[id], `${edition} 预设引用了不存在的插件 ${id}`).toBeTruthy();
    }
  });

  it('requires 指向存在的插件且无环', () => {
    for (const [id, entry] of Object.entries(plugins)) {
      for (const dep of (entry.requires as string[] | undefined) || []) {
        expect(plugins[dep], `${id} 依赖了不存在的插件 ${dep}`).toBeTruthy();
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`依赖环: ${[...visiting, id].join(' -> ')}`);
      visiting.add(id);
      for (const dep of (plugins[id]?.requires as string[] | undefined) || []) visit(dep);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of Object.keys(plugins)) visit(id);
  });

  it('modeKey 不重复（office 保留给 office-core）', () => {
    const seen = new Map<string, string>();
    for (const [id, entry] of Object.entries(plugins)) {
      const key = entry.modeKey as string | undefined;
      if (!key) continue;
      expect(seen.has(key), `modeKey ${key} 重复: ${seen.get(key)} vs ${id}`).toBe(false);
      seen.set(key, id);
    }
    expect(seen.get('office')).toBe('office-core');
  });

  it('非 glob 的 frontendView 文件真实存在（清单与磁盘同步）', () => {
    for (const [id, entry] of Object.entries(plugins)) {
      for (const view of (entry.frontendViews as string[] | undefined) || []) {
        if (view.includes('*')) continue;
        expect(existsSync(resolve(uiSrcDir, view)), `${id} 的视图不存在: ${view}`).toBe(true);
      }
    }
  });

  it('desktopOnly 插件与目录事实一致（ops/sec/shop/cicd/java/computer-use/remote-control）', () => {
    for (const id of ['ops-shell', 'sec-lab', 'shop-ops', 'cicd-pipeline', 'java-suite', 'computer-use', 'remote-control']) {
      expect(plugins[id].desktopOnly, `${id} 应为 desktopOnly`).toBe(true);
    }
  });
});

// ── P5：选择集 → 模式交集（edition.json.plugins 与 license 的联动契约）──
describe('插件选择集与模式清单联动（P5）', () => {
  const modesCatalog = JSON.parse(readFileSync(new URL('../../../build/modes.catalog.json', import.meta.url), 'utf8')) as {
    modes: Record<string, unknown>;
    editionPresets: Record<string, string[]>;
  };

  const pluginModeKeys = (ids: string[]) =>
    ids.map((id) => plugins[id]?.modeKey).filter((k): k is string => typeof k === 'string');

  it('插件 modeKey 与 modes.catalog 的键一一对应', () => {
    const fromPlugins = Object.values(plugins)
      .map((e) => e.modeKey)
      .filter((k): k is string => typeof k === 'string')
      .sort();
    expect(fromPlugins).toEqual(Object.keys(modesCatalog.modes).sort());
  });

  it('每档预设覆盖的模式 = modes.catalog 同档预设（两套清单不许漂移）', () => {
    for (const [edition, preset] of Object.entries(catalog.editionPresets as Record<string, string[]>)) {
      const derived = pluginModeKeys(preset).sort();
      const fromModes = [...(modesCatalog.editionPresets[edition] || [])].sort();
      expect(derived, `${edition} 档：插件预设与模式预设不一致`).toEqual(fromModes);
    }
  });
});

// ── P5：打包选择集的运行时消费（未选插件不注册）──
describe('build-selection（YZ_BUILD_PLUGINS_EXCLUDED）', () => {
  it('解析逗号/空格分隔，忽略空值与非法 id，去重', async () => {
    const { parsePluginIdList, excludedPluginIds } = await import('../src/plugins/build-selection.js');
    expect(parsePluginIdList('ops-shell, sec-lab  ops-shell,,BAD_ID,9bad')).toEqual(['ops-shell', 'sec-lab']);
    expect(parsePluginIdList('')).toEqual([]);
    expect(parsePluginIdList(undefined)).toEqual([]);
    expect([...excludedPluginIds('skins')]).toEqual(['skins']);
    expect(excludedPluginIds('').size).toBe(0);
  });
});

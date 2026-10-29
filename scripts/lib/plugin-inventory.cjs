/**
 * 打包清单汇总（--list-plugins 的真相来源合并）。
 *
 * 三个来源各有各的"存在意义"，缺一个都会让人误判：
 *   1) catalog（build/plugins.catalog.json）—— **意图**：哪些插件、什么类型、哪档预设带上；
 *   2) builtin（apps/server/plugins/builtin/*）—— **事实**：构建产物里真的有哪些插件包
 *      （多清单包如 skins 折叠成一行，--verbose 展开逐套）；
 *   3) optional（plugins/optional/*）—— **可后装**：默认不随包、点名才拷进 builtin 的插件。
 * 再单列宠物（--pets 维度）：它不是插件，资源随前端/VRM 走另一条链路。
 *
 * 只读，不修改任何东西；`--list-plugins` 与守门测试共用本模块，避免"打印一套、打包另一套"。
 */
const fsDefault = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** 读某目录下的插件清单：多清单包（skins）折叠成 {multi, count, items}。 */
function readBuiltinManifest(dir, fs) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    if (Array.isArray(raw.manifests)) {
      return {
        id: typeof raw.id === 'string' ? raw.id : path.basename(dir),
        multi: true,
        count: Number(raw.count) || raw.manifests.length,
        items: raw.manifests.map((m) => ({ id: m?.id || '', name: m?.name || m?.id || '', version: m?.version || '' })),
      };
    }
    return {
      id: typeof raw.id === 'string' ? raw.id : path.basename(dir),
      name: raw.name || raw.id || path.basename(dir),
      version: raw.version || '',
      multi: false,
    };
  } catch {
    return null;
  }
}

function scanBuiltin(repoRoot, fs) {
  const root = path.join(repoRoot, 'apps', 'server', 'plugins', 'builtin');
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return new Map();
  }
  const byId = new Map();
  for (const name of dirs) {
    const m = readBuiltinManifest(path.join(root, name), fs);
    if (m) byId.set(name, m);
  }
  return byId;
}

/**
 * 汇总全部可选项。
 * @returns {{
 *   plugins: Array<{id:string, kind:string, label:string, sources:string[], core:boolean,
 *                   presets:string[], modeKey?:string, requires?:string[], multi?:{count:number, items:object[]},
 *                   version?:string}>,
 *   pets: { packs: object[], vrms: object[] },
 *   presets: Record<string, string[]>,
 * }}
 */
function collectInventory({ repoRoot = REPO_ROOT, fs = fsDefault } = {}) {
  const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, 'build', 'plugins.catalog.json'), 'utf8'));
  const { loadOptionalPlugins } = require(path.join(repoRoot, 'scripts', 'lib', 'optional-plugins.cjs'));
  const { loadPetCatalog } = require(path.join(repoRoot, 'scripts', 'lib', 'pet-selection.cjs'));

  const presets = catalog.editionPresets || {};
  const presetsOf = (id) => Object.keys(presets).filter((e) => (presets[e] || []).includes(id));
  const builtin = scanBuiltin(repoRoot, fs);
  const optional = loadOptionalPlugins({ repoRoot, fs });

  const plugins = [];
  const seen = new Set();

  for (const [id, e] of Object.entries(catalog.plugins || {})) {
    seen.add(id);
    const b = builtin.get(id);
    plugins.push({
      id,
      kind: e.kind || '-',
      label: e.label || (b && b.name) || id,
      sources: ['catalog', ...(b ? ['builtin'] : [])],
      core: !!e.core,
      presets: presetsOf(id),
      modeKey: e.modeKey,
      requires: e.requires,
      version: b ? b.version : undefined,
      multi: b && b.multi ? { count: b.count, items: b.items } : undefined,
    });
  }

  // 构建产物里有、catalog 没登记的（多半是拷进来的可选插件旧副本）
  for (const [id, b] of builtin) {
    if (seen.has(id)) continue;
    seen.add(id);
    plugins.push({
      id,
      kind: 'builtin',
      label: b.name || (b.multi ? `多清单包（${b.count} 套）` : id),
      sources: ['builtin'],
      core: false,
      presets: presetsOf(id),
      version: b.version,
      multi: b.multi ? { count: b.count, items: b.items } : undefined,
    });
  }

  for (const o of optional) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    plugins.push({
      id: o.id,
      kind: 'optional',
      label: o.label,
      sources: ['optional', ...(builtin.has(o.id) ? ['builtin'] : [])],
      core: false,
      presets: [],
      version: o.version,
      desc: o.desc,
    });
  }

  const petCatalog = loadPetCatalog(fs);
  const petPacksDir = path.join(repoRoot, 'packages', 'ui', 'src', 'assets', 'pet-packs');
  const vrmDir = path.join(repoRoot, 'apps', 'web', 'public', 'vrm');
  const has = (dir, file) => {
    try {
      return fs.existsSync(path.join(dir, file));
    } catch {
      return false;
    }
  };
  const packs = (petCatalog.packs || []).map((p) => ({ ...p, kind: '2d', present: has(petPacksDir, p.file) }));
  const vrms = (petCatalog.vrms || []).map((v) => ({ ...v, kind: '3d', present: has(vrmDir, v.file) }));

  return { plugins, pets: { packs, vrms }, presets };
}

module.exports = { REPO_ROOT, collectInventory, scanBuiltin, readBuiltinManifest };

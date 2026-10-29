#!/usr/bin/env node
/**
 * 模式裁剪的纯逻辑层（可单测、无副作用）。
 *
 * 三件事：
 *   1) 读模式清单 build/modes.catalog.json；
 *   2) 把「本次选了哪些模式」渲染成前端生成文件（路由表 / 插件视图表 / 模式定义）；
 *   3) 算出未选模式的文件与标记串，供构建后泄漏断言使用。
 *
 * ★ 为什么生成真实源文件而不是 virtual module：
 *   本仓 vue-tsc / vitest 都会直接解析 packages/ui/src 下的模块，虚拟模块需要额外
 *   类型声明与测试侧解析配置，漏一处就是"打包能过、测试起不来"。生成文件对两端都透明。
 *   生成文件带 AUTO-GENERATED 头，打包脚本在 finally 里恢复成全量，避免污染工作区。
 */
const fsDefault = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_PATH = path.join(ROOT, 'build', 'modes.catalog.json');
const MANIFEST_PATH = path.join(ROOT, 'build', 'build-manifest.json');
const UI_SRC = path.join(ROOT, 'packages', 'ui', 'src');
const GENERATED_PATH = path.join(UI_SRC, 'generated', 'build-modes.ts');
const PLUGIN_VIEW_ROOTS = ['views/plugin', 'plugins'];

function readCatalog(fs = fsDefault, catalogPath = CATALOG_PATH) {
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || !raw.modes || typeof raw.modes !== 'object') {
    throw new Error(`模式清单缺少 modes 段: ${catalogPath}`);
  }
  for (const [key, def] of Object.entries(raw.modes)) {
    if (!def || typeof def.label !== 'string' || typeof def.route !== 'string') {
      throw new Error(`模式 ${key} 缺少 label/route`);
    }
    if (!Array.isArray(def.views)) throw new Error(`模式 ${key} 的 views 必须是数组`);
  }
  return raw;
}

function allModeKeys(catalog) {
  return Object.keys(catalog.modes);
}

/** 解析逗号/空格分隔的模式参数；空值返回 null（= 不指定）。 */
function parseModesArg(raw) {
  if (raw === undefined || raw === null) return null;
  const list = String(raw).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return list.length ? [...new Set(list)] : null;
}

/**
 * 解析本次构建的模式集合。
 *
 * 优先级：显式 modes > edition 预设 > 全量。
 * 空白/非法一律抛错 —— 静默回落会打出「名字是精简包、内容是全量」的包，
 * 这是分档体系里最贵的一类错（与 set-edition 的校验同口径）。
 */
function resolveModes({ catalog, modes, edition }) {
  const known = new Set(allModeKeys(catalog));
  let picked;
  if (Array.isArray(modes)) {
    // 显式传入空数组 = 用户把选择清空了 → 报错，不能悄悄回落成全量。
    if (!modes.length) throw new Error('模式集合为空：至少选一个模式');
    picked = modes;
  } else if (edition) {
    const preset = catalog.editionPresets && catalog.editionPresets[edition];
    if (!preset) throw new Error(`未知构建档: ${edition}（可选: ${Object.keys(catalog.editionPresets || {}).join(' / ')}）`);
    picked = preset;
  } else {
    picked = allModeKeys(catalog);
  }
  const unknown = picked.filter((m) => !known.has(m));
  if (unknown.length) {
    throw new Error(`未知模式: ${unknown.join(', ')}（可选: ${[...known].join(' / ')}）`);
  }
  if (!picked.length) throw new Error('模式集合为空：至少选一个模式');
  // 按清单顺序输出，保证产物 / 生成文件可复现
  return allModeKeys(catalog).filter((m) => picked.includes(m));
}

/** 目录通配：只支持精确路径与 `<prefix>/**`，够用且不会误伤。 */
function matchViewPattern(pattern, relPath) {
  if (!pattern) return false;
  const norm = relPath.replace(/\\/g, '/');
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3).replace(/\/+$/, '');
    return norm === prefix || norm.startsWith(prefix + '/');
  }
  return norm === pattern;
}

/** 该文件是否属于「未选中模式」的专属视图。 */
function isExcludedView(catalog, selected, relPath) {
  const selectedSet = new Set(selected);
  for (const [key, def] of Object.entries(catalog.modes)) {
    if (selectedSet.has(key)) continue;
    if ((def.views || []).some((p) => matchViewPattern(p, relPath))) return true;
  }
  return false;
}

/**
 * 扫描前端插件视图（相对 packages/ui/src）。
 *
 * ★ 2026-10-26 P4：除 views/plugin 与 plugins 外，选中模式的**工作台视图**也要进这张表 ——
 *   clip（以及后续 dev/wf）已改为「插件贡献路由」（manifest.contributes.routes），组件
 *   由 `resolvePluginComponent` 按 PLUGIN_VIEW_LOADERS 解析。以前它们只走 MODE_VIEW_LOADERS
 *   （静态路由表），插件化后静态路由表里没有它们，这张表漏了就是「插件已启用但页面空白」。
 *   未选模式的视图仍由 isExcludedView 过滤，裁剪语义不变。
 */
function collectPluginViewFiles(fs = fsDefault, uiSrc = UI_SRC, opts = {}) {
  const out = [];
  // ★ P5：未选插件的视图也要从这张表里剔掉 —— 否则它们的 lazy chunk 仍会进主包，
  //   后端插件目录却被 prune 移走了（"界面在、插件不在"），泄漏断言也失去意义。
  //   只过滤本次扫描出来的插件视图；选中模式的入口视图在下面单独并入（模式优先）。
  const excludedPluginViews = opts.excludedPluginViews || [];
  const excludedByPlugin = (rel) => excludedPluginViews.some((p) => matchViewPattern(p, rel));
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) walk(path.join(absDir, e.name), rel);
      else if (e.isFile() && e.name.endsWith('.vue') && !excludedByPlugin(rel)) out.push(rel);
    }
  };
  for (const root of PLUGIN_VIEW_ROOTS) walk(path.join(uiSrc, root), root);
  const { catalog, modes } = opts;
  if (catalog && Array.isArray(modes)) {
    for (const key of modes) {
      for (const rel of catalog.modes[key]?.views || []) {
        if (!rel.endsWith('.vue') || out.includes(rel)) continue;
        if (fs.existsSync(path.join(uiSrc, rel))) out.push(rel);
      }
    }
  }
  return out.sort();
}

function jsString(v) {
  return JSON.stringify(String(v));
}

/**
 * 渲染 `packages/ui/src/generated/build-modes.ts`。
 *
 * 只包含选中模式的动态 import —— 未选模式的 import 表达式**根本不存在**，
 * Rollup 因此不会为它们产出 chunk（这是物理裁剪的关键，不是运行时判断）。
 */
/** 基座外壳里"属于插件、但不在 contributes.routes 里"的视图。
 *
 * ★ 为什么单独一张表：App.vue 的 RemoteControlHost 与 router 的 /remote 页是**无条件静态 import**
 *   （被控端外壳/免授权控制页），既不是模式入口也不是 manifest 路由，`--plugins` 的视图表裁不到它们。
 *   未选 remote-control 的包会把它们整块打进主包 —— 名字说精简、内容却带着远控界面。
 *   这里改成选择集驱动的生成表：未选 → 整段 `null`，import 表达式在源码层就不存在（Rollup 不产出 chunk）。
 */
const SHELL_VIEWS = {
  'remote-control': {
    host: 'components/RemoteControlHost.vue',
    page: 'views/RemoteControl.vue',
  },
};

/** 按选择集渲染外壳视图表；pluginSelectionIds = null 表示全量（restore/未裁剪）。 */
function renderShellLoaders(pluginSelectionIds) {
  const selected = pluginSelectionIds === null ? null : new Set(pluginSelectionIds);
  const entries = Object.entries(SHELL_VIEWS)
    .filter(([id]) => selected === null || selected.has(id))
    .map(([id, views]) => {
      const loaders = Object.entries(views)
        .map(([slot, rel]) => `    ${slot}: () => import('../${rel}'),`)
        .join('\n');
      return `  ${jsString(id)}: {\n${loaders}\n  },`;
    });
  return `{\n${entries.join('\n')}\n}`;
}

function renderGenerated({ catalog, modes, pluginViews, pluginSelectionIds = null }) {
  const defs = modes.map((key) => {
    const d = catalog.modes[key];
    const parts = [
      `key: ${jsString(key)}`,
      `label: ${jsString(d.label)}`,
      `icon: ${jsString(d.icon || 'Grid')}`,
      `desc: ${jsString(d.desc || '')}`,
      `route: ${jsString(d.route)}`,
    ];
    if (d.pluginId) parts.push(`pluginId: ${jsString(d.pluginId)}`);
    if (d.desktopOnly) parts.push('desktopOnly: true');
    return `  { ${parts.join(', ')} },`;
  });

  const modeLoaderLines = modes
    .filter((key) => catalog.modes[key].entry)
    .map((key) => `  ${jsString(key)}: () => import('../${catalog.modes[key].entry}'),`);

  const pluginLoaderLines = pluginViews
    .filter((rel) => !isExcludedView(catalog, modes, rel))
    .map((rel) => `  ${jsString(rel)}: () => import('../${rel}'),`);

  return `/* AUTO-GENERATED by scripts/select-modes.cjs —— 不要手改。
 * 本次构建模式: ${modes.join(', ')}
 * 恢复全量: node scripts/select-modes.cjs --restore
 */
export const BUILD_MODES: string[] = ${JSON.stringify(modes)};

export const BUILD_MODE_DEFS = [
${defs.join('\n')}
] as const;

export const MODE_VIEW_LOADERS: Record<string, () => Promise<unknown>> = {
${modeLoaderLines.join('\n')}
};

export const PLUGIN_VIEW_LOADERS: Record<string, () => Promise<unknown>> = {
${pluginLoaderLines.join('\n')}
};

/** 插件归属的"外壳视图"（App.vue / router 直接用）；未选的插件在生成表里就没有这一段。 */
export const SHELL_VIEW_LOADERS: Record<string, Record<string, () => Promise<unknown>>> = ${renderShellLoaders(pluginSelectionIds)};
`;
}

function buildId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-`
    + `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 6);
  return `${stamp}-${rand}`;
}

function buildManifest({ catalog, modes, edition, now }) {
  return {
    buildId: buildId(now),
    createdAt: (now || new Date()).toISOString(),
    modes: modes.slice(),
    edition: edition || null,
    excludedModes: allModeKeys(catalog).filter((m) => !modes.includes(m)),
    excludedViews: allModeKeys(catalog)
      .filter((m) => !modes.includes(m))
      .flatMap((m) => catalog.modes[m].views || []),
    markers: allModeKeys(catalog)
      .filter((m) => !modes.includes(m))
      .flatMap((m) => catalog.modes[m].markers || []),
  };
}

function writeGenerated({ catalog, modes, excludedPluginViews = [], pluginSelectionIds = null, fs = fsDefault, uiSrc = UI_SRC, outPath = GENERATED_PATH }) {
  const pluginViews = collectPluginViewFiles(fs, uiSrc, { catalog, modes, excludedPluginViews });
  const content = renderGenerated({ catalog, modes, pluginViews, pluginSelectionIds });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  return { content, pluginViews };
}

function writeManifest(manifest, { fs = fsDefault, outPath = MANIFEST_PATH } = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function readManifest({ fs = fsDefault, manifestPath = MANIFEST_PATH } = {}) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

module.exports = {
  ROOT,
  CATALOG_PATH,
  MANIFEST_PATH,
  GENERATED_PATH,
  UI_SRC,
  readCatalog,
  allModeKeys,
  parseModesArg,
  resolveModes,
  matchViewPattern,
  isExcludedView,
  SHELL_VIEWS,
  renderShellLoaders,
  collectPluginViewFiles,
  renderGenerated,
  buildManifest,
  writeGenerated,
  writeManifest,
  readManifest,
  buildId,
};

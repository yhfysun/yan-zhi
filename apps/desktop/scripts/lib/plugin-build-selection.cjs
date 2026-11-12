/**
 * 打包链共用的「插件选择集」解析（P5）。
 *
 * 三层输入统一在这里收口，避免 package.cjs / build-all-editions.cjs / set-edition.cjs /
 * stage-plugins / verify-plugin-prune 各解析各的（那必然出现"构建 A、断言 B"）：
 *   1) 显式参数（--plugins / --modes）—— 最高优先，--plugins 胜 --modes；
 *   2) 环境变量（YZ_BUILD_PLUGINS / YZ_BUILD_MODES）—— 上游脚本下发；
 *   3) 档位预设（catalog.editionPresets[edition]）—— 多档构建传 editions 数组取并集。
 *
 * 规则本体在 scripts/lib/plugin-selection.cjs（office 锁定 / requires 闭包 / 非法报错）。
 * 可选插件（plugins/optional/*，可后装）在这里自动并入选择集：**点名才带**，
 * 不参加 all / 默认全量 / 档位预设（否则每个包都会莫名多出可后装插件）。
 */
const fsDefault = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'build', 'plugins.catalog.json');
const MODES_CATALOG_PATH = path.join(REPO_ROOT, 'build', 'modes.catalog.json');

const { resolvePluginSelection, parseList, OFFICE_ID, NONE_TOKEN } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'plugin-selection.cjs'));
const { loadOptionalPlugins } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'optional-plugins.cjs'));

function readJson(file, fs = fsDefault) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadCatalog(fs = fsDefault) {
  return readJson(CATALOG_PATH, fs);
}

function loadModesCatalog(fs = fsDefault) {
  return readJson(MODES_CATALOG_PATH, fs);
}

/** 环境变量里的选择集（空串/未设置 → null，交给下一层）。 */
function selectionFromEnv(env = process.env) {
  return {
    plugins: parseList(env.YZ_BUILD_PLUGINS),
    modes: parseList(env.YZ_BUILD_MODES),
  };
}

/**
 * 解析选择集。
 * @param {object} opts
 * @param {object} opts.catalog        plugins.catalog.json
 * @param {string|string[]|null} [opts.plugins]
 * @param {string|string[]|null} [opts.modes]
 * @param {string[]|null} [opts.editions]  多档 = 并集；单档 = [edition]
 * @param {Array|null} [opts.optional]    可选插件（默认读 plugins/optional/*）
 * @returns {{ids: string[], excluded: string[], source: string}}
 */
function resolveSelection({ catalog, plugins = null, modes = null, editions = null, optional = null }) {
  return resolvePluginSelection({
    catalog,
    plugins,
    modes,
    editions,
    optional: optional === null ? loadOptionalPlugins() : optional,
  });
}

/** 本次可选插件的 id（供 prune 全量 id 集合使用）。 */
function optionalPluginIds(optional = loadOptionalPlugins()) {
  return optional.map((p) => p.id);
}

/** catalog + 可选插件的全部 id（裁剪断言/暂存都要用完整集合，否则残留可选目录永远没人清）。 */
function allPluginIds(catalog, optional = loadOptionalPlugins()) {
  return [...Object.keys(catalog.plugins || {}), ...optionalPluginIds(optional)];
}

/** 选择集里各插件贡献的模式 key（按 modes.catalog.json 的顺序，保证产物可复现）。 */
function modeKeysForSelection(catalog, ids, modesCatalog = loadModesCatalog()) {
  const keys = new Set();
  for (const id of ids) {
    const modeKey = catalog.plugins?.[id]?.modeKey;
    if (modeKey) keys.add(modeKey);
  }
  return Object.keys(modesCatalog.modes || {}).filter((m) => keys.has(m));
}

/**
 * 构建期模式集合：显式 --modes 最高优先；否则取「插件贡献模式 ∪ 档位预设模式」。
 *
 * ★ 必须并上档位预设：即使未来出现暂时未插件化的历史模式，也不能只从插件推导，
 *   否则会静默打出“完整档却缺模式”的包。
 */
function resolveBuildModes({
  pluginsCatalog,
  pluginIds,
  editions,
  modesCatalog = loadModesCatalog(),
  explicitModes = null,
}) {
  const all = Object.keys(modesCatalog.modes || {});
  if (Array.isArray(explicitModes) && explicitModes.length) {
    const picked = new Set(explicitModes);
    return all.filter((m) => picked.has(m));
  }

  const picked = new Set(modeKeysForSelection(pluginsCatalog, pluginIds, modesCatalog));
  const presets = modesCatalog.editionPresets || {};
  for (const edition of editions || []) {
    for (const mode of presets[edition] || []) picked.add(mode);
  }
  return all.filter((m) => picked.has(m));
}

/** 三档预设里某几档的插件并集（按 catalog 顺序）。 */
function unionPresets(catalog, editions) {
  const presets = catalog.editionPresets || {};
  const picked = new Set();
  for (const e of editions) {
    const preset = presets[e];
    if (!preset) throw new Error(`未知构建档: ${e}（可选: ${Object.keys(presets).join(' / ')}）`);
    for (const id of preset) picked.add(id);
  }
  return Object.keys(catalog.plugins).filter((id) => picked.has(id));
}

module.exports = {
  REPO_ROOT,
  CATALOG_PATH,
  MODES_CATALOG_PATH,
  OFFICE_ID,
  NONE_TOKEN,
  loadCatalog,
  loadModesCatalog,
  loadOptionalPlugins,
  readJson,
  selectionFromEnv,
  resolveSelection,
  optionalPluginIds,
  allPluginIds,
  modeKeysForSelection,
  resolveBuildModes,
  unionPresets,
};

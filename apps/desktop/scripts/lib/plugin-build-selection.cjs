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
 */
const fsDefault = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'build', 'plugins.catalog.json');
const MODES_CATALOG_PATH = path.join(REPO_ROOT, 'build', 'modes.catalog.json');

const { resolvePluginSelection, parseList } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'plugin-selection.cjs'));

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
 * @returns {{ids: string[], excluded: string[], source: string}}
 */
function resolveSelection({ catalog, plugins = null, modes = null, editions = null }) {
  return resolvePluginSelection({ catalog, plugins, modes, editions });
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
  loadCatalog,
  loadModesCatalog,
  readJson,
  selectionFromEnv,
  resolveSelection,
  modeKeysForSelection,
  unionPresets,
};

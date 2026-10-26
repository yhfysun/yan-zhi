#!/usr/bin/env node
/**
 * 版本档落地脚本（打包前置步骤）。
 *
 * 把「这个包是什么档」写成 `apps/desktop/edition.json`，供两条链路读取：
 *   1. `main.cjs` 拉起后端时注入 env（YZ_EDITION / YZ_DEFAULT_EDITION）→ 后端据此
 *      算 allowedModes，前端只消费接口返回的 modes；
 *   2. `electron-builder` 读同一份文件决定产物名后缀。
 *
 * 为什么不直接把 env 写进 yml：electron-builder 的 `env` 段只影响构建进程，不影响
 * **运行时** Electron 主进程拉起的后端 —— 后者由 main.cjs 自己 spawn，必须显式传。
 *
 * 用法：
 *   node scripts/set-edition.cjs lite
 *   node scripts/set-edition.cjs basic
 *   node scripts/set-edition.cjs pro
 *   YZ_ARTIFACT_SUFFIX=-v2 node scripts/set-edition.cjs pro   # 自定义产物名后缀
 */
const fs = require('fs');
const path = require('path');
const { readCatalog, parseModesArg, resolveModes } = require('../../../scripts/lib/mode-build.cjs');
const { artifactSuffixFor } = require('./lib/pack-helpers.cjs');
const {
  loadCatalog: loadPluginCatalog,
  loadModesCatalog,
  resolveSelection,
  modeKeysForSelection,
} = require('./lib/plugin-build-selection.cjs');

const EDITIONS = ['lite', 'basic', 'pro'];

/** 各档默认携带的**预置授权码档位**。
 *
 *  ★ 注意与构建档不是同一个值：用户拍板「高级版全量包默认携带基础版授权码」，
 *    所以 pro 构建档带 basic 码 —— 开箱三模式，要用全量需换 pro 码。 */
const DEFAULT_EDITION = {
  lite: 'lite',
  basic: 'basic',
  pro: 'basic',
};

const LABEL = {
  lite: '阉割版',
  basic: '基础版',
  pro: '高级版',
};

const edition = process.argv[2];
if (!EDITIONS.includes(edition)) {
  console.error(`[set-edition] 用法: node scripts/set-edition.cjs <${EDITIONS.join('|')}>`);
  console.error(`[set-edition] 收到: ${edition === undefined ? '(空)' : edition}`);
  process.exit(1);
}

// ★ 构建内容插件（P5）：YZ_BUILD_PLUGINS（package --plugins / --modes 映射、build-all 逐档下发）
//   优先；否则三维解读 catalog.editionPresets[档位]。写进 edition.json 后两条链路消费：
//     · main.cjs → YZ_BUILD_PLUGINS / YZ_BUILD_PLUGINS_EXCLUDED 传给后端（未选插件不注册）；
//     · 打包脚本据此 prune 内置插件目录（未选不进包）。
const pluginCatalog = loadPluginCatalog();
const modesCatalog = loadModesCatalog();
let pluginSelection;
try {
  pluginSelection = process.env.YZ_BUILD_PLUGINS
    ? resolveSelection({ catalog: pluginCatalog, plugins: process.env.YZ_BUILD_PLUGINS })
    : resolveSelection({ catalog: pluginCatalog, editions: [edition] });
} catch (e) {
  console.error(`[set-edition] 插件选择集非法: ${e.message}`);
  process.exit(1);
}

// ★ 构建内容模式：与插件同源。
//   · 显式 YZ_BUILD_MODES（package --modes）优先，但只保留**选中插件贡献的模式**
//     （两者不一致时以插件为准：插件不在包里，模式就是空壳入口）；
//   · 否则由插件选择集推导（office-core→office、ops-shell→ops…）。
//   写进 edition.json 后，main.cjs 通过 YZ_BUILD_MODES 传给后端，
//   license.ts 用它算「物理编译进来的模式 ∩ 授权档」。
const modesCatalogForResolve = readCatalog();
const pluginModes = modeKeysForSelection(pluginCatalog, pluginSelection.ids, modesCatalog);
let buildModes;
const explicitModes = parseModesArg(process.env.YZ_BUILD_MODES);
if (explicitModes) {
  try {
    const requested = resolveModes({ catalog: modesCatalogForResolve, modes: explicitModes });
    buildModes = requested.filter((m) => pluginModes.includes(m));
    const dropped = requested.filter((m) => !pluginModes.includes(m));
    if (dropped.length) {
      console.warn(`[set-edition] 模式 ${dropped.join(', ')} 未被选中插件包含，已排除出本包`);
    }
  } catch (e) {
    console.error(`[set-edition] 模式参数非法: ${e.message}`);
    process.exit(1);
  }
} else {
  buildModes = pluginModes;
}
if (!buildModes.length) {
  console.error('[set-edition] 构建模式为空：选中插件里没有任何模式插件（至少要有 office-core）');
  process.exit(1);
}
// 自定义模式时后缀带模式短码，避免同一档位不同模式组合的安装包互相覆盖；
// YZ_ARTIFACT_SUFFIX（package.cjs --name 透传）优先级最高，原样作为后缀。
const customSuffix = artifactSuffixFor({
  edition,
  modes: process.env.YZ_BUILD_MODES || process.env.YZ_BUILD_PLUGINS ? buildModes : null,
  override: process.env.YZ_ARTIFACT_SUFFIX,
});

const outPath = path.join(__dirname, '..', 'edition.json');
const payload = {
  edition,
  /** 预置授权码档位（可被 YZ_DEFAULT_LICENSE 整码覆盖，见 apps/server/src/license.ts）。 */
  defaultEdition: DEFAULT_EDITION[edition],
  label: LABEL[edition],
  /** 本次构建物理包含的模式（决定包里有哪些代码）。 */
  modes: buildModes,
  /** 本次构建物理包含的插件（P5）；pluginsExcluded 供后端跳过注册（未装即不存在）。 */
  plugins: pluginSelection.ids,
  pluginsExcluded: pluginSelection.excluded,
  /** 产物名后缀，与 electron-builder.full.yml 的 artifactName 对应。 */
  artifactSuffix: customSuffix,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`[set-edition] 已写入 ${path.relative(process.cwd(), outPath)}`);
console.log(`[set-edition] 构建档: ${edition}（${LABEL[edition]}）→ 模式: ${buildModes.join(', ')}`);
console.log(
  `[set-edition] 插件: ${pluginSelection.ids.length} 个（${pluginSelection.source}）` +
    (pluginSelection.excluded.length ? `，排除 ${pluginSelection.excluded.join(', ')}` : ''),
);
console.log(`[set-edition] 预置码档: ${DEFAULT_EDITION[edition]}`);
console.log(`[set-edition] 产物后缀: ${customSuffix}`);
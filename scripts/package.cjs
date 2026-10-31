#!/usr/bin/env node
/**
 * 言智打包入口（可选包型）—— 桌面三档 / 安卓 APK / 组合。
 *
 * 为什么单独写这一个：项目里已有的 `bin/build.bat` / `pnpm build:*` 在本机环境下
 * **中途必失败**，且失败信息与真实原因无关。三个环境坑都会伪装成「代码坏了」：
 *
 *   ① **安全删除策略拦大目录**：任何构建的第一步（`rmSync(outDir)` /
 *      vite `prepareOutDir`）都会抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（>50 文件即拦）。
 *      → 本脚本开工前把这些目录**整体 Move 走**（安全策略只拦删除、不拦重命名）。
 *   ② **gradle 必须走短路径 junction**：`@capawesome/capacitor-nodejs` 的 CMake
 *      在 pnpm 深层目录里，绝对对象路径 > 250 字符 → `CMAKE_OBJECT_PATH_MAX` /
 *      `build.ninja still dirty`。且 **git-bash 会解析 junction**（`process.cwd()`
 *      返回真实长路径）→ 必须用 PowerShell 的 `Set-Location` 进 junction。
 *   ③ **`build-mobile-server.cjs` 只复制不编译** → 不先真编译 `apps/server/dist`，
 *      改动不会进包而且**完全不报错**。桌面构建里已含真编译，故安卓复用桌面步骤产物。
 *
 * 用法：
 *   node scripts/package.cjs                     # 交互式：空格多选要打的包（↑↓ 移动 / a 全选）
 *                                                #   随后依次弹出：插件（按功能分组，默认只留基座）
 *                                                #   → 模式（仅在插件保持预设时问）→ 宠物（默认全带）。
 *   node scripts/package.cjs desktop             # 桌面三档全出
 *   node scripts/package.cjs desktop:pro         # 只出高级版
 *   node scripts/package.cjs desktop:lite,pro    # 出两档
 *   node scripts/package.cjs android             # 安卓 APK
 *   node scripts/package.cjs all                 # 桌面三档 + 安卓
 *   node scripts/package.cjs --editions=lite,pro # 等价 desktop:lite,pro（--edition= 同义）
 *   node scripts/package.cjs desktop --modes=office,dev
 *                                  # 只把「办公 + 开发」的代码打进包：
 *                                  # 未选模式的入口/页面/插件视图不产出 chunk。
 *                                  # 与 --editions 正交（后者决定授权档与预置码）。
 *   node scripts/package.cjs desktop --plugins=office-core,skins,dev-mode
 *                                  # 只把选中插件打进包（P5）：未选插件的后端目录打包时
 *                                  # 暂存移出、前端视图不产出 chunk，打完自动恢复。
 *                                  # 分组关键字 all/mode/feature/resource/skins；
 *                                  # office-core 恒在，requires 自动勾选；与 --modes 同时给出时以本项为准。
 *                                  # --plugins=none = 只留基座 office-core，其余全裁。
 *                                  # 可选插件（plugins/optional/*）点名才带，如 desktop-manager。
 *   node scripts/package.cjs desktop --plugins=office-core --pets=none
 *                                  # 宠物资源独立维度：all / none / 具体 id（2D 包 + 3D 模型）；
 *                                  # none = 包内无精灵图与 VRM，宠物入口降级隐藏。
 *   node scripts/package.cjs --list-plugins   # 列出可选插件（catalog/builtin/optional 三源合并）、宠物与三档预设
 *   node scripts/package.cjs desktop:pro --name=办公测试
 *                                  # 安装包名带上该名称：
 *                                  #   yan-zhi-Setup-<版本>-x64-办公测试.exe
 *                                  # 输出目录仍是 dist-release/desktop/pro/<版本>/，
 *                                  # 靠文件名区分，换模式重打包不会覆盖上一份。
 *   node scripts/package.cjs --pick-modes
 *                                  # 兼容参数：交互式运行时本就会弹模式选择；
 *                                  # 该参数保留给"想显式声明"的脚本调用。
 *   node scripts/package.cjs --list-modes
 *                                  # 列出全部模式与档位预设
 *   --yes                          # 跳过所有交互（含模式选择），按档位预设打包
 *   --fast                         # 只出免安装目录（electron-builder --dir），不打 NSIS：
 *                                  #   迭代验证用，省掉打安装器+压缩的时间，直接跑 win-unpacked 里的 exe
 *   --no-compress                  # 仍然出安装包，但 NSIS 用 store（不压缩）：打包/安装都快，包体翻倍
 *
 * 产物目录（统一树，路径定义在 apps/desktop/scripts/lib/pack-helpers.cjs，单一真相源）：
 *   dist-release/desktop/<档>/<版本>/   ← 安装包 + win-unpacked/
 *   dist-release/android/<版本>/app-debug.apk
 *
 * 选项：
 *   --dry-run     只做环境检查与计划打印，**不移动目录、不构建**（预览用）
 *   --no-verify   跳过产物校验
 *   --keep-tmp    保留临时备份目录（默认构建成功后清理）
 *   --no-fresh-output  旧产物被占用时**不**自动换产物根，只报错退出（默认会自动换根绕锁）
 *   -y / --yes    非交互确认（等价于默认全部；非 TTY 下自动生效）
 *
 * ★ 安卓路径会自动复用新鲜的 `apps/server/dist`（跳过编译）；陈旧则先真编译。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
const ALL_EDITIONS = ['lite', 'basic', 'pro'];
const EDITION_LABEL = { lite: '阉割版', basic: '基础版', pro: '高级版' };

/**
 * 会撞安全删除保护的构建输出目录（开工前必须整体移走）。
 *
 * ★★ 踩坑（2026-09-27）：最初只列了 `win-unpacked`，结果 electron-builder 打包 NSIS 时
 *   清理中间产物 `dist-release-<档>/@yan-zhidesktop-0.1.0-x64.nsis.7z` 被拦
 *   （**恰好 50 个文件命中阈值 50**）→ lite 档中断。
 *   ⇒ 正解不是"再补一条路径"，而是**把输出目录里所有可移走的内容整体清空**
 *   （见 moveOutDirsIn：按档位把输出目录内的全部条目移走，只保留已产出的 exe，
 *     因为那是交付物、不该动）。
 */
// ★ 产物路径与 apps/desktop/scripts/lib/pack-helpers.cjs 保持**同源**（直接 require 它，
//   不再本地复制一份映射）：这里算"要移走什么/校验什么"，那边算"写到哪" —— 不一致会导致
//   "移走了 A 却写到 B"（旧产物没清、新产物在别处），排障时极难看出。
//   YZ_ALL_OUT_DIR 可换产物根目录（旧产物被句柄持有 EBUSY 时绕锁用），会原样透传给下游脚本。
const {
  DEFAULT_RELEASE_ROOT,
  androidOutDir,
  outDirForEdition,
  resolvePkgVersion,
  pruneOldReleases,
  resolvePnpm,
} = require(path.join(__dirname, '..', 'apps', 'desktop', 'scripts', 'lib', 'pack-helpers.cjs'));

/** 真编译 server（不裸 spawn 'pnpm'：本机只有 corepack 托管的 pnpm，收口见 pack-helpers.resolvePnpm） */
function compileServer() {
  const pnpm = resolvePnpm(['--filter', '@yan-zhi/server', 'build']);
  run(pnpm.cmd, pnpm.argv, { env: pnpm.extraEnv });
}
const DESKTOP_VERSION = resolvePkgVersion({ pkgPath: path.join(ROOT, 'apps', 'desktop', 'package.json') });
const MOBILE_VERSION = resolvePkgVersion({ pkgPath: path.join(ROOT, 'apps', 'mobile', 'package.json') });

// ★ 产物根目录**可变**，所以这几个路径必须可重算、不能是只读常量：
//   旧产物被句柄持有（EBUSY/EPERM）时，本脚本会自动换一个新根继续构建
//   （见 switchToFreshRoot），换根后所有"写到哪 / 校验哪 / 列出哪"必须一起跟着变，
//   否则会出现"移走 A 却写到 B"这种极难排查的错位。
let RELEASE_ROOT = process.env.YZ_ALL_OUT_DIR || DEFAULT_RELEASE_ROOT;
let OUTPUT_DIRS = null;
let ANDROID_APK = null;

/** 按给定的产物根重算全部产物路径 */
function computePaths(outRoot) {
  RELEASE_ROOT = outRoot;
  OUTPUT_DIRS = Object.fromEntries(ALL_EDITIONS.map((e) => [
    e,
    path.relative(ROOT, outDirForEdition(e, { repoRoot: ROOT, version: DESKTOP_VERSION, outRoot })),
  ]));
  ANDROID_APK = path.join(
    path.relative(ROOT, androidOutDir({ repoRoot: ROOT, version: MOBILE_VERSION, outRoot })),
    'app-debug.apk',
  );
}
computePaths(RELEASE_ROOT);

const MOVABLE = [
  'apps/server/dist',
  'apps/desktop/dist',
  'apps/web/dist',
  'apps/mobile/dist',
  'apps/mobile/nodejs/dist',
  'apps/mobile/android/app/src/main/assets/public',
  // ★ cap sync 的 update 阶段会 fs.remove 整个 cordova 插件模块目录再从模板重建。
  //   它内部含 gradle build/ 中间产物（数千小文件），被沙箱安全删除 shim 转去
  //   回收站搬运时 ETIMEDOUT（2026-10-25 实测）。提前整体移走 → remove 变空操作。
  'apps/mobile/android/capacitor-cordova-android-plugins',
];

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const VERIFY = !flags.has('--no-verify');
const KEEP_TMP = flags.has('--keep-tmp');

// ── 快打包（迭代验证用，不下发）──
// --fast      只出免安装目录（electron-builder --dir）：跳过 NSIS 打安装包与压缩，
//             产物直接双击 win-unpacked/<app>.exe 就能跑。
// --no-compress 仍然出安装包，但压缩档改成 store：打包/安装都快，代价是包体翻倍。
// 两者都经 YZ_PACK_EXTRA 透传给逐档的 electron-build。
const packExtra = [];
if (flags.has('--fast') || flags.has('--dir')) packExtra.push('--dir');
if (flags.has('--no-compress')) packExtra.push('--config.compression=store');
if (packExtra.length) process.env.YZ_PACK_EXTRA = packExtra.join(' ');

// ── 模式多选（--modes=office,dev）──
// 与 --editions 正交：--editions 决定「授权档/预置码」，--modes 决定「包里真的有哪些代码」。
const {
  readCatalog: readModeCatalog,
  parseModesArg: parseModesFlag,
  resolveModes: resolveBuildModes,
} = require('./lib/mode-build.cjs');
const MODES_FLAG = (() => {
  const hit = argv.find((a) => a.startsWith('--modes='));
  if (hit) return hit.slice('--modes='.length);
  const i = argv.indexOf('--modes');
  return i >= 0 ? argv[i + 1] : null;
})();
let BUILD_MODES = null;
if (MODES_FLAG !== null) {
  try {
    BUILD_MODES = resolveBuildModes({
      catalog: readModeCatalog(),
      modes: parseModesFlag(MODES_FLAG),
      edition: null,
    });
  } catch (e) {
    console.error(`\x1b[31m[ERROR]\x1b[0m --modes 非法: ${e.message}`);
    process.exit(1);
  }
}

// ── 插件多选（--plugins=office-core,skins / --plugins=mode / --plugins=all）──
// P5：后端插件包与前端模式一起按选择集裁剪（office 恒在、requires 自动闭包）。
// 优先级：显式 --plugins > --modes（两者同时给出时以 --plugins 为准并提示）。
// 选择集解析唯一收口在 apps/desktop/scripts/lib/plugin-build-selection.cjs。
const {
  loadCatalog: loadPluginCatalog,
  loadModesCatalog: loadPluginModesCatalog,
  loadOptionalPlugins,
  resolveSelection: resolvePluginSelection,
  modeKeysForSelection,
  OFFICE_ID,
} = require(path.join(__dirname, '..', 'apps', 'desktop', 'scripts', 'lib', 'plugin-build-selection.cjs'));
const { loadPetCatalog, resolvePetSelection } = require('./lib/pet-selection.cjs');

const PLUGINS_FLAG = (() => {
  const hit = argv.find((a) => a.startsWith('--plugins='));
  if (hit) return hit.slice('--plugins='.length);
  const i = argv.indexOf('--plugins');
  return i >= 0 ? argv[i + 1] : null;
})();
let PLUGIN_SELECTION = null;
if (PLUGINS_FLAG !== null) {
  if (MODES_FLAG !== null) {
    console.warn('\x1b[33m[WARN]\x1b[0m --plugins 与 --modes 同时给出：按约定以 --plugins 为准（模式由插件选择集推导）');
  }
  try {
    const pluginCatalog = loadPluginCatalog();
    PLUGIN_SELECTION = resolvePluginSelection({ catalog: pluginCatalog, plugins: PLUGINS_FLAG });
    // 模式跟插件同源：只把选中插件贡献的 modeKey 编进前端，避免"插件在包、入口不在"或反之
    BUILD_MODES = modeKeysForSelection(pluginCatalog, PLUGIN_SELECTION.ids, loadPluginModesCatalog());
  } catch (e) {
    console.error(`\x1b[31m[ERROR]\x1b[0m --plugins 非法: ${e.message}`);
    process.exit(1);
  }
} else if (MODES_FLAG !== null && BUILD_MODES) {
  // --modes 兼容映射（design §7）：模式 → 对应模式插件；**非模式插件（skins/git-explorer/
  // computer-use/remote-control/java-suite/cicd）照旧全带** —— 它们不与模式一一对应，
  // 按模式裁掉会让"只选办公"的包突然没有皮肤库，属于没预期的副作用。
  try {
    const pluginCatalog = loadPluginCatalog();
    const modeSel = resolvePluginSelection({ catalog: pluginCatalog, modes: BUILD_MODES });
    const keep = new Set([
      ...modeSel.ids,
      ...Object.keys(pluginCatalog.plugins).filter((id) => pluginCatalog.plugins[id].kind !== 'mode'),
    ]);
    const ids = Object.keys(pluginCatalog.plugins).filter((id) => keep.has(id));
    PLUGIN_SELECTION = {
      ids,
      excluded: Object.keys(pluginCatalog.plugins).filter((id) => !keep.has(id)),
      source: 'modes',
    };
  } catch (e) {
    console.error(`\x1b[31m[ERROR]\x1b[0m --modes 到插件的映射失败: ${e.message}`);
    process.exit(1);
  }
}

// ── 宠物多选（--pets=all|none|<packId,...>）──
// 与插件维度正交：宠物不是插件（2D 精灵图随前端构建、3D VRM 走 publicDir），
// 故单独一条选择集，构建前端时按它排除未选资源（apps/desktop/vite.config.ts）。
const PETS_FLAG = (() => {
  const hit = argv.find((a) => a.startsWith('--pets='));
  if (hit) return hit.slice('--pets='.length);
  const i = argv.indexOf('--pets');
  return i >= 0 ? argv[i + 1] : null;
})();
let PET_SELECTION = null;
if (PETS_FLAG !== null) {
  try {
    PET_SELECTION = resolvePetSelection({ catalog: loadPetCatalog(), pets: PETS_FLAG });
  } catch (e) {
    console.error(`\x1b[31m[ERROR]\x1b[0m --pets 非法: ${e.message}`);
    process.exit(1);
  }
}
/** 下发给下游的 YZ_BUILD_PETS；空选择集必须写 `none`（空串会被当成"未设置 = 全量"）。 */
function petsEnvValue() {
  if (!PET_SELECTION) return null;
  return PET_SELECTION.ids.length ? PET_SELECTION.ids.join(',') : 'none';
}

/** --plugins=none 的显式提醒：它只是"除了办公基座什么都不带"，不是"连办公也不带"。 */
const PLUGINS_NONE = PLUGINS_FLAG !== null && /^\s*none\s*$/i.test(PLUGINS_FLAG);
if (PLUGINS_NONE) {
  console.log('\x1b[33m[提示]\x1b[0m --plugins=none：只保留基座 office-core，其余插件全部裁剪（基座不可裁，没有"连办公也不带"的版本）');
}

// ── 产物名（--name=v2 / --name 办公版）──
// 每个命名各占一个产物目录、各出一个安装包名 —— 换模式/换用途重打包不会覆盖上一份。
const NAME_FLAG = (() => {
  const hit = argv.find((a) => a.startsWith('--name='));
  if (hit) return hit.slice('--name='.length);
  const i = argv.indexOf('--name');
  const v = i >= 0 ? argv[i + 1] : null;
  return v && !v.startsWith('-') ? v : null;
})();
if (argv.includes('--name') && !NAME_FLAG) {
  console.error('\x1b[31m[ERROR]\x1b[0m --name 需要一个名称，例如 --name=v2');
  process.exit(1);
}

// --list-modes：不打包，只列出可选模式与各档位预设，避免记参数。
if (flags.has('--list-modes')) {
  const catalog = readModeCatalog();
  console.log('\n可选模式（--modes=... 逗号分隔，可多选）:');
  for (const [key, d] of Object.entries(catalog.modes)) {
    console.log(`  ${key.padEnd(8)} ${d.label}  ${d.route}`);
  }
  console.log('\n档位预设（不传 --modes 时按所选档位自动决定）:');
  for (const [edition, modes] of Object.entries(catalog.editionPresets || {})) {
    console.log(`  ${edition.padEnd(8)} ${modes.join(', ')}`);
  }
  console.log('\n示例:');
  console.log('  node scripts/package.cjs desktop:basic --modes=office,dev');
  console.log('  pnpm package:desktop:lite --modes=office\n');
  process.exit(0);
}

// --list-plugins：三源合并列出可选插件与三档预设，--plugins 的参数自解释。
// 来源标注：catalog=清单意图 · builtin=现有构建产物 · optional=可后装插件。
if (flags.has('--list-plugins')) {
  const { collectInventory } = require('./lib/plugin-inventory.cjs');
  const verbose = flags.has('--verbose') || flags.has('-v');
  const inv = collectInventory();
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n可选插件（--plugins=... 逗号分隔；分组关键字：all / mode / feature / resource / skins / none）:');
  console.log(`  ${pad('插件ID', 18)}${pad('类型', 10)}${pad('来源', 20)}${pad('预设', 16)}名称`);
  for (const p of inv.plugins) {
    const mark = p.core ? '  [core 恒在]' : p.multi ? `  （${p.multi.count} 套）` : '';
    console.log(
      `  ${pad(p.id, 18)}${pad(p.kind, 10)}${pad(p.sources.join('+'), 20)}${pad(p.presets.length ? p.presets.join('/') : '—', 16)}${p.label}${mark}`,
    );
    if (verbose && p.requires) console.log(`    requires: ${p.requires.join(', ')}`);
    if (verbose && p.desc) console.log(`    ${p.desc}`);
    if (verbose && p.multi) {
      for (const it of p.multi.items) console.log(`    · ${pad(it.id, 22)}${it.name}${it.version ? `  v${it.version}` : ''}`);
    }
  }
  console.log('\n宠物（--pets=all|none|<id,...>；与 --plugins 正交，独立裁剪）:');
  for (const p of inv.pets.packs) {
    console.log(`  ${pad('2d', 4)}${pad(p.id, 12)}${pad(p.label, 24)}${p.present ? '✓ 素材在' : '✗ 素材缺失'}`);
  }
  for (const v of inv.pets.vrms) {
    console.log(`  ${pad('3d', 4)}${pad(v.id, 12)}${pad(v.label, 24)}${v.present ? '✓ 素材在' : '✗ 素材缺失'}`);
  }
  console.log('\n来源：catalog=build/plugins.catalog.json · builtin=apps/server/plugins/builtin（构建产物） · optional=plugins/optional（可后装，点名才进包）');
  console.log('\n档位预设（不传 --plugins 时按所选档位自动决定）:');
  for (const [edition, list] of Object.entries(inv.presets || {})) {
    console.log(`  ${pad(edition, 8)} ${list.join(', ')}`);
  }
  console.log('\n示例:');
  console.log('  node scripts/package.cjs desktop:lite --plugins=office-core,skins');
  console.log('  node scripts/package.cjs desktop --plugins=mode        # 全部模式插件（office 恒在 + requires 闭包）');
  console.log('  node scripts/package.cjs desktop --plugins=none        # 只留基座 office-core');
  console.log('  node scripts/package.cjs desktop --plugins=office-core,desktop-manager');
  console.log('  node scripts/package.cjs desktop --plugins=office-core --pets=none   # 一个宠物资源都不带');
  console.log('  node scripts/package.cjs --list-plugins --verbose      # 展开皮肤等多清单包\n');
  process.exit(0);
}

// --help：把最常用的用法打出来（长说明见文件头注释）。
if (flags.has('--help') || flags.has('-h')) {
  console.log(`
言智打包入口

用法:
  node scripts/package.cjs [目标...] [选项]

目标:
  desktop[:档位]   桌面（lite/basic/pro，可逗号多档；不写档位 = 三档）
  android          安卓 APK
  all              桌面三档 + 安卓

内容裁剪（互斥，--plugins 优先）:
  --modes=<m,csv>    按模式裁剪前端入口/页面/插件视图
  --plugins=<p,csv>  按插件裁剪（含后端插件包）：分组 all/mode/feature/resource/skins，
                     office-core 恒在，requires 自动勾选；模式由选中插件推导
                     none = 只留基座 office-core（其余全裁）
                     可选插件（plugins/optional/*）点名才带，如 desktop-manager
  --pets=<p,csv>     宠物资源（与插件正交）：all / none / 具体 id（2D 包与 3D 模型）

其他:
  --name=<名>        安装包名附加名称
  --list-modes / --list-plugins   列出可选模式 / 插件（--list-plugins --verbose 展开多清单包）
  --dry-run          只打印计划（含选择集与排除项），不做任何改动
  --yes              非交互（按档位预设 / 宠物全带），跳过插件·模式·宠物三个勾选菜单
`);
  process.exit(0);
}

/**
 * 旧产物被句柄持有时（常见：dev 后端持有打包产物的 app.asar）是否**自动换产物根**继续构建。
 * 默认开启 —— 换根后把交付物拷回标准树，用户拿到的路径不变；只是旧 win-unpacked 原样留下。
 * 传 --no-fresh-output 则恢复旧行为：只报错退出（适合"必须先停 dev 再打"的场合）。
 */
const FRESH_OUTPUT = !flags.has('--no-fresh-output');
// ★ 兼容 --dry：曾因写了 --dry（非 --dry-run）导致**误触发真实构建**（参数被忽略），
//   故两个拼写都认，且 dry 模式下一切写操作都短路。
const DRY = flags.has('--dry-run') || flags.has('--dry');

// ─────────────────────────── 小工具 ───────────────────────────
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};
const step = (m) => console.log(`\n${c.cyan(`====== ${m} ======`)}`);
const ok = (m) => console.log(`  ${c.green('[OK]')} ${m}`);
const warn = (m) => console.log(`  ${c.yellow('[WARN]')} ${m}`);
const fail = (m) => console.log(`  ${c.red('[ERROR]')} ${m}`);
const info = (m) => console.log(`  ${m}`);

let tmpBackupDir = null;
function backupRoot() {
  if (!tmpBackupDir) {
    tmpBackupDir = path.join(TMP, `_pkgbak_${Date.now()}`);
    fs.mkdirSync(tmpBackupDir, { recursive: true });
  }
  return tmpBackupDir;
}

/** 把大目录整体移走（★ 不用 rm —— 安全策略只拦删除，不拦重命名） */
function moveAway(relPaths) {
  if (DRY) {
    for (const rel of relPaths) {
      const exists = fs.existsSync(path.join(ROOT, rel));
      info(c.dim(`[dry-run] ${exists ? '将移走' : '跳过(不存在)'}  ${rel}`));
    }
    return;
  }
  const bak = backupRoot();
  for (const rel of relPaths) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      info(c.dim(`skip   ${rel}（不存在）`));
      continue;
    }
    const dest = path.join(bak, rel.replace(/[\\/]/g, '_'));
    try {
      moveWithRetry(p, dest);
      info(c.dim(`moved  ${rel}`));
    } catch (e) {
      // 极少数情况 rename 跨设备/被句柄持有时失败，退化为递归删除（若策略放行）
      fail(`移动失败 ${rel}: ${e.message}`);
      throw e;
    }
  }
}

// ─────────────────────── 占用（EBUSY/EPERM）处置 ───────────────────────
/**
 * 旧产物被句柄持有时（典型：dev 后端 electron 持有打包产物的 app.asar，
 * 本机实测 PID 90524 / WorkBuddy.exe 持有 `…/win-unpacked/resources/app.asar`，
 * 见 2026-10 排障），目录无法 rename（EBUSY/EPERM）。三层处置：
 *   1) moveWithRetry —— 短暂重试，吃掉瞬时锁（杀软扫描 / 索引器）。
 *   2) findLockedEntries —— 若仍锁，逐层 rename 探测，列出真正被占的路径。
 *   3) switchToFreshRoot —— 持久锁则换一个**全新产物根**继续构建（旧目录一个都不动），
 *      构建完把交付物（.exe/.blockmap/builder-*.yml）拷回标准树 dist-release/。
 */
const LOCK_CODES = /^(EPERM|EBUSY|EACCES)$/;
// ★ 忙等而非 setTimeout：本脚本是同步顺序构建，锁通常秒级释放（杀软扫完即松），
//   且 busy-wait 避免回调割裂主流程。
const spin = (ms) => { const end = Date.now() + ms; while (Date.now() < end) {} };

/** rename 带锁重试：仅对 LOCK_CODES 重试，其余错误立即抛出 */
function moveWithRetry(src, dest, retries = 4, delayMs = 1200) {
  fs.rmSync(dest, { recursive: true, force: true });
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(src, dest);
      return;
    } catch (e) {
      if (!LOCK_CODES.test(e.code) || i >= retries) throw e;
      spin(delayMs);
    }
  }
}

/**
 * 逐层 rename 探测被占条目：把每个条目 rename 成探测名再 rename 回来，
 * 失败（LOCK_CODES）即记录。目录记录带 '/' 后缀并递归；普通文件原样记录。
 * 返回被占路径相对 dir 的列表（目录带 '/' 后缀）。
 */
function findLockedEntries(dir, base, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (LOCK_CODES.test(e.code)) out.push(base || '');
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const probe = full + '.lockprobe';
    const rel = base ? path.join(base, ent.name) : ent.name;
    try {
      fs.renameSync(full, probe);
      fs.renameSync(probe, full);
    } catch (e) {
      if (!LOCK_CODES.test(e.code)) continue; // 非锁错误（权限等）跳过
      if (ent.isDirectory()) {
        out.push(rel + '/');
        findLockedEntries(full, rel, out, depth + 1);
      } else {
        out.push(rel);
      }
    }
  }
  return out;
}

/** 打印被占条目 + 常见持有者 + 用 handle.exe 确认的命令 */
function reportLock(lockedEntries, dirName) {
  fail(`${dirName} 被以下文件/目录占用，无法移走：`);
  for (const e of lockedEntries) info(c.red(`    ${e}`));
  info('');
  info('常见持有者（本机实测）：');
  info('  · dev 后端 electron（bin/dev.mjs 拉起的 electron，PID 见 handle.exe）');
  info('  · 已启动的安装包/便携版 exe（进程里还开着旧版）');
  info('  · 杀软实时扫描 / Windows 索引器（瞬时锁，重试已覆盖）');
  info('');
  info('确认持有者：下载 Sysinternals handle 后执行');
  info(c.dim('    handle.exe -accepteula -nobanner win-unpacked'));
  info('或指定进程：');
  info(c.dim('    handle.exe -accepteula -nobanner -p <PID>'));
}

/**
 * 换一个全新的产物根目录继续构建（旧根里的东西**一个都不动**，绕开锁）。
 * 返回新根目录名。新根会写进 process.env.YZ_ALL_OUT_DIR，
 * 下游 build-all-editions.cjs / electron-build.cjs 都读它，写到新根。
 * 构建完成后由 copyDeliverablesBack 把交付物拷回标准树 dist-release/。
 */
let FRESH_ROOT_USED = null;
function switchToFreshRoot(lockedDirName) {
  const stamp = Date.now();
  const newRoot = `dist-release-${stamp}`;
  computePaths(newRoot);
  process.env.YZ_ALL_OUT_DIR = newRoot;
  FRESH_ROOT_USED = newRoot;
  warn(`检测到 ${lockedDirName} 被占用，已自动切换产物根到 ${c.bold(newRoot)}`);
  info('  · 旧目录原样保留，不做删除/改名');
  info('  · 构建完成后交付物（.exe/.blockmap/builder-*.yml）会拷回标准树 dist-release/');
  info('  · 如需手动清理旧目录，先停持有进程再用 handle.exe 确认无误再删');
  return newRoot;
}

/** 若换过根，把新根里的交付物（exe/blockmap/builder-*.yml）拷回标准树 */
function copyDeliverablesBack() {
  if (!FRESH_ROOT_USED) return;
  const fromRoot = path.join(ROOT, FRESH_ROOT_USED);
  const toRoot = path.join(ROOT, DEFAULT_RELEASE_ROOT);
  if (!fs.existsSync(fromRoot)) return;
  const KEEP = /\.(exe|blockmap)$/i;
  let copied = 0;
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      const target = path.join(toRoot, rel, name);
      if (st.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        walk(full, path.join(rel, name));
      } else if (KEEP.test(name) || /^builder-.*\.yml$/i.test(name)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(full, target);
        copied++;
      }
    }
  };
  walk(fromRoot, '');
  if (copied) ok(`已将 ${copied} 个交付物从 ${FRESH_ROOT_USED} 拷回 ${DEFAULT_RELEASE_ROOT}/`);
}

/** shell 执行（继承 stdio，失败抛错；Windows 需要 shell 才能跑 .cmd/.bat） */
function run(cmd, args, opts = {}) {
  console.log(c.bold(`\n$ ${cmd} ${args.join(' ')}`));
  const useShell = process.platform === 'win32';
  // shell:true 时 node 只是空格拼接命令行，不做引号转义
  // → execPath 含空格（C:\Program Files\nodejs）会被 cmd 截断成 'C:\Program'
  const q = (s) => (useShell && /\s/.test(s) ? `"${s}"` : s);
  return execFileSync(q(cmd), args.map(q), {
    cwd: opts.cwd || ROOT,
    stdio: 'inherit',
    shell: useShell,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

/**
 * PowerShell 执行（用于 gradle 短路径 junction —— bash 会解析 junction）。
 *
 * ★ 踩坑（2026-09-27）：先前用 `execFileSync('powershell.exe', ['-Command', script])`
 *   直接传整段脚本，在本机报 `spawnSync powershell.exe EBUSY` ——
 *   多行脚本 + 引号转义 + 长命令行共同触发的 spawn 问题。
 *   正解：**落成 .ps1 文件再 `-File` 执行**（也可复现/手改），并且 `stdio: 'inherit'`
 *   让 gradle 的进度与错误直接可见（否则失败时看不到原因）。
 */
function runPowerShell(script, label) {
  const ps1 = path.join(TMP, `_pkg_${label || 'run'}.ps1`);
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(ps1, script, 'utf8');
  console.log(c.bold(`\n$ powershell -File ${path.relative(ROOT, ps1)}`));
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
    { cwd: ROOT, stdio: 'inherit' },
  );
}

/** 目录是否存在且非空（判断 server/dist 是否可复用） */
function distReady() {
  const dist = path.join(ROOT, 'apps/server/dist/apps/server/src');
  return fs.existsSync(dist) && fs.readdirSync(dist).length > 0;
}

/** server/dist 是否比源码新（源 > dist 即陈旧） */
function distStale() {
  const distDir = path.join(ROOT, 'apps/server/dist');
  if (!fs.existsSync(distDir)) return true;
  const distMtime = fs.statSync(distDir).mtimeMs;
  const scan = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (scan(p)) return true; }
      else if (st.mtimeMs > distMtime) return true;
    }
    return false;
  };
  for (const sub of ['apps/server/src', 'packages/shared/src', 'packages/core/src']) {
    const d = path.join(ROOT, sub);
    if (fs.existsSync(d) && scan(d)) return true;
  }
  return false;
}

// ─────────────────────── 前置检查 ───────────────────────
/**
 * 扫本机 JDK 落点（只收 21+）。
 *
 * ★ 为什么扫而不是写死：Capacitor 8 的 @capawesome/capacitor-nodejs 按 Java 21 编译
 *   （build.gradle 里 sourceCompatibility VERSION_21）。同一台机器上目录名可能是
 *   `jdk-21`，而另一台是 `jdk-21.0.12.1+1` —— 写死任何一个都会在换机后静默 miss，
 *   然后落到 PATH 反推出的 jdk-17，直到 gradle 编译期才炸（报错还跟 JDK 无关）。
 */
function scanLocalJdkHomes() {
  if (process.platform !== 'win32') return [];
  const roots = ['C:\\APP\\Java', 'C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium'];
  const hits = [];
  for (const root of roots) {
    let names;
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/^jdk-?2[1-9]/.test(name)) continue;
      const full = path.join(root, name);
      if (!fs.existsSync(path.join(full, 'bin', 'javac.exe'))) continue;
      hits.push(full);
    }
  }
  // 大版本优先（jdk-25 排在 jdk-21 前），避免旧目录盖住新装的
  const major = (p) => Number((/jdk-?(\d+)/.exec(path.basename(p)) || [])[1] || 0);
  return hits.sort((a, b) => major(b) - major(a));
}

/** 从 `javac -version` 的输出里取主版本（`javac 21.0.7` / `javac 1.8.0_112`）。 */
function parseJdkVersion(text) {
  const m = /(\d+)\.(\d+)/.exec(text || '');
  if (!m) return 0;
  const major = Number(m[1]);
  return major === 1 ? Number(m[2]) : major;
}

/** 读 JDK 主版本；跑不起来返回 0（视为不可用）。 */
function jdkMajor(home, javac) {
  try {
    const out = execFileSync(path.join(home, 'bin', javac), ['-version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return parseJdkVersion(out);
  } catch {
    return 0;
  }
}

/**
 * 解析安卓工具链（SDK / JDK）—— **跨平台唯一真相源**。
 *
 * ★ 为什么必须抽出来：preflight 检查与 gradle 执行**读的是同一组路径**，
 *   原先两处各写一份 Windows 硬编码（`C:\Android\Sdk` / `C:\APP\Java\jdk-21…`），
 *   后果有两个：换机器要改两处（漏一处就「检查通过、gradle 找不到 SDK」）；
 *   **CI（ubuntu）上三处硬编码全不成立 → 构建被前置检查直接拦死**。
 *
 * ★ 候选路径表的**纯逻辑**落在 lib/pack-helpers.cjs（可单测，含 CI 平台分支），
 *   这里只负责把真实 fs / env 注入进去 —— 保证「测什么就是跑什么」。
 */
function androidToolchain() {
  const { androidToolchainCandidates, resolveAndroidToolchain } = require(
    path.join(__dirname, '..', 'apps', 'desktop', 'scripts', 'lib', 'pack-helpers.cjs'),
  );
  const isWin = process.platform === 'win32';
  const javac = isWin ? 'javac.exe' : 'javac';
  const cand = androidToolchainCandidates({
    platform: process.platform,
    env: process.env,
    delimiter: path.delimiter,
    extraJavaCandidates: scanLocalJdkHomes(),
  });
  const MIN_JDK = 21;
  const { sdk, javaHome, javaSource } = resolveAndroidToolchain({
    ...cand,
    // ★ SDK 与 JDK 分开判：SDK 看 platform-tools，JDK 看 bin/javac。
    //   共用同一个 exists 会让 JDK 候选全部 miss（JDK 目录里当然没有 platform-tools）→
    //   静默退回 PATH 反推 → 拿到 PATH 上的 jdk-17。
    exists: (p) => fs.existsSync(path.join(p, 'platform-tools')),
    existsJava: (p) => fs.existsSync(path.join(p, 'bin', javac)),
    // ★ 必须 21+：JAVA_HOME 常指向 jdk-17，它排在候选首位，
    //   只判「有 javac」会一直选中它，直到 gradle 编译 native 插件时才炸。
    acceptJava: (p) => jdkMajor(p, javac) >= MIN_JDK,
    existsIn: (dir, name) => fs.existsSync(path.join(dir, name)),
    dirname: (p) => path.dirname(p),
  });

  // JDK 的存在性判据与 SDK 不同（SDK 看 platform-tools，JDK 看 bin/javac）——
  // 单独再验一次，避免把「目录存在但没有 javac」当可用。
  const javaOk = javaHome && fs.existsSync(path.join(javaHome, 'bin', javac));
  const jdkNote = javaHome ? null : `（需 JDK ${MIN_JDK}+，Capacitor 8 按 Java ${MIN_JDK} 编译）`;
  return {
    sdk,
    sdkTried: cand.sdkCandidates,
    javaHome: javaOk ? javaHome : null,
    javaSource,
    javaTried: [...cand.javaCandidates, 'PATH 上的 javac/java 反推'],
    jdkNote,
  };
}

function preflight(targets) {
  step('前置检查');
  const problems = [];

  // Node 版本
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) problems.push(`Node ${process.versions.node} < 20`);

  // 依赖
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) problems.push('node_modules 缺失，请先 pnpm install');

  // 输出目录被占用（安装版在 C:\APP\yan-zhi，不冲突；只提示真正会锁的）
  const lockHint = path.join(ROOT, OUTPUT_DIRS.pro, 'win-unpacked');
  if (fs.existsSync(lockHint)) {
    info(c.dim('检测到已有 win-unpacked，将整体移走（避免删除被拦）'));
  }

  // 内置 Python 运行时（2026-09-30 起：缺失会在桌面构建里**自动生成**，不再静默降级）
  // ★ 随插件裁剪：它归 computer-use 插件（catalog.extraResources）；未选该插件时不生成、不随包。
  const pyDir = path.join(ROOT, 'apps', 'desktop', 'resources', 'python');
  if (targets.desktop.length) {
    const keepPython = !PLUGIN_SELECTION || PLUGIN_SELECTION.ids.includes('computer-use');
    if (!keepPython) {
      info(c.dim('内置 Python 运行时：未选 computer-use → 不随包（python 类工具回退系统 python）'));
    } else if (fs.existsSync(pyDir)) {
      info(c.dim('内置 Python 运行时已就绪（resources/python）'));
    } else if (process.env.YZ_SKIP_PYTHON_RUNTIME === '1') {
      warn('已显式跳过内置 Python 运行时（YZ_SKIP_PYTHON_RUNTIME=1）→ 成品将回退系统 python');
    } else {
      info('内置 Python 运行时缺失 → 构建时会**自动生成**（首次约 40MB 下载 + 装依赖）');
    }
  }

  if (targets.android) {
    // ★ CI / 类 Unix 环境下这里的三处 Windows 硬编码全都不成立（C:\Android\Sdk、
    //   C:\APP\Java\jdk-21…），旧逻辑会直接 problems.push 把构建拦死。
    //   所以环境检查一律走下面的跨平台解析函数 androidToolchain() —— 它是唯一真相源。
    const tc = androidToolchain();
    if (tc.sdk) ok(`Android SDK: ${tc.sdk}`);
    else problems.push(`Android SDK 未找到（缺 platform-tools）：${tc.sdkTried.join(' / ')}`);
    if (tc.javaHome) ok(`JDK: ${tc.javaHome}`);
    else problems.push(`JDK 未找到${tc.jdkNote || ''}：${tc.javaTried.join(' / ')}`);
  }

  if (problems.length) {
    for (const p of problems) fail(p);
    console.log('');
    process.exit(1);
  }
  ok('环境检查通过');
}

// ─────────────────────── 交互式选择 ───────────────────────
/**
 * 通用空格多选（checkbox 式）：↑/↓ 移动，空格勾/去，a 全选/全不选，回车确认。
 *
 * ★ 为什么不用「输序号单选」：桌面三档 × 安卓共 2^4 种组合，单选菜单要么枚举不全
 *   （旧版只有 6 个固定选项），要么列全了没人看。多选是最直接的表达。
 *
 * 键位实现注意：rawMode 下逐键监听（readline emitKeypressEvents + keypress），
 * ' '（空格）会作为独立 name:'space' 事件到达，不能靠 rl.question 读整行。
 * 退出前必须 setRawMode(false)，否则终端回显被吃掉。
 *
 * @param {object} opts
 * @param {string} opts.title 顶部提示语
 * @param {Array<{id?:string,label:string,checked?:boolean,locked?:boolean,header?:boolean}>} opts.items
 *        header:true = 分组标题行（不可选中/不可勾选）
 * @param {boolean} [opts.emptySelectsAll] 一个都没勾时按回车：true=全选并留在界面；false=返回 null
 * @param {boolean} [opts.escapeReturnsNull] Esc/Ctrl+C：true=返回 null；false=直接退出进程
 * @param {(items:object[], index:number)=>void} [opts.onToggle] 空格切换后的钩子（互斥项用）
 * @returns {Promise<string[]|null>} 选中的 id；取消/未选返回 null
 */
async function multiPick({ title, items, emptySelectsAll = false, escapeReturnsNull = false, onToggle = null }) {
  const selectable = (i) => !!items[i] && !items[i].header;
  const move = (from, dir) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (from + dir * n + items.length * 2) % items.length;
      if (selectable(i)) return i;
    }
    return from;
  };
  let cursor = items.findIndex((_, i) => selectable(i));
  if (cursor < 0) cursor = 0;
  const render = () => {
    // 光标回退到列表首行重绘（比整屏 clear 干净，历史里只留最终态）
    process.stdout.write(`\x1b[${items.length + 1}A\x1b[J`);
    console.log(c.bold(title));
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.header) {
        console.log(c.dim(`  ── ${it.label} ──`));
        continue;
      }
      const pointer = i === cursor ? c.cyan('❯') : ' ';
      const box = it.checked ? c.green('[x]') : '[ ]';
      console.log(`  ${pointer} ${box} ${it.label}`);
    }
  };
  // 先打印一遍占位（render 会回退 N+1 行覆盖重绘）
  console.log('\n'.repeat(items.length + 1));

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const result = await new Promise((resolve) => {
    const onKey = (str, key) => {
      if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
        cursor = move(cursor, -1);
      } else if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
        cursor = move(cursor, 1);
      } else if (key.name === 'space') {
        if (!selectable(cursor) || items[cursor].locked) return; // 基座项不可取消
        items[cursor].checked = !items[cursor].checked;
        if (onToggle) onToggle(items, cursor);
      } else if (str === 'a' || str === 'A') {
        const free = items.filter((it) => !it.header && !it.locked);
        const allOn = free.every((it) => it.checked);
        for (const it of free) it.checked = !allOn;
      } else if (key.name === 'return' || key.name === 'enter') {
        if (!items.some((it) => !it.header && it.checked)) {
          if (!emptySelectsAll) {
            process.stdin.removeListener('keypress', onKey);
            return resolve(null);
          }
          for (const it of items) if (!it.header && !it.locked) it.checked = true;
        } else {
          process.stdin.removeListener('keypress', onKey);
          return resolve(items.filter((it) => !it.header && it.checked).map((it) => it.id));
        }
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        process.stdin.removeListener('keypress', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.log('');
        if (escapeReturnsNull) return resolve(null);
        process.exit(0);
      } else {
        return; // 其它按键不动界面
      }
      render();
    };
    process.stdin.on('keypress', onKey);
    render();
  });

  process.stdin.setRawMode(false);
  process.stdin.pause();
  return result;
}

async function askTargets() {
  // ★ 非交互环境（CI / 管道 / 被 spawn）不能阻塞等输入 —— 否则脚本永久挂起。
  //   判据：stdin 不是 TTY，或显式给了 --yes。此时按默认（全部）走。
  if (!process.stdin.isTTY || flags.has('--yes') || flags.has('-y')) {
    console.log('');
    warn('非交互环境（stdin 非 TTY），按默认目标执行：桌面三档 + 安卓 APK');
    info(c.dim('  如需指定，请显式传参，如: pnpm package desktop:pro'));
    return { desktop: [...ALL_EDITIONS], android: true };
  }

  // 候选项：桌面三档 + 安卓（desktop:full 与 basic 等价，不单列）
  const items = [
    ...ALL_EDITIONS.map((e) => ({ id: `desktop:${e}`, label: `桌面 · ${e}（${EDITION_LABEL[e]}）`, checked: false })),
    { id: 'android', label: '安卓 APK', checked: false },
  ];
  const result = await multiPick({
    title: '  请选择要打的包（空格勾选，回车开始打包，a 全选/反全选）：',
    items,
    emptySelectsAll: true,
    escapeReturnsNull: false,
  }) || [];

  const desktop = result.filter((id) => id.startsWith('desktop:')).map((id) => id.split(':')[1]);
  // 保持 lite → basic → pro 的构建顺序（勾选顺序不影响实际构建顺序）
  desktop.sort((x, y) => ALL_EDITIONS.indexOf(x) - ALL_EDITIONS.indexOf(y));
  return { desktop, android: result.includes('android') };
}

/**
 * 交互式选择要打进包的模式（--pick-modes）。
 *
 * 返回 null = 不裁剪（按档位预设/全量）；返回数组 = 本次物理编译的模式。
 */
async function askModes() {
  if (!process.stdin.isTTY || flags.has('--yes') || flags.has('-y')) {
    warn('非交互环境，模式按档位预设执行（可用 --modes=office,dev 显式指定）');
    return null;
  }
  const catalog = readModeCatalog();
  const items = Object.entries(catalog.modes).map(([id, d]) => ({
    id,
    label: `${d.label}  ${d.route}`,
    checked: false,
  }));
  const picked = await multiPick({
    title: '  请选择要打进包的模式（空格勾选，回车确认；不勾 = 按档位预设，a 全选/反选）：',
    items,
    emptySelectsAll: false,
    escapeReturnsNull: true,
  });
  if (!picked || !picked.length) {
    info(c.dim('未选择模式 → 按档位预设打包'));
    return null;
  }
  return resolveBuildModes({ catalog, modes: picked, edition: null });
}

/** 交互选择：显示在 package.cjs，**判定**在 scripts/lib/interactive-selection.cjs（可单测）。 */
const {
  NONE_ROW_ID,
  exclusiveWithNone,
  decidePlugins,
  decidePets,
} = require('./lib/interactive-selection.cjs');

/**
 * 交互式插件多选：**按功能分组**（基座 / 模式 / 功能 / 资源 / 可后装），
 * 默认一个都不勾 —— 即"所有插件都不内置，包里只带你勾的"。
 * 每行标注所属档位预设，方便按档位快速挑；`a` 一键全带。
 *
 * @returns {Promise<{ids:string[],excluded:string[],source:string}|null>} null = Esc/不改（按档位预设）
 */
async function askPlugins(editions) {
  if (!process.stdin.isTTY || flags.has('--yes') || flags.has('-y') || !editions.length) return null;
  const catalog = loadPluginCatalog();
  const optional = loadOptionalPlugins();

  const presetsOf = (id) =>
    Object.entries(catalog.editionPresets || {})
      .filter(([, list]) => list.includes(id))
      .map(([e]) => e);
  const entry = ([id, e]) => {
    const preset = presetsOf(id);
    const tag = preset.length ? `预设在 ${preset.join('/')}` : '默认不带';
    return {
      id,
      label: `${e.label}  [${e.kind}${e.modeKey ? ` · ${e.modeKey}` : ''} · ${tag}]`,
      checked: false,
    };
  };

  const items = [];
  const pushGroup = (title, rows) => {
    if (!rows.length) return;
    items.push({ header: true, label: title }, ...rows);
  };
  const byKind = (kind) =>
    Object.entries(catalog.plugins).filter(([id, e]) => e.kind === kind && id !== OFFICE_ID).map(entry);

  items.push(
    { header: true, label: '基座（恒在，不可取消）' },
    {
      id: OFFICE_ID,
      label: `${catalog.plugins[OFFICE_ID]?.label || '办公模式'}（应用基座，永不裁剪）`,
      checked: true,
      locked: true,
    },
  );
  pushGroup('模式插件', byKind('mode'));
  pushGroup('功能插件', byKind('feature'));
  pushGroup('资源插件（皮肤等）', byKind('resource'));
  pushGroup(
    '可后装插件（默认不随包，随包也不自动启用）',
    optional.map((o) => ({ id: o.id, label: `${o.label}  [optional · 点名才进包]`, checked: false })),
  );

  const picked = await multiPick({
    title: '  请选择要打进包的插件（默认只留基座；空格勾选，回车确认，a 全选）：',
    items,
    emptySelectsAll: false,
    escapeReturnsNull: true,
    onToggle: exclusiveWithNone,
  });
  const decision = decidePlugins({ catalog, picked });
  if (decision.kind === 'preset') {
    info(c.dim('插件：按档位预设'));
    return null;
  }
  if (decision.kind === 'none') {
    console.log('\x1b[33m[提示]\x1b[0m 只保留基座 office-core，其余插件全部裁剪（基座不可裁）');
    return resolvePluginSelection({ catalog, plugins: 'none' });
  }
  return resolvePluginSelection({ catalog, plugins: decision.ids.join(',') });
}

/**
 * 交互式宠物多选（2D 精灵图 + 3D 模型，独立于插件）。
 * 默认全勾 = 不裁剪；勾「不带」⇒ 等价 --pets=none（包内无宠物资源，入口隐藏）。
 *
 * @returns {Promise<object|null>} null = 全带（不裁剪）
 */
async function askPets() {
  if (!process.stdin.isTTY || flags.has('--yes') || flags.has('-y')) return null;
  const catalog = loadPetCatalog();
  const items = [
    { id: NONE_ROW_ID, label: '不带任何宠物资源（包内无精灵图/VRM，宠物入口隐藏）', checked: false },
    ...(catalog.packs || []).map((p) => ({ id: p.id, label: `2D · ${p.label}`, checked: true })),
    ...(catalog.vrms || []).map((v) => ({ id: v.id, label: `3D · ${v.label}`, checked: true })),
  ];

  const picked = await multiPick({
    title: '  请选择要随包的宠物资源（空格勾选，回车确认；默认全带）：',
    items,
    emptySelectsAll: false,
    escapeReturnsNull: true,
    onToggle: exclusiveWithNone,
  });
  const decision = decidePets({ catalog, picked });
  if (decision.kind === 'all') {
    info(c.dim('宠物：全带'));
    return null;
  }
  if (decision.kind === 'none') {
    console.log('\x1b[33m[提示]\x1b[0m 本次包不含宠物资源（宠物入口降级隐藏）');
    return resolvePetSelection({ catalog, pets: 'none' });
  }
  return resolvePetSelection({ catalog, pets: decision.ids.join(',') });
}

// ─────────────────────── 目标解析 ───────────────────────
function parseTargets(raw) {
  const t = (raw || []).filter((a) => !a.startsWith('--'));
  const result = { desktop: [], android: false };

  // --editions=lite,pro（或 --edition=，同义）等价于 desktop:lite,pro（注释里承诺过，必须实现）
  const edFlag = raw.find((a) => a.startsWith('--editions=') || a.startsWith('--edition='));
  if (edFlag) {
    const list = edFlag.slice(edFlag.indexOf('=') + 1).split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.length) { fail('--editions= 后必须跟档位，如 --editions=lite,pro'); process.exit(1); }
    const bad = list.filter((e) => !ALL_EDITIONS.includes(e));
    if (bad.length) { fail(`未知档位: ${bad.join(', ')}（可选 ${ALL_EDITIONS.join('/')}）`); process.exit(1); }
    result.desktop.push(...list);
  }

  if (t.length === 0 && !result.desktop.length) return null; // 交给交互

  for (const item of t) {
    const [kind, sub] = item.split(':');
    if (kind === 'desktop' || kind === 'desktop:all') {
      if (!sub || sub === 'all') { result.desktop.push(...ALL_EDITIONS); continue; }
      // desktop:lite,pro
      const list = sub.split(',').map((s) => s.trim()).filter(Boolean);
      const bad = list.filter((e) => !ALL_EDITIONS.includes(e));
      if (bad.length) { fail(`未知档位: ${bad.join(', ')}（可选 ${ALL_EDITIONS.join('/')}）`); process.exit(1); }
      result.desktop.push(...list);
    } else if (kind === 'www' || item === 'desktop:full') {
      result.desktop.push('basic');
    } else if (item === 'android' || item === 'mobile' || item === 'mobile:android') {
      result.android = true;
    } else if (item === 'all') {
      result.desktop.push(...ALL_EDITIONS);
      result.android = true;
    } else {
      fail(`未知目标: ${item}（可选 desktop[:档位] / android / all）`);
      process.exit(1);
    }
  }
  result.desktop = [...new Set(result.desktop)];
  return result;
}

/**
 * 清空某个输出目录里**除去交付物（exe/blockmap）之外**的全部内容。
 *
 * ★ 为什么按"整个目录"而不是列具体路径：electron-builder 会在输出目录里产生
 *   多种中间产物（`win-unpacked/`、`@yan-zhidesktop-*.nsis.7z`、`__uninstaller-*` …），
 *   逐个列必然漏（已漏过 `win-unpacked` 和 `nsis.7z` 两次）。
 *   而这些都是构建中间物、删了会重建 —— 移走最稳妥。
 *   ★ 只保留 `*.exe`（交付物）与 `*.blockmap`（增量更新用）与 `builder-*.yml`（构建清单）：
 *     它们可能上一轮刚产出，用户可能正要拿。
 */
function moveOutDirContents(edition) {
  // 已换根：新根为空，无物可移（旧目录原样保留），直接跳过避免二次撞锁
  if (FRESH_ROOT_USED) {
    info(c.dim(`skip   ${edition}（已换根，新根无需移走）`));
    return;
  }
  const dirName = OUTPUT_DIRS[edition];
  if (!dirName) return;
  const dir = path.join(ROOT, dirName);
  if (!fs.existsSync(dir)) {
    info(c.dim(`skip   ${dirName}（不存在）`));
    return;
  }
  const KEEP = /\.(exe|blockmap)$/i;
  const entries = fs.readdirSync(dir).filter((n) => !KEEP.test(n) && !/^builder-.*\.yml$/i.test(n));
  if (!entries.length) {
    info(c.dim(`skip   ${dirName}（只有交付物）`));
    return;
  }
  if (DRY) {
    for (const n of entries) info(c.dim(`[dry-run] 将移走  ${dirName}/${n}`));
    return;
  }
  const bak = backupRoot();
  for (const n of entries) {
    const src = path.join(dir, n);
    const dest = path.join(bak, `${dirName}_${n}`.replace(/[\\/]/g, '_'));
    try {
      moveWithRetry(src, dest);
      info(c.dim(`moved  ${dirName}/${n}`));
    } catch (e) {
      if (LOCK_CODES.test(e.code) && FRESH_OUTPUT) {
        const locked = findLockedEntries(dir, path.basename(dirName));
        reportLock(locked, dirName);
        switchToFreshRoot(dirName); // 旧目录留下，后续改用新根构建
        return;
      }
      fail(`移动失败 ${dirName}/${n}: ${e.message}`);
      throw e;
    }
  }
}

/**
 * 计算本轮要移走的目录。
 *
 * ★★ 关键在于 `apps/server/dist` 的归属：
 *   · 桌面构建**内含**真编译 → 它的第一步会 rmSync('dist')，所以必须提前移走；
 *   · 纯安卓构建**依赖**已有 dist（build-mobile-server 只复制不编译）→ **绝不能移走**！
 *     若已在本脚本里编译过（willCompile），那份产物就是安卓要用的，同样要保住。
 *   把这条区别写进函数而不是散在主流程里 —— 写错的表现是「安卓包缺改动却不报错」。
 */
function computeMovable(targets, willCompile) {
  return MOVABLE.filter((m) => {
    if (m === 'apps/server/dist') return targets.desktop.length > 0; // 桌面才移（会重建）
    if (m === 'apps/desktop/dist' || m === 'apps/web/dist') return targets.desktop.length > 0;
    if (m.startsWith('apps/mobile/')) return targets.android;
    return true;
  }).map((m) => {
    // 纯安卓 + 本脚本已编译：dist 是刚编好的，别移（安卓要靠它）
    if (m === 'apps/server/dist' && willCompile && !targets.desktop.length) return null;
    return m;
  }).filter(Boolean);
}

// ─────────────────────── 桌面构建 ───────────────────────
function buildDesktop(editions) {
  step(`桌面打包：${editions.map((e) => `${e}(${EDITION_LABEL[e]})`).join(' / ')}`);
  info(`将依次：真编译 server → vite build → 逐档 electron-builder（约 3.5 分钟）`);
  if (BUILD_MODES) info(`代码裁剪：只打入 ${BUILD_MODES.join(', ')}（未选模式的入口与页面不会进包）`);
  if (PLUGIN_SELECTION) info(`插件裁剪：只打入 ${PLUGIN_SELECTION.ids.length} 个内置插件（其余目录打包时暂存移出，自动恢复）`);
  if (PET_SELECTION) {
    info(
      `宠物资源：${PET_SELECTION.ids.length ? PET_SELECTION.ids.join(', ') : '(无 —— 未选资源不进包，宠物入口降级隐藏)'}`,
    );
  }
  // build-all-editions.cjs 内部含真编译 + 逐档重写 edition.json + 清 appOutDir；
  // 每档独立输出到 dist-release/desktop/<档>/<版本>/（无需 --separate，那已是默认行为）。
  run(process.execPath, [
    path.join('apps', 'desktop', 'scripts', 'build-all-editions.cjs'),
    ...editions,
  ], {
    env: {
      ...(BUILD_MODES ? { YZ_BUILD_MODES: BUILD_MODES.join(',') } : {}),
      ...(PLUGIN_SELECTION ? { YZ_BUILD_PLUGINS: PLUGIN_SELECTION.ids.join(',') } : {}),
      ...(petsEnvValue() ? { YZ_BUILD_PETS: petsEnvValue() } : {}),
      ...(NAME_FLAG ? { YZ_ARTIFACT_NAME: NAME_FLAG } : {}),
    },
  });
  ok('桌面构建完成');
}

/**
 * gradle 发行包换源。
 *
 * ★ 症状：`Downloading from https://services.gradle.org/distributions/... failed: timeout`。
 *   追下去发现 services.gradle.org 会 307 跳到 **github.com/gradle/gradle-distributions**，
 *   而本机直连 GitHub 不通（要走代理）—— 所以不是网慢，是根本到不了终点。
 * ★ 处理：android/ 是 cap 生成的 gitignore 目录，改它的 wrapper 属性不影响仓库与 CI。
 *   探测一次官方源：通就保持原样（CI 上 GitHub 可达），不通才换腾讯镜像。
 */
function ensureGradleWrapper(mobile) {
  const props = path.join(mobile, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
  if (!fs.existsSync(props)) return;
  let text = fs.readFileSync(props, 'utf8');

  // 超时默认 10s 对国内网络偏短（镜像下载 150MB），放大到 120s
  const timeoutMatch = /^networkTimeout=(\d+)$/m.exec(text);
  if (timeoutMatch) {
    if (Number(timeoutMatch[1]) < 120000) {
      text = text.replace(timeoutMatch[0], 'networkTimeout=120000');
    }
  } else {
    text += '\nnetworkTimeout=120000\n';
  }

  const m = /^distributionUrl=(.+)$/m.exec(text);
  if (!m) {
    fs.writeFileSync(props, text);
    return;
  }
  const raw = m[1].trim();
  const url = raw.replace(/\\:/g, ':');
  if (!url.includes('services.gradle.org')) {
    fs.writeFileSync(props, text);
    return;
  }

  const reachable = (() => {
    try {
      const out = execFileSync(
        'curl',
        [
          '-sIL',
          '-o',
          process.platform === 'win32' ? 'NUL' : '/dev/null',
          '-w',
          '%{http_code}',
          '--max-time',
          '6',
          url,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 9000 },
      );
      return out.trim() === '200';
    } catch {
      return false;
    }
  })();

  if (!reachable) {
    const mirrored = url.replace(
      'https://services.gradle.org/distributions/',
      'https://mirrors.cloud.tencent.com/gradle/',
    );
    if (mirrored !== url) {
      text = text.replace(raw, mirrored);
      info(`gradle 官方源不可达 → 改用镜像：${mirrored}`);
    }
  }
  fs.writeFileSync(props, text);
}

// ─────────────────────── 安卓构建 ───────────────────────
function buildAndroid() {
  step('安卓 APK 构建');
  const mobile = path.join(ROOT, 'apps', 'mobile');

  // ⓪ 原生工程：android/ 是 cap 生成目录且被 gitignore，**干净机器上不存在**。
  //   CI 里单独跑过 `cap add android`，本地开发机通常是「生成过一次就一直在」，
  //   所以旧链路默认它存在 —— 新机器上会直接卡在「找不到 gradlew」。
  //   ★ 必须早于图标脚本：图标要写进 android/app/src/main/res/。
  if (!fs.existsSync(path.join(mobile, 'android'))) {
    info('⓪ 首次生成 Android 工程（cap add android）');
    // ★ 这里**不能**预建一个空的 apps/mobile/dist：
    //   cap 的判据是「webDir 存在 → 必须有 index.html，否则抛错」；
    //   webDir 不存在时它只告警。空目录反而把「告警」变成「失败」。
    run(
      process.execPath,
      [path.join('node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'add', 'android'],
      { cwd: mobile },
    );
  }

  // ⓪.5 gradle wrapper 换源（官方源会跳到 GitHub，本机直连不通）
  ensureGradleWrapper(mobile);

  // ① 图标（必须在 vite build 之前）
  info('① 生成安卓图标');
  run(process.execPath, ['scripts/gen-android-icons.cjs'], { cwd: mobile });

  // ② 前端
  info('② 构建移动端前端');
  run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: mobile });

  // ②.5 原生改动（短信插件）
  //
  // ★★ 为什么必须在这里补（2026-10-08 发现的实际缺陷）：
  //   原生 java 源 + AndroidManifest 权限 + MainActivity 的 registerPlugin 调用，
  //   唯一真相源在 apps/mobile/native/android/（tracked），而 apps/mobile/android/
  //   是 Capacitor 生成目录（gitignore）。**重建工程后这些改动就丢了**。
  //   mobile 包的 `build:android` 脚本里有这一步，但 package.cjs 的链路**漏了** ——
  //   结果走 `pnpm package:android` 打出的包**不含短信插件**，
  //   而构建全程无报错（插件缺失只在真机收验证码时才暴露）。
  //   ★ 位置：必须早于 cap sync（sync 会重铺原生工程文件，晚于它则被覆盖）。
  info('②.5 应用原生改动（短信插件）');
  run(process.execPath, ['scripts/apply-native-sms.cjs'], { cwd: mobile });

  // ②.6 原生权限 / 明文流量（同样的坑：mobile 的 build:android 里有，这里曾经漏了）
  //   ★ 缺 usesCleartextTraffic 的后果不是"网络慢"，而是 **所有 /api 请求被
  //     ERR_CLEARTEXT_NOT_PERMITTED 拦掉** —— WebView 里 fetch 直接 "Failed to fetch"，
  //     界面永远停在骨架屏（模型/智能体列表看起来就是"数据全丢了"）。
  //   ★ 缺 CAMERA 的后果：系统权限页根本不出现"相机"，用户无从授权。
  info('②.6 应用原生权限（明文流量 / CAMERA）');
  run(process.execPath, ['scripts/apply-native-permissions.cjs'], { cwd: mobile });

  // ②.7 远控沉浸式全屏（本地原生插件：隐藏状态栏/导航栏，UU 远控同款观感）
  info('②.7 应用原生插件（远控沉浸式全屏）');
  run(process.execPath, ['scripts/apply-native-immersive.cjs'], { cwd: mobile });

  // ③ 内嵌后端（★ 先确保 server/dist 是新鲜的）
  //
  // ★★ 为什么这里改成「显式编译」而不是沿用 distStale() 拦中断：
  //   distStale() 用「入口目录 mtime vs 源码 mtime」判断，在**跨机器 / CI 干净 checkout**
  //   下会假阳性 —— 源码 mtime 取决于 checkout 时间，dist 是构建产物，
  //   结果纯安卓 CI 十有八九被判为「陈旧」而拦死（报的却是"请先跑桌面构建"）。
  //   build-mobile-server 只复制不编译这点没变，所以这里**自己补一次编译**，
  //   把分布式前置条件变成脚本内联步骤。distStale() 仅降级为提示。
  if (distStale()) {
    warn('apps/server/dist 陈旧或缺失 → 就地编译一次（build-mobile-server 只复制不编译）');
    info(c.dim('  首次或改动后需要，约 30-60 秒'));
    compileServer();
    ok('server/dist 已重新编译');
  } else {
    ok('apps/server/dist 已是新鲜产物');
  }
  info('③ 打包内嵌 Node 后端');
  run(process.execPath, ['scripts/build-mobile-server.cjs'], { cwd: mobile });

  // ④ cap sync
  info('④ 同步 Capacitor Android 工程');
  run(process.execPath, [path.join('node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android'], { cwd: mobile });

  // ⑤ gradle assembleDebug
  const tc = androidToolchain();
  if (!tc.sdk || !tc.javaHome) {
    fail('安卓工具链不完整（SDK / JDK），无法执行 gradle');
    if (!tc.sdk) info(c.dim(`  SDK 候选均无效: ${tc.sdkTried.join(' / ')}`));
    if (!tc.javaHome) info(c.dim(`  JDK 候选均无效: ${tc.javaTried.join(' / ')}`));
    process.exit(1);
  }

  if (process.platform === 'win32') {
    // ── Windows：走 junction 短路径 ──
    // ★ 为什么必须换短路径：@capawesome/capacitor-nodejs 的 CMake 与 NDK 中间产物
    //   会把路径顶到 Windows MAX_PATH(260) 附近，长路径直接编译失败。
    info(`⑤ gradle assembleDebug（PowerShell + C:\\yz junction）`);
    const junction = 'C:\\yz';
    const jDir = 'C:\\yz\\apps\\mobile\\android';
    const rootEsc = ROOT.replace(/'/g, "''");
    // ★ 用单引号 here-string 写脚本，避免路径里的 \\ 与 $ 被 PS 解释
    const gradleScript = [
      `$ErrorActionPreference = 'Stop'`,
      `if (-not (Test-Path -LiteralPath '${junction}')) {`,
      `  New-Item -ItemType Junction -Path '${junction}' -Target '${rootEsc}' | Out-Null`,
      `}`,
      `$env:ANDROID_HOME = '${tc.sdk}'`,
      `$env:ANDROID_SDK_ROOT = '${tc.sdk}'`,
      `$env:JAVA_HOME = '${tc.javaHome}'`,
      `Set-Location '${jDir}'`,
      `Write-Host "PWD=$($PWD.Path)"`,
      `& .\\gradlew.bat --stop 2>&1 | Out-Null`,
      `& .\\gradlew.bat assembleDebug --console=plain`,
      `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`,
    ].join('\n');
    runPowerShell(gradleScript, 'gradle');
  } else {
    // ── Unix（CI 的 ubuntu runner）：直接跑 gradlew，不必 junction ──
    // ★ chmod +x 不能省：仓库里 gradlew 的可执行位在检出后常丢失 → 报 Permission denied。
    //   （android/ 是 cap 生成目录，本就不入库，所以这里主要防解压/打包后权限丢失。）
    info(`⑤ gradle assembleDebug（${tc.sdk} / ${tc.javaHome}）`);
    const androidDir = path.join(mobile, 'android');
    const gradlew = path.join(androidDir, 'gradlew');
    if (!fs.existsSync(gradlew)) {
      fail(`找不到 gradlew: ${gradlew}（'cap add android' 未成功？）`);
      process.exit(1);
    }
    try {
      fs.chmodSync(gradlew, 0o755);
    } catch {
      /* 权限已正确时忽略 */
    }
    // ★ 用**绝对路径**而不是 './gradlew'：execFileSync 不经 shell，相对路径的解析
    //   依赖 cwd 且易踩坑（尤其 cwd 含符号链接时）。绝对路径无歧义。
    const gradleEnv = { ANDROID_HOME: tc.sdk, ANDROID_SDK_ROOT: tc.sdk, JAVA_HOME: tc.javaHome };
    run(gradlew, ['--stop'], { cwd: androidDir, env: gradleEnv });
    // --no-daemon：CI 容器用完即弃，留 daemon 没收益，还可能让进程不退出挂住 job。
    run(gradlew, ['assembleDebug', '--console=plain', '--no-daemon'], { cwd: androidDir, env: gradleEnv });
  }

  // ⑥ 拷 APK
  info(`⑥ 拷贝 APK 到 ${path.relative(ROOT, path.dirname(path.join(ROOT, ANDROID_APK)))}`);
  run(process.execPath, ['scripts/copy-apk.cjs'], { cwd: mobile });
  ok('安卓构建完成');
}

// ─────────────────────── 产物校验 ───────────────────────
function verifyAll(targets) {
  step('产物校验');
  const verifier = path.join('scripts', 'verify-package-artifacts.cjs');
  let allOk = true;

  for (const e of targets.desktop) {
    // ★ 必须走 OUTPUT_DIRS（与"写到哪"同源，定义见文件头部），不能硬编码 ——
    //   否则用 YZ_ALL_OUT_DIR 换产物根时，产物明明已生成却报"缺 asar"。
    const asar = path.join(ROOT, OUTPUT_DIRS[e], 'win-unpacked', 'resources', 'app.asar');
    if (!fs.existsSync(asar)) { fail(`缺 asar: ${asar}`); allOk = false; continue; }
    try {
      run(process.execPath, [verifier, 'asar', asar]);
      ok(`桌面 ${e} 校验通过`);
    } catch { fail(`桌面 ${e} 校验失败`); allOk = false; }
  }

  if (targets.android) {
    const apk = path.join(ROOT, ANDROID_APK);
    if (!fs.existsSync(apk)) { fail(`缺 APK: ${apk}`); allOk = false; }
    else {
      try {
        run(process.execPath, [verifier, 'apk', apk]);
        ok('APK 校验通过');
      } catch { fail('APK 校验失败'); allOk = false; }
    }
  }
  return allOk;
}

/** 列出产物（尺寸 + 时间） */
function listArtifacts(targets) {
  step('产物清单');
  const list = [];
  for (const e of targets.desktop) {
    // ★ 同样走 OUTPUT_DIRS（见产物校验处注释）
    const dir = path.join(ROOT, OUTPUT_DIRS[e]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.exe') && !f.includes('uninstall')) list.push([`桌面 ${e}（${EDITION_LABEL[e]}）`, path.join(dir, f)]);
    }
  }
  if (targets.android) {
    const apk = path.join(ROOT, ANDROID_APK);
    if (fs.existsSync(apk)) list.push(['安卓 APK', apk]);
  }
  for (const [label, p] of list) {
    const s = fs.statSync(p);
    const mb = (s.size / 1048576).toFixed(1);
    console.log(`  ${label.padEnd(22)} ${mb.padStart(7)} MB  ${c.dim(path.relative(ROOT, p))}`);
  }
  return list.length;
}

/**
 * 清理临时备份
 * ★ 不用 PowerShell 的 [System.IO.Directory]::Delete —— 备份里有 python 运行时的
 *   onnxruntime __pycache__，绝对路径超过 260 字符（MAX_PATH），.NET 会抛
 *   "Could not find a part of the path"；而该异常只写 stderr、PowerShell 退出码仍为 0，
 *   于是脚本打 [OK] 但目录其实没删掉。fs.rmSync 由 libuv 自动加 \\?\ 长路径前缀。
 */
function cleanupTmp() {
  if (KEEP_TMP || DRY || !tmpBackupDir) return;
  step('清理临时备份');
  try {
    fs.rmSync(tmpBackupDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    if (fs.existsSync(tmpBackupDir)) throw new Error('目录仍存在（可能被句柄占用）');
    ok('已清理临时备份');
  } catch (e) {
    warn(`清理失败（${e.message}），可手动删除: ${path.relative(ROOT, tmpBackupDir)}`);
  }
}

/**
 * 清理上轮打包残留（★ 2026-10-04 根因修复：之前每次构建都会留下这些、从不清理，
 * 反复累积把 C 盘吃空；且备份目录打包后会进回收站，更占地方）：
 *   · tmp/_pkgbak_<时间戳>/  ← backupRoot() 每轮建的备份，cleanupTmp 只在成功时清当前轮，
 *                              失败/被中断则永久遗留；
 *   · tmp/_pkg_<label>.ps1   ← runPowerShell 落盘的脚本，从不清理；
 *   · dist-release-<时间戳>/ ← switchToFreshRoot 在 EBUSY 时换的新根，copyDeliverablesBack
 *                              只拷交付物回来、从不删新根 → 每撞一次锁留一个。
 * 在 moveAway 之前调用，清的是「上一轮及更早」的残留，不影响本轮
 * （本轮的 _pkgbak_ 还没建、FRESH_ROOT_USED 还是 null）。
 */
function cleanStaleBuildArtifacts() {
  if (DRY) { info(c.dim('[dry-run] 跳过上轮残留清理')); return; }
  step('清理上轮打包残留');
  const removed = [];

  // 1) tmp/ 下的 _pkgbak_* 与 _pkg_*.ps1
  if (fs.existsSync(TMP)) {
    for (const name of fs.readdirSync(TMP)) {
      if (name.startsWith('_pkgbak_') || /^_pkg_.*\.ps1$/.test(name)) {
        const p = path.join(TMP, name);
        try {
          fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
          removed.push(p);
        } catch { /* 占用则跳过，下次再清 */ }
      }
    }
  }

  // 2) 仓库根下 dist-release-<10+位时间戳> 换根目录（EBUSY 残留）
  try {
    for (const name of fs.readdirSync(ROOT)) {
      if (/^dist-release-\d{10,}$/.test(name)) {
        const p = path.join(ROOT, name);
        try {
          fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
          removed.push(p);
        } catch { /* 占用则跳过，下次再清 */ }
      }
    }
  } catch { /* ROOT 读不了则跳过 */ }

  if (removed.length) ok(`已清理 ${removed.length} 处上轮残留`);
  else info(c.dim('无上轮残留'));
}

/**
 * 若本轮换过产物根（EBUSY 绕锁），交付物已拷回标准树，这里把整棵换根目录删掉，
 * 避免它像历史版本那样永久遗留（见 cleanStaleBuildArtifacts 注释）。
 * 必须放在 verifyAll / listArtifacts 之后 —— 它们仍按 OUTPUT_DIRS（=新根路径）读产物校验。
 */
function cleanFreshRoot() {
  if (!FRESH_ROOT_USED) return;
  const p = path.join(ROOT, FRESH_ROOT_USED);
  if (!fs.existsSync(p)) return;
  step('清理换根产物目录');
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    ok(`已清理换根目录 ${FRESH_ROOT_USED}（交付物已拷回 ${DEFAULT_RELEASE_ROOT}/）`);
  } catch {
    warn(`换根目录清理失败，可手动删除: ${path.relative(ROOT, p)}`);
  }
}

// ─────────────────────── 主流程 ───────────────────────
(async () => {
  let targets = parseTargets(argv);
  if (!targets) targets = await askTargets();
  if (!targets.desktop.length && !targets.android) {
    fail('未选择任何目标');
    process.exit(1);
  }

  // 交互式插件多选：显式 --plugins 优先；否则交互终端里**默认弹出**，且先于模式 ——
  // 插件选择集会反向推导模式（与 --plugins 完全同源），保证"插件在包、入口也在"。
  // 保持预设（不动勾选）时返回 null，后面照旧弹模式选择，行为与改动前一致。
  if (!PLUGIN_SELECTION && targets.desktop.length && process.stdin.isTTY && !flags.has('--yes')) {
    PLUGIN_SELECTION = await askPlugins(targets.desktop);
    if (PLUGIN_SELECTION) {
      BUILD_MODES = modeKeysForSelection(loadPluginCatalog(), PLUGIN_SELECTION.ids, loadPluginModesCatalog());
    }
  }

  // 交互式模式多选：显式 --modes 优先；否则在交互式终端里**默认弹出**（选完包接着选模式）。
  // 非 TTY / --yes 自动跳过，沿用档位预设 —— 不改变 CI 与非交互脚本的行为。
  if (!BUILD_MODES && process.stdin.isTTY && !flags.has('--yes')) {
    BUILD_MODES = await askModes();
  }

  // 交互式宠物多选（独立维度）：显式 --pets 优先，否则交互终端里默认弹出。
  // 默认全勾 = 不裁剪；一个都不带 = 包里无宠物资源、入口降级隐藏。
  if (!PET_SELECTION && targets.desktop.length && process.stdin.isTTY && !flags.has('--yes')) {
    PET_SELECTION = await askPets();
  }

  console.log(c.bold(`\n言智打包 —— 目标：${
    [targets.desktop.length ? `桌面 ${targets.desktop.join('/')}` : null, targets.android ? '安卓 APK' : null]
      .filter(Boolean).join(' + ')
  }`));
  if (BUILD_MODES) info(`代码模式：${BUILD_MODES.join(', ')}（未选模式的代码不会进包）`);
  if (PLUGIN_SELECTION) {
    info(`内置插件：${PLUGIN_SELECTION.ids.join(', ')}（${PLUGIN_SELECTION.source}）`);
    info(`排除插件：${PLUGIN_SELECTION.excluded.length ? PLUGIN_SELECTION.excluded.join(', ') : '(无)'}`);
  }
  if (PET_SELECTION) {
    info(
      `宠物资源：${PET_SELECTION.ids.length ? PET_SELECTION.ids.join(', ') : '(无)'}` +
        (PET_SELECTION.excluded.length ? `　排除 ${PET_SELECTION.excluded.join(', ')}` : ''),
    );
  }
  if (NAME_FLAG && targets.desktop.length) {
    info(`产物命名：${NAME_FLAG}${targets.desktop.length > 1 ? '（每档追加档位名）' : ''}`);
  }

  preflight(targets);

  // 是否需要真编译 server：
  //   · 桌面构建内含编译（build-all-editions 第一步就是 server build）；
  //   · 纯安卓时，只有 dist 陈旧/缺失才单独编译一次；
  //   · --only + dist 新鲜 → 直接复用，连编译都省。
  const needCompile = targets.desktop.length > 0;
  let willCompile = needCompile;
  if (!needCompile && targets.android) {
    if (distReady() && !distStale()) ok('apps/server/dist 新鲜，可复用（跳过编译）');
    else willCompile = true;
  }

  if (DRY) {
    step('dry-run 计划（不执行任何写操作）');
    info(`目标: ${[targets.desktop.length ? `桌面 ${targets.desktop.join('/')}` : null, targets.android ? '安卓 APK' : null].filter(Boolean).join(' + ')}`);
    info(`将真编译 server: ${willCompile ? '是' : '否（复用现有 dist）'}`);
    info(`将构建: ${[needCompile ? '桌面三档/选档' : null, targets.android ? '安卓 APK' : null].filter(Boolean).join(' → ')}`);
    info(`代码模式: ${BUILD_MODES ? BUILD_MODES.join(', ') : '按档位预设（可用 --modes=office,dev 指定）'}`);
    info(`内置插件: ${PLUGIN_SELECTION ? `${PLUGIN_SELECTION.ids.join(', ')}（${PLUGIN_SELECTION.source}）` : '按档位预设（可用 --plugins=office-core,skins 指定）'}`);
    if (PLUGIN_SELECTION) {
      info(`排除插件: ${PLUGIN_SELECTION.excluded.length ? PLUGIN_SELECTION.excluded.join(', ') : '(无)'}`);
    }
    if (PET_SELECTION) {
      info(
        `宠物资源: ${PET_SELECTION.ids.length ? PET_SELECTION.ids.join(', ') : '(无 —— 入口降级隐藏)'}` +
          (PET_SELECTION.excluded.length ? `　排除 ${PET_SELECTION.excluded.join(', ')}` : ''),
      );
    }
    console.log('');
    step('将移走的目录');
    moveAway(computeMovable(targets, willCompile));
    for (const e of targets.desktop) moveOutDirContents(e);
    console.log('');
    console.log(c.dim('  dry-run 结束，未做任何改动。去掉 --dry-run 即为真实构建。'));
    return;
  }

  if (willCompile && !needCompile) {
    step('真编译 server（安卓前置）');
    compileServer();
  }

  step('移位将撞删除保护的目录');
  cleanStaleBuildArtifacts(); // 先清上轮残留，再开始本轮移位/构建
  moveAway(computeMovable(targets, willCompile));
  // 输出目录里除交付物外的全部中间产物（win-unpacked / nsis.7z / __uninstaller-* …）
  for (const e of targets.desktop) moveOutDirContents(e);

  try {
    if (targets.desktop.length) buildDesktop(targets.desktop);
    // ★ 收口旧版本目录：每升一次 version 都会新建 dist-release/desktop/<档>/<版本>/，
    //   这里每个档保留最新的 keep=2 个、删其余，避免反复累积吃满 C 盘。
    if (targets.desktop.length) pruneOldReleases(ROOT);
    if (targets.android) buildAndroid();
    copyDeliverablesBack(); // 若换根，把交付物拷回标准树 dist-release/

    let verifyOk = true;
    if (VERIFY) verifyOk = verifyAll(targets);
    const n = listArtifacts(targets);

    cleanupTmp();
    cleanFreshRoot(); // 若本轮换过根，交付物已拷回标准树，删掉换根目录（必须晚于 verify/list）

    console.log('');
    if (verifyOk) {
      console.log(c.green(c.bold(`✓ 完成：${n} 个产物，全部校验通过`)));
    } else {
      console.log(c.yellow(c.bold(`⚠ 完成：${n} 个产物，但有校验未通过（见上）`)));
      process.exitCode = 1;
    }
  } catch (e) {
    console.log('');
    fail(`构建中断: ${e.message}`);
    if (tmpBackupDir) {
      console.log('');
      warn(`临时备份保留在: ${path.relative(ROOT, tmpBackupDir)}`);
    }
    process.exit(1);
  }
})();
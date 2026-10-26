#!/usr/bin/env node
/**
 * 打包前模式选择（写前端生成表 + 构建清单）。
 *
 * 用法：
 *   node scripts/select-modes.cjs --modes=office,dev
 *   node scripts/select-modes.cjs --edition=basic        # 预设：office / wf / dev
 *   node scripts/select-modes.cjs --restore              # 恢复全量（开发/打包结束用）
 *   node scripts/select-modes.cjs --print                # 只打印本次会选哪些模式
 *
 * 产物：
 *   packages/ui/src/generated/build-modes.ts  ← 前端只 import 选中模式的入口
 *   build/build-manifest.json                 ← 未选模式清单（泄漏断言 / 排障用）
 *
 * ★ 为什么必须先于 vite build：路由表与插件视图表都由生成文件提供。生成之后
 *   未选模式的动态 import 表达式在源码层面就不存在，Rollup 不会产出对应 chunk。
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  ROOT,
  CATALOG_PATH,
  MANIFEST_PATH,
  GENERATED_PATH,
  readCatalog,
  allModeKeys,
  parseModesArg,
  resolveModes,
  buildManifest,
  writeGenerated,
  writeManifest,
} = require('./lib/mode-build.cjs');

function readArgs(argv) {
  const opts = { restore: false, print: false, modes: null, edition: null, plugins: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--restore') opts.restore = true;
    else if (a === '--print' || a === '--dry-run') opts.print = true;
    else if (a.startsWith('--modes=')) opts.modes = a.slice('--modes='.length);
    else if (a === '--modes') opts.modes = argv[++i];
    else if (a.startsWith('--plugins=')) opts.plugins = a.slice('--plugins='.length);
    else if (a === '--plugins') opts.plugins = argv[++i];
    else if (a.startsWith('--edition=')) opts.edition = a.slice('--edition='.length);
    else if (a === '--edition') opts.edition = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else {
      console.error(`[select-modes] 未知参数: ${a}`);
      printHelp();
      process.exit(1);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`用法:
  node scripts/select-modes.cjs --modes=office,dev
  node scripts/select-modes.cjs --edition=basic
  node scripts/select-modes.cjs --modes=office --plugins=office-core,skins  # 未选插件的视图也不进表
  node scripts/select-modes.cjs --restore
  node scripts/select-modes.cjs --print --modes=office`);
}

/**
 * 未选插件的视图（相对 packages/ui/src）——从生成表里剔除，让它们的 chunk 不进主包。
 * 选择集文法（分组关键字 / requires 闭包 / office 锁定）统一走 plugin-selection。
 * 未传 --plugins 且无 YZ_BUILD_PLUGINS = 全量，返回空数组（行为与 P5 之前一致）。
 */
function pluginViewExclusions(pluginsRaw) {
  const raw = pluginsRaw ?? process.env.YZ_BUILD_PLUGINS;
  if (raw === undefined || raw === null || String(raw).trim() === '') return [];
  const { loadCatalog: loadPluginCatalog, resolveSelection } = require(path.join(ROOT, 'apps', 'desktop', 'scripts', 'lib', 'plugin-build-selection.cjs'));
  const pluginCatalog = loadPluginCatalog();
  const selected = new Set(resolveSelection({ catalog: pluginCatalog, plugins: raw }).ids);
  return Object.entries(pluginCatalog.plugins)
    .filter(([id]) => !selected.has(id))
    .flatMap(([, entry]) => entry.frontendViews || []);
}

function main() {
  const opts = readArgs(process.argv.slice(2));
  const catalog = readCatalog();

  // --restore：恢复全量（不做裁剪），供打包结束 / 本地开发使用
  const modes = opts.restore
    ? allModeKeys(catalog)
    : resolveModes({ catalog, modes: parseModesArg(opts.modes), edition: opts.edition });

  if (opts.print) {
    console.log(`[select-modes] 模式: ${modes.join(', ')}`);
    return;
  }

  // 未选插件的视图不进生成表（P5：插件裁剪与模式裁剪同源）
  const excludedPluginViews = opts.restore ? [] : pluginViewExclusions(opts.plugins);
  const { pluginViews } = writeGenerated({ catalog, modes, excludedPluginViews });
  const manifest = buildManifest({ catalog, modes, edition: opts.edition });
  writeManifest(manifest);

  console.log(`[select-modes] 已选择 ${modes.length} 个模式: ${modes.join(', ')}`);
  console.log(
    `[select-modes] 生成: ${path.relative(ROOT, GENERATED_PATH)}（插件视图 ${pluginViews.length} 个` +
      (excludedPluginViews.length ? `，按插件选择集排除 ${excludedPluginViews.length} 条视图规则` : '') +
      '）',
  );
  console.log(`[select-modes] 清单: ${path.relative(ROOT, MANIFEST_PATH)}（排除 ${manifest.excludedModes.join(', ') || '无'}）`);
  console.log(`[select-modes] buildId: ${manifest.buildId}`);
}

main();

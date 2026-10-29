#!/usr/bin/env node
/**
 * 插件裁剪的打包后泄漏断言（P5）。
 *
 * 两条判据，任一命中即失败：
 *   1) 目录：未选插件的 `apps/server/plugins/builtin/<id>/` 仍然存在（会被 extraResources 拷进包）；
 *      同时选中插件的目录 + manifest.json 必须齐全（缺件同样报错）。
 *   2) 产物文本：未选插件的**视图组件名**（OpsConsole / ClipWorkbench…）出现在前端产物里。
 *
 * ★ 为什么必须有：build-plugins 不删未选目录、mode 裁剪可能被共享代码破坏 ——
 *   这两种情况构建都会成功，只有这里能拦住「名字说精简、内容是全量」的包。
 * ★ 标记串用视图组件名而不是插件 id：`/plugin/ops-shell/...` 这类接口字面量会出现在
 *   别的插件的面板里，按 id 扫会误报（见 lib/plugin-stage.cjs 的 pluginMarkers 注释）。
 *
 * 用法：
 *   node scripts/verify-plugin-prune.cjs --plugins=office-core,skins,dev-mode
 *   node scripts/verify-plugin-prune.cjs --modes=office,dev
 *   node scripts/verify-plugin-prune.cjs --edition=lite
 *   node scripts/verify-plugin-prune.cjs --dirs=apps/desktop/dist,apps/web/dist
 *   选项：--root=<builtin 目录>  --json
 *   不传选择集：读 YZ_BUILD_PLUGINS / YZ_BUILD_MODES，再退到 build/build-plugins.json；
 *   全都拿不到 = 全量构建（只做"选中目录齐全"检查，不做排除断言）。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP_SCRIPTS = path.join(ROOT, 'apps', 'desktop', 'scripts');
const {
  CATALOG_PATH,
  loadCatalog,
  allPluginIds,
  resolveSelection,
  selectionFromEnv,
  readJson,
} = require(path.join(DESKTOP_SCRIPTS, 'lib', 'plugin-build-selection.cjs'));
const stage = require(path.join(DESKTOP_SCRIPTS, 'lib', 'plugin-stage.cjs'));

const SELECTION_FILE = path.join(ROOT, 'build', 'build-plugins.json');
const DEFAULT_DIRS = ['apps/desktop/dist'];

function parseArgs(argv) {
  const opts = {
    dirs: DEFAULT_DIRS,
    root: path.join(ROOT, 'apps', 'server', 'plugins', 'builtin'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--plugins') opts.plugins = argv[++i];
    else if (a.startsWith('--plugins=')) opts.plugins = a.slice('--plugins='.length);
    else if (a === '--modes') opts.modes = argv[++i];
    else if (a.startsWith('--modes=')) opts.modes = a.slice('--modes='.length);
    else if (a.startsWith('--edition=')) opts.editions = [a.slice('--edition='.length)];
    else if (a.startsWith('--root=')) opts.root = path.resolve(ROOT, a.slice('--root='.length));
    else if (a.startsWith('--dirs=')) opts.dirs = a.slice('--dirs='.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return opts;
}

/** 选择集：显式参数 > 环境变量 > build-plugins.json > 全量。 */
function resolveOrAll(opts, catalog) {
  const env = selectionFromEnv();
  if (opts.plugins !== undefined || opts.modes !== undefined || (opts.editions && opts.editions.length)) {
    return resolveSelection({ catalog, plugins: opts.plugins ?? null, modes: opts.modes ?? null, editions: opts.editions || null });
  }
  if (env.plugins || env.modes) {
    return resolveSelection({ catalog, plugins: env.plugins, modes: env.modes });
  }
  try {
    const last = readJson(SELECTION_FILE);
    if (Array.isArray(last.included) && last.included.length) {
      return { ids: last.included, excluded: Object.keys(catalog.plugins).filter((id) => !last.included.includes(id)), source: 'build-plugins.json' };
    }
  } catch {
    /* 没跑过 build-plugins：按全量处理 */
  }
  return { ids: Object.keys(catalog.plugins), excluded: [], source: 'all' };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = loadCatalog();
  const allIds = allPluginIds(catalog);
  const selection = resolveOrAll(opts, catalog);

  const staged = stage.verifyStaged({ root: opts.root, allIds, selected: selection.ids });
  const markersByPlugin = {};
  for (const id of selection.excluded) {
    const markers = stage.pluginMarkers(catalog, id);
    if (markers.length) markersByPlugin[id] = markers;
  }
  const hits = selection.excluded.length
    ? stage.scanProductForLeaks({
        dirs: opts.dirs.map((d) => path.resolve(ROOT, d)),
        markersByPlugin,
        baseDir: ROOT,
      })
    : [];

  const failed = !staged.ok || hits.length > 0;
  if (opts.json) {
    console.log(JSON.stringify({ selection, root: opts.root, dirs: opts.dirs, staged, hits }, null, 2));
    return failed ? 1 : 0;
  }

  if (!selection.excluded.length) {
    console.log('[verify-plugin-prune] 全量构建，无需裁剪断言（仅校验选中目录齐全）');
  }
  if (staged.leaked.length) {
    console.error(`[verify-plugin-prune] ✗ 未选插件目录仍在 builtin（${staged.leaked.length} 个）：`);
    for (const id of staged.leaked) console.error(`  · ${id}`);
  }
  if (staged.missing.length) {
    console.error(`[verify-plugin-prune] ✗ 选中插件的包缺失（${staged.missing.length} 个）：`);
    for (const id of staged.missing) console.error(`  · ${id}（缺目录或 manifest.json）`);
  }
  if (hits.length) {
    console.error(`[verify-plugin-prune] ✗ 未选插件的界面进了前端产物（${hits.length} 处）：`);
    for (const h of hits) console.error(`  · ${h.file} ← ${h.pluginId} / ${h.marker}`);
  }
  if (failed) {
    console.error('  处置：打包前先跑 apps/desktop/scripts/stage-plugins.mjs prune；界面泄漏则检查构建期视图表是否只含选中模式。');
    return 1;
  }
  console.log(
    `[verify-plugin-prune] ✓ 通过：选中 ${selection.ids.length} 个（${selection.source}），` +
      `未选 ${selection.excluded.length} 个未出现在 builtin 与产物中`,
  );
  return 0;
}

process.exit(main());

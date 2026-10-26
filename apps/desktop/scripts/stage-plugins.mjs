#!/usr/bin/env node
/**
 * 内置插件目录暂存器（P5）：prune / restore / verify。
 *
 * electron-builder 是按目录整体拷 `apps/server/plugins/builtin` 的，而 build-plugins
 * 只构建选中插件、**不删**未选目录（旧目录还在 → 会被打进精简包）。本脚本负责在
 * 打包前后把未选目录移入同级 `.prune-hold/` 再移回来：
 *   · 移动而非删除，随时可恢复；
 *   · prune 开始先恢复上次崩溃残留，不会累积；
 *   · 未知目录（不在 plugins.catalog.json）一律不动。
 *
 * 用法:
 *   node scripts/stage-plugins.mjs prune   --plugins=office-core,skins,dev-mode
 *   node scripts/stage-plugins.mjs verify  --plugins=office-core,skins,dev-mode [--json]
 *   node scripts/stage-plugins.mjs restore
 *   选项: --root=<builtin 目录>（默认 apps/server/plugins/builtin）
 *         --modes=<mode,csv> | --edition=lite|basic|pro | --editions=a,b
 *         不传选择集时读环境变量 YZ_BUILD_PLUGINS / YZ_BUILD_MODES，仍为空 = 全量（prune 空操作）
 *
 * 退出码：prune/restore 恒 0（失败抛错）；verify 不符合选择集时 1。
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DESKTOP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(DESKTOP_DIR, '..', '..');
const {
  loadCatalog,
  resolveSelection,
  selectionFromEnv,
} = require(path.join(DESKTOP_DIR, 'scripts', 'lib', 'plugin-build-selection.cjs'));
const stage = require(path.join(DESKTOP_DIR, 'scripts', 'lib', 'plugin-stage.cjs'));

function parseArgs(argv) {
  const args = { action: null, root: path.join(REPO_ROOT, 'apps', 'server', 'plugins', 'builtin') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--plugins') args.plugins = argv[++i];
    else if (a.startsWith('--plugins=')) args.plugins = a.slice('--plugins='.length);
    else if (a === '--modes') args.modes = argv[++i];
    else if (a.startsWith('--modes=')) args.modes = a.slice('--modes='.length);
    else if (a.startsWith('--edition=')) args.editions = [a.slice('--edition='.length)];
    else if (a.startsWith('--editions=')) args.editions = a.slice('--editions='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--root=')) args.root = path.resolve(a.slice('--root='.length));
    else if (!a.startsWith('-') && !args.action) args.action = a;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function resolveIds(args, catalog) {
  const env = selectionFromEnv();
  const explicit = args.plugins !== undefined || args.modes !== undefined || (args.editions && args.editions.length);
  if (!explicit && !env.plugins && !env.modes) {
    return { ids: Object.keys(catalog.plugins), excluded: [], source: 'all' };
  }
  return resolveSelection({
    catalog,
    plugins: args.plugins ?? env.plugins,
    modes: args.modes ?? env.modes,
    editions: args.editions || null,
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.action) {
    console.log('用法: node scripts/stage-plugins.mjs <prune|restore|verify> [--plugins=<csv>] [--modes=<csv>] [--edition=x] [--root=<dir>] [--json]');
    return args.help ? 0 : 1;
  }
  const catalog = loadCatalog();
  const allIds = Object.keys(catalog.plugins);
  const log = (m) => console.log(`[stage-plugins] ${m}`);

  if (args.action === 'restore') {
    const r = stage.restoreHeld({ root: args.root, log });
    log(`已恢复 ${r.restored.length} 个（丢弃过期暂存 ${r.dropped.length} 个）→ ${args.root}`);
    return 0;
  }

  const selection = resolveIds(args, catalog);
  if (args.action === 'prune') {
    const r = stage.prunePlugins({ root: args.root, allIds, selected: selection.ids, log });
    log(`prune 完成：移出 ${r.moved.length} 个，恢复残留 ${r.restored.length} 个 → ${r.holdDir}`);
    log(`保留：${selection.ids.join(', ')}`);
    return 0;
  }

  if (args.action === 'verify') {
    const r = stage.verifyStaged({ root: args.root, allIds, selected: selection.ids });
    if (args.json) {
      console.log(JSON.stringify({ root: args.root, selection, ...r }, null, 2));
    } else if (r.ok) {
      log(`✓ 目录状态符合选择集（${selection.ids.length} 选中 / ${allIds.length - selection.ids.length} 未选）`);
    } else {
      for (const id of r.leaked) console.error(`[stage-plugins] ✗ 未选插件目录仍在：${id}`);
      for (const id of r.missing) console.error(`[stage-plugins] ✗ 选中插件目录/清单缺失：${id}`);
      console.error('[stage-plugins] 处置：先跑 prune（未选移出），或重跑 build-plugins 补构建选中插件。');
    }
    return r.ok ? 0 : 1;
  }

  console.error(`[stage-plugins] 未知动作: ${args.action}（可选 prune / restore / verify）`);
  return 1;
}

process.exit(main());

#!/usr/bin/env node
/**
 * 构建后泄漏断言：未选模式的代码不能出现在产物里。
 *
 * 用法：
 *   node scripts/verify-mode-prune.cjs
 *   node scripts/verify-mode-prune.cjs --dirs=apps/desktop/dist,apps/web/dist
 *
 * 判定依据两条，任一命中即失败：
 *   1) 产物文件名 / Vite 构建清单里出现未选模式的源文件；
 *   2) 产物文本里出现未选模式的唯一标记串（如 OpsConsole / ClipWorkbench）。
 *
 * ★ 为什么必须有这条断言：裁剪逻辑一旦被后续重构破坏（有人又在共享代码里写死
 *   `import('.../OpsConsole.vue')`），构建仍然成功，只有这里能拦住。
 *   打包流程在 vite build 之后、electron-builder 之前调用它。
 */
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readManifest, MANIFEST_PATH } = require('./lib/mode-build.cjs');

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.svg', '.txt']);
const DEFAULT_DIRS = ['apps/desktop/dist'];

function parseArgs(argv) {
  const opts = { manifest: MANIFEST_PATH, dirs: DEFAULT_DIRS };
  for (const a of argv) {
    if (a.startsWith('--manifest=')) opts.manifest = path.resolve(ROOT, a.slice('--manifest='.length));
    else if (a.startsWith('--dirs=')) {
      opts.dirs = a.slice('--dirs='.length).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return opts;
}

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = readManifest({ manifestPath: opts.manifest });
  const excludedModes = manifest.excludedModes || [];
  if (!excludedModes.length) {
    console.log('[verify-mode-prune] 全量构建，无需裁剪断言');
    return 0;
  }

  const excludedViews = (manifest.excludedViews || []).map((v) => v.replace(/\\/g, '/'));
  const markers = [...new Set(manifest.markers || [])];
  const hits = [];

  for (const relDir of opts.dirs) {
    const dir = path.resolve(ROOT, relDir);
    if (!fs.existsSync(dir)) continue;
    const files = walkFiles(dir);

    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');

      // 1) 源文件路径 / chunk 文件名
      for (const view of excludedViews) {
        const base = path.basename(view).replace(/\.vue$/, '');
        if (rel.includes(view) || path.basename(rel).includes(base)) {
          hits.push({ file: rel, type: 'chunk/文件名', detail: view });
        }
      }

      // 2) 内容标记
      let text = '';
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const m of markers) {
        if (text.includes(m)) hits.push({ file: rel, type: '内容标记', detail: m });
      }
    }
  }

  if (!hits.length) {
    console.log(`[verify-mode-prune] ✓ 通过：未选模式 ${excludedModes.join(', ')} 未出现在产物中`);
    return 0;
  }

  console.error(`[verify-mode-prune] ✗ 发现未选模式代码泄漏（${hits.length} 处）`);
  const seen = new Set();
  for (const h of hits) {
    const key = `${h.file}|${h.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  · [${h.type}] ${h.file} ← ${h.detail}`);
  }
  console.error('  处置：检查共享代码里是否又写死了模式入口的 import；路由/预热/插件注册表必须只读生成表。');
  return 1;
}

process.exit(main());

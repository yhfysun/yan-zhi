#!/usr/bin/env node
/**
 * 安装包内容清单断言（mode-pluginization P7）：逐档核对「装进包里的插件目录」。
 *
 * 三类判据（任一命中即失败）：
 *   1) 未选插件目录出现在包里 —— 名字说精简、内容却是全量（裁剪链路失效）；
 *   2) 选中插件缺目录/manifest.json —— build-plugins 少构建或 electron-builder 拷贝漏件；
 *   3) plugins/builtin 根下出现**文件**（如旧的 `__frontend-entry-*.mjs`）——
 *      构建器临时入口曾落在产物根，会被原样拷进安装包（P5 修过，本断言防回归）。
 *
 * office-core 是基座（无 backendEntry/manifest），打包后本来就不存在 —— 以**本地
 * builtin 目录里有没有 manifest.json** 判断"这一档应当有该目录"，而不是只看预设清单。
 *
 * 用法：
 *   node scripts/verify-edition-contents.cjs
 *   node scripts/verify-edition-contents.cjs --root=dist-release/desktop --editions=lite,basic
 *   node scripts/verify-edition-contents.cjs --json
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { resolvePluginSelection } = require('./lib/plugin-selection.cjs');

function parseArgs(argv) {
  const opts = { root: path.join(ROOT, 'dist-release', 'desktop'), editions: null, json: false, source: path.join(ROOT, 'apps/server/plugins/builtin') };
  for (const a of argv) {
    if (a === '--json') opts.json = true;
    else if (a.startsWith('--root=')) opts.root = path.resolve(ROOT, a.slice('--root='.length));
    else if (a.startsWith('--editions=')) opts.editions = a.slice('--editions='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--source=')) opts.source = path.resolve(ROOT, a.slice('--source='.length));
    else {
      console.error(`未知参数: ${a}`);
      process.exit(2);
    }
  }
  if (!opts.editions) {
    opts.editions = fs.existsSync(opts.root)
      ? fs.readdirSync(opts.root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [];
  }
  return opts;
}

/** 找到某档的 win-unpacked/resources/server/dist/plugins/builtin（多版本时取最新目录） */
function findBuiltinDir(root, edition) {
  const edDir = path.join(root, edition);
  if (!fs.existsSync(edDir)) return null;
  const versions = fs
    .readdirSync(edDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(edDir, d.name, 'win-unpacked')))
    .map((d) => d.name)
    .sort();
  if (!versions.length) return null;
  const dir = path.join(edDir, versions[versions.length - 1], 'win-unpacked', 'resources', 'server', 'dist', 'plugins', 'builtin');
  return fs.existsSync(dir) ? dir : null;
}

function checkEdition({ catalog, edition, root, source }) {
  const problems = [];
  const builtinDir = findBuiltinDir(root, edition);
  if (!builtinDir) {
    return { edition, problems: [`找不到产物目录（${path.relative(ROOT, path.join(root, edition))}/<版本>/win-unpacked/…）`], expected: [], actual: [] };
  }

  const selection = resolvePluginSelection({ catalog, editions: [edition] });
  const selected = new Set(selection.ids);

  // 应当被打进这一档的插件：在本地 builtin 里真实有 manifest.json 的选中项
  const expected = [...selected].filter((id) => fs.existsSync(path.join(source, id, 'manifest.json')));

  const entries = fs.readdirSync(builtinDir, { withFileTypes: true });
  const actualDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const strayFiles = entries.filter((e) => !e.isDirectory()).map((e) => e.name);

  for (const name of strayFiles) problems.push(`builtin 根下有多余文件: ${name}`);
  for (const id of actualDirs) {
    if (!selected.has(id)) problems.push(`未选插件目录出现在包内: ${id}`);
  }
  for (const id of expected) {
    if (!actualDirs.includes(id)) problems.push(`选中插件缺目录: ${id}`);
    else if (!fs.existsSync(path.join(builtinDir, id, 'manifest.json'))) problems.push(`插件目录缺 manifest.json: ${id}`);
  }
  // 皮肤类资源随包（assets 是剪辑/皮肤插件的运行必需资源）
  if (selected.has('skins') && actualDirs.includes('skins')) {
    const assets = path.join(builtinDir, 'skins', 'assets');
    if (!fs.existsSync(assets) || !fs.readdirSync(assets).length) problems.push('skins/assets 缺失或为空');
  }

  return { edition, problems, expected: expected.sort(), actual: actualDirs.sort() };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'plugins.catalog.json'), 'utf8'));
  if (!opts.editions.length) {
    console.error('没有可校验的档位（--root 下无产物目录）');
    return 2;
  }
  const results = opts.editions.map((edition) => checkEdition({ catalog, edition, root: opts.root, source: opts.source }));
  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      if (r.problems.length) {
        console.log(`✗ ${r.edition}`);
        for (const p of r.problems) console.log(`   - ${p}`);
      } else {
        console.log(`✓ ${r.edition}：${r.actual.length} 个插件目录与选择集一致`);
      }
    }
  }
  const failed = results.filter((r) => r.problems.length);
  return failed.length ? 1 : 0;
}

process.exitCode = main();

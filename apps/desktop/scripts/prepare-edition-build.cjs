#!/usr/bin/env node
/**
 * 单档打包前置：先落 edition.json，再生成与档位一致的前端模式/插件视图表。
 *
 * ★ 必须在 vite build 之前执行。只跑 set-edition 不够：set-edition 只写
 *   edition.json，而前端路由和模式入口来自 packages/ui/src/generated/build-modes.ts。
 *   顺序反了会把上一档的全量模式烘进当前安装包，出现「Lite 仍显示开发/运维等模式」。
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const EDITIONS = ['lite', 'basic', 'pro'];
const edition = process.argv[2];
if (!EDITIONS.includes(edition)) {
  console.error(`[prepare-edition] 用法: node scripts/prepare-edition-build.cjs <${EDITIONS.join('|')}>`);
  process.exit(1);
}

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const run = (script, args) => execFileSync(process.execPath, [script, ...args], {
  cwd: desktopDir,
  stdio: 'inherit',
});

run(path.join(repoRoot, 'scripts', 'sync-yanzhi-icons.cjs'), []);
run(path.join(desktopDir, 'scripts', 'set-edition.cjs'), [edition]);

const cfgPath = path.join(desktopDir, 'edition.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const modes = Array.isArray(cfg.modes) ? cfg.modes.filter(Boolean) : [];
const plugins = Array.isArray(cfg.plugins) ? cfg.plugins.filter(Boolean) : [];
if (!modes.length || !plugins.length) {
  console.error('[prepare-edition] edition.json 缺少 modes/plugins，不能生成前端裁剪表');
  process.exit(1);
}

const selectModes = path.join(repoRoot, 'scripts', 'select-modes.cjs');
run(selectModes, [
  `--edition=${edition}`,
  `--modes=${modes.join(',')}`,
  `--plugins=${plugins.join(',')}`,
]);

const generatedPath = path.join(repoRoot, 'packages', 'ui', 'src', 'generated', 'build-modes.ts');
const generated = fs.readFileSync(generatedPath, 'utf8');
const expected = `export const BUILD_MODES: string[] = ${JSON.stringify(modes)};`;
if (!generated.includes(expected)) {
  console.error(`[prepare-edition] 生成表与档位不一致，期望: ${expected}`);
  process.exit(1);
}

console.log(`[prepare-edition] ${edition}: 模式 ${modes.join(', ')}；插件 ${plugins.length} 个；前端裁剪表已就绪`);

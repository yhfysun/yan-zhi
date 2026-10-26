/**
 * 模式裁剪纯逻辑单测（node --test）。
 *
 * 这层错了的代价极高且不易发现：生成表多带一个模式 → 包体积/代码泄漏；
 * 少带一个 → 用户切过去白屏。所以规则（优先级、通配、排除）必须钉死。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  readCatalog,
  allModeKeys,
  parseModesArg,
  resolveModes,
  matchViewPattern,
  isExcludedView,
  collectPluginViewFiles,
  renderGenerated,
  buildManifest,
  MANIFEST_PATH,
} = require('../../../scripts/lib/mode-build.cjs');

const catalog = readCatalog();

test('清单包含全部模式且顺序稳定', () => {
  assert.deepEqual(allModeKeys(catalog), ['office', 'dev', 'ops', 'sec', 'wf', 'clip', 'shop']);
});

test('resolveModes：显式模式优先于档位预设', () => {
  assert.deepEqual(resolveModes({ catalog, modes: ['dev', 'office'] }), ['office', 'dev']);
  assert.deepEqual(resolveModes({ catalog, edition: 'lite' }), ['office']);
  assert.deepEqual(resolveModes({ catalog, edition: 'basic' }), ['office', 'dev', 'wf']);
});

test('resolveModes：未知模式 / 空集合必须报错（不能静默回落到全量）', () => {
  assert.throws(() => resolveModes({ catalog, modes: ['nope'] }), /未知模式/);
  assert.throws(() => resolveModes({ catalog, modes: [] }), /至少选一个模式/);
});

test('parseModesArg：逗号/空格/去重', () => {
  assert.deepEqual(parseModesArg('office, dev'), ['office', 'dev']);
  assert.deepEqual(parseModesArg('office dev office'), ['office', 'dev']);
  assert.equal(parseModesArg('   '), null);
});

test('通配：精确路径与目录 **', () => {
  assert.equal(matchViewPattern('views/plugin/shop/**', 'views/plugin/shop/tabs/ShopAudit.vue'), true);
  assert.equal(matchViewPattern('views/plugin/shop/**', 'views/plugin/ShopConsole.vue'), false);
  assert.equal(matchViewPattern('views/ClipWorkbench.vue', 'views/ClipWorkbench.vue'), true);
});

test('未选模式的专属视图会被排除，选中模式的不受影响', () => {
  const modes = ['office', 'dev'];
  assert.equal(isExcludedView(catalog, modes, 'views/plugin/OpsConsole.vue'), true);
  assert.equal(isExcludedView(catalog, modes, 'views/plugin/shop/tabs/ShopOrders.vue'), true);
  assert.equal(isExcludedView(catalog, modes, 'views/CodeWorkbench.vue'), false);
  // 非模式插件的视图不属于任何模式 → 永远保留
  assert.equal(isExcludedView(catalog, modes, 'views/plugin/GitExplorer.vue'), false);
});

test('生成表只含选中模式的 import；未选模式字样不出现', () => {
  const modes = ['office', 'dev'];
  const pluginViews = collectPluginViewFiles(fs, path.resolve(__dirname, '..', '..', '..', 'packages', 'ui', 'src'));
  const out = renderGenerated({ catalog, modes, pluginViews });
  assert.match(out, /BUILD_MODES: string\[\] = \["office","dev"\]/);
  assert.match(out, /import\('\.\.\/views\/CodeWorkbench\.vue'\)/);
  assert.doesNotMatch(out, /OpsConsole\.vue/);
  assert.doesNotMatch(out, /ShopConsole\.vue/);
  assert.doesNotMatch(out, /ClipWorkbench\.vue/);
  // 非模式插件仍然保留（否则插件管理页会静默失效）
  assert.match(out, /GitExplorer\.vue/);
});

test('P5：未选插件的视图不进生成表（插件选择集裁剪，chunk 随之消失）', () => {
  const uiSrc = path.resolve(__dirname, '..', '..', '..', 'packages', 'ui', 'src');
  const pluginViews = collectPluginViewFiles(fs, uiSrc, {
    catalog,
    modes: ['office', 'dev'],
    excludedPluginViews: ['views/plugin/GitExplorer.vue', 'views/plugin/GitSettings.vue'],
  });
  const out = renderGenerated({ catalog, modes: ['office', 'dev'], pluginViews });
  assert.doesNotMatch(out, /GitExplorer\.vue/);
  assert.doesNotMatch(out, /GitSettings\.vue/);
  assert.match(out, /CodeWorkbench\.vue/); // 选中模式的入口视图照旧
});

test('构建清单记录排除项与标记串', () => {
  const manifest = buildManifest({ catalog, modes: ['office', 'dev'], edition: 'basic', now: new Date('2026-10-23T03:00:00Z') });
  assert.deepEqual(manifest.modes, ['office', 'dev']);
  assert.deepEqual(manifest.excludedModes, ['ops', 'sec', 'wf', 'clip', 'shop']);
  assert.ok(manifest.markers.includes('OpsConsole'));
  assert.ok(manifest.markers.includes('ClipWorkbench'));
  assert.equal(manifest.createdAt, '2026-10-23T03:00:00.000Z');
  assert.ok(path.isAbsolute(MANIFEST_PATH));
});

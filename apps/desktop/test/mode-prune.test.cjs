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
  // learning 已插件化，但仍是清单末位的模式
  assert.deepEqual(allModeKeys(catalog), ['office', 'dev', 'ops', 'sec', 'wf', 'clip', 'shop', 'learning']);
});

test('resolveModes：显式模式优先于档位预设', () => {
  assert.deepEqual(resolveModes({ catalog, modes: ['dev', 'office'] }), ['office', 'dev']);
  assert.deepEqual(resolveModes({ catalog, edition: 'lite' }), ['office']);
  assert.deepEqual(resolveModes({ catalog, edition: 'basic' }), ['office', 'dev', 'wf']);
  assert.deepEqual(resolveModes({ catalog, edition: 'pro' }), ['office', 'dev', 'ops', 'sec', 'wf', 'clip', 'shop', 'learning']);
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

test('外壳视图（RemoteControlHost / /remote）随插件选择集裁剪', () => {
  // 全量/未裁剪：外壳段存在（App.vue 与 router 从这里取组件）
  const all = renderGenerated({ catalog, modes: ['office'], pluginViews: [], pluginSelectionIds: null });
  assert.match(all, /"remote-control": \{/);
  assert.match(all, /RemoteControlHost\.vue/);
  assert.match(all, /views\/RemoteControl\.vue/);

  // 未选 remote-control：整段为空，源码里不存在任何 RemoteControl 引用 → Rollup 不产出 chunk
  const trim = renderGenerated({
    catalog,
    modes: ['office'],
    pluginViews: [],
    pluginSelectionIds: ['office-core'],
  });
  assert.doesNotMatch(trim, /RemoteControl/);
  assert.match(trim, /SHELL_VIEW_LOADERS/);
});

test('构建清单记录排除项与标记串', () => {
  const manifest = buildManifest({ catalog, modes: ['office', 'dev'], edition: 'basic', now: new Date('2026-10-23T03:00:00Z') });
  assert.deepEqual(manifest.modes, ['office', 'dev']);
  assert.deepEqual(manifest.excludedModes, ['ops', 'sec', 'wf', 'clip', 'shop', 'learning']);
  assert.ok(manifest.markers.includes('OpsConsole'));
  assert.ok(manifest.markers.includes('ClipWorkbench'));
  assert.ok(manifest.markers.includes('Learning')); // learning 是内置模式，排除时带自己的视图标记
  assert.equal(manifest.createdAt, '2026-10-23T03:00:00.000Z');
  assert.ok(path.isAbsolute(MANIFEST_PATH));
});

test('Learning 是插件贡献路由，共享路由表不能写死页面 import', () => {
  const uiSrc = path.resolve(__dirname, '..', '..', '..', 'packages', 'ui', 'src');
  const routerSrc = fs.readFileSync(path.join(uiSrc, 'router', 'index.ts'), 'utf8');
  assert.doesNotMatch(routerSrc, /import\(['"]\.\.\/views\/Learning\.vue['"]\)/);

  const pluginSrc = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'apps', 'server', 'src', 'plugins', 'learning-mode.ts'),
    'utf8',
  );
  assert.match(pluginSrc, /component:\s*['"]views\/Learning\.vue['"]/);
  assert.match(pluginSrc, /key:\s*['"]learning['"]/);

  const home = fs.readFileSync(path.join(uiSrc, 'views', 'Home.vue'), 'utf8');
  assert.match(home, /isModeAvailable\(['"]learning['"]\)/, 'Home.vue 必须按构建/授权状态过滤学习入口');

  const topbar = fs.readFileSync(path.join(uiSrc, 'components', 'WebTopBar.vue'), 'utf8');
  assert.match(topbar, /<ModeSwitcher/, 'WebTopBar.vue 必须通过 ModeSwitcher 渲染授权模式');
  const switcher = fs.readFileSync(path.join(uiSrc, 'components', 'workbench', 'ModeSwitcher.vue'), 'utf8');
  assert.match(switcher, /visibleModeDefs/, 'ModeSwitcher.vue 必须只遍历可见模式');
});

test('单档构建必须先按 edition 生成模式表，再执行 vite build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  for (const [scriptName, edition] of [
    ['electron:build', 'basic'],
    ['electron:build:lite', 'lite'],
    ['electron:build:basic', 'basic'],
    ['electron:build:pro', 'pro'],
    ['electron:build:mac', 'basic'],
  ]) {
    const cmd = String(pkg.scripts?.[scriptName] || '');
    const prepare = cmd.indexOf(`prepare-edition-build.cjs ${edition}`);
    const vite = cmd.indexOf('vite build');
    const verify = cmd.indexOf('verify-mode-prune.cjs');
    assert.ok(prepare >= 0, `${scriptName} 必须调用 prepare-edition-build.cjs ${edition}`);
    assert.ok(vite >= 0, `${scriptName} 必须执行 vite build`);
    assert.ok(verify > vite, `${scriptName} 必须在 vite build 后执行 verify-mode-prune.cjs`);
    assert.ok(prepare < vite, `${scriptName} 的档位模式表生成必须在 vite build 之前`);
  }
});

test('prepare-edition-build 会同时校验 edition.json 与生成表一致', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'prepare-edition-build.cjs'), 'utf8');
  assert.match(src, /set-edition\.cjs/);
  assert.match(src, /select-modes\.cjs/);
  assert.match(src, /expected = `export const BUILD_MODES/);
  assert.match(src, /generated\.includes\(expected\)/);
});

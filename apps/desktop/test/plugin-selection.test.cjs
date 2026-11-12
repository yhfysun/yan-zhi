// 打包可选插件：选择集解析守门（P5）。
//
// 错了的代价是「包名说精简、内容是全量/缺件」：漏了 requires 会打出缺插件的包，
// 静默忽略未知 id 会让人以为选上了，office 被裁掉则直接没有办公模式。
const { test } = require('node:test');
const assert = require('node:assert');

const { resolvePluginSelection } = require('../../../scripts/lib/plugin-selection.cjs');
const {
  loadCatalog,
  loadModesCatalog,
  unionPresets,
  resolveBuildModes,
} = require('../scripts/lib/plugin-build-selection.cjs');

/** 与 build/plugins.catalog.json 同构的最小清单（带 requires / core / modeKey） */
const catalog = {
  plugins: {
    'office-core': { kind: 'mode', core: true, modeKey: 'office' },
    'dev-mode': { kind: 'mode', modeKey: 'dev' },
    'ops-shell': { kind: 'mode', modeKey: 'ops', requires: ['cicd-pipeline', 'java-suite'] },
    'sec-lab': { kind: 'mode', modeKey: 'sec' },
    'cicd-pipeline': { kind: 'feature' },
    'java-suite': { kind: 'feature' },
    'git-explorer': { kind: 'feature' },
    skins: { kind: 'resource' },
  },
  editionPresets: {
    lite: ['office-core', 'skins', 'git-explorer'],
    pro: ['office-core', 'skins', 'git-explorer', 'dev-mode', 'ops-shell', 'cicd-pipeline', 'java-suite', 'sec-lab'],
  },
};

const ids = (r) => r.ids;

test('显式 id + requires 闭包 + office 锁定', () => {
  const r = resolvePluginSelection({ catalog, plugins: 'ops-shell' });
  assert.deepEqual(ids(r), ['office-core', 'ops-shell', 'cicd-pipeline', 'java-suite']);
  assert.ok(r.excluded.includes('dev-mode'));
  assert.equal(r.source, 'plugins');
});

test('分组关键字：mode / feature / skins / all', () => {
  assert.deepEqual(ids(resolvePluginSelection({ catalog, plugins: 'mode' })), [
    'office-core', 'dev-mode', 'ops-shell', 'sec-lab', 'cicd-pipeline', 'java-suite',
  ]);
  assert.deepEqual(ids(resolvePluginSelection({ catalog, plugins: 'skins' })), ['office-core', 'skins']);
  assert.equal(ids(resolvePluginSelection({ catalog, plugins: 'all' })).length, 8);
});

test('--modes 兼容映射到插件（office 映射到 office-core）', () => {
  const r = resolvePluginSelection({ catalog, modes: ['office', 'dev'] });
  assert.deepEqual(ids(r), ['office-core', 'dev-mode']);
  assert.equal(r.source, 'modes');
  assert.throws(() => resolvePluginSelection({ catalog, modes: ['nope'] }), /未知模式/);
});

test('省略选择 = 全量；档位并集只含预设内的插件', () => {
  assert.equal(ids(resolvePluginSelection({ catalog })).length, 8);
  const lite = resolvePluginSelection({ catalog, editions: ['lite'] });
  assert.deepEqual(ids(lite), ['office-core', 'git-explorer', 'skins']); // 顺序按 catalog（与构建顺序一致）
  const merged = resolvePluginSelection({ catalog, editions: ['lite', 'pro'] });
  assert.ok(ids(merged).includes('ops-shell') && ids(merged).includes('java-suite'));
});

test('未知 id / 未知分组 / 空分组一律报错（不静默忽略）', () => {
  assert.throws(() => resolvePluginSelection({ catalog, plugins: 'nope' }), /未知插件/);
  assert.throws(() => resolvePluginSelection({ catalog, plugins: 'weird' }), /未知插件/);
});

test('office 永远在（即使用户只选一个功能插件）', () => {
  const r = resolvePluginSelection({ catalog, plugins: 'git-explorer' });
  assert.ok(ids(r).includes('office-core'));
});

test('--plugins=none 只留基座 office-core', () => {
  const r = resolvePluginSelection({ catalog, plugins: 'none' });
  assert.deepEqual(ids(r), ['office-core']);
  assert.equal(r.source, 'plugins');
  assert.ok(r.excluded.includes('skins'));
  assert.ok(!r.excluded.includes('office-core'));
});

test('none 不能与其他选择并列（自相矛盾）', () => {
  assert.throws(() => resolvePluginSelection({ catalog, plugins: 'none,skins' }), /none 不能与其他插件同时使用/);
});

test('可选插件：点名才带，默认 / all / 档位预设都不含它', () => {
  const optional = [{ id: 'desktop-manager', label: '桌面管理', kind: 'optional' }];

  const picked = resolvePluginSelection({ catalog, optional, plugins: 'desktop-manager' });
  assert.ok(picked.ids.includes('office-core'));
  assert.equal(picked.ids[picked.ids.length - 1], 'desktop-manager'); // catalog 顺序在前，可选插件在后

  assert.ok(!ids(resolvePluginSelection({ catalog, optional, plugins: 'all' })).includes('desktop-manager'));
  assert.ok(!ids(resolvePluginSelection({ catalog, optional })).includes('desktop-manager'));
  assert.ok(!ids(resolvePluginSelection({ catalog, optional, editions: ['lite'] })).includes('desktop-manager'));
  assert.ok(!ids(resolvePluginSelection({ catalog, optional, modes: ['office'] })).includes('desktop-manager'));

  // 未选的可选插件要进 excluded —— 否则 builtin 里的旧副本永远不会被 prune 掉
  assert.ok(resolvePluginSelection({ catalog, optional, plugins: 'office-core' }).excluded.includes('desktop-manager'));
  // 可选插件不参与分组关键字，写错名字必须报错而不是静默忽略
  assert.throws(() => resolvePluginSelection({ catalog, optional, plugins: 'desktop' }), /未知插件/);
});

test('learning 是 Pro 档插件模式，基础档不会漏带或误带', () => {
  const pluginsCatalog = loadCatalog();
  const modesCatalog = loadModesCatalog();
  const modesFor = (edition) => resolveBuildModes({
    pluginsCatalog,
    pluginIds: unionPresets(pluginsCatalog, [edition]),
    editions: [edition],
    modesCatalog,
  });

  assert.deepEqual(modesFor('lite'), ['office']);
  assert.deepEqual(modesFor('basic'), ['office', 'dev', 'wf']);
  assert.deepEqual(modesFor('pro'), Object.keys(modesCatalog.modes));
  assert.ok(modesFor('pro').includes('learning'));
  assert.equal(modesCatalog.modes.learning.pluginId, 'learning-mode');
  assert.ok(!unionPresets(pluginsCatalog, ['basic']).includes('learning-mode'));
  assert.ok(unionPresets(pluginsCatalog, ['pro']).includes('learning-mode'));
});

test('新增模式默认插件化且仅进 Pro；基础档旧模式必须显式保留', () => {
  const pluginsCatalog = loadCatalog();
  const modesCatalog = loadModesCatalog();
  const legacyBasicModes = new Set(['dev-mode', 'wf-mode']);
  const basic = new Set(pluginsCatalog.editionPresets.basic);
  const lite = new Set(pluginsCatalog.editionPresets.lite);
  const pro = new Set(pluginsCatalog.editionPresets.pro);

  for (const [modeKey, mode] of Object.entries(modesCatalog.modes)) {
    if (modeKey === 'office') continue;
    assert.ok(mode.pluginId, `${modeKey} 必须由插件贡献，不能新增裸模式`);
    const plugin = pluginsCatalog.plugins[mode.pluginId];
    assert.ok(plugin, `${modeKey} 指向不存在的插件 ${mode.pluginId}`);
    assert.equal(plugin.kind, 'mode', `${mode.pluginId} 必须声明 kind=mode`);
    assert.equal(plugin.modeKey, modeKey, `${mode.pluginId} 与 ${modeKey} 的 modeKey 不一致`);
    assert.ok(pro.has(mode.pluginId), `${mode.pluginId} 必须默认进入 Pro 档`);
    if (!legacyBasicModes.has(mode.pluginId)) {
      assert.ok(!basic.has(mode.pluginId), `${mode.pluginId} 默认只能进 Pro；要下放基础档必须显式改白名单`);
      assert.ok(!lite.has(mode.pluginId), `${mode.pluginId} 不能默认进入 Lite 档`);
    }
  }
});

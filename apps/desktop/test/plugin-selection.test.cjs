// 打包可选插件：选择集解析守门（P5）。
//
// 错了的代价是「包名说精简、内容是全量/缺件」：漏了 requires 会打出缺插件的包，
// 静默忽略未知 id 会让人以为选上了，office 被裁掉则直接没有办公模式。
const { test } = require('node:test');
const assert = require('node:assert');

const { resolvePluginSelection } = require('../../../scripts/lib/plugin-selection.cjs');

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

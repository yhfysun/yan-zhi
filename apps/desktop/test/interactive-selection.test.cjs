// 交互勾选 → 构建选择集 的判定守门。
//
// 终端键位路径跑不进单测，但"默认=预设 / 只勾基座=不带 / 与预设一致=不额外裁剪"
// 这些判定一旦错，打出的包和用户勾的完全不是一回事 —— 必须钉死。
const { test } = require('node:test');
const assert = require('node:assert');

const { NONE_ROW_ID, exclusiveWithNone, decidePlugins, decidePets } = require('../../../scripts/lib/interactive-selection.cjs');

const catalog = {
  plugins: {
    'office-core': { kind: 'mode', core: true },
    'dev-mode': { kind: 'mode' },
    skins: { kind: 'resource' },
    'git-explorer': { kind: 'feature' },
  },
  editionPresets: {
    lite: ['office-core', 'skins', 'git-explorer'],
    pro: ['office-core', 'skins', 'git-explorer', 'dev-mode'],
  },
};

const petCatalog = {
  packs: [
    { id: 'boba', label: 'Boba' },
    { id: 'tiko', label: 'Tiko' },
  ],
  vrms: [{ id: 'shino', label: 'Shino' }],
};

test('插件：Esc / 未确认 = 按档位预设', () => {
  assert.deepEqual(decidePlugins({ catalog, picked: null }), { kind: 'preset' });
});

test('插件：默认一个都不勾 = 只留基座（所有插件不内置）', () => {
  assert.deepEqual(decidePlugins({ catalog, picked: ['office-core'] }), { kind: 'none' });
});

test('插件：勾了具体插件 = 显式选择集（与档位预设无关，不降级成按档裁剪）', () => {
  // 即使勾得和 lite 预设一模一样，也必须按"这一份并集"给所有档用
  const picked = ['office-core', 'skins', 'git-explorer'];
  const d = decidePlugins({ catalog, picked });
  assert.equal(d.kind, 'explicit');
  assert.deepEqual(d.ids, picked);
});

test('插件：勾「不带」= none（保留行兼容）', () => {
  assert.deepEqual(decidePlugins({ catalog, picked: ['office-core', NONE_ROW_ID] }), { kind: 'none' });
});

test('宠物：默认全勾 = all；勾「不带」或空 = none；子集 = 显式', () => {
  assert.deepEqual(decidePets({ catalog: petCatalog, picked: null }), { kind: 'all' });
  assert.deepEqual(decidePets({ catalog: petCatalog, picked: ['boba', 'tiko', 'shino'] }), { kind: 'all' });
  assert.deepEqual(decidePets({ catalog: petCatalog, picked: [NONE_ROW_ID] }), { kind: 'none' });
  assert.deepEqual(decidePets({ catalog: petCatalog, picked: ['boba'] }), { kind: 'explicit', ids: ['boba'] });
});

test('「不带」与具体条目互斥，且不动 locked 项（office-core 恒在）', () => {
  const items = [
    { id: 'office-core', checked: true, locked: true },
    { id: NONE_ROW_ID, checked: true },
    { id: 'skins', checked: false },
  ];
  // 勾「不带」→ 其它全清，基座仍勾
  items[1].checked = true;
  exclusiveWithNone(items, 1);
  assert.deepEqual(items.map((i) => i.checked), [true, true, false]);

  // 勾具体插件 → 「不带」自动取消
  items[2].checked = true;
  exclusiveWithNone(items, 2);
  assert.deepEqual(items.map((i) => i.checked), [true, false, true]);
});

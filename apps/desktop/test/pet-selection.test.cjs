// 宠物选择集（--pets）守门：与插件维度正交，规则同构（all/none/点名 + 未知即报错）。
//
// 错了的代价：包名说"不带宠物"却仍随包 9.8MB 精灵图 / 33MB VRM，
// 或者点名了却因为拼错 id 静默没带上（用户装完发现设置页空的）。
const { test } = require('node:test');
const assert = require('node:assert');

const { resolvePetSelection, petEntries } = require('../../../scripts/lib/pet-selection.cjs');

const catalog = {
  packs: [
    { id: 'boba', label: 'Boba', file: 'boba-spritesheet.webp' },
    { id: 'tiko', label: 'Tiko', file: 'tiko-spritesheet.webp' },
  ],
  vrms: [{ id: 'shino', label: 'Shino', file: 'sendagaya_shino.vrm' }],
};

test('不传 = 全量（2D + 3D）', () => {
  const r = resolvePetSelection({ catalog });
  assert.deepEqual(r.ids, ['boba', 'tiko', 'shino']);
  assert.equal(r.source, 'all');
  assert.deepEqual(r.excluded, []);
});

test('none = 一个都不带，且全部记进 excluded', () => {
  const r = resolvePetSelection({ catalog, pets: 'none' });
  assert.deepEqual(r.ids, []);
  assert.deepEqual(r.excluded, ['boba', 'tiko', 'shino']);
  assert.equal(r.source, 'pets');
});

test('点名：2D 与 3D 可以混选，顺序按 catalog', () => {
  const r = resolvePetSelection({ catalog, pets: 'shino,boba' });
  assert.deepEqual(r.ids, ['boba', 'shino']);
  assert.deepEqual(r.packs.map((p) => p.id), ['boba']);
  assert.deepEqual(r.vrms.map((v) => v.id), ['shino']);
  assert.deepEqual(r.excluded, ['tiko']);
});

test('未知宠物 / none 混选 一律报错（不静默忽略）', () => {
  assert.throws(() => resolvePetSelection({ catalog, pets: 'dragon' }), /未知宠物/);
  assert.throws(() => resolvePetSelection({ catalog, pets: 'none,boba' }), /none 不能/);
});

test('petEntries 标注 2d/3d', () => {
  assert.deepEqual(
    petEntries(catalog).map((e) => [e.id, e.kind]),
    [
      ['boba', '2d'],
      ['tiko', '2d'],
      ['shino', '3d'],
    ],
  );
});

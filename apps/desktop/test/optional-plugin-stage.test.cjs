// 可选插件进包链路：拷贝 / 清旧副本 / 打完清理。
//
// 错了的代价（两种都很难自查）：没拷 → 选了 desktop-manager 的包其实没有它；
// 没清 → 未选的旧副本留在 builtin，会被 extraResources 原样打进"没选它"的包。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { stageOptionalPlugins, removeStagedOptional } = require('../scripts/lib/optional-plugin-stage.cjs');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yz-opt-stage-'));
}

function makeOptional(base, id) {
  const dir = path.join(base, 'plugins', 'optional', id);
  fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ id, name: id }));
  fs.writeFileSync(path.join(dir, 'backend', 'index.js'), 'export const x = 1;\n');
  return { id, dir, relDir: `plugins/optional/${id}` };
}

test('选中则原样拷进 builtin，未选则清掉旧副本', () => {
  const base = tmpDir();
  const root = path.join(base, 'plugins', 'builtin');
  const keep = makeOptional(base, 'keep-me');
  const drop = makeOptional(base, 'drop-me');
  // builtin 里先放一份"上次打包残留"的 drop-me
  fs.mkdirSync(path.join(root, 'drop-me'), { recursive: true });
  fs.writeFileSync(path.join(root, 'drop-me', 'manifest.json'), '{"id":"drop-me"}');

  const r = stageOptionalPlugins({ root, optional: [keep, drop], selected: ['office-core', 'keep-me'] });

  assert.deepEqual(r.copied, ['keep-me']);
  assert.deepEqual(r.removed, ['drop-me']);
  assert.ok(fs.existsSync(path.join(root, 'keep-me', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(root, 'keep-me', 'backend', 'index.js')));
  assert.ok(!fs.existsSync(path.join(root, 'drop-me')));
});

test('removeStagedOptional 把临时副本删干净（不碰别的目录）', () => {
  const base = tmpDir();
  const root = path.join(base, 'plugins', 'builtin');
  const opt = makeOptional(base, 'clean-me');
  fs.mkdirSync(path.join(root, 'skins'), { recursive: true });
  stageOptionalPlugins({ root, optional: [opt], selected: ['clean-me'] });
  assert.ok(fs.existsSync(path.join(root, 'clean-me')));

  const removed = removeStagedOptional({ root, ids: ['clean-me'] });
  assert.deepEqual(removed, ['clean-me']);
  assert.ok(!fs.existsSync(path.join(root, 'clean-me')));
  assert.ok(fs.existsSync(path.join(root, 'skins')), '非可选插件目录不应被执行清理波及');
});

test('源码目录缺失时明确报错（不打出缺件包）', () => {
  const base = tmpDir();
  const root = path.join(base, 'plugins', 'builtin');
  assert.throws(
    () => stageOptionalPlugins({ root, optional: [{ id: 'ghost', dir: path.join(base, 'nope') }], selected: ['ghost'] }),
    /源码目录缺失/,
  );
});

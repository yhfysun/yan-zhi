/**
 * .yzp 单包打包纯逻辑单测（node --test）。
 *
 * 钉住三件容易出错、错了却不易发现的事：
 *   ① 分发产物与内置产物同源 —— 目录名与 manifest.id 必须一致（多清单包例外）；
 *   ② 暂存残留（.yz-tmp / __frontend-entry-*）绝不能被 zip 进 .yzp；
 *   ③ 文件清单稳定有序、manifest.json 排在 zip 首位（便于人工查看/工具嗅探）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isExcludedPath,
  collectPluginFiles,
  inspectManifest,
  preparePluginPackage,
  archiveName,
  sortForArchive,
} = require('../../../scripts/lib/package-plugin.cjs');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFixture(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

test('排除规则：构建暂存/裁剪暂存/依赖/垃圾文件', () => {
  const excluded = [
    '.yz-tmp/__frontend-entry-abc.mjs',
    'backend/.yz-tmp/x.js',
    '.prune-hold/x/manifest.json',
    'node_modules/foo/index.js',
    '.git/config',
    '__frontend-entry-clip-mode.mjs',
    '.DS_Store',
    'assets/Thumbs.db',
  ];
  for (const p of excluded) assert.equal(isExcludedPath(p), true, `应排除: ${p}`);

  const kept = [
    'manifest.json',
    'backend/index.js',
    'frontend/index.mjs',
    'frontend/index.css',
    'assets/wallpaper.webp',
    'assets/plugin-assets/skins/a.webp',
  ];
  for (const p of kept) assert.equal(isExcludedPath(p), false, `不应排除: ${p}`);
});

test('文件清单：递归、排除残留、按路径稳定排序', () => {
  const dir = tmpDir('yzp-files-');
  writeFixture(dir, {
    'manifest.json': '{"id":"demo","name":"示例","version":"0.1.0"}',
    'backend/index.js': 'console.log(1)',
    'frontend/index.mjs': 'export default 1',
    'frontend/index.css': '.a{}',
    'assets/b.webp': 'x',
    'assets/a.webp': 'xx',
    '.yz-tmp/tmp.mjs': 'junk',
    '__frontend-entry-demo.mjs': 'junk',
  });

  const files = collectPluginFiles(dir);
  const paths = files.map((f) => f.path);
  assert.deepEqual(
    paths,
    [
      'manifest.json',
      'assets/a.webp',
      'assets/b.webp',
      'backend/index.js',
      'frontend/index.css',
      'frontend/index.mjs',
    ],
    '根文件在前，子目录按字典序',
  );
  assert.equal(paths.includes('.yz-tmp/tmp.mjs'), false);
  const a = files.find((f) => f.path === 'assets/a.webp');
  const b = files.find((f) => f.path === 'assets/b.webp');
  assert.equal(a.size, 2);
  assert.equal(b.size, 1);
});

test('清单校验：单清单 id 必须与目录一致', () => {
  const ok = inspectManifest({ id: 'demo', name: 'x', version: '1.2.3' }, 'demo');
  assert.equal(ok.kind, 'single');
  assert.equal(ok.version, '1.2.3');

  assert.throws(() => inspectManifest({ id: 'other', name: 'x', version: '1.0.0' }, 'demo'), /不一致/);
  assert.throws(() => inspectManifest({ name: 'x', version: '1.0.0' }, 'demo'), /缺少 id/);
  assert.throws(() => inspectManifest({ id: 'demo', name: 'x' }, 'demo'), /缺少 version/);
  assert.throws(() => inspectManifest('nope', 'demo'), /必须是对象/);
});

test('清单校验：旧数组形态与多清单包装都接受', () => {
  const arr = inspectManifest([{ id: 'skin-a', version: '1.0.0' }, { id: 'skin-b', version: '1.0.0' }], 'skins');
  assert.equal(arr.kind, 'multi');
  assert.deepEqual(arr.ids, ['skin-a', 'skin-b']);
  assert.equal(arr.version, '1.0.0');

  const wrap = inspectManifest(
    { multi: true, count: 1, manifests: [{ id: 'skin-a', version: '2.0.0' }] },
    'skins',
  );
  assert.equal(wrap.kind, 'multi');
  assert.deepEqual(wrap.ids, ['skin-a']);
  assert.equal(wrap.version, '2.0.0');

  assert.throws(() => inspectManifest([], 'skins'), /没有清单条目/);
  assert.throws(() => inspectManifest([{ name: 'x', version: '1.0.0' }], 'skins'), /缺少 id/);
});

test('preparePluginPackage：缺目录/缺 manifest/坏 JSON 都是可读报错', () => {
  const missing = path.join(tmpDir('yzp-missing-'), 'demo');
  assert.throws(() => preparePluginPackage({ pluginDir: missing, id: 'demo' }), /插件目录不存在/);

  const noManifest = tmpDir('yzp-nomani-');
  assert.throws(() => preparePluginPackage({ pluginDir: noManifest, id: 'x' }), /缺少 manifest.json/);

  const badJson = tmpDir('yzp-badjson-');
  fs.writeFileSync(path.join(badJson, 'manifest.json'), '{oops');
  assert.throws(() => preparePluginPackage({ pluginDir: badJson, id: 'x' }), /不是合法 JSON/);
});

test('preparePluginPackage：happy path 汇总版本/文件/字节数', () => {
  const dir = tmpDir('yzp-ok-');
  writeFixture(dir, {
    'manifest.json': '{"id":"demo","name":"示例","version":"0.1.0"}',
    'backend/index.js': 'abc',
    'frontend/index.mjs': 'defg',
    '.yz-tmp/leftover.mjs': 'zzz',
  });
  const pkg = preparePluginPackage({ pluginDir: dir, id: 'demo' });
  assert.equal(pkg.id, 'demo');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.kind, 'single');
  assert.deepEqual(pkg.files.map((f) => f.path), ['manifest.json', 'backend/index.js', 'frontend/index.mjs']);
  const expectedBytes = ['manifest.json', 'backend/index.js', 'frontend/index.mjs']
    .reduce((sum, rel) => sum + fs.statSync(path.join(dir, rel)).size, 0);
  assert.equal(pkg.totalBytes, expectedBytes, '暂存残留不计入字节数');
});

test('产物命名与 zip 顺序：manifest.json 永远排第一', () => {
  assert.equal(archiveName('git-explorer', '1.0.0'), 'git-explorer-1.0.0.yzp');
  const sorted = sortForArchive([
    { path: 'frontend/index.mjs', size: 1 },
    { path: 'manifest.json', size: 1 },
    { path: 'backend/index.js', size: 1 },
  ]);
  assert.deepEqual(sorted.map((f) => f.path), ['manifest.json', 'backend/index.js', 'frontend/index.mjs']);
});

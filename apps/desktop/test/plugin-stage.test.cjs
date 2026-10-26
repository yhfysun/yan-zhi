// 内置插件目录暂存（prune/restore/verify）与产物泄漏扫描守门（P5）。
//
// 错了的代价：未选插件的旧目录被打进"精简包"（名字说精简、内容是全量），
// 或者 prune 把选中插件/未知目录一起移走（包里缺件、别人的目录被吞）。
// 全部用临时目录验证，不碰仓库里的 plugins/builtin。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  prunePlugins,
  restoreHeld,
  verifyStaged,
  pluginMarkers,
  scanProductForLeaks,
  holdDirFor,
  OFFICE_ID,
} = require('../scripts/lib/plugin-stage.cjs');

const ALL_IDS = [OFFICE_ID, 'dev-mode', 'ops-shell', 'skins'];

/** 临时插件根：<tmp>/plugins/builtin + 同级 .prune-hold */
function makeRoot(dirs = ALL_IDS) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-plugin-stage-'));
  const root = path.join(base, 'plugins', 'builtin');
  fs.mkdirSync(root, { recursive: true });
  for (const id of dirs) {
    fs.mkdirSync(path.join(root, id), { recursive: true });
    fs.writeFileSync(path.join(root, id, 'manifest.json'), JSON.stringify({ id }));
  }
  return { base, root, hold: holdDirFor(root), cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}

test('prune：只移未选且清单已知的目录，office-core 与未知目录不动', () => {
  const t = makeRoot([...ALL_IDS, 'someone-elses-dir']);
  try {
    const r = prunePlugins({ root: t.root, allIds: ALL_IDS, selected: [OFFICE_ID, 'dev-mode'] });
    assert.deepEqual(r.moved, ['ops-shell', 'skins']);
    assert.ok(fs.existsSync(path.join(t.root, OFFICE_ID)), 'office-core 即使未选也必须留下');
    assert.ok(fs.existsSync(path.join(t.root, 'someone-elses-dir')), '未知目录不许被吞');
    assert.ok(fs.existsSync(path.join(t.hold, 'ops-shell')), '未选目录应移入暂存区');
    assert.ok(!fs.existsSync(path.join(t.root, 'ops-shell')));
  } finally {
    t.cleanup();
  }
});

test('prune：先恢复上次崩溃残留，再按本次选择重新移出', () => {
  const t = makeRoot([OFFICE_ID]);
  try {
    // 模拟上次崩溃：ops-shell 在暂存区、builtin 里只有 office-core
    fs.mkdirSync(path.join(t.hold, 'ops-shell'), { recursive: true });
    fs.writeFileSync(path.join(t.hold, 'ops-shell', 'manifest.json'), '{"id":"ops-shell"}');
    const logs = [];
    const r = prunePlugins({ root: t.root, allIds: ALL_IDS, selected: [OFFICE_ID, 'dev-mode'], log: (m) => logs.push(m) });
    assert.deepEqual(r.restored, ['ops-shell']);
    assert.deepEqual(r.moved, ['ops-shell']); // 恢复后又按本次选择移出
    assert.ok(logs.some((m) => m.startsWith('restore ops-shell')));
    assert.ok(!fs.existsSync(path.join(t.root, 'ops-shell')));
  } finally {
    t.cleanup();
  }
});

test('restore：全部移回；目标已存在时丢弃过期暂存副本', () => {
  const t = makeRoot(ALL_IDS);
  try {
    prunePlugins({ root: t.root, allIds: ALL_IDS, selected: [OFFICE_ID] });
    assert.ok(fs.existsSync(path.join(t.hold, 'dev-mode')));

    // 目标已被重新构建（builtin 里又有 dev-mode）→ 暂存那份是旧产物，丢弃而不是覆盖新构建
    fs.mkdirSync(path.join(t.root, 'dev-mode'), { recursive: true });
    fs.writeFileSync(path.join(t.root, 'dev-mode', 'manifest.json'), '{"id":"dev-mode","new":true}');

    const r = restoreHeld({ root: t.root });
    assert.deepEqual(r.dropped, ['dev-mode']);
    assert.ok(r.restored.includes('ops-shell'));
    assert.ok(fs.existsSync(path.join(t.root, 'skins')), '其余暂存目录应移回');
    assert.ok(JSON.parse(fs.readFileSync(path.join(t.root, 'dev-mode', 'manifest.json'), 'utf8')).new, '新构建不被旧副本覆盖');
  } finally {
    t.cleanup();
  }
});

test('verify：未选残留与选中缺件都要报出来', () => {
  const t = makeRoot([OFFICE_ID, 'ops-shell']);
  try {
    fs.rmSync(path.join(t.root, 'skins'), { recursive: true, force: true }); // 选中但缺包
    const r = verifyStaged({ root: t.root, allIds: ALL_IDS, selected: [OFFICE_ID, 'dev-mode', 'skins'] });
    assert.equal(r.ok, false);
    assert.deepEqual(r.leaked, ['ops-shell']);
    assert.deepEqual(r.missing, ['dev-mode', 'skins']);
    // 补上 dev-mode/skins 并移走 ops-shell 后应通过
    makeManifest(t.root, 'dev-mode');
    makeManifest(t.root, 'skins');
    fs.rmSync(path.join(t.root, 'ops-shell'), { recursive: true, force: true });
    assert.equal(verifyStaged({ root: t.root, allIds: ALL_IDS, selected: [OFFICE_ID, 'dev-mode', 'skins'] }).ok, true);
  } finally {
    t.cleanup();
  }
});

function makeManifest(root, id) {
  fs.mkdirSync(path.join(root, id), { recursive: true });
  fs.writeFileSync(path.join(root, id, 'manifest.json'), JSON.stringify({ id }));
}

test('verify：office-core 不要求存在（基座无独立插件包）', () => {
  const t = makeRoot([]);
  try {
    makeManifest(t.root, 'skins');
    const r = verifyStaged({ root: t.root, allIds: ALL_IDS, selected: [OFFICE_ID, 'skins'] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.missing, []);
  } finally {
    t.cleanup();
  }
});

test('pluginMarkers：取视图组件名，跳过 glob 与过短串', () => {
  const catalog = {
    plugins: {
      'ops-shell': { frontendViews: ['views/plugin/OpsConsole.vue', 'views/plugin/opsSession.ts', 'components/ops/**'] },
      skins: { frontendViews: [] },
      abc: { frontendViews: ['a.vue'] },
    },
  };
  assert.deepEqual(pluginMarkers(catalog, 'ops-shell'), ['OpsConsole', 'opsSession']);
  assert.deepEqual(pluginMarkers(catalog, 'skins'), []);
  assert.deepEqual(pluginMarkers(catalog, 'abc'), []);
});

test('scanProductForLeaks：命中嵌套产物，忽略二进制与未选插件的空标记', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-plugin-leak-'));
  try {
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.mjs'), 'const x = "ClipWorkbench";');
    fs.writeFileSync(path.join(dir, 'assets', 'bg.webp'), 'ClipWorkbench'); // 非文本扩展不扫
    fs.writeFileSync(path.join(dir, 'plain.css'), 'body{}');
    const hits = scanProductForLeaks({
      dirs: [dir],
      markersByPlugin: { 'clip-mode': ['ClipWorkbench'], skins: ['skins'] },
      baseDir: dir,
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].file, 'index.mjs');
    assert.equal(hits[0].pluginId, 'clip-mode');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scanProductForLeaks：没有标记时零扫描零命中（全量构建快速短路）', () => {
  assert.deepEqual(scanProductForLeaks({ dirs: ['C:/definitely-not-exists'], markersByPlugin: {} }), []);
});

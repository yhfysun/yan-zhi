// 围栏后端路由测试（假 express app + 临时桌面目录）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { desktopManagerModule } from './index.js';

function makeCtx() {
  const store = new Map();
  let mount = null;
  const ctx = {
    storage: {
      get: async (k) => store.get(k),
      set: async (k, v) => { store.set(k, v); },
      delete: async (k) => { store.delete(k); },
    },
    registerTool: () => {},
    registerBackendRoute: (fn) => { mount = fn; },
    log: () => {},
  };
  return { ctx, getMount: () => mount, store };
}

function makeApp() {
  const routes = {};
  const def = (m) => (p, h) => { routes[m + ' ' + p] = h; };
  return {
    routes,
    app: { get: def('GET'), post: def('POST'), patch: def('PATCH'), put: def('PUT'), delete: def('DELETE') },
  };
}

function res() {
  const r = {
    code: 200,
    body: null,
    status(c) { r.code = c; return r; },
    json(d) { r.body = d; return r; },
  };
  return r;
}

async function setup() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'yz-fence-'));
  const prev = process.env.YZ_DESKTOP_DIR;
  process.env.YZ_DESKTOP_DIR = dir;
  const { ctx, getMount, store } = makeCtx();
  desktopManagerModule.activate(ctx);
  const { app, routes } = makeApp();
  getMount()(app);
  return {
    dir,
    routes,
    ctx,
    store,
    cleanup: async () => {
      if (prev === undefined) delete process.env.YZ_DESKTOP_DIR;
      else process.env.YZ_DESKTOP_DIR = prev;
      await fsp.rm(dir, { recursive: true, force: true });
    },
  };
}

test('GET /state：默认围栏 = 文件夹 + 按扩展名五栏 + 待归类；桌面只列顶层（文件夹不展开）', async () => {
  const { dir, routes, cleanup } = await setup();
  try {
    await fsp.mkdir(path.join(dir, '文档'), { recursive: true });
    await fsp.writeFile(path.join(dir, '文档', 'a.docx'), 'x');
    await fsp.writeFile(path.join(dir, 'b.png'), 'x');

    const r = res();
    await routes['GET /state']({}, r);
    assert.equal(r.code, 200);
    const { fences, items } = r.body.data;
    assert.deepEqual(
      fences.map((f) => f.label),
      ['文件夹', '文档', '表格', '图片', '安装包', '压缩包', '待归类'],
      '桌面有目录时：文件夹栏在最前，扩展名五栏随后，待归类压尾',
    );
    const fenceOf = (label) => fences.find((f) => f.label === label).id;

    // ★ 2026-10-29：桌面只列顶层 —— 文件夹算一个图标，内容不展开
    assert.deepEqual(items.map((i) => i.name).sort(), ['b.png', '文档']);
    assert.equal(items.find((i) => i.name === '文档').fenceId, fenceOf('文件夹'));
    assert.equal(items.find((i) => i.name === 'b.png').fenceId, fenceOf('图片'), 'png 默认进「图片」栏');
    assert.ok(!items.some((i) => i.name === 'a.docx'), '文件夹里的文件不应出现在桌面列表里');
  } finally {
    await cleanup();
  }
});

test('GET /state：扩展名分栏覆盖文档/表格/图片/安装包/压缩包，未知扩展名与快捷方式进待归类', async () => {
  const { dir, routes, cleanup } = await setup();
  try {
    for (const n of ['a.docx', 'b.xlsx', 'c.png', 'd.exe', 'e.zip', 'f.lnk', 'noext', 'g.weird']) {
      await fsp.writeFile(path.join(dir, n), 'x');
    }
    const r = res();
    await routes['GET /state']({}, r);
    const { fences, items } = r.body.data;
    const labelOf = (id) => (fences.find((f) => f.id === id) || {}).label;
    const byName = Object.fromEntries(items.map((i) => [i.name, labelOf(i.fenceId)]));
    assert.deepEqual(byName, {
      'a.docx': '文档',
      'b.xlsx': '表格',
      'c.png': '图片',
      'd.exe': '安装包',
      'e.zip': '压缩包',
      'f.lnk': '待归类',
      noext: '待归类',
      'g.weird': '待归类',
    });
  } finally {
    await cleanup();
  }
});

test('迁移：旧的「按文件夹名建栏」配置被一次性重建，旧指派不残留', async () => {
  const { dir, routes, store, cleanup } = await setup();
  try {
    await fsp.writeFile(path.join(dir, 'b.png'), 'x');
    // 旧数据：没有 schema 标记 + 按桌面文件夹名建的栏
    store.set('fences', [
      { id: 'inbox', label: '待归类', color: '#9aa6ba', sort: 'name', rect: { x: 40, y: 40, w: 400, h: 300 } },
      { id: 'f-old', label: '压缩包', color: '#5b8cff', sort: 'name', rect: { x: 456, y: 40, w: 400, h: 320 } },
    ]);
    store.set('assign', { 'b.png': 'f-old' });

    const r = res();
    await routes['GET /state']({}, r);
    const { fences, items } = r.body.data;
    assert.equal(store.get('fencesSchema'), 2);
    assert.ok(fences.some((f) => f.kind === 'ext' && f.label === '图片'));
    // 旧指派指向的 'f-old' 已被新栏替换 → b.png 回到按扩展名归的「图片」
    assert.equal(items.find((i) => i.name === 'b.png').fenceId, 'f-image');
    assert.deepEqual(store.get('assign'), {});

    // 迁移只发生一次：用户后来改的栏不会被下一次 /state 覆盖
    store.set('fences', [{ id: 'inbox', label: '待归类', kind: 'inbox', sort: 'name', rect: { x: 40, y: 40, w: 400, h: 300 } }]);
    const r2 = res();
    await routes['GET /state']({}, r2);
    assert.deepEqual(r2.body.data.fences.map((f) => f.label), ['待归类']);
  } finally {
    await cleanup();
  }
});

test('POST /assign：移入围栏 / 移出围栏', async () => {
  const { dir, routes, cleanup } = await setup();
  try {
    await fsp.mkdir(path.join(dir, '文档'), { recursive: true });
    await fsp.writeFile(path.join(dir, 'b.png'), 'x');
    const st = res();
    await routes['GET /state']({}, st);
    const target = st.body.data.fences.find((f) => f.label === '待归类');
    const other = st.body.data.fences.find((f) => f.id !== target.id);

    const ok = res();
    await routes['POST /assign']({ body: { name: 'b.png', fenceId: other.id } }, ok);
    assert.equal(ok.code, 200);

    const st2 = res();
    await routes['GET /state']({}, st2);
    assert.equal(st2.body.data.items.find((i) => i.name === 'b.png').fenceId, other.id);

    const back = res();
    await routes['POST /assign']({ body: { name: 'b.png', fenceId: 'inbox' } }, back);
    const st3 = res();
    await routes['GET /state']({}, st3);
    assert.equal(st3.body.data.items.find((i) => i.name === 'b.png').fenceId, 'inbox');
  } finally {
    await cleanup();
  }
});

test('围栏 CRUD：新建 / 改尺寸 / 删除（inbox 不可删）', async () => {
  const { routes, cleanup } = await setup();
  try {
    const created = res();
    await routes['POST /fences']({ body: { label: '临时' } }, created);
    assert.equal(created.code, 200);
    const fence = created.body.data;
    assert.equal(fence.label, '临时');

    const patched = res();
    await routes['PATCH /fences/:id']({ params: { id: fence.id }, body: { rect: { x: 10, y: 20, w: 300, h: 200 } } }, patched);
    assert.equal(patched.body.data.rect.w, 300);

    const dup = res();
    await routes['POST /fences']({ body: { label: '临时' } }, dup);
    assert.equal(dup.code, 409);

    const del = res();
    await routes['DELETE /fences/:id']({ params: { id: fence.id } }, del);
    assert.equal(del.code, 200);

    const delInbox = res();
    await routes['DELETE /fences/:id']({ params: { id: 'inbox' } }, delInbox);
    assert.equal(delInbox.code, 400);
  } finally {
    await cleanup();
  }
});

test('版本号与配置：围栏/配置变更 bump rev，配置可读写', async () => {
  const { routes, cleanup } = await setup();
  try {
    const r0 = res();
    await routes['GET /rev']({}, r0);
    const rev0 = r0.body.data.rev;

    const put = res();
    await routes['PUT /config']({
      body: { strategy: 'ai', timeCluster: { enabled: false, windowDays: 3 }, keep: ['*.lnk'] },
    }, put);
    assert.equal(put.body.data.strategy, 'ai');
    assert.equal(put.body.data.timeCluster.windowDays, 3);

    const r1 = res();
    await routes['GET /rev']({}, r1);
    assert.ok(r1.body.data.rev > rev0);

    const cfg = res();
    await routes['GET /config']({}, cfg);
    assert.equal(cfg.body.data.strategy, 'ai');
    assert.equal(cfg.body.data.timeCluster.enabled, false);

    const created = res();
    await routes['POST /fences']({ body: { label: '新栏' } }, created);
    const r2 = res();
    await routes['GET /rev']({}, r2);
    assert.ok(r2.body.data.rev > r1.body.data.rev);
  } finally {
    await cleanup();
  }
});

test('组件：PUT /widgets 校验后保存；取数契约可用，未知契约报错', async () => {
  const { dir, routes, cleanup } = await setup();
  try {
    await fsp.writeFile(path.join(dir, 'a.txt'), 'x');

    const bad = res();
    await routes['PUT /widgets']({ body: { widgets: [{ id: 'w', type: 'iframe' }] } }, bad);
    assert.equal(bad.code, 400);

    const ok = res();
    await routes['PUT /widgets']({ body: { widgets: [{ id: 'w-clock', type: 'clock', pos: { x: 10, y: 10, w: 240, h: 100 } }] } }, ok);
    assert.equal(ok.code, 200);

    const get = res();
    await routes['GET /widgets']({}, get);
    assert.equal(get.body.data.widgets.length, 1);
    assert.equal(get.body.data.widgets[0].type, 'clock');

    const recent = res();
    await routes['GET /widgets/data']({ query: { contract: 'desktop.recent' } }, recent);
    assert.ok(recent.body.data.files.length >= 1);

    const summary = res();
    await routes['GET /widgets/data']({ query: { contract: 'fences.summary' } }, summary);
    assert.ok(Array.isArray(summary.body.data.fences));

    const unknown = res();
    await routes['GET /widgets/data']({ query: { contract: 'nope' } }, unknown);
    assert.equal(unknown.code, 500);
  } finally {
    await cleanup();
  }
});

test('宿主只读契约：组件取数走 runReadContract，插件自己不碰主库', async () => {
  const { routes, cleanup } = await setup();
  const prev = globalThis.__YZ_SERVER_HOST__;
  try {
    let seen = null;
    globalThis.__YZ_SERVER_HOST__ = {
      db: { prepare: () => ({ get: () => ({ id: 'u1' }) }) },
      runReadContract: (name, userId, params) => {
        seen = { name, userId, params };
        return { ok: true, data: [{ title: '演示计划项', status: 'pending' }] };
      },
    };
    const r = res();
    await routes['GET /widgets/data']({ query: { contract: 'tasks.today' } }, r);
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.data, [{ title: '演示计划项', status: 'pending' }]);
    assert.equal(seen.name, 'tasks.today');
    assert.equal(seen.userId, 'u1');
  } finally {
    if (prev === undefined) delete globalThis.__YZ_SERVER_HOST__;
    else globalThis.__YZ_SERVER_HOST__ = prev;
    await cleanup();
  }
});

test('待办：增删改查；到期提醒走 /reminders/due 且不重复', async () => {
  const { routes, cleanup } = await setup();
  try {
    const bad = res();
    await routes['POST /todos']({ body: { text: '   ' } }, bad);
    assert.equal(bad.code, 400, '空文本拒绝');

    const add = res();
    await routes['POST /todos']({ body: { text: '写周报' } }, add);
    assert.equal(add.code, 200);
    const id = add.body.data.id;
    assert.equal(add.body.data.startAt, 0, '没给时间 → 0（走汇总提醒）');

    const addTimed = res();
    await routes['POST /todos']({ body: { text: '开会', startAt: Date.now() - 1000 } }, addTimed);
    assert.ok(addTimed.body.data.startAt > 0);

    const list = res();
    await routes['GET /todos']({}, list);
    assert.equal(list.body.data.items.length, 2);

    const scan = res();
    await routes['POST /reminders/scan']({ body: {} }, scan);
    assert.equal(scan.code, 200);
    assert.ok(scan.body.data.queued >= 1, '刚过开始时间的待办应入队');

    const drain = res();
    await routes['POST /reminders/drain']({ body: {} }, drain);
    const hit = drain.body.data.items.find((d) => d.kind === 'start');
    assert.ok(hit, '队列里应有到点提醒');
    assert.match(hit.text, /该开始了/);

    const drain2 = res();
    await routes['POST /reminders/drain']({ body: {} }, drain2);
    assert.deepEqual(drain2.body.data.items, [], '取走即清空，不会重复送达');

    const scan2 = res();
    await routes['POST /reminders/scan']({ body: {} }, scan2);
    assert.equal(scan2.body.data.queued, 0, '同一天不重复提醒');

    const done = res();
    await routes['PATCH /todos/:id']({ params: { id }, body: { done: true } }, done);
    assert.equal(done.body.data.done, true);

    const del = res();
    await routes['DELETE /todos/:id']({ params: { id } }, del);
    assert.equal(del.code, 200);
    const missing = res();
    await routes['DELETE /todos/:id']({ params: { id } }, missing);
    assert.equal(missing.code, 404);
  } finally {
    await cleanup();
  }
});

test('天气契约：没配城市时明确报错（不让组件白屏）', async () => {
  const { routes, cleanup } = await setup();
  try {
    const r = res();
    await routes['GET /widgets/data']({ query: { contract: 'weather.current' } }, r);
    assert.equal(r.code, 500);
    assert.match(String(r.body.error), /城市/);
  } finally {
    await cleanup();
  }
});

test('非法标签与非法文件名被拒', async () => {
  const { routes, cleanup } = await setup();
  try {
    const bad = res();
    await routes['POST /fences']({ body: { label: 'a/b' } }, bad);
    assert.equal(bad.code, 400);

    const bad2 = res();
    await routes['POST /assign']({ body: { name: 'x/y', fenceId: 'inbox' } }, bad2);
    assert.equal(bad2.code, 400);

    const bad3 = res();
    await routes['POST /assign']({ body: { name: 'ok.txt', fenceId: 'nope' } }, bad3);
    assert.equal(bad3.code, 404);
  } finally {
    await cleanup();
  }
});

test('备忘录：按 id 存取，保存不 bump rev（组件页便签不丢焦点）', async () => {
  const { routes, cleanup } = await setup();
  try {
    const empty = res();
    await routes['GET /memo/:id']({ params: { id: 'memo-1' } }, empty);
    assert.equal(empty.body.data.text, '');

    const put = res();
    await routes['PUT /memo/:id']({ params: { id: 'memo-1' }, body: { text: '周五前交方案' } }, put);
    assert.equal(put.body.data.text, '周五前交方案');

    const rev = res();
    await routes['GET /rev']({}, rev);
    const before = rev.body.data.rev;
    await routes['PUT /memo/:id']({ params: { id: 'memo-1' }, body: { text: '改一下' } }, res());
    const rev2 = res();
    await routes['GET /rev']({}, rev2);
    assert.equal(rev2.body.data.rev, before, '保存便签不该 bump rev');

    const again = res();
    await routes['GET /memo/:id']({ params: { id: 'memo-1' } }, again);
    assert.equal(again.body.data.text, '改一下');
  } finally {
    await cleanup();
  }
});

test('文件夹块：只读列桌面里的某个文件夹，越界被拒', async () => {
  const { dir, routes, cleanup } = await setup();
  try {
    await fsp.mkdir(path.join(dir, '文档', '子目录'), { recursive: true });
    await fsp.writeFile(path.join(dir, '文档', 'a.docx'), 'x');

    const r = res();
    await routes['GET /widgets/data']({ query: { contract: 'folder.items', rel: '文档' } }, r);
    assert.equal(r.code, 200);
    assert.deepEqual(r.body.data.items.map((i) => i.name), ['子目录', 'a.docx'], '目录排在文件前面');
    assert.equal(r.body.data.total, 2);

    const bad = res();
    await routes['GET /widgets/data']({ query: { contract: 'folder.items', rel: '../..' } }, bad);
    assert.equal(bad.code, 500);
    assert.match(String(bad.body.error), /越界/);

    const missing = res();
    await routes['GET /widgets/data']({ query: { contract: 'folder.items' } }, missing);
    assert.equal(missing.code, 500);
    assert.match(String(missing.body.error), /未指定文件夹/);
  } finally {
    await cleanup();
  }
});

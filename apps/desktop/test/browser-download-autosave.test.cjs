// 智能体下载落盘（2026-10-26）单元测试
// 直接从 main.cjs 抽取 ===DOWNLOAD-AUTOSAVE-START/END=== 之间的真实代码，注入 fake
// path/fs/app 执行（不依赖 electron），验证三条契约：
//   ① 落盘目录：工作目录优先，兜底「系统下载目录/言知下载」
//   ② 同名文件不覆盖（导出报表同名是常态）
//   ③ will-download 在 agent 活动窗口内 setSavePath（⇒ 不弹原生「另存为」），
//      活动窗口外不接管（用户手动下载保持 Electron 默认）
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const start = mainCjs.indexOf('// ===DOWNLOAD-AUTOSAVE-START===');
const end = mainCjs.indexOf('// ===DOWNLOAD-AUTOSAVE-END===');
assert.ok(start > 0 && end > start, 'main.cjs 中未找到 DOWNLOAD-AUTOSAVE 哨兵块');
const block = mainCjs.slice(start, end);

function loadBlock({ exists = [], downloadsDir = '/fake/Downloads' } = {}) {
  const fakeFs = {
    existsSync: (p) => exists.includes(p),
    mkdirSync: () => {},
  };
  const fakeApp = { getPath: (k) => (k === 'downloads' ? downloadsDir : `/fake/${k}`) };
  const quietConsole = { log() {}, warn() {} };
  const factory = new Function(
    'path', 'fs', 'app', 'require', 'console',
    block + `
      return {
        resolveDownloadDir,
        uniqueDownloadPath,
        installBrowserDownloadHandler,
        markAgentBrowserActivity,
        getRecords: () => downloadRecords,
        getSeq: () => downloadSeq,
        resetActivity: () => { agentBrowserActivityUntil = 0; },
      };`
  );
  return factory(path, fakeFs, fakeApp, require, quietConsole);
}

function makeItem(filename) {
  const item = {
    filename,
    savedPath: null,
    setCalls: 0,
    doneCb: null,
    getFilename: () => filename,
    getURL: () => 'blob:https://creator.douyin.com/abc',
    getReceivedBytes: () => 4096,
    setSavePath: (p) => { item.savedPath = p; item.setCalls += 1; },
    on: () => {},
    once: (ev, cb) => { if (ev === 'done') item.doneCb = cb; },
  };
  return item;
}

test('① 落盘目录：工作目录优先', () => {
  const api = loadBlock();
  assert.strictEqual(api.resolveDownloadDir('/work/demo'), path.join('/work/demo', 'downloads'));
});

test('① 落盘目录：无工作目录时兜底系统下载目录/言知下载', () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  assert.strictEqual(api.resolveDownloadDir(''), path.join('/fake/Downloads', '言知下载'));
  assert.strictEqual(api.resolveDownloadDir(undefined), path.join('/fake/Downloads', '言知下载'));
});

test('② 同名文件不覆盖，追加 (1)', () => {
  const dir = path.join('/work/demo', 'downloads');
  const first = path.join(dir, '作品列表导出.xlsx');
  const api = loadBlock({ exists: [first] });
  assert.strictEqual(api.uniqueDownloadPath(dir, '作品列表导出.xlsx'), path.join(dir, '作品列表导出 (1).xlsx'));
});

test('② 文件名里的非法字符被替换（Windows 路径安全）', () => {
  const dir = path.join('/work/demo', 'downloads');
  const api = loadBlock();
  const out = api.uniqueDownloadPath(dir, 'a:b*c?.xlsx');
  assert.strictEqual(path.basename(out), 'a_b_c_.xlsx');
});

test('③ agent 活动窗口内：will-download 必须 setSavePath（不弹原生另存为）', () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const item = makeItem('作品列表导出.xlsx');
  sess.emit('will-download', {}, item);

  assert.ok(item.savedPath, '活动窗口内未调用 setSavePath ⇒ 会弹系统「另存为」框');
  assert.ok(item.savedPath.startsWith(path.join('/fake/Downloads', '言知下载')), item.savedPath);

  item.doneCb({}, 'completed');
  const recs = api.getRecords();
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0].state, 'completed');
  assert.strictEqual(recs[0].filename, '作品列表导出.xlsx');
  assert.strictEqual(recs[0].savedPath, item.savedPath);
});

test('③ 活动窗口外（用户手动下载）：不接管，保持 Electron 默认', () => {
  const api = loadBlock();
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.resetActivity();

  const item = makeItem('manual.pdf');
  sess.emit('will-download', {}, item);

  assert.strictEqual(item.savedPath, null, '用户手动下载不应被静默改道');
  assert.strictEqual(api.getRecords().length, 0);
});

test('③ 监听器只安装一次（重复调用不会重复接管）', () => {
  const api = loadBlock();
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const item = makeItem('a.xlsx');
  sess.emit('will-download', {}, item);
  assert.strictEqual(item.setCalls, 1, '重复安装导致同一分区被接管两次（会互相覆盖保存路径）');
  item.doneCb({}, 'completed');
  assert.strictEqual(api.getRecords().length, 1);
});

test('接入点：分区级安装（BrowserView + webview 共用 persist:browser-view）', () => {
  assert.match(
    mainCjs,
    /installBrowserDownloadHandler\(session\.fromPartition\('persist:browser-view'\)\)/,
    'main.cjs 未在启动时给 persist:browser-view 安装下载接管'
  );
});

test('接入点：点击后把下载路径回给模型（downloads 能力同步进清单）', () => {
  assert.match(mainCjs, /attachDownloadToClickResult\(clickResult, beforeClickDownloadSeq\)/);
  assert.match(mainCjs, /case 'downloads': \{/);
  assert.match(mainCjs, /'download', 'downloads'/);
});

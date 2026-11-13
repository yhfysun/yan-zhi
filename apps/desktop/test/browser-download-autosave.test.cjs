// 智能体下载落盘（2026-10-26）单元测试
// 直接从 main.cjs 抽取 ===DOWNLOAD-AUTOSAVE-START/END=== 之间的真实代码，注入 fake
// path/fs/app 执行（不依赖 electron），验证三条契约：
//   ① 落盘目录：工作目录优先，兜底「系统下载目录/言智下载」
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

function loadBlock({
  exists = [],
  sizes = {},
  downloadsDir = '/fake/Downloads',
  configuredDir = path.join(downloadsDir, '言智下载'),
  pickedDir = '',
  backgroundJobPost = async () => ({ data: { jobId: 'job_bg_test_deadbeef' } }),
} = {}) {
  let now = 1;
  const writes = [];
  let dialogCalls = 0;
  const sent = [];
  const fakeFs = {
    existsSync: (p) => exists.includes(p),
    mkdirSync: () => {},
    statSync: (p) => {
      if (!exists.includes(p)) throw new Error(`ENOENT: ${p}`);
      return { isFile: () => true, size: Object.hasOwn(sizes, p) ? sizes[p] : 4096 };
    },
  };
  const fakeApp = { getPath: (k) => (k === 'downloads' ? downloadsDir : `/fake/${k}`) };
  const quietConsole = { log() {}, warn() {} };
  const fakeDialog = {
    showOpenDialog: async () => {
      dialogCalls += 1;
      return pickedDir
        ? { canceled: false, filePaths: [pickedDir] }
        : { canceled: true, filePaths: [] };
    },
  };
  const readHostConfig = () => ({ browserDownloadDir: configuredDir });
  const writeHostConfig = (patch) => { writes.push(patch); return patch; };
  const fakeMainWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => { sent.push({ channel, payload }); },
    },
  };
  const factory = new Function(
    'path', 'fs', 'app', 'require', 'console', 'setTimeout', 'clearTimeout',
    'readHostConfig', 'writeHostConfig', 'mainWindow', 'dialog', 'backgroundJobPost',
    block + `
      return {
        resolveDownloadDir,
        uniqueDownloadPath,
        installBrowserDownloadHandler,
        attachDownloadToClickResult,
        markAgentBrowserActivity,
        setAgentDownloadContext,
        reportDownloadBackgroundJob,
        getRecords: () => downloadRecords,
        getSeq: () => downloadSeq,
        getConfiguredDir: () => loadConfiguredBrowserDownloadDir(),
        resetActivity: () => { agentBrowserActivityUntil = 0; },
        resolveBrowserDownloadDirPrompt,
        markBrowserDownloadUiReady,
        ...(typeof queryDownloadStatus === 'function' ? { queryDownloadStatus } : {}),
        ...(typeof waitForDownloadStatus === 'function' ? { waitForDownloadStatus } : {}),
        ...(typeof updateDownloadProgress === 'function' ? { updateDownloadProgress } : {}),
        ...(typeof controlDownload === 'function' ? { controlDownload } : {}),
        ...(typeof waitForDownloadStartSince === 'function' ? { waitForDownloadStartSince } : {}),
      };`
  );
  const api = factory(
    path,
    fakeFs,
    fakeApp,
    require,
    quietConsole,
    (fn, ms) => { const id = ++now; if (Number(ms) < 60000) queueMicrotask(fn); return id; },
    () => {},
    readHostConfig,
    writeHostConfig,
    fakeMainWindow,
    fakeDialog,
    backgroundJobPost,
  );
  return { ...api, getWrites: () => writes, getDialogCalls: () => dialogCalls, getSent: () => sent };
}

function makeItem(filename, opts = {}) {
  const item = {
    filename,
    savedPath: null,
    setCalls: 0,
    doneCb: null,
    receivedBytes: opts.receivedBytes ?? 4096,
    totalBytes: opts.totalBytes ?? 0,
    paused: opts.paused ?? false,
    canResume: opts.canResume ?? false,
    getFilename: () => filename,
    getURL: () => 'blob:https://creator.douyin.com/abc',
    getReceivedBytes: () => item.receivedBytes,
    getTotalBytes: () => item.totalBytes,
    isPaused: () => item.paused,
    canResume: () => item.canResume,
    getState: () => (item.paused ? 'interrupted' : 'progressing'),
    pauseCalls: 0,
    resumeCalls: 0,
    cancelCalls: 0,
    events: [],
    pause: () => { item.pauseCalls += 1; item.paused = true; },
    resume: () => { item.resumeCalls += 1; item.paused = false; item.events.push('resume'); },
    cancel: () => { item.cancelCalls += 1; item.events.push('cancel'); },
    setSavePath: (p) => { item.savedPath = p; item.setCalls += 1; item.events.push('setSavePath'); },
    on: (ev, cb) => { if (ev === 'updated') item.updatedCb = cb; },
    once: (ev, cb) => { if (ev === 'done') item.doneCb = cb; },
  };
  return item;
}

test('① 落盘目录：工作目录优先', () => {
  const api = loadBlock({ configuredDir: '' });
  assert.strictEqual(api.resolveDownloadDir('/work/demo'), path.join('/work/demo', 'downloads'));
});

test('① 落盘目录：无工作目录时兜底系统下载目录/言智下载', () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads', configuredDir: '' });
  assert.strictEqual(api.resolveDownloadDir(''), path.join('/fake/Downloads', '言智下载'));
  assert.strictEqual(api.resolveDownloadDir(undefined), path.join('/fake/Downloads', '言智下载'));
});

test('① 旧品牌错字目录配置自动迁移为言智下载，但不移动旧文件', () => {
  const oldDir = path.join('/fake/Downloads', '言知下载');
  const api = loadBlock({ configuredDir: oldDir });
  assert.strictEqual(api.getConfiguredDir(), path.join('/fake/Downloads', '言智下载'));
  assert.strictEqual(api.getWrites().at(-1).browserDownloadDir, path.join('/fake/Downloads', '言智下载'));
});

test('① 未配置：首下载弹应用内目录提示，不直接弹系统目录框', async () => {
  const picked = path.join('/fake/Chosen', '浏览器下载');
  const exists = [picked];
  const api = loadBlock({ configuredDir: '', exists });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();
  api.markBrowserDownloadUiReady();

  const item = makeItem('报表.xlsx');
  sess.emit('will-download', {}, item);
  await new Promise((resolve) => setImmediate(resolve));

  const prompt = api.getSent().find((x) => x.channel === 'browser-download:dir-prompt');
  assert.ok(prompt, '未向渲染层发送应用内下载目录提示');
  assert.strictEqual(api.getDialogCalls(), 0, '首下载不得直接弹系统目录选择器');
  api.resolveBrowserDownloadDirPrompt(prompt.payload.requestId, picked);
  for (let i = 0; i < 5 && !item.setCalls; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.strictEqual(item.pauseCalls, 1);
  assert.strictEqual(item.resumeCalls, 1);
  assert.ok(
    item.events.indexOf('setSavePath') < item.events.indexOf('resume'),
    '必须先 setSavePath 再 resume，否则下载可能按 Electron 默认路径开始',
  );
  assert.ok(item.savedPath.startsWith(picked), item.savedPath);
  assert.strictEqual(api.getConfiguredDir(), picked);
  assert.strictEqual(api.getWrites().at(-1).browserDownloadDir, picked);
});

test('① 未配置且用户取消：本次回退默认目录，并停止重复弹窗', async () => {
  const api = loadBlock({ configuredDir: '' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();
  api.markBrowserDownloadUiReady();

  const first = makeItem('a.xlsx');
  sess.emit('will-download', {}, first);
  await new Promise((resolve) => setImmediate(resolve));
  const prompt = api.getSent().find((x) => x.channel === 'browser-download:dir-prompt');
  assert.ok(prompt, '未向渲染层发送应用内下载目录提示');
  api.resolveBrowserDownloadDirPrompt(prompt.payload.requestId, '');
  for (let i = 0; i < 5 && !first.setCalls; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.strictEqual(api.getDialogCalls(), 0);
  assert.ok(first.savedPath.startsWith(path.join('/fake/Downloads', '言智下载')));

  const second = makeItem('b.xlsx');
  sess.emit('will-download', {}, second);
  assert.strictEqual(second.setCalls, 1, '取消后同一会话不应再次阻塞弹窗');
  assert.strictEqual(api.getDialogCalls(), 0);
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
  assert.ok(item.savedPath.startsWith(path.join('/fake/Downloads', '言智下载')), item.savedPath);
  assert.strictEqual(api.getRecords().length, 1, '下载一开始就应可查询，模型不必等文件写完');
  assert.strictEqual(api.getRecords()[0].state, 'progressing');
  assert.strictEqual(api.getRecords()[0].savedPath, item.savedPath);

  item.doneCb({}, 'completed');
  const recs = api.getRecords();
  assert.strictEqual(recs.length, 1);
  assert.strictEqual(recs[0].state, 'completed');
  assert.strictEqual(recs[0].filename, '作品列表导出.xlsx');
  assert.strictEqual(recs[0].savedPath, item.savedPath);
});

test('③ 下载完成后回执必须区分完成/失败，并带落盘存在性', async () => {
  const first = path.join('/fake/Downloads', '言智下载', 'a.xlsx');
  const exists = [first];
  const api = loadBlock({ exists, downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const before = api.getSeq();
  const item = makeItem('a.xlsx');
  sess.emit('will-download', {}, item);
  exists.push(item.savedPath);
  item.doneCb({}, 'completed');

  const out = await api.attachDownloadToClickResult(
    { status: 'ok', text: '下载' },
    before,
  );
  assert.strictEqual(out.downloaded.state, 'completed');
  assert.strictEqual(out.downloaded.exists, true);
  assert.strictEqual(out.downloaded.verified, true);
  assert.match(out.note, /已自动下载/);
});

test('③ completed 但文件为 0 字节时不能判定为 verified', async () => {
  const target = path.join('/fake/Downloads', '言智下载', 'empty.xlsx');
  const exists = [];
  const api = loadBlock({
    exists,
    sizes: { [target]: 0 },
    downloadsDir: '/fake/Downloads',
  });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const before = api.getSeq();
  const item = makeItem('empty.xlsx');
  sess.emit('will-download', {}, item);
  exists.push(item.savedPath);
  item.doneCb({}, 'completed');

  const out = await api.attachDownloadToClickResult(
    { status: 'ok', text: '下载' },
    before,
  );
  assert.strictEqual(out.downloaded.state, 'completed');
  assert.strictEqual(out.downloaded.exists, true);
  assert.strictEqual(out.downloaded.verified, false);
  assert.match(out.note, /空文件|0 字节/);
  assert.doesNotMatch(out.note, /已自动下载/);
});

test('③ 下载等待查询按 since 只认本次新增文件，并识别浏览器重名后缀', async () => {
  const target = path.join('/fake/Downloads', '言智下载', '报表 (3).xlsx');
  const exists = [];
  const api = loadBlock({
    exists,
    downloadsDir: '/fake/Downloads',
  });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const before = api.getSeq();
  const item = makeItem('报表 (3).xlsx');
  sess.emit('will-download', {}, item);
  exists.push(item.savedPath);
  item.doneCb({}, 'completed');

  assert.strictEqual(typeof api.queryDownloadStatus, 'function');
  const result = await api.queryDownloadStatus({
    beforeSeq: before,
    expectedFileName: '报表.xlsx',
  });
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.download.filename, '报表 (3).xlsx');
  assert.strictEqual(result.download.verified, true);
});

test('③ expectedFileName 精确命中优先于去后缀匹配，避免同批重名误判 ambiguous', async () => {
  const exists = [];
  const api = loadBlock({ exists, downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const before = api.getSeq();
  const exact = makeItem('报表.xlsx');
  const duplicate = makeItem('报表 (1).xlsx');
  sess.emit('will-download', {}, exact);
  exists.push(exact.savedPath);
  exact.doneCb({}, 'completed');
  sess.emit('will-download', {}, duplicate);
  exists.push(duplicate.savedPath);
  duplicate.doneCb({}, 'completed');

  const result = await api.queryDownloadStatus({
    beforeSeq: before,
    expectedFileName: '报表.xlsx',
  });
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.download.filename, '报表.xlsx');
});

test('③ 仍在下载时不能谎报完成，必须给出进度和查询路径', async () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const before = api.getSeq();
  const item = makeItem('large.xlsx');
  sess.emit('will-download', {}, item);

  const out = await api.attachDownloadToClickResult(
    { status: 'ok', text: '下载' },
    before,
    0,
  );
  assert.strictEqual(out.downloaded.state, 'progressing');
  assert.match(out.note, /仍在下载/);
  assert.match(out.note, /不要重复点击/);
  assert.doesNotMatch(out.note, /已自动下载/);
});

test('④ 大文件进度：已下载/总量/百分比/速度/ETA 必须可计算', () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const rec = {
    bytes: 0,
    totalBytes: 1000,
    startedAt: 0,
    updatedAt: 0,
    lastBytes: 0,
    lastSampleAt: 0,
    speedBps: 0,
    etaMs: null,
    paused: false,
    canResume: false,
  };
  api.updateDownloadProgress(rec, 100, 1000, 1000);
  assert.strictEqual(rec.percent, 10);
  assert.strictEqual(rec.speedBps, 100);
  assert.strictEqual(rec.etaMs, 9000);

  api.updateDownloadProgress(rec, 300, 1000, 2000);
  assert.strictEqual(rec.percent, 30);
  assert.ok(rec.speedBps > 0);
  assert.ok(rec.etaMs > 0);
});

test('④ 支持暂停/恢复进行中的下载，并暴露 canResume', () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();
  const item = makeItem('large.iso', { receivedBytes: 100, totalBytes: 1000, canResume: true });
  sess.emit('will-download', {}, item);

  const paused = api.controlDownload('pause');
  assert.strictEqual(paused.download.paused, true);
  assert.strictEqual(paused.download.canResume, true);
  assert.strictEqual(item.pauseCalls, 1);

  const resumed = api.controlDownload('resume');
  assert.strictEqual(resumed.download.paused, false);
  assert.strictEqual(item.resumeCalls, 1);

  const cancelled = api.controlDownload('cancel');
  assert.strictEqual(cancelled.status, 'ok');
  assert.strictEqual(item.cancelCalls, 1);
});

test('④ 大文件等待超时时返回 nextCheckInMs，避免模型高频空转', async () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();
  const item = makeItem('large.iso', { receivedBytes: 100, totalBytes: 10_000_000 });
  sess.emit('will-download', {}, item);

  const result = await api.waitForDownloadStatus({
    beforeSeq: 0,
    timeoutMs: 1,
  });
  assert.strictEqual(result.status, 'timeout');
  assert.ok(result.nextCheckInMs >= 1000);
  assert.ok(result.nextCheckInMs <= 30000);
});

test('④ browser_download 触发大文件后应在 downloadId 一出现时就返回，而不是等完成', async () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();
  const item = makeItem('large.iso', { receivedBytes: 100, totalBytes: 10_000_000 });
  sess.emit('will-download', {}, item);

  const rec = await api.waitForDownloadStartSince(0, 50);
  assert.strictEqual(rec.id, 1);
  assert.strictEqual(rec.state, 'progressing');
  assert.strictEqual(rec.filename, 'large.iso');
});

test('④ 浏览器大文件下载自动登记统一后台任务，并在终态回调 finish', async () => {
  const calls = [];
  const exists = [];
  const api = loadBlock({
    downloadsDir: '/fake/Downloads',
    exists,
    backgroundJobPost: async (pathname, body) => {
      calls.push({ pathname, body });
      return { data: { jobId: 'job_bg_test_deadbeef' } };
    },
  });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.setAgentDownloadContext({
    conversationId: 'conv-bg',
    taskId: 'task-bg',
    toolCallId: 'call-bg',
    wakePolicy: 'resume',
  });
  api.markAgentBrowserActivity();

  const item = makeItem('huge.iso', { receivedBytes: 100, totalBytes: 10_000_000, canResume: true });
  sess.emit('will-download', {}, item);
  for (let i = 0; i < 5 && !calls.length; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  for (let i = 0; i < 5 && !api.getRecords()[0].backgroundJobId; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.strictEqual(calls[0].pathname, '/upsert');
  assert.strictEqual(calls[0].body.kind, 'browser_download');
  assert.strictEqual(calls[0].body.conversationId, 'conv-bg');
  assert.strictEqual(calls[0].body.taskId, 'task-bg');
  assert.strictEqual(calls[0].body.adapterRef, `desktop-download:${api.getRecords()[0].id}`);
  assert.strictEqual(api.getRecords()[0].backgroundJobId, 'job_bg_test_deadbeef');

  exists.push(item.savedPath);
  item.doneCb({}, 'completed');
  for (let i = 0; i < 8 && !calls.some((c) => c.pathname.endsWith('/finish')); i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const finish = calls.find((c) => c.pathname.endsWith('/finish'));
  assert.ok(finish, '下载终态未回写统一后台任务');
  assert.strictEqual(finish.body.status, 'completed');
  assert.deepStrictEqual(finish.body.artifactPaths, [item.savedPath]);
});

test('③ div/span 图标按钮只靠 aria-label 也要识别下载意图', async () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const out = await api.attachDownloadToClickResult(
    { success: true, tag: 'div', text: '', ariaLabel: '导出报表' },
    0,
    0,
  );
  assert.match(out.note, /可能触发下载/);
});

test('③ 普通 div 点击后异步触发下载也要短暂等待并回传路径', async () => {
  const exists = [];
  const api = loadBlock({ exists, downloadsDir: '/fake/Downloads' });
  const sess = new EventEmitter();
  api.installBrowserDownloadHandler(sess);
  api.markAgentBrowserActivity();

  const pending = api.attachDownloadToClickResult(
    { success: true, tag: 'div', text: '生成文件' },
    0,
    30,
  );
  const item = makeItem('async.xlsx');
  sess.emit('will-download', {}, item);
  exists.push(item.savedPath);
  item.doneCb({}, 'completed');

  const out = await pending;
  assert.strictEqual(out.downloaded.filename, 'async.xlsx');
  assert.strictEqual(out.downloaded.state, 'completed');
});

test('③ 点击后页面没变化但下载尚未开始时，必须提示用 browser_download 查询', async () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const out = await api.attachDownloadToClickResult(
    { status: 'ok', success: true, tag: 'div', text: '', pageChanged: false },
    0,
    0,
  );
  assert.match(out.note, /browser_download/);
  assert.strictEqual(out.downloadWatch.queryTool, 'browser_download');
  assert.strictEqual(out.downloadWatch.beforeSeq, 0);
  assert.match(out.downloadWatch.reason, /页面没有变化/);
});

test('③ 旧映射无参 download 也必须能查询最近下载，而不是报缺参数', () => {
  const start = mainCjs.indexOf("case 'download': {");
  const end = mainCjs.indexOf("case 'downloads': {", start);
  const body = mainCjs.slice(start, end);
  assert.match(body, /args\.index == null[\s\S]{0,700}downloadRecords/);
});

test('③ 误点 div 上传入口时回执要引导改用 browser_upload', async () => {
  const api = loadBlock({ downloadsDir: '/fake/Downloads' });
  const out = await api.attachDownloadToClickResult(
    { success: true, tag: 'div', text: '', ariaLabel: '上传文件' },
    0,
    0,
  );
  assert.match(out.note, /browser_upload/);
  assert.match(out.note, /clickSelector/);
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

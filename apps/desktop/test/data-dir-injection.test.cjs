/**
 * dev 数据目录守门测试（DATA_DIR 注入链路）。
 *
 * ★★★ 为什么必须钉住（2026-10-08 真实故障，代价很大）：
 *   `db.ts` 的 dataDir = `process.env.DATA_DIR || path.join(__dirname, '..')`。
 *   安装版由 main.cjs 注入 DATA_DIR（userData/server-data），
 *   而**开发模式整条链路谁都没注入** → dev 的库落到 `apps/server/data.db`
 *   （**源码目录里**！）。后果：
 *     ① dev 与安装版各写一份库，数据互相看不见（用户以为"会话丢了 / 数据库损坏"）；
 *     ② 实测该库真的发生了 B 树损坏（conversation / message 两棵树）
 *        → `conversations.ts:46` 的 `SELECT * ... ORDER BY` 抛
 *        `SqliteError: database disk image is malformed` → 会话接口全 500。
 *   这类错误**不报错、不崩溃**，只表现为"数据不见了"，极难归因。
 *
 * 判据（三条缺一不可，任一漏掉都会退回"写源码目录"）：
 *   ① `bin/dev.mjs`      —— server 独立启动分支必须传 DATA_DIR
 *   ② `apps/server/scripts/dev.cjs` —— pnpm dev 分支必须传 DATA_DIR
 *   ③ `apps/desktop/main.cjs` 的 ensureServerDataDir —— **dev 下不得返回 null**
 *      （此前正是 `if (!app.isPackaged) return null;` 这一行造成的）
 *
 * 为什么用「读源码做结构断言」而不是起 Electron：main.cjs 顶层依赖 electron 模块，
 *   node --test 里 require 它会直接失败；而这些点的本质是**调用链是否接通**，
 *   静态断言恰好能覆盖"漏传 / 提前 return"这两类真实错误。
 *
 * 运行：node --test apps/desktop/test/data-dir-injection.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 剥掉行注释与块注释（避免注释里出现 DATA_DIR 造成假通过）。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('dev 模式必须注入 DATA_DIR（否则库落到源码目录）', () => {
  test('① bin/dev.mjs：server 独立启动分支传了 DATA_DIR', () => {
    const src = strip(read('bin/dev.mjs'));
    // ★ 两处 server 启动点的写法不同（一处单行 `start('server', …)`，
    //   一处换行 `start(\n  'server',`）—— 用「函数名 + 首个参数为 'server'」统一匹配，
    //   否则按字符串切分会漏计数（本测试第一版就是这么误报的）。
    const re = /start\(\s*(?:\n\s*)?'server'/g;
    const starts = [...src.matchAll(re)];
    assert.ok(
      starts.length >= 2,
      `expected >=2 个 start('server') 启动点（Electron 分支 + pnpm 回退分支），实得 ${starts.length}`,
    );
    for (const [i, m] of starts.entries()) {
      const envBlock = src.slice(m.index, m.index + 900); // env 对象在紧跟的 900 字符内
      assert.match(
        envBlock,
        /DATA_DIR\s*:/,
        `★ 第 ${i + 1} 个 start('server') 分支没传 DATA_DIR —— 该分支下 dev 会写进 apps/server/`,
      );
    }
  });

  test('① bin/dev.mjs：定义了 DEV_DATA_DIR 且指向 yan-zhi-dev/server-data', () => {
    const src = strip(read('bin/dev.mjs'));
    assert.match(src, /const\s+DEV_DATA_DIR\s*=/, '★ 未定义 DEV_DATA_DIR');
    // 与 instance.cjs 的 dev userData 目录同名，保证与安装版分开
    assert.match(src, /DEV_USERDATA_NAME\s*=\s*'yan-zhi-dev'/, '★ dev userData 目录名应为 yan-zhi-dev');
    assert.match(src, /'server-data'/, '★ DATA_DIR 应含 server-data 子目录（与安装版布局对称）');
  });

  test('② apps/server/scripts/dev.cjs：spawn env 传了 DATA_DIR', () => {
    const src = strip(read('apps/server/scripts/dev.cjs'));
    assert.match(src, /DATA_DIR\s*:\s*devDataDir/, '★ dev.cjs 的 spawn env 未传 DATA_DIR');
    assert.match(src, /mkdirSync\(devDataDir/, '★ 应先建目录再交后端（SQLite 建库要目录存在）');
  });

  test('③ apps/desktop/main.cjs：ensureServerDataDir 在 dev 下不再返回 null', () => {
    const src = strip(read('apps/desktop/main.cjs'));
    const i = src.indexOf('function ensureServerDataDir');
    assert.ok(i > -1, '★ 未找到 ensureServerDataDir');
    const body = src.slice(i, i + 1600);
    // 反向：这段里不得再出现「非打包即 return null」——那正是本故障的根因
    assert.doesNotMatch(
      body,
      /if\s*\(\s*!\s*app\.isPackaged\s*\)\s*return\s+null/,
      '★★ ensureServerDataDir 又出现了「dev 返回 null」—— 这会让 dev 的库退回 apps/server/（本故障根因）',
    );
    // 正向：必须无条件算出 dataDir 并返回（isPackaged 只用于决定要不要搬迁旧数据）
    assert.match(body, /path\.join\(app\.getPath\('userData'\),\s*'server-data'\)/, '★ 未按 userData/server-data 组装');
    assert.match(body, /return\s+dataDir/, '★ 必须返回 dataDir');
  });

  test('③ apps/desktop/main.cjs：显式 DATA_DIR 优先于 userData 推导', () => {
    const src = strip(read('apps/desktop/main.cjs'));
    const i = src.indexOf('function ensureServerDataDir');
    const body = src.slice(i, i + 1600);
    // 显式传入的要先被采纳（否则 Electron 与裸 server 两条路径会落到不同目录）
    const explicitIdx = body.search(/process\.env\.DATA_DIR/);
    const userDataIdx = body.search(/app\.getPath\('userData'\)/);
    assert.ok(explicitIdx > -1, '★ 未读取显式 DATA_DIR');
    assert.ok(
      explicitIdx < userDataIdx,
      '★ 显式 DATA_DIR 的判定必须早于 userData 推导 —— 否则 dev.mjs 下发的值会被覆盖',
    );
  });

  test('③ 搬迁旧库只在打包版做（dev 不该去搬安装目录的数据）', () => {
    const src = strip(read('apps/desktop/main.cjs'));
    const i = src.indexOf('function ensureServerDataDir');
    const body = src.slice(i, i + 1600);
    assert.match(body, /if\s*\(\s*app\.isPackaged\s*\)/, '★ 旧数据搬迁应被 app.isPackaged 包住');
    assert.match(body, /resourcesPath/, '★ 搬迁源应位于 resourcesPath（安装目录内）');
  });
});
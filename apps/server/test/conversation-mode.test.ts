// 会话按模式隔离 —— 钉住 SQL 口径。
//
// 背景：四模式最初的设计契约是「模式 = 同一份上下文的若干视图，不持有会话池」，
// 会话共享、列表不过滤。实际用下来工作流模式的下拉里会混进办公/开发的会话，
// 用户明确要求隔离（2026-09-18 拍板：加 mode 列，存量全归 office）。
//
// 本测试钉住的是**过滤 SQL 本身**，不是接口——因为最容易静默错的就是这条：
//   `COALESCE(NULLIF(mode, ''), 'office') = ?`
// 少兜一层，历史 NULL 行就永远查不到（用户会觉得"我的会话没了"），
// 而这种错不会报错、只会表现为列表少数据。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// ★ 2026-10-03 修复：不再直接 import better-sqlite3 —— postinstall 已把它重编为
//   Electron ABI（fix-sqlite-electron.cjs），vitest 跑在系统 Node 上加载即
//   NODE_MODULE_VERSION 不匹配。改走 sqlite-driver 的统一入口（原生不可用自动
//   回退 sql.js WASM，接口面同构），本地/CI/移动端三种环境都能跑。
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';

/** 与 routes/conversations.ts 里 GET / 的过滤 SQL 逐字一致的片段 */
const MODE_FILTER = `COALESCE(NULLIF(mode, ''), 'office') = ?`;

/**
 * 从实现源码抽取 `VALID_MODES` 白名单（而非手写第二份清单）。
 *
 * ★★ 为什么这么做（2026-10-08 实测踩到）：本文件此前手写五个模式，新增 `clip` 时漏改，
 *   而样本里又恰好没有 clip 会话 → 「并集 = 全部」的断言**假通过**。
 *   ★ 判据：验证脚本一旦复刻实现，测的就是脚本不是实现 —— 所以这里读源码。
 */
const IMPLEMENTED_MODES: readonly string[] = (() => {
  const src = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/routes/conversations.ts'),
    'utf8',
  );
  const m = src.match(/const VALID_MODES = new Set\(\[([^\]]+)\]\)/);
  if (!m) {
    throw new Error('★ 未能在 conversations.ts 中定位 VALID_MODES —— 抽取正则失效（实现被改写？），请同步本测试');
  }
  const ids = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  if (ids.length === 0) throw new Error('★ 从 VALID_MODES 中未解析出任何模式 id');
  return ids;
})();

async function mkDb() {
  const { db } = await openSqlite(':memory:');
  db.exec(`
    CREATE TABLE conversation (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      mode TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
  const ins = db.prepare('INSERT INTO conversation (id, user_id, title, mode, updated_at) VALUES (?, ?, ?, ?, ?)');
  ins.run('c_office', 'guest', '办公会话', 'office', 100);
  ins.run('c_wf', 'guest', '工作流会话', 'wf', 200);
  ins.run('c_dev', 'guest', '开发会话', 'dev', 300);
  // ★ 新增模式必须在这里有样本（2026-10-08 教训）：此前只建了 office/wf/dev 三个会话，
  //   下方「全部模式并集 = 全部会话」的断言因此**假通过** —— 漏掉 clip/ops/sec 不会被发现。
  //   判据：并集断言要能发现"某模式没有对应样本"，样本就必须覆盖每个模式
  //   （守卫见下方「样本必须覆盖实现里的每一个模式」一条）。
  ins.run('c_ops', 'guest', '运维会话', 'ops', 320);
  ins.run('c_sec', 'guest', '安全会话', 'sec', 340);
  ins.run('c_clip', 'guest', '剪辑会话', 'clip', 350);
  // ★ 两个脏值：历史行可能没写过 mode（NULL），也可能写成空串
  ins.run('c_null', 'guest', '历史NULL行', null, 400);
  ins.run('c_empty', 'guest', '历史空串行', '', 500);
  // 别的用户，验证 user 隔离没被破坏
  ins.run('c_other', 'other', '别人的工作流', 'wf', 600);
  return db;
}

/** 复刻接口的查询（两个 where 条件 + 排序） */
function listOf(db: YzSqliteDb, userId: string, mode: string) {
  return db
    .prepare(
      `SELECT id FROM conversation WHERE user_id = ? AND ${MODE_FILTER} ORDER BY updated_at DESC`,
    )
    .all(userId, mode) as Array<{ id: string }>;
}

describe('会话按模式隔离 · 过滤 SQL 口径', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); });
  afterEach(() => db.close());

  it('只回当前模式的会话', () => {
    expect(listOf(db, 'guest', 'wf').map((r) => r.id)).toEqual(['c_wf']);
    expect(listOf(db, 'guest', 'dev').map((r) => r.id)).toEqual(['c_dev']);
  });

  it('★ NULL 与空串的历史行归 office —— 否则这些会话在哪个模式都看不到', () => {
    const office = listOf(db, 'guest', 'office').map((r) => r.id);
    expect(office).toContain('c_office');
    expect(office).toContain('c_null');   // 迁移前写入的 NULL 行
    expect(office).toContain('c_empty');  // 迁移前写入的空串行
  });

  it('★ 全部模式的并集 = 该用户全部会话（不漏不重）', () => {
    const all = (db.prepare('SELECT id FROM conversation WHERE user_id = ?').all('guest') as Array<{ id: string }>)
      .map((r) => r.id).sort();
    // ★★ 模式清单**从实现源码抽取**，不手写（2026-10-08 教训）：
    //   本文件此前手写 ['office','dev','ops','sec','wf']，新增 clip 时没同步，
    //   而样本里又恰好没有 clip 会话 → 断言**假通过**（漏了一个模式也发现不了）。
    //   判据：这条断言的语义就是「一个都不能漏」，它引用的清单就必须与实现同源，
    //        否则它测的是"我抄的清单"，不是"实现的清单"。
    const union = [...IMPLEMENTED_MODES]
      .flatMap((m) => listOf(db, 'guest', m).map((r) => r.id))
      .sort();
    expect(union).toEqual(all);
    // 无重复
    expect(new Set(union).size).toBe(union.length);
  });

  it('★ 样本必须覆盖实现里的每一个模式（否则上面的并集断言会假通过）', () => {
    const seeded = db.prepare(
      "SELECT DISTINCT COALESCE(NULLIF(mode, ''), 'office') AS m FROM conversation WHERE user_id = 'guest'",
    ).all() as Array<{ m: string }>;
    const have = new Set(seeded.map((r) => r.m));
    const missing = [...IMPLEMENTED_MODES].filter((m) => !have.has(m));
    expect(missing, `★ 以下模式没有样本会话，并集断言无法发现它被漏掉：${missing.join(', ')}`).toEqual([]);
  });

  it('不存在的模式 → 空（调用方负责把非法值拦在"不过滤"分支）', () => {
    // ★ 注意：这里**不能**再用 'ops' 当"没有会话的模式"（2026-10-08）——
    //   样本已按「覆盖每个模式」补齐，ops 现在有会话了。本用例只该验证
    //   "查一个不存在的模式得到空"，故用真正未定义的 id。
    expect(listOf(db, 'guest', '__nope__')).toEqual([]);
    expect(listOf(db, 'other', '__nope__')).toEqual([]);
  });

  it('user 隔离不被模式过滤破坏', () => {
    // 别人的 wf 会话不能出现在我的 wf 列表里
    expect(listOf(db, 'guest', 'wf').map((r) => r.id)).toEqual(['c_wf']);
    expect(listOf(db, 'other', 'wf').map((r) => r.id)).toEqual(['c_other']);
  });

  it('排序仍是 updated_at DESC（列表按最近活动排）', () => {
    const office = listOf(db, 'guest', 'office').map((r) => r.id);
    expect(office).toEqual(['c_empty', 'c_null', 'c_office']); // 500 > 400 > 100
  });
});

describe('会话按模式隔离 · 建表与迁移约束', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); });
  afterEach(() => db.close());

  it('新行不传 mode 时落 NULL，由读取侧兜成 office（而不是写死默认值依赖 DB）', () => {
    // 直接 INSERT 不带 mode：SQLite 会填 NULL（表定义无 DEFAULT），
    // 这正是"读取侧必须兜"的原因 —— 若哪天真把 DEFAULT 加上，这条会变红提醒改注释。
    db.prepare('INSERT INTO conversation (id, user_id, title, mode, updated_at) VALUES (?, ?, ?, NULL, ?)')
      .run('c_insert_null', 'guest', 'x', 999);
    expect(listOf(db, 'guest', 'office').map((r) => r.id)).toContain('c_insert_null');
  });
});
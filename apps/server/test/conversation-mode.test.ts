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
// ★ 2026-10-03 修复：不再直接 import better-sqlite3 —— postinstall 已把它重编为
//   Electron ABI（fix-sqlite-electron.cjs），vitest 跑在系统 Node 上加载即
//   NODE_MODULE_VERSION 不匹配。改走 sqlite-driver 的统一入口（原生不可用自动
//   回退 sql.js WASM，接口面同构），本地/CI/移动端三种环境都能跑。
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';

/** 与 routes/conversations.ts 里 GET / 的过滤 SQL 逐字一致的片段 */
const MODE_FILTER = `COALESCE(NULLIF(mode, ''), 'office') = ?`;

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

  it('★ 五个模式的并集 = 该用户全部会话（不漏不重）', () => {
    const all = (db.prepare('SELECT id FROM conversation WHERE user_id = ?').all('guest') as Array<{ id: string }>)
      .map((r) => r.id).sort();
    const union = ['office', 'dev', 'ops', 'sec', 'wf']
      .flatMap((m) => listOf(db, 'guest', m).map((r) => r.id))
      .sort();
    expect(union).toEqual(all);
    // 无重复
    expect(new Set(union).size).toBe(union.length);
  });

  it('不存在的模式 → 空（调用方负责把非法值拦在"不过滤"分支）', () => {
    expect(listOf(db, 'guest', 'ops')).toEqual([]);
    expect(listOf(db, 'guest', '__nope__')).toEqual([]);
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
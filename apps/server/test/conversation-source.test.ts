// 会话来源标记（P3-5，2026-10-16「落库可查可删除可总结成 skill」）—— 钉住列 + 白名单 + 过滤口径。
//
// 为什么必须真跑：这条链上每一处写错都是**静默少数据**，不会报错 ——
//   ① 过滤 SQL 少兜一层 ⇒ 历史入口里混进普通会话（用户以为"我的会话被翻出来了"）；
//   ② 白名单外的值被当成"过滤"⇒ 历史入口永远空（用户以为"页面对话没保存"）；
//   ③ 服务端 db.ts 漏加 ALTER ⇒ 纯服务端部署下按来源查直接 500（no such column: source），
//      而开发机因为客户端启动建过表，**看不到这个错**。
//
// ★ 一律用 sqlite-driver 的统一入口（不是 better-sqlite3）：postinstall 把它重编成了
//   Electron ABI，vitest 跑在系统 Node 上直接 import 会 NODE_MODULE_VERSION 不匹配
//   （同 conversation-mode.test.ts 的说明）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';
import {
  CONV_SOURCE_BROWSER_PAGE,
  CONVERSATION_SOURCES,
  initSchema,
  normalizeConversationSource,
  normalizeSourceMeta,
  parseSourceMeta,
  sourceFilterClause,
} from '@yan-zhi/core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(path.join(HERE, '..', 'src', rel), 'utf8');

/** 与 routes/conversations.ts 的过滤 SQL 同源：直接调实现，不在这里抄一份 */
const sourceCond = (q: unknown) => sourceFilterClause(q);

const LIFE_ACTIVE = 'deleted_at IS NULL AND archived_at IS NULL';

async function mkDb() {
  const { db } = await openSqlite(':memory:');
  db.exec(`
    CREATE TABLE conversation (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT,
      source_meta_json TEXT,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER, deleted_at INTEGER, last_activity_at INTEGER
    );
  `);
  const ins = db.prepare(
    'INSERT INTO conversation (id, user_id, title, source, source_meta_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  ins.run('c_plain', 'guest', '办公会话', null, null, 100);
  ins.run('c_page', 'guest', '浏览器 · example.com', CONV_SOURCE_BROWSER_PAGE,
    JSON.stringify({ url: 'https://example.com/a', host: 'example.com', scope: 'page' }), 200);
  ins.run('c_page2', 'guest', '浏览器 · taobao.com', CONV_SOURCE_BROWSER_PAGE,
    JSON.stringify({ url: 'https://taobao.com/', host: 'taobao.com', scope: 'page' }), 300);
  // 脏数据：来源列被外部写成白名单外的值（老版本 / 手改库）
  ins.run('c_junk', 'guest', '来历不明', 'something-else', null, 400);
  // 页面对话也会被归档 / 删进回收站 —— 历史列表（scope=active）必须看不到
  ins.run('c_page_archived', 'guest', '已归档的页面对话', CONV_SOURCE_BROWSER_PAGE, null, 500);
  ins.run('c_page_trashed', 'guest', '回收站里的页面对话', CONV_SOURCE_BROWSER_PAGE, null, 600);
  db.prepare('UPDATE conversation SET archived_at = 1 WHERE id = ?').run('c_page_archived');
  db.prepare('UPDATE conversation SET deleted_at = 1 WHERE id = ?').run('c_page_trashed');
  // 别的用户
  ins.run('c_other_page', 'other', '别人的页面对话', CONV_SOURCE_BROWSER_PAGE, null, 700);
  return db;
}

/** 复刻 GET /conversations 的条件拼装（source 可选、lifecycle 恒在） */
function listOf(db: YzSqliteDb, userId: string, source: unknown, life = LIFE_ACTIVE) {
  const conds = ['user_id = ?', life];
  const params: unknown[] = [userId];
  const cond = sourceCond(source);
  if (cond) conds.push(cond);
  return db
    .prepare(`SELECT id FROM conversation WHERE ${conds.join(' AND ')} ORDER BY updated_at DESC`)
    .all(...params) as Array<{ id: string }>;
}

describe('会话来源标记 · 过滤 SQL 口径', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); });
  afterEach(() => db.close());

  it('按来源查：只回页面对话，且与 user 隔离', () => {
    expect(listOf(db, 'guest', CONV_SOURCE_BROWSER_PAGE).map((r) => r.id)).toEqual(['c_page2', 'c_page']);
    expect(listOf(db, 'other', CONV_SOURCE_BROWSER_PAGE).map((r) => r.id)).toEqual(['c_other_page']);
  });

  it('★ 不传来源 ⇒ 不过滤（普通列表行为不变：只多一条白名单外的脏值）', () => {
    expect(listOf(db, 'guest', undefined).map((r) => r.id)).toEqual(['c_junk', 'c_page2', 'c_page', 'c_plain']);
  });

  it('★ 白名单外的来源值 ⇒ 按不过滤处理，而不是"查不到"（否则历史入口永远是空的）', () => {
    const all = ['c_junk', 'c_page2', 'c_page', 'c_plain'];
    expect(listOf(db, 'guest', 'something-else').map((r) => r.id)).toEqual(all);
    expect(listOf(db, 'guest', '').map((r) => r.id)).toEqual(all);
    expect(listOf(db, 'guest', null).map((r) => r.id)).toEqual(all);
  });

  it('★ 归档 / 回收站里的页面对话不出现在历史列表（lifecycle 仍叠加在来源之上）', () => {
    const active = listOf(db, 'guest', CONV_SOURCE_BROWSER_PAGE).map((r) => r.id);
    expect(active).not.toContain('c_page_archived');
    expect(active).not.toContain('c_page_trashed');
    // 换 scope=archived 时才看得到归档那条
    const archived = listOf(db, 'guest', CONV_SOURCE_BROWSER_PAGE, 'deleted_at IS NULL AND archived_at IS NOT NULL');
    expect(archived.map((r) => r.id)).toEqual(['c_page_archived']);
  });

  it('来源白名单常量非空，且过滤片段只认它', () => {
    expect(CONVERSATION_SOURCES.length).toBeGreaterThan(0);
    expect(sourceFilterClause(CONV_SOURCE_BROWSER_PAGE)).toContain(CONV_SOURCE_BROWSER_PAGE);
    expect(sourceFilterClause('nope')).toBeNull();
  });
});

describe('会话来源标记 · 写入规范化', () => {
  it('未知 / 空 / 非字符串来源一律落 NULL（一次笔误不该把建会话打挂）', () => {
    expect(normalizeConversationSource(CONV_SOURCE_BROWSER_PAGE)).toBe(CONV_SOURCE_BROWSER_PAGE);
    expect(normalizeConversationSource('nope')).toBeNull();
    expect(normalizeConversationSource('')).toBeNull();
    expect(normalizeConversationSource(undefined)).toBeNull();
    expect(normalizeConversationSource(123)).toBeNull();
  });

  it('来源附加信息：只留三个已知字段，坏值落 NULL，解析永不抛', () => {
    const json = normalizeSourceMeta({ url: 'https://a.b/c', host: 'a.b', scope: 'page', evil: 'x' });
    expect(json).toBeTruthy();
    expect(parseSourceMeta(json)).toEqual({ url: 'https://a.b/c', host: 'a.b', scope: 'page' });
    expect(normalizeSourceMeta({})).toBeNull();
    expect(normalizeSourceMeta('not-an-object')).toBeNull();
    expect(normalizeSourceMeta([])).toBeNull();
    expect(parseSourceMeta('{坏 JSON')).toEqual({});
    expect(parseSourceMeta(null)).toEqual({});
    // 超长直接丢（不做截断拼凑，免得存半条 URL 让人误判）
    expect(normalizeSourceMeta({ url: 'x'.repeat(5000) })).toBeNull();
  });
});

describe('会话来源标记 · 建表与迁移', () => {
  it('★ core 的 initSchema 能给"没有这两列的旧库"补齐（客户端启动那条链）', async () => {
    const { db } = await openSqlite(':memory:');
    db.exec(`CREATE TABLE conversation (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );`);
    await initSchema(async (sql: string) => { db.exec(sql); });
    const cols = (db.prepare(`SELECT name FROM pragma_table_info('conversation')`).all() as Array<{ name: string }>)
      .map((c) => c.name);
    expect(cols).toContain('source');
    expect(cols).toContain('source_meta_json');
    const idx = (db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as Array<{ name: string }>)
      .map((i) => i.name);
    expect(idx).toContain('idx_conversation_source');
    db.close();
  });

  it('★ 服务端 db.ts 必须**也**加这两列（服务端不跑 initSchema：纯服务端部署只能靠它）', () => {
    const src = readSrc('db.ts');
    expect(src, '★ 服务端 db.ts 缺 ALTER ... ADD COLUMN source —— 按来源查列表会 500')
      .toContain('ALTER TABLE conversation ADD COLUMN source TEXT');
    expect(src, '★ 服务端 db.ts 缺 source_meta_json 列')
      .toContain('ALTER TABLE conversation ADD COLUMN source_meta_json TEXT');
  });

  it('★★ 真起一次服务端库模块（临时 DATA_DIR）：启动迁移必须真的把两列建出来', async () => {
    // 上面那条只证明"源码里写了 ALTER"。ALTER 写在模块加载链的**哪一步**、有没有被前面的
    // 异常半路打断、列名拼错没有 —— 都只有真起一次才知道，而这条链一坏就是整台服务端起不来。
    const dir = mkdtempSync(path.join(os.tmpdir(), 'yz-conv-src-'));
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    try {
      const mod = await import('../src/db.js');
      const cols = (mod.db.prepare(`SELECT name FROM pragma_table_info('conversation')`).all() as Array<{ name: string }>)
        .map((c) => c.name);
      expect(cols, '★ 服务端库启动后没有 source 列 —— 页面内对话历史一开就报 no such column').toContain('source');
      expect(cols).toContain('source_meta_json');
      // 建出来的列必须真的能写能读（列名拼错时 pragma 也可能"有"，但写入会报错）
      mod.db.prepare(
        'INSERT INTO conversation (id, user_id, title, source, source_meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run('c_smoke', 'guest', '冒烟', 'browser-page', '{"host":"example.com"}', 1, 1);
      const row = mod.db.prepare('SELECT source, source_meta_json FROM conversation WHERE id = ?').get('c_smoke') as any;
      expect(row.source).toBe('browser-page');
      expect(parseSourceMeta(row.source_meta_json).host).toBe('example.com');
    } finally {
      if (prev === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prev;
      // ★ Windows 上删不干净是正常的：本测试导入的 db.ts 会一直持有 data.db 的句柄，
      //   文件在进程退出前不会释放（EPERM）。临时目录本身可丢，故容错即可 ——
      //   这里若直接 rmSync，测试会因为"清理失败"变红，看起来像功能坏了。
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* 句柄未释放，留给系统清理 */ }
    }
  });

  it('★ 路由：POST 写来源、GET 按来源过滤 —— 两处都不能少', () => {
    const src = readSrc('routes/conversations.ts');
    expect(src).toContain('normalizeConversationSource');
    expect(src).toContain('normalizeSourceMeta');
    expect(src, '★ GET / 少了来源过滤 ⇒ 历史入口拿不到数据').toContain('sourceFilterClause');
    // INSERT 的列清单里必须带上两列（只加 body 解析不加列 = 值被静默丢弃）
    expect(src).toContain('source, source_meta_json');
  });
});

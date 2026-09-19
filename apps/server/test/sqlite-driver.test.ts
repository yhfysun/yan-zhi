// SQLite 驱动自适配单测（sql.js 回退路径）。
//
// 为什么值得测：这是移动端内嵌后端能不能起起来的命门 —— nodejs-mobile(ABI 108)
// 装不到 better-sqlite3 原生二进制，全靠 sql.js shim 撑住 better-sqlite3 同款
// 接口面。任何一处语义偏差（get 返回 undefined、事务没回滚、落盘丢数据），
// 表现都是「桌面正常、手机上后端起不来/数据错乱」，最难归因。
// 走 forceDriver 强制 sql.js 路径，桌面机上也能钉死回退语义。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSqlite } from '../src/services/sqlite-driver.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-sqljs-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const dbPath = () => path.join(dir, 'data.db');

describe('openSqlite · sql.js 回退驱动', () => {
  it('强制 sql.js 时返回 sql.js 驱动', async () => {
    const { driver } = await openSqlite(dbPath(), { forceDriver: 'sql.js' });
    expect(driver).toBe('sql.js');
  });

  it('exec 建表 + prepare run/get/all 全链路', async () => {
    const { db } = await openSqlite(dbPath(), { forceDriver: 'sql.js' });
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER, s TEXT)');
    const ins = db.prepare('INSERT INTO t (id, n, s) VALUES (?, ?, ?)');
    const r1 = ins.run('a', 1, '甲');
    expect(r1.changes).toBe(1);
    ins.run('b', 2, '乙');

    expect(db.prepare('SELECT * FROM t WHERE id = ?').get('a')).toEqual({ id: 'a', n: 1, s: '甲' });
    expect(db.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 2 });
    expect(db.prepare('SELECT * FROM t ORDER BY n').all()).toHaveLength(2);
    // 不存在的行 → undefined（与 better-sqlite3 语义一致）
    expect(db.prepare('SELECT * FROM t WHERE id = ?').get('zz')).toBeUndefined();
  });

  it('事务：★ transaction 不立即执行，返回事务函数（better-sqlite3 契约）', async () => {
    const { db } = await openSqlite(dbPath(), { forceDriver: 'sql.js' });
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');

    // 只创建、不调用 → 不得有任何写入（better-sqlite3 语义，曾按立即执行写错过）
    db.transaction(() => {
      db.prepare('INSERT INTO t (id) VALUES (?)').run('never');
    });
    expect(db.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 0 });

    // IIFE：创建即调用
    db.transaction(() => {
      db.prepare('INSERT INTO t (id) VALUES (?)').run('keep');
    })();
    expect(db.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 1 });

    // 先创建后调用 + 回滚不留痕
    const insertDrop = db.transaction((v: string) => {
      db.prepare('INSERT INTO t (id) VALUES (?)').run(v);
      throw new Error('炸点');
    });
    expect(() => insertDrop('drop')).toThrow('炸点');
    const ids = db.prepare('SELECT id FROM t').all().map((r: any) => r.id);
    expect(ids).toEqual(['keep']);
  });

  it('中文与 null 值绑定不变形', async () => {
    const { db } = await openSqlite(dbPath(), { forceDriver: 'sql.js' });
    db.exec('CREATE TABLE t (s TEXT, n INTEGER)');
    db.prepare('INSERT INTO t (s, n) VALUES (?, ?)').run('手机推荐报告', null);
    const row = db.prepare('SELECT s, n FROM t').get() as any;
    expect(row.s).toBe('手机推荐报告');
    expect(row.n).toBeNull();
  });

  it('常用 PRAGMA 不抛错（WAL 等不适用的静默忽略）', async () => {
    const { db } = await openSqlite(dbPath(), { forceDriver: 'sql.js' });
    expect(() => db.pragma('journal_mode = WAL')).not.toThrow();
    expect(() => db.pragma('foreign_keys = ON')).not.toThrow();
    expect(() => db.pragma('defer_foreign_keys = ON')).not.toThrow();
  });

  it('落盘持久化：防抖窗口后重开，数据还在', async () => {
    const p = dbPath();
    {
      const { db } = await openSqlite(p, { forceDriver: 'sql.js' });
      db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, s TEXT)');
      db.prepare('INSERT INTO t (id, s) VALUES (?, ?)').run('a', '中文数据');
      // 防抖 250ms，等一轮落盘
      await new Promise((r) => setTimeout(r, 500));
    }
    const { db: db2 } = await openSqlite(p, { forceDriver: 'sql.js' });
    expect(db2.prepare('SELECT s FROM t WHERE id = ?').get('a')).toEqual({ s: '中文数据' });
    db2.close();
  });

  it('close() 立即落盘（不依赖防抖）', async () => {
    const p = dbPath();
    {
      const { db } = await openSqlite(p, { forceDriver: 'sql.js' });
      db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
      db.prepare('INSERT INTO t (id) VALUES (?)').run('x');
      db.close();
    }
    const { db: db2 } = await openSqlite(p, { forceDriver: 'sql.js' });
    expect(db2.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 1 });
    db2.close();
  });

  it('临时文件不残留（tmp+rename 原子替换）', async () => {
    const p = dbPath();
    const { db } = await openSqlite(p, { forceDriver: 'sql.js' });
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO t (id) VALUES (?)').run('x');
    await new Promise((r) => setTimeout(r, 500));
    expect(fs.existsSync(p + '.tmp')).toBe(false);
    db.close();
  });
});

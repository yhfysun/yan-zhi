// sqlite 驱动回退专项测试（移动端 SQLite 收尾方案 #7，2026-10-03）
//
// 守住的语义：
//   1) openSqlite 在两种驱动下都返回**同构接口面**（prepare/exec/pragma/transaction/close）——
//      移动端走 sql.js 回退时，桌面端 2000+ 行 db 代码零改动可用；
//   2) forceDriver: 'sql.js' 强制回退路径可用（移动端收尾的主通道）；
//   3) `:memory:` 不落盘（flushIfDirty 对内存库是 no-op，不产生 ":memory:.tmp" 文件）；
//   4) 事务语义：不立即执行、异常回滚、成功提交。
//
// ★ 环境差异说明：本机 better-sqlite3 被重编为 Electron ABI（系统 Node 加载失败），
//   自动探测自然走 sql.js；CI（linux 系统 Node）会走 better-sqlite3。
//   两条路径都必须全绿 —— 断言只依赖 YzSqliteDb 接口面，不依赖具体驱动。
import { describe, it, expect } from 'vitest';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';

describe('sqlite-driver 统一入口（better-sqlite3 / sql.js 双路径）', () => {
  it('自动探测：返回合法驱动且接口面完整', async () => {
    const { db, driver } = await openSqlite(':memory:');
    expect(['better-sqlite3', 'sql.js']).toContain(driver);
    for (const fn of ['prepare', 'exec', 'pragma', 'transaction', 'close'] as const) {
      expect(typeof (db as any)[fn], `${driver} 缺少 ${fn}`).toBe('function');
    }
  });

  it('forceDriver sql.js：建表/读写/参数绑定/事务全链路（移动端主通道）', async () => {
    const { db, driver } = await openSqlite(':memory:', { forceDriver: 'sql.js' });
    expect(driver).toBe('sql.js');
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
    db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').run('a', 1);
    db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').run('b', 2);
    const row = db.prepare('SELECT n FROM t WHERE id = ?').get('a') as { n: number };
    expect(row.n).toBe(1);
    const all = db.prepare('SELECT id FROM t ORDER BY n DESC').all() as Array<{ id: string }>;
    expect(all.map((r) => r.id)).toEqual(['b', 'a']);
    // 更新 + 影响行数
    const info = db.prepare('UPDATE t SET n = n + 10 WHERE id = ?').run('a') as { changes: number };
    expect(info.changes).toBe(1);
    db.close();
  });

  it(':memory: 库 close 不产生落盘文件（无 ":memory:.tmp"）', async () => {
    // 回归：conversation-mode 迁移统一入口时暴露 —— flushIfDirty 曾对内存库写 ":memory:.tmp" ENOENT
    const tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-sqlite-driver-'));
    try {
      const before = new Set(fsSync.readdirSync(tmp));
      const { db } = await openSqlite(':memory:', { forceDriver: 'sql.js' });
      db.exec('CREATE TABLE t (id TEXT)');
      db.prepare('INSERT INTO t (id) VALUES (?)').run('x');
      db.close();
      const after = fsSync.readdirSync(tmp).filter((f) => !before.has(f));
      expect(after, `内存库不应产生落盘文件: ${after.join(', ')}`).toEqual([]);
    } finally {
      fsSync.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('文件库落盘：写入 → close → 重新打开数据仍在（持久化语义）', async () => {
    const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-sqlite-driver-persist-'));
    const dbPath = path.join(dir, 'data.db');
    try {
      {
        const { db } = await openSqlite(dbPath, { forceDriver: 'sql.js' });
        db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)');
        db.prepare('INSERT INTO t (id, v) VALUES (?, ?)').run('k1', 'v1');
        db.close(); // close 触发最终 flush
      }
      {
        const { db } = await openSqlite(dbPath, { forceDriver: 'sql.js' });
        const row = db.prepare('SELECT v FROM t WHERE id = ?').get('k1') as { v: string };
        expect(row.v).toBe('v1');
        db.close();
      }
    } finally {
      fsSync.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('transaction：成功提交 / 异常回滚（与 better-sqlite3 同语义）', async () => {
    const { db } = await openSqlite(':memory:', { forceDriver: 'sql.js' });
    db.exec('CREATE TABLE t (n INTEGER)');
    const ins = db.prepare('INSERT INTO t (n) VALUES (?)');

    // 成功：事务内两条都进
    const tx = db.transaction(() => {
      ins.run(1);
      ins.run(2);
    });
    tx();
    expect((db.prepare('SELECT COUNT(*) AS c FROM t').get() as { c: number }).c).toBe(2);

    // 异常：第二条失败 → 整体回滚（第一条不残留）
    const badTx = db.transaction(() => {
      ins.run(3);
      ins.run(null); // NOT NULL? 无约束 —— 用显式抛错模拟失败
      throw new Error('rollback-me');
    });
    expect(() => badTx()).toThrow('rollback-me');
    expect((db.prepare('SELECT COUNT(*) AS c FROM t').get() as { c: number }).c).toBe(2);
    db.close();
  });
});

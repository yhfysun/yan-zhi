// SQLite 驱动 FTS5 能力守卫回归（2026-11-15 移动端实报）。
// ★ 事故：db.ts 新增 canon_fts（USING fts5）无能力守卫 —— 桌面 better-sqlite3（原生带
//   FTS5）全绿，移动端 sql.js（WASM 无 FTS5）启动即抛 `no such module: fts5` ⇒ 内嵌后端
//   整体起不来（数据空 + 插件快照拿不到 + 模式全部「未启用」）。
// 本测试钉死：① 驱动能力差异真实存在（防 sql.js 升级后误删守卫）；② detectFts5 双驱动
//   判定正确；③ 无守卫的 DDL 在 sql.js 上确实会炸（守卫存在的必要性证据）。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqlite, detectFts5 } from '../src/services/sqlite-driver';

describe('sqlite-driver FTS5 能力探测', () => {
  it('better-sqlite3（原生）带 FTS5：detectFts5 = true，可直接建 fts5 虚表', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yz-fts5-'));
    try {
      const { db, driver } = await openSqlite(join(dir, 'a.db'));
      // CI/沙箱可能装不上原生二进制：拿不到 better-sqlite3 时跳过本断言（sql.js 用例仍钉守卫）
      if (driver === 'better-sqlite3') {
        expect(detectFts5(db)).toBe(true);
        expect(() => db.exec('CREATE VIRTUAL TABLE temp.t USING fts5(a)')).not.toThrow();
      }
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★ sql.js（WASM）无 FTS5：detectFts5 = false；无守卫 DDL 确实抛 no such module（守卫必要性）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yz-fts5-'));
    try {
      const { db, driver } = await openSqlite(join(dir, 'b.db'), { forceDriver: 'sql.js' });
      expect(driver).toBe('sql.js');
      expect(detectFts5(db)).toBe(false);
      let msg = '';
      try {
        db.exec('CREATE VIRTUAL TABLE temp.t USING fts5(a)');
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
      expect(msg).toContain('no such module: fts5');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detectFts5 探测无残留：temp 探测表不落主 schema（重复探测幂等）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yz-fts5-'));
    try {
      const { db } = await openSqlite(join(dir, 'c.db'), { forceDriver: 'sql.js' });
      expect(detectFts5(db)).toBe(false);
      expect(detectFts5(db)).toBe(false);
      const rows = db.prepare(
        "SELECT name FROM sqlite_master WHERE name LIKE '%yz_fts5_probe%'",
      ).all() as Array<{ name: string }>;
      expect(rows).toHaveLength(0);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

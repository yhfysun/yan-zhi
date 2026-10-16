// 页面指令：建表 + 内置种子 + 排序查询的真库守门测试（2026-10-16 · 页面内对话与页面指令方案 §5 P1）。
//
// 为什么用真 sqlite 跑（不是断言源码文本）：
//   ① DDL/种子是**在服务端路由模块加载时执行的 SQL**，写错的表现是启动告警 + 面板永远"暂无匹配指令"
//      （用户看不出错在哪，只会以为功能没做）；
//   ② upsert 的口径必须是"内容覆盖、**用户配置不覆盖**"—— 用户停用过的内置指令不能因为升级又冒出来；
//   ③ 列表排序（站点专属在前、全局在后）是 UI 命中顺序的依据，SQL 写错会静默改变交互。

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { BUILTIN_PAGE_COMMANDS_SEED, PAGE_COMMAND_DDL, PAGE_COMMAND_RUN_DDL, seedBuiltinPageCommands } from '@yan-zhi/core';

/** 按服务端启动时的同一条路径建表 + 灌种子（内存库，不碰真实数据） */
async function freshDb() {
  const db = new Database(':memory:');
  db.exec(PAGE_COMMAND_DDL);
  await seedBuiltinPageCommands((sql: string, params?: any[]) => {
    db.prepare(sql).run(...((params || []) as any[]));
    return Promise.resolve();
  });
  return db;
}

describe('★ 页面指令表结构 + 内置种子', () => {
  it('建表成功，且内置种子全部落库（kind 合法 / source=builtin / 全局可见）', async () => {
    const db = await freshDb();
    const rows = db.prepare('SELECT * FROM browser_page_command').all() as any[];
    expect(rows.length).toBe(BUILTIN_PAGE_COMMANDS_SEED.length);
    // 首批任务型 ≥6 条（方案口径 6–8 条）；P2 起另有脚本样例
    expect(rows.filter((r: any) => r.kind === 'task').length).toBeGreaterThanOrEqual(6);
    for (const r of rows) {
      expect(['task', 'script']).toContain(r.kind);
      expect(r.source).toBe('builtin');
      expect(r.user_id).toBeNull();                         // 内置 = 所有人可见
      expect(String(r.body).trim().length).toBeGreaterThan(6);
      expect(r.enabled).toBe(1);
    }
  });

  it('内置指令 id 唯一，且至少有一条站点专属（示例指令）', async () => {
    const db = await freshDb();
    const ids = (db.prepare('SELECT id FROM browser_page_command').all() as any[]).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const siteRows = db.prepare(`SELECT * FROM browser_page_command WHERE match_host <> '*'`).all() as any[];
    expect(siteRows.length).toBeGreaterThanOrEqual(1);
  });

  it('★ 重复灌种子幂等：不产生重复行，且**不覆盖用户改过的 enabled**', async () => {
    const db = await freshDb();
    const target = BUILTIN_PAGE_COMMANDS_SEED[0].id;
    db.prepare('UPDATE browser_page_command SET enabled = 0 WHERE id = ?').run(target);   // 用户停用
    await seedBuiltinPageCommands((sql: string, params?: any[]) => {
      db.prepare(sql).run(...((params || []) as any[]));
      return Promise.resolve();
    });
    const rows = db.prepare('SELECT * FROM browser_page_command').all() as any[];
    expect(rows.length).toBe(BUILTIN_PAGE_COMMANDS_SEED.length);                          // 没有翻倍
    const row = db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(target) as any;
    expect(row.enabled).toBe(0);   // ★ 用户停用了就保持停用（升级不该把配置打回去）
  });

  it('★ 列表排序：站点专属在前、全局在后（与路由 GET 的 SQL 同口径）', async () => {
    const db = await freshDb();
    db.prepare(
      `INSERT INTO browser_page_command
         (id, user_id, name, kind, body, match_host, source, enabled, need_confirm, run_count, created_at, updated_at)
       VALUES ('pc_user_site', 'u1', '我的站点指令', 'task', '做事', 'kol.fanqieopen.com', 'user', 1, 1, 0, 1, 1)`,
    ).run();
    const rows = db.prepare(
      `SELECT * FROM browser_page_command
        WHERE user_id IS NULL OR user_id = ?
        ORDER BY (match_host = '*') ASC, created_at ASC`,
    ).all('u1') as any[];
    expect(rows[0].id).toBe('pc_user_site');                       // 站点专属排第一
    expect(rows[rows.length - 1].match_host).toBe('*');            // 全局在最后
  });

  it('使用计数与停用开关的 SQL 可用（路由里那两条 UPDATE）', async () => {
    const db = await freshDb();
    const id = BUILTIN_PAGE_COMMANDS_SEED[0].id;
    db.prepare('UPDATE browser_page_command SET run_count = run_count + 1, last_used_at = ? WHERE id = ?').run(Date.now(), id);
    db.prepare('UPDATE browser_page_command SET enabled = ?, updated_at = ? WHERE id = ?').run(0, Date.now(), id);
    const r = db.prepare('SELECT * FROM browser_page_command WHERE id = ?').get(id) as any;
    expect(r.run_count).toBe(1);
    expect(typeof r.last_used_at).toBe('number');   // INTEGER 毫秒（与既有表同口径）
    expect(r.enabled).toBe(0);
  });
});

describe('★ P2：脚本样例 + 执行审计', () => {
  it('内置脚本样例：kind=script，且 need_confirm 恒为 1（内置永远每次确认）', async () => {
    const db = await freshDb();
    const scripts = db.prepare(`SELECT * FROM browser_page_command WHERE kind = 'script'`).all() as any[];
    expect(scripts.length).toBeGreaterThanOrEqual(1);          // 方案要求"内置若干只读脚本样例"
    for (const s of scripts) {
      expect(s.need_confirm).toBe(1);                          // 升级/重灌种子都不该变成 0
      expect(String(s.body).trim().length).toBeGreaterThan(10);
    }
    // 再灌一次种子：仍必须是 1（防止某次改动把 need_confirm 也 upsert 成 0）
    await seedBuiltinPageCommands((sql: string, params?: any[]) => {
      db.prepare(sql).run(...((params || []) as any[]));
      return Promise.resolve();
    });
    const again = db.prepare(`SELECT need_confirm FROM browser_page_command WHERE kind = 'script'`).all() as any[];
    expect(again.every((r) => r.need_confirm === 1)).toBe(true);
  });

  it('审计表可建可写：只存摘要与元信息，不落脚本/页面内容', () => {
    const db = new Database(':memory:');
    db.exec(PAGE_COMMAND_DDL);
    db.exec(PAGE_COMMAND_RUN_DDL);
    db.prepare(
      `INSERT INTO browser_command_run
         (id, command_id, command_name, command_kind, user_id, tab_id, url, host,
          started_at, ended_at, duration_ms, status, result_digest, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('run_1', 'pc_script_links_json', '导出本页链接（JSON）', 'script', 'u1',
          'tab-1', 'https://x.com/a', 'x.com', 1000, 1042, 42, 'ok', 'len=12 hash=abc', null);
    const r = db.prepare('SELECT * FROM browser_command_run WHERE id = ?').get('run_1') as any;
    expect(r.duration_ms).toBe(42);
    expect(r.status).toBe('ok');
    expect(r.result_digest).toBe('len=12 hash=abc');
    expect(r.command_name).toBe('导出本页链接（JSON）');   // 快照：指令改名/删除后审计仍可读
  });

  it('审计按指令 + 时间倒序可查（UI「执行记录」的 SQL 口径）', () => {
    const db = new Database(':memory:');
    db.exec(PAGE_COMMAND_RUN_DDL);
    const ins = db.prepare(
      `INSERT INTO browser_command_run
         (id, command_id, command_name, command_kind, user_id, started_at, ended_at, duration_ms, status)
       VALUES (?, 'pc_x', 'X', 'script', 'u1', ?, ?, 1, ?)`,
    );
    ins.run('r1', 1000, 1001, 'ok');
    ins.run('r2', 3000, 3001, 'error');
    ins.run('r3', 2000, 2001, 'ok');
    const rows = db.prepare('SELECT id FROM browser_command_run WHERE command_id = ? ORDER BY started_at DESC LIMIT ?').all('pc_x', 20) as any[];
    expect(rows.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });
});

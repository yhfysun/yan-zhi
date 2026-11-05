import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import datasourcesRouter from '../src/routes/datasources.js';
import { db } from '../src/db.js';
import { invalidateConnector } from '../src/services/connector.js';
import {
  applyDataEdit,
  listDataEditAudits,
  preflightDataEdit,
} from '../src/services/data-edit.js';
import { openSqlite } from '../src/services/sqlite-driver.js';

vi.mock('../src/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'u_data_edit_test' };
    next();
  },
}));

const USER_ID = 'u_data_edit_test';
const DS_ID = 'ds_data_edit_test';
let tempDir = '';
let sqliteFile = '';
let server: Server | null = null;
let base = '';

async function seedSqlite(rows: Array<{ id: number; name: string; status: string }>): Promise<void> {
  const { db: external } = await openSqlite(sqliteFile, { forceDriver: 'sql.js' });
  external.exec('CREATE TABLE account (id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL)');
  for (const row of rows) {
    external.prepare('INSERT INTO account (id, name, status) VALUES (?, ?, ?)').run(row.id, row.name, row.status);
  }
  external.close();
}

async function readAccounts(): Promise<Array<{ id: number; name: string; status: string }>> {
  const { db: external } = await openSqlite(sqliteFile, { forceDriver: 'sql.js' });
  const rows = external.prepare('SELECT id, name, status FROM account ORDER BY id').all() as Array<{
    id: number;
    name: string;
    status: string;
  }>;
  external.close();
  return rows;
}

function seedDataSource(allowWrite: boolean): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO data_source
      (id, user_id, name, type, file_path, readonly, allow_write, status, created_at, updated_at)
     VALUES (?, ?, ?, 'sqlite', ?, ?, ?, 'ok', ?, ?)`,
  ).run(DS_ID, USER_ID, '编辑测试库', sqliteFile, allowWrite ? 0 : 1, allowWrite ? 1 : 0, now, now);
}

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-data-edit-'));
  sqliteFile = path.join(tempDir, 'external.db');
  await seedSqlite([
    { id: 1, name: 'Alice', status: 'active' },
    { id: 2, name: 'Bob', status: 'active' },
    { id: 3, name: 'Carol', status: 'disabled' },
  ]);
  seedDataSource(true);
});

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/datasources', datasourcesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server!.address() as { port: number }).port}/api/datasources`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server!.close(() => resolve()));
});

afterEach(() => {
  invalidateConnector(DS_ID);
  db.prepare('DELETE FROM data_edit_audit WHERE datasource_id = ?').run(DS_ID);
  db.prepare('DELETE FROM data_source WHERE id = ?').run(DS_ID);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Windows 上连接关闭后偶有短暂句柄延迟，不影响断言
  }
});

describe('数据编辑通道', () => {
  it('预检在事务内执行后回滚，并返回短期确认令牌与实际影响行数', async () => {
    const preview = await preflightDataEdit(USER_ID, DS_ID, {
      sql: "UPDATE account SET status = 'frozen' WHERE status = 'active'",
    });

    expect(preview).toMatchObject({
      action: 'update',
      affectedRows: 2,
      datasourceId: DS_ID,
    });
    expect(preview.token).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.expiresAt).toBeGreaterThan(Date.now());
    expect(await readAccounts()).toEqual([
      { id: 1, name: 'Alice', status: 'active' },
      { id: 2, name: 'Bob', status: 'active' },
      { id: 3, name: 'Carol', status: 'disabled' },
    ]);
    expect(listDataEditAudits(USER_ID, DS_ID)[0]).toMatchObject({
      id: preview.auditId,
      status: 'preflight',
      affectedRows: 2,
    });
  });

  it('确认后在真实事务中提交、更新审计，并且令牌只能使用一次', async () => {
    const preview = await preflightDataEdit(USER_ID, DS_ID, {
      sql: 'DELETE FROM account WHERE status = ?',
      params: ['disabled'],
    });
    const applied = await applyDataEdit(USER_ID, DS_ID, preview.token);

    expect(applied).toMatchObject({ ok: true, auditId: preview.auditId, affectedRows: 1 });
    expect(await readAccounts()).toEqual([
      { id: 1, name: 'Alice', status: 'active' },
      { id: 2, name: 'Bob', status: 'active' },
    ]);
    expect(listDataEditAudits(USER_ID, DS_ID)[0]).toMatchObject({
      id: preview.auditId,
      status: 'applied',
      affectedRows: 1,
    });

    await expect(applyDataEdit(USER_ID, DS_ID, preview.token)).rejects.toThrow(/失效|使用/);
  });

  it('只读数据源在预检阶段拒绝，不产生令牌或数据库变更', async () => {
    seedDataSource(false);
    invalidateConnector(DS_ID);

    await expect(preflightDataEdit(USER_ID, DS_ID, {
      sql: "UPDATE account SET status = 'frozen' WHERE status = 'active'",
    })).rejects.toThrow(/允许写|写操作/);

    expect(await readAccounts()).toEqual([
      { id: 1, name: 'Alice', status: 'active' },
      { id: 2, name: 'Bob', status: 'active' },
      { id: 3, name: 'Carol', status: 'disabled' },
    ]);
  });

  it('预检后即使同一毫秒修改连接配置，确认令牌也必须失效', async () => {
    const before = db.prepare('SELECT updated_at FROM data_source WHERE id = ?').get(DS_ID) as {
      updated_at: number;
    };
    const preview = await preflightDataEdit(USER_ID, DS_ID, {
      sql: "UPDATE account SET status = 'frozen' WHERE status = 'active'",
    });
    db.prepare('UPDATE data_source SET username = ?, updated_at = ? WHERE id = ?')
      .run('changed-user', before.updated_at, DS_ID);

    await expect(applyDataEdit(USER_ID, DS_ID, preview.token)).rejects.toThrow(/配置已变更/);
    expect(await readAccounts()).toEqual([
      { id: 1, name: 'Alice', status: 'active' },
      { id: 2, name: 'Bob', status: 'active' },
      { id: 3, name: 'Carol', status: 'disabled' },
    ]);
  });

  it('HTTP 路由串联预检、确认和审计查询', async () => {
    const previewRes = await fetch(`${base}/${DS_ID}/data-edit/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: "UPDATE account SET status = 'frozen' WHERE status = 'active'" }),
    });
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()).data as {
      token: string;
      auditId: string;
      affectedRows: number;
    };
    expect(preview.affectedRows).toBe(2);

    const applyRes = await fetch(`${base}/${DS_ID}/data-edit/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: preview.token }),
    });
    expect(applyRes.status).toBe(200);
    expect((await applyRes.json()).data).toMatchObject({
      ok: true,
      auditId: preview.auditId,
      affectedRows: 2,
    });

    const auditRes = await fetch(`${base}/${DS_ID}/data-edit/audits`);
    expect(auditRes.status).toBe(200);
    expect((await auditRes.json()).data[0]).toMatchObject({
      id: preview.auditId,
      status: 'applied',
      affectedRows: 2,
    });
  });
});

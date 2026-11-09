// 数据源管理服务（P1.3）：CRUD + 内置项目库 ensure + 测试连接/拉取结构的编排。
// 密码 AES-GCM 加密存储（utils/crypto.ts），任何接口不回显明文，只返回 hasPassword。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import {
  DATASOURCE_TYPES,
  encryptPassword,
  getConnector,
  invalidateConnector,
  type DataSourceRow,
  type SchemaTable,
  type TestResult,
} from './connector.js';
import { guardSqlConsole } from './sql-guard.js';
import { inferRelations, type RelationSuggestion } from './ontology-relation-infer.js';

export interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
  host: string | null;
  port: number | null;
  database: string | null;
  serviceName: string | null;
  filePath: string | null;
  username: string | null;
  readonly: boolean;
  allowWrite: boolean;
  status: string;
  lastError: string | null;
  lastTestAt: number | null;
  schemaSyncedAt: number | null;
  tableCount: number | null;
  builtin: boolean;
  hasPassword: boolean;
  ssl?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface CreateInput {
  name: string;
  type: string;
  host?: string;
  port?: number;
  database?: string;
  serviceName?: string;
  filePath?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  readonly?: boolean;
  allowWrite?: boolean;
}

function getRow(userId: string, id: string): DataSourceRow | undefined {
  return db.prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?').get(id, userId) as
    | DataSourceRow
    | undefined;
}

// ===== 写权限 15 分钟窗口（2.3b）=====
// allow_write 不再是持久开关：打开时记 write_enabled_at，窗口过完自动视为关闭并懒重置。
// 所有「能否写」判定一律走 isWriteAllowed，别直接读 row.allow_write。
export const WRITE_WINDOW_MS = 15 * 60_000;

/** 唯一判定出口：allow_write=1 且打开时刻在 15 分钟窗口内。过期顺带落库重置（懒失效）。 */
export function isWriteAllowed(row: DataSourceRow, now = Date.now()): boolean {
  if (!row.allow_write || row.write_enabled_at == null) return false;
  if (now - row.write_enabled_at > WRITE_WINDOW_MS) {
    db.prepare(
      'UPDATE data_source SET allow_write = 0, write_enabled_at = NULL, updated_at = ? WHERE id = ? AND allow_write = 1',
    ).run(now, row.id);
    return false;
  }
  return true;
}

function toInfo(row: DataSourceRow): DataSourceInfo {
  let ssl = false;
  try {
    ssl = !!(JSON.parse(row.options_json || '{}') as { ssl?: boolean }).ssl;
  } catch {
    ssl = false;
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    host: row.host,
    port: row.port,
    database: row.database,
    serviceName: row.service_name,
    filePath: row.file_path,
    username: row.username,
    readonly: !!row.readonly,
    // 视图输出走窗口判定（不触发落库重置），前端开关状态与真实可写一致
    allowWrite: row.allow_write === 1 && row.write_enabled_at != null && Date.now() - row.write_enabled_at <= WRITE_WINDOW_MS,
    status: row.status,
    lastError: row.last_error,
    lastTestAt: row.last_test_at,
    schemaSyncedAt: row.schema_synced_at,
    tableCount: row.table_count,
    builtin: !!row.builtin,
    hasPassword: !!row.password_enc,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    ...(ssl ? { ssl: true } : {}),
  };
}

function validateInput(type: string, input: CreateInput): string | null {
  if (!(DATASOURCE_TYPES as readonly string[]).includes(type)) {
    return `不支持的数据源类型: ${type}（可选 ${DATASOURCE_TYPES.join(' / ')}，文档型 Mongo/Elastic 在 P5 落地）`;
  }
  if (!input.name?.trim()) return '名称不能为空';
  if (type === 'sqlite' && !input.filePath?.trim()) return 'SQLite 数据源必须填写文件路径';
  if ((type === 'mysql' || type === 'postgres') && !input.host?.trim()) return '主机不能为空';
  if ((type === 'mysql' || type === 'postgres') && !input.database?.trim()) return '数据库名不能为空';
  return null;
}

function optionsJson(input: CreateInput): string {
  const opts: Record<string, unknown> = {};
  if (input.ssl) opts.ssl = true;
  return JSON.stringify(opts);
}

/** 内置项目库数据源：确定性 id（ds_project_{userId}），存在即跳过（幂等，多用户就绪） */
export function ensureProjectDataSource(userId: string): void {
  const id = `ds_project_${userId}`;
  if (db.prepare('SELECT 1 FROM data_source WHERE id = ?').get(id)) return;
  const now = Date.now();
  // 名称被用户自建数据源占用时自动让位，保证内置库始终能建出来
  let name = '言智项目库';
  for (let i = 2; db.prepare('SELECT 1 FROM data_source WHERE user_id = ? AND name = ?').get(userId, name); i++) {
    name = `言智项目库 ${i}`;
  }
  db.prepare(
    `INSERT INTO data_source
       (id, user_id, name, type, readonly, allow_write, builtin, status, created_at, updated_at)
     VALUES (?, ?, ?, 'project', 1, 0, 1, 'ok', ?, ?)`,
  ).run(id, userId, name, now, now);
}

export function listDataSources(userId: string): DataSourceInfo[] {
  ensureProjectDataSource(userId);
  const rows = db
    .prepare('SELECT * FROM data_source WHERE user_id = ? ORDER BY builtin DESC, created_at ASC')
    .all(userId) as DataSourceRow[];
  return rows.map(toInfo);
}

export function createDataSource(userId: string, input: CreateInput): DataSourceInfo {
  const err = validateInput(input.type, input);
  if (err) throw new Error(err);
  const id = `ds_${uuid().slice(0, 12)}`;
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO data_source
         (id, user_id, name, type, host, port, database, service_name, file_path,
          username, password_enc, options_json, readonly, allow_write, write_enabled_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?)`,
    ).run(
      id,
      userId,
      input.name.trim(),
      input.type,
      input.host?.trim() || null,
      input.port ?? null,
      input.database?.trim() || null,
      input.serviceName?.trim() || null,
      input.filePath?.trim() || null,
      input.username?.trim() || null,
      input.password ? encryptPassword(input.password) : null,
      optionsJson(input),
      input.allowWrite ? 0 : 1,
      input.allowWrite ? 1 : 0,
      input.allowWrite ? now : null,
      now,
      now,
    );
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      throw new Error(`同名数据源已存在: ${input.name.trim()}`);
    }
    throw e;
  }
  return toInfo(getRow(userId, id)!);
}

export function updateDataSource(userId: string, id: string, patch: Partial<CreateInput>): DataSourceInfo {
  const row = getRow(userId, id);
  if (!row) throw new Error('数据源不存在');
  if (row.builtin) throw new Error('内置项目库数据源不可修改');
  const merged: CreateInput = {
    name: patch.name ?? row.name,
    type: patch.type ?? row.type,
    host: patch.host ?? row.host ?? undefined,
    port: patch.port ?? row.port ?? undefined,
    database: patch.database ?? row.database ?? undefined,
    serviceName: patch.serviceName ?? row.service_name ?? undefined,
    filePath: patch.filePath ?? row.file_path ?? undefined,
    username: patch.username ?? row.username ?? undefined,
    readonly: undefined,
    // 不传保持原值（原来取反兜底会把不带 allowWrite 的改名请求误翻转写权限）
    allowWrite: patch.allowWrite ?? !!row.allow_write,
  };
  const err = validateInput(merged.type, merged);
  if (err) throw new Error(err);
  // 写窗口：allowWrite 关→开时重新计时；开着不改名不重置；开→关清空时刻
  const openingWrite = !!merged.allowWrite && !row.allow_write;
  const closingWrite = !merged.allowWrite && !!row.allow_write;
  const writeEnabledAt = closingWrite || !merged.allowWrite
    ? null
    : openingWrite
      ? Date.now()
      : row.write_enabled_at;
  // 密码策略：不传 = 保持原值；传空串 = 清除
  const passwordEnc =
    patch.password === undefined
      ? row.password_enc
      : patch.password
        ? encryptPassword(patch.password)
        : null;
  const ssl = patch.ssl ?? !!(JSON.parse(row.options_json || '{}') as { ssl?: boolean }).ssl;
  db.prepare(
    `UPDATE data_source SET
       name = ?, type = ?, host = ?, port = ?, database = ?, service_name = ?, file_path = ?,
       username = ?, password_enc = ?, options_json = ?, readonly = ?, allow_write = ?, write_enabled_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  ).run(
    merged.name!.trim(),
    merged.type,
    merged.host?.trim() || null,
    merged.port ?? null,
    merged.database?.trim() || null,
    merged.serviceName?.trim() || null,
    merged.filePath?.trim() || null,
    merged.username?.trim() || null,
    passwordEnc,
    JSON.stringify(ssl ? { ssl: true } : {}),
    merged.allowWrite ? 0 : 1,
    merged.allowWrite ? 1 : 0,
    writeEnabledAt,
    Date.now(),
    id,
    userId,
  );
  invalidateConnector(id);
  return toInfo(getRow(userId, id)!);
}

export function deleteDataSource(userId: string, id: string): void {
  const row = getRow(userId, id);
  if (!row) throw new Error('数据源不存在');
  if (row.builtin) throw new Error('内置项目库数据源不可删除');
  invalidateConnector(id);
  db.prepare('DELETE FROM data_source WHERE id = ? AND user_id = ?').run(id, userId);
}

/** 测试连接：结果回写 status / last_error / last_test_at（卡片状态列的数据源） */
export async function testDataSource(userId: string, id: string): Promise<TestResult & { name: string }> {
  const row = getRow(userId, id);
  if (!row) throw new Error('数据源不存在');
  const result = await getConnector(row).test();
  db.prepare('UPDATE data_source SET status = ?, last_error = ?, last_test_at = ? WHERE id = ?').run(
    result.ok ? 'ok' : 'error',
    result.ok ? null : (result.error || '连接失败'),
    Date.now(),
    id,
  );
  return { ...result, name: row.name };
}

/** 拉取库表结构：回写 schema_synced_at / table_count，供本体自动生成与富化流水线消费 */
export async function syncDataSourceSchema(userId: string, id: string): Promise<{ tables: SchemaTable[]; tableCount: number }> {
  const row = getRow(userId, id);
  if (!row) throw new Error('数据源不存在');
  try {
    const tables = await getConnector(row).schemaInfo();
    db.prepare('UPDATE data_source SET schema_synced_at = ?, table_count = ?, status = ?, last_error = NULL WHERE id = ?').run(
      Date.now(),
      tables.length,
      'ok',
      id,
    );
    return { tables, tableCount: tables.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare('UPDATE data_source SET status = ?, last_error = ? WHERE id = ?').run('error', msg, id);
    throw err;
  }
}

/** 关联推断（P2.5.3）：按 `xxx_id` 命名与目标表主键给出 N:1 候选，**只建议不落库**。 */
export async function suggestRelations(userId: string, id: string): Promise<RelationSuggestion[]> {
  const row = getRow(userId, id);
  if (!row) throw new Error('数据源不存在');
  const tables = await getConnector(row).schemaInfo();
  return inferRelations(tables.map((t) => ({
    name: t.name,
    kind: t.kind,
    comment: t.comment,
    columns: t.columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk })),
  })));
}

// ===== SQL 控制台（P2.1）=====

export interface ConsoleStatementResult {
  index: number;
  text: string;
  status: 'ok' | 'error' | 'blocked' | 'skipped';
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * 控制台执行：guardSqlConsole 先过护栏（DDL 一律拒、写语句引导走数据编辑通道），
 * 只读语句按序执行，出错即停，未执行到的标 skipped。
 */
export async function runConsole(
  userId: string,
  id: string,
  sql: string,
  opts?: { maxRows?: number; timeoutMs?: number },
): Promise<{ results: ConsoleStatementResult[]; totalMs: number }> {
  const row = getRow(userId, id);
  if (!row) throw new Error('数据源不存在');
  const guard = guardSqlConsole(sql, isWriteAllowed(row));
  const results: ConsoleStatementResult[] = [];
  const start = Date.now();

  const statements = guard.statements;
  for (let index = 0; index < statements.length; index++) {
    const s = statements[index];
    const blocked = guard.blocked.find((b) => b.index === index);
    if (blocked) {
      results.push({ index, text: s.text, status: 'blocked', error: blocked.reason });
      continue;
    }
    try {
      const r = await getConnector(row).query(s.text, {
        maxRows: opts?.maxRows ?? 500,
        timeoutMs: opts?.timeoutMs ?? 30_000,
      });
      results.push({ index, text: s.text, status: 'ok', ...r });
    } catch (err) {
      results.push({ index, text: s.text, status: 'error', error: err instanceof Error ? err.message : String(err) });
      // 顺序执行出错即停，剩余标记 skipped
      for (let j = index + 1; j < statements.length; j++) {
        results.push({ index: j, text: statements[j].text, status: 'skipped', error: '前序语句执行失败，未执行' });
      }
      break;
    }
  }
  return { results, totalMs: Date.now() - start };
}

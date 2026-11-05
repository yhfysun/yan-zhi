import { createHash, randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import {
  getConnector,
  type DataSourceRow,
  type RunParam,
  type WriteExecutionResult,
} from './connector.js';
import { guardDataEditSql } from './sql-guard.js';

const PREFLIGHT_TTL_MS = 5 * 60_000;
const MAX_PARAMS = 500;
const MAX_PARAMS_JSON_BYTES = 64 * 1024;

export interface DataEditAudit {
  id: string;
  datasourceId: string;
  action: string;
  sql: string;
  params: RunParam[];
  status: 'preflight' | 'applied' | 'failed' | 'rejected' | 'expired';
  affectedRows: number | null;
  error: string | null;
  createdAt: number;
  appliedAt: number | null;
}

interface PendingEdit {
  token: string;
  auditId: string;
  userId: string;
  datasourceId: string;
  sourceVersion: string;
  action: 'insert' | 'update' | 'delete';
  sql: string;
  params: RunParam[];
  expiresAt: number;
}

interface AuditRow {
  id: string;
  datasource_id: string;
  action: string;
  sql_text: string;
  params_json: string;
  status: DataEditAudit['status'];
  affected_rows: number | null;
  error: string | null;
  created_at: number;
  applied_at: number | null;
}

const pendingEdits = new Map<string, PendingEdit>();

function dataSourceFingerprint(row: DataSourceRow): string {
  return createHash('sha256').update(JSON.stringify([
    row.type,
    row.host,
    row.port,
    row.database,
    row.service_name,
    row.file_path,
    row.username,
    row.password_enc,
    row.options_json,
    row.readonly,
    row.allow_write,
    row.updated_at,
  ])).digest('hex');
}

function getDataSource(userId: string, datasourceId: string): DataSourceRow {
  const row = db
    .prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?')
    .get(datasourceId, userId) as DataSourceRow | undefined;
  if (!row) throw new Error('数据源不存在');
  return row;
}

function safeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/:\/\/[^:]+:[^@]+@/g, '://***:***@');
}

function normalizeParams(input: unknown): RunParam[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('params 必须是数组');
  if (input.length > MAX_PARAMS) throw new Error(`绑定参数最多 ${MAX_PARAMS} 个`);
  const params = input.map((value, index) => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    throw new Error(`params[${index}] 只支持字符串、数字、布尔值或 null`);
  });
  if (Buffer.byteLength(JSON.stringify(params), 'utf8') > MAX_PARAMS_JSON_BYTES) {
    throw new Error('绑定参数总大小超过 64KB');
  }
  return params;
}

function cleanupExpiredTokens(now = Date.now()): void {
  for (const [token, pending] of pendingEdits) {
    if (pending.expiresAt > now) continue;
    pendingEdits.delete(token);
    db.prepare(
      "UPDATE data_edit_audit SET status = 'expired', error = ? WHERE id = ? AND status = 'preflight'",
    ).run('确认令牌已过期，未执行写入', pending.auditId);
  }
}

function insertAudit(input: {
  userId: string;
  datasourceId: string;
  action: string;
  sql: string;
  params: RunParam[];
  status: DataEditAudit['status'];
  affectedRows?: number | null;
  error?: string | null;
}): string {
  const id = `dea_${uuid()}`;
  db.prepare(
    `INSERT INTO data_edit_audit
      (id, user_id, datasource_id, action, sql_text, params_json, status, affected_rows, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.datasourceId,
    input.action,
    input.sql,
    JSON.stringify(input.params),
    input.status,
    input.affectedRows ?? null,
    input.error ?? null,
    Date.now(),
  );
  return id;
}

function parseAudit(row: AuditRow): DataEditAudit {
  let params: RunParam[] = [];
  try {
    const parsed = JSON.parse(row.params_json || '[]');
    if (Array.isArray(parsed)) params = parsed as RunParam[];
  } catch {
    // 历史坏数据不影响审计列表打开
  }
  return {
    id: row.id,
    datasourceId: row.datasource_id,
    action: row.action,
    sql: row.sql_text,
    params,
    status: row.status,
    affectedRows: row.affected_rows,
    error: row.error,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

function executeWrite(
  row: DataSourceRow,
  sql: string,
  params: RunParam[],
  rollback: boolean,
): Promise<WriteExecutionResult> {
  const connector = getConnector(row);
  if (!connector.executeWrite) {
    throw new Error(
      `${row.type} 数据源暂不支持事务化数据编辑；当前支持 SQLite / MySQL / PostgreSQL，以及 Oracle / 达梦的无参数 DML`,
    );
  }
  return connector.executeWrite(sql, params, { rollback, timeoutMs: 30_000 });
}

export interface DataEditPreflightResult {
  token: string;
  auditId: string;
  datasourceId: string;
  action: 'insert' | 'update' | 'delete';
  affectedRows: number;
  expiresAt: number;
  statement: string;
}

/**
 * 预检：在真实事务中执行并强制回滚，返回影响行数与 5 分钟有效的一次性令牌。
 * 令牌绑定当前数据源版本，预检后若连接配置被修改，确认会失败而不会误写新库。
 */
export async function preflightDataEdit(
  userId: string,
  datasourceId: string,
  input: { sql?: unknown; params?: unknown },
): Promise<DataEditPreflightResult> {
  cleanupExpiredTokens();
  const row = getDataSource(userId, datasourceId);
  const sql = String(input.sql || '').trim();
  let params: RunParam[] = [];
  try {
    params = normalizeParams(input.params);
  } catch (err) {
    insertAudit({
      userId,
      datasourceId,
      action: 'unknown',
      sql,
      params,
      status: 'rejected',
      error: safeError(err),
    });
    throw err;
  }

  if (!row.allow_write || row.readonly) {
    const message = '该数据源未开启写操作或仍为只读，不能执行数据编辑';
    insertAudit({
      userId, datasourceId, action: 'unknown', sql, params, status: 'rejected', error: message,
    });
    throw new Error(message);
  }

  const guard = guardDataEditSql(sql);
  if (!guard.ok || !guard.action || !guard.statement) {
    insertAudit({
      userId,
      datasourceId,
      action: guard.action || 'unknown',
      sql,
      params,
      status: 'rejected',
      error: guard.reason || 'SQL 未通过数据编辑校验',
    });
    throw new Error(guard.reason || 'SQL 未通过数据编辑校验');
  }

  let writeResult: WriteExecutionResult;
  try {
    writeResult = await executeWrite(row, guard.statement, params, true);
  } catch (err) {
    insertAudit({
      userId,
      datasourceId,
      action: guard.action,
      sql: guard.statement,
      params,
      status: 'failed',
      error: safeError(err),
    });
    throw err;
  }

  const auditId = insertAudit({
    userId,
    datasourceId,
    action: guard.action,
    sql: guard.statement,
    params,
    status: 'preflight',
    affectedRows: writeResult.affectedRows,
  });
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + PREFLIGHT_TTL_MS;
  pendingEdits.set(token, {
    token,
    auditId,
    userId,
    datasourceId,
    sourceVersion: dataSourceFingerprint(row),
    action: guard.action,
    sql: guard.statement,
    params,
    expiresAt,
  });
  return {
    token,
    auditId,
    datasourceId,
    action: guard.action,
    affectedRows: writeResult.affectedRows,
    expiresAt,
    statement: guard.statement,
  };
}

export interface DataEditApplyResult {
  ok: true;
  auditId: string;
  affectedRows: number;
  latencyMs: number;
}

/** 二次确认后提交。令牌只能消费一次；数据源版本或写权限变化会拒绝。 */
export async function applyDataEdit(
  userId: string,
  datasourceId: string,
  token: string,
): Promise<DataEditApplyResult> {
  cleanupExpiredTokens();
  const pending = pendingEdits.get(token);
  if (!pending) throw new Error('确认令牌已失效、已使用或不属于当前数据源');
  pendingEdits.delete(token);

  if (pending.userId !== userId || pending.datasourceId !== datasourceId) {
    throw new Error('确认令牌不属于当前用户或数据源');
  }
  if (pending.expiresAt <= Date.now()) {
    db.prepare(
      "UPDATE data_edit_audit SET status = 'expired', error = ? WHERE id = ? AND status = 'preflight'",
    ).run('确认令牌已过期，未执行写入', pending.auditId);
    throw new Error('确认令牌已过期，请重新预检');
  }

  try {
    const row = getDataSource(userId, datasourceId);
    if (dataSourceFingerprint(row) !== pending.sourceVersion) {
      throw new Error('数据源配置已变更，请重新预检');
    }
    if (!row.allow_write || row.readonly) {
      throw new Error('数据源写权限已关闭，不能提交数据编辑');
    }
    const result = await executeWrite(row, pending.sql, pending.params, false);
    db.prepare(
      "UPDATE data_edit_audit SET status = 'applied', affected_rows = ?, error = NULL, applied_at = ? WHERE id = ?",
    ).run(result.affectedRows, Date.now(), pending.auditId);
    return {
      ok: true,
      auditId: pending.auditId,
      affectedRows: result.affectedRows,
      latencyMs: result.latencyMs,
    };
  } catch (err) {
    db.prepare(
      "UPDATE data_edit_audit SET status = 'failed', error = ?, applied_at = ? WHERE id = ?",
    ).run(safeError(err), Date.now(), pending.auditId);
    throw err;
  }
}

export function listDataEditAudits(userId: string, datasourceId: string, limit = 50): DataEditAudit[] {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit) || 50));
  const rows = db.prepare(
    `SELECT * FROM data_edit_audit
     WHERE user_id = ? AND datasource_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(userId, datasourceId, safeLimit) as AuditRow[];
  return rows.map(parseAudit);
}

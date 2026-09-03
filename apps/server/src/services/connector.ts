// 多数据源连接器层（P1.2）：统一 Connector 接口 + 按类型实现 + 连接池缓存。
// 所有外部数据库连接与查询收敛在 server 进程内（Web 端无 shell 跑不了驱动），三端前端只调 API。
// 只读约束：连接器层面尽力强制（PG 会话只读 / SQLite readonly 连接），SQL 文本级护栏在路由层（sql-guard）。
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { encrypt, decrypt } from '../utils/crypto.js';
import type { DialectType } from './dialect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');

export type DataSourceType = DialectType | 'project';

export const DATASOURCE_TYPES: readonly DataSourceType[] = [
  'mysql', 'postgres', 'dm', 'oracle', 'sqlite', 'project',
];

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  latencyMs: number;
}

export interface SchemaColumn {
  name: string;
  type: string;
  pk: boolean;
  nullable: boolean;
  comment?: string;
}

export interface SchemaTable {
  name: string;
  kind: 'table' | 'view';
  comment?: string;
  columns: SchemaColumn[];
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

export interface Connector {
  readonly type: DataSourceType;
  test(): Promise<TestResult>;
  query(sql: string, opts?: { maxRows?: number; timeoutMs?: number }): Promise<QueryResult>;
  schemaInfo(): Promise<SchemaTable[]>;
  close(): void;
}

// ===== 行工具 =====

export interface DataSourceRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  host: string | null;
  port: number | null;
  database: string | null;
  service_name: string | null;
  file_path: string | null;
  username: string | null;
  password_enc: string | null;
  options_json: string | null;
  readonly: number;
  allow_write: number;
  builtin: number;
  status: string;
  last_error: string | null;
  last_test_at: number | null;
  schema_synced_at: number | null;
  table_count: number | null;
  created_at: number;
  updated_at: number;
}

export function parseOptions(row: DataSourceRow): Record<string, unknown> {
  try {
    return JSON.parse(row.options_json || '{}');
  } catch {
    return {};
  }
}

export function getPassword(row: DataSourceRow): string | null {
  if (!row.password_enc) return null;
  try {
    return decrypt(row.password_enc);
  } catch {
    return null;
  }
}

export function encryptPassword(plain: string): string {
  return encrypt(plain);
}

function maskError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // 防止连接串里的密码泄进错误信息
  return msg.replace(/:\/\/[^:]+:[^@]+@/g, '://***:***@');
}

const DEFAULT_MAX_ROWS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * MySQL/PG 行数上限下推：把任意 SELECT 包成派生表加 LIMIT，避免大表全量拉回内存。
 * 已含 LIMIT/FETCH/ROWNUM（宽松全文判断）或非 SELECT（WITH 起头的 CTE 在 MySQL 派生表内兼容性差）时不包，
 * 此时仍由结果集截断兜底。
 */
function withRowCap(sql: string, maxRows: number): string {
  if (maxRows <= 0) return sql;
  if (/limit\s+\d|fetch\s+(first|next)|rownum/i.test(sql)) return sql;
  if (!/^\s*select\b/i.test(sql)) return sql;
  return `SELECT * FROM (${sql}) _yz_cap LIMIT ${maxRows + 1}`;
}

// ===== 项目库 / SQLite（better-sqlite3，同步接口）=====

class SqliteLikeConnector implements Connector {
  readonly type: DataSourceType;
  private conn: Database.Database;

  constructor(type: DataSourceType, file: string, allowWrite: boolean) {
    this.type = type;
    // 项目库与未开写权限的 sqlite 一律 readonly 连接，驱动层禁写
    const readonly = type === 'project' ? true : !allowWrite;
    if (type !== 'project' && !fs.existsSync(file)) {
      throw new Error(`SQLite 文件不存在: ${file}`);
    }
    this.conn = new Database(file, { readonly, fileMustExist: type === 'project' });
  }

  async test(): Promise<TestResult> {
    const start = Date.now();
    try {
      const row = this.conn.prepare('SELECT sqlite_version() AS v').get() as { v: string };
      return { ok: true, latencyMs: Date.now() - start, version: `SQLite ${row.v}` };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: maskError(err) };
    }
  }

  async query(sql: string, opts?: { maxRows?: number }): Promise<QueryResult> {
    const start = Date.now();
    const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;
    const stmt = this.conn.prepare(sql);
    const columns = (stmt.columns() || []).map((c) => c.name);
    const all = stmt.all() as Record<string, unknown>[];
    const rows = all.slice(0, maxRows);
    return {
      columns,
      rows,
      rowCount: rows.length,
      truncated: all.length > maxRows,
      latencyMs: Date.now() - start,
    };
  }

  async schemaInfo(): Promise<SchemaTable[]> {
    const tables = this.conn
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as { name: string; type: string }[];
    const out: SchemaTable[] = [];
    for (const t of tables) {
      const infos = this.conn.prepare(`PRAGMA table_info("${t.name.replaceAll('"', '""')}")`).all() as {
        name: string; type: string; pk: number; notnull: number;
      }[];
      out.push({
        name: t.name,
        kind: t.type === 'view' ? 'view' : 'table',
        columns: infos.map((c) => ({
          name: c.name,
          type: c.type || 'ANY',
          pk: !!c.pk,
          nullable: !c.notnull && !c.pk,
        })),
      });
    }
    return out;
  }

  close(): void {
    this.conn.close();
  }
}

// ===== MySQL（mysql2/promise 连接池）=====

interface MysqlField { name?: string }
type MysqlPool = {
  query: (cfg: { sql: string; timeout?: number }) => Promise<[Record<string, unknown>[], MysqlField[]]>;
  end: () => Promise<void>;
};

class MysqlConnector implements Connector {
  readonly type: DataSourceType = 'mysql';
  private init: Promise<MysqlPool>;

  constructor(row: DataSourceRow) {
    const password = getPassword(row);
    const opts = parseOptions(row);
    this.init = import('mysql2/promise').then(
      (mod) =>
        mod.createPool({
          host: row.host || '127.0.0.1',
          port: row.port || 3306,
          user: row.username || undefined,
          password: password || undefined,
          database: row.database || undefined,
          connectionLimit: 4,
          connectTimeout: DEFAULT_TIMEOUT_MS,
          charset: (opts.charset as string) || 'utf8mb4',
          ...(opts.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
        }) as unknown as MysqlPool,
      (err) => {
        throw new Error(`mysql2 驱动加载失败（请 pnpm add mysql2 --filter @yan-zhi/server）: ${maskError(err)}`);
      },
    );
  }

  private async pool(): Promise<MysqlPool> {
    return this.init;
  }

  async test(): Promise<TestResult> {
    const start = Date.now();
    try {
      const pool = await this.pool();
      const [rows] = await pool.query({ sql: 'SELECT VERSION() AS v', timeout: DEFAULT_TIMEOUT_MS });
      const v = (rows[0] as { v?: string } | undefined)?.v;
      return { ok: true, latencyMs: Date.now() - start, version: `MySQL ${v || ''}`.trim() };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: maskError(err) };
    }
  }

  async query(sql: string, opts?: { maxRows?: number; timeoutMs?: number }): Promise<QueryResult> {
    const start = Date.now();
    const pool = await this.pool();
    const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;
    const [raw, fields] = await pool.query({ sql: withRowCap(sql, maxRows), timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    const rowsAll = raw as Record<string, unknown>[];
    const columns = Array.isArray(fields) && fields.length
      ? fields.map((f) => f.name || '').filter(Boolean)
      : Object.keys(rowsAll[0] || {});
    const rows = rowsAll.slice(0, maxRows);
    return { columns, rows, rowCount: rows.length, truncated: rowsAll.length > maxRows, latencyMs: Date.now() - start };
  }

  async schemaInfo(): Promise<SchemaTable[]> {
    const pool = await this.pool();
    const [rows] = await pool.query({
      sql:
        `SELECT t.TABLE_NAME AS tbl, t.TABLE_TYPE AS kind, t.TABLE_COMMENT AS tbl_comment,
              c.COLUMN_NAME AS col, c.COLUMN_TYPE AS col_type, c.IS_NULLABLE AS nullable,
              c.COLUMN_KEY AS ckey, c.COLUMN_COMMENT AS col_comment, c.ORDINAL_POSITION AS pos
       FROM information_schema.TABLES t
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
       WHERE t.TABLE_SCHEMA = DATABASE()
       ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION`,
      timeout: DEFAULT_TIMEOUT_MS,
    });
    return groupSchema(rows as Record<string, unknown>[], {
      table: 'tbl', kind: 'kind', tableComment: 'tbl_comment', column: 'col',
      colType: 'col_type', nullable: 'nullable', pk: 'ckey', colComment: 'col_comment',
      isView: (kind) => kind === 'VIEW', isPk: (ckey) => ckey === 'PRI',
    });
  }

  close(): void {
    void this.init.then((p) => p.end()).catch(() => {});
  }
}

// ===== PostgreSQL（pg 连接池；只读数据源在会话层强制 default_transaction_read_only）=====

type PgClient = {
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[]; fields: { name: string }[] }>;
  release: () => void;
};
type PgPool = {
  connect: () => Promise<PgClient>;
  end: () => Promise<void>;
};

class PgConnector implements Connector {
  readonly type: DataSourceType = 'postgres';
  private init: Promise<PgPool>;
  private readonly: boolean;

  constructor(row: DataSourceRow) {
    this.readonly = !row.allow_write;
    const password = getPassword(row);
    this.init = import('pg').then(
      (mod) =>
        new mod.Pool({
          host: row.host || '127.0.0.1',
          port: row.port || 5432,
          user: row.username || undefined,
          password: password || undefined,
          database: row.database || 'postgres',
          max: 4,
          connectionTimeoutMillis: DEFAULT_TIMEOUT_MS,
          ssl: parseOptions(row).ssl ? { rejectUnauthorized: false } : undefined,
        }) as unknown as PgPool,
      (err) => {
        throw new Error(`pg 驱动加载失败（请 pnpm add pg --filter @yan-zhi/server）: ${maskError(err)}`);
      },
    );
  }

  private async client(): Promise<PgClient> {
    const pool = await this.init;
    const client = await pool.connect();
    if (this.readonly) {
      await client.query('SET default_transaction_read_only = on');
    }
    return client;
  }

  async test(): Promise<TestResult> {
    const start = Date.now();
    let client: PgClient | null = null;
    try {
      client = await this.client();
      const r = await client.query('SELECT version() AS v');
      return {
        ok: true,
        latencyMs: Date.now() - start,
        version: String((r.rows[0] as { v: string }).v).split(' ').slice(0, 2).join(' '),
      };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: maskError(err) };
    } finally {
      client?.release();
    }
  }

  async query(sql: string, opts?: { maxRows?: number; timeoutMs?: number }): Promise<QueryResult> {
    const start = Date.now();
    const client = await this.client();
    try {
      const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      if (timeout > 0) await client.query(`SET statement_timeout = ${Math.floor(timeout)}`);
      const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;
      const r = await client.query(withRowCap(sql, maxRows));
      const rows = r.rows.slice(0, maxRows);
      return {
        columns: r.fields.map((f) => f.name),
        rows,
        rowCount: rows.length,
        truncated: r.rows.length > maxRows,
        latencyMs: Date.now() - start,
      };
    } finally {
      client.release();
    }
  }

  async schemaInfo(): Promise<SchemaTable[]> {
    const client = await this.client();
    try {
      const r = await client.query(
        `SELECT c.table_name AS tbl, t.table_type AS kind,
                obj_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass) AS tbl_comment,
                c.column_name AS col, c.data_type AS col_type, c.is_nullable AS nullable,
                EXISTS (
                  SELECT 1 FROM information_schema.table_constraints tc
                  JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                 WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema=c.table_schema
                   AND tc.table_name=c.table_name AND kcu.column_name=c.column_name
                ) AS pk,
                col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, c.ordinal_position) AS col_comment
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema=c.table_schema AND t.table_name=c.table_name
         WHERE c.table_schema = current_schema()
         ORDER BY c.table_name, c.ordinal_position`,
      );
      return groupSchema(r.rows, {
        table: 'tbl', kind: 'kind', tableComment: 'tbl_comment', column: 'col',
        colType: 'col_type', nullable: 'nullable', pk: 'pk', colComment: 'col_comment',
        isView: (kind) => kind === 'VIEW', isPk: (pk) => pk === true || pk === 1,
      });
    } finally {
      client.release();
    }
  }

  close(): void {
    void this.init.then((p) => p.end()).catch(() => {});
  }
}

// ===== Oracle / 达梦（可选驱动：oracledb / dmdb，未安装时给出明确安装指引）=====
// 两家官方 Node 驱动同构（getConnection/execute/metaData），共用一个实现类。

interface OracleLikeConn {
  execute: (sql: string) => Promise<{ rows?: Record<string, unknown>[]; metaData?: { name: string }[] }>;
  close?: () => Promise<void>;
}

class OracleLikeConnector implements Connector {
  readonly type: DataSourceType;
  private row: DataSourceRow;
  private init: Promise<OracleLikeConn>;

  constructor(type: 'oracle' | 'dm', row: DataSourceRow) {
    this.type = type;
    this.row = row;
    this.init = this.connect();
  }

  private async connect(): Promise<OracleLikeConn> {
    const moduleName = this.type === 'oracle' ? 'oracledb' : 'dmdb';
    let mod: { getConnection: (cfg: unknown) => Promise<OracleLikeConn> };
    try {
      mod = await import(/* @vite-ignore */ moduleName);
    } catch {
      throw new Error(
        `驱动 ${moduleName} 未安装。请执行：pnpm add ${moduleName} --filter @yan-zhi/server（${this.type === 'oracle' ? 'oracledb 需 Oracle Instant Client' : 'dmdb 为达梦官方 Node 驱动'}）`,
      );
    }
    const password = getPassword(this.row);
    const connectString =
      this.type === 'oracle'
        ? `${this.row.host || '127.0.0.1'}:${this.row.port || 1521}/${this.row.service_name || this.row.database || 'ORCLPDB1'}`
        : `${this.row.host || '127.0.0.1'}:${this.row.port || 5236}`;
    return mod.getConnection({ user: this.row.username, password, connectString });
  }

  async test(): Promise<TestResult> {
    const start = Date.now();
    try {
      const conn = await this.init;
      const sql =
        this.type === 'oracle'
          ? "SELECT banner AS v FROM v$version WHERE ROWNUM = 1"
          : 'SELECT * FROM V$VERSION';
      const r = await conn.execute(sql);
      return { ok: true, latencyMs: Date.now() - start, version: String(r.rows?.[0]?.v || this.type).slice(0, 60) };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: maskError(err) };
    }
  }

  async query(sql: string, opts?: { maxRows?: number }): Promise<QueryResult> {
    const start = Date.now();
    const conn = await this.init;
    const maxRows = opts?.maxRows ?? DEFAULT_MAX_ROWS;
    // ROWNUM 防御性截断（正常路径由引擎走 dialect.paginate，这里兜底执行器直查）
    const guarded = /fetch\s+first|rownum|limit/i.test(sql)
      ? sql
      : `SELECT * FROM (${sql}) _q WHERE ROWNUM <= ${maxRows + 1}`;
    const r = await conn.execute(guarded);
    const rowsAll = (r.rows || []) as Record<string, unknown>[];
    const columns = (r.metaData || []).map((m) => m.name);
    const rows = rowsAll.slice(0, maxRows);
    return { columns, rows, rowCount: rows.length, truncated: rowsAll.length > maxRows, latencyMs: Date.now() - start };
  }

  async schemaInfo(): Promise<SchemaTable[]> {
    const conn = await this.init;
    const r = await conn.execute(
      `SELECT tc.table_name AS tbl, 'TABLE' AS kind,
              cc.comments AS tbl_comment,
              t.column_name AS col, t.data_type AS col_type, t.nullable AS nullable,
              CASE WHEN EXISTS (
                SELECT 1 FROM user_constraints k
                JOIN user_cons_columns kc ON kc.constraint_name = k.constraint_name
                WHERE k.constraint_type = 'P' AND k.table_name = t.table_name AND kc.column_name = t.column_name
              ) THEN 1 ELSE 0 END AS pk,
              colc.comments AS col_comment
       FROM user_tab_columns t
       LEFT JOIN user_tab_comments cc ON cc.table_name = t.table_name
       LEFT JOIN user_col_comments colc ON colc.table_name = t.table_name AND colc.column_name = t.column_name
       ORDER BY t.table_name, t.column_id`,
    );
    return groupSchema((r.rows || []) as Record<string, unknown>[], {
      table: 'TBL', kind: 'KIND', tableComment: 'TBL_COMMENT', column: 'COL',
      colType: 'COL_TYPE', nullable: 'NULLABLE', pk: 'PK', colComment: 'COL_COMMENT',
      isView: () => false, isPk: (pk) => pk === 1 || pk === '1',
    });
  }

  close(): void {
    void this.init.then((c) => c.close?.()).catch(() => {});
  }
}

// ===== schema 行分组（MySQL/PG/Oracle/DM 共用）=====

interface GroupMap {
  table: string;
  kind: string;
  tableComment: string;
  column: string;
  colType: string;
  nullable: string;
  pk: string;
  colComment: string;
  isView: (kind: string) => boolean;
  isPk: (v: unknown) => boolean;
}

function groupSchema(rows: Record<string, unknown>[], m: GroupMap): SchemaTable[] {
  const byTable = new Map<string, SchemaTable>();
  for (const r of rows) {
    const tbl = String(r[m.table]);
    let t = byTable.get(tbl);
    if (!t) {
      t = {
        name: tbl,
        kind: m.isView(String(r[m.kind] || '')) ? 'view' : 'table',
        comment: ((r[m.tableComment] as string) || '').trim() || undefined,
        columns: [],
      };
      byTable.set(tbl, t);
    }
    t.columns.push({
      name: String(r[m.column]),
      type: String(r[m.colType] || 'ANY'),
      pk: m.isPk(r[m.pk]),
      nullable: /^(YES|Y)$/i.test(String(r[m.nullable] || 'YES')),
      comment: ((r[m.colComment] as string) || '').trim() || undefined,
    });
  }
  return [...byTable.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ===== 连接池缓存 =====

const poolCache = new Map<string, { connector: Connector; lastUsedAt: number }>();
const IDLE_CLOSE_MS = 10 * 60_000;

function createConnector(row: DataSourceRow): Connector {
  switch (row.type) {
    case 'project': {
      const file = path.join(dataDir, 'data.db');
      return new SqliteLikeConnector('project', file, false);
    }
    case 'sqlite': {
      if (!row.file_path) throw new Error('SQLite 数据源缺少文件路径');
      return new SqliteLikeConnector('sqlite', row.file_path, !!row.allow_write);
    }
    case 'mysql':
      return new MysqlConnector(row);
    case 'postgres':
      return new PgConnector(row);
    case 'oracle':
      return new OracleLikeConnector('oracle', row);
    case 'dm':
      return new OracleLikeConnector('dm', row);
    default:
      throw new Error(`不支持的数据源类型: ${row.type}（文档型 Mongo/Elastic 在 P5 落地）`);
  }
}

/** 取连接器（缓存复用；闲置 10 分钟由 closeIdleConnectors 关闭） */
export function getConnector(row: DataSourceRow): Connector {
  const cached = poolCache.get(row.id);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.connector;
  }
  const connector = createConnector(row);
  poolCache.set(row.id, { connector, lastUsedAt: Date.now() });
  return connector;
}

/** 配置变更 / 删除数据源时使缓存失效（连接器按最新配置重建） */
export function invalidateConnector(dsId: string): void {
  const cached = poolCache.get(dsId);
  if (cached) {
    try {
      cached.connector.close();
    } catch {
      // 关闭失败不影响主流程
    }
    poolCache.delete(dsId);
  }
}

export function closeIdleConnectors(): void {
  const now = Date.now();
  for (const [id, cached] of poolCache) {
    if (now - cached.lastUsedAt > IDLE_CLOSE_MS) {
      invalidateConnector(id);
    }
  }
}

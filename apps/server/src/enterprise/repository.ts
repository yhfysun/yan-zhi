/**
 * 企业工作台 repository 适配层（Task 7）。
 *
 * ★ 目标与边界（如实标注，不宣称"全仓已迁 PG"）：
 *   - SQLite 是默认后端，**行为不变**：SqliteEnterpriseRepository 委托 runtime.ts 的
 *     唯一实现，不复制任何 SQL，因此现有几百处 db.prepare 完全不受影响。
 *   - PostgreSQL 是可选后端（YZ_DB_BACKEND=postgres + DATABASE_URL）：
 *     本模块提供企业运行时域（工作区 / 任务 / 事件）的真 PG 实现、方言 DDL、
 *     连接与迁移，且**配置缺失 / 连接失败 / 迁移失败一律明确抛错，绝不静默回落 SQLite**。
 *   - 其余管理端路由仍走 SQLite 同步 API；把它们全部改造成异步 + 方言化是后续工作
 *     （见 tasks/todo.md 已知边界），本层先保证收口点与一致性契约可真跑验证。
 *
 * ★ 语义一致性：JSON 列解析、布尔列、时间戳、空值归一都复用 runtime.ts#workspaceView；
 *   事务边界用 BEGIN/COMMIT/ROLLBACK 在两侧保持相同；所有查询参数化（? 或 $n）。
 */
import { createRequire } from 'node:module';
import { db } from '../db.js';
import {
  getWorkspace, listWorkspaces, listRuntimeEvents, workspaceView,
} from './runtime.js';

const require = createRequire(import.meta.url);

export type RepositoryBackend = 'sqlite' | 'postgres';

export interface RepositoryHealth {
  ok: boolean;
  backend: RepositoryBackend;
  detail: string;
}

export interface EnterpriseRepository {
  readonly backend: RepositoryBackend;
  health(): Promise<RepositoryHealth>;
  close(): Promise<void>;
  listWorkspaces(userId: string, opts?: { all?: boolean }): Promise<any[]>;
  getWorkspace(id: string, userId?: string): Promise<any>;
  listRuntimeEvents(taskId: string, sinceSeq?: number, limit?: number): Promise<any[]>;
  withTransaction<T>(fn: (tx: EnterpriseRepository) => Promise<T>): Promise<T>;
}

export class RepositoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

/** 后端选择唯一出口：未知值明确报错，不悄悄当 sqlite。 */
export function currentRepositoryBackend(): RepositoryBackend {
  const raw = String(process.env.YZ_DB_BACKEND || 'sqlite').trim().toLowerCase();
  if (raw === 'sqlite') return 'sqlite';
  if (raw === 'postgres' || raw === 'postgresql') return 'postgres';
  throw new RepositoryError('BAD_DB_BACKEND', `未知的 YZ_DB_BACKEND=${raw}（只支持 sqlite / postgres）`);
}

// ===== SQLite：默认后端，全部委托唯一实现 =====
class SqliteEnterpriseRepository implements EnterpriseRepository {
  readonly backend = 'sqlite' as const;

  async health(): Promise<RepositoryHealth> {
    const row = db.prepare('SELECT 1 AS ok').get() as any;
    return { ok: row?.ok === 1, backend: 'sqlite', detail: 'better-sqlite3 / sql.js（默认）' };
  }
  async close(): Promise<void> { /* 全局 db 由进程生命周期管理，不在此关闭 */ }
  async listWorkspaces(userId: string, opts: { all?: boolean } = {}): Promise<any[]> {
    return listWorkspaces(userId, opts);
  }
  async getWorkspace(id: string, userId?: string): Promise<any> {
    return getWorkspace(id, userId);
  }
  async listRuntimeEvents(taskId: string, sinceSeq = 0, limit = 500): Promise<any[]> {
    return listRuntimeEvents(taskId, sinceSeq, limit);
  }
  /** 同步 BEGIN/COMMIT 配合 async 回调：回调抛错必须 ROLLBACK（与 PG 语义一致）。 */
  async withTransaction<T>(fn: (tx: EnterpriseRepository) => Promise<T>): Promise<T> {
    db.exec('BEGIN');
    try {
      const result = await fn(this);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* 已回滚 */ }
      throw e;
    }
  }
}

// ===== PostgreSQL：可选后端（企业运行时域） =====
/** 与 SQLite 同名列的 PG DDL；BIGINT 时间戳、JSONB 列，保证视图层语义一致。 */
const PG_ENTERPRISE_DDL = [
  `CREATE TABLE IF NOT EXISTS runtime_node (
     id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'offline', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runtime_workspace (
     id TEXT PRIMARY KEY, node_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
     name TEXT NOT NULL, path TEXT, image TEXT, cpu DOUBLE PRECISION, memory_mb INTEGER,
     status TEXT NOT NULL DEFAULT 'requested', ports_json JSONB NOT NULL DEFAULT '[]',
     expires_at BIGINT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
     runtime_mode TEXT NOT NULL DEFAULT 'directory', container_id TEXT, container_name TEXT,
     keep_dir INTEGER NOT NULL DEFAULT 0, last_error TEXT)`,
  `CREATE TABLE IF NOT EXISTS runtime_task (
     id TEXT PRIMARY KEY, node_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
     workspace_id TEXT, kind TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
     payload_json JSONB NOT NULL DEFAULT '{}', result_json JSONB, error TEXT,
     created_at BIGINT NOT NULL, started_at BIGINT, ended_at BIGINT)`,
  `CREATE TABLE IF NOT EXISTS runtime_event (
     id TEXT PRIMARY KEY, runtime_task_id TEXT NOT NULL, seq INTEGER NOT NULL,
     kind TEXT NOT NULL, payload_json JSONB NOT NULL DEFAULT '{}', created_at BIGINT NOT NULL,
     UNIQUE (runtime_task_id, seq))`,
  `CREATE INDEX IF NOT EXISTS idx_rt_ws_owner ON runtime_workspace(owner_user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rt_ev_task ON runtime_event(runtime_task_id, seq)`,
];

async function ensurePostgresEnterpriseSchema(pool: any): Promise<void> {
  try {
    for (const stmt of PG_ENTERPRISE_DDL) await pool.query(stmt);
  } catch (e) {
    throw new RepositoryError('PG_MIGRATION_FAILED', `PostgreSQL 企业域迁移失败: ${(e as Error).message}`);
  }
}

class PostgresEnterpriseRepository implements EnterpriseRepository {
  readonly backend = 'postgres' as const;
  private readonly pool: any;
  private readonly client: any; // withTransaction 期间绑定的专用连接

  constructor(pool: any, client: any = null) {
    this.pool = pool;
    this.client = client;
  }

  private async query(sql: string, params: unknown[] = []): Promise<any[]> {
    try {
      const run = this.client
        ? this.client.query(sql, params)
        : this.pool.query(sql, params);
      return (await run).rows as any[];
    } catch (e) {
      throw new RepositoryError('PG_QUERY_FAILED', `PostgreSQL 查询失败: ${(e as Error).message}`);
    }
  }

  async health(): Promise<RepositoryHealth> {
    const rows = await this.query("SELECT to_regclass('public.runtime_workspace') AS t");
    if (!rows[0]?.t) {
      throw new RepositoryError('PG_SCHEMA_MISSING', 'PostgreSQL 企业域表未创建（迁移可能失败）');
    }
    return { ok: true, backend: 'postgres', detail: `pg / ${String(rows[0].t)}` };
  }
  async close(): Promise<void> {
    // 事务克隆共享 pool，不能由克隆关闭。
    if (!this.client) await this.pool.end();
  }
  async listWorkspaces(userId: string, opts: { all?: boolean } = {}): Promise<any[]> {
    const rows = opts.all
      ? await this.query('SELECT * FROM runtime_workspace ORDER BY created_at DESC')
      : await this.query('SELECT * FROM runtime_workspace WHERE owner_user_id = $1 ORDER BY created_at DESC', [userId]);
    return rows.map((r) => workspaceView(pgRowToSqliteShape(r)));
  }
  async getWorkspace(id: string, userId?: string): Promise<any> {
    const rows = userId
      ? await this.query('SELECT * FROM runtime_workspace WHERE id = $1 AND owner_user_id = $2', [id, userId])
      : await this.query('SELECT * FROM runtime_workspace WHERE id = $1', [id]);
    return rows.length ? workspaceView(pgRowToSqliteShape(rows[0])) : null;
  }
  async listRuntimeEvents(taskId: string, sinceSeq = 0, limit = 500): Promise<any[]> {
    const rows = await this.query(
      'SELECT * FROM runtime_event WHERE runtime_task_id = $1 AND seq >= $2 ORDER BY seq ASC LIMIT $3',
      [taskId, Math.max(0, Math.floor(Number(sinceSeq) || 0)), Math.max(1, Math.min(Number(limit) || 500, 2000))],
    );
    return rows.map((r) => ({
      ...r,
      payload: parseJsonLoose(r.payload_json, {}),
      payload_json: undefined,
    }));
  }
  async withTransaction<T>(fn: (tx: EnterpriseRepository) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresEnterpriseRepository(this.pool, client);
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* 已回滚 */ }
      throw e;
    } finally {
      client.release();
    }
  }
}

function parseJsonLoose<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  try { return JSON.parse(String(raw)) as T; } catch { return fallback; }
}

/** PG 的 JSONB 列返回对象、BIGINT 返回字符串：归一成 SQLite 视图层期望的形状。 */
function pgRowToSqliteShape(row: any): any {
  return {
    ...row,
    ports_json: typeof row.ports_json === 'string' ? row.ports_json : JSON.stringify(row.ports_json ?? []),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    expires_at: row.expires_at == null ? null : Number(row.expires_at),
    keep_dir: Number(row.keep_dir),
    cpu: row.cpu == null ? null : Number(row.cpu),
    memory_mb: row.memory_mb == null ? null : Number(row.memory_mb),
  };
}

// ===== 工厂：配置 / 连接 / 迁移失败一律明确报错 =====
export interface CreateRepositoryOptions {
  backend?: string;
  url?: string;
  ensureSchema?: boolean;
}

export async function createEnterpriseRepository(opts: CreateRepositoryOptions = {}): Promise<EnterpriseRepository> {
  const backend = opts.backend ? String(opts.backend).trim().toLowerCase() : currentRepositoryBackend();
  if (backend === 'sqlite' || backend === 'better-sqlite3') return new SqliteEnterpriseRepository();
  if (backend !== 'postgres' && backend !== 'postgresql') {
    throw new RepositoryError('BAD_DB_BACKEND', `未知的数据后端: ${backend}`);
  }
  const url = String(opts.url ?? process.env.DATABASE_URL ?? '').trim();
  if (!url) throw new RepositoryError('PG_NOT_CONFIGURED', 'PostgreSQL 模式缺少 DATABASE_URL（未配置，不回退 SQLite）');
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new RepositoryError('PG_BAD_URL', 'DATABASE_URL 必须是 postgres:// 或 postgresql:// 开头的连接串');
  }
  let Pool: any;
  try { ({ Pool } = require('pg')); } catch (e) {
    throw new RepositoryError('PG_DRIVER_MISSING', `pg 驱动不可用: ${(e as Error).message}`);
  }
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000, max: 5 });
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    try { await pool.end(); } catch { /* ignore */ }
    throw new RepositoryError('PG_CONNECT_FAILED', `PostgreSQL 连接失败: ${(e as Error).message}`);
  }
  if (opts.ensureSchema !== false) await ensurePostgresEnterpriseSchema(pool);
  return new PostgresEnterpriseRepository(pool);
}

// ===== 进程单例（启动接线 / 路由共用） =====
let singleton: Promise<EnterpriseRepository> | null = null;

export function getEnterpriseRepository(): Promise<EnterpriseRepository> {
  if (!singleton) singleton = createEnterpriseRepository();
  return singleton;
}

export async function resetEnterpriseRepositoryForTest(): Promise<void> {
  const pending = singleton;
  singleton = null;
  if (pending) {
    try { await (await pending).close(); } catch { /* ignore */ }
  }
}

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
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { db } from '../db.js';
import {
  appendRuntimeEvents, assertPreviewHost, authenticateRuntimeNode, cancelRuntimeTask,
  claimRuntimeTask, completeRuntimeTask, createRuntimeNode, createRuntimeTask,
  createWorkspace, deleteRuntimeNode, enqueueExpiredWorkspaceStops,
  expireStaleRuntimeNodes, getRuntimeTask, getWorkspace, hashRuntimeNodeToken,
  heartbeatRuntimeNode, listRuntimeArtifacts, listRuntimeEvents, listRuntimeNodes,
  listRuntimeTasks, listWorkspaces, markRuntimeNodeOffline, registerRuntimeNode,
  resolveWorkspacePreviewTarget, runtimeNodeView, runtimeTaskView, stopWorkspace,
  touchRuntimeNode, unregisterWorkspacePort, updateRuntimeNode, updateWorkspaceState,
  workspaceModeFor, workspacePreviewTargetFromRows, workspaceView,
} from './runtime.js';
import type {
  RuntimeNodeInput, RuntimeTaskCompleteInput, RuntimeTaskInput,
  RuntimeWorkspaceInput, RuntimeWorkspaceStateInput,
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
  getRuntimeTask(id: string, userId?: string): Promise<any>;
  listRuntimeTasks(userId: string, opts?: { all?: boolean; limit?: number }): Promise<any[]>;
  listRuntimeEvents(taskId: string, sinceSeq?: number, limit?: number): Promise<any[]>;
  listRuntimeArtifacts(taskId: string): Promise<any[]>;
  cancelRuntimeTask(userId: string, id: string): Promise<any>;
  stopWorkspace(userId: string, workspaceId: string): Promise<any>;
  createRuntimeNode(userId: string, input: RuntimeNodeInput): Promise<{ node: any; token: string }>;
  authenticateRuntimeNode(token: string): Promise<any | null>;
  registerRuntimeNode(token: string, input: Record<string, unknown>): Promise<any>;
  heartbeatRuntimeNode(token: string): Promise<any>;
  touchRuntimeNode(token: string): Promise<void>;
  markRuntimeNodeOffline(nodeId: string): Promise<void>;
  expireStaleRuntimeNodes(now?: number): Promise<number>;
  listRuntimeNodes(userId: string, opts?: { all?: boolean }): Promise<any[]>;
  updateRuntimeNode(id: string, input: Partial<RuntimeNodeInput> & { enabled?: boolean }): Promise<any>;
  deleteRuntimeNode(id: string): Promise<void>;
  createRuntimeTask(userId: string, input: RuntimeTaskInput): Promise<any>;
  claimRuntimeTask(token: string): Promise<any | null>;
  appendRuntimeEvents(
    token: string,
    taskId: string,
    events: Array<{ seq: number; kind: string; payload?: unknown }>,
  ): Promise<number>;
  completeRuntimeTask(token: string, taskId: string, input: RuntimeTaskCompleteInput): Promise<any>;
  createWorkspace(userId: string, input: RuntimeWorkspaceInput): Promise<any>;
  updateWorkspaceState(token: string, workspaceId: string, input: RuntimeWorkspaceStateInput): Promise<any>;
  enqueueExpiredWorkspaceStops(now?: number): Promise<number>;
  resolveWorkspacePreviewTarget(
    userId: string,
    workspaceId: string,
    port: number,
    now?: number,
  ): Promise<any>;
  unregisterWorkspacePort(workspaceId: string, port: number): Promise<void>;
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
  async getRuntimeTask(id: string, userId?: string): Promise<any> {
    return getRuntimeTask(id, userId);
  }
  async listRuntimeTasks(userId: string, opts: { all?: boolean; limit?: number } = {}): Promise<any[]> {
    return listRuntimeTasks(userId, opts);
  }
  async listRuntimeEvents(taskId: string, sinceSeq = 0, limit = 500): Promise<any[]> {
    return listRuntimeEvents(taskId, sinceSeq, limit);
  }
  async listRuntimeArtifacts(taskId: string): Promise<any[]> {
    return listRuntimeArtifacts(taskId);
  }
  async cancelRuntimeTask(userId: string, id: string): Promise<any> {
    return cancelRuntimeTask(userId, id);
  }
  async stopWorkspace(userId: string, workspaceId: string): Promise<any> {
    return stopWorkspace(userId, workspaceId);
  }
  async createRuntimeNode(userId: string, input: RuntimeNodeInput): Promise<{ node: any; token: string }> {
    return createRuntimeNode(userId, input);
  }
  async authenticateRuntimeNode(token: string): Promise<any | null> {
    return authenticateRuntimeNode(token);
  }
  async registerRuntimeNode(token: string, input: Record<string, unknown>): Promise<any> {
    return registerRuntimeNode(token, input as any);
  }
  async heartbeatRuntimeNode(token: string): Promise<any> {
    return heartbeatRuntimeNode(token);
  }
  async touchRuntimeNode(token: string): Promise<void> {
    touchRuntimeNode(token);
  }
  async markRuntimeNodeOffline(nodeId: string): Promise<void> {
    markRuntimeNodeOffline(nodeId);
  }
  async expireStaleRuntimeNodes(now = Date.now()): Promise<number> {
    return expireStaleRuntimeNodes(now);
  }
  async listRuntimeNodes(userId: string, opts: { all?: boolean } = {}): Promise<any[]> {
    return listRuntimeNodes(userId, opts);
  }
  async updateRuntimeNode(id: string, input: Partial<RuntimeNodeInput> & { enabled?: boolean }): Promise<any> {
    return updateRuntimeNode(id, input);
  }
  async deleteRuntimeNode(id: string): Promise<void> {
    deleteRuntimeNode(id);
  }
  async createRuntimeTask(userId: string, input: RuntimeTaskInput): Promise<any> {
    return createRuntimeTask(userId, input);
  }
  async claimRuntimeTask(token: string): Promise<any | null> {
    return claimRuntimeTask(token);
  }
  async appendRuntimeEvents(
    token: string,
    taskId: string,
    events: Array<{ seq: number; kind: string; payload?: unknown }>,
  ): Promise<number> {
    return appendRuntimeEvents(token, taskId, events);
  }
  async completeRuntimeTask(token: string, taskId: string, input: RuntimeTaskCompleteInput): Promise<any> {
    return completeRuntimeTask(token, taskId, input);
  }
  async createWorkspace(userId: string, input: RuntimeWorkspaceInput): Promise<any> {
    return createWorkspace(userId, input);
  }
  async updateWorkspaceState(
    token: string,
    workspaceId: string,
    input: RuntimeWorkspaceStateInput,
  ): Promise<any> {
    return updateWorkspaceState(token, workspaceId, input);
  }
  async enqueueExpiredWorkspaceStops(now = Date.now()): Promise<number> {
    return enqueueExpiredWorkspaceStops(now);
  }
  async resolveWorkspacePreviewTarget(
    userId: string,
    workspaceId: string,
    port: number,
    now = Date.now(),
  ): Promise<any> {
    return resolveWorkspacePreviewTarget(userId, workspaceId, port, now);
  }
  async unregisterWorkspacePort(workspaceId: string, port: number): Promise<void> {
    unregisterWorkspacePort(workspaceId, port);
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
     org_id TEXT, platform TEXT, arch TEXT, version TEXT,
     capabilities_json JSONB NOT NULL DEFAULT '[]', token_hash TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'offline', last_seen_at BIGINT, preview_host TEXT,
     created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runtime_workspace (
     id TEXT PRIMARY KEY, node_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
     name TEXT NOT NULL, path TEXT, image TEXT, cpu DOUBLE PRECISION, memory_mb INTEGER,
     status TEXT NOT NULL DEFAULT 'requested', ports_json JSONB NOT NULL DEFAULT '[]',
     expires_at BIGINT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
     runtime_mode TEXT NOT NULL DEFAULT 'directory', container_id TEXT, container_name TEXT,
     keep_dir INTEGER NOT NULL DEFAULT 0, last_error TEXT)`,
  `CREATE TABLE IF NOT EXISTS runtime_task (
     id TEXT PRIMARY KEY, node_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
     conversation_id TEXT, task_id TEXT, workspace_id TEXT, kind TEXT NOT NULL,
     state TEXT NOT NULL DEFAULT 'queued',
     payload_json JSONB NOT NULL DEFAULT '{}', result_json JSONB, error TEXT,
     exit_code INTEGER, created_at BIGINT NOT NULL, started_at BIGINT, ended_at BIGINT)`,
  `CREATE TABLE IF NOT EXISTS runtime_event (
     id TEXT PRIMARY KEY, runtime_task_id TEXT NOT NULL, seq INTEGER NOT NULL,
     kind TEXT NOT NULL, payload_json JSONB NOT NULL DEFAULT '{}', created_at BIGINT NOT NULL,
     UNIQUE (runtime_task_id, seq))`,
  `CREATE TABLE IF NOT EXISTS runtime_artifact (
     id TEXT PRIMARY KEY, runtime_task_id TEXT NOT NULL, name TEXT NOT NULL,
     path TEXT, mime_type TEXT, size_bytes INTEGER, sha256 TEXT, created_at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_rt_ws_owner ON runtime_workspace(owner_user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rt_ev_task ON runtime_event(runtime_task_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_rt_artifact_task ON runtime_artifact(runtime_task_id, created_at)`,
  // CREATE TABLE IF NOT EXISTS 不会给已存在的旧 PG 库补列，升级必须同样幂等。
  `ALTER TABLE runtime_task ADD COLUMN IF NOT EXISTS conversation_id TEXT`,
  `ALTER TABLE runtime_task ADD COLUMN IF NOT EXISTS task_id TEXT`,
  `ALTER TABLE runtime_task ADD COLUMN IF NOT EXISTS exit_code INTEGER`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS org_id TEXT`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS platform TEXT`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS arch TEXT`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS version TEXT`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS capabilities_json JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS token_hash TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS last_seen_at BIGINT`,
  `ALTER TABLE runtime_node ADD COLUMN IF NOT EXISTS preview_host TEXT`,
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
  async getRuntimeTask(id: string, userId?: string): Promise<any> {
    const rows = userId
      ? await this.query('SELECT * FROM runtime_task WHERE id = $1 AND owner_user_id = $2', [id, userId])
      : await this.query('SELECT * FROM runtime_task WHERE id = $1', [id]);
    return rows.length ? runtimeTaskView(pgRuntimeTaskToSqliteShape(rows[0])) : null;
  }
  async listRuntimeTasks(userId: string, opts: { all?: boolean; limit?: number } = {}): Promise<any[]> {
    const limit = Math.max(1, Math.min(Number(opts.limit) || 100, 500));
    const rows = opts.all
      ? await this.query('SELECT * FROM runtime_task ORDER BY created_at DESC LIMIT $1', [limit])
      : await this.query(
        'SELECT * FROM runtime_task WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT $2',
        [userId, limit],
      );
    return rows.map((r) => runtimeTaskView(pgRuntimeTaskToSqliteShape(r)));
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
  async listRuntimeArtifacts(taskId: string): Promise<any[]> {
    const rows = await this.query(
      'SELECT * FROM runtime_artifact WHERE runtime_task_id = $1 ORDER BY created_at ASC',
      [taskId],
    );
    return rows.map((r) => ({
      ...r,
      size_bytes: r.size_bytes == null ? null : Number(r.size_bytes),
      created_at: Number(r.created_at),
    }));
  }
  async cancelRuntimeTask(userId: string, id: string): Promise<any> {
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const rows = await pg.query(
        'SELECT * FROM runtime_task WHERE id = $1 AND owner_user_id = $2 FOR UPDATE',
        [id, userId],
      );
      if (!rows.length) throw new RepositoryError('RUNTIME_TASK_NOT_FOUND', '任务不存在或无权操作');
      let row = rows[0];
      if (row.state === 'queued' || row.state === 'running') {
        const updated = await pg.query(
          "UPDATE runtime_task SET state = 'cancelled', ended_at = $1 WHERE id = $2 RETURNING *",
          [Date.now(), id],
        );
        row = updated[0];
      }
      return runtimeTaskView(pgRuntimeTaskToSqliteShape(row));
    });
  }
  async stopWorkspace(userId: string, workspaceId: string): Promise<any> {
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const rows = await pg.query(
        'SELECT * FROM runtime_workspace WHERE id = $1 AND owner_user_id = $2 FOR UPDATE',
        [workspaceId, userId],
      );
      if (!rows.length) throw new RepositoryError('RUNTIME_WORKSPACE_NOT_FOUND', '工作区不存在或无权操作');
      let row = rows[0];
      if (row.status !== 'stopped' && row.status !== 'stopping') {
        const now = Date.now();
        const payload = {
          workspaceId,
          path: row.path || null,
          mode: row.runtime_mode || 'directory',
          containerId: row.container_id || null,
          containerName: row.container_name || null,
          keepDir: !!row.keep_dir,
        };
        await pg.query(
          `INSERT INTO runtime_task
            (id, node_id, owner_user_id, workspace_id, kind, payload_json, state, created_at)
           VALUES ($1, $2, $3, $4, 'workspace_stop', $5::jsonb, 'queued', $6)`,
          [randomUUID(), row.node_id, userId, workspaceId, JSON.stringify(payload), now],
        );
        const updated = await pg.query(
          "UPDATE runtime_workspace SET status = 'stopping', updated_at = $1 WHERE id = $2 RETURNING *",
          [now, workspaceId],
        );
        row = updated[0];
      }
      return workspaceView(pgRowToSqliteShape(row));
    });
  }
  async createRuntimeNode(userId: string, input: RuntimeNodeInput): Promise<{ node: any; token: string }> {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('节点名称不能为空');
    const id = randomUUID();
    const token = `yzn.${id}.${randomBytes(24).toString('base64url')}`;
    const now = Date.now();
    await this.query(
      `INSERT INTO runtime_node
        (id, owner_user_id, org_id, name, platform, arch, version, capabilities_json,
         token_hash, status, last_seen_at, preview_host, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'offline', NULL, NULL, $10, $10)`,
      [
        id, userId, input.orgId || null, name, input.platform || null,
        input.arch || null, input.version || null,
        JSON.stringify(input.capabilities || []), hashRuntimeNodeToken(token), now,
      ],
    );
    const rows = await this.query('SELECT * FROM runtime_node WHERE id = $1', [id]);
    return { node: runtimeNodeView(pgNodeToSqliteShape(rows[0])), token };
  }
  async authenticateRuntimeNode(token: string): Promise<any | null> {
    const match = /^yzn\.([0-9a-f-]{36})\.[A-Za-z0-9_-]{20,}$/i.exec(String(token || ''));
    if (!match) return null;
    const rows = await this.query('SELECT * FROM runtime_node WHERE id = $1', [match[1]]);
    const row = rows[0];
    if (!row?.token_hash) return null;
    const digest = hashRuntimeNodeToken(token);
    if (digest.length !== row.token_hash.length) return null;
    const actual = Buffer.from(digest, 'hex');
    const expected = Buffer.from(row.token_hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected)
      ? pgNodeToSqliteShape(row)
      : null;
  }
  async registerRuntimeNode(token: string, input: Record<string, unknown>): Promise<any> {
    const node = await this.authenticateRuntimeNode(token);
    if (!node) throw new Error('节点令牌无效');
    const previewHost = input.previewHost
      ? assertPreviewHost(input.previewHost)
      : (node.preview_host || '127.0.0.1');
    const capabilities = Array.isArray(input.capabilities) ? input.capabilities : node.capabilities;
    const now = Date.now();
    const rows = await this.query(
      `UPDATE runtime_node SET platform = $1, arch = $2, version = $3,
         capabilities_json = $4::jsonb, preview_host = $5, status = 'online',
         last_seen_at = $6, updated_at = $6
       WHERE id = $7 RETURNING *`,
      [
        input.platform || node.platform || null,
        input.arch || node.arch || null,
        input.version || node.version || null,
        JSON.stringify(capabilities || []), previewHost, now, node.id,
      ],
    );
    return runtimeNodeView(pgNodeToSqliteShape(rows[0]));
  }
  async heartbeatRuntimeNode(token: string): Promise<any> {
    const node = await this.authenticateRuntimeNode(token);
    if (!node) throw new Error('节点令牌无效');
    const now = Date.now();
    const rows = await this.query(
      "UPDATE runtime_node SET status = 'online', last_seen_at = $1, updated_at = $1 WHERE id = $2 RETURNING *",
      [now, node.id],
    );
    await this.expireStaleRuntimeNodes();
    return runtimeNodeView(pgNodeToSqliteShape(rows[0]));
  }
  async touchRuntimeNode(token: string): Promise<void> {
    const node = await this.authenticateRuntimeNode(token);
    if (!node) throw new Error('节点令牌无效');
    const now = Date.now();
    await this.query(
      "UPDATE runtime_node SET status = 'online', last_seen_at = $1, updated_at = $1 WHERE id = $2",
      [now, node.id],
    );
  }
  async markRuntimeNodeOffline(nodeId: string): Promise<void> {
    await this.query(
      "UPDATE runtime_node SET status = 'offline', updated_at = $1 WHERE id = $2",
      [Date.now(), nodeId],
    );
  }
  async expireStaleRuntimeNodes(now = Date.now()): Promise<number> {
    const rows = await this.query(
      `UPDATE runtime_node SET status = 'offline', updated_at = $1
       WHERE status = 'online' AND COALESCE(last_seen_at, 0) < $2 RETURNING id`,
      [now, now - 2 * 60 * 1000],
    );
    return rows.length;
  }
  async listRuntimeNodes(userId: string, opts: { all?: boolean } = {}): Promise<any[]> {
    await this.expireStaleRuntimeNodes();
    const rows = opts.all
      ? await this.query('SELECT * FROM runtime_node ORDER BY created_at DESC')
      : await this.query('SELECT * FROM runtime_node WHERE owner_user_id = $1 ORDER BY created_at DESC', [userId]);
    return rows.map((r) => runtimeNodeView(pgNodeToSqliteShape(r)));
  }
  async updateRuntimeNode(
    id: string,
    input: Partial<RuntimeNodeInput> & { enabled?: boolean },
  ): Promise<any> {
    const existing = await this.query('SELECT * FROM runtime_node WHERE id = $1', [id]);
    if (!existing.length) throw new Error('节点不存在');
    const sets: string[] = [];
    const values: unknown[] = [];
    const put = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.name !== undefined) put('name', String(input.name).trim());
    if (input.orgId !== undefined) put('org_id', input.orgId || null);
    if (input.platform !== undefined) put('platform', input.platform);
    if (input.arch !== undefined) put('arch', input.arch);
    if (input.version !== undefined) put('version', input.version);
    if (input.capabilities !== undefined) put('capabilities_json', JSON.stringify(input.capabilities));
    if (input.enabled !== undefined) put('status', input.enabled ? 'offline' : 'disabled');
    if (!sets.length) return runtimeNodeView(pgNodeToSqliteShape(existing[0]));
    put('updated_at', Date.now());
    values.push(id);
    const rows = await this.query(
      `UPDATE runtime_node SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return runtimeNodeView(pgNodeToSqliteShape(rows[0]));
  }
  async deleteRuntimeNode(id: string): Promise<void> {
    await this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      await pg.query("DELETE FROM runtime_task WHERE node_id = $1 AND state IN ('queued', 'running')", [id]);
      await pg.query('DELETE FROM runtime_node WHERE id = $1', [id]);
    });
  }
  async createRuntimeTask(userId: string, input: RuntimeTaskInput): Promise<any> {
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const nodes = await pg.query(
        'SELECT * FROM runtime_node WHERE id = $1 AND owner_user_id = $2',
        [input.nodeId, userId],
      );
      if (!nodes.length) throw new Error('工作节点不存在或无权使用');
      if (nodes[0].status === 'disabled') throw new Error('工作节点已停用');
      const id = randomUUID();
      const now = Date.now();
      const rows = await pg.query(
        `INSERT INTO runtime_task
          (id, node_id, owner_user_id, conversation_id, task_id, workspace_id, kind,
           payload_json, state, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'queued', $9)
         RETURNING *`,
        [
          id, input.nodeId, userId, input.conversationId || null, input.taskId || null,
          input.workspaceId || null, input.kind || 'command',
          JSON.stringify(input.payload || {}), now,
        ],
      );
      return runtimeTaskView(pgRuntimeTaskToSqliteShape(rows[0]));
    });
  }
  async claimRuntimeTask(token: string): Promise<any | null> {
    const node = await this.authenticateRuntimeNode(token);
    if (!node) throw new Error('节点令牌无效');
    const now = Date.now();
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const rows = await pg.query(
        `SELECT * FROM runtime_task
         WHERE node_id = $1 AND state = 'queued'
         ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [node.id],
      );
      if (!rows.length) return null;
      const updated = await pg.query(
        `UPDATE runtime_task SET state = 'running', started_at = $1
         WHERE id = $2 AND state = 'queued' RETURNING *`,
        [now, rows[0].id],
      );
      if (!updated.length) return null;
      await pg.query(
        "UPDATE runtime_node SET status = 'online', last_seen_at = $1, updated_at = $1 WHERE id = $2",
        [now, node.id],
      );
      return runtimeTaskView(pgRuntimeTaskToSqliteShape(updated[0]));
    });
  }
  async appendRuntimeEvents(
    token: string,
    taskId: string,
    events: Array<{ seq: number; kind: string; payload?: unknown }>,
  ): Promise<number> {
    const node = await this.authenticateRuntimeNode(token);
    if (!node) throw new Error('节点令牌无效');
    const task = await this.query(
      'SELECT id FROM runtime_task WHERE id = $1 AND node_id = $2',
      [taskId, node.id],
    );
    if (!task.length) throw new Error('任务不存在或不属于该节点');
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      let inserted = 0;
      for (const event of events) {
        const seq = Number(event?.seq);
        if (!Number.isFinite(seq) || seq < 0) continue;
        const rows = await pg.query(
          `INSERT INTO runtime_event
            (id, runtime_task_id, seq, kind, payload_json, created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           ON CONFLICT (runtime_task_id, seq) DO NOTHING RETURNING id`,
          [
            randomUUID(), taskId, Math.floor(seq), String(event?.kind || 'message'),
            JSON.stringify(event?.payload ?? {}), Date.now(),
          ],
        );
        if (rows.length) inserted += 1;
      }
      return inserted;
    });
  }
  async completeRuntimeTask(
    token: string,
    taskId: string,
    input: RuntimeTaskCompleteInput,
  ): Promise<any> {
    const node = await this.authenticateRuntimeNode(token);
    if (!node) throw new Error('节点令牌无效');
    const task = await this.query(
      'SELECT id FROM runtime_task WHERE id = $1 AND node_id = $2',
      [taskId, node.id],
    );
    if (!task.length) throw new Error('任务不存在或不属于该节点');
    const state = input.state === 'failed' || input.state === 'cancelled' ? input.state : 'completed';
    const now = Date.now();
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const rows = await pg.query(
        `UPDATE runtime_task SET state = $1, result_json = $2::jsonb, error = $3,
           exit_code = $4, ended_at = $5 WHERE id = $6 RETURNING *`,
        [
          state,
          input.result === undefined ? null : JSON.stringify(input.result),
          input.error ? String(input.error).slice(0, 4000) : null,
          input.exitCode == null ? null : Number(input.exitCode),
          now, taskId,
        ],
      );
      for (const artifact of input.artifacts || []) {
        if (!artifact?.name) continue;
        await pg.query(
          `INSERT INTO runtime_artifact
            (id, runtime_task_id, name, path, mime_type, size_bytes, sha256, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(), taskId, artifact.name, artifact.path || null,
            artifact.mimeType || null, artifact.sizeBytes == null ? null : Number(artifact.sizeBytes),
            artifact.sha256 || null, now,
          ],
        );
      }
      await pg.query(
        "UPDATE runtime_node SET status = 'online', last_seen_at = $1, updated_at = $1 WHERE id = $2",
        [now, node.id],
      );
      return runtimeTaskView(pgRuntimeTaskToSqliteShape(rows[0]));
    });
  }
  async createWorkspace(userId: string, input: RuntimeWorkspaceInput): Promise<any> {
    const ttl = Math.max(5, Math.min(Number(input.ttlMinutes) || 120, 7 * 24 * 60));
    const now = Date.now();
    const mode = workspaceModeFor(input.image);
    const keepDir = input.keepDir === true;
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const nodes = await pg.query(
        'SELECT * FROM runtime_node WHERE id = $1 AND owner_user_id = $2',
        [input.nodeId, userId],
      );
      if (!nodes.length) throw new Error('工作节点不存在或无权使用');
      const id = randomUUID();
      const rows = await pg.query(
        `INSERT INTO runtime_workspace
          (id, node_id, owner_user_id, name, path, image, cpu, memory_mb,
           runtime_mode, keep_dir, status, ports_json, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, 'requested', '[]'::jsonb, $10, $11, $11)
         RETURNING *`,
        [
          id, input.nodeId, userId, String(input.name || '').trim() || '工作区',
          input.image || null, input.cpu == null ? null : Number(input.cpu),
          input.memoryMb == null ? null : Number(input.memoryMb), mode, keepDir ? 1 : 0,
          now + ttl * 60_000, now,
        ],
      );
      const workspace = workspaceView(pgRowToSqliteShape(rows[0]));
      await tx.createRuntimeTask(userId, {
        nodeId: input.nodeId,
        workspaceId: id,
        kind: 'workspace_create',
        payload: {
          workspaceId: id,
          name: workspace.name,
          image: workspace.image,
          cpu: workspace.cpu,
          memoryMb: workspace.memory_mb,
          ttlMinutes: ttl,
          mode,
          keepDir,
          ports: Array.isArray(input.ports)
            ? input.ports.map(Number).filter((p) => Number.isInteger(p) && p > 0 && p <= 65535)
            : [],
        },
      });
      return workspace;
    });
  }
  async updateWorkspaceState(
    token: string,
    workspaceId: string,
    input: RuntimeWorkspaceStateInput,
  ): Promise<any> {
    const node = await this.authenticateRuntimeNode(token);
    if (!node) throw new Error('节点令牌无效');
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const existing = await pg.query(
        'SELECT * FROM runtime_workspace WHERE id = $1 AND node_id = $2 FOR UPDATE',
        [workspaceId, node.id],
      );
      if (!existing.length) throw new Error('工作区不存在或不属于该节点');
      const sets: string[] = [];
      const values: unknown[] = [];
      const put = (column: string, value: unknown, cast = '') => {
        values.push(value);
        sets.push(`${column} = $${values.length}${cast}`);
      };
      put('status', input.status);
      if (input.path !== undefined) put('path', input.path || null);
      if (input.ports !== undefined) put('ports_json', JSON.stringify(input.ports || []), '::jsonb');
      if (input.containerId !== undefined) put('container_id', input.containerId || null);
      else if (input.status === 'stopped') put('container_id', null);
      if (input.containerName !== undefined) put('container_name', input.containerName || null);
      else if (input.status === 'stopped') put('container_name', null);
      if (input.runtimeMode !== undefined) put('runtime_mode', input.runtimeMode);
      put('last_error', input.status === 'failed' ? (input.error || '节点执行失败').slice(0, 500) : null);
      put('updated_at', Date.now());
      values.push(workspaceId);
      const rows = await pg.query(
        `UPDATE runtime_workspace SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values,
      );
      return workspaceView(pgRowToSqliteShape(rows[0]));
    });
  }
  async enqueueExpiredWorkspaceStops(now = Date.now()): Promise<number> {
    return this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const rows = await pg.query(
        `SELECT * FROM runtime_workspace
         WHERE status IN ('requested', 'running') AND expires_at IS NOT NULL AND expires_at <= $1
         FOR UPDATE SKIP LOCKED`,
        [now],
      );
      let count = 0;
      for (const row of rows) {
        try {
          await tx.createRuntimeTask(row.owner_user_id, {
            nodeId: row.node_id,
            workspaceId: row.id,
            kind: 'workspace_stop',
            payload: {
              workspaceId: row.id,
              path: row.path || null,
              reason: 'ttl_expired',
              mode: row.runtime_mode || 'directory',
              containerId: row.container_id || null,
              containerName: row.container_name || null,
              keepDir: !!row.keep_dir,
            },
          });
          await pg.query(
            "UPDATE runtime_workspace SET status = 'stopping', updated_at = $1 WHERE id = $2",
            [now, row.id],
          );
          count += 1;
        } catch {
          // 节点已删除等单条异常不阻塞其它过期工作区。
        }
      }
      return count;
    });
  }
  async resolveWorkspacePreviewTarget(
    userId: string,
    workspaceId: string,
    port: number,
    now = Date.now(),
  ): Promise<any> {
    const workspaces = await this.query('SELECT * FROM runtime_workspace WHERE id = $1', [workspaceId]);
    const workspace = workspaces[0] ? pgRowToSqliteShape(workspaces[0]) : null;
    const nodes = workspace
      ? await this.query('SELECT preview_host FROM runtime_node WHERE id = $1', [workspace.node_id])
      : [];
    return workspacePreviewTargetFromRows(userId, workspace, nodes[0] || null, port, now);
  }
  async unregisterWorkspacePort(workspaceId: string, port: number): Promise<void> {
    await this.withTransaction(async (tx) => {
      const pg = tx as PostgresEnterpriseRepository;
      const rows = await pg.query(
        'SELECT ports_json FROM runtime_workspace WHERE id = $1 FOR UPDATE',
        [workspaceId],
      );
      if (!rows.length) return;
      const raw = rows[0].ports_json;
      const ports = Array.isArray(raw) ? raw : parseJsonLoose<number[]>(raw, []);
      const next = ports.map(Number).filter((p) => p !== Number(port));
      await pg.query(
        'UPDATE runtime_workspace SET ports_json = $1::jsonb, updated_at = $2 WHERE id = $3',
        [JSON.stringify(next), Date.now(), workspaceId],
      );
    });
  }
  async withTransaction<T>(fn: (tx: EnterpriseRepository) => Promise<T>): Promise<T> {
    // 已是事务绑定的 repository：直接复用同一连接，禁止另开连接提前提交。
    if (this.client) return fn(this);
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

/** PG 节点行 → runtimeNodeView 期望的 SQLite 形状。 */
function pgNodeToSqliteShape(row: any): any {
  return {
    ...row,
    capabilities_json: typeof row.capabilities_json === 'string'
      ? row.capabilities_json
      : JSON.stringify(row.capabilities_json ?? []),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    last_seen_at: row.last_seen_at == null ? null : Number(row.last_seen_at),
  };
}

/** PG 的 JSONB 返回对象、BIGINT 返回字符串：归一成 runtimeTaskView 期望的 SQLite 形状。 */
function pgRuntimeTaskToSqliteShape(row: any): any {
  const asJsonText = (value: unknown, fallback: unknown) => {
    if (value == null) return value === null ? null : JSON.stringify(fallback);
    return typeof value === 'string' ? value : JSON.stringify(value);
  };
  return {
    ...row,
    payload_json: asJsonText(row.payload_json, {}) ?? '{}',
    result_json: asJsonText(row.result_json, null),
    exit_code: row.exit_code == null ? null : Number(row.exit_code),
    created_at: Number(row.created_at),
    started_at: row.started_at == null ? null : Number(row.started_at),
    ended_at: row.ended_at == null ? null : Number(row.ended_at),
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

let runtimeJanitor: NodeJS.Timeout | null = null;

/** 运行时后台巡检唯一入口：SQLite / PG 都通过 repository 执行。 */
export function startRuntimeRepositoryJanitor(intervalMs = 60_000): NodeJS.Timeout {
  if (runtimeJanitor) return runtimeJanitor;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const repo = await getEnterpriseRepository();
      await repo.expireStaleRuntimeNodes();
      await repo.enqueueExpiredWorkspaceStops();
    } catch {
      // 后台巡检失败不退出进程，下一轮继续。
    } finally {
      running = false;
    }
  };
  runtimeJanitor = setInterval(() => { void tick(); }, Math.max(10_000, intervalMs));
  runtimeJanitor.unref?.();
  return runtimeJanitor;
}

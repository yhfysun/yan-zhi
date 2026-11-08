import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../db.js';
import { primaryOrgOfUser } from './quota.js';
import './schema.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function nodeView(row: any) {
  return {
    ...row,
    capabilities: parseJson(row.capabilities_json, []),
    token_hash: undefined,
    capabilities_json: undefined,
  };
}

export interface RuntimeNodeInput {
  name: string;
  orgId?: string | null;
  platform?: string | null;
  arch?: string | null;
  version?: string | null;
  capabilities?: string[];
}

export function createRuntimeNode(userId: string, input: RuntimeNodeInput): { node: any; token: string } {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('节点名称不能为空');
  const id = randomUUID();
  const token = `yzn.${id}.${randomBytes(24).toString('base64url')}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO runtime_node
      (id, owner_user_id, org_id, name, platform, arch, version, capabilities_json,
       token_hash, status, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline', NULL, ?, ?)`,
  ).run(
    id, userId, input.orgId || primaryOrgOfUser(userId), name,
    input.platform || null, input.arch || null, input.version || null,
    JSON.stringify(input.capabilities || []), hashToken(token), now, now,
  );
  return { node: nodeView(db.prepare('SELECT * FROM runtime_node WHERE id = ?').get(id)), token };
}

export function authenticateRuntimeNode(token: string): any | null {
  const m = /^yzn\.([0-9a-f-]{36})\.[A-Za-z0-9_-]{20,}$/i.exec(String(token || ''));
  if (!m) return null;
  const row = db.prepare('SELECT * FROM runtime_node WHERE id = ?').get(m[1]) as any;
  if (!row) return null;
  const digest = hashToken(token);
  if (!row.token_hash || digest.length !== row.token_hash.length) return null;
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(row.token_hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? row : null;
}

export function registerRuntimeNode(token: string, input: {
  platform?: string;
  arch?: string;
  version?: string;
  capabilities?: string[];
  previewHost?: string;
}): any {
  const node = authenticateRuntimeNode(token);
  if (!node) throw new Error('节点令牌无效');
  const previewHost = input.previewHost ? assertPreviewHost(input.previewHost) : (node.preview_host || '127.0.0.1');
  const now = Date.now();
  db.prepare(
    `UPDATE runtime_node SET platform = ?, arch = ?, version = ?, capabilities_json = ?,
      preview_host = ?, status = 'online', last_seen_at = ?, updated_at = ? WHERE id = ?`,
  ).run(
    input.platform || node.platform || null,
    input.arch || node.arch || null,
    input.version || node.version || null,
    JSON.stringify(input.capabilities || parseJson(node.capabilities_json, [])),
    previewHost, now, now, node.id,
  );
  return nodeView(db.prepare('SELECT * FROM runtime_node WHERE id = ?').get(node.id));
}

/** 预览基址白名单：只接受主机名/IP 字面量，杜绝把代理目标拼成任意内网 URL。 */
const BLOCKED_PREVIEW_HOSTS = new Set([
  '169.254.169.254', 'metadata.google.internal', 'metadata', 'metadata.azure.internal',
  '100.100.100.200',
]);

export function assertPreviewHost(raw: unknown): string {
  const host = String(raw || '').trim();
  if (!host) throw new Error('工作节点未上报可用的预览地址');
  if (host.includes('://') || /[/\\@?#]/.test(host) || !/^[A-Za-z0-9.\[\]:_-]+$/.test(host)) {
    throw new Error('节点预览地址包含非法字符');
  }
  if (BLOCKED_PREVIEW_HOSTS.has(host.toLowerCase())) throw new Error('节点预览地址不允许指向云元数据服务');
  const isIpv6Literal = host.startsWith('[') && host.endsWith(']');
  if (!isIpv6Literal && host.includes(':')) throw new Error('节点预览地址不能包含端口');
  return host;
}

/** 预览失败一律用稳定 code，前端/排障可直接读，不靠匹配文案。 */
export class WorkspacePreviewError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'WorkspacePreviewError';
    this.code = code;
    this.status = status;
  }
}

export interface WorkspacePreviewTarget {
  baseUrl: string;
  host: string;
  port: number;
  workspace: any;
}

/**
 * ★ 唯一出口：能不能预览、能连到哪里，全部在这里判定。
 * 路由只负责按返回值转发，不得自行拼 host / 接受用户传入的目标地址。
 */
export function resolveWorkspacePreviewTarget(
  userId: string,
  workspaceId: string,
  port: number,
  now = Date.now(),
): WorkspacePreviewTarget {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new WorkspacePreviewError('INVALID_PORT', '预览端口无效');
  const ws = db.prepare('SELECT * FROM runtime_workspace WHERE id = ?').get(workspaceId) as any;
  if (!ws || ws.owner_user_id !== userId) {
    throw new WorkspacePreviewError('WORKSPACE_FORBIDDEN', '工作区不存在或无权预览', 404);
  }
  if (ws.status !== 'running') {
    throw new WorkspacePreviewError('WORKSPACE_NOT_RUNNING', '工作区未在运行，无法预览', 409);
  }
  if (ws.expires_at && Number(ws.expires_at) <= now) {
    throw new WorkspacePreviewError('WORKSPACE_EXPIRED', '工作区已到期，预览已失效', 410);
  }
  const ports = parseJson<number[]>(ws.ports_json, []).map(Number);
  if (!ports.includes(p)) throw new WorkspacePreviewError('PORT_NOT_REGISTERED', '端口未登记或已关闭', 404);
  const node = db.prepare('SELECT preview_host FROM runtime_node WHERE id = ?').get(ws.node_id) as any;
  let host: string;
  try { host = assertPreviewHost(node?.preview_host || '127.0.0.1'); }
  catch (e) { throw new WorkspacePreviewError('INVALID_PREVIEW_HOST', (e as Error).message, 502); }
  return { baseUrl: `http://${host}:${p}`, host, port: p, workspace: ws };
}

/** 上游不可达时摘掉该端口登记，保证「端口关闭后预览立即失效」而不是每次都试连。 */
export function unregisterWorkspacePort(workspaceId: string, port: number): void {
  const row = db.prepare('SELECT ports_json FROM runtime_workspace WHERE id = ?').get(workspaceId) as any;
  if (!row) return;
  const ports = parseJson<number[]>(row.ports_json, []).map(Number).filter((p) => p !== Number(port));
  db.prepare('UPDATE runtime_workspace SET ports_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(ports), Date.now(), workspaceId);
}

export function heartbeatRuntimeNode(token: string): any {
  const node = authenticateRuntimeNode(token);
  if (!node) throw new Error('节点令牌无效');
  const now = Date.now();
  db.prepare("UPDATE runtime_node SET status = 'online', last_seen_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, node.id);
  expireStaleRuntimeNodes();
  return nodeView(db.prepare('SELECT * FROM runtime_node WHERE id = ?').get(node.id));
}

export function expireStaleRuntimeNodes(now = Date.now()): number {
  const cutoff = now - 2 * 60 * 1000;
  return db.prepare(
    "UPDATE runtime_node SET status = 'offline', updated_at = ? WHERE status = 'online' AND COALESCE(last_seen_at, 0) < ?",
  ).run(now, cutoff).changes;
}

export function listRuntimeNodes(userId: string, opts: { all?: boolean } = {}): any[] {
  expireStaleRuntimeNodes();
  const rows = opts.all
    ? db.prepare('SELECT * FROM runtime_node ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM runtime_node WHERE owner_user_id = ? ORDER BY created_at DESC').all(userId);
  return rows.map(nodeView);
}

export function updateRuntimeNode(id: string, input: Partial<RuntimeNodeInput> & { enabled?: boolean }): any {
  const row = db.prepare('SELECT * FROM runtime_node WHERE id = ?').get(id) as any;
  if (!row) throw new Error('节点不存在');
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  if (input.name !== undefined) put('name', String(input.name).trim());
  if (input.orgId !== undefined) put('org_id', input.orgId || null);
  if (input.platform !== undefined) put('platform', input.platform);
  if (input.arch !== undefined) put('arch', input.arch);
  if (input.version !== undefined) put('version', input.version);
  if (input.capabilities !== undefined) put('capabilities_json', JSON.stringify(input.capabilities));
  if (input.enabled !== undefined) put('status', input.enabled ? 'offline' : 'disabled');
  if (!sets.length) return nodeView(row);
  put('updated_at', Date.now());
  vals.push(id);
  db.prepare(`UPDATE runtime_node SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return nodeView(db.prepare('SELECT * FROM runtime_node WHERE id = ?').get(id));
}

export function deleteRuntimeNode(id: string): void {
  db.prepare('DELETE FROM runtime_task WHERE node_id = ? AND state IN (\'queued\', \'running\')').run(id);
  db.prepare('DELETE FROM runtime_node WHERE id = ?').run(id);
}

export interface RuntimeTaskInput {
  nodeId: string;
  kind?: string;
  payload?: Record<string, unknown>;
  conversationId?: string | null;
  taskId?: string | null;
  workspaceId?: string | null;
}

export function createRuntimeTask(userId: string, input: RuntimeTaskInput): any {
  const node = db.prepare('SELECT * FROM runtime_node WHERE id = ? AND owner_user_id = ?').get(input.nodeId, userId) as any;
  if (!node) throw new Error('工作节点不存在或无权使用');
  if (node.status === 'disabled') throw new Error('工作节点已停用');
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO runtime_task
      (id, node_id, owner_user_id, conversation_id, task_id, workspace_id, kind,
       payload_json, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
  ).run(
    id, input.nodeId, userId, input.conversationId || null, input.taskId || null,
    input.workspaceId || null, input.kind || 'command',
    JSON.stringify(input.payload || {}), now,
  );
  return getRuntimeTask(id, userId);
}

export function claimRuntimeTask(token: string): any | null {
  const node = authenticateRuntimeNode(token);
  if (!node) throw new Error('节点令牌无效');
  const now = Date.now();
  const tx = db.transaction(() => {
    const row = db.prepare(
      "SELECT * FROM runtime_task WHERE node_id = ? AND state = 'queued' ORDER BY created_at ASC LIMIT 1",
    ).get(node.id) as any;
    if (!row) return null;
    db.prepare(
      "UPDATE runtime_task SET state = 'running', started_at = ? WHERE id = ? AND state = 'queued'",
    ).run(now, row.id);
    return db.prepare('SELECT * FROM runtime_task WHERE id = ?').get(row.id);
  });
  const task = tx();
  if (!task) return null;
  db.prepare("UPDATE runtime_node SET status = 'online', last_seen_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, node.id);
  return runtimeTaskView(task);
}

export function appendRuntimeEvents(token: string, taskId: string, events: Array<{ seq: number; kind: string; payload?: unknown }>): number {
  const node = authenticateRuntimeNode(token);
  if (!node) throw new Error('节点令牌无效');
  const task = db.prepare('SELECT * FROM runtime_task WHERE id = ? AND node_id = ?').get(taskId, node.id) as any;
  if (!task) throw new Error('任务不存在或不属于该节点');
  const ins = db.prepare(
    `INSERT OR IGNORE INTO runtime_event
      (id, runtime_task_id, seq, kind, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    let n = 0;
    for (const ev of events) {
      const seq = Number(ev?.seq);
      if (!Number.isFinite(seq) || seq < 0) continue;
      n += ins.run(
        randomUUID(), taskId, Math.floor(seq), String(ev?.kind || 'message'),
        JSON.stringify(ev?.payload ?? {}), Date.now(),
      ).changes;
    }
    return n;
  });
  return tx();
}

export function completeRuntimeTask(token: string, taskId: string, input: {
  state?: 'completed' | 'failed' | 'cancelled';
  result?: unknown;
  error?: string | null;
  exitCode?: number | null;
  artifacts?: Array<{ name: string; path?: string; mimeType?: string; sizeBytes?: number; sha256?: string }>;
}): any {
  const node = authenticateRuntimeNode(token);
  if (!node) throw new Error('节点令牌无效');
  const task = db.prepare('SELECT * FROM runtime_task WHERE id = ? AND node_id = ?').get(taskId, node.id) as any;
  if (!task) throw new Error('任务不存在或不属于该节点');
  const state = input.state === 'failed' || input.state === 'cancelled' ? input.state : 'completed';
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE runtime_task SET state = ?, result_json = ?, error = ?, exit_code = ?, ended_at = ? WHERE id = ?',
    ).run(
      state,
      input.result === undefined ? null : JSON.stringify(input.result),
      input.error ? String(input.error).slice(0, 4000) : null,
      input.exitCode == null ? null : Number(input.exitCode),
      now, taskId,
    );
    for (const a of input.artifacts || []) {
      if (!a?.name) continue;
      db.prepare(
        `INSERT INTO runtime_artifact
          (id, runtime_task_id, name, path, mime_type, size_bytes, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(), taskId, a.name, a.path || null, a.mimeType || null,
        a.sizeBytes == null ? null : Number(a.sizeBytes), a.sha256 || null, now,
      );
    }
    db.prepare("UPDATE runtime_node SET status = 'online', last_seen_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, node.id);
  });
  tx();
  return runtimeTaskView(db.prepare('SELECT * FROM runtime_task WHERE id = ?').get(taskId));
}

export function cancelRuntimeTask(userId: string, id: string): any {
  const row = db.prepare('SELECT * FROM runtime_task WHERE id = ? AND owner_user_id = ?').get(id, userId) as any;
  if (!row) throw new Error('任务不存在或无权操作');
  if (row.state === 'queued' || row.state === 'running') {
    db.prepare("UPDATE runtime_task SET state = 'cancelled', ended_at = ? WHERE id = ?").run(Date.now(), id);
  }
  return runtimeTaskView(db.prepare('SELECT * FROM runtime_task WHERE id = ?').get(id));
}

function runtimeTaskView(row: any) {
  if (!row) return null;
  let result: unknown = null;
  if (row.result_json) {
    try { result = JSON.parse(row.result_json); } catch { result = row.result_json; }
  }
  return {
    ...row,
    payload: parseJson(row.payload_json, {}),
    result,
    payload_json: undefined,
    result_json: undefined,
  };
}

export function getRuntimeTask(id: string, userId?: string): any {
  const row = userId
    ? db.prepare('SELECT * FROM runtime_task WHERE id = ? AND owner_user_id = ?').get(id, userId)
    : db.prepare('SELECT * FROM runtime_task WHERE id = ?').get(id);
  return runtimeTaskView(row);
}

export function listRuntimeTasks(userId: string, opts: { all?: boolean; limit?: number } = {}): any[] {
  const rows = opts.all
    ? db.prepare('SELECT * FROM runtime_task ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(opts.limit) || 100, 500)))
    : db.prepare('SELECT * FROM runtime_task WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, Math.max(1, Math.min(Number(opts.limit) || 100, 500)));
  return (rows as any[]).map(runtimeTaskView);
}

export function listRuntimeEvents(taskId: string, sinceSeq = 0, limit = 500): any[] {
  return db.prepare(
    'SELECT * FROM runtime_event WHERE runtime_task_id = ? AND seq >= ? ORDER BY seq ASC LIMIT ?',
  ).all(taskId, Math.max(0, Number(sinceSeq) || 0), Math.max(1, Math.min(Number(limit) || 500, 2000))).map((r: any) => ({
    ...r,
    payload: parseJson(r.payload_json, {}),
    payload_json: undefined,
  }));
}

export function listRuntimeArtifacts(taskId: string): any[] {
  return db.prepare('SELECT * FROM runtime_artifact WHERE runtime_task_id = ? ORDER BY created_at ASC').all(taskId);
}

/**
 * ★ 与节点侧 enterprise-workspace-runtime.cjs#resolveWorkspaceMode 是同一条规则：
 *   带 image 就走容器，不带才是目录。两个物理实现是因为控制面是 TS/ESM、节点是 CJS 脚本，
 *   由 enterprise-workspace-container.test.ts 用断言钉住两者一致，避免一侧偷偷改规则。
 */
function workspaceModeFor(image: unknown): 'container' | 'directory' {
  return String(image || '').trim() ? 'container' : 'directory';
}

export function createWorkspace(userId: string, input: {
  nodeId: string;
  name: string;
  image?: string;
  cpu?: number;
  memoryMb?: number;
  ttlMinutes?: number;
  /** 停止时是否保留节点上的工作目录；默认 false（沿用原来的清理行为）。 */
  keepDir?: boolean;
  /** 容器模式下要发布的端口；节点启动容器后按实际映射回传登记。 */
  ports?: number[];
}): any {
  const node = db.prepare('SELECT * FROM runtime_node WHERE id = ? AND owner_user_id = ?').get(input.nodeId, userId) as any;
  if (!node) throw new Error('工作节点不存在或无权使用');
  const id = randomUUID();
  const now = Date.now();
  const ttl = Math.max(5, Math.min(Number(input.ttlMinutes) || 120, 7 * 24 * 60));
  const expiresAt = now + ttl * 60_000;
  const mode = workspaceModeFor(input.image);
  const keepDir = input.keepDir === true;
  db.prepare(
    `INSERT INTO runtime_workspace
      (id, node_id, owner_user_id, name, path, image, cpu, memory_mb,
       runtime_mode, keep_dir, status, ports_json, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'requested', '[]', ?, ?, ?)`,
  ).run(
    id, input.nodeId, userId, String(input.name || '').trim() || '工作区',
    input.image || null, input.cpu == null ? null : Number(input.cpu),
    input.memoryMb == null ? null : Number(input.memoryMb), mode, keepDir ? 1 : 0,
    expiresAt, now, now,
  );
  const workspace = getWorkspace(id, userId);
  createRuntimeTask(userId, {
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
}

export function getWorkspace(id: string, userId?: string): any {
  const row = userId
    ? db.prepare('SELECT * FROM runtime_workspace WHERE id = ? AND owner_user_id = ?').get(id, userId)
    : db.prepare('SELECT * FROM runtime_workspace WHERE id = ?').get(id);
  return workspaceView(row);
}

function workspaceView(row: any) {
  if (!row) return null;
  return {
    ...row,
    ports: parseJson(row.ports_json, []),
    keep_dir: !!row.keep_dir,
    runtime_mode: row.runtime_mode || 'directory',
    last_error: row.last_error ?? null,
    ports_json: undefined,
  };
}

export function listWorkspaces(userId: string, opts: { all?: boolean } = {}): any[] {
  const rows = opts.all
    ? db.prepare('SELECT * FROM runtime_workspace ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM runtime_workspace WHERE owner_user_id = ? ORDER BY created_at DESC').all(userId);
  return (rows as any[]).map(workspaceView);
}

export function updateWorkspaceState(token: string, workspaceId: string, input: {
  status: 'running' | 'stopped' | 'failed';
  path?: string;
  ports?: number[];
  error?: string;
  containerId?: string;
  containerName?: string;
  runtimeMode?: 'container' | 'directory';
}): any {
  const node = authenticateRuntimeNode(token);
  if (!node) throw new Error('节点令牌无效');
  const row = db.prepare('SELECT * FROM runtime_workspace WHERE id = ? AND node_id = ?').get(workspaceId, node.id) as any;
  if (!row) throw new Error('工作区不存在或不属于该节点');
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  put('status', input.status);
  if (input.path !== undefined) put('path', input.path || null);
  if (input.ports !== undefined) put('ports_json', JSON.stringify(input.ports || []));
  if (input.containerId !== undefined) put('container_id', input.containerId || null);
  else if (input.status === 'stopped') put('container_id', null);
  if (input.containerName !== undefined) put('container_name', input.containerName || null);
  else if (input.status === 'stopped') put('container_name', null);
  if (input.runtimeMode !== undefined) put('runtime_mode', input.runtimeMode);
  // 失败原因必须落库，否则「节点没装 Docker」在管理端只显示 failed，管理员无从下手。
  put('last_error', input.status === 'failed' ? (input.error || '节点执行失败').slice(0, 500) : null);
  put('updated_at', Date.now());
  vals.push(workspaceId);
  db.prepare(`UPDATE runtime_workspace SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return workspaceView(db.prepare('SELECT * FROM runtime_workspace WHERE id = ?').get(workspaceId));
}

export function stopWorkspace(userId: string, workspaceId: string): any {
  const row = db.prepare('SELECT * FROM runtime_workspace WHERE id = ? AND owner_user_id = ?').get(workspaceId, userId) as any;
  if (!row) throw new Error('工作区不存在或无权操作');
  if (row.status !== 'stopped') {
    createRuntimeTask(userId, {
      nodeId: row.node_id,
      workspaceId,
      kind: 'workspace_stop',
      payload: {
        workspaceId,
        path: row.path || null,
        mode: row.runtime_mode || 'directory',
        containerId: row.container_id || null,
        containerName: row.container_name || null,
        keepDir: !!row.keep_dir,
      },
    });
    db.prepare("UPDATE runtime_workspace SET status = 'stopping', updated_at = ? WHERE id = ?").run(Date.now(), workspaceId);
  }
  return getWorkspace(workspaceId, userId);
}

export function enqueueExpiredWorkspaceStops(now = Date.now()): number {
  const rows = db.prepare(
    "SELECT * FROM runtime_workspace WHERE status IN ('requested', 'running') AND expires_at IS NOT NULL AND expires_at <= ?",
  ).all(now) as any[];
  let n = 0;
  for (const row of rows) {
    try {
      createRuntimeTask(row.owner_user_id, {
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
      db.prepare("UPDATE runtime_workspace SET status = 'stopping', updated_at = ? WHERE id = ?").run(now, row.id);
      n += 1;
    } catch { /* 节点已删除等异常不阻塞其它工作区 */ }
  }
  return n;
}

export function startRuntimeJanitor(intervalMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    try {
      expireStaleRuntimeNodes();
      enqueueExpiredWorkspaceStops();
    } catch { /* 后台巡检失败不退出进程 */ }
  }, Math.max(10_000, intervalMs));
  timer.unref?.();
  return timer;
}

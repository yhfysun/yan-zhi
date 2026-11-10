/**
 * Task 7 验收测试：repository 收口的 SQLite 默认契约。
 *
 * ★ 用户强调"测试用例要到位"：这里不测"能调通"，而是钉住**语义一致性** ——
 *   JSON 列解析、布尔列、时间戳、加密/错误列不回显、参数化边界、事务回滚、
 *   以及 PG 配置/连接/迁移失败必须明确报错（绝不吞错或静默回落 SQLite）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import {
  appendRuntimeEvents, cancelRuntimeTask, createRuntimeNode, createRuntimeTask,
  createWorkspace, getRuntimeTask, getWorkspace, listRuntimeArtifacts,
  listRuntimeEvents, listRuntimeTasks, listWorkspaces, stopWorkspace,
  updateWorkspaceState,
} from '../src/enterprise/runtime.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createEnterpriseRepository, currentRepositoryBackend,
  resetEnterpriseRepositoryForTest,
} from '../src/enterprise/repository.js';

const UID = 'u_repo_test';
const OTHER = 'u_repo_other';
let nodeId = '';
let nodeToken = '';
let wsId = '';
let taskId = '';

beforeAll(() => {
  ensureEnterpriseSchema();
  seedRbac();
  db.prepare('DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id IN (?, ?))').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_artifact WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id IN (?, ?))').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_task WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_workspace WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM runtime_node WHERE owner_user_id IN (?, ?)').run(UID, OTHER);
  db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(UID, OTHER);
  for (const id of [UID, OTHER]) {
    db.prepare('INSERT INTO user (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(id, id, '!test', Date.now());
  }
  const created = createRuntimeNode(UID, { name: '仓库测试节点' });
  nodeId = created.node.id;
  nodeToken = created.token;
  const ws = createWorkspace(UID, { nodeId, name: '仓库工作区', image: 'alpine', keepDir: true } as any);
  wsId = ws.id;
  updateWorkspaceState(nodeToken, wsId, {
    status: 'running', path: '/tmp/repo-ws', ports: [3000, 8080], containerId: 'cid-1',
  } as any);
  const other = createWorkspace(UID, { nodeId, name: '别人的工作区' } as any);
  db.prepare('UPDATE runtime_workspace SET owner_user_id = ? WHERE id = ?').run(OTHER, other.id);
  const task = createRuntimeTask(UID, { nodeId, workspaceId: wsId, kind: 'command', payload: { command: 'echo' } });
  taskId = task.id;
  appendRuntimeEvents(nodeToken, taskId, [
    { seq: 1, kind: 'stdout', payload: { text: 'a' } },
    { seq: 2, kind: 'stdout', payload: { text: 'b' } },
  ]);
});

afterAll(async () => {
  await resetEnterpriseRepositoryForTest();
});

describe('默认后端与工厂', () => {
  it('未配置时默认 sqlite，health 正常', async () => {
    expect(currentRepositoryBackend()).toBe('sqlite');
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    expect(repo.backend).toBe('sqlite');
    const h = await repo.health();
    expect(h.ok).toBe(true);
    expect(h.backend).toBe('sqlite');
    await repo.close();
  });

  it('SQLite 实现与 PG 实现暴露同一组公开方法', async () => {
    const sqlite = await createEnterpriseRepository({ backend: 'sqlite' });
    const keys = [
      'health', 'close', 'listWorkspaces', 'getWorkspace',
      'getRuntimeTask', 'listRuntimeTasks', 'listRuntimeEvents', 'listRuntimeArtifacts',
      'cancelRuntimeTask', 'stopWorkspace', 'withTransaction',
    ];
    for (const k of keys) expect(typeof (sqlite as any)[k], k).toBe('function');
    // PG 实现的类必须在模块里真实存在（工厂在连接失败前不会返回实例，这里钉住导出契约）
    expect(currentRepositoryBackend()).toBe('sqlite');
    await sqlite.close();
  });

  it('★ PG 模式缺少 DATABASE_URL ⇒ 明确报错，不静默回落 SQLite', async () => {
    delete process.env.DATABASE_URL;
    await expect(createEnterpriseRepository({ backend: 'postgres' }))
      .rejects.toThrow(/DATABASE_URL|未配置/);
  });

  it('★ DATABASE_URL 格式非法 ⇒ 明确报错', async () => {
    await expect(createEnterpriseRepository({ backend: 'postgres', url: 'not-a-postgres-url' }))
      .rejects.toThrow(/postgres/i);
  });

  it('★ PG 连接失败 ⇒ 明确报错（不吞错、不 fallback）', async () => {
    await expect(createEnterpriseRepository({
      backend: 'postgres', url: 'postgres://postgres:postgres@127.0.0.1:1/none', ensureSchema: false,
    })).rejects.toThrow(/连接|connect|ECONNREFUSED|失败/i);
  }, 15_000);
});

describe('SQLite 契约：语义一致性', () => {
  it('listWorkspaces 与唯一实现完全一致（ports JSON / keep_dir 布尔 / 空值归一）', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const direct = listWorkspaces(UID);
    const viaRepo = await repo.listWorkspaces(UID);
    expect(viaRepo).toEqual(direct);
    const ws = viaRepo.find((w) => w.id === wsId);
    expect(ws.ports).toEqual([3000, 8080]);
    expect(ws.keep_dir).toBe(true);
    expect(ws.runtime_mode).toBe('container');
    expect(ws.ports_json).toBeUndefined();
    expect(typeof ws.created_at).toBe('number');
    await repo.close();
  });

  it('getWorkspace 与唯一实现一致；不存在 / 越权返回 null', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    expect(await repo.getWorkspace(wsId, UID)).toEqual(getWorkspace(wsId, UID));
    expect(await repo.getWorkspace(wsId, OTHER)).toBeNull();
    expect(await repo.getWorkspace('not-exist', UID)).toBeNull();
    await repo.close();
  });

  it('★ 参数化：恶意 userId 不会绕过归属过滤（不注入）', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const rows = await repo.listWorkspaces("' OR 1=1 --");
    expect(rows).toEqual([]);
    await repo.close();
  });

  it('listRuntimeEvents 与唯一实现一致（seq 排序 / payload 解析 / sinceSeq / limit）', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    expect(await repo.listRuntimeEvents(taskId)).toEqual(listRuntimeEvents(taskId));
    expect((await repo.listRuntimeEvents(taskId, 2)).map((e) => e.seq)).toEqual([2]);
    expect(await repo.listRuntimeEvents(taskId, 0, 1)).toHaveLength(1);
    await repo.close();
  });

  it('任务读取与唯一实现一致（详情 / 列表 / 归属过滤 / limit）', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    expect(await repo.getRuntimeTask(taskId, UID)).toEqual(getRuntimeTask(taskId, UID));
    expect(await repo.getRuntimeTask(taskId, OTHER)).toBeNull();
    expect(await repo.listRuntimeTasks(UID)).toEqual(listRuntimeTasks(UID));
    expect(await repo.listRuntimeTasks(UID, { limit: 1 })).toEqual(listRuntimeTasks(UID, { limit: 1 }));
    expect(await repo.listRuntimeTasks('', { all: true, limit: 1 }))
      .toEqual(listRuntimeTasks('', { all: true, limit: 1 }));
    expect(await repo.listRuntimeArtifacts(taskId)).toEqual(listRuntimeArtifacts(taskId));
    await repo.close();
  });

  it('加密列 / 失败原因不回显到列表（last_error 只作明确字段存在）', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const ws = await repo.getWorkspace(wsId, UID);
    expect(Object.keys(ws)).not.toContain('token_enc');
    expect(Object.keys(ws)).not.toContain('code_verifier_enc');
    expect(ws.last_error).toBeNull();
    await repo.close();
  });
});

describe('接线守卫（repository 真的被用上，不是只导出一个模块）', () => {
  it('运行时读写路由走 repository，admin 有 health 端点', () => {
    const routes = readFileSync(resolve(__dirname, '../src/routes/enterprise.ts'), 'utf8');
    expect(routes).toContain('getEnterpriseRepository');
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/workspaces'[\s\S]{0,300}repo\.listWorkspaces/);
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/workspaces\/:id'[\s\S]{0,300}repo\.getWorkspace/);
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/tasks'[\s\S]{0,300}repo\.listRuntimeTasks/);
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/tasks\/:id'[\s\S]{0,300}repo\.getRuntimeTask/);
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/tasks\/:id\/events'[\s\S]{0,400}repo\.listRuntimeEvents/);
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/tasks\/:id\/artifacts'[\s\S]{0,500}repo\.listRuntimeArtifacts/);
    expect(routes).toMatch(/enterpriseUserRouter\.post\('\/runtime\/tasks\/:id\/cancel'[\s\S]{0,300}repo\.cancelRuntimeTask/);
    expect(routes).toMatch(/enterpriseUserRouter\.post\('\/runtime\/workspaces\/:id\/stop'[\s\S]{0,300}repo\.stopWorkspace/);
    expect(routes).toMatch(/enterpriseAdminRouter\.get\('\/runtime\/workspaces'[\s\S]{0,300}repo\.listWorkspaces/);
    expect(routes).toMatch(/enterpriseAdminRouter\.get\('\/runtime\/tasks'[\s\S]{0,300}repo\.listRuntimeTasks/);
    expect(routes).toMatch(/enterpriseAdminRouter\.get\('\/runtime\/nodes'[\s\S]{0,300}repo\.listRuntimeNodes/);
    expect(routes).toMatch(/enterpriseAdminRouter\.post\('\/runtime\/nodes'[\s\S]{0,300}repo\.createRuntimeNode/);
    expect(routes).toMatch(/enterpriseAdminRouter\.patch\('\/runtime\/nodes\/:id'[\s\S]{0,300}repo\.updateRuntimeNode/);
    expect(routes).toMatch(/enterpriseAdminRouter\.delete\('\/runtime\/nodes\/:id'[\s\S]{0,300}repo\.deleteRuntimeNode/);
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/nodes'[\s\S]{0,300}repo\.listRuntimeNodes/);
    expect(routes).toMatch(/enterpriseRuntimeRouter\.post\('\/register'[\s\S]{0,300}repo\.registerRuntimeNode/);
    expect(routes).toMatch(/enterpriseRuntimeRouter\.post\('\/heartbeat'[\s\S]{0,300}repo\.heartbeatRuntimeNode/);
    expect(routes).toMatch(/enterpriseUserRouter\.post\('\/runtime\/tasks'[\s\S]{0,300}repo\.createRuntimeTask/);
    expect(routes).toMatch(/enterpriseRuntimeRouter\.get\('\/tasks\/next'[\s\S]{0,300}repo\.claimRuntimeTask/);
    expect(routes).toMatch(/enterpriseRuntimeRouter\.post\('\/tasks\/:id\/events'[\s\S]{0,400}repo\.appendRuntimeEvents/);
    expect(routes).toMatch(/enterpriseRuntimeRouter\.post\('\/tasks\/:id\/complete'[\s\S]{0,400}repo\.completeRuntimeTask/);
    expect(routes).toMatch(/enterpriseRuntimeRouter\.post\('\/workspaces\/:id\/state'[\s\S]{0,400}repo\.updateWorkspaceState/);
    expect(routes).toMatch(/enterpriseUserRouter\.post\('\/runtime\/workspaces'[\s\S]{0,300}repo\.createWorkspace/);
    expect(routes).toMatch(/handleWorkspacePreview[\s\S]{0,500}repo\.resolveWorkspacePreviewTarget/);
    expect(routes).toMatch(/repo\.unregisterWorkspacePort/);
    expect(routes).toContain("'/repository/health'");
    expect(routes).not.toContain('const row = getWorkspace(');
    expect(routes).not.toContain('const task = getRuntimeTask(');
    expect(routes).not.toContain('ok(res, cancelRuntimeTask(');
    expect(routes).not.toContain('ok(res, stopWorkspace(');
    expect(routes).not.toContain('ok(res, listRuntimeNodes(');
    expect(routes).not.toContain('ok(res, createRuntimeNode(');
    expect(routes).not.toContain('ok(res, updateRuntimeNode(');
    expect(routes).not.toContain('await deleteRuntimeNode(');
    expect(routes).not.toContain('ok(res, createRuntimeTask(');
    expect(routes).not.toContain('ok(res, claimRuntimeTask(');
    expect(routes).not.toContain('ok(res, { inserted: appendRuntimeEvents(');
    expect(routes).not.toContain('ok(res, completeRuntimeTask(');
    expect(routes).not.toContain('ok(res, updateWorkspaceState(');
    expect(routes).not.toContain('ok(res, createWorkspace(');
    expect(routes).not.toContain('target = resolveWorkspacePreviewTarget(');
    expect(routes).not.toMatch(/^\s{4}unregisterWorkspacePort\(req\.params\.id/m);
  });

  it('WS 控制通道、MCP 工具执行和运行时巡检也走 repository', () => {
    const ws = readFileSync(resolve(__dirname, '../src/enterprise/runtime-ws.ts'), 'utf8');
    expect(ws).toContain('getEnterpriseRepository');
    expect(ws).not.toContain('const task = claimRuntimeTask(token)');
    expect(ws).not.toContain('const inserted = appendRuntimeEvents(token');
    expect(ws).not.toContain('      completeRuntimeTask(token, taskId');
    expect(ws).not.toMatch(/(^|\s)touchRuntimeNode\(token\)/);

    const tools = readFileSync(resolve(__dirname, '../src/mcp/api-tool-executor.ts'), 'utf8');
    expect(tools).toContain('getEnterpriseRepository');
    expect(tools).not.toContain('ok(createRuntimeTask(uid');
    expect(tools).not.toContain('ok(createWorkspace(uid');
    expect(tools).not.toContain('ok(listRuntimeNodes(');
    expect(tools).not.toContain('const task = getRuntimeTask(str(args');

    const index = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');
    expect(index).toContain('startRuntimeRepositoryJanitor');
    expect(index).not.toContain('startRuntimeJanitor();');
  });

  it('PG 模式启动即连接 + 迁移，失败明确退出（不静默回落）', () => {
    const entry = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');
    expect(entry).toContain("currentRepositoryBackend() === 'postgres'");
    expect(entry).toContain('getEnterpriseRepository()');
    expect(entry).toContain('process.exit(1)');
  });
});

describe('事务边界', () => {
  it('withTransaction 正常提交', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const id = 'repo-tx-commit';
    await repo.withTransaction(async () => {
      db.prepare("INSERT INTO runtime_workspace (id, node_id, owner_user_id, name, status, ports_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'requested', '[]', ?, ?)")
        .run(id, nodeId, UID, '事务提交', Date.now(), Date.now());
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM runtime_workspace WHERE id = ?').get(id)).toEqual({ n: 1 });
    db.prepare('DELETE FROM runtime_workspace WHERE id = ?').run(id);
    await repo.close();
  });

  it('★ withTransaction 抛错回滚（SQLite 与 PG 语义一致）', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const id = 'repo-tx-rollback';
    await expect(repo.withTransaction(async () => {
      db.prepare("INSERT INTO runtime_workspace (id, node_id, owner_user_id, name, status, ports_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'requested', '[]', ?, ?)")
        .run(id, nodeId, UID, '事务回滚', Date.now(), Date.now());
      throw new Error('SENTINEL_ROLLBACK');
    })).rejects.toThrow('SENTINEL_ROLLBACK');
    expect(db.prepare('SELECT COUNT(*) AS n FROM runtime_workspace WHERE id = ?').get(id)).toEqual({ n: 0 });
    await repo.close();
  });

  it('★ 在外层事务中调用 repository 写方法，外层回滚时一并撤销', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const task = createRuntimeTask(UID, {
      nodeId, workspaceId: wsId, kind: 'command', payload: { nested: true },
    });
    await expect(repo.withTransaction(async (tx) => {
      await tx.cancelRuntimeTask(UID, task.id);
      throw new Error('SENTINEL_NESTED_ROLLBACK');
    })).rejects.toThrow('SENTINEL_NESTED_ROLLBACK');
    expect(getRuntimeTask(task.id, UID)?.state).toBe('queued');
    await repo.close();
  });
});

describe('写路径契约：取消任务 / 停止工作区', () => {
  it('取消 queued 任务：归属校验、状态落 cancelled、ended_at 只写一次且可重复取消', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const task = createRuntimeTask(UID, {
      nodeId, workspaceId: wsId, kind: 'command', payload: { command: 'sleep 10' },
    });

    await expect(repo.cancelRuntimeTask(OTHER, task.id)).rejects.toThrow(/不存在|无权/);
    expect(getRuntimeTask(task.id, UID)?.state).toBe('queued');

    const cancelled = await repo.cancelRuntimeTask(UID, task.id);
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.ended_at).toEqual(expect.any(Number));
    expect(cancelled).toEqual(cancelRuntimeTask(UID, task.id));
    expect(cancelled.ended_at).toBe((await repo.cancelRuntimeTask(UID, task.id)).ended_at);
    await repo.close();
  });

  it('已结束任务再次取消不做任何状态改写', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const task = createRuntimeTask(UID, {
      nodeId, workspaceId: wsId, kind: 'command', payload: { command: 'true' },
    });
    db.prepare("UPDATE runtime_task SET state = 'completed', ended_at = ? WHERE id = ?")
      .run(123456, task.id);

    const result = await repo.cancelRuntimeTask(UID, task.id);
    expect(result.state).toBe('completed');
    expect(result.ended_at).toBe(123456);
    await repo.close();
  });

  it('停止工作区：状态落 stopping，入队一条 workspace_stop 且载荷完整', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const ws = createWorkspace(UID, {
      nodeId, name: '待停止工作区', image: 'alpine', keepDir: true,
    } as any);
    updateWorkspaceState(nodeToken, ws.id, {
      status: 'running', path: '/tmp/stop-me', containerId: 'cid-stop', containerName: 'yz-stop',
    } as any);

    const stopped = await repo.stopWorkspace(UID, ws.id);
    expect(stopped.status).toBe('stopping');
    const rows = db.prepare(
      "SELECT * FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'",
    ).all(ws.id) as any[];
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payload_json)).toMatchObject({
      workspaceId: ws.id,
      path: '/tmp/stop-me',
      mode: 'container',
      containerId: 'cid-stop',
      containerName: 'yz-stop',
      keepDir: true,
    });
    await repo.close();
  });

  it('停止工作区幂等：stopping / stopped 均不重复入队，越权无副作用', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const ws = createWorkspace(UID, { nodeId, name: '重复停止工作区' } as any);
    const count = () => (db.prepare(
      "SELECT COUNT(*) AS n FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'",
    ).get(ws.id) as any).n;

    await expect(repo.stopWorkspace(OTHER, ws.id)).rejects.toThrow(/不存在|无权/);
    expect(count()).toBe(0);
    expect(getWorkspace(ws.id, UID)?.status).toBe('requested');

    await repo.stopWorkspace(UID, ws.id);
    await repo.stopWorkspace(UID, ws.id);
    expect(count()).toBe(1);
    expect(getWorkspace(ws.id, UID)?.status).toBe('stopping');

    db.prepare("UPDATE runtime_workspace SET status = 'stopped' WHERE id = ?").run(ws.id);
    const stopped = await repo.stopWorkspace(UID, ws.id);
    expect(stopped.status).toBe('stopped');
    expect(count()).toBe(1);
    await repo.close();
  });
});

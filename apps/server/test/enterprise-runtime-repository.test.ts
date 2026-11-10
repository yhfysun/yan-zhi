/**
 * Task 7 运行时控制面 repository 契约。
 *
 * SQLite 分支必须与 runtime.ts 的唯一实现保持完全一致；后续 PG 用例复用同一组
 * 业务断言，避免两个后端靠"各测各的"产生语义漂移。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { ensureEnterpriseSchema } from '../src/enterprise/schema.js';
import { seedRbac } from '../src/rbac.js';
import {
  authenticateRuntimeNode, createRuntimeNode, expireStaleRuntimeNodes,
  getRuntimeTask, listRuntimeArtifacts, listRuntimeEvents, listRuntimeNodes,
  listWorkspaces,
} from '../src/enterprise/runtime.js';
import {
  createEnterpriseRepository, resetEnterpriseRepositoryForTest,
} from '../src/enterprise/repository.js';

const UID = 'u_runtime_repo_control';
const OTHER = 'u_runtime_repo_control_other';

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
});

afterAll(async () => {
  await resetEnterpriseRepositoryForTest();
});

describe('节点控制面', () => {
  it('创建节点返回一次性 token；正确 token 可认证，错误 token 与未知节点均拒绝', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, {
      name: 'Repository 节点', platform: 'win32', arch: 'x64', capabilities: ['command'],
    });
    expect(created.node.name).toBe('Repository 节点');
    expect(created.node.status).toBe('offline');
    expect(created.node.capabilities).toEqual(['command']);
    expect(created.token).toMatch(/^yzn\./);
    expect((await repo.authenticateRuntimeNode(created.token))?.id).toBe(created.node.id);
    expect(await repo.authenticateRuntimeNode(created.token.replace(/.$/, 'x'))).toBeNull();
    expect(await repo.authenticateRuntimeNode('not-a-node-token')).toBeNull();
    await repo.close();
  });

  it('注册与心跳更新在线状态、平台信息和 capabilities，不覆盖未提供字段', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, {
      name: '注册节点', platform: 'win32', arch: 'x64', version: 'v1',
    });
    const registered = await repo.registerRuntimeNode(created.token, {
      platform: 'linux', capabilities: ['workspace_container'], previewHost: '127.0.0.1',
    } as any);
    expect(registered.status).toBe('online');
    expect(registered.platform).toBe('linux');
    expect(registered.arch).toBe('x64');
    expect(registered.version).toBe('v1');
    expect(registered.capabilities).toEqual(['workspace_container']);
    expect(registered.preview_host).toBe('127.0.0.1');

    await new Promise((r) => setTimeout(r, 5));
    const heartbeat = await repo.heartbeatRuntimeNode(created.token);
    expect(heartbeat.status).toBe('online');
    expect(heartbeat.last_seen_at).toBeGreaterThanOrEqual(registered.last_seen_at);
    await repo.close();
  });

  it('列表、更新与删除节点：归属过滤、字段白名单、删除时清掉活跃任务', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const mine = await repo.createRuntimeNode(UID, { name: '我的节点' });
    const other = await repo.createRuntimeNode(OTHER, { name: '别人的节点' });
    expect((await repo.listRuntimeNodes(UID)).some((n) => n.id === mine.node.id)).toBe(true);
    expect((await repo.listRuntimeNodes(UID)).some((n) => n.id === other.node.id)).toBe(false);
    expect((await repo.listRuntimeNodes('', { all: true })).length).toBeGreaterThanOrEqual(2);

    const updated = await repo.updateRuntimeNode(mine.node.id, {
      name: '改名节点', capabilities: ['command', 'workspace_container'], enabled: false,
    });
    expect(updated.name).toBe('改名节点');
    expect(updated.capabilities).toEqual(['command', 'workspace_container']);
    expect(updated.status).toBe('disabled');

    db.prepare(
      `INSERT INTO runtime_task
        (id, node_id, owner_user_id, kind, payload_json, state, created_at)
       VALUES ('node-delete-active-task', ?, ?, 'command', '{}', 'queued', ?)`,
    ).run(mine.node.id, UID, Date.now());
    db.prepare(
      `INSERT INTO runtime_task
        (id, node_id, owner_user_id, kind, payload_json, state, created_at)
       VALUES ('node-delete-done-task', ?, ?, 'command', '{}', 'completed', ?)`,
    ).run(mine.node.id, UID, Date.now());
    await repo.deleteRuntimeNode(mine.node.id);
    expect(db.prepare('SELECT id FROM runtime_node WHERE id = ?').get(mine.node.id)).toBeUndefined();
    expect(db.prepare('SELECT id FROM runtime_task WHERE id = ?').get('node-delete-active-task')).toBeUndefined();
    expect(db.prepare('SELECT id FROM runtime_task WHERE id = ?').get('node-delete-done-task')).toBeTruthy();
    await repo.close();
  });

  it('stale 在线节点回收：仅超过阈值且仍 online 的节点转 offline', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const stale = await repo.createRuntimeNode(UID, { name: 'stale 节点' });
    const fresh = await repo.createRuntimeNode(UID, { name: 'fresh 节点' });
    db.prepare("UPDATE runtime_node SET status = 'online', last_seen_at = ? WHERE id = ?")
      .run(Date.now() - 10 * 60_000, stale.node.id);
    db.prepare("UPDATE runtime_node SET status = 'online', last_seen_at = ? WHERE id = ?")
      .run(Date.now(), fresh.node.id);
    expect(await repo.expireStaleRuntimeNodes()).toBeGreaterThanOrEqual(1);
    expect((db.prepare('SELECT status FROM runtime_node WHERE id = ?').get(stale.node.id) as any).status).toBe('offline');
    expect((db.prepare('SELECT status FROM runtime_node WHERE id = ?').get(fresh.node.id) as any).status).toBe('online');
    await repo.close();
  });

  it('SQLite 委托与 runtime.ts 唯一实现保持同一语义', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, { name: '对照节点' });
    expect(await repo.authenticateRuntimeNode(created.token)).toEqual(authenticateRuntimeNode(created.token));
    expect((await repo.listRuntimeNodes(UID)).map((n) => n.id))
      .toEqual(listRuntimeNodes(UID).map((n) => n.id));
    expect(await repo.expireStaleRuntimeNodes()).toBe(expireStaleRuntimeNodes());
    await repo.close();
  });
});

describe('任务与工作区控制面', () => {
  it('任务创建 → 原子认领 → 事件幂等 → 完成与产物登记', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, { name: '任务控制节点' });
    await repo.registerRuntimeNode(created.token, { capabilities: ['command'] });
    const task = await repo.createRuntimeTask(UID, {
      nodeId: created.node.id,
      kind: 'command',
      payload: { command: 'echo repo' },
    });
    expect(task.state).toBe('queued');
    expect(task.payload).toEqual({ command: 'echo repo' });

    const claimed = await repo.claimRuntimeTask(created.token);
    expect(claimed.id).toBe(task.id);
    expect(claimed.state).toBe('running');
    expect(await repo.claimRuntimeTask(created.token)).toBeNull();

    expect(await repo.appendRuntimeEvents(created.token, task.id, [
      { seq: 1, kind: 'stdout', payload: { text: 'a' } },
      { seq: 2, kind: 'stdout', payload: { text: 'b' } },
    ])).toBe(2);
    expect(await repo.appendRuntimeEvents(created.token, task.id, [
      { seq: 1, kind: 'stdout', payload: { text: 'ignored' } },
      { seq: 3, kind: 'stdout', payload: { text: 'c' } },
    ])).toBe(1);
    expect((await repo.listRuntimeEvents(task.id)).map((e) => e.seq)).toEqual([1, 2, 3]);

    const completed = await repo.completeRuntimeTask(created.token, task.id, {
      state: 'completed',
      result: { ok: true },
      exitCode: 0,
      artifacts: [{ name: 'report.txt', path: '/tmp/report.txt', sizeBytes: 42 }],
    });
    expect(completed.state).toBe('completed');
    expect(completed.result).toEqual({ ok: true });
    expect(completed.exit_code).toBe(0);
    const artifacts = await repo.listRuntimeArtifacts(task.id);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ name: 'report.txt', size_bytes: 42 });
    await repo.close();
  });

  it('创建工作区会原子下发 workspace_create，节点状态回传更新运行信息', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, { name: '工作区控制节点' });
    await repo.registerRuntimeNode(created.token, { capabilities: ['workspace_container'] });
    const ws = await repo.createWorkspace(UID, {
      nodeId: created.node.id,
      name: 'Repository 工作区',
      image: 'alpine',
      keepDir: true,
      ttlMinutes: 30,
    } as any);
    expect(ws.status).toBe('requested');
    expect(ws.runtime_mode).toBe('container');
    expect(ws.keep_dir).toBe(true);
    const createTask = db.prepare(
      "SELECT * FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_create'",
    ).get(ws.id) as any;
    expect(createTask).toBeTruthy();
    expect(JSON.parse(createTask.payload_json)).toMatchObject({
      workspaceId: ws.id, image: 'alpine', mode: 'container', keepDir: true,
    });

    const running = await repo.updateWorkspaceState(created.token, ws.id, {
      status: 'running',
      path: '/tmp/repo-workspace',
      ports: [3000, 8080],
      containerId: 'cid-repo',
      containerName: 'yz-repo',
    });
    expect(running).toMatchObject({
      status: 'running', path: '/tmp/repo-workspace', ports: [3000, 8080],
      container_id: 'cid-repo', container_name: 'yz-repo',
    });
    expect((await repo.listWorkspaces(UID)).some((w) => w.id === ws.id)).toBe(true);
    await repo.close();
  });

  it('TTL 巡检只停止过期且未收敛的工作区，重复执行不重复入队', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, { name: 'TTL 控制节点' });
    await repo.registerRuntimeNode(created.token, {});
    const ws = await repo.createWorkspace(UID, { nodeId: created.node.id, name: '过期工作区' } as any);
    await repo.updateWorkspaceState(created.token, ws.id, { status: 'running' });
    db.prepare('UPDATE runtime_workspace SET expires_at = ? WHERE id = ?').run(Date.now() - 1_000, ws.id);
    expect(await repo.enqueueExpiredWorkspaceStops()).toBeGreaterThanOrEqual(1);
    expect((db.prepare('SELECT status FROM runtime_workspace WHERE id = ?').get(ws.id) as any).status).toBe('stopping');
    const count = (db.prepare(
      "SELECT COUNT(*) AS n FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'",
    ).get(ws.id) as any).n;
    expect(await repo.enqueueExpiredWorkspaceStops()).toBe(0);
    expect((db.prepare(
      "SELECT COUNT(*) AS n FROM runtime_task WHERE workspace_id = ? AND kind = 'workspace_stop'",
    ).get(ws.id) as any).n).toBe(count);
    expect(count).toBe(1);
    await repo.close();
  });

  it('SQLite 任务/事件/产物读取与唯一实现一致', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, { name: '对照任务节点' });
    await repo.registerRuntimeNode(created.token, {});
    const task = await repo.createRuntimeTask(UID, {
      nodeId: created.node.id, kind: 'command', payload: { command: 'true' },
    });
    expect(await repo.getRuntimeTask(task.id, UID)).toEqual(getRuntimeTask(task.id, UID));
    expect(await repo.listRuntimeEvents(task.id)).toEqual(listRuntimeEvents(task.id));
    expect(await repo.listRuntimeArtifacts(task.id)).toEqual(listRuntimeArtifacts(task.id));
    await repo.close();
  });

  it('预览目标解析走同一白名单判定，上游失败可注销端口', async () => {
    const repo = await createEnterpriseRepository({ backend: 'sqlite' });
    const created = await repo.createRuntimeNode(UID, { name: '预览控制节点' });
    await repo.registerRuntimeNode(created.token, { previewHost: '127.0.0.1' } as any);
    const ws = await repo.createWorkspace(UID, { nodeId: created.node.id, name: '预览控制工作区' } as any);
    await repo.updateWorkspaceState(created.token, ws.id, { status: 'running', ports: [3000, 8080] });

    const target = await repo.resolveWorkspacePreviewTarget(UID, ws.id, 3000);
    expect(target).toMatchObject({ host: '127.0.0.1', port: 3000 });
    expect(target.baseUrl).toBe('http://127.0.0.1:3000');
    await expect(repo.resolveWorkspacePreviewTarget(OTHER, ws.id, 3000)).rejects.toThrow(/不存在|无权/);
    await expect(repo.resolveWorkspacePreviewTarget(UID, ws.id, 3001)).rejects.toThrow(/端口|PORT/);

    await repo.unregisterWorkspacePort(ws.id, 3000);
    expect((await repo.getWorkspace(ws.id, UID))?.ports).toEqual([8080]);
    await repo.close();
  });
});

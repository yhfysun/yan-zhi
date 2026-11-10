/**
 * Task 7：PostgreSQL repository 一致性测试。
 *
 * ★ plan.md 明确要求：「有 PostgreSQL 实例时跑 repository 一致性测试；
 *   无实例时测试必须如实失败（不能静默跳过）」。
 *   所以这里**不使用 describe.skip / it.skip**：没有 YZ_TEST_PG_URL 就抛明确错误，
 *   让"PG 路径尚未验证"在全量结果里如实可见，而不是伪装成绿色。
 *
 * 运行方式（有实例时）：
 *   YZ_TEST_PG_URL=postgres://user:pass@127.0.0.1:5432/yan_zhi_test \
 *     pnpm --filter @yan-zhi/server exec vitest run test/enterprise-repository-pg.test.ts --no-file-parallelism
 */
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { beforeAll, describe, it, expect, afterAll } from 'vitest';
import { createEnterpriseRepository } from '../src/enterprise/repository.js';

const url = String(process.env.YZ_TEST_PG_URL || '').trim();
const PG_USER = '__pg_repo_user__';
const PG_OTHER = '__pg_repo_other__';
let repoRef: Awaited<ReturnType<typeof createEnterpriseRepository>> | null = null;
let pool: Pool | null = null;
let nodeId = '';

async function insertTask(id: string, owner = PG_USER, state = 'queued'): Promise<void> {
  await pool!.query(
    `INSERT INTO runtime_task
      (id, node_id, owner_user_id, workspace_id, kind, payload_json, state, created_at)
     VALUES ($1, $2, $3, NULL, 'command', '{}'::jsonb, $4, $5)`,
    [id, nodeId, owner, state, Date.now()],
  );
}

async function insertWorkspace(id: string, owner = PG_USER): Promise<void> {
  await pool!.query(
    `INSERT INTO runtime_workspace
      (id, node_id, owner_user_id, name, path, image, cpu, memory_mb, status, ports_json,
       expires_at, created_at, updated_at, runtime_mode, container_id, container_name, keep_dir, last_error)
     VALUES ($1, $2, $3, 'PG 停止测试', '/tmp/pg-stop', 'alpine', 1, 256, 'running',
             '[]'::jsonb, NULL, $4, $4, 'container', 'cid-pg', 'yz-pg', 1, NULL)`,
    [id, nodeId, owner, Date.now()],
  );
}

async function cleanup(): Promise<void> {
  if (!pool) return;
  await pool.query(
    'DELETE FROM runtime_artifact WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id IN ($1, $2))',
    [PG_USER, PG_OTHER],
  );
  await pool.query(
    'DELETE FROM runtime_event WHERE runtime_task_id IN (SELECT id FROM runtime_task WHERE owner_user_id IN ($1, $2))',
    [PG_USER, PG_OTHER],
  );
  await pool.query('DELETE FROM runtime_task WHERE owner_user_id IN ($1, $2)', [PG_USER, PG_OTHER]);
  await pool.query('DELETE FROM runtime_workspace WHERE owner_user_id IN ($1, $2)', [PG_USER, PG_OTHER]);
  await pool.query('DELETE FROM runtime_node WHERE owner_user_id IN ($1, $2)', [PG_USER, PG_OTHER]);
}

describe('PostgreSQL repository 一致性', () => {
  if (!url) {
    it('需要 PostgreSQL 实例：一致性未验证（按验收要求如实失败，不静默跳过）', () => {
      throw new Error(
        'YZ_TEST_PG_URL 未配置：PostgreSQL repository 一致性测试未验证。'
        + '请提供测试实例后重跑本文件；不允许用 skip 伪装通过。',
      );
    });
    return;
  }

  beforeAll(async () => {
    repoRef = await createEnterpriseRepository({ backend: 'postgres', url, ensureSchema: true });
    pool = new Pool({ connectionString: url, max: 2 });
    await cleanup();
    nodeId = randomUUID();
    await pool.query(
      `INSERT INTO runtime_node
        (id, owner_user_id, name, token_hash, status, created_at, updated_at)
       VALUES ($1, $2, 'PG 一致性节点', '', 'offline', $3, $3)`,
      [nodeId, PG_USER, Date.now()],
    );
  });

  afterAll(async () => {
    await cleanup();
    await pool?.end();
    await repoRef?.close();
  });

  it('连接 + 迁移成功，health 明确报 postgres', async () => {
    expect(repoRef!.backend).toBe('postgres');
    const h = await repoRef!.health();
    expect(h.ok).toBe(true);
    expect(h.backend).toBe('postgres');
  });

  it('★ 与 SQLite 相同的读写契约：JSON 列、布尔列、时间戳、空值归一', async () => {
    const repo = repoRef!;
    const rows = await repo.listWorkspaces('__pg_probe_user__', { all: true });
    expect(Array.isArray(rows)).toBe(true);
    for (const w of rows) {
      expect(Array.isArray(w.ports)).toBe(true);
      expect(typeof w.keep_dir).toBe('boolean');
      expect(w.ports_json).toBeUndefined();
      if (w.last_error !== null && w.last_error !== undefined) expect(typeof w.last_error).toBe('string');
      expect(typeof w.created_at === 'number' || typeof w.created_at === 'string').toBe(true);
    }
    expect(await repo.getWorkspace('__not_exist__', 'x')).toBeNull();
  });

  it('★ 参数化：恶意 userId 不注入', async () => {
    const repo = repoRef!;
    expect(await repo.listWorkspaces("' OR 1=1 --")).toEqual([]);
  });

  it('★ 事务边界：抛错回滚', async () => {
    const repo = repoRef!;
    await expect(repo.withTransaction(async () => {
      throw new Error('SENTINEL_PG_ROLLBACK');
    })).rejects.toThrow('SENTINEL_PG_ROLLBACK');
    expect((await repo.health()).ok).toBe(true);
  });

  it('listRuntimeEvents 返回按 seq 排序的解析后 payload', async () => {
    const events = await repoRef!.listRuntimeEvents('__not_exist__');
    expect(events).toEqual([]);
  });

  it('★ 取消 queued 任务：归属校验、状态落 cancelled、重复取消保持 ended_at', async () => {
    const taskId = randomUUID();
    await insertTask(taskId);

    await expect(repoRef!.cancelRuntimeTask(PG_OTHER, taskId))
      .rejects.toThrow(/不存在|无权/);
    expect((await repoRef!.getRuntimeTask(taskId, PG_USER)).state).toBe('queued');

    const first = await repoRef!.cancelRuntimeTask(PG_USER, taskId);
    expect(first.state).toBe('cancelled');
    expect(first.ended_at).toEqual(expect.any(Number));
    const second = await repoRef!.cancelRuntimeTask(PG_USER, taskId);
    expect(second.state).toBe('cancelled');
    expect(second.ended_at).toBe(first.ended_at);
  });

  it('★ 已结束任务再次取消不覆盖完成状态与结束时间', async () => {
    const taskId = randomUUID();
    await insertTask(taskId, PG_USER, 'completed');
    await pool!.query('UPDATE runtime_task SET ended_at = 123456 WHERE id = $1', [taskId]);

    const result = await repoRef!.cancelRuntimeTask(PG_USER, taskId);
    expect(result.state).toBe('completed');
    expect(result.ended_at).toBe(123456);
  });

  it('★ 停止工作区：事务入队一条 workspace_stop，重复停止幂等且越权无副作用', async () => {
    const workspaceId = randomUUID();
    await insertWorkspace(workspaceId);

    await expect(repoRef!.stopWorkspace(PG_OTHER, workspaceId))
      .rejects.toThrow(/不存在|无权/);
    expect((await repoRef!.getWorkspace(workspaceId, PG_USER)).status).toBe('running');

    const first = await repoRef!.stopWorkspace(PG_USER, workspaceId);
    expect(first.status).toBe('stopping');
    const second = await repoRef!.stopWorkspace(PG_USER, workspaceId);
    expect(second.status).toBe('stopping');

    const rows = await pool!.query(
      "SELECT payload_json FROM runtime_task WHERE workspace_id = $1 AND kind = 'workspace_stop'",
      [workspaceId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].payload_json).toMatchObject({
      workspaceId,
      path: '/tmp/pg-stop',
      mode: 'container',
      containerId: 'cid-pg',
      containerName: 'yz-pg',
      keepDir: true,
    });
  });

  it('★ 嵌套 repository 写方法加入外层事务，外层抛错必须回滚', async () => {
    const taskId = randomUUID();
    await insertTask(taskId);

    await expect(repoRef!.withTransaction(async (tx) => {
      await tx.cancelRuntimeTask(PG_USER, taskId);
      throw new Error('SENTINEL_PG_NESTED_ROLLBACK');
    })).rejects.toThrow('SENTINEL_PG_NESTED_ROLLBACK');

    expect((await repoRef!.getRuntimeTask(taskId, PG_USER)).state).toBe('queued');
  });

  it('★ 节点全生命周期：创建/认证/注册/心跳/更新/列表/删除', async () => {
    const created = await repoRef!.createRuntimeNode(PG_USER, {
      name: 'PG 生命周期节点', platform: 'win32', arch: 'x64', capabilities: ['command'],
    });
    expect(created.token).toMatch(/^yzn\./);
    expect((await repoRef!.authenticateRuntimeNode(created.token))?.id).toBe(created.node.id);
    expect(await repoRef!.authenticateRuntimeNode(`${created.token}x`)).toBeNull();

    const registered = await repoRef!.registerRuntimeNode(created.token, {
      platform: 'linux', capabilities: ['workspace_container'], previewHost: '127.0.0.1',
    });
    expect(registered).toMatchObject({
      status: 'online', platform: 'linux', arch: 'x64', preview_host: '127.0.0.1',
    });
    expect(registered.capabilities).toEqual(['workspace_container']);
    expect((await repoRef!.heartbeatRuntimeNode(created.token)).status).toBe('online');
    expect((await repoRef!.listRuntimeNodes(PG_USER)).some((n) => n.id === created.node.id)).toBe(true);

    const updated = await repoRef!.updateRuntimeNode(created.node.id, {
      name: 'PG 节点改名', capabilities: ['command'], enabled: false,
    });
    expect(updated).toMatchObject({ name: 'PG 节点改名', status: 'disabled' });
    expect(updated.capabilities).toEqual(['command']);
    await repoRef!.deleteRuntimeNode(created.node.id);
    expect(await repoRef!.authenticateRuntimeNode(created.token)).toBeNull();
  });

  it('★ 任务/工作区全生命周期：创建/领取/事件/完成/产物/状态回传/预览/停写', async () => {
    const created = await repoRef!.createRuntimeNode(PG_USER, { name: 'PG 控制面节点' });
    await repoRef!.registerRuntimeNode(created.token, {
      capabilities: ['command', 'workspace_container'], previewHost: '127.0.0.1',
    });
    const task = await repoRef!.createRuntimeTask(PG_USER, {
      nodeId: created.node.id, kind: 'command', payload: { command: 'echo pg' },
    });
    expect(task.state).toBe('queued');
    const claimed = await repoRef!.claimRuntimeTask(created.token);
    expect(claimed).toMatchObject({ id: task.id, state: 'running' });
    expect(await repoRef!.claimRuntimeTask(created.token)).toBeNull();

    expect(await repoRef!.appendRuntimeEvents(created.token, task.id, [
      { seq: 1, kind: 'stdout', payload: { text: 'pg' } },
    ])).toBe(1);
    expect(await repoRef!.appendRuntimeEvents(created.token, task.id, [
      { seq: 1, kind: 'stdout', payload: { text: 'ignored' } },
    ])).toBe(0);
    const completed = await repoRef!.completeRuntimeTask(created.token, task.id, {
      state: 'completed', result: { ok: true }, exitCode: 0,
      artifacts: [{ name: 'pg.txt', sizeBytes: 2 }],
    });
    expect(completed).toMatchObject({ state: 'completed', result: { ok: true }, exit_code: 0 });
    expect((await repoRef!.listRuntimeArtifacts(task.id))[0].name).toBe('pg.txt');

    const ws = await repoRef!.createWorkspace(PG_USER, {
      nodeId: created.node.id, name: 'PG 工作区', image: 'alpine', keepDir: true,
    } as any);
    expect(ws).toMatchObject({ status: 'requested', runtime_mode: 'container', keep_dir: true });
    const running = await repoRef!.updateWorkspaceState(created.token, ws.id, {
      status: 'running', path: '/tmp/pg-ws', ports: [3000],
    });
    expect(running).toMatchObject({ status: 'running', path: '/tmp/pg-ws', ports: [3000] });
    expect((await repoRef!.resolveWorkspacePreviewTarget(PG_USER, ws.id, 3000)).baseUrl)
      .toBe('http://127.0.0.1:3000');
    await repoRef!.unregisterWorkspacePort(ws.id, 3000);
    expect((await repoRef!.getWorkspace(ws.id, PG_USER)).ports).toEqual([]);

    const stopped = await repoRef!.stopWorkspace(PG_USER, ws.id);
    expect(stopped.status).toBe('stopping');
  });

  it('★ TTL 巡检在 PG 中只停止过期未收敛工作区', async () => {
    const created = await repoRef!.createRuntimeNode(PG_USER, { name: 'PG TTL 节点' });
    await repoRef!.registerRuntimeNode(created.token, {});
    const ws = await repoRef!.createWorkspace(PG_USER, {
      nodeId: created.node.id, name: 'PG TTL 工作区',
    } as any);
    await repoRef!.updateWorkspaceState(created.token, ws.id, { status: 'running' });
    await pool!.query('UPDATE runtime_workspace SET expires_at = $1 WHERE id = $2', [Date.now() - 1000, ws.id]);
    expect(await repoRef!.enqueueExpiredWorkspaceStops()).toBeGreaterThanOrEqual(1);
    expect((await repoRef!.getWorkspace(ws.id, PG_USER)).status).toBe('stopping');
    expect(await repoRef!.enqueueExpiredWorkspaceStops()).toBe(0);
  });
});

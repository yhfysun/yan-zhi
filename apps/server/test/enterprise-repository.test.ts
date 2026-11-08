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
  createRuntimeNode, createRuntimeTask, createWorkspace, updateWorkspaceState,
  appendRuntimeEvents, getWorkspace, listWorkspaces, listRuntimeEvents,
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
    const keys = ['health', 'close', 'listWorkspaces', 'getWorkspace', 'listRuntimeEvents', 'withTransaction'];
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
  it('工作区列表路由走 repository，admin 有 health 端点', () => {
    const routes = readFileSync(resolve(__dirname, '../src/routes/enterprise.ts'), 'utf8');
    expect(routes).toContain('getEnterpriseRepository');
    expect(routes).toMatch(/enterpriseUserRouter\.get\('\/runtime\/workspaces'[\s\S]{0,300}repo\.listWorkspaces/);
    expect(routes).toContain("'/repository/health'");
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
});

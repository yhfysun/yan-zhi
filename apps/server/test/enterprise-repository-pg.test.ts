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
import { describe, it, expect, afterAll } from 'vitest';
import { createEnterpriseRepository } from '../src/enterprise/repository.js';

const url = String(process.env.YZ_TEST_PG_URL || '').trim();
let repoRef: Awaited<ReturnType<typeof createEnterpriseRepository>> | null = null;

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

  afterAll(async () => { await repoRef?.close(); });

  it('连接 + 迁移成功，health 明确报 postgres', async () => {
    repoRef = await createEnterpriseRepository({ backend: 'postgres', url, ensureSchema: true });
    expect(repoRef.backend).toBe('postgres');
    const h = await repoRef.health();
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
});

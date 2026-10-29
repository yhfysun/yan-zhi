// 只读数据契约测试：固定清单、未知契约拒绝、参数钳制、空库可执行（SQL 正确性）
import { describe, it, expect } from 'vitest';
import { listReadContracts, runReadContract } from '../src/services/read-contracts.js';

describe('只读数据契约', () => {
  it('清单固定且带参数说明', () => {
    const list = listReadContracts();
    const names = list.map((c) => c.name).sort();
    expect(names).toEqual(['agents.running', 'conversations.recent', 'tasks.today']);
    for (const c of list) {
      expect(typeof c.description).toBe('string');
      expect(c.params.limit.min).toBe(1);
      expect(c.params.limit.max).toBe(50);
    }
  });

  it('未知契约与缺用户被拒', () => {
    expect(runReadContract('nope', 'u1')).toEqual({ ok: false, error: 'unknown-contract' });
    expect(runReadContract('tasks.today', '')).toEqual({ ok: false, error: 'missing-user' });
  });

  it('参数钳制：limit 超界取边界', () => {
    for (const name of ['tasks.today', 'agents.running', 'conversations.recent']) {
      expect(runReadContract(name, 'u1', { limit: 9999 }).ok).toBe(true);
      expect(runReadContract(name, 'u1', { limit: -5 }).ok).toBe(true);
      expect(runReadContract(name, 'u1', { limit: 'abc' }).ok).toBe(true);
    }
  });

  it('空库可执行且返回数组（SQL 与 schema 对齐）', () => {
    for (const name of ['tasks.today', 'agents.running', 'conversations.recent']) {
      const r = runReadContract(name, 'no-such-user');
      expect(r.ok).toBe(true);
      if (r.ok) expect(Array.isArray(r.data)).toBe(true);
    }
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 模式切换记录（2b.5）行为测试：
 *  ① 记录按会话隔离、零会话共用一组；from===to 不记；
 *  ② 持久化到 localStorage，重新加载后仍可读；
 *  ③ 单会话最多 20 条，防止长会话无限增长。
 */

function makeLS(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

let ls: Storage;
let mod: typeof import('./modeTransitions');

beforeEach(async () => {
  vi.resetModules();
  ls = makeLS();
  vi.stubGlobal('localStorage', ls);
  mod = await import('./modeTransitions');
});

describe('modeTransitions', () => {
  it('按会话隔离；from===to 不记录；latest 取最后一条', () => {
    mod.recordModeTransition({ convId: 'c1', at: 1, from: 'office', to: 'dev' });
    mod.recordModeTransition({ convId: 'c1', at: 2, from: 'dev', to: 'dev' });
    mod.recordModeTransition({ convId: 'c2', at: 3, from: 'office', to: 'sec' });

    expect(mod.transitionsFor('c1')).toHaveLength(1);
    expect(mod.transitionsFor('c2')).toHaveLength(1);
    expect(mod.latestTransitionFor('c1')?.to).toBe('dev');
    expect(mod.latestTransitionFor('c2')?.to).toBe('sec');
    expect(mod.latestTransitionFor('missing')).toBeNull();
  });

  it('持久化后重新加载仍可读', async () => {
    mod.recordModeTransition({ convId: 'c1', at: 10, from: 'office', to: 'ops' });
    vi.resetModules();
    const again = await import('./modeTransitions');
    expect(again.transitionsFor('c1')).toHaveLength(1);
    expect(again.latestTransitionFor('c1')?.from).toBe('office');
  });

  it('单会话最多保留 20 条（保留最近）', () => {
    for (let i = 0; i < 25; i += 1) {
      mod.recordModeTransition({ convId: 'long', at: i + 1, from: 'office', to: i % 2 ? 'dev' : 'sec' });
    }
    const rows = mod.transitionsFor('long');
    expect(rows).toHaveLength(20);
    expect(rows[rows.length - 1].at).toBe(25);
    expect(rows[0].at).toBe(6);
  });

  it('clear 可按会话清空', () => {
    mod.recordModeTransition({ convId: 'a', at: 1, from: 'office', to: 'dev' });
    mod.recordModeTransition({ convId: 'b', at: 2, from: 'office', to: 'dev' });
    mod.clearModeTransitions('a');
    expect(mod.transitionsFor('a')).toHaveLength(0);
    expect(mod.transitionsFor('b')).toHaveLength(1);
  });
});

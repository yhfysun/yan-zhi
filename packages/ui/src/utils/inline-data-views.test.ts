// 内嵌看板契约本地持久化单测（用内存 localStorage 替身）。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyInlineDataViews,
  clearInlineDataViews,
  loadInlineDataViews,
  saveInlineDataView,
} from './inline-data-views';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemStorage() as unknown as Storage;
});

describe('inline-data-views', () => {
  it('保存后能按会话读回', () => {
    saveInlineDataView('c1', 'm1', { table: 'conversation', title: '看板' });
    expect(loadInlineDataViews('c1').m1).toEqual({ table: 'conversation', title: '看板' });
    expect(loadInlineDataViews('c2')).toEqual({});
  });

  it('回填到消息对象', () => {
    saveInlineDataView('c1', 'm1', { table: 't', title: 'A' });
    const msgs = [{ id: 'm1', role: 'assistant', content: '' }, { id: 'm2', role: 'assistant', content: '' }] as any[];
    applyInlineDataViews(msgs, 'c1');
    expect(msgs[0].dataView?.table).toBe('t');
    expect(msgs[1].dataView).toBeUndefined();
  });

  it('服务端已落库的 dataView 优先，本地不覆盖', () => {
    saveInlineDataView('c1', 'm1', { table: 'local' });
    const msgs = [{ id: 'm1', role: 'assistant', content: '', dataView: { table: 'server' } }] as any[];
    applyInlineDataViews(msgs, 'c1');
    expect(msgs[0].dataView?.table).toBe('server');
  });

  it('每会话上限 80 条（超出丢最旧）', () => {
    for (let i = 0; i < 85; i++) saveInlineDataView('c1', `m${i}`, { table: `t${i}` });
    const map = loadInlineDataViews('c1');
    expect(Object.keys(map)).toHaveLength(80);
    expect(map.m0).toBeUndefined();
    expect(map.m84?.table).toBe('t84');
  });

  it('清除会话后读不到', () => {
    saveInlineDataView('c1', 'm1', { table: 't' });
    clearInlineDataViews('c1');
    expect(loadInlineDataViews('c1')).toEqual({});
  });

  it('没有 localStorage 时静默不崩', () => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    expect(() => saveInlineDataView('c1', 'm1', { table: 't' })).not.toThrow();
    expect(loadInlineDataViews('c1')).toEqual({});
  });
});

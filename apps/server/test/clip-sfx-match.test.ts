/**
 * 音效库按描述检索（服务端集成）：用**真实音效库**验证意图词典的落点。
 * ★ 纯匹配逻辑在 shared 单测；这里只钉"服务端库的条目/命名与词典对得上"。
 */
import { describe, it, expect } from 'vitest';
import { searchSfxLibrary } from '../src/services/sfx-library';

describe('searchSfxLibrary · 真实音效库', () => {
  it('★ 紧张 → 心跳排第一，并带上命中原由', () => {
    const r = searchSfxLibrary('紧张的氛围', 5);
    expect(r.matched).toBe(true);
    expect(r.hits[0].item.id).toBe('heartbeat');
    expect(r.hits[0].reason).toContain('紧张');
    expect(r.hits[0].item.maxSec).toBeGreaterThan(0);
  });

  it('★ 转场音 → 风声类；卡点鼓 → 鼓点类；金币 → 金币', () => {
    expect(searchSfxLibrary('转场音').hits[0].item.id).toBe('whoosh');
    expect(searchSfxLibrary('卡点鼓').hits[0].item.id).toBe('hit');
    expect(searchSfxLibrary('奖励音效').hits[0].item.id).toBe('coin');
  });

  it('没把握就不硬凑（matched=false, 空结果）', () => {
    const r = searchSfxLibrary('量子纠缠', 5);
    expect(r.matched).toBe(false);
    expect(r.hits).toEqual([]);
  });

  it('空查询返回空结果（不是全库）', () => {
    const r = searchSfxLibrary('', 5);
    expect(r.hits).toEqual([]);
    expect(r.matched).toBe(false);
  });
});

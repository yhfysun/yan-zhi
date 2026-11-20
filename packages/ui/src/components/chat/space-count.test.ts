import { describe, expect, it } from 'vitest';
import { countConversationsInSpaceTree } from './space-count';

describe('空间任务计数', () => {
  it('父空间统计包含所有子目录的任务', () => {
    const counts = {
      parent: [] as unknown[],
      childA: Array.from({ length: 5 }),
      childB: Array.from({ length: 18 }),
      childC: Array.from({ length: 11 }),
    };
    const children: Record<string, string[]> = {
      parent: ['childA', 'childB', 'childC'],
    };

    expect(countConversationsInSpaceTree('parent', counts, (id) => children[id] || [])).toBe(34);
  });

  it('递归统计孙目录，并避免异常父链造成死循环', () => {
    const counts = {
      parent: [1],
      child: [2, 3],
      grandchild: [4, 5, 6],
    };
    const children: Record<string, string[]> = {
      parent: ['child'],
      child: ['grandchild'],
      grandchild: ['parent'],
    };

    expect(countConversationsInSpaceTree('parent', counts, (id) => children[id] || [])).toBe(6);
  });
});

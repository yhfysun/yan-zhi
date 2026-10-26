import { describe, it, expect } from 'vitest';
import { moveTabOrder } from './tab-order';

describe('moveTabOrder（标签拖拽排序）', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('往后拖：被拖项落到目标位置，其余保持相对顺序', () => {
    expect(moveTabOrder(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('往前拖同理', () => {
    expect(moveTabOrder(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('原地不动时返回等值副本（不原地改 ref）', () => {
    const out = moveTabOrder(list, 2, 2);
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
  });

  it('越界索引不抛错、原样返回副本', () => {
    expect(moveTabOrder(list, -1, 2)).toEqual(list);
    expect(moveTabOrder(list, 0, 9)).toEqual(list);
  });
});

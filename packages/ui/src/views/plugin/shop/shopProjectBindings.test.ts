import { describe, expect, it } from 'vitest';
import type { Conversation } from '@yan-zhi/shared';
import {
  buildShopProjects,
  shopProjectIdOfConversation,
  shopProjectTasks,
} from './shopProjectBindings';

function conversation(
  id: string,
  title: string,
  updatedAt: number,
  projectId?: string,
): Conversation {
  return {
    id,
    title,
    mcpServerIds: [],
    skillIds: [],
    pinned: false,
    sourceMeta: projectId ? { shopProjectId: projectId } : null,
    createdAt: updatedAt - 100,
    updatedAt,
  };
}

describe('shop project bindings', () => {
  it('keeps legacy conversations as standalone projects', () => {
    const legacy = conversation('c_legacy', '老店铺项目', 100);

    expect(shopProjectIdOfConversation(legacy)).toBe('c_legacy');
    expect(buildShopProjects([legacy])).toEqual([
      { id: 'c_legacy', title: '老店铺项目', updatedAt: 100 },
    ]);
  });

  it('groups task conversations under the current shop project', () => {
    const anchor = conversation('p_shop', '家居店铺', 100);
    const olderTask = conversation('c_old', '选品', 200, 'p_shop');
    const latestTask = conversation('c_new', '开店资料', 300, 'p_shop');

    expect(buildShopProjects([latestTask, anchor, olderTask])).toEqual([
      { id: 'p_shop', title: '家居店铺', updatedAt: 300 },
    ]);
    expect(shopProjectTasks([latestTask, anchor, olderTask], 'p_shop').map((c) => c.id))
      .toEqual(['c_new', 'c_old', 'p_shop']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '../api/client';

async function freshStore() {
  vi.resetModules();
  setActivePinia(createPinia());
  const mod = await import('./page-assets');
  return mod.usePageAssetsStore();
}

const summary = {
  id: 'social.douyin.creator',
  title: '抖音创作者中心',
  platform: 'douyin',
  scope: 'public',
  status: 'active',
  version: 1,
  capabilities: ['social.content.publish.video'],
  operationIds: ['publish-video'],
  source: 'builtin',
  health: { successRate: 0.9, runCount: 10 },
  updatedAt: 1,
};

const detail = {
  ...summary,
  apiVersion: 'page-asset/v1',
  kind: 'PageAsset',
  match: { hosts: ['creator.douyin.com'], routes: ['/creator-micro/content/upload'] },
  operations: [{
    id: 'publish-video',
    title: '发布视频',
    confirmation: 'required',
    executor: { kind: 'recipe', recipeId: 'douyin-publish-video' },
  }],
  ownerUserId: null,
  createdAt: 1,
};

describe('page assets store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads management rows including drafts and preserves a server error as visible state', async () => {
    (api.get as any).mockResolvedValueOnce({ data: [summary], pagination: { totalItems: 1 } });
    const store = await freshStore();
    await store.load();
    expect((api.get as any).mock.calls[0][0]).toContain('includeDrafts=true');
    expect(store.items).toHaveLength(1);

    (api.get as any).mockResolvedValueOnce({ error: '数据库不可用' });
    await store.load();
    expect(store.error).toContain('数据库不可用');
    expect(store.items).toHaveLength(1);
  });

  it('selects an asset and loads its versions', async () => {
    (api.get as any)
      .mockResolvedValueOnce({ data: detail })
      .mockResolvedValueOnce({ data: [{ version: 1, contractHash: 'abc' }] });
    const store = await freshStore();
    await store.select('social.douyin.creator');
    expect(store.selected?.id).toBe('social.douyin.creator');
    expect(store.versions).toHaveLength(1);
  });

  it('counts pending drafts even while the active contract stays online', async () => {
    const store = await freshStore();
    store.items = [
      summary,
      { ...summary, id: 'custom.one', draftVersion: 3, hasDraft: true },
      { ...summary, id: 'custom.two', status: 'draft' },
    ] as any;
    expect(store.activeCount).toBe(2);
    expect(store.draftCount).toBe(2);
  });

  it('creates and updates drafts through the same save entry', async () => {
    (api.post as any).mockResolvedValueOnce({ data: detail });
    let store = await freshStore();
    await store.saveDraft(detail as any, { expectedVersion: 2, changeSummary: 'next' });
    expect((api.post as any).mock.calls[0][0]).toBe('/page-assets/drafts');
    expect((api.post as any).mock.calls[0][1]).toMatchObject({
      expectedVersion: 2,
      changeSummary: 'next',
    });

    (api.patch as any).mockResolvedValueOnce({ data: detail });
    store = await freshStore();
    await store.updateDraft('social.douyin.creator', detail as any, 3, 'edit');
    expect((api.patch as any).mock.calls[0][0]).toBe('/page-assets/social.douyin.creator/draft');
    expect((api.patch as any).mock.calls[0][1]).toMatchObject({ expectedVersion: 3, changeSummary: 'edit' });
  });

  it('activates with optimistic version and refreshes selected state', async () => {
    (api.post as any).mockResolvedValueOnce({ data: { ...detail, status: 'active', version: 4 } });
    (api.get as any)
      .mockResolvedValueOnce({ data: { ...detail, status: 'active', version: 4 } })
      .mockResolvedValueOnce({ data: [] });
    const store = await freshStore();
    await store.activate('social.douyin.creator', 3, 'ship');
    expect((api.post as any).mock.calls[0][0]).toBe('/page-assets/social.douyin.creator/activate');
    expect((api.post as any).mock.calls[0][1]).toMatchObject({ expectedVersion: 3, changeSummary: 'ship' });
    expect(store.selected?.version).toBe(4);
  });
});

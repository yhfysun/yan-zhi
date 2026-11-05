// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, type App } from 'vue';
import ElementPlus, { ElMessageBox } from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

const summary = {
  id: 'social.douyin.creator',
  title: '抖音创作者中心',
  platform: 'douyin',
  scope: 'public',
  status: 'active',
  version: 2,
  capabilities: ['social.content.publish.video'],
  operationIds: ['publish-video'],
  source: 'builtin',
  health: { successRate: 0.92, runCount: 25 },
  updatedAt: Date.now(),
};

const detail = {
  ...summary,
  apiVersion: 'page-asset/v1',
  kind: 'PageAsset',
  match: { hosts: ['creator.douyin.com'], routes: ['/creator-micro/content/upload'] },
  instructions: ['submit=false 时只做发布前准备'],
  operations: [{
    id: 'publish-video',
    title: '发布视频',
    capability: 'social.content.publish.video',
    confirmation: 'required',
    executor: { kind: 'recipe', recipeId: 'douyin-publish-video' },
    inputSchema: { type: 'object', required: ['mediaPaths', 'title'] },
  }],
  ownerUserId: null,
  createdAt: Date.now(),
};

const fakeStore = reactive({
  items: [summary],
  selected: detail,
  versions: [{ version: 2, contractHash: 'abcdef1234567890', changeSummary: 'initial', createdAt: Date.now() }],
  loading: false,
  detailLoading: false,
  saving: false,
  error: '',
  filters: { query: '', platform: '', status: '', page: 1, pageSize: 100 },
  activeCount: 1,
  draftCount: 0,
  load: vi.fn(async () => {}),
  select: vi.fn(async () => {}),
  clearSelection: vi.fn(),
  saveDraft: vi.fn(),
  updateDraft: vi.fn(),
  validate: vi.fn(),
  activate: vi.fn(),
  archive: vi.fn(),
  rollback: vi.fn(),
  probe: vi.fn(),
});

vi.mock('../../stores/page-assets', () => ({
  usePageAssetsStore: () => fakeStore,
}));

import PageAssets from './PageAssets.vue';

let app: App | null = null;

beforeAll(() => {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as any).matchMedia = (globalThis as any).matchMedia
    || ((query: string) => ({
      matches: false,
      media: query,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }));
});

async function mountPage() {
  if (app) app.unmount();
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(PageAssets);
  for (const [name, component] of Object.entries(Icons)) app.component(name, component as any);
  app.use(ElementPlus);
  app.mount(host);
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
  return host;
}

describe('PageAssets workbench', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeStore.items = [summary];
    fakeStore.selected = detail as any;
    fakeStore.saving = false;
    fakeStore.error = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders list, contract details and operation status', async () => {
    const host = await mountPage();
    const text = host.textContent || '';
    expect(text).toContain('页面资产');
    expect(text).toContain('抖音创作者中心');
    expect(text).toContain('已启用');
    expect(text).toContain('social.content.publish.video');
    expect(text).toContain('发布视频');
    expect(text).toContain('复制为草稿');
  });

  it('opens the JSON draft editor from the create action', async () => {
    const host = await mountPage();
    const create = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('新建资产'),
    ) as HTMLButtonElement | undefined;
    expect(create).toBeTruthy();
    create!.click();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(document.body.textContent).toContain('PageAssetSpec');
    expect(document.body.textContent).toContain('保存草稿');
  });

  it('edits the pending draft instead of the active contract', async () => {
    const draftSpec = {
      ...detail,
      title: '抖音创作者中心新版草稿',
      status: 'draft',
      version: 5,
    };
    fakeStore.selected = {
      ...detail,
      id: 'custom.douyin.creator',
      title: '抖音创作者中心',
      source: 'user',
      ownerUserId: 'user-a',
      version: 4,
      draft: {
        version: 5,
        baseVersion: 4,
        contractHash: 'draft-hash',
        spec: draftSpec,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    } as any;
    const host = await mountPage();
    const edit = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('编辑草稿'),
    ) as HTMLButtonElement | undefined;
    expect(edit).toBeTruthy();
    edit!.click();
    await nextTick();
    const textarea = document.body.querySelector('.pa-json-editor textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(JSON.parse(textarea.value).title).toBe('抖音创作者中心新版草稿');
  });

  it('activates a pending draft with its working version', async () => {
    const draftSpec = {
      ...detail,
      title: '抖音创作者中心新版草稿',
      status: 'draft',
      version: 5,
    };
    fakeStore.selected = {
      ...detail,
      id: 'custom.douyin.creator',
      source: 'user',
      ownerUserId: 'user-a',
      version: 4,
      draft: {
        version: 5,
        baseVersion: 4,
        contractHash: 'draft-hash',
        spec: draftSpec,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    } as any;
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm' as any);
    const host = await mountPage();
    const activate = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('启用草稿'),
    ) as HTMLButtonElement | undefined;
    expect(activate).toBeTruthy();
    activate!.click();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fakeStore.activate).toHaveBeenCalledWith(
      'custom.douyin.creator',
      5,
      'activate from page asset workbench',
    );
  });
});

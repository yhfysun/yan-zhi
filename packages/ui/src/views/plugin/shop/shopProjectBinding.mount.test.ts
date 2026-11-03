// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

const chatMock = vi.hoisted(() => ({
  currentConvId: '',
  conversations: [] as Array<Record<string, unknown>>,
  selectConv: vi.fn(async () => {}),
  state: null as any,
  refs: null as any,
  selected: [] as string[],
}));

vi.mock('../../../stores/chat', async () => {
  const { reactive, ref } = await import('vue');
  const currentConvId = ref(chatMock.currentConvId);
  const conversations = ref(chatMock.conversations);
  const workspaceDir = ref('');
  const hasWorkspaceDir = ref(false);
  const showWorkspaceDir = ref(false);
  const state = reactive({
    conversations,
    currentConvId,
    loadConversations: async () => {},
    createConversation: async () => 'conv_test',
    deleteConversation: async () => {},
    setNextConversationSourceMeta: vi.fn(),
    isConvStreaming: () => false,
  });
  chatMock.state = state;
  chatMock.refs = { conversations, currentConvId, workspaceDir, hasWorkspaceDir, showWorkspaceDir };
  return { useChatStore: () => state };
});

vi.mock('../../../composables/chat/useChat', () => ({
  useChat: () => ({
    selectConv: async (id: string) => {
      chatMock.selected.push(id);
      chatMock.state.currentConvId = id;
    },
    store: {
      rightPanelOpen: false,
      previewTabs: [],
      activatePreviewTab: vi.fn(),
      openTab: vi.fn(),
    },
    workspaceDir: chatMock.refs.workspaceDir,
    hasWorkspaceDir: chatMock.refs.hasWorkspaceDir,
    showWorkspaceDir: chatMock.refs.showWorkspaceDir,
  }),
}));

vi.mock('../shopSession', async () => {
  const { ref } = await import('vue');
  return {
    shopConnections: ref([{
      id: 'shop_1',
      platform: 'douyin',
      site: 'cn',
      shopName: '家居生活馆',
      projectId: 'p_shop',
      createdAt: 1,
      hasSecret: false,
      isProduction: false,
    }]),
    shopGroups: ref([]),
    shopPlatforms: ref([]),
    shopActiveId: ref(''),
    shopCheck: ref(null),
    shopCheckId: ref(''),
    shopAudit: ref([]),
    shopDemoData: ref({}),
    SHOP_UNGROUPED: '__ungrouped__',
    loadShopConsole: vi.fn(async () => {}),
    loadShopAudit: vi.fn(async () => {}),
    loadShopDemoData: vi.fn(async () => {}),
    selectShop: vi.fn(),
    createShop: vi.fn(async () => ''),
    updateShop: vi.fn(async () => ''),
    deleteShop: vi.fn(async () => ''),
    checkShop: vi.fn(async () => ''),
    seedDemoShops: vi.fn(async () => ''),
    clearDemoShops: vi.fn(async () => ''),
    getDemoTemplates: vi.fn(async () => ({ error: '', items: [] })),
    reassignProject: vi.fn(async () => ''),
    testShopLogistics: vi.fn(async () => ({ error: '', result: { ok: true, message: 'ok' } })),
    trackShopLogistics: vi.fn(async () => ({ error: '', result: { ok: true, provider: 'x', trackingNo: 'x', events: [] } })),
  };
});

vi.mock('./useShopApi', async () => {
  const { ref } = await import('vue');
  return {
    bizProducts: ref([]),
    bizOrders: ref([]),
    bizShipments: ref([]),
    bizMoves: ref([]),
    bizPurchases: ref([]),
    bizDashboard: ref(null),
    bizLoading: ref(false),
    bizError: ref(''),
    bizLastSummary: ref(''),
    bizShopId: ref(''),
    loadShopBiz: vi.fn(async () => {}),
    refreshShopBiz: vi.fn(async () => {}),
    updateShopModeApi: vi.fn(async () => ''),
    createProductApi: vi.fn(async () => ''),
    updateProductApi: vi.fn(async () => ''),
    deleteProductApi: vi.fn(async () => ''),
    setListingApi: vi.fn(async () => ''),
    setPriceApi: vi.fn(async () => ''),
    changeStockApi: vi.fn(async () => ''),
    batchProductApi: vi.fn(async () => ''),
    markOrderSourcedApi: vi.fn(async () => ''),
    mockOrderApi: vi.fn(async () => ''),
    importProductsApi: vi.fn(async () => ({ error: '' })),
    importOrdersApi: vi.fn(async () => ({ error: '' })),
    pushProductApi: vi.fn(async () => ({ error: '' })),
    pushShipmentApi: vi.fn(async () => ({ error: '' })),
    platformActionApi: vi.fn(async () => ({ error: '' })),
    fullSyncApi: vi.fn(async () => ({ error: '' })),
    saveSyncConfigApi: vi.fn(async () => ''),
    syncLogApi: vi.fn(async () => ({ error: '', entries: [] })),
    syncStatusOf: () => '',
    platformOrderIdOf: () => '',
    purchasesForOrder: () => [],
    createPurchasesApi: vi.fn(async () => ({ error: '' })),
    updatePurchaseStatusApi: vi.fn(async () => ''),
    purchaseJumpApi: vi.fn(async () => ({ error: '替身' })),
    shipOrderApi: vi.fn(async () => ''),
    trackShipmentApi: vi.fn(async () => ({ error: '', result: null })),
    openPlatformApi: vi.fn(async () => ({ error: '替身' })),
    markJumpDoneApi: vi.fn(async () => ''),
    SHOP_TYPE_META: { demo: { label: '演示', tag: 'info' }, test: { label: '测试', tag: 'warning' }, production: { label: '生产', tag: 'danger' } },
    SUPPLY_META: { stocked: { label: '有货源', tag: 'success' }, dropship: { label: '无货源', tag: 'warning' } },
    ORDER_STATUS_META: {},
    SHIPMENT_STATUS_META: {},
    LISTING_STATUS_META: {},
    money: (cents: number) => `¥${(Number(cents || 0) / 100).toFixed(2)}`,
    fmtTime: () => '2026-11-02 10:00',
  };
});

vi.mock('../../../components/chat/ChatMessageList.vue', () => ({ default: { name: 'ChatMessageList', render: () => null } }));
vi.mock('../../../components/chat/ChatInputArea.vue', () => ({ default: { name: 'ChatInputArea', render: () => null } }));
vi.mock('../../../components/chat/ChatDialogs.vue', () => ({ default: { name: 'ChatDialogs', render: () => null } }));
vi.mock('../../../components/chat/ChatPreviewPane.vue', () => ({ default: { name: 'ChatPreviewPane', render: () => null } }));
vi.mock('./shop/ShopConnectionDialog.vue', () => ({ default: { name: 'ShopConnectionDialog', render: () => null } }));

import ShopConsole from '../ShopConsole.vue';
import { workbenchContextOf } from '../../../stores/workbenchContext';

let app: App | null = null;

function mountConsole(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(ShopConsole as never) });
  app.use(createPinia());
  app.use(createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  }));
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  return host;
}

beforeEach(() => {
  chatMock.selected.length = 0;
  chatMock.selectConv.mockClear();
  chatMock.currentConvId = '';
  chatMock.conversations = [
    {
      id: 'p_shop',
      title: '家居店铺',
      mcpServerIds: [],
      skillIds: [],
      pinned: false,
      createdAt: 1,
      updatedAt: 100,
    },
    {
      id: 'c_latest',
      title: '开店资料',
      mcpServerIds: [],
      skillIds: [],
      pinned: false,
      sourceMeta: { shopProjectId: 'p_shop', scope: 'shop-project' },
      createdAt: 200,
      updatedAt: 300,
    },
  ];
  chatMock.refs.conversations.value = chatMock.conversations;
  chatMock.state.currentConvId = '';
  chatMock.refs.workspaceDir.value = '';
  chatMock.refs.hasWorkspaceDir.value = false;
  chatMock.refs.showWorkspaceDir.value = false;
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('ShopConsole project task binding', () => {
  it('keeps the current project active while a new task is still a draft', async () => {
    chatMock.state.currentConvId = 'c_latest';
    const host = mountConsole();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    chatMock.state.currentConvId = '';
    await nextTick();

    expect(host.querySelector('.shop-project.active')?.textContent).toContain('家居店铺');
    expect(host.querySelector('.shop-shop-row')?.textContent).toContain('家居生活馆');
    expect(chatMock.state.setNextConversationSourceMeta).toHaveBeenLastCalledWith({
      shopProjectId: 'p_shop',
      scope: 'shop-project',
    });
    expect(workbenchContextOf('shop')).toEqual({ label: '项目', value: '家居店铺' });
  });

  it('opens the latest task when the current project is selected', async () => {
    chatMock.state.currentConvId = 'c_latest';
    const host = mountConsole();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    chatMock.state.currentConvId = '';
    await nextTick();
    (host.querySelector('.shop-project-main') as HTMLButtonElement).click();
    await nextTick();

    expect(chatMock.selected.at(-1)).toBe('c_latest');
  });

  it('lists project tasks so older shop conversations stay reachable', async () => {
    chatMock.state.currentConvId = 'c_latest';
    const host = mountConsole();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    const tasks = [...host.querySelectorAll<HTMLButtonElement>('.shop-project-task')];
    expect(tasks).toHaveLength(2);
    expect(tasks.map((item) => item.textContent)).toEqual([
      expect.stringContaining('开店资料'),
      expect.stringContaining('家居店铺'),
    ]);

    tasks[1].click();
    await nextTick();
    expect(chatMock.selected.at(-1)).toBe('p_shop');
  });

  it('exposes the project material directory as a direct project action', async () => {
    chatMock.state.currentConvId = 'c_latest';
    const host = mountConsole();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(host.querySelector('.shop-project-workspace')?.textContent).toContain('素材目录');
    expect(host.querySelector('.shop-project-workspace')?.textContent).toContain('未绑定');
    (host.querySelector('.shop-project-workspace-action') as HTMLButtonElement).click();
    expect(chatMock.refs.showWorkspaceDir.value).toBe(true);

    chatMock.refs.workspaceDir.value = 'D:/shops/jiaju';
    chatMock.refs.hasWorkspaceDir.value = true;
    await nextTick();
    expect(host.querySelector('.shop-project-workspace')?.textContent).toContain('jiaju');
    expect(host.querySelector('.shop-project-workspace strong')?.getAttribute('title')).toBe('D:/shops/jiaju');
  });
});

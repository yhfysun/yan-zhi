// @vitest-environment jsdom
// ShopConsole setup 守门测试。
//
// ★ 为什么需要它（2026-10-21 真机事故）：新增物流凭据表单时，把
//   `watch(() => form.value.platform, …)` 写在了 `const form = ref(...)` **之前**。
//   watch 会同步求值 getter → 触发 TDZ 的 ReferenceError → setup 抛错 →
//   `/shop` 的懒加载组件永远挂不上，导航被中断：顶栏模式标记已经变成「店铺运营」，
//   页面却停在剪辑工作台（用户实报「点了切不过去」）。
//   typecheck 与普通单测都抓不到 —— 只有把组件真挂一次才会暴露。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

// 页面状态全部替身：本测试只关心 setup 是否跑得通与基本结构
vi.mock('./shopSession', async () => {
  const { ref } = await import('vue');
  return {
    shopConnections: ref([]),
    shopGroups: ref([]),
    shopPlatforms: ref([{
      id: 'sf-express',
      label: '顺丰速运（丰桥）',
      kind: 'logistics',
      entryUrl: 'https://www.sf-express.com/',
      loginNote: '演示',
      keyMetrics: ['轨迹'],
      integration: { auth: 'app-key-secret', client: 'ready', enterprise: true },
      credentials: [
        { key: 'partnerID', label: '顾客编码', required: true },
        { key: 'checkword', label: '校验码', required: true, secret: true },
      ],
    }]),
    shopActiveId: ref(''),
    shopCheck: ref(null),
    shopCheckId: ref(''),
    shopAudit: ref([]),
    shopDemoData: ref({}),
    SHOP_UNGROUPED: '__ungrouped__',
    loadShopConsole: vi.fn(async () => {}),
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

// 业务接口替身：本测试不验证业务数据，只要求 setup 与首屏渲染稳定。
vi.mock('./shop/useShopApi', async () => {
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
    ORDER_STATUS_META: {
      pending: { label: '待付款', tag: 'info' }, paid: { label: '待发货', tag: 'warning' },
      sourcing: { label: '采购中', tag: 'primary' }, shipped: { label: '已发货', tag: 'success' },
      completed: { label: '已完成', tag: 'success' }, refunded: { label: '已退款', tag: 'danger' },
    },
    SHIPMENT_STATUS_META: {
      pending: { label: '待发出', tag: 'info' }, shipped: { label: '已发出', tag: 'warning' },
      in_transit: { label: '运输中', tag: 'warning' }, delivered: { label: '已签收', tag: 'success' },
      exception: { label: '异常', tag: 'danger' },
    },
    LISTING_STATUS_META: {
      draft: { label: '草稿', tag: 'info' }, online: { label: '在售', tag: 'success' }, offline: { label: '已下架', tag: 'warning' },
    },
    money: (cents: number) => `¥${(Number(cents || 0) / 100).toFixed(2)}`,
    fmtTime: () => '2026-10-22 10:00',
  };
});

// 对话组件替身：它们依赖全局 chat store，本测试不验证聊天本身
vi.mock('../../components/chat/ChatMessageList.vue', () => ({ default: { name: 'ChatMessageList', render: () => null } }));
vi.mock('../../components/chat/ChatInputArea.vue', () => ({ default: { name: 'ChatInputArea', render: () => null } }));
vi.mock('../../components/chat/ChatDialogs.vue', () => ({ default: { name: 'ChatDialogs', render: () => null } }));
// 项目 = 店铺会话：测试里给一个空列表的替身，避免拉起 pinia/网络
vi.mock('../../stores/chat', () => ({
  useChatStore: () => ({
    conversations: [] as Array<{ id: string; title: string }>,
    currentConvId: '',
    loadConversations: async () => {},
    createConversation: async () => 'conv_test',
  }),
}));
vi.mock('../../composables/chat/useChat', () => ({
  useChat: () => ({ selectConv: async () => {} }),
}));

import ShopConsole from './ShopConsole.vue';

let app: App | null = null;

function mountConsole(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(ShopConsole as never) });
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  return host;
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

describe('ShopConsole · setup 守门', () => {
  it('能正常挂载（setup 不抛 TDZ / 引用错误）', async () => {
    const host = mountConsole();
    await nextTick();
    // 外壳 + 项目栏 + 资源列表 + 顶部工作条 + 页签骨架都要真实渲染出来
    expect(host.querySelector('.shop-console')).not.toBeNull();
    expect(host.querySelector('.shop-toolbar')).not.toBeNull();
    expect(host.querySelector('.shop-side-head')).not.toBeNull();
    expect(host.textContent).toContain('项目');
    expect(host.textContent).toContain('资源');
    expect(host.textContent).toContain('店铺');
    expect(host.textContent).toContain('仓储');
    expect(host.textContent).toContain('物流');
    expect(host.textContent).toContain('概览');
    expect(host.textContent).toContain('口径速查');
  });

  it('AI 对话栏与工作台同时存在（三栏布局）', async () => {
    const host = mountConsole();
    await nextTick();
    expect(host.querySelector('.shop-work')).not.toBeNull();
    expect(host.querySelector('.shop-chat')).not.toBeNull();
    expect(host.querySelector('.shop-chat-head')?.textContent).toContain('AI 助手');
  });
});

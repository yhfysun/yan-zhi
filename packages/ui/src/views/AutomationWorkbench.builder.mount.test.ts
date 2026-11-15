// @vitest-environment jsdom
// ★ 真挂载守门（2026-11-14）：点「让 AI 设计 / AI 帮我创建」后，Builder 对话必须留在
//   自动化工作台右侧，不能整页 push /chat（office 路由）；且新建会话必须被 selectConv
//   选中，否则内嵌列表不 loadHistory、后端也不会按 conv.agentId 取 Builder 提示词。
//   静态锚点只能证明「代码写了」，这里证明「点了真的生效」。
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

vi.mock('vue-router', () => {
  const push = vi.fn(async () => {});
  return {
    useRouter: () => ({ push }),
    useRoute: () => ({ path: '/automation', query: {}, params: {} }),
    __spies: { push },
  };
});

vi.mock('../stores/chat', () => {
  const conversations: Array<{ id: string }> = [];
  const state = { seq: 0 };
  const createConversation = vi.fn(async () => {
    const id = `c_builder_${++state.seq}`;
    conversations.push({ id });
    return id;
  });
  return {
    useChatStore: () => ({ conversations, createConversation }),
    __spies: { conversations, createConversation, state },
  };
});

vi.mock('../composables/chat/useChat', () => {
  const selectConv = vi.fn(async () => {});
  return { useChat: () => ({ selectConv }), __spies: { selectConv } };
});

vi.mock('../stores/automation', () => {
  const loadScripts = vi.fn(async () => {});
  return {
    useAutomationStore: () => ({
      publishedCount: 0, draftCount: 0, loading: false,
      scripts: [], current: null, activeRun: null,
      loadScripts,
      getScript: vi.fn(async () => ({})), loadRuns: vi.fn(async () => {}),
      createScript: vi.fn(async () => ({})), saveScript: vi.fn(async () => ({})),
      publishScript: vi.fn(async () => ({})), startRun: vi.fn(async () => ({})),
      refreshRun: vi.fn(async () => ({})), cancelRun: vi.fn(async () => {}),
      deleteScript: vi.fn(async () => {}), startRecording: vi.fn(async () => ({})),
      drainRecording: vi.fn(async () => ({})), stopRecording: vi.fn(async () => ({})),
      cancelRecording: vi.fn(async () => {}),
    }),
    scriptRecordToDraft: () => ({}),
    __spies: { loadScripts },
  };
});

vi.mock('../stores/scheduledTask', () => ({
  useScheduledTaskStore: () => ({ createTask: vi.fn(async () => ({})) }),
}));

vi.mock('../api/client', () => ({ isElectron: false }));

// 聊天子组件各自会 useChat() 并拉真实后端数据：这里换成最小 stub，
// 只验证「被挂进了右栏」+「欢迎态走的是我们注入的窄栏空态」。
vi.mock('../components/chat/ChatMessageList.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      name: 'ChatMessageList',
      render(this: any) {
        return h('div', { class: 'chat-msg-stub' }, this.$slots.welcome ? this.$slots.welcome() : []);
      },
    },
  };
});
vi.mock('../components/chat/ChatInputArea.vue', async () => {
  const { h } = await import('vue');
  return { default: { name: 'ChatInputArea', render: () => h('div', { class: 'chat-input-stub' }) } };
});
vi.mock('../components/chat/ChatDialogs.vue', async () => {
  const { h } = await import('vue');
  return { default: { name: 'ChatDialogs', render: () => h('div', { class: 'chat-dialogs-stub' }) } };
});
vi.mock('../components/BrowserPanel.vue', async () => {
  const { h } = await import('vue');
  return { default: { render: () => h('div', { class: 'browser-panel-stub' }) } };
});

let View: any;
let app: App | null = null;
let chatSpies: any;
let chatApiSpies: any;
let routerSpies: any;
let automationSpies: any;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeAll(async () => {
  View = (await import('./AutomationWorkbench.vue')).default;
  chatSpies = (await import('../stores/chat') as any).__spies;
  chatApiSpies = (await import('../composables/chat/useChat') as any).__spies;
  routerSpies = (await import('vue-router') as any).__spies;
  automationSpies = (await import('../stores/automation') as any).__spies;
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  chatSpies.conversations.length = 0;
  chatSpies.state.seq = 0;
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
});

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

async function mountView(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp({ render: () => h(View) });
  for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
  app.use(ElementPlus);
  app.use(createPinia());
  app.mount(host);
  await flush();
  return host;
}

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll('button')].find((b) => (b.textContent || '').includes(text));
  if (!btn) throw new Error(`找不到按钮：${text}`);
  return btn as HTMLButtonElement;
}

describe('自动化工作台 AI Builder 对话栏（真挂载）', () => {
  it('首屏不展开；点「让 AI 设计」后模式内展开、建会话并选中，不跳 /chat', async () => {
    const host = await mountView();
    expect(host.querySelector('.rpa-chat'), '首屏不该占一条右栏').toBeNull();

    buttonByText(host, '让 AI 设计').click();
    await flush();

    expect(chatSpies.createConversation).toHaveBeenCalledWith('新建自动化脚本', {
      agentId: 'a_builtin_rpa_builder',
    });
    expect(chatApiSpies.selectConv).toHaveBeenCalledWith('c_builder_1');
    expect(routerSpies.push, '不得整页跳办公模式聊天页').not.toHaveBeenCalled();
    expect(host.querySelector('.rpa-body.is-builder-open')).toBeTruthy();
    const panel = host.querySelector('.rpa-chat');
    expect(panel, '右侧 Builder 对话栏应渲染').toBeTruthy();
    expect(panel!.querySelector('.chat-msg-stub'), '消息列表应挂进右栏').toBeTruthy();
    expect(panel!.querySelector('.chat-input-stub'), '输入区应挂进右栏').toBeTruthy();
    expect(panel!.querySelector('.chat-dialogs-stub'), '输入区设置弹窗要有承载').toBeTruthy();
    expect(panel!.querySelector('.rpa-chat-welcome'), '办公场景卡应被窄栏空态替换').toBeTruthy();
  });

  it('收起后再点顶部「AI 帮我创建」复用同一条 Builder 会话，不堆空会话', async () => {
    const host = await mountView();
    buttonByText(host, '让 AI 设计').click();
    await flush();

    const loadsBeforeClose = automationSpies.loadScripts.mock.calls.length;
    (host.querySelector('.rpa-chat-close') as HTMLButtonElement).click();
    await flush();
    expect(host.querySelector('.rpa-chat')).toBeNull();
    expect(automationSpies.loadScripts.mock.calls.length, '收起时刷新脚本库，Builder 草稿立即可见')
      .toBe(loadsBeforeClose + 1);

    buttonByText(host, 'AI 帮我创建').click();
    await flush();
    expect(chatSpies.createConversation).toHaveBeenCalledTimes(1);
    expect(chatApiSpies.selectConv).toHaveBeenCalledTimes(2);
    expect(chatApiSpies.selectConv).toHaveBeenLastCalledWith('c_builder_1');
    expect(host.querySelector('.rpa-chat')).toBeTruthy();
  });

  it('已开的 Builder 会话不在列表时重新建一条，不留下失效 id', async () => {
    const host = await mountView();
    buttonByText(host, '让 AI 设计').click();
    await flush();
    chatSpies.conversations.length = 0; // 模拟会话被别处删掉

    (host.querySelector('.rpa-chat-close') as HTMLButtonElement).click();
    await flush();
    buttonByText(host, 'AI 帮我创建').click();
    await flush();

    expect(chatSpies.createConversation).toHaveBeenCalledTimes(2);
    expect(chatApiSpies.selectConv).toHaveBeenLastCalledWith('c_builder_2');
    expect(routerSpies.push).not.toHaveBeenCalled();
  });
});

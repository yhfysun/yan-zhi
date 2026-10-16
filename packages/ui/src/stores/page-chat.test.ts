// @vitest-environment jsdom
/**
 * 页面内对话 store 的**任务通道与历史**守门测试（P3-5，2026-10-16）。
 *
 * ★ 为什么必须有这一层（单纯断言"代码里写了 source"证明不了任何事）：
 *   ① **会话复用**：/browser 空间此前每发一句就新建一条会话 —— 后果是
 *      "历史列表被一句一条的会话灌满"、面板头部的「本页专属会话」名不副实、
 *      每次发送都从零上下文开始，而且**不报错**（用户只觉得"它记性不好"）。
 *      这条只能靠"连发两条，看新建了几次会话"来钉。
 *   ② **来源标记**：建会话时必须带 source/sourceMeta，否则历史入口按来源查永远是空的，
 *      而面板里聊得好好的（数据其实全在库里）—— 静默错。
 *   ③ **删除后的解绑**：删掉的会话若还挂在某个 tab 上，下一次发言会被服务端 404/409 拒掉。
 *
 * 只 mock 外部边界（HTTP、SSE、页面上下文采集、设置/平台），store 与纯逻辑走真实现。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  API_BASE: 'http://localhost:3001/api',
  buildRequestHeaders: () => ({}),
}));
vi.mock('../utils/sse', () => ({ consumeSseStream: vi.fn(async () => {}) }));
// 页面上下文采集要走渲染层 / Electron，这里只关心"发出去什么"，故整体替身
vi.mock('../utils/pageContext', () => ({
  buildPageTaskPrompt: (x: { question: string }) => x.question,
  collectPageContext: async () => ({ url: '', title: '', host: '', selection: '', visibleText: '', readFailed: false }),
  hostOf: (u: string) => { try { return new URL(u).host; } catch { return ''; } },
  isRealPageUrl: (u: string) => /^https?:\/\//i.test(String(u || '')),
}));
vi.mock('./settings', () => ({ useSettingsStore: () => ({ settings: { defaultPlatformId: 'p1', defaultModelId: 'm1' } }) }));
vi.mock('./platform', () => ({ usePlatformStore: () => ({ platforms: [{ id: 'p1' }], models: [{ id: 'm1' }] }) }));

import { api } from '../api/client';
import { usePageChatStore, PAGE_CHAT_AGENT_ID } from './page-chat';

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;
const del = api.delete as unknown as ReturnType<typeof vi.fn>;

const TAB = { url: 'https://example.com/a', title: '示例页' };
const callsTo = (u: string) => post.mock.calls.filter((c: any[]) => c[0] === u);
const getsTo = (u: string) => get.mock.calls.filter((c: any[]) => String(c[0]).startsWith(u));

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  post.mockImplementation(async (url: string) => {
    if (url === '/conversations') return { data: { id: 'c_new' } };
    if (url === '/llm/tasks') return { data: { taskId: 't1' } };
    return { data: {} };
  });
  get.mockImplementation(async (url: string) => {
    if (String(url).includes('/messages')) {
      return { data: [{ id: 'm1', role: 'user', content: '旧问题', created_at: '2026-10-16T10:00:00.000Z' }] };
    }
    if (String(url).startsWith('/conversations?')) {
      return {
        data: [{
          id: 'c_1', title: '提取本页表格', source: 'browser-page',
          source_meta_json: JSON.stringify({ url: 'https://example.com/a', host: 'example.com', scope: 'page' }),
          created_at: 1_700_000_000_000, updated_at: 1_700_000_600_000,
        }],
      };
    }
    return { data: [] };
  });
  del.mockResolvedValue({ data: {} });
  // 任务流是直连 fetch 的（带 Bearer），这里只需要"连得上"；SSE 解析已被替身
  (globalThis as any).fetch = vi.fn(async () => ({ ok: true, body: {} }));
});

describe('★ /browser 空间的页面对话：会话只建一次，之后一直复用它', () => {
  it('连发两条只建一条会话，第二条仍用同一个 conversationId', async () => {
    const store = usePageChatStore();
    const r1 = await store.send({ tabId: 'tab-1', tab: TAB, question: '第一条' });
    expect(r1.ok).toBe(true);
    expect(callsTo('/conversations').length).toBe(1);

    const r2 = await store.send({ tabId: 'tab-1', tab: TAB, question: '第二条' });
    expect(r2.ok).toBe(true);
    expect(callsTo('/conversations').length, '★ 第二条又新建了会话（历史会被一句一条的会话灌满）').toBe(1);

    const taskConvs = callsTo('/llm/tasks').map((c: any[]) => c[1].conversationId);
    expect(taskConvs).toEqual(['c_new', 'c_new']);
    expect(store.stateOf('tab-1').conversationId).toBe('c_new');
    expect(store.stateOf('tab-1').ownConversation).toBe(true);
  });

  it('每个 tab 各建各的（按 tab 隔离，不互相认领会话）', async () => {
    const store = usePageChatStore();
    await store.send({ tabId: 'tab-1', tab: TAB, question: 'a' });
    post.mockImplementation(async (url: string) => {
      if (url === '/conversations') return { data: { id: 'c_new2' } };
      if (url === '/llm/tasks') return { data: { taskId: 't2' } };
      return { data: {} };
    });
    await store.send({ tabId: 'tab-2', tab: TAB, question: 'b' });
    expect(store.stateOf('tab-1').conversationId).toBe('c_new');
    expect(store.stateOf('tab-2').conversationId).toBe('c_new2');
  });

  it('★ 建会话必须带来源标记与来源附加信息（否则历史入口按来源查永远是空的）', async () => {
    const store = usePageChatStore();
    await store.send({ tabId: 'tab-1', tab: TAB, question: '问一句' });
    const body = callsTo('/conversations')[0][1];
    expect(body.source).toBe('browser-page');
    expect(body.sourceMeta).toEqual({ url: 'https://example.com/a', host: 'example.com', scope: 'page' });
    expect(body.agentId).toBe(PAGE_CHAT_AGENT_ID);
    expect(String(body.title)).toContain('example.com');   // 标题仍带站点，便于在会话列表里认出来
  });

  it('preview 空间（显式传了 convId）不新建会话，直接用那个会话', async () => {
    const store = usePageChatStore();
    await store.send({ tabId: 'tab-1', tab: TAB, question: '共用主会话', convId: 'c_main', agentId: 'a_x' });
    expect(callsTo('/conversations').length).toBe(0);
    expect(callsTo('/llm/tasks')[0][1].conversationId).toBe('c_main');
    expect(store.stateOf('tab-1').ownConversation).toBe(false);
  });
});

describe('★ 历史：列表 / 打开 / 删除', () => {
  it('listSessions 按来源查（与当前模式无关），并把行映射成展示行', async () => {
    const store = usePageChatStore();
    const r = await store.listSessions();
    const url = String(getsTo('/conversations?')[0][0]);
    expect(url).toContain('source=browser-page');
    expect(url).toContain('scope=active');
    expect(r.warning).toBe('');
    expect(r.rows).toEqual([{
      id: 'c_1', title: '提取本页表格', url: 'https://example.com/a', host: 'example.com',
      scope: 'page', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_600_000,
    }]);
  });

  it('★ 读失败返回空列表 + warning（"历史是空的"和"读不到历史"必须能分清）', async () => {
    const store = usePageChatStore();
    get.mockResolvedValueOnce({ error: '网络不可达' });
    const r = await store.listSessions();
    expect(r.rows).toEqual([]);
    expect(r.warning).toContain('历史读取失败');
  });

  it('openSession：清掉本 tab 原消息 → 绑定该会话 → 读回服务端消息', async () => {
    const store = usePageChatStore();
    store.note('tab-1', '本 tab 原来的提示');
    expect(store.stateOf('tab-1').messages.length).toBe(1);

    const r = await store.openSession('tab-1', {
      id: 'c_old', title: '旧会话', url: 'https://example.com/a', host: 'example.com',
      scope: 'page', createdAt: 1, updatedAt: 2,
    });
    expect(r.ok).toBe(true);
    const st = store.stateOf('tab-1');
    expect(st.conversationId).toBe('c_old');
    expect(st.ownConversation).toBe(true);
    expect(st.messages.map((m) => m.content)).toEqual(['旧问题']);   // 原消息已被服务端真相替换
  });

  it('openSession：正在执行时拒绝切换（否则两条会话的消息会混在一个面板里）', async () => {
    const store = usePageChatStore();
    store.stateOf('tab-1').streaming = true;
    const r = await store.openSession('tab-1', {
      id: 'c_old', title: '旧会话', url: '', host: '', scope: '', createdAt: 1, updatedAt: 2,
    });
    expect(r.ok).toBe(false);
    expect(store.stateOf('tab-1').conversationId).toBe('');
  });

  it('★ deleteSession 是软删，且把正在用它的 tab 解绑（否则下一次发言会打到已删会话）', async () => {
    const store = usePageChatStore();
    await store.send({ tabId: 'tab-1', tab: TAB, question: 'a' });
    expect(store.stateOf('tab-1').conversationId).toBe('c_new');

    const r = await store.deleteSession('c_new');
    expect(r.ok).toBe(true);
    expect(del).toHaveBeenCalledWith('/conversations/c_new');
    expect(store.stateOf('tab-1').conversationId).toBe('');
    expect(store.stateOf('tab-1').ownConversation).toBe(false);

    // 解绑后再发一条：应当新开一条会话，而不是继续往被删的那条里发
    post.mockImplementation(async (url: string) => {
      if (url === '/conversations') return { data: { id: 'c_after' } };
      if (url === '/llm/tasks') return { data: { taskId: 't9' } };
      return { data: {} };
    });
    await store.send({ tabId: 'tab-1', tab: TAB, question: '删完再问' });
    expect(callsTo('/llm/tasks').pop()![1].conversationId).toBe('c_after');
  });
});

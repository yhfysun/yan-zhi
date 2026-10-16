// 页面内对话（P0）的任务通道：按 tab 的状态表 + 会话解析 + `/llm/tasks` 发送 + SSE 归约。
//
// 会话怎么选（P0 关键决策，依据方案 §4.6 与 `apps/desktop/browser-target.cjs`）：
//   · preview 空间（对话右栏）：**复用当前会话**。那页归本会话所有（或其可见页），
//     换成任何别的会话都会被"跨会话认页"闸门挡住 —— 这是既有安全模型的必然结果。
//   · page 空间（/browser 独立页）：新建**本 tab 的专用会话**（内置「浏览器操作助手」a_builtin_page_agent）。
//     page 空间的 tab 永不被任何会话认领（main.cjs:370 只为 preview 空间登记归属），
//     所以模型不能传 tabId，只能靠"未锚定 + 建页类动作回落当前可见页"绑定 —— 提示词里已写明
//     （见 utils/pageContext.ts 的 buildPageTaskPrompt）。
//
// 消息可见性：面板内自己渲染（"对话不会保存"的体验），但**任务确实落在会话里**——
//   自建会话收尾后用服务端消息列表覆盖本地（对齐真相）；共用主会话时**不覆盖**，
//   否则会把整个任务的消息倒进这个小面板。

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, API_BASE } from '../api/client';
import { consumeSseStream } from '../utils/sse';
import { useSettingsStore } from './settings';
import { usePlatformStore } from './platform';
import { buildPageTaskPrompt, collectPageContext, hostOf, isRealPageUrl, type ContextTabLike } from '../utils/pageContext';
import {
  addErrorNote, addMessage, addUserEcho, applyTaskEvent, createChatState, replaceMessagesFromServer,
  resetChatState, type PageChatState,
} from './page-chat-state';

/** page 空间自建会话用的智能体：内置「浏览器操作助手」（apps/server/src/db.ts:2209） */
export const PAGE_CHAT_AGENT_ID = 'a_builtin_page_agent';

export interface PageChatSendInput {
  tabId: string;
  /** 当前 tab（只取 url/title） */
  tab: ContextTabLike;
  question: string;
  /**
   * 已存在的会话 id（preview 空间传当前会话；page 空间留空 ⇒ 自建专用会话）。
   * 传了 = 共用会话（不覆盖本地消息）；留空 = 自建（收尾按服务端对齐）。
   */
  convId?: string;
  /** 会话的智能体：preview 空间传当前会话的 agentId；留空时自建会话用 PAGE_CHAT_AGENT_ID */
  agentId?: string;
}

export type PageChatSendResult = { ok: true } | { ok: false; msg: string };

export const usePageChatStore = defineStore('page-chat', () => {
  /** 按 tab 隔离的状态表（响应式；纯逻辑在 page-chat-state.ts） */
  const states = ref<Record<string, PageChatState>>({});
  /** 每个 tab 在跑任务的 AbortController（关 tab / 卸载 / 用户点停止都能收口） */
  const aborts = new Map<string, AbortController>();

  function stateOf(tabId: string): PageChatState {
    if (!tabId) throw new Error('pageChat: tabId 必填');
    if (!states.value[tabId]) states.value[tabId] = createChatState(tabId);
    return states.value[tabId];
  }

  /** 该 tab 是否已有对话内容（UI 决定要不要渲染面板主体） */
  function hasChat(tabId: string): boolean {
    const s = states.value[tabId];
    return !!s && (s.messages.length > 0 || s.streaming);
  }

  /** 某个 tab 是否正在跑（UI 禁用发送 / 显示停止） */
  function isStreaming(tabId: string): boolean {
    return !!states.value[tabId]?.streaming;
  }

  /** 关 tab：中止在跑的任务并**丢弃该 tab 的整个对话状态**（"关闭标签页后即清除"） */
  function dropTab(tabId: string): void {
    aborts.get(tabId)?.abort();
    aborts.delete(tabId);
    delete states.value[tabId];
  }

  /** 面板卸载：全部中止 + 清空（避免"关掉页面还在烧 token"） */
  function dropAll(): void {
    for (const id of Object.keys(states.value)) dropTab(id);
  }

  /**
   * 往面板里塞一条**本地**消息（不参与流式、不进会话）：
   * 脚本型指令的执行结果、一次性提示等都走这里 —— 它们不是模型的回复。
   */
  function note(tabId: string, content: string, isError = false): void {
    const s = stateOf(tabId);
    if (isError) { addErrorNote(s, content); return; }
    addMessage(s, {
      id: `local-note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant', content, createdAt: Date.now(),
    });
  }

  /** 用户手动清空当前页对话（会话绑定保留，下一次继续用它） */
  function clearTab(tabId: string): void {
    const s = states.value[tabId];
    if (!s) return;
    if (s.streaming) { aborts.get(tabId)?.abort(); aborts.delete(tabId); }
    resetChatState(s);
  }

  /** 停止当前页在执行的任务（服务端也终止，避免后台继续烧 token） */
  async function stop(tabId: string): Promise<void> {
    const s = states.value[tabId];
    aborts.get(tabId)?.abort();
    aborts.delete(tabId);
    if (s) { s.streaming = false; for (const m of s.messages) m.streaming = false; }
    const taskId = s?.taskId;
    if (!taskId) return;
    try {
      const token = localStorage.getItem('auth_token') || '';
      await fetch(`${API_BASE}/llm/tasks/${taskId}/abort`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch { /* 网络失败不阻断 UI：本地已停 */ }
    if (s) s.taskId = '';
  }

  /** 面板卸载/切走：中止这些 tab 上在跑的任务（**保留消息**，避免"关掉页面还在烧 token"） */
  function stopTabs(tabIds: string[]): void {
    for (const id of tabIds) void stop(id);
  }

  /** 取默认平台/模型（与运维控制台同口径：设置里的默认项） */
  function resolveModel(): { platformId: string; modelId: string } | null {
    const settings = useSettingsStore().settings;
    const platformStore = usePlatformStore();
    const platform = platformStore.platforms.find((p) => p.id === settings.defaultPlatformId);
    const model = platformStore.models.find((m) => m.id === settings.defaultModelId);
    if (!platform || !model) return null;
    return { platformId: platform.id, modelId: model.id };
  }

  /** 懒创建一个承载本对话的会话（page 空间专用；标题带上站点，便于在会话列表里认出来） */
  async function createOwnConversation(title: string, agentId: string): Promise<string> {
    const r = await api.post<any>('/conversations', { title, agentId });
    if ('error' in r) throw new Error(r.error);
    const id = (r.data as any)?.id;
    if (!id) throw new Error('创建会话失败：返回体缺少 id');
    return String(id);
  }

  /** 自建会话收尾：用服务端消息列表覆盖本地（工具步骤/子智能体消息一并呈现） */
  async function refreshFromServer(state: PageChatState): Promise<void> {
    try {
      const r = await api.get<any[]>(`/conversations/${state.conversationId}/messages`);
      if ('data' in r && Array.isArray(r.data)) replaceMessagesFromServer(state, r.data);
    } catch { /* 拉取失败就保留本地视图，不影响可用性 */ }
  }

  /** 订阅任务 SSE，逐条归约到该 tab 的状态里 */
  async function subscribeTask(state: PageChatState, taskId: string, ac: AbortController): Promise<void> {
    const token = localStorage.getItem('auth_token') || '';
    const resp = await fetch(`${API_BASE}/llm/tasks/${taskId}/stream?since=0`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    });
    if (!resp.ok || !resp.body) throw new Error('SSE 连接失败');
    await consumeSseStream(resp.body, (payload) => {
      let event: any;
      try { event = JSON.parse(payload); } catch { return; }
      // 终态（completed/error/aborted）→ 返回 false 让 sse 层停止读流；其余返回 undefined 继续
      return applyTaskEvent(state, event) ? undefined : false;
    });
    for (const m of state.messages) m.streaming = false;
    state.streaming = false;
  }

  /**
   * 发一条页面内对话：装配页面上下文 → 起任务 → 流式回填。
   * 失败一律落成面板里的提示气泡（不静默）。
   */
  async function send(input: PageChatSendInput): Promise<PageChatSendResult> {
    const { tabId, tab, question } = input;
    const text = String(question || '').trim();
    if (!text) return { ok: false, msg: '请输入要问的内容' };
    if (!isRealPageUrl(String(tab?.url || ''))) return { ok: false, msg: '先打开一个网页，再对话' };

    const state = stateOf(tabId);
    if (state.streaming) return { ok: false, msg: '这一页正在执行上一条，等它结束或点停止' };

    const model = resolveModel();
    if (!model) {
      const msg = '请先在「设置」配置默认平台与模型（页面内对话需要）';
      addErrorNote(state, msg);
      return { ok: false, msg };
    }

    // 会话解析：传了 convId = 共用（preview）；没传 = 本 tab 自建（page）
    let convId = String(input.convId || '');
    let own = false;
    let agentId = String(input.agentId || '');
    try {
      if (!convId) {
        agentId = agentId || PAGE_CHAT_AGENT_ID;
        convId = await createOwnConversation(`浏览器 · ${hostOf(String(tab?.url)) || '页面'}`, agentId);
        own = true;
      }
    } catch (e: any) {
      const msg = `创建会话失败：${e?.message || e}`;
      addErrorNote(state, msg);
      return { ok: false, msg };
    }
    state.conversationId = convId;
    state.ownConversation = own;

    addUserEcho(state, text);
    state.streaming = true;
    state.lastError = '';
    const ac = new AbortController();
    aborts.set(tabId, ac);

    try {
      // 上下文在**发送前**现采一次（L0~L2；读取失败会如实标注，不假装页面是空的）
      const ctx = await collectPageContext(tabId, tab);
      const userContent = buildPageTaskPrompt({ question: text, ctx });
      const appSettings = useSettingsStore().settings;
      const res = await api.post<any>('/llm/tasks', {
        conversationId: convId,
        platformId: model.platformId,
        modelId: model.modelId,
        userContent,
        agentId: agentId || null,
        workspaceDir: appSettings.workspaceDir || undefined,
      });
      if ('error' in res) throw new Error(res.error);
      const taskId = (res.data as any)?.taskId;
      if (!taskId) throw new Error('任务创建失败：返回体缺少 taskId');
      state.taskId = String(taskId);
      await subscribeTask(state, state.taskId, ac);
      return { ok: true };
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        addErrorNote(state, '已停止本次执行。');
      } else {
        addErrorNote(state, `⚠️ ${e?.message || e}`);
      }
      return { ok: false, msg: e?.message || String(e) };
    } finally {
      state.streaming = false;
      for (const m of state.messages) m.streaming = false;
      aborts.delete(tabId);
      // 自建会话：收尾对齐服务端真相（共用主会话时**不拉**，否则整个任务会倒进面板）
      if (own) await refreshFromServer(state);
    }
  }

  return { states, stateOf, hasChat, isStreaming, dropTab, dropAll, clearTab, stop, stopTabs, note, send };
});

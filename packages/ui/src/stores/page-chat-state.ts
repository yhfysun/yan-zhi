// 页面内对话的**纯状态机**（P0）：按 tab 隔离的消息表 + 任务事件归约 + 重置语义。
//
// ★ 为什么单独抽成纯模块（本仓一贯判据："断言存在 ≠ 断言生效"）：
//   "按 tab 隔离 / 关 tab 即清 / 切 tab 不串 / chunk 只并到最后一条流式助手消息" 这些是**行为**，
//   写成 Vue 组件里的内联逻辑就只能靠静态断言。抽出来 → 单测真跑（见 page-chat-state.test.ts）。

/** 页面内对话的一条消息（UI 直接渲染；内容为 markdown） */
export interface PageChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  /** 流式中（assistant 专用）：末尾跑马灯 */
  streaming?: boolean;
  /** 本地提示气泡（如"该会话正在执行任务"、"已停止"），UI 单独配色 */
  error?: boolean;
}

/** 一个 tab 的页面内对话状态 */
export interface PageChatState {
  tabId: string;
  messages: PageChatMessage[];
  streaming: boolean;
  /** 承载本对话的会话 id（preview 空间=当前会话；page 空间=本 tab 的专用会话） */
  conversationId: string;
  /**
   * 这个会话是不是**本对话自己创建的**（page 空间专用会话=true）。
   * 只有自己创建的会话才允许"结束后用服务端消息列表覆盖本地"——
   * preview 空间共用主会话，拉全量会把整个任务倒进面板（见 store 的注释）。
   */
  ownConversation: boolean;
  taskId: string;
  /** 最近一次失败原因（UI 展示用；成功发送后清空） */
  lastError: string;
  /**
   * 发这条消息时**目标页**的地址与面板标签数（P0.1 漂移检测）。
   * 执行期间地址变了 / 多出标签页 ⇒ 结果可能来自另一个页面 —— 面板会明说一句，
   * 而不是让用户看着一个"答非所问但看起来正常"的结果。
   */
  targetUrl: string;
  targetTabCount: number;
  /**
   * 脚本失败后的**自愈请求**（P3-4）：非空时面板头部显示「🛠 修复脚本」。
   * 存整段 prompt（而不是散字段）—— 它就是要发出去的那段话，省得两处拼装漂移。
   */
  repairHint: string;
}

let seq = 0;
function localId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

export function createChatState(tabId: string): PageChatState {
  return {
    tabId,
    messages: [],
    streaming: false,
    conversationId: '',
    ownConversation: false,
    taskId: '',
    lastError: '',
    targetUrl: '',
    targetTabCount: 0,
    repairHint: '',
  };
}

/** 追加消息（按 id 幂等：SSE 重放 / 重复广播都不会出现两条） */
export function addMessage(state: PageChatState, msg: PageChatMessage): boolean {
  if (state.messages.some((m) => m.id === msg.id)) return false;
  state.messages.push(msg);
  return true;
}

/** 本地回显用户消息（服务端消息稍后到达；自建会话结束后按需用服务端真相覆盖，见 store） */
export function addUserEcho(state: PageChatState, text: string): PageChatMessage {
  const msg: PageChatMessage = { id: localId('local-user'), role: 'user', content: text, createdAt: Date.now() };
  addMessage(state, msg);
  return msg;
}

/** 本地提示气泡（不参与流式） */
export function addErrorNote(state: PageChatState, text: string): PageChatMessage {
  const msg: PageChatMessage = { id: localId('local-note'), role: 'assistant', content: text, createdAt: Date.now(), error: true };
  addMessage(state, msg);
  state.lastError = text;
  return msg;
}

/**
 * 任务事件归约：把一条 SSE 事件作用到状态上。
 * @returns false = 任务已终态（调用方应停止读流），true = 继续
 */
export function applyTaskEvent(state: PageChatState, event: any): boolean {
  const type = String(event?.type || '');
  if (type === 'message:added') {
    const msg = event.message || {};
    addMessage(state, {
      id: String(msg.id || localId('srv')),
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: String(msg.content || ''),
      createdAt: Date.now(),
      streaming: msg.role === 'assistant',
    });
    return true;
  }
  if (type === 'chunk') {
    // 只并到最后一条**流式中的助手消息**（子智能体消息按名称单独成泡，不做细分）
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.role === 'assistant' && m.streaming && !m.error) {
        if (event.content) m.content += String(event.content);
        break;
      }
    }
    return true;
  }
  if (type === 'task:completed' || type === 'task:error' || type === 'task:aborted') {
    for (const m of state.messages) m.streaming = false;
    state.streaming = false;
    state.taskId = '';
    if (type === 'task:error' && event.error) addErrorNote(state, `⚠️ ${event.error}`);
    if (type === 'task:aborted') addErrorNote(state, '已停止本次执行。');
    return false;
  }
  return true;
}

/** 服务端消息列表 → 状态（自建会话收尾时用它对齐真相） */
export function replaceMessagesFromServer(state: PageChatState, rows: any[]): void {
  state.messages = (rows || []).map((m) => ({
    id: String(m.id ?? localId('srv')),
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content || ''),
    createdAt: m.created_at ? Date.parse(m.created_at) || Date.now() : Date.now(),
  }));
}

/** 清空一个 tab 的对话内容（关 tab / 用户手动清空）：消息与运行态清掉，会话绑定由调用方决定 */
export function resetChatState(state: PageChatState): void {
  state.messages = [];
  state.streaming = false;
  state.taskId = '';
  state.lastError = '';
  state.repairHint = '';   // 手动清空后不再挂着"修复脚本"入口（它对应的是已被清掉的那次失败）
}

/** 读一条状态里的流式助手消息（UI 判断"正在打字的最后一条"，也用于滚动锚点） */
export function streamingMessage(state: PageChatState): PageChatMessage | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.role === 'assistant' && m.streaming) return m;
  }
  return null;
}

/**
 * 多 tab 状态表（纯内存：按 tabId 建/取/删）。
 * UI 层用 reactive 包一层即可获得响应式；"隔离与清理"只有这一份实现（避免两处漂移）。
 */
export function createPageChatRegistry() {
  const states = new Map<string, PageChatState>();
  return {
    get(tabId: string): PageChatState {
      let s = states.get(tabId);
      if (!s) { s = createChatState(tabId); states.set(tabId, s); }
      return s;
    },
    has: (tabId: string) => states.has(tabId),
    remove(tabId: string) { states.delete(tabId); },
    resetAll() { states.clear(); },
    tabIds: () => [...states.keys()],
    size: () => states.size,
  };
}

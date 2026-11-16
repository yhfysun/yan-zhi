// 页面内对话的**纯状态机**（P0）：按 tab 隔离的消息表 + 任务事件归约 + 重置语义。
//
// ★ 为什么单独抽成纯模块（本仓一贯判据："断言存在 ≠ 断言生效"）：
//   "按 tab 隔离 / 关 tab 即清 / 切 tab 不串 / chunk 只并到最后一条流式助手消息" 这些是**行为**，
//   写成 Vue 组件里的内联逻辑就只能靠静态断言。抽出来 → 单测真跑（见 page-chat-state.test.ts）。

// ★ 显示口径收口（2026-11-15 用户实报「提示词都放出来了？」）：服务端落库的用户消息是
//   buildPageTaskPrompt 的完整拼装，两条服务端进路（message:added / replaceMessagesFromServer）
//   都必须先经 displayQuestionOf 折回用户原话，否则面板被提示词刷屏。
//   提取器与 builder 同在 utils/pageContext.ts（分节标记同源，不会漂）。
import { displayQuestionOf } from '../utils/pageContext';
// 工具 → 一句人话（与主对话的浏览器步骤条同一实现，工具调用展示参考聊天模式）
import { describeBrowserAction } from '../composables/chat/browser-step-label';

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
  /**
   * 本次任务**钉住**的标签页（P3-6，2026-10-16）：非空表示执行面已锁定在开始那一页上
   * （换页类动作会被主进程拒绝）。空 = 没钉上（web 端 / 老 preload / 钉失败）。
   *
   * ★ 为什么面板要知道这件事：漂移提示的措辞必须**如实** —— 钉上了才能说
   *   "结果仍来自那一页"；没钉上却这么说，就是本仓最忌讳的那种"看起来正常的错"。
   * ★ 生命周期归 `send()` 的 finally 管（任务结束即解锁），**不**随 `resetChatState` 清 ——
   *   清消息不等于任务结束（手动清空时任务可能还在跑）。
   */
  pinnedTabId: string;
  /**
   * 工具活动条（2026-11-15 用户「工具调用参考聊天模式」）：与主对话的浏览器步骤条
   * 同语义 —— 名称 + 一句人话 + 状态，**只在条里显示，不灌进消息流**。
   * 有上限（尾 6 条）；任务收尾由调用方决定保留（刷新后自然清空）。
   */
  tools: Array<{ name: string; label: string; status: 'running' | 'done' | 'timeout'; time: number }>;
}

let seq = 0;
function localId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

/**
 * 活动噪音过滤（2026-11-15 用户实报「这个需要优化」）：任务计划类工具会把
 * 「已创建任务计划…」「已更新第 N 步状态为 done」这类**工具回执**当成消息落库，
 * 页面对话面板照单全收就把对话刷成了流水账。这类行在面板里没有任何信息量
 * （任务进展在聊天页有完整呈现），两条服务端进路一律丢弃。
 * ★ 白名单式判据：只滤已知的活动句式，不猜 —— 模型真正的回复哪怕再乱也不动它。
 */
export function isActivityNoise(content: string): boolean {
  const c = String(content || '').trim();
  if (!c) return false;
  return /^已创建任务计划/.test(c)
    || /^已更新任务计划/.test(c)
    || /^已更新第\s*\d+\s*步状态为/.test(c);
}

/** 工具活动条上限（尾 N 条）：对话面板宽度有限，流水账只留最近几步 */
const TOOL_STRIP_MAX = 6;

function pushTool(state: PageChatState, entry: { name: string; label: string; status: 'running' | 'done' | 'timeout'; time: number }): void {
  state.tools.push(entry);
  if (state.tools.length > TOOL_STRIP_MAX) state.tools.splice(0, state.tools.length - TOOL_STRIP_MAX);
}

/** tool:start / tool:result / tool:timeout → 活动条（参考主对话 pushBrowserStep 的口径） */
function applyToolEvent(state: PageChatState, event: any): void {
  const name = String(event?.toolName || '');
  if (!name) return;
  const type = String(event.type || '');
  if (type === 'tool:start') {
    pushTool(state, { name, label: describeBrowserAction(name, event.args as Record<string, unknown> | null), status: 'running', time: Date.now() });
    return;
  }
  // 回执/超时：改**最后一条同名的 running**（重放时找不到 running 就丢弃，不造重复行）
  const cur = [...state.tools].reverse().find((t) => t.name === name && t.status === 'running');
  if (!cur) return;
  if (type === 'tool:timeout') {
    cur.status = 'timeout';
    return;
  }
  cur.status = 'done';
  const digest = String(event.result || '').replace(/\s+/g, ' ').trim();
  if (digest) cur.label = `${cur.label} · ${digest.slice(0, 40)}`;
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
    pinnedTabId: '',
    tools: [],
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
  if (type === 'tool:start' || type === 'tool:result' || type === 'tool:timeout') {
    // 工具调用走活动条（参考聊天模式），不进消息流
    applyToolEvent(state, event);
    return true;
  }
  if (type === 'message:added') {
    const msg = event.message || {};
    const isUser = msg.role === 'user';
    // 用户消息：折回原话 + **内容去重** —— 本地回显（addUserEcho）先到、服务端落库后到，
    // 两者内容一致时不重复渲染（此前服务端版是整段 prompt，看不出重复；折叠后不挡就会出双份）。
    const content = isUser ? displayQuestionOf(String(msg.content || '')) : String(msg.content || '');
    if (isUser && state.messages.some((m) => m.role === 'user' && m.content === content)) return true;
    if (!isUser && isActivityNoise(content)) return true;   // 任务计划回执：面板不渲染
    // ★ 光标风暴修复（2026-11-15 用户实报「怎么这么多光标输入动画在动」）：每条 assistant
    //   消息都带着 streaming:true 进来，而此前没人把**上一条**的流式标记关掉 —— 工具回执
    //   一条条落，光标就一条条常亮。语义只有一种：**只有最后一条 assistant 在流式**。
    if (!isUser) for (const m of state.messages) { if (m.streaming) m.streaming = false; }
    addMessage(state, {
      id: String(msg.id || localId('srv')),
      role: isUser ? 'user' : 'assistant',
      content,
      createdAt: Date.now(),
      streaming: !isUser,
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
  const out: PageChatMessage[] = [];
  for (const m of rows || []) {
    const isUser = m.role === 'user';
    // 用户消息同样折回原话；相邻重复（本地回显 + 服务端落库）只留一条
    const content = isUser ? displayQuestionOf(String(m.content || '')) : String(m.content || '');
    if (isUser && out.length && out[out.length - 1].role === 'user' && out[out.length - 1].content === content) continue;
    if (!isUser && isActivityNoise(content)) continue;      // 任务计划回执：面板不渲染
    out.push({
      id: String(m.id ?? localId('srv')),
      role: isUser ? 'user' : 'assistant',
      content,
      createdAt: m.created_at ? Date.parse(m.created_at) || Date.now() : Date.now(),
    });
  }
  state.messages = out;
}

/** 清空一个 tab 的对话内容（关 tab / 用户手动清空）：消息与运行态清掉，会话绑定由调用方决定 */
export function resetChatState(state: PageChatState): void {
  state.messages = [];
  state.streaming = false;
  state.taskId = '';
  state.lastError = '';
  state.tools = [];
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

// 聊天 store
import { defineStore } from 'pinia';
import { ref, computed, nextTick } from 'vue';
import type { Conversation, Message, Platform, Model, DeltaToolCall, InlineDataView } from '@yan-zhi/shared';
import { getPlatformAdapter, LlmClient, ContextWindow, getToolRegistry } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { useMcpStore } from './mcp';
import { useAgentStore } from './agent';
import { useToolsStore } from './tools';
import { useSettingsStore } from './settings';
import { useFileStore } from './file';
import { useBrowserStore } from './browser';
import { api, API_BASE } from '../api/client';
import { useAuthStore } from './auth';

// 从工具调用参数中健壮地提取 URL —— 模型常把 URL 放在非 url 字段（target/address/link/href/page 等），
// 或直接把 arguments 写成 JSON 字符串。只认 args.url 会导致「缺少 url 参数」误报。
function extractUrlFromArgs(args: unknown): string {
  if (typeof args === 'string') return args.trim();
  if (args && typeof args === 'object') {
    const o = args as Record<string, unknown>;
    for (const k of ['url', 'target', 'address', 'link', 'href', 'page', 'site', 'to', 'uri', 'location', 'query', 'q']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    const strVals = Object.values(o).filter((v) => typeof v === 'string' && (v as string).trim());
    if (strVals.length === 1) return String(strVals[0]).trim();
  }
  return '';
}

// ── 预览空间 tab 解析（agent 浏览器操作统一入口）──
// agent 的浏览器操作必须打在预览面板**当前正在显示**的 tab 上：若让主进程按 LRU 猜
// （ensureActiveTab），可能猜中面板旧 tab 或别的空间 tab —— 导航进了那个 tab，页面加载了
// 但预览 UI 不跟随（onNavigated 里 tid !== activeTabId 被忽略，永远显示首页），后续
// get_page_content 读的也不是用户看到的页面。
async function resolvePreviewTabId(): Promise<string> {
  const electron = (window as any).electronAPI;
  const bs = useBrowserStore('preview');
  const current = () =>
    bs.activeTabId && bs.tabs.some((t) => t.id === bs.activeTabId) ? bs.activeTabId : '';
  const tid = current();
  if (tid) return tid;
  // 预览面板刚被 openTab 挂载：等它 onMounted 自建首个 tab（最多 ~4s）
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const t = current();
    if (t) return t;
  }
  // 兜底：主进程自建并广播（preview 面板的 onTabCreated 会补壳并激活）
  return await electron.browserView.ensureActiveTab('preview');
}

function rowToConv(r: any): Conversation {
  let mcpServerIds: string[] = [];
  let convMcpDisabled: Record<string, string[]> = {};
  let convMcpAliases: Record<string, Record<string, string>> = {};
  if (r.mcp_servers_json) {
    try {
      const parsed = JSON.parse(r.mcp_servers_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'string') {
          mcpServerIds = parsed;
        } else {
          mcpServerIds = parsed.map((x: any) => x.serverId || x.id || '').filter(Boolean);
          for (const x of parsed) {
            if (x.disabledTools?.length) convMcpDisabled[x.serverId || x.id] = x.disabledTools;
            if (x.aliases && typeof x.aliases === 'object') convMcpAliases[x.serverId || x.id] = x.aliases;
          }
        }
      }
    } catch {}
  }
  return {
    id: r.id,
    title: r.title,
    agentId: r.agent_id,
    platformId: r.platform_id,
    modelId: r.model_id,
    spaceId: r.space_id,
    scheduledTaskId: r.scheduled_task_id ?? r.scheduledTaskId,
    mcpServerIds,
    _mcpDisabledTools: convMcpDisabled,
    _mcpToolAliases: convMcpAliases,
    skillIds: r.skill_ids_json ? JSON.parse(r.skill_ids_json) : [],
    builtinToolIds: r.builtin_tool_ids_json ? JSON.parse(r.builtin_tool_ids_json) : [],
    systemPrompt: r.system_prompt,
    pinned: !!r.pinned,
    permissionMode: (r.permission_mode === 'readonly' || r.permission_mode === 'full') ? r.permission_mode : 'default',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToMsg(r: any): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    toolCalls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : undefined,
    toolCallId: r.tool_call_id,
    reasoningContent: r.reasoning_content,
    systemPromptSnapshot: r.system_prompt_snapshot,
    tokens: r.tokens,
    createdAt: r.created_at,
    parentToolCallId: r.parent_tool_call_id,
    subAgentId: r.sub_agent_id,
    subAgentName: r.sub_agent_name,
    subAgentDepth: r.sub_agent_depth,
  };
}

interface ToolCallRecord { id: string; name: string; arguments: string; }

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return {}; }
}

export interface PendingQuestion {
  question: string;
  options?: string[];
  multiSelect?: boolean;
  allowSupplement?: boolean;
  resolve: (answer: string, supplement?: string) => void;
}

export interface ConfirmationPage {
  question: string;
  description?: string;
  options?: string[];
  multiSelect?: boolean;
  allowText?: boolean;
  allowSupplement?: boolean;
  required?: boolean;
}

export interface ConfirmationAnswer {
  question: string;
  answer: string;
  supplement?: string;
}

// ===== 右栏多 tab 数据模型（Phase B1）=====
// 替换旧三态互斥模型（rightPanelTab 单枚举 + previewingFile 单值）：
// 旧模型物理上无法同时打开 2 个文件。新模型 previewTabs[] 并存 + activeTabId 激活。
// file tab 可多开（按 path 幂等）；browser/git 为单例（内容组件单实例，浏览器内部自管多 tab）。
export type PreviewTabKind = 'file' | 'browser' | 'git' | 'data' | 'console';
/** 数据浏览契约：与 shared.InlineDataView 对齐（聊天内嵌与右栏面板公用同一结构） */
export type DataTabContract = InlineDataView;
export interface PreviewTab {
  id: string;
  kind: PreviewTabKind;
  name: string;        // tab 标题（browser 实际标题渲染时优先取 currentBrowserUrl 的 hostname）
  path?: string;       // file：文件绝对路径（幂等 key）
  url?: string;        // browser：打开时的初始 URL
  repoPath?: string;   // git：仓库路径
  contract?: DataTabContract; // data：待浏览的查询契约
  createdAt: number;
}

export interface PendingConfirmation {
  title: string;
  pages: ConfirmationPage[];
  index: number;
  answers: ConfirmationAnswer[];
  resolve: (result: Record<string, unknown>) => void;
}

export interface PendingPlatformConfig {
  prefill: {
    name?: string;
    protocol?: 'openai' | 'anthropic' | 'custom';
    apiUrl?: string;
    apiKey?: string;
    modelId?: string;
    alias?: string;
    contextWindow?: number;
  };
  resolve: (result: { cancelled: boolean; platformId?: string; modelId?: string; message?: string }) => void;
}

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: PlanStepStatus;
  note?: string;
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  const currentConvId = ref('');
  // 会话级消息缓存：每个会话独立一份消息数组，支持多会话并行（后台会话流式时不会污染当前会话视图）
  const messagesByConv = ref<Record<string, Message[]>>({});
  // 当前会话视图：始终指向 messagesByConv 里当前会话的数组（会话未加载/不存在时为空）
  const currentMessages = computed<Message[]>(() => messagesByConv.value[currentConvId.value] || []);
  // 当前会话是否流式/跑任务（多会话可并行，此值只反映用户当前查看的会话）
  const streaming = computed(() => runningConvIds.value.has(currentConvId.value));
  // 正在运行的会话集合：支持不同会话同时跑任务（真并行），同一会话仍互斥
  const runningConvIds = ref<Set<string>>(new Set());
  function isConvStreaming(convId: string) {
    return runningConvIds.value.has(convId);
  }
  // 正在执行的 call_agent 工具调用 id 集合：用于跨层强制展开对应工具项，
  // 让 SubAgentRoundView 实时露出子智能体每一步；执行结束移除即自动折叠回简洁态。
  const runningToolCallIds = ref<Set<string>>(new Set());
  function isToolCallRunning(toolCallId: string) {
    return runningToolCallIds.value.has(toolCallId);
  }
  const mountedMcpServers = ref<string[]>([]);
  const mcpDisabledTools = ref<Record<string, string[]>>({});
  const mcpToolAliases = ref<Record<string, Record<string, string>>>({});
  // E11: 浏览器面板步骤日志 —— dispatchToolCall 中 browser_* 工具执行后推送
  const browserSteps = ref<Array<{ action: string; result: string; time: number }>>([]);
  // 右侧预览面板是否展开；默认**关闭**（进入聊天页先看到纯聊天区，点了文件/网站才展开右栏）
  const rightPanelOpen = ref(false);
  // 输入框「+」菜单模式开关（对齐 WorkBuddy）：随请求透传 modeFlags，后端统一追加指令/裁剪工具
  const thinkingMode = ref(false);   // 深度思考：提示词要求充分推理后再作答
  const planMode = ref(false);       // 计划模式：先用 task_plan 登记计划再执行
  const answerOnly = ref(false);     // 仅回答：后端清空工具列表，禁一切工具调用
  // 会话级工具权限：readonly=只读（写类工具被后端硬拦截）/ default=默认 / full=全部放行。
  // 持久化在 conversation.permission_mode；新会话草稿态先存本地，创建会话时随 POST 落库。
  type PermissionMode = 'readonly' | 'default' | 'full';
  const permissionMode = ref<PermissionMode>('default');
  /** 切换权限并持久化：已有会话立即 PATCH；草稿态只记本地（创建会话时随 POST 落库） */
  async function setPermissionMode(mode: PermissionMode) {
    permissionMode.value = mode;
    const cid = currentConvId.value;
    if (!cid) return;
    const r = await api.patch(`/conversations/${cid}`, { permissionMode: mode });
    if ((r as any)?.error) console.warn('[Chat] 权限模式保存失败:', (r as any).error);
  }
  // 文件管理弹窗（el-dialog）是否显示——左侧栏「文件管理」按钮触发
  const showFilePopup = ref(false);
  // ===== 多 tab 数据模型（Phase B1）：previewTabs 并存 + activeTabId 激活 =====
  const previewTabs = ref<PreviewTab[]>([]);
  const activeTabId = ref<string | null>(null);
  let previewTabSeq = 0;
  const activeTab = computed<PreviewTab | null>(
    () => previewTabs.value.find((t) => t.id === activeTabId.value) || null,
  );

  /** 打开（或激活已存在的）预览 tab。file 按 path 幂等复用；browser/git 单例复用；data 单例并覆盖其契约内容 */
  function openTab(tab: Omit<PreviewTab, 'id' | 'createdAt'>): string {
    const existing =
      tab.kind === 'file' && tab.path
        ? previewTabs.value.find((t) => t.kind === 'file' && t.path === tab.path)
        : previewTabs.value.find((t) => t.kind === tab.kind);
    if (existing) {
      if (existing.kind === 'data') {
        // 重新打开数据浏览：沿用同一 tab，替换为最新契约，触发面板刷新
        Object.assign(existing, {
          name: tab.name,
          contract: tab.contract,
        });
      } else if (existing.kind === 'browser' && tab.url) {
        existing.url = tab.url;
      }
      activeTabId.value = existing.id;
      rightPanelOpen.value = true;
      return existing.id;
    }
    const id = 'pv-' + ++previewTabSeq;
    previewTabs.value.push({ ...tab, id, createdAt: Date.now() });
    activeTabId.value = id;
    rightPanelOpen.value = true;
    return id;
  }
  /** 激活指定 tab（id 不存在时 no-op） */
  function activatePreviewTab(id: string) {
    if (previewTabs.value.some((t) => t.id === id)) {
      activeTabId.value = id;
      rightPanelOpen.value = true;
    }
  }
  /** 关闭 tab；关的是激活项则激活左邻 → 右邻 → 无 */
  function closePreviewTab(id: string) {
    const idx = previewTabs.value.findIndex((t) => t.id === id);
    if (idx < 0) return;
    previewTabs.value.splice(idx, 1);
    if (activeTabId.value === id) {
      const next = previewTabs.value[idx - 1] || previewTabs.value[idx] || null;
      activeTabId.value = next ? next.id : null;
    }
  }
  /** 全部关闭（面板保持展开，内容区显示空态） */
  function closeAllPreviewTabs() {
    previewTabs.value = [];
    activeTabId.value = null;
  }
  /** 关闭指定 tab 左侧的所有 tab；若激活项被关闭则激活锚点 tab */
  function closePreviewTabsLeft(id: string) {
    const idx = previewTabs.value.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    previewTabs.value.splice(0, idx);
    if (!previewTabs.value.some((t) => t.id === activeTabId.value)) activeTabId.value = id;
  }
  /** 关闭指定 tab 右侧的所有 tab；若激活项被关闭则激活锚点 tab */
  function closePreviewTabsRight(id: string) {
    const idx = previewTabs.value.findIndex((t) => t.id === id);
    if (idx < 0 || idx === previewTabs.value.length - 1) return;
    previewTabs.value.splice(idx + 1);
    if (!previewTabs.value.some((t) => t.id === activeTabId.value)) activeTabId.value = id;
  }

  // ===== 兼容层：旧三态字段改为派生只读（迁移期读取点不改可跑通）=====
  const rightPanelTab = computed<PreviewTabKind>(() => activeTab.value?.kind || 'file');
  const previewingFile = computed<{ name: string; path: string } | null>(() => {
    const t = activeTab.value;
    return t && t.kind === 'file' && t.path ? { name: t.name, path: t.path } : null;
  });
  // currentBrowserUrl 保持可写（BrowserPanel 写入更新标题 / browser_navigate 写入触发导航）
  const currentBrowserUrl = ref('');
  // pageAgent 导航时置 true，BrowserPanel watch(currentUrl) 跳过一次 recordVisit（不记录智能体浏览历史）
  const skipNextRecordVisit = ref(false);


  // E12: 智能体反问弹窗 —— 等待用户回答的待处理问题（dispatchToolCall 中 await 此 Promise 以暂停 ReAct 循环）
  const pendingQuestion = ref<PendingQuestion | null>(null);
  // E12b: 多页用户确认向导 —— confirm_user 工具逐页收集选择/文字/补充说明
  const pendingConfirmation = ref<PendingConfirmation | null>(null);
  // E12c: 模型平台配置弹窗 —— configure_model_platform 工具触发，等待用户填写并保存平台/模型
  const pendingPlatformConfig = ref<PendingPlatformConfig | null>(null);
  // E12: 任务规划进度 —— task_plan / task_step 工具写入，UI 渲染 todo 卡片
  const planTitle = ref('');
  const planSteps = ref<PlanStep[]>([]);

  /** 用户提交反问弹窗的回答（或在未提供选项时填入文本）；答案作为该工具调用的 result 回写并继续循环 */
  function submitPendingQuestion(answer: string, supplement?: string) {
    if (pendingQuestion.value) {
      const resolve = pendingQuestion.value.resolve;
      pendingQuestion.value = null;
      resolve(answer, supplement?.trim() || undefined);
    }
  }
  /** 提交当前确认向导页；非最后一页时前进，最后一页汇总全部回答并恢复 ReAct 循环 */
  function submitPendingConfirmation(answer: string, supplement?: string) {
    const wizard = pendingConfirmation.value;
    if (!wizard) return;
    const page = wizard.pages[wizard.index];
    if (!page) return;
    wizard.answers[wizard.index] = {
      question: page.question,
      answer,
      supplement: supplement?.trim() || undefined,
    };
    if (wizard.index < wizard.pages.length - 1) {
      wizard.index += 1;
      return;
    }
    const resolve = wizard.resolve;
    pendingConfirmation.value = null;
    resolve({
      cancelled: false,
      title: wizard.title,
      answers: wizard.answers,
      summary: wizard.answers
        .map((a) => `Q: ${a.question}\nA: ${a.answer || '(未作答)'}${a.supplement ? `\n补充: ${a.supplement}` : ''}`)
        .join('\n\n'),
    });
  }
  /** 跳过当前确认页：把这一页标记为跳过并进入下一页 */
  function skipPendingConfirmation() {
    submitPendingConfirmation('', '[用户跳过该问题]');
  }
  /** 用户关闭向导：以取消结果结束本次 confirm_user 调用 */
  function cancelPendingConfirmation() {
    const wizard = pendingConfirmation.value;
    if (!wizard) return;
    const resolve = wizard.resolve;
    pendingConfirmation.value = null;
    resolve({ cancelled: true, title: wizard.title, answers: wizard.answers });
  }
  /** 用户提交模型平台配置弹窗：将保存结果回写为 configure_model_platform 工具结果 */
  function submitPlatformConfig(result: { cancelled: boolean; platformId?: string; modelId?: string; message?: string }) {
    const pending = pendingPlatformConfig.value;
    if (!pending) return;
    const resolve = pending.resolve;
    pendingPlatformConfig.value = null;
    resolve(result);
  }
  /** 用户关闭模型平台配置弹窗：以取消结果结束本次工具调用 */
  function cancelPlatformConfig() {
    submitPlatformConfig({ cancelled: true, message: '用户关闭了模型平台配置弹窗' });
  }
  /** 清空当前任务计划（用户关闭进度卡片时调用） */
  function clearPlan() {
    planTitle.value = '';
    planSteps.value = [];
  }
  let abortControllers = new Map<string, AbortController>();
  const taskIds = new Map<string, string>(); // convId → backend taskId（用于 abort）
  const taskEventCounts = new Map<string, number>(); // taskId → 已收到事件数（重连时作为 since）

  // 单库收敛：数据面恒走后端（与 auth.useServerApi 一致）。后端 authMiddleware 本地模式已屏蔽鉴权，
  // 无 token 也回退 guest 放行，故前端登录态不影响数据归属。本地 adapter.db 分支已废弃。
  const isServerMode = () => useAuthStore().useServerApi; // 恒 true

  function activeAgent() {
    const agentStore = useAgentStore();
    return agentStore.selectedAgent;
  }

  function activeAgentId() {
    const agentStore = useAgentStore();
    return agentStore.selectedId;
  }

  async function loadConversations() {
    if (isServerMode()) {
      const r = await api.get<any[]>('/conversations');
      if ('data' in r) {
        conversations.value = (r.data as any[]).map(rowToConv);
      } else {
        conversations.value = [];
      }
      return;
    }
    const adapter = getPlatformAdapter();
    const rows = await adapter.db.query<any>('SELECT * FROM conversation ORDER BY pinned DESC, updated_at DESC');
    conversations.value = rows.map(rowToConv);
  }

  async function loadMessages(convId: string) {
    currentConvId.value = convId;
    if (isServerMode()) {
      const r = await api.get<any[]>(`/conversations/${convId}/messages`);
      if ('data' in r) {
        messagesByConv.value[convId] = (r.data as any[]).map(rowToMsg);
      } else {
        messagesByConv.value[convId] = [];
      }
      const conv = conversations.value.find((c) => c.id === convId);
      mountedMcpServers.value = conv?.mcpServerIds || [];
      mcpDisabledTools.value = conv?._mcpDisabledTools ? { ...conv._mcpDisabledTools } : {};
      mcpToolAliases.value = conv?._mcpToolAliases ? JSON.parse(JSON.stringify(conv._mcpToolAliases)) : {};
      // 回填会话级权限模式（下拉显示与后端拦截以 conversation.permission_mode 为准）
      permissionMode.value = conv?.permissionMode || 'default';
      void reconnectActiveTask(convId);
      return;
    }
    const adapter = getPlatformAdapter();
    // 与服务端对齐：历史还原不携带 system_prompt_snapshot（按需走 GET /messages/:mid/snapshot 或本地直查）
    const rows = await adapter.db.query<any>(
      'SELECT id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at FROM message WHERE conversation_id = ? ORDER BY created_at ASC',
      [convId],
    );
    messagesByConv.value[convId] = rows.map(rowToMsg);
    const conv = conversations.value.find((c) => c.id === convId);
    mountedMcpServers.value = conv?.mcpServerIds || [];
    mcpDisabledTools.value = conv?._mcpDisabledTools ? { ...conv._mcpDisabledTools } : {};
    mcpToolAliases.value = conv?._mcpToolAliases ? JSON.parse(JSON.stringify(conv._mcpToolAliases)) : {};
    permissionMode.value = conv?.permissionMode || 'default';
  }

  async function createConversation(title: string, opts?: { platformId?: string; modelId?: string; skillIds?: string[]; spaceId?: string; agentId?: string }): Promise<string> {
    // 未显式指定时记录当前选中的智能体，保证会话打开时能还原
    let agentId = opts?.agentId;
    if (!agentId) {
      try {
        const { useAgentStore } = await import('./agent');
        const agentStore = useAgentStore();
        agentId = agentStore.selectedId || agentStore.selectedAgent?.id || undefined;
      } catch { /* agent store 未加载则忽略 */ }
    }
    // 默认挂到当前选中的空间（null 表示"全部"则不归类，即 spaceId=null）
    let spaceId = opts?.spaceId;
    if (spaceId === undefined) {
      try {
        const { useSpaceStore } = await import('./space');
        spaceId = useSpaceStore().currentSpaceId ?? undefined;
      } catch { /* space store 未加载则忽略 */ }
    }
    if (isServerMode()) {
      const r = await api.post<any>('/conversations', {
        title, platformId: opts?.platformId, modelId: opts?.modelId,
        skillIds: opts?.skillIds || [], spaceId: spaceId || null,
        agentId: agentId || null,
        permissionMode: permissionMode.value,
      });
      if ('data' in r) {
        const row = r.data as any;
        const conv = rowToConv(row);
        conversations.value.unshift(conv);
        return conv.id;
      }
      throw new Error('创建会话失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('c_');
    const ts = Date.now();
    const skillIdsJson = JSON.stringify(opts?.skillIds || []);
    await adapter.db.exec(
      'INSERT INTO conversation (id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, agentId || null, opts?.platformId || null, opts?.modelId || null, spaceId || null, '[]', skillIdsJson, 0, ts, ts],
    );
    await loadConversations();
    return id;
  }

  async function updateConversation(id: string, patch: Partial<Conversation>) {
    if (isServerMode()) {
      const body: any = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.platformId !== undefined) body.platformId = patch.platformId;
      if (patch.modelId !== undefined) body.modelId = patch.modelId;
      if (patch.pinned !== undefined) body.pinned = patch.pinned;
      if (patch.mcpServerIds !== undefined) body.mcpServerIds = patch.mcpServerIds;
      if (patch._mcpDisabledTools !== undefined) body.mcpDisabledTools = patch._mcpDisabledTools;
      if (patch.skillIds !== undefined) body.skillIds = patch.skillIds;
      if (patch.builtinToolIds !== undefined) body.builtinToolIds = patch.builtinToolIds;
      if (patch.systemPrompt !== undefined) body.systemPrompt = patch.systemPrompt;
      if (patch.agentId !== undefined) body.agentId = patch.agentId;
      if (patch.spaceId !== undefined) body.spaceId = patch.spaceId || null;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/conversations/${id}`, body);
      await loadConversations();
      return;
    }
    const adapter = getPlatformAdapter();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) { sets.push('title = ?'); params.push(patch.title); }
    if (patch.platformId !== undefined) { sets.push('platform_id = ?'); params.push(patch.platformId); }
    if (patch.modelId !== undefined) { sets.push('model_id = ?'); params.push(patch.modelId); }
    if (patch.pinned !== undefined) { sets.push('pinned = ?'); params.push(patch.pinned ? 1 : 0); }
    if (patch.spaceId !== undefined) { sets.push('space_id = ?'); params.push(patch.spaceId || null); }
    if (patch.mcpServerIds !== undefined || patch._mcpDisabledTools !== undefined || patch._mcpToolAliases !== undefined) {
      const serverIds = patch.mcpServerIds ?? mountedMcpServers.value;
      const disabled = patch._mcpDisabledTools ?? mcpDisabledTools.value;
      const aliases = patch._mcpToolAliases ?? mcpToolAliases.value;
      const serversJson = serverIds.map(sid => ({
        serverId: sid,
        disabledTools: disabled[sid] || [],
        aliases: aliases[sid] || {},
      }));
      sets.push('mcp_servers_json = ?');
      params.push(JSON.stringify(serversJson));
    }
    if (patch.skillIds !== undefined) { sets.push('skill_ids_json = ?'); params.push(JSON.stringify(patch.skillIds)); }
    if (patch.systemPrompt !== undefined) { sets.push('system_prompt = ?'); params.push(patch.systemPrompt); }
    if (patch.agentId !== undefined) { sets.push('agent_id = ?'); params.push(patch.agentId || null); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    params.push(Math.floor(Date.now()));
    params.push(id);
    await adapter.db.exec(`UPDATE conversation SET ${sets.join(', ')} WHERE id = ?`, params);
    await loadConversations();
  }

  async function deleteConversation(id: string) {
    if (isServerMode()) {
      await api.delete(`/conversations/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM message WHERE conversation_id = ?', [id]);
      await adapter.db.exec('DELETE FROM conversation WHERE id = ?', [id]);
    }
    if (currentConvId.value === id) {
      currentConvId.value = '';
    }
    delete messagesByConv.value[id];
    await loadConversations();
  }

  async function deleteConversations(ids: string[]) {
    if (ids.length === 0) return;
    if (isServerMode()) {
      await Promise.all(ids.map((id) => api.delete(`/conversations/${id}`)));
    } else {
      const adapter = getPlatformAdapter();
      for (const id of ids) {
        await adapter.db.exec('DELETE FROM message WHERE conversation_id = ?', [id]);
        await adapter.db.exec('DELETE FROM conversation WHERE id = ?', [id]);
      }
    }
    if (ids.includes(currentConvId.value)) {
      currentConvId.value = '';
    }
    for (const id of ids) delete messagesByConv.value[id];
    await loadConversations();
  }

  async function addMessage(msg: Omit<Message, 'id' | 'createdAt'>): Promise<string> {
    const targetConvId = msg.conversationId || currentConvId.value;
    if (isServerMode()) {
      const r = await api.post<any>(`/conversations/${targetConvId}/messages`, {
        role: msg.role, content: msg.content, toolCalls: msg.toolCalls,
        toolCallId: msg.toolCallId, reasoningContent: msg.reasoningContent, tokens: msg.tokens,
        parentToolCallId: msg.parentToolCallId, subAgentId: msg.subAgentId,
        subAgentName: msg.subAgentName, subAgentDepth: msg.subAgentDepth,
      });
      if ('data' in r) {
        const row = r.data as any;
        const m = rowToMsg(row);
        (messagesByConv.value[targetConvId] ||= []).push(m);
        return m.id;
      }
      throw new Error('添加消息失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('msg_');
    const ts = Date.now();
    // 兜底：旧库若未跑完 migration（无新列）或某端 SQL 解析不兼容，INSERT 会抛错打断主对话发送；
    // 落库失败时降级只 push 内存缓存，保证发送流程不中断（与 appendTransientMessage 一致）。
    try {
      await adapter.db.exec(
        'INSERT INTO message (id, conversation_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id, targetConvId, msg.role, msg.content || null,
          msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          msg.toolCallId || null, msg.reasoningContent || null,
          msg.systemPromptSnapshot || null,
          msg.tokens || 0,
          msg.parentToolCallId || null, msg.subAgentId || null,
          msg.subAgentName || null, msg.subAgentDepth ?? null,
          ts,
        ],
      );
      await adapter.db.exec('UPDATE conversation SET updated_at = ? WHERE id = ?', [ts, targetConvId]);
    } catch (e) {
      console.warn('[Chat] addMessage 落库失败，降级仅存内存:', e);
    }
    (messagesByConv.value[targetConvId] ||= []).push({ ...msg, id, createdAt: ts });
    return id;
  }

  /** 乐观添加消息：先 push 到内存（UI 立即显示），再异步落库（不经过 addMessage，避免重复 push）。
   *  返回 { id, dbPromise }：id 是前端临时 ID（内存中用），dbPromise resolve 为后端真实 ID。 */
  function pushMessageOptimistic(msg: Omit<Message, 'id' | 'createdAt'>): { id: string; dbPromise: Promise<string> } {
    const targetConvId = msg.conversationId || currentConvId.value;
    const id = uid('msg_');
    const ts = Date.now();
    (messagesByConv.value[targetConvId] ||= []).push({ ...msg, id, createdAt: ts });
    const dbPromise = (async (): Promise<string> => {
      if (isServerMode()) {
        const r = await api.post<any>(`/conversations/${targetConvId}/messages`, {
          role: msg.role, content: msg.content, toolCalls: msg.toolCalls,
          toolCallId: msg.toolCallId, reasoningContent: msg.reasoningContent, tokens: msg.tokens,
          parentToolCallId: msg.parentToolCallId, subAgentId: msg.subAgentId,
          subAgentName: msg.subAgentName, subAgentDepth: msg.subAgentDepth,
        });
        if ('data' in r) {
          const realId = (r.data as any).id;
          const arr = messagesByConv.value[targetConvId];
          const idx = arr.findIndex(m => m.id === id);
          if (idx >= 0) arr[idx] = { ...arr[idx], id: realId };
          return realId;
        }
        throw new Error('添加消息失败');
      }
      try {
        const adapter = getPlatformAdapter();
        await adapter.db.exec(
          'INSERT INTO message (id, conversation_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, parent_tool_call_id, sub_agent_id, sub_agent_name, sub_agent_depth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            id, targetConvId, msg.role, msg.content || null,
            msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            msg.toolCallId || null, msg.reasoningContent || null,
            msg.systemPromptSnapshot || null,
            msg.tokens || 0,
            msg.parentToolCallId || null, msg.subAgentId || null,
            msg.subAgentName || null, msg.subAgentDepth ?? null,
            ts,
          ],
        );
        await adapter.db.exec('UPDATE conversation SET updated_at = ? WHERE id = ?', [ts, targetConvId]);
      } catch (e) {
        console.warn('[Chat] pushMessageOptimistic 落库失败:', e);
      }
      return id;
    })();
    return { id, dbPromise };
  }

  async function updateMessage(id: string, patch: Partial<Message>) {
    // 定位该消息所在会话缓存并原地更新，支持后台会话并发流式
    const updateInPlace = () => {
      for (const convId of Object.keys(messagesByConv.value)) {
        const arr = messagesByConv.value[convId];
        const idx = arr.findIndex((m) => m.id === id);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...patch };
          return;
        }
      }
    };
    if (isServerMode()) {
      const body: any = {};
      if (patch.content !== undefined) body.content = patch.content;
      if (patch.reasoningContent !== undefined) body.reasoningContent = patch.reasoningContent;
      if (patch.tokens !== undefined) body.tokens = patch.tokens;
      if (patch.toolCalls !== undefined) body.toolCalls = patch.toolCalls;
      if (patch.systemPromptSnapshot !== undefined) body.systemPromptSnapshot = patch.systemPromptSnapshot;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/messages/${id}`, body);
      updateInPlace();
      return;
    }
    const adapter = getPlatformAdapter();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.content !== undefined) { sets.push('content = ?'); params.push(patch.content); }
    if (patch.reasoningContent !== undefined) { sets.push('reasoning_content = ?'); params.push(patch.reasoningContent); }
    if (patch.tokens !== undefined) { sets.push('tokens = ?'); params.push(patch.tokens); }
    if (patch.toolCalls !== undefined) { sets.push('tool_calls_json = ?'); params.push(JSON.stringify(patch.toolCalls)); }
    if (patch.systemPromptSnapshot !== undefined) { sets.push('system_prompt_snapshot = ?'); params.push(patch.systemPromptSnapshot); }
    if (sets.length === 0) return;
    params.push(id);
    await adapter.db.exec(`UPDATE message SET ${sets.join(', ')} WHERE id = ?`, params);
    updateInPlace();
  }

  async function deleteMessage(id: string) {
    if (isServerMode()) {
      await api.delete(`/messages/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM message WHERE id = ?', [id]);
    }
    for (const convId of Object.keys(messagesByConv.value)) {
      messagesByConv.value[convId] = messagesByConv.value[convId].filter((m) => m.id !== id);
    }
  }

  function getMergedMounts(): {
    builtinToolIds: string[];
    customToolIds: string[];
    mcpToolMounts: { serverId: string; toolName: string }[];
    skillIds: string[];
    subAgentIds: string[];
  } {
    const agent = activeAgent();
    const conv = conversations.value.find(c => c.id === currentConvId.value);
    const isHarness = !agent || !agent.type || agent.type === 'harness';

    // 智能体挂载（仅 harness）
    const agentBuiltin = isHarness && agent?.builtinToolIds ? agent.builtinToolIds : [];
    const agentCustom = isHarness && agent?.customToolIds ? agent.customToolIds : [];
    const agentMcp = isHarness && agent?.mcpToolMounts ? agent.mcpToolMounts : [];
    const agentSkills = isHarness && agent?.skillIds ? agent.skillIds : [];
    const agentSubs = isHarness && agent?.subAgentIds ? agent.subAgentIds : [];

    // 会话挂载
    const convSkills = conv?.skillIds || [];
    const convMcp: { serverId: string; toolName: string }[] = [];
    for (const sid of mountedMcpServers.value) {
      const disabled = mcpDisabledTools.value[sid] || [];
      const mcpStore = useMcpStore();
      const tools = mcpStore.tools[sid] || [];
      for (const t of tools) {
        if (!disabled.includes(t.name)) {
          convMcp.push({ serverId: sid, toolName: t.name });
        }
      }
    }

    // 合并取并集（MCP: agent 中 server "*" 覆盖 conv 的细粒度）
    const mergedMcp: { serverId: string; toolName: string }[] = [...agentMcp];
    const agentStarServers = new Set(agentMcp.filter(m => m.toolName === '*').map(m => m.serverId));
    for (const c of convMcp) {
      if (!agentStarServers.has(c.serverId) &&
          !mergedMcp.some(m => m.serverId === c.serverId && m.toolName === c.toolName)) {
        mergedMcp.push(c);
      }
    }

    return {
      builtinToolIds: [...new Set([...agentBuiltin, ...(conv?.builtinToolIds || [])])],
      customToolIds: [...new Set([...agentCustom])],
      mcpToolMounts: mergedMcp,
      skillIds: [...new Set([...agentSkills, ...convSkills])],
      subAgentIds: [...new Set([...agentSubs])],
    };
  }

  // ============ 工具命名与分发（A 组重构：内置裸名 / MCP shortId / 自定义 id 化） ============

  // 保留前缀：内置工具裸名不得以此开头，避免与 MCP/自定义工具路由冲突
  const MCP_PREFIX = 'mcp_';
  const CUSTOM_PREFIX = 'custom_';

  /** MCP serverId → 8 位 shortId：去掉 mcp_ 前缀后取前 8 个字母数字。
   *  desktop 用 uid('mcp_') 生成 mcp_xxxxxxxx；server 用 uuid() 生成 UUID，
   *  两种格式统一处理，修复旧代码 mcp_mcp_ 双前缀问题（A3）。 */
  function mcpShortIdOf(serverId: string): string {
    const base = serverId.startsWith('mcp_') ? serverId.slice(4) : serverId;
    return base.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  }

  /** 构建 shortId→serverId 精确映射表：仅当某 shortId 唯一对应一个 serverId 时才登记，
   *  避免前缀碰撞导致工具调用误路由到错误的服务（A3 精确映射）。 */
  function buildMcpShortIdMap(): Map<string, string> {
    const groups = new Map<string, string[]>();
    for (const sid of mountedMcpServers.value) {
      const shortId = mcpShortIdOf(sid);
      if (!shortId) continue;
      if (!groups.has(shortId)) groups.set(shortId, []);
      groups.get(shortId)!.push(sid);
    }
    const result = new Map<string, string>();
    for (const [shortId, sids] of groups) {
      if (sids.length === 1) result.set(shortId, sids[0]); // 仅唯一时精确映射
    }
    return result;
  }

  /** 自定义工具暴露名：custom_{id前8位}_{name}，按 id 反查分发，避免裸 name 与内置/MCP 重名（A2） */
  function customToolExposedName(id: string, name: string): string {
    const idTag = (id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return `${CUSTOM_PREFIX}${idTag}_${name}`;
  }

  /** 解析 MCP 工具暴露名 → { serverId, toolName } | null（shortId→serverId 精确映射 + 工具存在性校验） */
  function parseMcpToolName(fullName: string): { serverId: string; toolName: string } | null {
    const m = fullName.match(/^mcp_([a-zA-Z0-9]{1,8})__(.+)$/);
    if (!m) return null;
    const shortId = m[1];
    const toolName = m[2];
    const serverId = buildMcpShortIdMap().get(shortId);
    if (!serverId) return null;
    const mcpStore = useMcpStore();
    const list = mcpStore.tools[serverId] || [];
    if (!list.some(t => t.name === toolName)) return null; // 防止幽灵调用
    return { serverId, toolName };
  }

  /** 解析自定义工具暴露名 → { id, name } | null（精确字符串匹配已挂载工具，无碰撞风险） */
  function parseCustomToolName(fullName: string): { id: string; name: string } | null {
    if (!fullName.startsWith(CUSTOM_PREFIX)) return null;
    const merged = getMergedMounts();
    const toolsStore = useToolsStore();
    for (const id of merged.customToolIds) {
      const ct = toolsStore.customTools.find(t => t.id === id);
      if (!ct) continue;
      if (customToolExposedName(ct.id, ct.name) === fullName) {
        return { id: ct.id, name: ct.name };
      }
    }
    return null;
  }

  /** 把数据浏览契约内嵌到当前会话最后一条助手消息（聊天流程里直接出动态看板） */
  function nestDataViewIntoChat(view: InlineDataView): boolean {
    const convId = currentConvId.value;
    const msgs = convId ? messagesByConv.value[convId] : undefined;
    if (!msgs?.length) return false;
    // 取最后一条 assistant 消息（同一次回复里可先后多次 data_query_view，均挂到最后一条正文消息）
    let target: Message | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        // 优先存在正文或正是正在被渲染的那条（含流式中）；避免附到纯推理/空 content 中转
        target = msgs[i];
        break;
      }
    }
    // 若没有 assistant，仍给用户消息后的首个空 slot 兜底——正常至少有一条 assistant
    if (!target) return false;
    // 复用已有 dataView（一个消息同源多列合约少见，直接覆盖为最新）
    target.dataView = { ...target.dataView, ...view };
    return true;
  }

  /** data_query_view：把模型产出的数据浏览契约【内嵌到当前聊天流程的助手消息】出动态看板。
   *  取数完全由 DataQueryWorkbench 内 /run 参数化完成，不经大模型。 */
  async function openDataViewFromArgs(args: unknown): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    const a = (args || {}) as Record<string, unknown>;
    const table = typeof a.table === 'string' && a.table.trim() ? a.table.trim() : undefined;
    const base = typeof a.base === 'string' && a.base.trim() ? a.base.trim() : undefined;
    if (!table && !base) {
      return { ok: false, msg: 'data_query_view 需要 table（表名）或 base（只读 SQL）之一。取数后端参数化执行，不改此处猜数据。' };
    }
    const contract: DataTabContract = {
      datasourceId: (typeof a.datasourceId === 'string' && a.datasourceId.trim()) ? a.datasourceId.trim() : undefined,
      table,
      base,
      title: (typeof a.title === 'string' && a.title.trim()) ? a.title.trim() : (table || '数据浏览'),
      filterCols: Array.isArray(a.filterCols) ? (a.filterCols as unknown[]).filter((c): c is string => typeof c === 'string') : undefined,
    };
    const dsInfo = (typeof a.datasourceId === 'string' && a.datasourceId.trim()) ? `（数据源 ${a.datasourceId}）` : '';
    // 优先内嵌到聊天流程（用户对「动态看板」的定位）：消息区直接出现可交互看板
    if (nestDataViewIntoChat(contract)) {
      return { ok: true, result: `已在本条回复内嵌数据看板：${contract.title || table}${dsInfo}。可直接翻页/加过滤器/切表格·折线·柱·饼，全程参数化，不经大模型。` };
    }
    // 兜底：无助手消息上下文时开右栏数据面板
    openTab({ kind: 'data', name: contract.title || '数据浏览', contract });
    return { ok: true, result: `已在数据浏览面板打开：${contract.title}${table ? `（表 ${table}）` : ''}${dsInfo}。可在此翻页、加过滤器、切表格/折线/柱/饼。` };
  }

  /** 统一工具调用分发（A4 分发顺序）：
   *  1) mcp_{shortId}__{toolName} → MCP callTool
   *  2) custom_{idTag}_{name}     → 服务端沙箱 /api/tools/:id/execute（沙箱依赖 node:vm，仅服务端可用）
   *  3) 裸名                       → ToolRegistry.execute（内置工具，经平台适配器执行）
   *  重名不误路由：三类前缀互斥，裸名不得以 mcp_/custom_ 开头。 */
  async function dispatchToolCall(fullName: string, args: unknown, ctx?: { parentToolCallId?: string; depth?: number }): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    const mcpStore = useMcpStore();
    const registry = getToolRegistry();

    // 1) MCP 工具
    if (fullName.startsWith(MCP_PREFIX) && fullName.includes('__')) {
      const parsed = parseMcpToolName(fullName);
      if (!parsed) return { ok: false, msg: '无法解析 MCP 工具或工具不存在: ' + fullName };
      // 人机交互类 MCP 工具路由到内置拦截：ask_user/confirm_user 需在前端等待用户回答，不能直接调服务端
      if (parsed.toolName === 'ask_user' || parsed.toolName === 'confirm_user') {
        return dispatchToolCall(parsed.toolName, args, ctx);
      }
      return mcpStore.callTool(parsed.serverId, parsed.toolName, args);
    }

    // 2) 内置工具裸名（经 ToolRegistry + 平台适配器执行）
    // 注意：custom_/call_agent/list_sub_agents 已由后端直接执行，不再委托前端
    if (registry.has(fullName)) {
      if (fullName.startsWith(MCP_PREFIX) || fullName.startsWith(CUSTOM_PREFIX)) {
        return { ok: false, msg: '内置工具名与保留前缀冲突: ' + fullName };
      }
      // B 方案：智能体调 browser_navigate 时，桌面端桥接到预览面板的 BrowserView（共用同一浏览器）。
      // 通过 store.currentBrowserUrl 命令 BrowserPanel 导航，模型打开的页面在预览面板同步显示。
      if (fullName === 'browser_navigate') {
        const isElectronDesktop = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
        const rawUrl = extractUrlFromArgs(args);
        if (isElectronDesktop) {
          if (!rawUrl) return { ok: false, msg: 'browser_navigate 缺少 url 参数' };
          const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;
          let host = target;
          try { host = new URL(target).hostname; } catch { /* keep raw */ }
          // openInNewTab：真新建 host 标签页返回 tabId（不再退化成覆盖当前页）
          if ((args as any).openInNewTab === true) {
            let nt: any = null;
            try {
              nt = await (window as any).electronAPI.browserView.action(null, 'new_tab', { url: target });
            } catch { /* ignore */ }
            if (nt && nt.tabId !== undefined) {
              // 新 host 已由主进程广播 tabCreated、渲染层补壳并用 :src=target 拉取页面
              const text = `已在新标签页打开。\ntabId=${nt.tabId}\nURL: ${target}\n后续读取该页内容时给 browser_get_page_content / browser_get_page_info 等读取工具传 tabId=${nt.tabId}`;
              browserSteps.value.push({ action: 'browser_navigate(openInNewTab)', result: text, time: Date.now() });
              return { ok: true, result: text };
            }
            // 引擎不支持则回退原覆盖导航
          }
          openTab({ kind: 'browser', name: host, url: target });
          // 用预览面板当前显示的 tab 导航（面板未就绪时轮询等待其自建，见 resolvePreviewTabId）
          const navTabId = await resolvePreviewTabId();
          skipNextRecordVisit.value = true;
          try {
            const result = await Promise.race([
              (window as any).electronAPI.browserView.action(navTabId, 'navigate', { url: target }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('IPC 导航超时（20s）')), 20000)),
            ]) as any;
            const ok = !result?.error;
            const text = ok ? `已导航到 ${result.url || target}` : (result?.error || '导航失败');
            browserSteps.value.push({ action: 'browser_navigate', result: text, time: Date.now() });
            return { ok, result: text, msg: ok ? undefined : text };
          } catch (e: any) {
            return { ok: false, msg: `IPC 导航失败: ${e?.message || e}` };
          }
        }
        // Web 端走后端 Playwright
        const res = await registry.execute('browser_navigate', args as Record<string, unknown>);
        const text = res.content?.[0]?.text ?? '';
        browserSteps.value.push({ action: 'browser_navigate', result: text, time: Date.now() });
        return { ok: !res.isError, result: text, msg: res.isError ? text : undefined };
      }

      // 桌面端其它 browser_* 工具：统一走 browserView:action（25 action，__yzElements 注册表）
      const isElectronDesktopBrowser = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
      if (isElectronDesktopBrowser && fullName.startsWith('browser_')) {
        // browser_* 工具名 → browserView:action action 名（统一通道，废弃 browser:call 的 10-action 子集）
        const actionMap: Record<string, string> = {
          'browser_get_page_info': 'get_page_info',
          'browser_get_page_content': 'get_page_content',
          'browser_get_dom': 'get_dom',
          'browser_click': 'click',
          'browser_type': 'type',
          'browser_press_key': 'press',
          'browser_screenshot': 'screenshot',
          'browser_get_visible_text': 'get_visible_text',
          'browser_get_text': 'get_text',
          'browser_wait': 'wait',
          'browser_wait_for': 'wait_for',
          'browser_scroll': 'scroll',
          'browser_hover': 'hover',
          'browser_back': 'back',
          'browser_forward': 'forward',
          'browser_reload': 'reload',
          'browser_fill_form': 'fill_form',
          'browser_submit_form': 'submit_form',
          'browser_search': 'search',
          'browser_next_page': 'next_page',
          'browser_prev_page': 'prev_page',
          'browser_select_option': 'select_option',
          'browser_check': 'check',
          'browser_uncheck': 'uncheck',
          'browser_extract_list': 'extract_list',
        };
        const action = actionMap[fullName];
        if (action) {
          try {
            const actTabId = await resolvePreviewTabId();
            const result = await Promise.race([
              (window as any).electronAPI.browserView.action(actTabId, action, args),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`IPC 调用超时（20s）: ${action}`)), 20000)),
            ]) as any;
            // browserView:action 返回 { error } 表示失败，否则成功
            const ok = !result?.error;
            let text = '';
            if (ok) {
              if (action === 'get_page_info') {
                const ic = (result.interactive || []).length;
                text = `页面: ${result.title || result.url}\n可交互元素: ${ic}${ic > 0 ? '\n' + (result.interactive || []).slice(0, 20).map((e: any) => `[${e.index}] ${e.tag}${e.text ? ': ' + e.text : ''}`).join('\n') : ''}`;
              } else if (action === 'get_visible_text' || action === 'get_text') {
                text = result.text || '';
              } else if (action === 'screenshot') {
                text = '截图已捕获';
              } else if (action === 'get_dom') {
                // 桌面端不把完整 DOM 回传模型（体积大且无必要）。若只回 "DOM 节点数"，
                // 模型会因拿不到链接/文本内容而无限换参重试。给出可行动提示引导改用四件套。
                text = `DOM 节点数: ${result.nodeCount || 0}（桌面端不返回 DOM 明细。请改用 browser_get_page_content 获取页面可见正文与带编号的可交互元素列表，不要用不同 depth/maxNodes 参数重试本工具）`;
              } else if (action === 'get_page_content') {
                // 聚合读页：正文 + 编号元素直接给模型（不截断，否则模型拿不到搜索结果页内容）
                const elems = (result.interactive || []).map((e: any) => {
                  let s = `[${e.index}] ${e.tag}`;
                  if (e.text) s += ` "${String(e.text).slice(0, 40)}"`;
                  if (e.placeholder) s += ` [ph:${e.placeholder}]`;
                  if (e.href) s += ` →${String(e.href).slice(0, 80)}`;
                  return s;
                }).join('\n');
                text = `URL: ${result.url}\nTitle: ${result.title}\n\n【页面可见文本】\n${result.text || '(空)'}\n\n【可交互元素】(${result.interactiveCount} 个，编号可直接用于 browser_click/browser_type 的 index 参数)\n${elems}`;
              } else {
                text = result.success ? `${action} 执行成功` : JSON.stringify(result).slice(0, 500);
              }
            } else {
              text = result?.error || `${action} 执行失败`;
            }
            browserSteps.value.push({ action: fullName, result: text, time: Date.now() });
            return { ok, result: text, msg: ok ? undefined : text };
          } catch (e: any) {
            return { ok: false, msg: `IPC 调用失败 (${fullName}): ${e?.message || e}` };
          }
        }
        // 未映射的 browser_* 工具：桌面端单一执行面（预览 BrowserView），绝不静默回退
        // 后端 Playwright——那会造成操作与预览两套分裂 + headless 被风控弹验证码。
        return { ok: false, msg: `桌面端暂不支持 ${fullName}。请改用四件套工具：browser_navigate / browser_type / browser_click / browser_get_page_content` };
      }


      // image_analyze 拦截 —— 优先 vision 多模态模型，降级服务端 Tesseract OCR
      if (fullName === 'image_analyze') {
        return runImageAnalyze(args as { path?: string; prompt?: string; platformId?: string; modelId?: string });
      }
      // data_query_view —— 数据分析链路的前端收口：把数据明细/视图开进右侧「数据浏览」面板。
      // 该工具由主智能体/子智能体在“要展示明细数据时可翻页/可切图表”时调用；取数本身由面板内的
      // /api/query-contract/run 按参数化方式完成（不经 LLM）。这里只负责“开面板”，不做数据执行。
      if (fullName === 'data_query_view') {
        return await openDataViewFromArgs(args);
      }
      // E12: ask_user —— 弹出反问对话框，await 用户回答后再继续（暂停 ReAct 循环）
      if (fullName === 'ask_user') {
        const q = String((args as Record<string, unknown>).question || '');
        if (!q) return { ok: false, msg: 'ask_user 缺少 question 参数' };
        const askSignal = abortControllers.get(currentConvId.value || '')?.signal;
        return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
          if (askSignal?.aborted) { resolve({ ok: false, msg: '用户已终止' }); return; }
          const onAskAbort = () => {
            askSignal?.removeEventListener('abort', onAskAbort);
            pendingQuestion.value = null;
            resolve({ ok: false, msg: '用户已终止' });
          };
          askSignal?.addEventListener('abort', onAskAbort);
          pendingQuestion.value = {
            question: q,
            options: Array.isArray((args as Record<string, unknown>).options)
              ? ((args as Record<string, unknown>).options as unknown[]).map(String)
              : undefined,
            multiSelect: !!(args as Record<string, unknown>).multiSelect,
            allowSupplement: (args as Record<string, unknown>).allowSupplement !== false,
            resolve: (answer: string, supplement?: string) => {
              askSignal?.removeEventListener('abort', onAskAbort);
              pendingQuestion.value = null;
              const result = supplement
                ? `${answer}\n\n补充说明：${supplement}`
                : answer;
              resolve({ ok: true, result });
            },
          };
        });
      }
      // E12b: confirm_user —— 多页确认向导，逐页收集回答与补充说明
      if (fullName === 'confirm_user') {
        const rawArgs = args as Record<string, unknown>;
        const rawPages = Array.isArray(rawArgs.pages) ? (rawArgs.pages as Record<string, unknown>[]) : [];
        if (rawPages.length === 0) return { ok: false, msg: 'confirm_user 缺少 pages 参数' };
        const pages: ConfirmationPage[] = rawPages.map((p, index) => {
          const question = String(p.question || '');
          return {
            question,
            description: p.description != null ? String(p.description) : undefined,
            options: Array.isArray(p.options) ? p.options.map(String) : undefined,
            multiSelect: !!p.multiSelect,
            allowText: p.allowText !== false,
            allowSupplement: p.allowSupplement !== false,
            required: !!p.required,
          };
        });
        if (pages.some((p) => !p.question.trim())) {
          return { ok: false, msg: 'confirm_user 每个 page 都必须包含 question' };
        }
        const confirmSignal = abortControllers.get(currentConvId.value || '')?.signal;
        return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
          if (confirmSignal?.aborted) { resolve({ ok: false, msg: '用户已终止' }); return; }
          const onConfirmAbort = () => {
            confirmSignal?.removeEventListener('abort', onConfirmAbort);
            pendingConfirmation.value = null;
            resolve({ ok: false, msg: '用户已终止' });
          };
          confirmSignal?.addEventListener('abort', onConfirmAbort);
          pendingConfirmation.value = {
            title: String(rawArgs.title || '用户确认'),
            pages,
            index: 0,
            answers: [],
            resolve: (result) => {
              confirmSignal?.removeEventListener('abort', onConfirmAbort);
              pendingConfirmation.value = null;
              resolve({ ok: true, result });
            },
          };
        });
      }
      // E12: task_plan —— 创建/替换任务计划，渲染进度卡片
      if (fullName === 'task_plan') {
        const steps = Array.isArray((args as Record<string, unknown>).steps)
          ? ((args as Record<string, unknown>).steps as any[])
          : [];
        planTitle.value = String((args as Record<string, unknown>).title || '任务计划');
        planSteps.value = steps
          .filter((s: any) => s && s.title)
          .map((s: any) => ({
            id: uid(),
            title: String(s.title),
            description: s.description ? String(s.description) : undefined,
            status: 'pending' as PlanStepStatus,
          }));
        return { ok: true, result: `已创建任务计划「${planTitle.value}」，共 ${planSteps.value.length} 步` };
      }
      // E12: task_step —— 更新某一步状态，刷新进度卡片
      if (fullName === 'task_step') {
        const idx = Number((args as Record<string, unknown>).index);
        const status = String((args as Record<string, unknown>).status || 'done') as PlanStepStatus;
        const note = (args as Record<string, unknown>).note != null ? String((args as Record<string, unknown>).note) : undefined;
        if (!Number.isFinite(idx) || idx < 1 || idx > planSteps.value.length) {
          return { ok: false, msg: `task_step 的 index 超出范围（1-${planSteps.value.length}）` };
        }
        const step = planSteps.value[idx - 1];
        if (step) {
          step.status = status;
          if (note !== undefined) step.note = note;
        }
        return { ok: true, result: `已更新第 ${idx} 步状态为 ${status}` };
      }
      const res = await registry.execute(fullName, args as Record<string, unknown>);
      const text = res.content?.[0]?.text ?? '';
      // E11: browser_* 工具执行后推送步骤日志到浏览器面板
      if (fullName.startsWith('browser_')) {
        browserSteps.value.push({ action: fullName, result: text, time: Date.now() });
      }
      return { ok: !res.isError, result: text, msg: res.isError ? text : undefined };
    }

    return { ok: false, msg: '未知工具: ' + fullName };
  }

  /** image_analyze 实际执行：优先 vision 模型，降级服务端 OCR */
  async function runImageAnalyze(args: { path?: string; prompt?: string; platformId?: string; modelId?: string }): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    const imgPath = args.path;
    if (!imgPath) return { ok: false, msg: 'path 为必填项' };
    const prompt = args.prompt || '请详细描述这张图片的内容，包括其中的文字、物体、场景等信息。';

    const { fs } = getPlatformAdapter();
    const exists = await fs.exists(imgPath).catch(() => false);
    if (!exists) return { ok: false, msg: '图片不存在: ' + imgPath };

    const ext = imgPath.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
    const mime = mimeMap[ext];
    if (!mime) return { ok: false, msg: `不支持的图片格式 .${ext}（支持 png/jpg/jpeg/gif/webp/bmp）` };

    let base64: string;
    try {
      base64 = await fs.readFileBase64(imgPath);
    } catch (e: any) {
      return { ok: false, msg: '读取图片失败: ' + (e?.message || e) };
    }

    const { usePlatformStore } = await import('./platform');
    const platformStore = usePlatformStore();
    let platform: Platform | undefined;
    let model: Model | undefined;

    if (args.platformId && args.modelId) {
      platform = platformStore.platforms.find((p) => p.id === args.platformId);
      model = platformStore.models.find((m) => m.id === args.modelId && m.platformId === args.platformId);
      if (model && !(model.capabilities || []).includes('vision')) {
        return { ok: false, msg: `模型 ${model.modelId} 不支持 vision（capabilities 未含 vision）` };
      }
    } else {
      const conv = conversations.value.find((c) => c.id === currentConvId.value);
      if (conv?.platformId && conv?.modelId) {
        const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
        if (resolved && (resolved.capabilities || []).includes('vision')) {
          platform = platformStore.platforms.find((p) => p.id === conv.platformId);
          model = resolved;
        }
      }
      if (!model) {
        const visionModel = platformStore.models.find((m) => m.enabled && (m.capabilities || []).includes('vision'));
        if (visionModel) {
          model = visionModel;
          platform = platformStore.platforms.find((p) => p.id === visionModel.platformId);
        }
      }
    }

    if (platform && model) {
      try {
        const client = new LlmClient(platform, model);
        const text = await client.visionAnalyze(base64, mime, prompt);
        return { ok: true, result: text || '(模型返回空)' };
      } catch (e: any) {
        // vision 失败，继续降级 OCR
        console.warn('[image_analyze] vision 失败，降级 OCR:', e?.message || e);
      }
    }

    try {
      const r = await api.post<any>('/tools/ocr', { image: base64, lang: 'chi_sim+eng' });
      if ('error' in r) return { ok: false, msg: r.error };
      const text = r.data?.text || '';
      const note = platform && model ? '' : '\n\n[注: 未配置可用的 vision 模型，使用 OCR 降级，仅提取文字]';
      return { ok: true, result: (text || '(OCR 未识别到文字)') + note };
    } catch (e: any) {
      return { ok: false, msg: '图片识别失败（vision 与 OCR 均不可用）: ' + (e?.message || e) };
    }
  }

  function getMaxReActSteps(): number {
    const agentStore = useAgentStore();
    const agent = agentStore.selectedAgent;
    const steps = agent?.config?.maxReActSteps;
    if (typeof steps === 'number' && steps >= 100) return steps;
    return 100; // 默认 100，低于 100 的旧配置值也兜底到 100
  }

  /** 订阅后端任务 SSE 事件流，更新前端消息状态。callLlm 和重连均使用此函数。 */
  async function subscribeTaskSse(
    convId: string,
    taskId: string,
    signal: AbortSignal,
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
    since: number = 0,
  ): Promise<void> {
    const token = localStorage.getItem('auth_token') || '';
    const sseRes = await fetch(`${API_BASE}/llm/tasks/${taskId}/stream?since=${since}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!sseRes.ok || !sseRes.body) throw new Error('SSE 连接失败');

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantMsgId = '';
    const subAgentMsgIds = new Map<string, string>(); // subAgentId → assistantMsgId
    const executedToolCallIds = new Set<string>(); // tool:execute 去重（重放时跳过已执行）

    // 流式 chunk 节流：缓冲增量，每 ~50ms 批量提交到 Vue 响应式状态，避免高频重渲染闪烁
    const chunkBuffer = new Map<string, { content: string; reasoning: string }>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleFlush(convId: string) {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const arr = messagesByConv.value[convId];
        if (!arr) return;
        for (const [msgId, buf] of chunkBuffer) {
          const idx = arr.findIndex(m => m.id === msgId);
          if (idx < 0) continue;
          if (buf.content) arr[idx].content = (arr[idx].content || '') + buf.content;
          if (buf.reasoning) arr[idx].reasoningContent = (arr[idx].reasoningContent || '') + buf.reasoning;
        }
        chunkBuffer.clear();
      }, 50);
    }
    function flushNow(convId: string) {
      if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
      const arr = messagesByConv.value[convId];
      if (!arr) { chunkBuffer.clear(); return; }
      for (const [msgId, buf] of chunkBuffer) {
        const idx = arr.findIndex(m => m.id === msgId);
        if (idx < 0) continue;
        if (buf.content) arr[idx].content = (arr[idx].content || '') + buf.content;
        if (buf.reasoning) arr[idx].reasoningContent = (arr[idx].reasoningContent || '') + buf.reasoning;
      }
      chunkBuffer.clear();
    }

    for (;;) {
      const { done, value } = await reader.read();
      if (done) { flushNow(convId); break; }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const raw of events) {
        const line = raw.trim();
        if (!line.startsWith('data: ')) continue;
        let event: any;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        // 追踪事件数（重连时作为 since 参数，避免重放旧事件）
        taskEventCounts.set(taskId, (taskEventCounts.get(taskId) || 0) + 1);

        switch (event.type) {
          case 'connected': break;
          case 'message:added': {
            const msg = event.message;
            const arr = messagesByConv.value[convId] || [];
            if (!arr.some(m => m.id === msg.id)) {
              arr.push({
                id: msg.id, conversationId: convId, role: msg.role,
                content: msg.content || '', toolCallId: msg.toolCallId,
                parentToolCallId: msg.parentToolCallId,
                reasoningContent: msg.role === 'assistant' ? '' : undefined,
                toolCalls: msg.role === 'assistant' ? [] : undefined,
                systemPromptSnapshot: msg.systemPromptSnapshot,

                subAgentId: msg.subAgentId,
                subAgentName: msg.subAgentName,
                subAgentDepth: msg.subAgentDepth,
                createdAt: Date.now(),
              } as any);
            }
            if (msg.role === 'assistant') {
              if (msg.subAgentId) subAgentMsgIds.set(msg.subAgentId, msg.id);
              else assistantMsgId = msg.id;
            }
            break;
          }
          case 'chunk': {
            if (event.content || event.reasoning) {
              const arr = messagesByConv.value[convId] || [];
              const targetId = event.subAgentId ? subAgentMsgIds.get(event.subAgentId) : assistantMsgId;
              const idx = targetId ? arr.findIndex(m => m.id === targetId) : arr.length - 1;
              if (idx >= 0 && arr[idx].role === 'assistant') {
                const msgId = arr[idx].id;
                const buf = chunkBuffer.get(msgId) || { content: '', reasoning: '' };
                if (event.content) buf.content += event.content;
                if (event.reasoning) buf.reasoning += event.reasoning;
                chunkBuffer.set(msgId, buf);
                scheduleFlush(convId);
              }
            }
            if (onChunk && !event.subAgentId) onChunk({ content: event.content, reasoning: event.reasoning });
            break;
          }
          case 'tool_call': {
            flushNow(convId);
            const targetId = event.subAgentId ? subAgentMsgIds.get(event.subAgentId) : assistantMsgId;
            if (targetId) {
              const arr = messagesByConv.value[convId] || [];
              const idx = arr.findIndex(m => m.id === targetId);
              if (idx >= 0) arr[idx].toolCalls = event.toolCalls;
            }
            break;
          }
          case 'message:updated': {
            flushNow(convId);
            const arr = messagesByConv.value[convId] || [];
            const idx = arr.findIndex(m => m.id === event.messageId);
            if (idx >= 0) {
              arr[idx] = {
                ...arr[idx],
                content: event.content ?? arr[idx].content,
                reasoningContent: event.reasoning ?? arr[idx].reasoningContent,
                toolCalls: event.toolCalls ?? arr[idx].toolCalls,
              };
            }
            break;
          }
          case 'tool:start': {
            // 仅浏览器类工具推送步骤日志，避免非浏览器工具污染右侧浏览器面板
            if (event.toolName?.startsWith('browser_')) {
              browserSteps.value.push({ action: event.toolName, result: '执行中...', time: Date.now() });
            }
            break;
          }
          case 'tool:result': {
            if (event.toolName?.startsWith('browser_')) {
              browserSteps.value.push({ action: event.toolName, result: event.result, time: Date.now() });
            }
            break;
          }
          case 'sub_agent:start': {
            if (event.parentToolCallId) runningToolCallIds.value.add(event.parentToolCallId);
            break;
          }
          case 'sub_agent:end': {
            if (event.parentToolCallId) runningToolCallIds.value.delete(event.parentToolCallId);
            if (event.agentId) subAgentMsgIds.delete(event.agentId);
            break;
          }
          case 'tool:execute': {
            const { callId, toolName, args, toolCallId: ptcId, depth: evtDepth } = event;
            // 去重：重放时跳过已执行的 tool:execute（避免重复调工具/弹窗）
            if (executedToolCallIds.has(callId)) break;
            executedToolCallIds.add(callId);
            const ctx = ptcId ? { parentToolCallId: ptcId, depth: evtDepth ?? 1 } : undefined;
            try {
              const r = await dispatchToolCall(toolName, args, ctx);
              const resultStr = r.ok
                ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result || ''))
                : (r.msg || '工具执行失败');
              const t = localStorage.getItem('auth_token') || '';
              const postResult = async (retry = 0) => {
                try {
                  const resp = await fetch(`${API_BASE}/llm/tasks/${taskId}/tool-result`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
                    body: JSON.stringify({ callId, result: resultStr }),
                  });
                  if (!resp.ok && retry < 2) { await new Promise(r => setTimeout(r, 1000)); return postResult(retry + 1); }
                } catch (e: any) {
                  if (retry < 2) { await new Promise(r => setTimeout(r, 1000)); return postResult(retry + 1); }
                  console.error('[Chat] tool-result POST 失败:', e?.message || e);
                }
              };
              void postResult();
            } catch (e: any) {
              const t = localStorage.getItem('auth_token') || '';
              const postError = async (retry = 0) => {
                try {
                  const resp = await fetch(`${API_BASE}/llm/tasks/${taskId}/tool-result`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
                    body: JSON.stringify({ callId, result: `工具执行失败: ${e?.message || e}` }),
                  });
                  if (!resp.ok && retry < 2) { await new Promise(r => setTimeout(r, 1000)); return postError(retry + 1); }
                } catch (e2: any) {
                  if (retry < 2) { await new Promise(r => setTimeout(r, 1000)); return postError(retry + 1); }
                  console.error('[Chat] tool-error POST 失败:', e2?.message || e2);
                }
              };
              void postError();
            }
            break;
          }
          case 'file:registered': {
            try { await useFileStore().loadConversationFiles(event.conversationId || convId); } catch {}
            break;
          }
          case 'task:completed': flushNow(convId); return;
          case 'task:aborted': flushNow(convId); return;
          case 'task:error': flushNow(convId); throw new Error(event.error || '任务执行失败');
        }
      }
    }
  }

  /** 检查会话是否有未完成的后端任务，如有则重新订阅 SSE 恢复流式输出。 */
  async function reconnectActiveTask(convId: string): Promise<void> {
    if (!isServerMode()) return;
    if (runningConvIds.value.has(convId)) return;
    try {
      const r = await api.get<any[]>(`/llm/tasks/active?conversationId=${convId}`);
      if ('error' in r || !r.data || r.data.length === 0) return;
      const task = r.data[0];
      const taskId = task.id;
      taskIds.set(convId, taskId);
      runningConvIds.value.add(convId);
      const abortController = new AbortController();
      abortControllers.set(convId, abortController);
      void (async () => {
        try {
          const since = taskEventCounts.get(taskId) || 0;
          await subscribeTaskSse(convId, taskId, abortController.signal, undefined, since);
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
          console.error('[Chat] 重连 SSE 失败:', e);
        } finally {
          abortControllers.delete(convId);
          taskIds.delete(convId);
          runningConvIds.value.delete(convId);
        }
      })();
    } catch (e) {
      console.error('[Chat] 检查活动任务失败:', e);
    }
  }

  async function callLlm(
    platform: Platform,
    model: Model,
    options: {
      userContent?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      reasoningEffort?: string;
    },
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
  ): Promise<void> {
    const convId = currentConvId.value;
    if (!convId) throw new Error('未选择会话');
    if (runningConvIds.value.has(convId)) return;

    runningConvIds.value.add(convId);
    const abortController = new AbortController();
    abortControllers.set(convId, abortController);

    try {
      // 单一事实来源：后端统一构建 systemPrompt + tools（含 agent/会话级挂载、原生/文本模式区分）。
      // 前端只传 agentId/appGuide 等参数，不再自建提示词与工具表（避免双轨不一致）。
      const conv = conversations.value.find(c => c.id === convId);
      const agent = activeAgent();
      const appSettings = useSettingsStore().settings;
      const appGuide = appSettings.appGuide;
      const maxSteps = getMaxReActSteps();

      const taskRes = await api.post<any>('/llm/tasks', {
        conversationId: convId,
        platformId: platform.id,
        modelId: model.id,
        userContent: options.userContent,
        agentId: conv?.agentId || agent?.id || null,
        // 智能体本体挂载：随任务下发（智能体编辑存本地库，server 端按此收敛取数范围）
        ontologyIds: agent?.ontologyIds?.length ? agent.ontologyIds : undefined,
        appGuide,
        // 记忆抽取/压缩前抢救用的模型（设置页配置；留空则后端回退任务自身模型）
        memoryExtractPlatformId: appSettings.memoryExtractPlatformId || undefined,
        memoryExtractModelId: appSettings.memoryExtractModelId || undefined,
        maxSteps,
        // 显式下发工作目录：后端优先使用此值注入 system prompt，避免多会话/多项目并发时全局单例互相覆盖
        workspaceDir: appSettings.workspaceDir || undefined,
        modeFlags: {
          thinking: thinkingMode.value,
          plan: planMode.value,
          answerOnly: answerOnly.value,
        },
        options: {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          reasoningEffort: options.reasoningEffort,
        },
      });
      if ('error' in taskRes) throw new Error(taskRes.error);
      const taskId = taskRes.data.taskId;
      taskIds.set(convId, taskId);

      await subscribeTaskSse(convId, taskId, abortController.signal, onChunk);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Chat] 发送失败:', e);
      throw e;
    } finally {
      abortControllers.delete(convId);
      taskIds.delete(convId);
      runningConvIds.value.delete(convId);
    }
  }

  async function sendMessage(
    userContent: string,
    platform: Platform,
    model: Model,
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
    options?: { temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string },
  ): Promise<void> {
    return callLlm(platform, model, { userContent, ...options }, onChunk);
  }

  function stop(convId?: string) {
    const target = convId || currentConvId.value;
    if (!target) return;
    const controller = abortControllers.get(target);
    if (controller) controller.abort();
    // 终止后端任务
    const taskId = taskIds.get(target);
    if (taskId) {
      const token = localStorage.getItem('auth_token') || '';
      void fetch(`${API_BASE}/llm/tasks/${taskId}/abort`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    if (pendingPlatformConfig.value) {
      cancelPlatformConfig();
    }
  }

  async function ensureMcpConnections() {
    const mcpStore = useMcpStore();
    for (const sid of mountedMcpServers.value) {
      const result = await mcpStore.connect(sid);
      if (!result.ok) {
        console.warn('[Chat] MCP 连接失败:', sid, result.msg);
      }
    }
  }

  async function regenerate(
    platform: Platform,
    model: Model,
    onChunk?: (chunk: { content?: string; reasoning?: string }) => void,
    options?: { temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; reasoningEffort?: string },
  ): Promise<void> {
    if (!currentConvId.value) throw new Error('未选择会话');
    const lastAssistant = [...currentMessages.value].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      await deleteMessage(lastAssistant.id);
    }
    return callLlm(platform, model, { ...options }, onChunk);
  }

  return {
    conversations, currentMessages, streaming, currentConvId, mountedMcpServers, mcpDisabledTools, mcpToolAliases,
    runningConvIds, isConvStreaming,
    runningToolCallIds, isToolCallRunning,
    browserSteps, rightPanelOpen, thinkingMode, planMode, answerOnly,
    permissionMode, setPermissionMode,
    showFilePopup, previewingFile, rightPanelTab, currentBrowserUrl, skipNextRecordVisit,
    previewTabs, activeTabId, activeTab,
    openTab, activatePreviewTab, closePreviewTab, closeAllPreviewTabs, closePreviewTabsLeft, closePreviewTabsRight,
    pendingQuestion, pendingConfirmation, pendingPlatformConfig, submitPendingQuestion,
    submitPendingConfirmation, skipPendingConfirmation, cancelPendingConfirmation,
    submitPlatformConfig, cancelPlatformConfig,
    planSteps, planTitle, clearPlan,
    activeAgent, activeAgentId,
    loadConversations, loadMessages, createConversation, updateConversation, deleteConversation, deleteConversations,
    addMessage, updateMessage, deleteMessage, sendMessage, regenerate, stop,
    getMergedMounts,
  };
});

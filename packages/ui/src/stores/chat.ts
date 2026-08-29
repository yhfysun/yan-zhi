// 聊天 store
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Conversation, Message, Platform, Model, DeltaToolCall } from '@yan-zhi/shared';
import { getPlatformAdapter, LlmClient, ContextWindow, getToolRegistry } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { useMcpStore } from './mcp';
import { useAgentStore } from './agent';
import { useSkillStore } from './skill';
import { useToolsStore } from './tools';
import { useSettingsStore } from './settings';
import { api } from '../api/client';
import { useAuthStore } from './auth';

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
    systemPrompt: r.system_prompt,
    pinned: !!r.pinned,
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
  const mountedMcpServers = ref<string[]>([]);
  const mcpDisabledTools = ref<Record<string, string[]>>({});
  const mcpToolAliases = ref<Record<string, Record<string, string>>>({});
  // E11: 浏览器面板步骤日志 —— dispatchToolCall 中 browser_* 工具执行后推送
  const browserSteps = ref<Array<{ action: string; result: string; time: number }>>([]);
  // 右侧预览面板是否展开；默认收起（初始无预览内容，选文件/Agent开浏览器时自动展开）
  const rightPanelOpen = ref(false);
  // 文件管理弹窗（el-dialog）是否显示——左侧栏「文件管理」按钮触发
  const showFilePopup = ref(false);
  // 右侧预览面板（即"预览窗口"）当前展示内容：'file' = 文件预览，'browser' = 网站/Agent页面预览
  const rightPanelTab = ref<'file' | 'browser'>('file');
  // 右侧预览面板正在预览的文件（点击文件管理弹窗中的文件后设置）
  const previewingFile = ref<{ name: string; path: string } | null>(null);
  // 右侧预览面板当前网站 tab 标题的原始 URL（BrowserPanel 写入），用于在 tab header 上展示「真实打开的网站名」
  const currentBrowserUrl = ref('');
  // 三层记忆缓存（异步预取）：callLlm 前刷新，buildSystemPrompt 同步拼接注入
  const memoryContext = ref('');
  // 知识库命中缓存（异步预取，不登录/登录都可用）：命中知识片段注入 prompt
  const knowledgeContext = ref('');
  // 会话轮数计数：每满固定轮数触发一次记忆抽取（用户无感知）
  const conversationTurnCount = ref(0);

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

  const isServerMode = () => !!useAuthStore().isLoggedIn;

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
      return;
    }
    const adapter = getPlatformAdapter();
    const rows = await adapter.db.query<any>(
      'SELECT * FROM message WHERE conversation_id = ? ORDER BY created_at ASC',
      [convId],
    );
    messagesByConv.value[convId] = rows.map(rowToMsg);
    const conv = conversations.value.find((c) => c.id === convId);
    mountedMcpServers.value = conv?.mcpServerIds || [];
    mcpDisabledTools.value = conv?._mcpDisabledTools ? { ...conv._mcpDisabledTools } : {};
    mcpToolAliases.value = conv?._mcpToolAliases ? JSON.parse(JSON.stringify(conv._mcpToolAliases)) : {};
  }

  async function createConversation(title: string, opts?: { platformId?: string; modelId?: string; skillIds?: string[]; spaceId?: string }): Promise<string> {
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
      'INSERT INTO conversation (id, title, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, opts?.platformId || null, opts?.modelId || null, spaceId || null, '[]', skillIdsJson, 0, ts, ts],
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
      if (patch.systemPrompt !== undefined) body.systemPrompt = patch.systemPrompt;
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
    await adapter.db.exec(
      'INSERT INTO message (id, conversation_id, role, content, tool_calls_json, tool_call_id, reasoning_content, system_prompt_snapshot, tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id, targetConvId, msg.role, msg.content || null,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.toolCallId || null, msg.reasoningContent || null,
        msg.systemPromptSnapshot || null,
        msg.tokens || 0, ts,
      ],
    );
    await adapter.db.exec('UPDATE conversation SET updated_at = ? WHERE id = ?', [ts, targetConvId]);
    (messagesByConv.value[targetConvId] ||= []).push({ ...msg, id, createdAt: ts });
    return id;
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
      builtinToolIds: [...new Set([...agentBuiltin])],
      customToolIds: [...new Set([...agentCustom])],
      mcpToolMounts: mergedMcp,
      skillIds: [...new Set([...agentSkills, ...convSkills])],
      subAgentIds: [...new Set([...agentSubs])],
    };
  }

  // ============ 工具命名与分发（A 组重构：内置裸名 / MCP shortId / 自定义 id 化） ============

  // 工具名合法性：仅允许 [a-zA-Z0-9_-]，长度 1-64（A6）
  const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
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

  /** 统一工具调用分发（A4 分发顺序）：
   *  1) mcp_{shortId}__{toolName} → MCP callTool
   *  2) custom_{idTag}_{name}     → 服务端沙箱 /api/tools/:id/execute（沙箱依赖 node:vm，仅服务端可用）
   *  3) 裸名                       → ToolRegistry.execute（内置工具，经平台适配器执行）
   *  重名不误路由：三类前缀互斥，裸名不得以 mcp_/custom_ 开头。 */
  async function dispatchToolCall(fullName: string, args: unknown): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    const mcpStore = useMcpStore();
    const registry = getToolRegistry();

    // 1) MCP 工具
    if (fullName.startsWith(MCP_PREFIX) && fullName.includes('__')) {
      const parsed = parseMcpToolName(fullName);
      if (!parsed) return { ok: false, msg: '无法解析 MCP 工具或工具不存在: ' + fullName };
      return mcpStore.callTool(parsed.serverId, parsed.toolName, args);
    }

    // 2) 自定义工具（服务端 node:vm 沙箱执行）
    if (fullName.startsWith(CUSTOM_PREFIX)) {
      const parsed = parseCustomToolName(fullName);
      if (!parsed) return { ok: false, msg: '无法解析自定义工具: ' + fullName };
      if (!isServerMode()) {
        return { ok: false, msg: '自定义工具需登录服务端执行（沙箱依赖 Node 运行时）' };
      }
      const r = await api.post<any>(`/tools/${parsed.id}/execute`, { args });
      if ('error' in r) return { ok: false, msg: r.error };
      return { ok: true, result: r.data };
    }

    // 3) 内置工具裸名（经 ToolRegistry + 平台适配器执行）
    if (registry.has(fullName)) {
      if (fullName.startsWith(MCP_PREFIX) || fullName.startsWith(CUSTOM_PREFIX)) {
        return { ok: false, msg: '内置工具名与保留前缀冲突: ' + fullName };
      }
      // B 方案：智能体调 browser_navigate 时，桌面端桥接到预览面板的 BrowserView（共用同一浏览器）。
      // 通过 store.currentBrowserUrl 命令 BrowserPanel 导航，模型打开的页面在预览面板同步显示。
      if (fullName === 'browser_navigate') {
        const isElectronDesktop = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
        const rawUrl = String((args as Record<string, unknown>).url || '').trim();
        if (isElectronDesktop) {
          if (!rawUrl) return { ok: false, msg: 'browser_navigate 缺少 url 参数' };
          // 规范化：非 http 开头补 https://（与 BrowserPanel 一致）
          const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;
          rightPanelOpen.value = true;
          rightPanelTab.value = 'browser';
          currentBrowserUrl.value = target; // BrowserPanel watch 到后 openSite 导航
          browserSteps.value.push({ action: 'browser_navigate', result: `已在预览面板打开 ${target}`, time: Date.now() });
          return { ok: true, result: `已在预览浏览器打开 ${target}` };
        }
        // Web 端/非桌面：走 registry.execute（服务端 Playwright），逻辑不变
      }
      // E7: call_agent 特殊拦截 —— 委派给子智能体执行
      if (fullName === 'call_agent') {
        return runSubAgent(args as { agentId?: string; input?: string });
      }
      // E7b: list_sub_agents 拦截 —— 返回当前智能体可调用的子智能体列表（id/名称/描述/工具）
      if (fullName === 'list_sub_agents') {
        const merged = getMergedMounts();
        const agentStore = useAgentStore();
        const list = merged.subAgentIds.map((id) => {
          const sub = agentStore.agents.find((a) => a.id === id);
          if (!sub) return `- id: \`${id}\`（该子智能体已被删除）`;
          const tools = [...(sub.builtinToolIds || []), ...(sub.customToolIds || [])];
          return `- **${sub.name}** (id: \`${id}\`): ${sub.description || ''}\n  挂载工具: ${tools.length ? tools.join(', ') : '无'}`;
        });
        return { ok: true, result: list.length ? list.join('\n') : '当前智能体未挂载任何子智能体' };
      }
      // image_analyze 拦截 —— 优先 vision 多模态模型，降级服务端 Tesseract OCR
      if (fullName === 'image_analyze') {
        return runImageAnalyze(args as { path?: string; prompt?: string; platformId?: string; modelId?: string });
      }
      // E12: ask_user —— 弹出反问对话框，await 用户回答后再继续（暂停 ReAct 循环）
      if (fullName === 'ask_user') {
        const q = String((args as Record<string, unknown>).question || '');
        if (!q) return { ok: false, msg: 'ask_user 缺少 question 参数' };
        return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
          pendingQuestion.value = {
            question: q,
            options: Array.isArray((args as Record<string, unknown>).options)
              ? ((args as Record<string, unknown>).options as unknown[]).map(String)
              : undefined,
            multiSelect: !!(args as Record<string, unknown>).multiSelect,
            allowSupplement: (args as Record<string, unknown>).allowSupplement !== false,
            resolve: (answer: string, supplement?: string) => {
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
        return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
          pendingConfirmation.value = {
            title: String(rawArgs.title || '用户确认'),
            pages,
            index: 0,
            answers: [],
            resolve: (result) => resolve({ ok: true, result }),
          };
        });
      }
      // E12c: configure_model_platform —— 弹出平台/模型配置表单，await 用户保存后再继续（暂停 ReAct 循环）
      if (fullName === 'configure_model_platform') {
        const raw = args as Record<string, unknown>;
        return await new Promise<{ ok: boolean; result?: unknown; msg?: string }>((resolve) => {
          pendingPlatformConfig.value = {
            prefill: {
              name: raw.name != null ? String(raw.name) : undefined,
              protocol: raw.protocol === 'anthropic' || raw.protocol === 'custom' || raw.protocol === 'openai' ? raw.protocol : undefined,
              apiUrl: raw.apiUrl != null ? String(raw.apiUrl) : undefined,
              apiKey: raw.apiKey != null ? String(raw.apiKey) : undefined,
              modelId: raw.modelId != null ? String(raw.modelId) : undefined,
              alias: raw.alias != null ? String(raw.alias) : undefined,
              contextWindow: raw.contextWindow != null ? Number(raw.contextWindow) : undefined,
            },
            resolve: (result) => {
              if (result.cancelled) {
                resolve({ ok: false, msg: result.message || '用户取消配置' });
              } else {
                resolve({
                  ok: true,
                  result: result.message || JSON.stringify({
                    platformId: result.platformId,
                    modelId: result.modelId,
                  }),
                });
              }
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

  /** E7: 运行子智能体（call_agent 的实际执行逻辑）—— 递归 LLM ReAct 循环，带 callStack 防递归 */
  const subAgentCallStack = ref<string[]>([]);
  async function runSubAgent(args: { agentId?: string; input?: string }): Promise<{ ok: boolean; result?: unknown; msg?: string }> {
    const agentId = args.agentId;
    const input = args.input;
    if (!agentId) return { ok: false, msg: 'agentId 为必填项' };
    if (!input) return { ok: false, msg: 'input 为必填项' };
    // 防递归：callStack 深度限制
    if (subAgentCallStack.value.length >= 3) {
      return { ok: false, msg: '子智能体调用深度超限（最多 3 层）' };
    }
    if (subAgentCallStack.value.includes(agentId)) {
      return { ok: false, msg: '检测到循环调用，已终止' };
    }

    try {
      const { useAgentStore } = await import('./agent');
      const agentStore = useAgentStore();
      // 别名兜底：LLM 常用简写命名，归一化到内置 pageAgent 的正式 ID
      const SUBAGENT_ALIASES: Record<string, string> = {
        pageAgent: 'a_builtin_page_agent',
        page_agent: 'a_builtin_page_agent',
        pageagent: 'a_builtin_page_agent',
      };
      const resolvedId = SUBAGENT_ALIASES[agentId] || agentId;
      const subAgent = agentStore.agents.find((a) => a.id === resolvedId);
      if (!subAgent) return { ok: false, msg: '子智能体不存在: ' + agentId + '（可调用 list_sub_agents 工具查询可用子智能体及其 ID）' };

      // 获取当前会话的平台和模型
      const conv = conversations.value.find((c) => c.id === currentConvId.value);
      const platformId = subAgent.platformId || conv?.platformId;
      const modelId = subAgent.modelId || conv?.modelId;
      if (!platformId || !modelId) {
        return { ok: false, msg: '子智能体未配置平台/模型，无法执行' };
      }
      const { usePlatformStore } = await import('./platform');
      const platformStore = usePlatformStore();
      const resolved = platformStore.resolveModel(modelId, platformId);
      if (!resolved) return { ok: false, msg: '无法解析子智能体的模型配置' };
      const platform = platformStore.platforms.find((p) => p.id === platformId);
      if (!platform) return { ok: false, msg: '平台不存在' };

      // 临时切换挂载到子智能体的工具配置，运行简化 ReAct 循环
      subAgentCallStack.value.push(agentId);
      try {
        const result = await runSubAgentLlm(subAgent, input, platform, resolved);
        return { ok: true, result: result };
      } finally {
        subAgentCallStack.value.pop();
      }
    } catch (e: any) {
      return { ok: false, msg: '子智能体执行失败: ' + (e?.message || e) };
    }
  }

  /** 子智能体 LLM 循环：用子智能体的 systemPrompt + 挂载工具运行有限步 ReAct */
  async function runSubAgentLlm(agent: any, input: string, platform: Platform, model: Model): Promise<string> {
    const registry = getToolRegistry();
    const maxSteps = agent.config?.maxReActSteps || 8;
    const client = new LlmClient(platform, model);

    // 构建子智能体的工具列表
    const subTools: unknown[] = [];
    const subBuiltinIds: string[] = agent.builtinToolIds || [];
    for (const name of subBuiltinIds) {
      if (!registry.has(name)) continue;
      // 递归调用自身用 call_agent 会在 dispatchToolCall 中拦截
      const def = registry.get(name)!;
      subTools.push({ type: 'function', function: { name, description: def.description, parameters: def.inputSchema } });
    }

    const messages: any[] = [
      { role: 'system', content: agent.systemPrompt || '你是一个智能助手。' },
      { role: 'user', content: input },
    ];

    for (let step = 0; step < maxSteps; step++) {
      const response = await client.chat(messages, {
        tools: subTools.length > 0 ? subTools : undefined,
        temperature: agent.temperature ?? 0.7,
        maxTokens: agent.maxTokens ?? 2048,
      });

      const content = response.delta?.content || '';
      const toolCalls = response.delta?.toolCalls || [];

      if (toolCalls.length > 0) {
        messages.push({ role: 'assistant', content, toolCalls });
        for (const tc of toolCalls) {
          const tcName = tc.function?.name || '';
          const tcArgs = typeof tc.function?.arguments === 'string' ? safeParseJson(tc.function.arguments) : {};
          const result = await dispatchToolCall(tcName, tcArgs);
          const resultStr = result.ok
            ? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result))
            : JSON.stringify({ error: result.msg || '工具执行失败' });
          messages.push({ role: 'tool', toolCallId: tc.id, content: resultStr });
        }
      } else {
        return content || '(无输出)';
      }
    }
    return '(已达最大步数)';
  }

  async function buildTools(): Promise<unknown[]> {
    const merged = getMergedMounts();
    const tools: unknown[] = [];
    const mcpStore = useMcpStore();
    const registry = getToolRegistry();
    const toolsStore = useToolsStore();
    const seen = new Set<string>(); // 去重：同一名工具不重复暴露

    // 1) 内置工具（裸名，且不得以 mcp_/custom_ 开头，避免与保留前缀路由冲突）（A1）
    for (const name of merged.builtinToolIds) {
      if (!registry.has(name)) continue;
      if (name.startsWith(MCP_PREFIX) || name.startsWith(CUSTOM_PREFIX)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const def = registry.get(name)!;
      tools.push({
        type: 'function',
        function: { name, description: def.description, parameters: def.inputSchema },
      });
    }

    // 2) MCP 工具（mcp_{shortId}__{toolName}，去双 mcp_ 前缀）（A3）
    for (const m of merged.mcpToolMounts) {
      const list = mcpStore.tools[m.serverId] || [];
      const shortId = mcpShortIdOf(m.serverId);
      for (const t of list) {
        if (m.toolName !== '*' && m.toolName !== t.name) continue;
        const exposedName = `${MCP_PREFIX}${shortId}__${t.name}`;
        if (!TOOL_NAME_RE.test(exposedName)) continue; // 非法名跳过（A6）
        if (seen.has(exposedName)) continue;
        seen.add(exposedName);
        tools.push({
          type: 'function',
          function: {
            name: exposedName,
            description: t.description || t.name,
            parameters: t.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
    }

    // 3) 自定义工具（custom_{id前8位}_{name}，按 id 反查分发，避免裸 name 重名）（A2）
    for (const id of merged.customToolIds) {
      const ct = toolsStore.customTools.find(t => t.id === id);
      if (!ct || !ct.enabled) continue;
      const exposedName = customToolExposedName(ct.id, ct.name);
      if (!TOOL_NAME_RE.test(exposedName)) continue; // 非法名跳过（A6）
      if (seen.has(exposedName)) continue;
      seen.add(exposedName);
      tools.push({
        type: 'function',
        function: {
          name: exposedName,
          description: ct.description || ct.name,
          parameters: ct.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
    return tools;
  }

  function buildToolsDescription(): string {
    const merged = getMergedMounts();
    const mcpStore = useMcpStore();
    const registry = getToolRegistry();
    const lines: string[] = [];

    // 内置工具（裸名，与 buildTools 暴露名保持一致）
    if (merged.builtinToolIds.length > 0) {
      const builtinLines: string[] = [];
      for (const name of merged.builtinToolIds) {
        if (!registry.has(name)) continue;
        if (name.startsWith(MCP_PREFIX) || name.startsWith(CUSTOM_PREFIX)) continue;
        builtinLines.push(`- \`${name}\`: ${registry.get(name)!.description}`);
      }
      if (builtinLines.length > 0) { lines.push('### 内置工具'); lines.push(...builtinLines); }
    }

    // MCP 工具（暴露名与 buildTools 一致：mcp_{shortId}__{toolName}，去双 mcp_ 前缀）
    for (const m of merged.mcpToolMounts) {
      const server = mcpStore.servers.find(s => s.id === m.serverId);
      const list = mcpStore.tools[m.serverId] || [];
      const enabled = m.toolName === '*' ? list : list.filter(t => t.name === m.toolName);
      if (enabled.length === 0) continue;
      const shortId = mcpShortIdOf(m.serverId);
      lines.push(`### ${server?.name || m.serverId}`);
      for (const t of enabled) {
        const desc = t.description || '';
        const shortDesc = desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
        lines.push(`- \`${MCP_PREFIX}${shortId}__${t.name}\`: ${shortDesc}`);
      }
    }

    // 自定义工具（暴露名与 buildTools 一致：custom_{id前8位}_{name}）
    if (merged.customToolIds.length > 0) {
      const toolsStore = useToolsStore(); // 顶部已 import，修复原 require('./tools') 在 ESM/Vite 下不可用的问题（A5）
      const customLines: string[] = [];
      for (const id of merged.customToolIds) {
        const ct = toolsStore.customTools.find(t => t.id === id);
        if (!ct) continue;
        customLines.push(`- \`${customToolExposedName(ct.id, ct.name)}\`: ${ct.description || ct.name}`);
      }
      if (customLines.length > 0) { lines.push('### 自定义工具'); lines.push(...customLines); }
    }

    return lines.length > 0 ? lines.join('\n') : '';
  }

  function buildSkillsDescription(): string {
    const merged = getMergedMounts();
    if (merged.skillIds.length === 0) return '';
    const skillStore = useSkillStore();
    const lines: string[] = [];
    for (const skId of merged.skillIds) {
      const sk = skillStore.skills.find(s => s.id === skId);
      if (!sk || !sk.enabled) continue;
      const desc = sk.frontmatter.description || sk.description || '';
      const shortDesc = desc.length > 100 ? desc.slice(0, 97) + '...' : desc;
      lines.push(`- **${sk.name}**: ${shortDesc}`);
    }
    return lines.length > 0 ? '可用 Skills（说出名称激活）:\n' + lines.join('\n') : '';
  }

  function buildSubAgentsDescription(): string {
    const merged = getMergedMounts();
    if (merged.subAgentIds.length === 0) return '';
    const agentStore = useAgentStore();
    const lines: string[] = [];
    for (const id of merged.subAgentIds) {
      const sub = agentStore.agents.find(a => a.id === id);
      if (!sub) continue;
      lines.push(`- **${sub.name}** (id: \`${id}\`): ${sub.description || ''}`);
    }
    return lines.length > 0 ? '可调用子智能体:\n' + lines.join('\n') : '';
  }

  /** 从服务端检索多层记忆（仅登录态可用；本地模式跳过）。返回格式化片段。
   *  注入每日/智能体记忆，以及「当前会话」的会话记忆（session 按当前会话过滤，不串台）。 */
  async function buildMemoryContext(): Promise<string> {
    if (!isServerMode()) return '';
    try {
      const agentId = encodeURIComponent(activeAgent()?.id || '');
      const cid = encodeURIComponent(currentConvId.value || '');
      const types = encodeURIComponent('daily,agent,session');
      // session 按当前会话过滤（服务端对 metadata.conversationId 匹配）
      const q = cid ? `/memory/recent?type=${types}&agentId=${agentId}&conversationId=${cid}&limit=20` : `/memory/recent?type=${types}&agentId=${agentId}&limit=20`;
      const r = await api.get<any>(q);
      const rows = (r && 'data' in r ? r.data : r) as Array<{ type: string; content: string; metadata_json?: string }>;
      if (!rows || rows.length === 0) return '';
      const labeled = rows.map((m) => {
        const label = m.type === 'daily' ? `[每日记忆]` : m.type === 'session' ? `[当前会话记忆]` : `[智能体记忆]`;
        return `${label} ${m.content}`;
      });
      return '---\n## 已知记忆（供参考，可能与当前问题不相关，按需使用）\n' + labeled.join('\n');
    } catch {
      return '';
    }
  }

  /** 从知识库检索命中片段（登录态走 server 跨库搜索，guest 走本地 cross-lib；命中注入 prompt） */
  async function buildKnowledgeContext(): Promise<string> {
    try {
      const lastUserMsg = [...(messagesByConv.value[currentConvId.value] || [])].reverse().find((m) => m.role === 'user');
      const query = (lastUserMsg?.content || '').trim();
      if (!query || query.length < 2) return '';
      let rows: Array<{ content: string; baseName?: string; entity?: string; hop?: number; reason?: string }> = [];
      // 知识库统一存服务端（guest 也走 server，服务端 guestOrAuth 以 guest 身份检索 public 库）
      try {
        // 优先实体导向多跳：问题匹配实体 → 取其切片 → 沿关联最多 3 级取关联实体切片
        const er = await api.get<any>(`/kb/entity-search?query=${encodeURIComponent(query.slice(0, 100))}&hops=3&topK=3`);
        rows = (er && 'data' in er ? er.data : er) || [];
      } catch {
        rows = [];
      }
      // 实体检索没结果则退化为关键词多跳
      if (!rows || rows.length === 0) {
        try {
          const r = await api.get<any>(`/kb/search-all?query=${encodeURIComponent(query.slice(0, 100))}&topK=5`);
          rows = (r && 'data' in r ? r.data : r) || [];
        } catch {
          rows = [];
        }
      }
      if (!rows || rows.length === 0) return '';
      const blocks = rows.map((r) => {
        const tag = r.baseName ? `（库：${r.baseName}）` : '';
        const ent = r.entity ? `[实体:${r.entity}]` : '';
        const hop = r.hop && r.hop > 1 ? `（${r.hop}级关联）` : '';
        return `- ${tag}${ent}${hop} ${(r.content || '').slice(0, 400)}`;
      });
      return '---\n## 知识库参考（命中内容，可能与问题相关）\n' + blocks.join('\n');
    } catch {
      return '';
    }
  }

  // ── 记忆抽取（LLM 抽取多层记忆 → 服务端落库）──
  const memoryExtractInFlight = ref(false);
  /** 解析记忆抽取模型：settings 配置优先，其次默认模型，最后回退本地小模型 */
  async function resolveExtractModel(): Promise<{ platform: any; model: any } | null> {
    const { usePlatformStore } = await import('./platform');
    const platformStore = usePlatformStore();
    const settingsStore = useSettingsStore();
    const pid = settingsStore.settings.memoryExtractPlatformId
      || settingsStore.settings.defaultPlatformId;
    const mid = settingsStore.settings.memoryExtractModelId
      || settingsStore.settings.defaultModelId;
    let platform: any = platformStore.platforms.find((p: any) => p.id === pid);
    let model: any = platformStore.resolveModel(mid || '', pid || '');

    return platform && model ? { platform, model } : null;
  }

  /** 抽取最近对话，沉淀为 daily/session/agent 三层记忆，服务端落库。幂等防并发。 */
  async function extractMemoryFromConversation(): Promise<void> {
    if (memoryExtractInFlight.value) return;
    if (!isServerMode()) return;
    const resolved = await resolveExtractModel();
    if (!resolved) return;
    const msgs = messagesByConv.value[currentConvId.value] || [];
    const recent = msgs.filter((m) => m.content || m.toolCalls?.length).slice(-20);
    if (recent.length < 4) return; // 对话太短无需抽取
    memoryExtractInFlight.value = true;
    try {
      const transcript = recent
        .map((m) => {
          const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
          return `【${role}】\n${m.content || (m.toolCalls?.length ? '(调用工具)' : '')}`;
        })
        .join('\n\n---\n\n');
      const client = new LlmClient(resolved.platform, resolved.model);
      const resp = await client.chat(
        [
          {
            role: 'system',
            content: '你是记忆抽取助手。从对话中抽取「值得长期记住的用户信息」，输出 JSON 数组，每项形如 {"type":"agent|session|daily","content":"一句话事实"}。agent=稳定的用户偏好/背景；daily=当天的重要事件/进展；session=本会话的上下文结论。只输出 JSON，不要解释。若没有值得记的返回 []。',
          },
          { role: 'user', content: transcript },
        ] as any,
        { temperature: 0.2, maxTokens: 800 },
      );
      const raw = resp.delta?.content || '';
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return;
      const items = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(items)) return;
      const agentId = activeAgent()?.id || '';
      const today = new Date().toISOString().slice(0, 10);
      for (const item of items) {
        const content = String(item?.content || '').trim();
        if (!content) continue;
        const t = String(item?.type || 'agent');
        if (t === 'daily') {
          await api.post('/memory/upsert-daily', { content, agentId, date: today }).catch(() => {});
        } else if (t === 'session') {
          await api.post('/memory/create', { content, type: 'session', agentId, metadata: { conversationId: currentConvId.value } }).catch(() => {});
        } else {
          await api.post('/memory/create', { content, type: 'agent', agentId }).catch(() => {});
        }
      }
    } catch {
      // 抽取失败静默，不影响主对话
    } finally {
      memoryExtractInFlight.value = false;
    }
  }

  function buildSystemPrompt(): string {
    const conv = conversations.value.find(c => c.id === currentConvId.value);
    const agent = activeAgent();
    const isHarness = !agent || !agent.type || agent.type === 'harness';
    const parts: string[] = [];

    if (conv?.systemPrompt) {
      parts.push(conv.systemPrompt);
    } else if (agent?.systemPrompt) {
      parts.push(agent.systemPrompt);
    }

    // 应用使用指南：命中用户问题关键字（怎么用/如何使用/用法/操作方法/ help/guide 等）时注入
    const lastUserMsg = [...(messagesByConv.value[currentConvId.value] || [])].reverse().find((m) => m.role === 'user');
    const userText = lastUserMsg?.content || '';
    const guideHit = /(怎么用|如何使用|用法|怎么使用|操作方法|使用说明|help|guide|workbuddy|yan-zhi|这个应用|这个软件|这个工具)/i.test(userText);
    if (guideHit) {
      const guide = useSettingsStore().settings.appGuide?.trim();
      if (guide) parts.push('---\n## 应用使用指南\n' + guide);
    }

    if (isHarness) {
      const toolsDesc = buildToolsDescription();
      if (toolsDesc) parts.push('---\n## 可用工具\n' + toolsDesc);
      const skillsDesc = buildSkillsDescription();
      if (skillsDesc) parts.push('---\n## 可用 Skills\n' + skillsDesc);
      const subsDesc = buildSubAgentsDescription();
      if (subsDesc) parts.push('---\n## 可调用子智能体\n' + subsDesc);
    } else {
      // Workflow: 保留现有 MCP 工具描述逻辑
      const mcpStore = useMcpStore();
      const lines: string[] = [];
      for (const sid of mountedMcpServers.value) {
        const server = mcpStore.servers.find(s => s.id === sid);
        const list = mcpStore.tools[sid] || [];
        const disabledNames = mcpDisabledTools.value[sid] || [];
        const aliases = mcpToolAliases.value[sid] || {};
        const enabled = list.filter((t: any) => !disabledNames.includes(t.name));
        if (enabled.length === 0) continue;
        const serverName = server?.name || sid;
        lines.push(`## ${serverName}`);
        for (const t of enabled) {
          const desc = t.description || '无描述';
          const shortDesc = desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
          const fnName = `${MCP_PREFIX}${mcpShortIdOf(sid)}__${t.name}`;
          const aliasLabel = aliases[t.name] ? `（${aliases[t.name]}）` : (t.alias ? `（${t.alias}）` : '');
          lines.push(`- \`${fnName}\`${aliasLabel}: ${shortDesc}`);
        }
      }
      if (lines.length > 0) parts.push('---\n当前可调用的 MCP 工具：\n' + lines.join('\n'));
      const skillsDesc = buildSkillsDescription();
      if (skillsDesc) parts.push('---\n' + skillsDesc);
    }

    const wd = useSettingsStore().settings.workspaceDir;
    if (wd && wd.trim()) {
      parts.push(`---\n## 工作目录\n当前工作目录：${wd}`);
    }

    // 三层记忆注入（callLlm 已异步刷新 memoryContext）
    if (memoryContext.value && memoryContext.value.trim()) {
      parts.push(memoryContext.value);
    }

    // 知识库命中片段注入（callLlm 已刷新 knowledgeContext）
    if (knowledgeContext.value && knowledgeContext.value.trim()) {
      parts.push(knowledgeContext.value);
    }

    return parts.join('\n\n');
  }

  function getMaxReActSteps(): number {
    const agentStore = useAgentStore();
    const agent = agentStore.selectedAgent;
    const steps = agent?.config?.maxReActSteps;
    if (typeof steps === 'number' && steps > 0) return steps;
    return 10;
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
    // 会话级互斥：同一会话不可重复提交，不同会话可并行跑任务
    if (runningConvIds.value.has(convId)) return;

    runningConvIds.value.add(convId);
    abortControllers.set(convId, new AbortController());
    const maxSteps = getMaxReActSteps();

    await ensureMcpConnections();

    try {
      if (options.userContent !== undefined) {
        await addMessage({
          conversationId: convId,
          role: 'user',
          content: options.userContent,
        });
      }

      for (let step = 0; step < maxSteps; step++) {
        const ctxWindow = new ContextWindow(model.contextWindow || 8000, 6);
        let messagesToSend = [...(messagesByConv.value[convId] || [])];
        messagesToSend = messagesToSend.filter((m) => m.content || m.toolCalls || m.role === 'tool');
        if (ctxWindow.needsCompression(messagesToSend)) {
          messagesToSend = await ctxWindow.compress(messagesToSend);
        }

        // 发送前异步刷新三层记忆缓存（登录态从服务端拉取；本地模式为空）
        memoryContext.value = await buildMemoryContext();
        // 刷新知识库命中片段（不登录也可用）
        try { knowledgeContext.value = await buildKnowledgeContext(); } catch { knowledgeContext.value = ''; }

        // 每 10 轮触发一次记忆抽取（fire-and-forget，不阻塞主对话、用户无感知）
        conversationTurnCount.value++;
        if (conversationTurnCount.value >= 10) {
          conversationTurnCount.value = 0;
          void extractMemoryFromConversation();
        }

        const systemPrompt = buildSystemPrompt();
        const llmMessages: Message[] = [];
        if (systemPrompt) {
          llmMessages.push({ id: 'sys', conversationId: '', role: 'system', content: systemPrompt, createdAt: 0 });
        }
        llmMessages.push(...messagesToSend.map((m) => ({
          id: m.id, conversationId: '', role: m.role,
          content: m.content, toolCalls: m.toolCalls,
          toolCallId: m.toolCallId, reasoningContent: undefined,
          createdAt: m.createdAt,
        })));

        const assistantMsgId = await addMessage({
          conversationId: convId,
          role: 'assistant',
          content: '',
        });

        const client = new LlmClient(platform, model);
        const tools = await buildTools();
        // 本地模型 capabilities=[] 表示不支持 function calling，不传 tools 避免 400
        const modelCaps = model.capabilities as string[] | undefined;
        const supportsTools = !modelCaps || modelCaps.includes('function_call');
        const requestSnapshot = JSON.stringify({
          step,
          timestamp: new Date().toISOString(),
          model: { id: model.modelId || model.id, alias: model.alias, contextWindow: model.contextWindow },
          platform: { id: platform.id, name: platform.name, protocol: platform.protocol },
          parameters: {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            topP: options.topP,
            frequencyPenalty: options.frequencyPenalty,
            presencePenalty: options.presencePenalty,
            reasoningEffort: options.reasoningEffort,
          },
          systemPrompt,
          tools: tools.length > 0 ? (tools as any[]).map((t: any) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          })) : [],
          messages: llmMessages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' && m.content.length > 500
              ? m.content.slice(0, 497) + '...' : m.content || '',
            toolCalls: m.toolCalls?.length || 0,
          })),
        }, null, 2);
        await updateMessage(assistantMsgId, { systemPromptSnapshot: requestSnapshot });
        let fullContent = '';
        let fullReasoning = '';
        const toolCallAcc: DeltaToolCall[] = [];

        // 流式请求：如果模型不支持 tools（Ollama 小模型返回 400），自动去掉 tools 重试
        const streamOnce = async (withTools: boolean) => {
          for await (const chunk of client.chatStream(llmMessages, {
            tools: withTools && supportsTools && tools.length > 0 ? tools : undefined,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            topP: options.topP,
            frequencyPenalty: options.frequencyPenalty,
            presencePenalty: options.presencePenalty,
            reasoningEffort: options.reasoningEffort,
            signal: abortControllers.get(convId)?.signal,
          })) {
          if (chunk.delta?.content) {
            fullContent += chunk.delta.content;
          }
          if (chunk.delta?.reasoningContent) {
            fullReasoning += chunk.delta.reasoningContent;
          }
          if (chunk.delta?.toolCalls) {
            for (const tc of chunk.delta.toolCalls) {
              let idx = tc.index;
              if (idx === undefined) {
                // 部分 provider 后续 arguments 片段不带 index/id，追加到最后一个条目
                idx = toolCallAcc.length > 0 ? toolCallAcc.length - 1 : 0;
              }
              if (!toolCallAcc[idx]) {
                toolCallAcc[idx] = { ...tc };
              } else {
                const prev = toolCallAcc[idx];
                toolCallAcc[idx] = {
                  ...prev,
                  ...tc,
                  function: tc.function
                    ? {
                        ...prev.function,
                        ...tc.function,
                        arguments: (prev.function?.arguments || '') + (tc.function!.arguments || ''),
                      }
                    : prev.function,
                };
              }
            }
          }
          const convMessages = messagesByConv.value[convId] || [];
          const idx = convMessages.findIndex((m) => m.id === assistantMsgId);
          if (idx >= 0) {
            convMessages[idx] = {
              ...convMessages[idx],
              content: fullContent,
              reasoningContent: fullReasoning || undefined,
              toolCalls: toolCallAcc.length > 0 ? [...toolCallAcc] as any : undefined,
            };
          }
          if (onChunk) onChunk({ content: chunk.delta?.content, reasoning: chunk.delta?.reasoningContent });
          }
        };

        try {
          await streamOnce(true);
        } catch (e: any) {
          const msg = e?.message || '';
          if (/does not support tools|not support.*tool/i.test(msg)) {
            fullContent = ''; fullReasoning = ''; toolCallAcc.length = 0;
            if (tools.length > 0 && llmMessages[0]?.role === 'system') {
              const toolList = tools.map((t: any) => `- ${t.function.name}: ${t.function.description || ''}`).join('\n');
              llmMessages[0].content += `\n\n## 工具调用（文本模式）\n当需要调用工具时，在回复中用以下格式输出（可多次调用）：\n[TOOL_CALL]{"name":"工具名","arguments":{"参数":"值"}}[/TOOL_CALL]\n可用工具：\n${toolList}\n调用后等待返回结果，再继续回复。`;
            }
            await streamOnce(false);
          } else {
            throw e;
          }
        }

        // 文本模式工具调用解析：从输出中提取 [TOOL_CALL]...[/TOOL_CALL]
        if (toolCallAcc.length === 0 && fullContent.includes('[TOOL_CALL]')) {
          const re = /\[TOOL_CALL\]\s*(\{[\s\S]*?\})\s*\[\/TOOL_CALL\]/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(fullContent)) !== null) {
            try {
              const parsed = JSON.parse(m[1]);
              if (parsed.name) {
                toolCallAcc.push({
                  id: `text_tc_${Date.now()}_${toolCallAcc.length}`,
                  type: 'function',
                  function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments || {}) },
                });
              }
            } catch {}
          }
          if (toolCallAcc.length > 0) {
            fullContent = fullContent.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, '').trim();
          }
        }

        if (toolCallAcc.length === 0) {
          await updateMessage(assistantMsgId, {
            content: fullContent,
            reasoningContent: fullReasoning || undefined,
            toolCalls: undefined,
          });
          return;
        }

        const toolCalls: ToolCallRecord[] = toolCallAcc
          .filter(tc => tc.function?.name && tc.id)
          .map(tc => ({
            id: tc.id || '',
            name: tc.function!.name!,
            arguments: tc.function!.arguments || '{}',
          }));

        await updateMessage(assistantMsgId, {
          content: fullContent,
          reasoningContent: fullReasoning || undefined,
          toolCalls: toolCalls.map(tc => ({
            id: tc.id, messageId: assistantMsgId,
            toolName: tc.name,
            arguments: safeParseJson(tc.arguments),
          })) as any,
        });

        for (const tc of toolCalls) {
          const parsedArgs = safeParseJson(tc.arguments) as Record<string, unknown>;
          const result = await dispatchToolCall(tc.name, parsedArgs);
          const resultStr = result.ok
            ? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result))
            : JSON.stringify({ error: result.msg || '工具执行失败' });

          await addMessage({
            conversationId: convId,
            role: 'tool',
            content: resultStr,
            toolCallId: tc.id,
          });

          // D4: file_write 成功后，记录到 conversation_file（分类管理）
          if (result.ok && tc.name === 'file_write' && parsedArgs.path && convId) {
            try {
              const { useFileStore } = await import('./file');
              const filePath = String(parsedArgs.path);
              const sep = filePath.includes('/') ? '/' : '\\';
              const fileName = filePath.split(sep).pop() || filePath;
              const category = (parsedArgs.category as 'intermediate' | 'deliverable') || 'intermediate';
              await useFileStore().registerFile({
                conversationId: convId,
                name: fileName,
                path: filePath,
                category,
                source: 'agent',
                messageId: assistantMsgId,
              });
            } catch (e) { console.warn('[Chat] 记录文件失败:', e); }
          }
        }
      }

      await addMessage({
        conversationId: convId,
        role: 'assistant',
        content: `已达到最大循环步数（${maxSteps}），请检查任务是否需要拆分或调整工具配置。`,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Chat] 发送失败:', e);
      throw e;
    } finally {
      abortControllers.delete(convId);
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
    browserSteps, rightPanelOpen,
    showFilePopup, previewingFile, rightPanelTab, currentBrowserUrl,
    pendingQuestion, pendingConfirmation, pendingPlatformConfig, submitPendingQuestion,
    submitPendingConfirmation, skipPendingConfirmation, cancelPendingConfirmation,
    submitPlatformConfig, cancelPlatformConfig,
    planSteps, planTitle, clearPlan,
    activeAgent, activeAgentId,
    loadConversations, loadMessages, createConversation, updateConversation, deleteConversation, deleteConversations,
    addMessage, updateMessage, deleteMessage, sendMessage, regenerate, stop, buildTools,
    buildToolsDescription, buildSkillsDescription, buildSubAgentsDescription, buildSystemPrompt, getMergedMounts,
  };
});

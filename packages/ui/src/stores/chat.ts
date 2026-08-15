// 聊天 store
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Conversation, Message, Platform, Model, DeltaToolCall } from '@yan-zhi/shared';
import { getPlatformAdapter, LlmClient, ContextWindow, getToolRegistry } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { useMcpStore } from './mcp';
import { useAgentStore } from './agent';
import { useSkillStore } from './skill';
import { useToolsStore } from './tools';
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

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  const currentMessages = ref<Message[]>([]);
  const streaming = ref(false);
  const currentConvId = ref('');
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

  // E12: 智能体反问弹窗 —— 等待用户回答的待处理问题（dispatchToolCall 中 await 此 Promise 以暂停 ReAct 循环）
  interface PendingQuestion {
    question: string;
    options?: string[];
    multiSelect?: boolean;
    resolve: (answer: string) => void;
  }
  const pendingQuestion = ref<PendingQuestion | null>(null);
  // E12: 任务规划进度 —— task_plan / task_step 工具写入，UI 渲染 todo 卡片
  type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed';
  interface PlanStep {
    id: string;
    title: string;
    description?: string;
    status: PlanStepStatus;
    note?: string;
  }
  const planTitle = ref('');
  const planSteps = ref<PlanStep[]>([]);

  /** 用户提交反问弹窗的回答（或在未提供选项时填入文本）；答案作为该工具调用的 result 回写并继续循环 */
  function submitPendingQuestion(answer: string) {
    if (pendingQuestion.value) {
      const resolve = pendingQuestion.value.resolve;
      pendingQuestion.value = null;
      resolve(answer);
    }
  }
  /** 清空当前任务计划（用户关闭进度卡片时调用） */
  function clearPlan() {
    planTitle.value = '';
    planSteps.value = [];
  }
  let abortController: AbortController | null = null;

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
        currentMessages.value = (r.data as any[]).map(rowToMsg);
      } else {
        currentMessages.value = [];
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
    currentMessages.value = rows.map(rowToMsg);
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
      currentMessages.value = [];
    }
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
      currentMessages.value = [];
    }
    await loadConversations();
  }

  async function addMessage(msg: Omit<Message, 'id' | 'createdAt'>): Promise<string> {
    if (isServerMode()) {
      const r = await api.post<any>(`/conversations/${msg.conversationId}/messages`, {
        role: msg.role, content: msg.content, toolCalls: msg.toolCalls,
        toolCallId: msg.toolCallId, reasoningContent: msg.reasoningContent, tokens: msg.tokens,
      });
      if ('data' in r) {
        const row = r.data as any;
        const m = rowToMsg(row);
        currentMessages.value.push(m);
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
        id, msg.conversationId, msg.role, msg.content || null,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.toolCallId || null, msg.reasoningContent || null,
        msg.systemPromptSnapshot || null,
        msg.tokens || 0, ts,
      ],
    );
    await adapter.db.exec('UPDATE conversation SET updated_at = ? WHERE id = ?', [ts, msg.conversationId]);
    currentMessages.value.push({ ...msg, id, createdAt: ts });
    return id;
  }

  async function updateMessage(id: string, patch: Partial<Message>) {
    if (isServerMode()) {
      const body: any = {};
      if (patch.content !== undefined) body.content = patch.content;
      if (patch.reasoningContent !== undefined) body.reasoningContent = patch.reasoningContent;
      if (patch.tokens !== undefined) body.tokens = patch.tokens;
      if (patch.toolCalls !== undefined) body.toolCalls = patch.toolCalls;
      if (patch.systemPromptSnapshot !== undefined) body.systemPromptSnapshot = patch.systemPromptSnapshot;
      if (Object.keys(body).length === 0) return;
      await api.patch(`/messages/${id}`, body);
      const idx = currentMessages.value.findIndex((m) => m.id === id);
      if (idx >= 0) currentMessages.value[idx] = { ...currentMessages.value[idx], ...patch };
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
    const idx = currentMessages.value.findIndex((m) => m.id === id);
    if (idx >= 0) currentMessages.value[idx] = { ...currentMessages.value[idx], ...patch };
  }

  async function deleteMessage(id: string) {
    if (isServerMode()) {
      await api.delete(`/messages/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM message WHERE id = ?', [id]);
    }
    currentMessages.value = currentMessages.value.filter((m) => m.id !== id);
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
      // E7: call_agent 特殊拦截 —— 委派给子智能体执行
      if (fullName === 'call_agent') {
        return runSubAgent(args as { agentId?: string; input?: string });
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
            resolve: (answer: string) => resolve({ ok: true, result: answer }),
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
      const subAgent = agentStore.agents.find((a) => a.id === agentId);
      if (!subAgent) return { ok: false, msg: '子智能体不存在: ' + agentId };

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
      const response = await client.chat({
        messages,
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
      lines.push(`- **${sub.name}**: ${sub.description || ''}`);
    }
    return lines.length > 0 ? '可调用子智能体:\n' + lines.join('\n') : '';
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
    if (!currentConvId.value) throw new Error('未选择会话');
    if (streaming.value) return;

    streaming.value = true;
    abortController = new AbortController();
    const maxSteps = getMaxReActSteps();

    await ensureMcpConnections();

    try {
      if (options.userContent !== undefined) {
        await addMessage({
          conversationId: currentConvId.value,
          role: 'user',
          content: options.userContent,
        });
      }

      for (let step = 0; step < maxSteps; step++) {
        const ctxWindow = new ContextWindow(model.contextWindow || 8000, 6);
        let messagesToSend = [...currentMessages.value];
        messagesToSend = messagesToSend.filter((m) => m.content || m.toolCalls || m.role === 'tool');
        if (ctxWindow.needsCompression(messagesToSend)) {
          messagesToSend = await ctxWindow.compress(messagesToSend);
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
          conversationId: currentConvId.value,
          role: 'assistant',
          content: '',
        });

        const client = new LlmClient(platform, model);
        const tools = await buildTools();
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

        for await (const chunk of client.chatStream(llmMessages, {
          tools: tools.length > 0 ? tools : undefined,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          reasoningEffort: options.reasoningEffort,
          signal: abortController.signal,
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
          const idx = currentMessages.value.findIndex((m) => m.id === assistantMsgId);
          if (idx >= 0) {
            currentMessages.value[idx] = {
              ...currentMessages.value[idx],
              content: fullContent,
              reasoningContent: fullReasoning || undefined,
              toolCalls: toolCallAcc.length > 0 ? [...toolCallAcc] as any : undefined,
            };
          }
          if (onChunk) onChunk({ content: chunk.delta?.content, reasoning: chunk.delta?.reasoningContent });
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
            conversationId: currentConvId.value,
            role: 'tool',
            content: resultStr,
            toolCallId: tc.id,
          });

          // D4: file_write 成功后，记录到 conversation_file（分类管理）
          if (result.ok && tc.name === 'file_write' && parsedArgs.path && currentConvId.value) {
            try {
              const { useFileStore } = await import('./file');
              const filePath = String(parsedArgs.path);
              const sep = filePath.includes('/') ? '/' : '\\';
              const fileName = filePath.split(sep).pop() || filePath;
              const category = (parsedArgs.category as 'intermediate' | 'deliverable') || 'intermediate';
              await useFileStore().registerFile({
                conversationId: currentConvId.value,
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
        conversationId: currentConvId.value,
        role: 'assistant',
        content: `已达到最大循环步数（${maxSteps}），请检查任务是否需要拆分或调整工具配置。`,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Chat] 发送失败:', e);
      throw e;
    } finally {
      abortController = null;
      streaming.value = false;
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

  function stop() {
    if (abortController) {
      abortController.abort();
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
    browserSteps, rightPanelOpen,
    showFilePopup, previewingFile, rightPanelTab, currentBrowserUrl,
    pendingQuestion, planSteps, planTitle, submitPendingQuestion, clearPlan,
    activeAgent, activeAgentId,
    loadConversations, loadMessages, createConversation, updateConversation, deleteConversation, deleteConversations,
    addMessage, updateMessage, deleteMessage, sendMessage, regenerate, stop, buildTools,
    buildToolsDescription, buildSkillsDescription, buildSubAgentsDescription, buildSystemPrompt, getMergedMounts,
  };
});

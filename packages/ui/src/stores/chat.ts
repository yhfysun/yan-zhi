// 聊天 store
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Conversation, Message, Platform, Model, DeltaToolCall } from '@yan-zhi/shared';
import { getPlatformAdapter, LlmClient, ContextWindow } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { useMcpStore } from './mcp';
import { useAgentStore } from './agent';
import { useSkillStore } from './skill';
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

  async function createConversation(title: string, opts?: { platformId?: string; modelId?: string; skillIds?: string[] }): Promise<string> {
    if (isServerMode()) {
      const r = await api.post<any>('/conversations', {
        title, platformId: opts?.platformId, modelId: opts?.modelId,
        skillIds: opts?.skillIds || [],
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
      'INSERT INTO conversation (id, title, platform_id, model_id, mcp_servers_json, skill_ids_json, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, opts?.platformId || null, opts?.modelId || null, '[]', skillIdsJson, 0, ts, ts],
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

  async function buildTools(): Promise<unknown[]> {
    const merged = getMergedMounts();
    const tools: unknown[] = [];
    const mcpStore = useMcpStore();

    // MCP 工具
    for (const m of merged.mcpToolMounts) {
      const list = mcpStore.tools[m.serverId] || [];
      for (const t of list) {
        if (m.toolName !== '*' && m.toolName !== t.name) continue;
        tools.push({
          type: 'function',
          function: {
            name: `mcp_${m.serverId.slice(0, 8)}__${t.name}`,
            description: t.description || t.name,
            parameters: t.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
    }

    // 自定义工具
    for (const id of merged.customToolIds) {
      const { useToolsStore } = await import('./tools');
      const toolsStore = useToolsStore();
      const ct = toolsStore.customTools.find(t => t.id === id);
      if (ct && ct.enabled) {
        tools.push({
          type: 'function',
          function: {
            name: `custom_${ct.name}`,
            description: ct.description || ct.name,
            parameters: ct.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
    }
    return tools;
  }

  function buildToolsDescription(): string {
    const merged = getMergedMounts();
    const mcpStore = useMcpStore();
    const lines: string[] = [];

    if (merged.builtinToolIds.length > 0) {
      lines.push('### 内置工具');
      for (const name of merged.builtinToolIds) {
        lines.push(`- \`${name}\``);
      }
    }

    for (const m of merged.mcpToolMounts) {
      const server = mcpStore.servers.find(s => s.id === m.serverId);
      const list = mcpStore.tools[m.serverId] || [];
      const enabled = m.toolName === '*' ? list : list.filter(t => t.name === m.toolName);
      if (enabled.length === 0) continue;
      lines.push(`### ${server?.name || m.serverId}`);
      for (const t of enabled) {
        const desc = t.description || '';
        const shortDesc = desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
        lines.push(`- \`mcp_${m.serverId.slice(0, 8)}__${t.name}\`: ${shortDesc}`);
      }
    }

    if (merged.customToolIds.length > 0) {
      lines.push('### 自定义工具');
      const { useToolsStore } = require('./tools');
      const ts = useToolsStore();
      for (const id of merged.customToolIds) {
        const ct = ts.customTools.find((t: any) => t.id === id);
        if (ct) lines.push(`- \`custom_${ct.name}\`: ${ct.description || ct.name}`);
      }
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
          const fnName = `mcp_${sid.slice(0, 8)}__${t.name}`;
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

  function parseToolCallName(fullName: string): { serverId: string; toolName: string } | null {
    // 新格式: mcp_{shortId}__{toolName}
    let m = fullName.match(/^mcp_(.+?)__(.+)$/);
    if (m) {
      const match = mountedMcpServers.value.find(sid => sid.startsWith(m![1]));
      if (match) return { serverId: match, toolName: m[2] };
    }
    // 完整 UUID 老格式: mcp_{full-uuid}_{toolName}
    m = fullName.match(/^mcp_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+)$/);
    if (m) {
      const match = mountedMcpServers.value.find(sid => sid === m![1]);
      if (match) return { serverId: match, toolName: m[2] };
    }
    return null;
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
    const mcpStore = useMcpStore();

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
          const parsed = parseToolCallName(tc.name);
          if (!parsed) {
            await addMessage({
              conversationId: currentConvId.value,
              role: 'tool',
              content: JSON.stringify({ error: '无法解析工具名称: ' + tc.name }),
              toolCallId: tc.id,
            });
            continue;
          }

          const result = await mcpStore.callTool(parsed.serverId, parsed.toolName, safeParseJson(tc.arguments));
          const resultStr = result.ok
            ? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result))
            : JSON.stringify({ error: result.msg || '工具执行失败' });

          await addMessage({
            conversationId: currentConvId.value,
            role: 'tool',
            content: resultStr,
            toolCallId: tc.id,
          });
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
    activeAgent, activeAgentId,
    loadConversations, loadMessages, createConversation, updateConversation, deleteConversation, deleteConversations,
    addMessage, updateMessage, deleteMessage, sendMessage, regenerate, stop, buildTools,
    buildToolsDescription, buildSkillsDescription, buildSubAgentsDescription, buildSystemPrompt, getMergedMounts,
  };
});

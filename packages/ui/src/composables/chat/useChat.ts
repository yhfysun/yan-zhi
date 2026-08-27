import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import {
  useChatStore,
  usePlatformStore,
  useMcpStore,
  useSkillStore,
  useAgentStore,
  useAuthStore,
  useSpaceStore,
  useFileStore,
  useDistillStore,
} from '../../stores';
import { useIsMobile } from '../useIsMobile';
import type { Agent, Message, Conversation, Platform } from '@yan-zhi/shared';
import { estimateTokens, CHAT_MODEL_TYPES } from '@yan-zhi/shared';

export interface MessageRound {
  user: Message | null;
  steps: Array<{
    reasoningContent?: string;
    toolCalls: any[];
    toolResults: Array<{ callId: string; content: string; isError: boolean }>;
    partialContent?: string;
  }>;
  allToolCalls: any[];
  finalAssistant: Message | null;
  hasAgentProcess?: boolean;
  agentStats?: { stepCount: number; reasoningCount: number; toolCallCount: number };
}

interface ParsedConfigCard {
  tip: string;
  reason?: string;
  mode: 'create' | 'edit';
  platformId?: string;
}

function createChat() {
  const store = useChatStore();
  const platformStore = usePlatformStore();
  const mcpStore = useMcpStore();
  const skillStore = useSkillStore();
  const agentStore = useAgentStore();
  const authStore = useAuthStore();
  const spaceStore = useSpaceStore();
  const fileStore = useFileStore();
  const distillStore = useDistillStore();
  const isMobile = useIsMobile();

  // Skill 蒸馏弹窗状态
  const showDistill = ref(false);
  const distillMessages = ref<Array<{ role: string; content: string }>>([]);

  function distillUserMsg(msg: Message) {
    distillMessages.value = [{ role: 'user', content: msg.content || '' }];
    showDistill.value = true;
  }
  function distillAssistantMsg(round: any) {
    const msgs: Array<{ role: string; content: string }> = [];
    if (round.user) msgs.push({ role: 'user', content: round.user.content || '' });
    if (round.finalAssistant) msgs.push({ role: 'assistant', content: round.finalAssistant.content || '' });
    distillMessages.value = msgs;
    showDistill.value = true;
  }

  // E12: 智能体反问弹窗表单状态（ask_user 工具触发）
  const askText = ref('');
  const askSupplement = ref('');
  const askSingle = ref('');
  const askChecked = ref<boolean[]>([]);
  const askShowText = ref(false);
  const askDialogVisible = computed({
    get: () => !!store.pendingQuestion,
    set: (v: boolean) => { if (!v) onAskDialogClose(); },
  });
  const askMultiSelect = computed(
    () => !!store.pendingQuestion?.multiSelect && !!store.pendingQuestion?.options?.length,
  );
  function resetAskForm() {
    askText.value = '';
    askSupplement.value = '';
    askSingle.value = '';
    askChecked.value = [];
    askShowText.value = false;
  }
  function onAskSubmit() {
    const q = store.pendingQuestion;
    if (!q) return;
    let answer = '';
    if (askMultiSelect.value) {
      const sel = (q.options || []).filter((_, i) => askChecked.value[i]);
      answer = sel.join('、');
    } else if (q.options?.length) {
      answer = askSingle.value;
    }
    if (!answer) answer = askText.value.trim();
    const supplement = askSupplement.value.trim();
    if (!answer && !supplement) {
      ElMessage.warning('请选择或输入回答，或填写补充说明');
      return;
    }
    store.submitPendingQuestion(answer || '[用户仅提供补充说明]', supplement);
    resetAskForm();
  }
  function onAskSkip() {
    if (store.pendingQuestion) store.submitPendingQuestion('[用户选择跳过该问题]');
    resetAskForm();
  }
  function onAskDialogClose() {
    if (store.pendingQuestion) store.submitPendingQuestion('[用户关闭了提问，未作答]');
    resetAskForm();
  }
  // 新提问弹出时清空上一份表单
  watch(
    () => store.pendingQuestion,
    (q) => { if (q) resetAskForm(); },
  );

  // E12b: 多页用户确认向导表单状态（confirm_user 工具触发）
  const confirmText = ref('');
  const confirmSingle = ref('');
  const confirmChecked = ref<boolean[]>([]);
  const confirmShowText = ref(false);
  const confirmSupplement = ref('');
  const confirmDialogVisible = computed({
    get: () => !!store.pendingConfirmation,
    set: (v: boolean) => { if (!v) onConfirmDialogClose(); },
  });
  const confirmCurrentPage = computed(() => {
    const wizard = store.pendingConfirmation;
    if (!wizard) return null;
    return wizard.pages[wizard.index] || null;
  });
  const confirmMultiSelect = computed(
    () => !!confirmCurrentPage.value?.multiSelect && !!confirmCurrentPage.value?.options?.length,
  );
  function resetConfirmForm() {
    confirmText.value = '';
    confirmSingle.value = '';
    confirmChecked.value = [];
    confirmShowText.value = false;
    confirmSupplement.value = '';
  }
  function onConfirmNext() {
    const wizard = store.pendingConfirmation;
    const page = confirmCurrentPage.value;
    if (!wizard || !page) return;

    let answer = '';
    if (confirmMultiSelect.value) {
      const sel = (page.options || []).filter((_, i) => confirmChecked.value[i]);
      answer = sel.join('、');
    } else if (page.options?.length) {
      answer = confirmSingle.value;
    }
    if (!answer && confirmText.value.trim()) answer = confirmText.value.trim();
    if (!answer && page.required) {
      ElMessage.warning('该问题为必填，请选择或输入回答');
      return;
    }
    if (!answer && !confirmSupplement.value.trim()) {
      ElMessage.warning('请填写答案或补充说明');
      return;
    }
    store.submitPendingConfirmation(answer, confirmSupplement.value);
    resetConfirmForm();
  }
  function onConfirmSkip() {
    if (store.pendingConfirmation) store.skipPendingConfirmation();
    resetConfirmForm();
  }
  function onConfirmDialogClose() {
    if (store.pendingConfirmation) store.cancelPendingConfirmation();
    resetConfirmForm();
  }
  watch(
    [() => store.pendingConfirmation, () => store.pendingConfirmation?.index],
    () => { if (store.pendingConfirmation) resetConfirmForm(); },
  );

  // E12c: 模型平台配置弹窗表单状态（configure_model_platform 工具触发）
  const platformConfigSaving = ref(false);
  const manualPlatformConfigVisible = ref(false);
  const platformConfigForm = ref({
    name: '',
    protocol: 'openai',
    apiUrl: '',
    apiKey: '',
    modelId: '',
    alias: '',
    contextWindow: 131072,
  });
  const platformConfigDialogVisible = computed({
    get: () => !!store.pendingPlatformConfig || manualPlatformConfigVisible.value,
    set: (v: boolean) => { if (!v) onPlatformConfigClose(); },
  });

  function resetPlatformConfigForm() {
    const prefill = store.pendingPlatformConfig?.prefill;
    platformConfigForm.value = {
      name: prefill?.name || '',
      protocol: prefill?.protocol || 'openai',
      apiUrl: prefill?.apiUrl || '',
      apiKey: prefill?.apiKey || '',
      modelId: prefill?.modelId || '',
      alias: prefill?.alias || '',
      contextWindow: Number.isFinite(Number(prefill?.contextWindow))
        ? Number(prefill?.contextWindow)
        : 131072,
    };
  }

  function openPlatformConfig() {
    manualPlatformConfigVisible.value = true;
    resetPlatformConfigForm();
  }

  async function onPlatformConfigSubmit() {
    const f = platformConfigForm.value;
    if (!f.name.trim() || !f.apiUrl.trim() || !f.modelId.trim()) {
      ElMessage.warning('平台名称、API URL 和模型 ID 为必填');
      return;
    }
    platformConfigSaving.value = true;
    try {
      const platformId = await platformStore.addPlatform({
        name: f.name.trim(),
        protocol: f.protocol as any,
        apiUrl: f.apiUrl.trim(),
        apiKeyEnc: f.apiKey.trim(),
        headers: {},
        status: 'unknown',
      });
      await platformStore.addModel({
        platformId,
        modelId: f.modelId.trim(),
        alias: f.alias.trim() || f.modelId.trim().split('/').pop() || f.modelId.trim(),
        type: 'llm' as any,
        contextWindow: Number(f.contextWindow) || 131072,
        enabled: true,
        isDefault: false,
        capabilities: ['function_call'],
      });
      const message = `已创建模型平台「${f.name.trim()}」并添加模型 ${f.modelId.trim()}`;
      if (store.pendingPlatformConfig) {
        store.submitPlatformConfig({ cancelled: false, platformId, modelId: f.modelId.trim(), message });
      }
      manualPlatformConfigVisible.value = false;
      ElMessage.success(message);
      resetPlatformConfigForm();
    } catch (e: any) {
      ElMessage.error('创建失败: ' + (e?.message || e));
    } finally {
      platformConfigSaving.value = false;
    }
  }

  function onPlatformConfigCancel() {
    if (store.pendingPlatformConfig) {
      store.cancelPlatformConfig();
    } else {
      manualPlatformConfigVisible.value = false;
    }
    resetPlatformConfigForm();
  }

  function onPlatformConfigClose() {
    if (store.pendingPlatformConfig) {
      store.cancelPlatformConfig();
    } else {
      manualPlatformConfigVisible.value = false;
    }
    resetPlatformConfigForm();
  }

  watch(
    () => store.pendingPlatformConfig,
    (pending) => { if (pending) resetPlatformConfigForm(); },
  );

  const input = ref('');
  const inputFocused = ref(false);
  const fileInputRef = ref<HTMLInputElement>();
  const uploadedFiles = ref<Array<{ name: string; size: number; type: string; dataUrl: string }>>([]);

  const showScrollBottom = ref(false);
  const showScrollTop = ref(false);

  const browserActive = computed(() => store.browserSteps.length > 0);
  const currentBrowserLabel = computed(() => {
    const u = store.currentBrowserUrl;
    if (!u) return '网站';
    try { return new URL(u).hostname || u; } catch { return u; }
  });
  watch(() => store.browserSteps.length, (n, o) => {
    if (o === 0 && n > 0) store.rightPanelTab = 'browser';
    else if (n === 0 && store.rightPanelTab === 'browser') store.rightPanelTab = 'file';
  });
  function closeRightPanel() {
    store.rightPanelOpen = false;
  }
  function toggleRightPanel() {
    if (!store.rightPanelOpen && !browserActive.value) store.rightPanelTab = 'file';
    store.rightPanelOpen = !store.rightPanelOpen;
  }

  const expandedFileCategories = reactive<Record<string, boolean>>({ upload: true, intermediate: true, deliverable: true });
  const fileSearch = ref('');
  const workspaceFiles = ref<Array<{ name: string; path: string; size: number; isDir: boolean }>>([]);
  const selectedFilePaths = ref<Set<string>>(new Set());
  const filePanelUploadRef = ref<HTMLInputElement>();
  const search = ref('');
  const messagesRef = ref<HTMLElement>();
  const showMount = ref(false);
  const showSkills = ref(false);
  const skillSearch = ref('');

  const filteredSkillStore = computed(() => {
    if (!skillSearch.value.trim()) return skillStore.skills;
    const q = skillSearch.value.toLowerCase();
    return skillStore.skills.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
    );
  });

  function toggleSkillMount(id: string) {
    const idx = mountedSkillIds.value.indexOf(id);
    if (idx >= 0) {
      mountedSkillIds.value.splice(idx, 1);
    } else {
      mountedSkillIds.value.push(id);
    }
  }

  const selectedModelId = ref('');
  const expandedReasoning = reactive<Record<string, boolean>>({});
  const expandedTools = reactive<Record<string, boolean>>({});
  const expandedToolGroups = reactive<Record<string, boolean>>({});
  const collapsedToolGroups = reactive<Record<string, boolean>>({});
  const collapsedMessages = reactive<Record<string, boolean>>({});
  const expandedAgentProcess = reactive<Record<string, boolean>>({});
  const expandedStepTools = reactive<Record<string, boolean>>({});

  const activeNavRound = ref<number | null>(null);

  const mountedSkillIds = ref<string[]>([]);
  const drawerOpen = ref(false);
  const convCollapsed = ref(false);
  const sideTab = ref<'agent' | 'chat'>('chat');
  const batchMode = ref(false);
  const selectedConvIds = ref<Set<string>>(new Set());

  const mountToolSelection = reactive<Record<string, string[]>>({});
  const toolAliasMap = reactive<Record<string, Record<string, string>>>({});
  const mountSearch = ref('');
  const collapsedServers = reactive<Record<string, boolean>>({});

  function toggleServerCollapse(sid: string) {
    collapsedServers[sid] = !collapsedServers[sid];
  }

  function filteredTools(sid: string) {
    const tools = mcpStore.tools[sid] || [];
    if (!mountSearch.value.trim()) return tools;
    const q = mountSearch.value.toLowerCase();
    return tools.filter(t => t.name.toLowerCase().includes(q));
  }

  function initMountSelection() {
    for (const sid in mountToolSelection) delete mountToolSelection[sid];
    for (const sid in toolAliasMap) delete toolAliasMap[sid];
    const disabled = store.mcpDisabledTools;
    const aliases = store.mcpToolAliases;
    for (const sid of store.mountedMcpServers) {
      const tools = mcpStore.tools[sid] || [];
      const disabledNames = disabled[sid] || [];
      mountToolSelection[sid] = tools.filter(t => !disabledNames.includes(t.name)).map(t => t.name);
      if (aliases[sid]) {
        toolAliasMap[sid] = { ...aliases[sid] };
      }
    }
  }
  function isToolMounted(sid: string, name: string) {
    return (mountToolSelection[sid] || []).includes(name);
  }
  function toggleMountTool(sid: string, name: string) {
    if (!mountToolSelection[sid]) mountToolSelection[sid] = [];
    const arr = mountToolSelection[sid];
    const idx = arr.indexOf(name);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(name);
  }
  function isAllToolsMounted(sid: string) {
    const all = (mcpStore.tools[sid] || []).map(t => t.name);
    const sel = mountToolSelection[sid] || [];
    return all.length > 0 && all.every(n => sel.includes(n));
  }
  function toggleAllTools(sid: string) {
    const all = (mcpStore.tools[sid] || []).map(t => t.name);
    if (isAllToolsMounted(sid)) {
      delete mountToolSelection[sid];
    } else {
      mountToolSelection[sid] = [...all];
    }
  }
  function setToolAlias(sid: string, name: string, alias: string) {
    if (!toolAliasMap[sid]) toolAliasMap[sid] = {};
    if (alias.trim()) {
      toolAliasMap[sid][name] = alias.trim();
    } else {
      delete toolAliasMap[sid][name];
    }
  }

  const showAgentEdit = ref(false);
  const editingAgent = ref<Agent | null>(null);
  const debugMode = ref(false);

  const showWorkspaceDir = ref(false);
  const workspaceDir = ref('');
  const WORKSPACE_DIR_KEY = 'settings:workspaceDir';

  async function loadWorkspaceDir() {
    try {
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const adapter = getPlatformAdapter();
      const saved = await adapter.keyring.get(WORKSPACE_DIR_KEY);
      workspaceDir.value = saved || 'workspace';
    } catch { workspaceDir.value = 'workspace'; }
  }

  async function onWorkspaceDirSelected(path: string) {
    workspaceDir.value = path;
    try {
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const adapter = getPlatformAdapter();
      await adapter.keyring.set(WORKSPACE_DIR_KEY, path);
    } catch {}
  }

  function tryParseSnapshot(raw?: string): any {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function formatSnapshot(raw?: string): string {
    if (!raw) return '（无快照数据）';
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }

  const snapshotDialog = ref(false);
  const snapshotActiveTab = ref('');
  const currentSnapshots = ref<Array<{ id: string; label: string; content: string }>>([]);
  function openSnapshotDialog(userMsg: any) {
    const idx = store.currentMessages.indexOf(userMsg);
    const snapshots: Array<{ id: string; label: string; content: string }> = [];
    for (let i = idx + 1; i < store.currentMessages.length; i++) {
      const m: any = store.currentMessages[i];
      if (m.role === 'user') break;
      if (m.role === 'assistant' && m.systemPromptSnapshot) {
        const parsed = tryParseSnapshot(m.systemPromptSnapshot);
        const step = parsed?.step ?? 0;
        const agentName = agentStore.selectedAgent?.name || '智能体';
        const label = step === 0 ? `Human → ${agentName}` : `${agentName}（#${step}）`;
        snapshots.push({ id: m.id, label, content: formatSnapshot(m.systemPromptSnapshot) });
      }
    }
    currentSnapshots.value = snapshots;
    snapshotActiveTab.value = snapshots[0]?.id || '';
    snapshotDialog.value = true;
  }

  const isDraftMode = ref(false);
  const renamingId = ref('');
  const renamingTitle = ref('');
  const renameInputRef = ref<any>(null);

  const ctxMenu = reactive<{ visible: boolean; x: number; y: number; conv: Conversation | null }>({
    visible: false, x: 0, y: 0, conv: null,
  });

  const md = new MarkdownIt({
    html: false, linkify: true, breaks: true,
    highlight(str: string, lang: string) {
      const codeClass = lang ? ` class="language-${lang}"` : '';
      const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
      if (lang && hljs.getLanguage(lang)) {
        try {
          const h = hljs.highlight(str, { language: lang }).value;
          return `<pre class="hljs code-block-wrapper">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${h}</code></pre>`;
        } catch {}
      }
      return `<pre class="hljs code-block-wrapper">${langLabel}<button class="code-copy-btn" data-code="${encodeURIComponent(str)}">复制</button><code${codeClass}>${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });

  function renderMarkdown(c: string) { return md.render(c || ''); }

  function handleContentClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.classList.contains('code-copy-btn')) {
      const raw = t.getAttribute('data-code') || '';
      navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
        t.textContent = '已复制'; setTimeout(() => { t.textContent = '复制'; }, 1500);
      }).catch(() => ElMessage.error('复制失败'));
    }
  }

  const currentConv = computed(() => store.conversations.find((c) => c.id === store.currentConvId));
  const filteredConversations = computed(() => {
    let list = store.conversations;
    const sid = spaceStore.currentSpaceId;
    if (sid !== null) {
      list = list.filter((c) => (sid === '' ? !c.spaceId : c.spaceId === sid));
    }
    if (!search.value.trim()) return list;
    const q = search.value.toLowerCase();
    return list.filter((c) => c.title.toLowerCase().includes(q));
  });

  const messageRounds = computed<MessageRound[]>(() => {
    const msgs = store.currentMessages;
    const rounds: MessageRound[] = [];
    let currentRound: MessageRound | null = null;

    for (const msg of msgs) {
      if (msg.role === 'system') continue;
      if (msg.role === 'user') {
        if (currentRound) rounds.push(currentRound);
        currentRound = { user: msg, steps: [], allToolCalls: [], finalAssistant: null };
      } else if (msg.role === 'assistant') {
        if (!currentRound) continue;
        currentRound.steps.push({
          reasoningContent: msg.reasoningContent,
          toolCalls: msg.toolCalls || [],
          toolResults: [],
          partialContent: msg.content || undefined,
        });
        if (msg.toolCalls?.length) {
          currentRound.allToolCalls.push(...msg.toolCalls);
        }
      } else if (msg.role === 'tool') {
        if (!currentRound) continue;
        for (let s = currentRound.steps.length - 1; s >= 0; s--) {
          const step = currentRound.steps[s];
          if (step.toolCalls.some((tc: any) => tc.id === msg.toolCallId)) {
            step.toolResults.push({
              callId: msg.toolCallId || '',
              content: msg.content || '',
              isError: isToolErrorContent(msg.content || ''),
            });
            break;
          }
        }
      }
    }
    if (currentRound) rounds.push(currentRound);

    for (const round of rounds) {
      const lastStep = round.steps[round.steps.length - 1];
      if (lastStep && !lastStep.toolCalls.length) {
        round.finalAssistant = {
          id: round.user?.id + '-fa' || 'fa',
          conversationId: '',
          role: 'assistant',
          content: lastStep.partialContent || '',
          reasoningContent: lastStep.reasoningContent,
          createdAt: 0,
        };
        round.steps.pop();
      }
      round.hasAgentProcess = round.steps.length > 0 || round.allToolCalls.length > 0;
      round.agentStats = {
        stepCount: round.steps.length,
        reasoningCount: round.steps.filter(s => s.reasoningContent).length,
        toolCallCount: round.steps.reduce((sum, s) => sum + s.toolCalls.length, 0),
      };
    }
    return rounds;
  });

  function isToolErrorContent(content: string): boolean {
    try {
      const parsed = JSON.parse(content);
      return !!parsed?.isError;
    } catch { return false; }
  }

  const chatModels = computed(() =>
    platformStore.models.filter((m) => m.enabled && CHAT_MODEL_TYPES.includes(m.type)),
  );

  const modelGroups = computed(() => {
    return platformStore.platforms
      .map((p) => ({
        platformId: p.id,
        platformName: p.name,
        models: chatModels.value.filter((m) => m.platformId === p.id),
      }))
      .filter((g) => g.models.length > 0);
  });

  const mountableServers = computed(() =>
    mcpStore.servers.filter(s =>
      (mcpStore.tools[s.id] || []).length > 0 ||
      s.status === 'connected' ||
      store.mountedMcpServers.includes(s.id),
    ),
  );

  const tokenCount = computed(() =>
    store.currentMessages.reduce((s, m) => s + estimateTokens(m.content || '') + estimateTokens(m.reasoningContent || ''), 0),
  );
  const contextLimit = computed(() => {
    const m = platformStore.models.find((x) => x.id === selectedModelId.value);
    return m?.contextWindow || 8000;
  });
  const tokenPercent = computed(() => Math.min(100, Math.round((tokenCount.value / contextLimit.value) * 100)));
  const tokenBarColor = computed(() => {
    if (tokenPercent.value >= 90) return '#ef4444';
    if (tokenPercent.value >= 70) return '#f59e0b';
    return '#3B82F6';
  });
  const canSend = computed(() => (!!input.value.trim() || uploadedFiles.value.length > 0) && !!selectedModelId.value && !store.streaming);

  const userRoundIndices = computed<number[]>(() =>
    messageRounds.value
      .map((r, i) => (r.user ? i : -1))
      .filter(i => i >= 0),
  );

  function openEditAgent(agent?: Agent | null) {
    editingAgent.value = agent || null;
    showAgentEdit.value = true;
  }

  function openCreateAgent() {
    editingAgent.value = null;
    showAgentEdit.value = true;
  }

  function onAgentSaved(agentId: string) {
    agentStore.selectAgent(agentId);
    const agent = agentStore.agents.find((a) => a.id === agentId);
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    }
  }

  function onAgentDeleted(_agentId: string) {
    showAgentEdit.value = false;
  }

  // ========== 空间（文件夹）管理 ==========
  const showSpaceEdit = ref(false);
  const spaceEditForm = ref({ id: '', name: '', dirPath: '', description: '' });
  const spaceMenuTarget = ref<{ x: number; y: number; space: any } | null>(null);

  function selectSpace(id: string | null) {
    spaceStore.selectSpace(id);
  }

  async function createSpaceQuick() {
    try {
      const { value: name } = await ElMessageBox.prompt('请输入空间名称', '新建空间', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValidator: (v) => !!v?.trim() || '名称不能为空',
      });
      if (!name?.trim()) return;
      const id = await spaceStore.createSpace({ name: name.trim() });
      spaceStore.selectSpace(id);
      ElMessage.success('空间已创建');
    } catch { /* 用户取消 */ }
  }

  function openSpaceEdit(space: any) {
    spaceEditForm.value = {
      id: space.id,
      name: space.name,
      dirPath: space.dirPath || '',
      description: space.description || '',
    };
    showSpaceEdit.value = true;
  }

  async function saveSpaceEdit() {
    if (!spaceEditForm.value.name.trim()) { ElMessage.warning('名称不能为空'); return; }
    await spaceStore.updateSpace(spaceEditForm.value.id, {
      name: spaceEditForm.value.name.trim(),
      dirPath: spaceEditForm.value.dirPath.trim() || undefined,
      description: spaceEditForm.value.description.trim() || undefined,
    });
    showSpaceEdit.value = false;
    ElMessage.success('空间已更新');
  }

  async function deleteSpaceConfirm(space: any) {
    try {
      await ElMessageBox.confirm(
        `确定删除空间"${space.name}"吗？其下会话将归入"未归类"，目录文件不受影响。`,
        '删除空间',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
      await spaceStore.deleteSpace(space.id);
      ElMessage.success('空间已删除');
    } catch { /* 取消 */ }
  }

  function openSpaceMenu(e: MouseEvent, space: any) {
    e.preventDefault();
    e.stopPropagation();
    spaceMenuTarget.value = { x: e.clientX, y: e.clientY, space };
  }

  function closeSpaceMenu() {
    spaceMenuTarget.value = null;
  }

  async function moveConvToSpace(convId: string, spaceId: string | null) {
    await store.updateConversation(convId, { spaceId: spaceId || undefined });
    ElMessage.success(spaceId ? '已移动到空间' : '已移出空间');
  }

  // ========== 会话文件分类管理 ==========
  const fileCategories = [
    { key: 'upload' as const, label: '上传文件' },
    { key: 'intermediate' as const, label: '中间文件' },
    { key: 'deliverable' as const, label: '交付文件' },
  ];

  function previewInPopup(f: any) {
    store.previewingFile = { name: f.name, path: f.path };
    store.rightPanelTab = 'file';
    store.rightPanelOpen = true;
  }

  async function showConvFileMenu(e: MouseEvent, f: any) {
    try {
      const action = await ElMessageBox.confirm('', '文件操作', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true,
        message: `文件：${f.name}\n选择操作：`,
      });
      if (action) {
        await fileStore.deleteFile(f.id);
        ElMessage.success('已删除文件记录');
      }
    } catch { /* 取消 */ }
  }

  async function reclassifyConvFile(fileId: string, category: 'intermediate' | 'deliverable') {
    await fileStore.updateFile(fileId, { category });
    ElMessage.success('已更改分类');
  }

  onMounted(async () => {
    await agentStore.loadAgents();
    await store.loadConversations();
    await platformStore.loadPlatforms();
    await platformStore.loadModels();
    await mcpStore.loadServers();
    await skillStore.loadSkills();
    spaceStore.loadSpaces();
    await loadWorkspaceDir();

    const agent = agentStore.selectedAgent;
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    } else {
      const first = chatModels.value[0];
      if (first) selectedModelId.value = first.id;
    }

    const showDebugs = new URLSearchParams(location.search).get('showDebugs') === 'true';
    if (showDebugs) { debugMode.value = true; }

    const lastConv = store.conversations[0];
    if (lastConv) {
      await selectConv(lastConv.id);
    }

    if (store.currentConvId) {
      const exists = store.conversations.some((c) => c.id === store.currentConvId);
      if (exists) {
        await store.loadMessages(store.currentConvId);
        const conv = store.conversations.find((c) => c.id === store.currentConvId);
        if (conv?.modelId && conv?.platformId) {
          const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
          if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
        } else if (conv?.modelId) {
          const resolved = platformStore.resolveModel(conv.modelId);
          if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
        }
      } else {
        store.currentConvId = '';
        store.currentMessages = [];
      }
    }

    document.addEventListener('click', closeCtxMenu);

    nextTick(() => {
      if (messagesRef.value) messagesRef.value.addEventListener('scroll', handleScroll);
    });
    loadWorkspaceFiles();
  });

  onUnmounted(() => {
    document.removeEventListener('click', closeCtxMenu);
    if (messagesRef.value) messagesRef.value.removeEventListener('scroll', handleScroll);
  });

  watch(() => store.currentMessages.length, () => nextTick(() => {
    if (messagesRef.value) { messagesRef.value.scrollTop = messagesRef.value.scrollHeight; handleScroll(); }
    if (!store.streaming) collapseEarlyOnMobile();
  }));

  watch(() => store.currentConvId, async (id) => {
    if (!id) return;
    isDraftMode.value = false;
    const conv = store.conversations.find((c) => c.id === id);
    if (conv?.modelId && conv?.platformId) {
      const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    } else if (conv?.modelId) {
      const resolved = platformStore.resolveModel(conv.modelId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    }
    mountedSkillIds.value = conv?.skillIds ? [...conv.skillIds] : [];
    initMountSelection();
    await nextTick();
    collapseEarlyOnMobile();
  });

  watch(showMount, (v) => {
    if (v) initMountSelection();
  });

  watch(() => store.streaming, (isStreaming) => {
    if (isStreaming) {
      const lastIdx = messageRounds.value.length - 1;
      if (lastIdx >= 0) expandedAgentProcess['round-' + lastIdx] = true;
    }
  });

  function onAgentSwitch(id: string) {
    agentStore.selectAgent(id);
    const agent = agentStore.agents.find((a) => a.id === id);
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    }
  }

  function onModelChange(modelId: string) {
    const model = platformStore.models.find((m) => m.id === modelId);
    if (model && agentStore.selectedAgent) {
      agentStore.updateAgent(agentStore.selectedId, { modelId: model.modelId, platformId: model.platformId });
    }
  }

  function parseConfigCard(content: string | undefined): ParsedConfigCard | null {
    if (!content) return null;
    const m = content.match(/\[\[PLATFORM_CONFIG:(create|edit)(?::([^\]]+))?\]\]/);
    if (!m) return null;
    const mode = m[1] as 'create' | 'edit';
    const platformId = m[2] || undefined;
    const body = content.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/, '').trim();
    const REASON_SEP = '\n@@REASON@@\n';
    let tip = body;
    let reason: string | undefined;
    const sepIdx = body.indexOf(REASON_SEP);
    if (sepIdx >= 0) {
      tip = body.slice(0, sepIdx).trim();
      reason = body.slice(sepIdx + REASON_SEP.length).trim();
    }
    return { tip, reason, mode, platformId };
  }

  function displayAssistantContent(content: string | undefined): string {
    const parsed = parseConfigCard(content);
    if (parsed) return parsed.tip;
    return content || '';
  }

  function getEditPlatform(content: string | undefined): Platform | undefined {
    const parsed = parseConfigCard(content);
    if (parsed?.mode === 'edit' && parsed.platformId) {
      return platformStore.platforms.find((p) => p.id === parsed.platformId);
    }
    return undefined;
  }

  function getEditReason(content: string | undefined): string | undefined {
    const parsed = parseConfigCard(content);
    if (parsed?.mode === 'edit') return parsed.reason;
    return undefined;
  }

  async function onConfigSaved(payload: { platformId: string; modelId?: string }) {
    if (payload.modelId) {
      selectedModelId.value = payload.modelId;
      const model = platformStore.models.find((m) => m.id === payload.modelId);
      if (model && agentStore.selectedAgent) {
        agentStore.updateAgent(agentStore.selectedId, { modelId: model.modelId, platformId: model.platformId });
      }
    }
    ElMessage.success(
      payload.modelId
        ? '平台已配置并选中模型，请重新发送消息'
        : '平台已配置，请到模型页选择模型后重新发送消息',
    );
    await nextTick();
    scrollToBottom();
  }

  function startNewChat() {
    store.currentConvId = '';
    store.currentMessages = [];
    isDraftMode.value = true;
    mountedSkillIds.value = [];
    input.value = '';
  }

  async function selectConv(id: string) {
    await store.loadMessages(id);
    isDraftMode.value = false;
    const conv = store.conversations.find((c) => c.id === id);
    if (conv?.modelId && conv?.platformId) {
      const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    } else if (conv?.modelId) {
      const resolved = platformStore.resolveModel(conv.modelId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    }
    mountedSkillIds.value = conv?.skillIds ? [...conv.skillIds] : [];
    initMountSelection();
    fileStore.loadConversationFiles(id);
    await nextTick();
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
      handleScroll();
    }
  }

  function triggerFileUpload() {
    fileInputRef.value?.click();
  }
  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;
    const maxSize = 10 * 1024 * 1024;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > maxSize) { ElMessage.warning(`文件「${f.name}」超过 10MB 限制`); continue; }
      const reader = new FileReader();
      reader.onload = () => {
        uploadedFiles.value.push({
          name: f.name, size: f.size, type: f.type,
          dataUrl: reader.result as string,
        });
      };
      reader.readAsDataURL(f);
    }
    target.value = '';
  }
  function removeFile(idx: number) { uploadedFiles.value.splice(idx, 1); }
  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function send() {
    if (!input.value.trim() && uploadedFiles.value.length === 0) return;

    const hasPlatform = platformStore.platforms.length > 0;
    const hasModel = !!selectedModelId.value && !!platformStore.models.find((m) => m.id === selectedModelId.value);
    if (!hasPlatform || !hasModel) {
      const userContent = input.value.trim();
      if (!userContent && uploadedFiles.value.length === 0) return;
      input.value = '';
      uploadedFiles.value = [];

      if (store.currentConvId && !store.conversations.some((c) => c.id === store.currentConvId)) {
        store.currentConvId = '';
        store.currentMessages = [];
      }
      if (!store.currentConvId) {
        const titleBase = userContent || '配置平台';
        const title = titleBase.slice(0, 24) + (titleBase.length > 24 ? '…' : '');
        const id = await store.createConversation(title, { skillIds: [...mountedSkillIds.value] });
        try { await saveMountToDb(id); } catch { /* 忽略挂载持久化失败 */ }
        await store.loadMessages(id);
        isDraftMode.value = false;
      }

      if (userContent) {
        await store.addMessage({
          conversationId: store.currentConvId,
          role: 'user',
          content: userContent,
        });
      }

      const tip = !hasPlatform
        ? '⚠️ 平台未配置，请在下方填写平台信息后保存。'
        : '⚠️ 未选择模型，请在下方配置平台后选择模型。';
      await store.addMessage({
        conversationId: store.currentConvId,
        role: 'assistant',
        content: tip + '\n[[PLATFORM_CONFIG:create]]',
      });

      await nextTick();
      scrollToBottom();
      return;
    }

    const content = input.value;
    const model = platformStore.models.find((m) => m.id === selectedModelId.value);
    let platform: Platform | undefined = platformStore.platforms.find((p) => p.id === model?.platformId);
    if (!platform || !model) { ElMessage.error('平台或模型不存在'); return; }

    if (!CHAT_MODEL_TYPES.includes(model.type)) {
      ElMessage.warning('「' + (model.alias || model.modelId) + '」不是对话模型（类型：' + model.type + '），不支持聊天功能');
      return;
    }

    const files = [...uploadedFiles.value];
    uploadedFiles.value = [];

    let userContent = content;
    if (files.length > 0) {
      userContent = content || '请分析以下文件';
      const fileParts = files.map(f => `\n[文件: ${f.name} (${formatSize(f.size)}, ${f.type})]`).join('');
      userContent = userContent + '\n---\n已上传文件：' + fileParts;
    }

    if (!userContent.trim()) { ElMessage.warning('请输入消息'); return; }

    if (store.currentConvId && !store.conversations.some((c) => c.id === store.currentConvId)) {
      store.currentConvId = '';
      store.currentMessages = [];
    }

    try {
      const agent = agentStore.selectedAgent;
      if (!store.currentConvId) {
        const title = userContent.trim().slice(0, 24) + (userContent.trim().length > 24 ? '…' : '');
        const id = await store.createConversation(title, {
          platformId: platform.id,
          modelId: model.modelId,
          skillIds: [...mountedSkillIds.value],
        });
        if (agent?.systemPrompt) {
          await store.updateConversation(id, { systemPrompt: agent.systemPrompt });
        }
        await saveMountToDb(id);
        await store.loadMessages(id);
        isDraftMode.value = false;
      } else if (!currentConv.value?.platformId) {
        await store.updateConversation(store.currentConvId, { platformId: platform.id, modelId: model.modelId });
      }

      input.value = '';

      if (selectedFilePaths.value.size > 0) {
        const fileRefs: Array<Record<string, unknown>> = [];
        for (const filePath of selectedFilePaths.value) {
          const f = workspaceFiles.value.find(wf => wf.path === filePath);
          if (!f) continue;
          try {
            const { getPlatformAdapter } = await import('@yan-zhi/core');
            const adapter = getPlatformAdapter();
            const fileContent = await adapter.fs.readFile(f.path);
            const ext = f.name.split('.').pop()?.toLowerCase();
            const excelExts = ['xlsx', 'xls', 'csv'];
            let preview: string;
            if (excelExts.includes(ext || '')) {
              try {
                const XLSX = await import('xlsx');
                const wb = XLSX.read(fileContent, { type: 'string' });
                const parts: string[] = [];
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const csv = XLSX.utils.sheet_to_csv(ws);
                  const lines = csv.split('\n').slice(0, 4);
                  parts.push('Sheet: ' + sheetName + '\n' + lines.join('\n'));
                }
                preview = parts.join('\n\n');
              } catch { preview = fileContent.slice(0, 500); }
            } else {
              preview = fileContent.split('\n').slice(0, 6).join('\n');
            }
            fileRefs.push({
              fileId: f.name.split('_')[0],
              fileName: f.name.replace(/^f_[a-f0-9]+_/, ''),
              type: ext || 'unknown', size: f.size, preview,
            });
          } catch { /* skip */ }
        }
        if (fileRefs.length > 0) {
          userContent = userContent + '\n\n[Files]\n' + JSON.stringify(fileRefs, null, 2);
        }
      }

      await store.sendMessage(userContent, platform, model, undefined, {
        temperature: agent?.temperature,
        maxTokens: agent?.maxTokens,
        topP: agent?.topP,
        frequencyPenalty: agent?.frequencyPenalty,
        presencePenalty: agent?.presencePenalty,
        reasoningEffort: (agent?.config as any)?.reasoningEffort || undefined,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Chat] 发送失败:', e);

      const reason = e?.message || '请求失败';
      const tipText = '⚠️ 平台无法访问，请在下方修正平台配置。';
      const marker = platform
        ? `\n[[PLATFORM_CONFIG:edit:${platform.id}]]`
        : '\n[[PLATFORM_CONFIG:create]]';
      const fullContent = `${tipText}\n@@REASON@@\n${reason}${marker}`;

      const msgs = store.currentMessages;
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant' && !last.content) {
        await store.updateMessage(last.id, { content: fullContent });
      } else if (store.currentConvId) {
        await store.addMessage({
          conversationId: store.currentConvId,
          role: 'assistant',
          content: fullContent,
        });
      }
      await nextTick();
      scrollToBottom();
    }
  }

  function stopChat() {
    store.stop();
  }

  async function regenerateMsg() {
    if (!store.currentConvId || store.streaming) return;
    const model = platformStore.models.find((m) => m.id === selectedModelId.value);
    const platform = platformStore.platforms.find((p) => p.id === model?.platformId);
    if (!platform || !model) { ElMessage.error('平台或模型不存在'); return; }
    try {
      const agent = agentStore.selectedAgent;
      await store.regenerate(platform, model, undefined, {
        temperature: agent?.temperature,
        maxTokens: agent?.maxTokens,
        topP: agent?.topP,
        frequencyPenalty: agent?.frequencyPenalty,
        presencePenalty: agent?.presencePenalty,
        reasoningEffort: (agent?.config as any)?.reasoningEffort || undefined,
      });
    } catch (e: any) {
      ElMessage.error(e?.message || '重新生成失败');
    }
  }

  function shouldShowMessage(msg: Message): boolean {
    if (msg.role === 'system' || msg.role === 'tool') return false;
    if (msg.role === 'assistant' && !msg.content && msg.toolCalls?.length) return false;
    return true;
  }

  function collectToolCalls(msg: Message): any[] {
    const msgIndex = store.currentMessages.indexOf(msg);
    if (msgIndex < 0) return msg.toolCalls || [];
    if (msg.role !== 'assistant' || !msg.content) return msg.toolCalls || [];
    const allCalls = [...(msg.toolCalls || [])];
    for (let i = msgIndex - 1; i >= 0; i--) {
      const prev = store.currentMessages[i];
      if (prev.role === 'tool') continue;
      if (prev.role === 'assistant' && !prev.content && prev.toolCalls?.length) {
        allCalls.unshift(...prev.toolCalls);
      } else {
        break;
      }
    }
    return allCalls;
  }

  const filteredFiles = computed(() => {
    if (!fileSearch.value.trim()) return workspaceFiles.value;
    const q = fileSearch.value.toLowerCase();
    return workspaceFiles.value.filter((f) => f.name.toLowerCase().includes(q));
  });

  async function loadWorkspaceFiles() {
    try {
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const adapter = getPlatformAdapter();
      const filesDir = 'workspace/files';
      const exists = await adapter.fs.exists(filesDir);
      if (!exists) {
        await adapter.fs.mkdir(filesDir);
        workspaceFiles.value = [];
        return;
      }
      const entries = await adapter.fs.readDir(filesDir);
      const result: Array<{ name: string; path: string; size: number; isDir: boolean }> = [];
      for (const entry of entries) {
        const p = filesDir + '/' + entry;
        const entryExists = await adapter.fs.exists(p);
        if (!entryExists) continue;
        result.push({ name: entry, path: p, size: 0, isDir: false });
      }
      result.sort((a: any, b: any) => a.name.localeCompare(b.name));
      workspaceFiles.value = result;
    } catch (e) {
      console.error('loadWorkspaceFiles error:', e);
    }
  }

  async function previewFile(f: { name: string; path: string; isDir: boolean }) {
    if (f.isDir) return;
    store.previewingFile = { name: f.name, path: f.path };
    store.rightPanelTab = 'file';
    store.rightPanelOpen = true;
    store.showFilePopup = false;
  }

  function toggleFileSelect(path: string) {
    const next = new Set(selectedFilePaths.value);
    if (next.has(path)) next.delete(path); else next.add(path);
    selectedFilePaths.value = next;
  }

  function triggerFilePanelUpload() { filePanelUploadRef.value?.click(); }

  async function handleFilePanelUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;
    try {
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const adapter = getPlatformAdapter();
      const convId = store.currentConvId || 'default';
      const filesDir = 'workspace/uploads/' + convId;
      const dirExists = await adapter.fs.exists(filesDir);
      if (!dirExists) await adapter.fs.mkdir(filesDir);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fileId = 'f_' + crypto.randomUUID().slice(0, 12);
        const newName = fileId + '_' + f.name;
        const newPath = filesDir + '/' + newName;
        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(f);
        });
        await adapter.fs.writeFile(newPath, content);
        if (store.currentConvId) {
          try {
            await fileStore.registerFile({
              conversationId: store.currentConvId,
              name: f.name,
              path: newPath,
              category: 'upload',
              mimeType: f.type,
              size: f.size,
              source: 'user',
            });
          } catch (err) { console.warn('[Chat] 注册上传文件失败:', err); }
        }
      }
      await loadWorkspaceFiles();
      ElMessage.success('已上传 ' + files.length + ' 个文件');
    } catch (e: any) {
      ElMessage.error('上传失败: ' + (e?.message || e));
    }
    target.value = '';
  }

  async function deleteFileItem(f: { path: string; name: string }) {
    try {
      await ElMessageBox.confirm('确认删除「' + f.name + '」？', '提示', { type: 'warning' });
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const adapter = getPlatformAdapter();
      await adapter.fs.remove(f.path);
      selectedFilePaths.value.delete(f.path);
      await loadWorkspaceFiles();
      ElMessage.success('已删除');
    } catch { /* cancelled */ }
  }

  function scrollToTop() { if (messagesRef.value) messagesRef.value.scrollTo({ top: 0, behavior: 'smooth' }); }
  function scrollToBottom() { if (messagesRef.value) messagesRef.value.scrollTo({ top: messagesRef.value.scrollHeight, behavior: 'smooth' }); }
  function scrollToRound(ri: number) {
    activeNavRound.value = ri;
    const group = document.querySelector(`[data-round="${ri}"]`) as HTMLElement;
    if (!group) return;
    group.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleScroll() {
    const el = messagesRef.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    const canScroll = el.scrollHeight > el.clientHeight;
    showScrollBottom.value = canScroll && !atBottom;
    showScrollTop.value = canScroll && el.scrollTop > el.clientHeight;
    updateActiveNavRound(el);
  }

  function updateActiveNavRound(el: HTMLElement) {
    const indices = userRoundIndices.value;
    if (indices.length === 0) { activeNavRound.value = null; return; }
    let lastVisible: number | null = null;
    for (const ri of indices) {
      const group = el.querySelector(`[data-round="${ri}"]`) as HTMLElement;
      if (!group) continue;
      const relTop = group.getBoundingClientRect().top - el.getBoundingClientRect().top;
      if (relTop < el.clientHeight / 2) {
        lastVisible = ri;
      }
    }
    activeNavRound.value = lastVisible !== null ? lastVisible : indices[0];
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function toggleReasoning(id: string) { expandedReasoning[id] = !expandedReasoning[id]; }
  function toggleTool(key: string) { expandedTools[key] = !expandedTools[key]; }
  function toggleToolGroup(msgId: string) { expandedToolGroups[msgId] = !expandedToolGroups[msgId]; }
  function toggleMsgCollapse(msgId: string) { collapsedMessages[msgId] = !collapsedMessages[msgId]; }

  const collapsedByAuto = new Set<string>();

  function collapseEarlyOnMobile() {
    const isMobile = window.innerWidth <= 767;
    if (!isMobile) return;
    for (const id of collapsedByAuto) {
      if (collapsedMessages[id]) collapsedMessages[id] = false;
    }
    collapsedByAuto.clear();
    const rounds = messageRounds.value;
    let runningLen = 0;
    const THRESHOLD = 600;
    for (let ri = 0; ri < rounds.length - 1; ri++) {
      const r = rounds[ri];
      const userLen = (r.user?.content || '').length;
      const asstLen = (r.finalAssistant?.content || '').length;
      runningLen += userLen + asstLen;
      if (runningLen > THRESHOLD && ri < rounds.length - 2) {
        if (r.user) { collapsedMessages[r.user.id] = true; collapsedByAuto.add(r.user.id); }
        if (r.finalAssistant) { collapsedMessages[r.finalAssistant.id] = true; collapsedByAuto.add(r.finalAssistant.id); }
      }
    }
  }
  function toggleAgentProcess(key: string) { expandedAgentProcess[key] = !expandedAgentProcess[key]; }
  function toggleStepTools(key: string) { expandedStepTools[key] = !expandedStepTools[key]; }

  function isLastRoundStreaming(round: MessageRound, ri: number): boolean {
    return ri === messageRounds.value.length - 1 &&
      store.streaming &&
      !round.finalAssistant?.content;
  }

  function getStepToolResult(step: { toolResults: Array<{ callId: string; content: string; isError: boolean }> }, tcId: string): string | null {
    const found = step.toolResults.find(r => r.callId === tcId);
    return found?.content || null;
  }
  function isStepToolError(step: { toolResults: Array<{ callId: string; content: string; isError: boolean }> }, tcId: string): boolean {
    const found = step.toolResults.find(r => r.callId === tcId);
    return found?.isError || false;
  }
  function isStepToolsRunning(step: { toolCalls: any[]; toolResults: Array<{ callId: string; content: string; isError: boolean }> }): boolean {
    return step.toolCalls.some((tc: any) => !step.toolResults.some(r => r.callId === tc.id));
  }
  function isStepToolsError(step: { toolCalls: any[]; toolResults: Array<{ callId: string; content: string; isError: boolean }> }): boolean {
    return step.toolCalls.length > 0 && step.toolCalls.every((tc: any) =>
      step.toolResults.some(r => r.callId === tc.id && r.isError)
    );
  }
  function getStepToolGroupClass(step: { toolCalls: any[]; toolResults: Array<{ callId: string; content: string; isError: boolean }> }): string {
    if (isStepToolsRunning(step)) return 'group-running';
    if (isStepToolsError(step)) return 'group-error';
    return 'group-ok';
  }
  function getStepToolStatusClass(step: { toolResults: Array<{ callId: string; content: string; isError: boolean }> }, tcId: string): string {
    const found = step.toolResults.find(r => r.callId === tcId);
    if (!found) return 'tool-status-running';
    return found.isError ? 'tool-status-error' : 'tool-status-ok';
  }

  function isToolGroupRunning(toolCalls: any[]): boolean {
    return toolCalls.some((tc: any) => !getToolResult(tc.id));
  }
  function isToolGroupError(toolCalls: any[]): boolean {
    return toolCalls.length > 0 && toolCalls.every((tc: any) => getToolResult(tc.id) && isToolError(tc.id));
  }
  function getToolGroupStatusClass(_msg: any, toolCalls: any[]): string {
    if (isToolGroupRunning(toolCalls)) return 'group-running';
    if (isToolGroupError(toolCalls)) return 'group-error';
    return 'group-ok';
  }

  function resolveToolDisplay(tc: any): { server: string; tool: string } {
    const rawName = tc.function?.name || tc.toolName || tc.id || '';
    let m = rawName.match(/^mcp_(.{1,8}?)__(.+)$/);
    if (m) {
      const server = mcpStore.servers.find(s => s.id.startsWith(m![1]));
      return { server: server?.name || m[1], tool: m[2] };
    }
    m = rawName.match(/^mcp_([0-9a-f-]{36})_(.+)$/);
    if (m) {
      const server = mcpStore.servers.find(s => s.id === m![1]);
      return { server: server?.name || m[1].slice(0, 8), tool: m[2] };
    }
    if (tc.mcpServerId) {
      const server = mcpStore.servers.find(s => s.id === tc.mcpServerId);
      return { server: server?.name || tc.mcpServerId.slice(0, 8), tool: tc.toolName || rawName };
    }
    return { server: 'MCP', tool: rawName };
  }

  function resolveToolArgs(tc: any): string {
    const args = tc.function?.arguments ?? tc.arguments;
    if (!args) return '{}';
    if (typeof args === 'string') {
      try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; }
    }
    return safeJson(args);
  }

  function safeJson(v: unknown): string {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }

  function isToolError(toolCallId: string): boolean {
    const toolMsg = store.currentMessages.find(m => m.role === 'tool' && m.toolCallId === toolCallId);
    if (!toolMsg?.content) return false;
    try {
      const parsed = JSON.parse(toolMsg.content);
      return !!parsed?.isError;
    } catch { return false; }
  }

  function getToolStatusClass(toolCallId: string): string {
    if (!getToolResult(toolCallId)) return 'tool-status-running';
    return isToolError(toolCallId) ? 'tool-status-error' : 'tool-status-ok';
  }

  function getToolResult(toolCallId: string): string | null {
    const toolMsg = store.currentMessages.find(m => m.role === 'tool' && m.toolCallId === toolCallId);
    if (!toolMsg?.content) return null;
    try {
      const parsed = JSON.parse(toolMsg.content);
      if (parsed?.isError) return JSON.stringify(parsed, null, 2);
      if (parsed?.content?.length) {
        const texts = parsed.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
        if (texts) return texts;
      }
      if (typeof parsed === 'string') return parsed;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return toolMsg.content;
    }
  }

  async function copyMsg(msg: Message) {
    try { await navigator.clipboard.writeText((msg.content || '').replace(/\n+$/, '')); ElMessage.success('已复制'); }
    catch { ElMessage.error('复制失败'); }
  }

  async function editMsg(msg: Message) {
    input.value = msg.content || '';
    await nextTick();
    const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement;
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  async function delMsg(msg: Message) { await store.deleteMessage(msg.id); }

  function openConvMenu(e: MouseEvent, conv: Conversation) {
    ctxMenu.visible = true; ctxMenu.x = e.clientX; ctxMenu.y = e.clientY; ctxMenu.conv = conv;
  }
  function closeCtxMenu() { ctxMenu.visible = false; closeSpaceMenu(); }
  async function togglePin(conv: Conversation | null) {
    if (!conv) return;
    await store.updateConversation(conv.id, { pinned: !conv.pinned });
    closeCtxMenu();
  }
  function startRename(conv: Conversation) {
    renamingId.value = conv.id; renamingTitle.value = conv.title;
    closeCtxMenu(); nextTick(() => renameInputRef.value?.focus?.());
  }
  async function commitRename() {
    if (!renamingId.value) return;
    const title = renamingTitle.value.trim();
    if (title && title !== store.conversations.find((c) => c.id === renamingId.value)?.title) {
      await store.updateConversation(renamingId.value, { title });
    }
    renamingId.value = '';
  }
  async function deleteConv(conv: Conversation | null) {
    if (!conv) return;
    closeCtxMenu();
    try {
      await ElMessageBox.confirm(`删除会话"${conv.title}"？`, '提示', { type: 'warning' });
      await store.deleteConversation(conv.id);
      ElMessage.success('已删除');
    } catch {}
  }

  function toggleConvSelect(id: string) {
    const next = new Set(selectedConvIds.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedConvIds.value = next;
  }
  function batchSelectAll() {
    selectedConvIds.value = new Set(filteredConversations.value.map(c => c.id));
  }
  async function batchDeleteConvs() {
    if (selectedConvIds.value.size === 0) return;
    try {
      await ElMessageBox.confirm(`删除 ${selectedConvIds.value.size} 个会话？`, '提示', { type: 'warning' });
      await store.deleteConversations([...selectedConvIds.value]);
      selectedConvIds.value = new Set();
      batchMode.value = false;
      ElMessage.success('已删除');
    } catch {}
  }

  async function saveMountToDb(convId: string) {
    const serverIds = Object.keys(mountToolSelection).filter(sid => (mountToolSelection[sid] || []).length > 0);
    if (serverIds.length === 0) return;
    const disabled: Record<string, string[]> = {};
    const aliases = JSON.parse(JSON.stringify(toolAliasMap));
    for (const sid of serverIds) {
      const all = (mcpStore.tools[sid] || []).map(t => t.name);
      const sel = mountToolSelection[sid] || [];
      const diff = all.filter(n => !sel.includes(n));
      if (diff.length > 0) disabled[sid] = diff;
    }
    await store.updateConversation(convId, {
      mcpServerIds: serverIds,
      _mcpDisabledTools: disabled,
      _mcpToolAliases: aliases,
    });
  }

  async function saveMount() {
    store.mountedMcpServers = Object.keys(mountToolSelection).filter(sid => (mountToolSelection[sid] || []).length > 0);
    const disabled: Record<string, string[]> = {};
    for (const sid of store.mountedMcpServers) {
      const all = (mcpStore.tools[sid] || []).map(t => t.name);
      const sel = mountToolSelection[sid] || [];
      const diff = all.filter(n => !sel.includes(n));
      if (diff.length > 0) disabled[sid] = diff;
    }
    store.mcpDisabledTools = disabled;
    store.mcpToolAliases = JSON.parse(JSON.stringify(toolAliasMap));
    if (store.currentConvId) {
      await store.updateConversation(store.currentConvId, {
        mcpServerIds: [...store.mountedMcpServers],
        _mcpDisabledTools: disabled,
        _mcpToolAliases: JSON.parse(JSON.stringify(toolAliasMap)),
        skillIds: [...mountedSkillIds.value],
      });
    }
    showMount.value = false;
  }
  async function saveSkills() {
    if (store.currentConvId) {
      await store.updateConversation(store.currentConvId, { skillIds: [...mountedSkillIds.value] });
    }
    showSkills.value = false;
  }

  return {
    store, platformStore, mcpStore, skillStore, agentStore, authStore, spaceStore, fileStore, distillStore, isMobile,
    showDistill, distillMessages, distillUserMsg, distillAssistantMsg,
    askText, askSupplement, askSingle, askChecked, askShowText, askDialogVisible, askMultiSelect, resetAskForm, onAskSubmit, onAskSkip, onAskDialogClose,
    confirmText, confirmSingle, confirmChecked, confirmShowText, confirmSupplement, confirmDialogVisible, confirmCurrentPage, confirmMultiSelect, resetConfirmForm, onConfirmNext, onConfirmSkip, onConfirmDialogClose,
    platformConfigSaving, manualPlatformConfigVisible, platformConfigForm, platformConfigDialogVisible, resetPlatformConfigForm, openPlatformConfig, onPlatformConfigSubmit, onPlatformConfigCancel, onPlatformConfigClose,
    input, inputFocused, fileInputRef, uploadedFiles,
    showScrollBottom, showScrollTop,
    browserActive, currentBrowserLabel, closeRightPanel, toggleRightPanel,
    expandedFileCategories, fileSearch, workspaceFiles, selectedFilePaths, filePanelUploadRef, search, messagesRef, showMount, showSkills, skillSearch, filteredSkillStore, toggleSkillMount,
    selectedModelId, expandedReasoning, expandedTools, expandedToolGroups, collapsedToolGroups, collapsedMessages, expandedAgentProcess, expandedStepTools, activeNavRound,
    userRoundIndices, mountedSkillIds, drawerOpen, convCollapsed, sideTab, batchMode, selectedConvIds,
    mountToolSelection, toolAliasMap, mountSearch, collapsedServers, toggleServerCollapse, filteredTools, initMountSelection, isToolMounted, toggleMountTool, isAllToolsMounted, toggleAllTools, setToolAlias,
    showAgentEdit, editingAgent, debugMode,
    showWorkspaceDir, workspaceDir, loadWorkspaceDir, onWorkspaceDirSelected,
    tryParseSnapshot, formatSnapshot, snapshotDialog, snapshotActiveTab, currentSnapshots, openSnapshotDialog,
    isDraftMode, renamingId, renamingTitle, renameInputRef, ctxMenu,
    md, renderMarkdown, handleContentClick,
    currentConv, filteredConversations, messageRounds, isToolErrorContent,
    chatModels, modelGroups, mountableServers, tokenCount, contextLimit, tokenPercent, tokenBarColor, canSend,
    openEditAgent, openCreateAgent, onAgentSaved, onAgentDeleted,
    showSpaceEdit, spaceEditForm, spaceMenuTarget, selectSpace, createSpaceQuick, openSpaceEdit, saveSpaceEdit, deleteSpaceConfirm, openSpaceMenu, closeSpaceMenu, moveConvToSpace,
    fileCategories, previewInPopup, showConvFileMenu, reclassifyConvFile,
    onAgentSwitch, onModelChange,
    parseConfigCard, displayAssistantContent, getEditPlatform, getEditReason, onConfigSaved,
    startNewChat, selectConv, triggerFileUpload, handleFileChange, removeFile, formatSize, send, stopChat, regenerateMsg, shouldShowMessage, collectToolCalls,
    filteredFiles, loadWorkspaceFiles, previewFile, toggleFileSelect, triggerFilePanelUpload, handleFilePanelUpload, deleteFileItem,
    scrollToTop, scrollToBottom, scrollToRound, handleScroll, updateActiveNavRound, formatTime,
    toggleReasoning, toggleTool, toggleToolGroup, toggleMsgCollapse, collapseEarlyOnMobile, toggleAgentProcess, toggleStepTools, isLastRoundStreaming,
    getStepToolResult, isStepToolError, isStepToolsRunning, isStepToolsError, getStepToolGroupClass, getStepToolStatusClass,
    isToolGroupRunning, isToolGroupError, getToolGroupStatusClass, resolveToolDisplay, resolveToolArgs, safeJson, isToolError, getToolStatusClass, getToolResult,
    copyMsg, editMsg, delMsg, openConvMenu, closeCtxMenu, togglePin, startRename, commitRename, deleteConv, toggleConvSelect, batchSelectAll, batchDeleteConvs,
    saveMountToDb, saveMount, saveSkills,
  };
}

let instance: ReturnType<typeof createChat> | null = null;

export function useChat() {
  if (!instance) instance = createChat();
  return instance;
}

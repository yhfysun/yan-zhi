import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { clampMenuPos } from '../../utils/menuPosition';
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
  useSettingsStore,
} from '../../stores';
import { useGitStore } from '../../stores/git';
import { isCodeModeActive, useCodeStore } from '../../stores/code';
import { useIsMobile } from '../useIsMobile';
import { useRouter } from 'vue-router';
import { api } from '../../api/client';
import type { Agent, Message, Conversation, Platform } from '@yan-zhi/shared';
import { estimateTokens, CHAT_MODEL_TYPES } from '@yan-zhi/shared';
import { sceneByKey, type SceneKey } from '../../config/scenes';

export interface AgentStep {
  reasoningContent?: string;
  toolCalls: any[];
  toolResults: Array<{ callId: string; content: string; isError: boolean }>;
  partialContent?: string;
  subAgentRounds?: SubAgentRound[];
  /** 关联的真实助手消息 id，用于匹配交付文件等按消息 id 索引的资源 */
  messageId?: string;
}

export interface SubAgentRound {
  toolCallId: string;
  subAgentId: string;
  subAgentName?: string;
  depth: number;
  steps: AgentStep[];
  finalContent?: string;
}

export interface MessageRound {
  user: Message | null;
  steps: AgentStep[];
  allToolCalls: any[];
  finalAssistant: Message | null;
  hasAgentProcess?: boolean;
  agentStats?: { stepCount: number; reasoningCount: number; toolCallCount: number };
  /** 子智能体最终结果（已从 call_agent 工具结果提上来，直接在主内容区展示） */
  subAgentResults?: Array<{ subAgentName: string; finalContent: string }>;
}

interface ParsedConfigCard {
  tip: string;
  reason?: string;
  mode: 'create' | 'edit';
  platformId?: string;
}

function createChat() {
  const router = useRouter();
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
  const platformConfigEditId = ref('');
  const platformConfigForm = ref({
    name: '',
    protocol: 'openai',
    apiUrl: '',
    apiKey: '',
    pauseMinMs: 0,
    pauseMaxMs: 0,
    modelId: '',
    alias: '',
    contextWindow: 131072,
  });
  const platformConfigDialogVisible = computed({
    get: () => !!store.pendingPlatformConfig || manualPlatformConfigVisible.value,
    set: (v: boolean) => { if (!v) onPlatformConfigClose(); },
  });

  function resetPlatformConfigForm() {
    platformConfigEditId.value = '';
    const prefill = store.pendingPlatformConfig?.prefill;
    platformConfigForm.value = {
      name: prefill?.name || '',
      protocol: prefill?.protocol || 'openai',
      apiUrl: prefill?.apiUrl || '',
      apiKey: prefill?.apiKey || '',
      pauseMinMs: 0,
      pauseMaxMs: 0,
      modelId: prefill?.modelId || '',
      alias: prefill?.alias || '',
      contextWindow: Number.isFinite(Number(prefill?.contextWindow))
        ? Number(prefill?.contextWindow)
        : 131072,
    };
  }

  /**
   * 打开模型平台配置弹窗：手动新建平台 + 模型，保存后自动拉取模型列表并设为默认。
   */
  function openPlatformConfig() {
    const agent = agentStore.selectedAgent;
    const platform = agent?.platformId
      ? platformStore.platforms.find((p) => p.id === agent.platformId)
      : undefined;
    if (platform) {
      const model = agent?.modelId
        ? platformStore.models.find((m) => m.platformId === platform.id && m.modelId === agent.modelId)
        : undefined;
      platformConfigEditId.value = platform.id;
      platformConfigForm.value = {
        name: platform.name,
        protocol: platform.protocol || 'openai',
        apiUrl: platform.apiUrl,
        apiKey: '',
        pauseMinMs: platform.pauseMinMs || 0,
        pauseMaxMs: platform.pauseMaxMs || 0,
        modelId: model?.modelId || agent?.modelId || '',
        alias: model?.alias || '',
        contextWindow: model?.contextWindow || 131072,
      };
    } else {
      resetPlatformConfigForm();
    }
    manualPlatformConfigVisible.value = true;
  }

  async function onPlatformConfigSubmit() {
    const f = platformConfigForm.value;
    const isEdit = !!platformConfigEditId.value;
    if (!f.name.trim() || !f.apiUrl.trim()) {
      ElMessage.warning('平台名称和 API URL 为必填');
      return;
    }
    if (!isEdit && !f.modelId.trim()) {
      ElMessage.warning('模型 ID 为必填');
      return;
    }
    platformConfigSaving.value = true;
    try {
      let platformId: string;
      if (isEdit) {
        platformId = platformConfigEditId.value;
        const patch: any = {
          name: f.name.trim(),
          protocol: f.protocol as any,
          apiUrl: f.apiUrl.trim(),
          pauseMinMs: f.pauseMinMs,
          pauseMaxMs: f.pauseMaxMs,
        };
        await platformStore.updatePlatform(platformId, patch);
        if (f.apiKey.trim()) {
          await platformStore.addApiKey(platformId, f.apiKey.trim());
        }
      } else {
        platformId = await platformStore.addPlatform({
          name: f.name.trim(),
          protocol: f.protocol as any,
          apiUrl: f.apiUrl.trim(),
          apiKeyEnc: f.apiKey.trim(),
          headers: {},
          status: 'unknown',
          pauseMinMs: f.pauseMinMs,
          pauseMaxMs: f.pauseMaxMs,
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
      }
      // 平台创建/更新后自动拉取远程模型列表（失败仅提示，回退手动填写的模型）
      let remoteIds: string[] = [];
      try {
        remoteIds = await platformStore.fetchRemoteModels(platformId);
      } catch (e: any) {
        ElMessage.warning('拉取远程模型失败：' + (e?.message || '未知错误') + '，已回退到手动填写的模型');
      }
      // 优先选远程列表里第一个可用的对话模型；拉取失败/无可用模型时回退手动填写的模型
      const pickedModel = remoteIds.length > 0
        ? platformStore.models.find((m) => m.platformId === platformId && m.enabled && CHAT_MODEL_TYPES.includes(m.type))
        : undefined;
      const model = pickedModel
        || platformStore.models.find((m) => m.platformId === platformId && m.modelId === f.modelId.trim());
      if (model) {
        selectedModelId.value = model.id;
        await settingsStore.update({ defaultPlatformId: platformId, defaultModelId: model.id });
        if (agentStore.selectedAgent) {
          agentStore.updateAgent(agentStore.selectedId, { modelId: model.modelId, platformId: model.platformId });
        }
      }
      const message = isEdit
        ? `已更新模型平台「${f.name.trim()}」配置`
        : pickedModel
          ? `已创建模型平台「${f.name.trim()}」，拉取到 ${remoteIds.length} 个模型并默认选用 ${model?.modelId || f.modelId.trim()}`
          : `已创建模型平台「${f.name.trim()}」并添加模型 ${f.modelId.trim()}`;
      if (store.pendingPlatformConfig) {
        store.submitPlatformConfig({ cancelled: false, platformId, modelId: model?.modelId || f.modelId.trim(), message });
      }
      manualPlatformConfigVisible.value = false;
      ElMessage.success(message);
      resetPlatformConfigForm();
    } catch (e: any) {
      ElMessage.error(isEdit ? '更新失败: ' + (e?.message || e) : '创建失败: ' + (e?.message || e));
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
  // browserSteps 首次出现：确保 browser tab 存在并展开面板（browser_navigate 桥接已自带 openTab，
  // 此处兜底其他 browser_* 工具只 push step 不开 tab 的场景）
  watch(() => store.browserSteps.length, (n, o) => {
    if (o === 0 && n > 0) {
      if (!store.previewTabs.some((t) => t.kind === 'browser')) {
        store.openTab({ kind: 'browser', name: '浏览器', url: '' });
      } else {
        store.rightPanelOpen = true;
      }
    }
    // n===0 时不强制切回 file，避免清空时面板闪一下；保留当前 tab（默认 file/git）
  });
  // 桌面端：右侧面板开合 / tab 切换与原生 BrowserView 图层联动，避免关闭面板后即梦页面仍浮在窗口上
  watch(() => store.rightPanelOpen, (open) => {
    const api = (window as any).electronAPI?.browserView;
    if (!api) return;
    if (!open) { try { api.hide(); } catch { /* ignore */ } }
  }, { flush: 'sync' });
  watch(() => store.rightPanelTab, (tab) => {
    const api = (window as any).electronAPI?.browserView;
    if (!api) return;
    if (tab !== 'browser') { try { api.hide(); } catch { /* ignore */ } }
  }, { flush: 'sync' });
  function closeRightPanel() {
    store.rightPanelOpen = false;
  }
  function toggleRightPanel() {
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
  /** 子智能体结果卡片的折叠状态（无值 = 默认展开，与工具"结束后默认折叠"相反） */
  const collapsedSubAgentResults = reactive<Record<string, boolean>>({});
  /** 主智能体「任务结果」卡片的折叠状态（无值 = 默认展开） */
  const collapsedMainResults = reactive<Record<string, boolean>>({});

  const activeNavRound = ref<number | null>(null);

  const mountedSkillIds = ref<string[]>([]);

  // ===== 会话场景（对齐 WorkBuddy 新任务页三卡片：日常办公 / 代码开发 / 设计创意）=====
  // 场景区分方式：① 场景系统提示词（发送首条消息时注入会话 system_prompt）
  //              ② 默认挂载 Skill（按关键词匹配技能库自动挂载）
  //              ③ 欢迎卡片示例引导语（ChatWelcome 展示）
  const SCENE_LS_KEY = 'yz_scene_mode';
  const sceneMode = ref<SceneKey>((localStorage.getItem(SCENE_LS_KEY) || '') as SceneKey);
  const sceneSkillCount = ref(0);
  const currentScene = computed(() => sceneByKey(sceneMode.value));
  function persistScene() {
    try { localStorage.setItem(SCENE_LS_KEY, sceneMode.value || ''); } catch { /* ignore */ }
  }
  /** 选择场景：切换场景绑定的智能体（日常办公=日常办公助手 / 代码开发=代码编写助手 / 设计创意=设计创意助手），
   *  并在草稿态把挂载重置为「场景智能体自带 Skill ∪ 场景关键词匹配 Skill」 */
  function setScene(key: Exclude<SceneKey, ''>) {
    sceneMode.value = key;
    persistScene();
    const scene = sceneByKey(key);
    if (!scene) return;
    // 场景联动切换智能体（onAgentSwitch 会同步更新当前会话 agent_id；草稿态只改选中）
    if (scene.agentId && agentStore.agents.some((a) => a.id === scene.agentId) && agentStore.selectedId !== scene.agentId) {
      onAgentSwitch(scene.agentId);
    }
    const matched = skillStore.skills
      .filter((s) => {
        const hay = ((s.name || '') + ' ' + (s.description || '')).toLowerCase();
        return scene.skillKeywords.some((k) => hay.includes(k));
      })
      .map((s) => s.id);
    sceneSkillCount.value = matched.length;
    if (!store.currentConvId) {
      const agentSkills = agentStore.selectedAgent?.skillIds ? [...agentStore.selectedAgent.skillIds] : [];
      mountedSkillIds.value = [...new Set([...agentSkills, ...matched])];
    }
  }
  function clearScene() {
    sceneMode.value = '';
    sceneSkillCount.value = 0;
    persistScene();
    // 不选场景 = 回到默认日常办公助手（日常办公），挂载还原为默认智能体自带 Skill
    if (!store.currentConvId) {
      const defAgent = agentStore.agents.find((a) => a.isDefault);
      if (defAgent && agentStore.selectedId !== defAgent.id) onAgentSwitch(defAgent.id);
      mountedSkillIds.value = defAgent?.skillIds ? [...defAgent.skillIds] : [];
    }
  }

  // 对话左侧栏第三个 tab「文件」（资源管理器/搜索/Git）：选中带目录的空间时展示内容
  const drawerOpen = ref(false);
  const convCollapsed = ref(false);
  const sideTab = ref<'chat' | 'task' | 'file'>('chat');
  const contextSidebarOpen = ref(false);
  const batchMode = ref(false);
  const selectedConvIds = ref<Set<string>>(new Set());

  const mountToolSelection = reactive<Record<string, string[]>>({});
  const toolAliasMap = reactive<Record<string, Record<string, string>>>({});
  const mountSearch = ref('');
  const collapsedServers = reactive<Record<string, boolean>>({});

  function toggleContextSidebar() {
    contextSidebarOpen.value = !contextSidebarOpen.value;
  }

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
  const settingsStore = useSettingsStore();
  // 对外暴露，UI 展示用（未设置时显示 'workspace'）
  const workspaceDir = computed(() => settingsStore.settings.workspaceDir || 'workspace');
  // 是否已真实设置工作目录（区分 'workspace' 兜底显示与真正选过目录）
  const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

  async function loadWorkspaceDir() {
    if (!settingsStore.loaded) await settingsStore.load();
    // 兼容旧版独立 keyring 键，迁移到 settings 统一命名空间
    if (!settingsStore.settings.workspaceDir) {
      try {
        const { getPlatformAdapter } = await import('@yan-zhi/core');
        const saved = await getPlatformAdapter().keyring.get('settings:workspaceDir');
        if (saved) await settingsStore.update({ workspaceDir: saved });
      } catch {}
    }
    // 把当前工作目录同步给 server，作为 cmd_exec / 目录工具的默认 cwd
    await pushWorkspaceDir(settingsStore.settings.workspaceDir);
  }

  async function pushWorkspaceDir(dir: string) {
    try {
      await api.post('/workspace/dir', { dir });
    } catch {}
  }

  async function onWorkspaceDirSelected(path: string) {
    await settingsStore.update({ workspaceDir: path });
    await pushWorkspaceDir(path);

    // 选了工作目录后自动打开 Git 文件预览面板
    try {
      const gitStore = useGitStore();
      await gitStore.checkCapability();
      if (gitStore.supported) {
        const repoName = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Git';
        store.openTab({ kind: 'git', name: repoName, repoPath: path });
      }
    } catch {
      /* git 不可用时忽略 */
    }
  }

  /** 清除已选工作目录，恢复到未设置状态 */
  async function clearWorkspaceDir() {
    await settingsStore.update({ workspaceDir: '' });
    await pushWorkspaceDir('');
    // 清除后若 Git tab 正开着则关掉，避免指向不存在的目录
    try {
      const gitTab = store.previewTabs.find((t) => t.kind === 'git');
      if (gitTab) store.closePreviewTab(gitTab.id);
    } catch {
      /* ignore */
    }
  }

  function tryParseSnapshot(raw?: string): any {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  function formatSnapshot(raw?: string): string {
    if (!raw) return '（无快照数据）';
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return raw;
      // 兼容旧格式 {prompt} / {text}
      if (typeof parsed.prompt === 'string') return parsed.prompt;
      if (typeof parsed.text === 'string') return parsed.text;
      // 完整快照格式：头部摘要 + 系统提示词正文
      if (typeof parsed.systemPrompt === 'string') {
        const lines: string[] = [];
        const stepLabel = parsed.step !== undefined ? `步骤 ${parsed.step}` : '步骤 ?';
        const ts = parsed.timestamp ? ` | ${parsed.timestamp}` : '';
        lines.push(`【${stepLabel}${ts}】`);
        if (parsed.subAgent) {
          const sa = parsed.subAgent;
          const saLabel = typeof sa === 'string' ? sa : `${sa.name || sa.id || '子智能体'}${sa.depth ? `（第 ${sa.depth} 层）` : ''}`;
          lines.push(`【子智能体: ${saLabel}】`);
        }
        if (parsed.model) lines.push(`【模型: ${parsed.model.alias || ''} (${parsed.model.id || ''}) | 平台: ${parsed.platform?.name || ''} (${parsed.platform?.protocol || ''})】`);
        if (parsed.parameters) {
          const p = parsed.parameters;
          const ps = Object.entries(p).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${v}`).join(', ');
          if (ps) lines.push(`【参数: ${ps}】`);
        }
        if (Array.isArray(parsed.tools) && parsed.tools.length) lines.push(`【工具: ${parsed.tools.map((t: any) => t.name).join(', ')}】`);
        if (Array.isArray(parsed.messages) && parsed.messages.length) {
          lines.push('');
          lines.push('========== 消息历史（本轮实际发送） ==========');
          for (const m of parsed.messages) {
            lines.push(`--- [${m.role}] ---`);
            if (m.content) lines.push(String(m.content));
            // 工具调用原样输出（模型发什么结构就展示什么结构，不做任何重排/改名）
            if (Array.isArray(m.toolCalls) && m.toolCalls.length) {
              lines.push(JSON.stringify(m.toolCalls, null, 2));
            }
          }
        }
        if (parsed.input) lines.push(`【输入: ${String(parsed.input).slice(0, 200)}】`);
        lines.push('');
        lines.push('========== 系统提示词 ==========');
        lines.push(parsed.systemPrompt);
        return lines.join('\n');
      }
      return JSON.stringify(parsed, null, 2);
    } catch { return raw; }
  }

  const snapshotDialog = ref(false);
  const snapshotActiveTab = ref('');
  const snapshotLoading = ref(false);
  const currentSnapshots = ref<Array<{ id: string; label: string; content: string }>>([]);
  function buildSnapshotEntry(m: any): { id: string; label: string; content: string } {
    const parsed = tryParseSnapshot(m.systemPromptSnapshot);
    const step = parsed?.step ?? 0;
    if (m.parentToolCallId) {
      // 子智能体快照：以子智能体名标注，避免和主智能体标签混淆
      const subName = parsed?.subAgent?.name || m.subAgentName || '子智能体';
      const label = step === 0 ? `任务 → ${subName}` : `${subName}（#${step}）`;
      return { id: m.id, label, content: formatSnapshot(m.systemPromptSnapshot) };
    }
    const agentName = agentStore.selectedAgent?.name || '智能体';
    const label = step === 0 ? `Human → ${agentName}` : `${agentName}（#${step}）`;
    return { id: m.id, label, content: formatSnapshot(m.systemPromptSnapshot) };
  }

  /** 按需获取单条消息快照：内存里有直接用（本轮流式产生的消息）；历史消息走独立接口/本地库直查 */
  async function fetchSnapshotFor(m: any): Promise<string | undefined> {
    if (m.systemPromptSnapshot) return m.systemPromptSnapshot;
    try {
      if (authStore.isLoggedIn) {
        const r = await api.get<any>(`/messages/${m.id}/snapshot`);
        if ('data' in r) return (r.data as any)?.systemPromptSnapshot || undefined;
        return undefined;
      }
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const rows = await getPlatformAdapter().db.query<any>(
        'SELECT system_prompt_snapshot FROM message WHERE id = ?', [m.id],
      );
      return rows?.[0]?.system_prompt_snapshot || undefined;
    } catch { return undefined; }
  }

  async function openSnapshotDialog(userMsg: any) {
    const idx = store.currentMessages.indexOf(userMsg);
    const candidates: any[] = [];
    for (let i = idx + 1; i < store.currentMessages.length; i++) {
      const m: any = store.currentMessages[i];
      // 只在遇到主对话的用户消息时结束；子智能体的 user 消息带 parentToolCallId，不能中断收集
      if (m.role === 'user' && !m.parentToolCallId) break;
      if (m.role === 'assistant') candidates.push(m);
    }
    // 先开弹窗再异步拉取，避免大数据集卡住点击响应
    snapshotDialog.value = true;
    snapshotLoading.value = true;
    currentSnapshots.value = [];
    snapshotActiveTab.value = '';
    const entries = (await Promise.all(candidates.map(async (m) => {
      const snap = await fetchSnapshotFor(m);
      return snap ? buildSnapshotEntry({ ...m, systemPromptSnapshot: snap }) : null;
    }))).filter(Boolean) as Array<{ id: string; label: string; content: string }>;
    currentSnapshots.value = entries;
    snapshotActiveTab.value = entries[0]?.id || '';
    snapshotLoading.value = false;
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
    highlight(str: string, lang: string): string {
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
      return;
    }
    // 链接：在对话页预览面板的浏览器 tab 打开（不跳系统浏览器、不离开对话页）
    const a = t.closest('a');
    if (a) {
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        // 打开（或激活）browser tab；先置空再设，确保 BrowserPanel 的 watch currentBrowserUrl 触发（重复点同一链接也能重新导航）
        let host = href;
        try { host = new URL(href).hostname || href; } catch { /* keep raw */ }
        store.openTab({ kind: 'browser', name: host, url: href });
        if (store.currentBrowserUrl === href) store.currentBrowserUrl = '';
        nextTick(() => { store.currentBrowserUrl = href; });
      }
    }
  }

  const currentConv = computed(() => store.conversations.find((c) => c.id === store.currentConvId));
  const filteredConversations = computed(() => {
    let list = store.conversations;
    if (!search.value.trim()) return list;
    const q = search.value.toLowerCase();
    return list.filter((c) => c.title.toLowerCase().includes(q));
  });
  /** 对话根节点：未归入任何空间的会话 */
  const rootConversations = computed(() => filteredConversations.value.filter((c) => !c.spaceId));
  /** 按空间分组的会话：spaceId -> 会话列表 */
  const conversationsBySpace = computed(() => {
    const map: Record<string, typeof filteredConversations.value> = {};
    for (const sp of spaceStore.spaces) {
      map[sp.id] = filteredConversations.value.filter((c) => c.spaceId === sp.id);
    }
    return map;
  });
  /** 空间折叠状态（持久化到 localStorage） */
  const SPACE_COLLAPSE_KEY = 'yz_space_collapsed';
  const spaceCollapsed = ref<Record<string, boolean>>((() => {
    try { return JSON.parse(localStorage.getItem(SPACE_COLLAPSE_KEY) || '{}'); } catch { return {}; }
  })());
  function persistSpaceCollapse() {
    try { localStorage.setItem(SPACE_COLLAPSE_KEY, JSON.stringify(spaceCollapsed.value)); } catch { /* ignore */ }
  }
  function toggleSpaceCollapse(id: string) {
    spaceCollapsed.value[id] = !spaceCollapsed.value[id];
    persistSpaceCollapse();
  }
  /** 对话根节点折叠状态 */
  const ROOT_COLLAPSE_KEY = 'yz_conv_root_collapsed';
  const rootCollapsed = ref<boolean>(localStorage.getItem(ROOT_COLLAPSE_KEY) === '1');
  function toggleRootCollapse() {
    rootCollapsed.value = !rootCollapsed.value;
    try { localStorage.setItem(ROOT_COLLAPSE_KEY, rootCollapsed.value ? '1' : '0'); } catch { /* ignore */ }
  }

  const messageRounds = computed<MessageRound[]>(() => {
    const msgs = store.currentMessages;
    const rounds: MessageRound[] = [];
    let currentRound: MessageRound | null = null;
    const stepByToolCallId = new Map<string, AgentStep>();

    for (const msg of msgs) {
      if (msg.role === 'system') continue;
      // 子智能体消息：归入父 step 的 subAgentRounds
      if (msg.parentToolCallId) {
        const parentStep = stepByToolCallId.get(msg.parentToolCallId);
        if (!parentStep) continue;
        if (!parentStep.subAgentRounds) parentStep.subAgentRounds = [];
        let subRound = parentStep.subAgentRounds.find((r) => r.toolCallId === msg.parentToolCallId);
        if (!subRound) {
          subRound = {
            toolCallId: msg.parentToolCallId,
            subAgentId: msg.subAgentId || '',
            subAgentName: msg.subAgentName,
            depth: msg.subAgentDepth || 1,
            steps: [],
          };
          parentStep.subAgentRounds.push(subRound);
        }
        if (msg.role === 'assistant') {
          const subStep: AgentStep = {
            reasoningContent: msg.reasoningContent,
            toolCalls: msg.toolCalls || [],
            toolResults: [],
            partialContent: msg.content || undefined,
            messageId: msg.id,
          };
          subRound.steps.push(subStep);
          for (const tc of subStep.toolCalls) {
            if (tc?.id) stepByToolCallId.set(tc.id, subStep);
          }
        } else if (msg.role === 'tool') {
          for (let s = subRound.steps.length - 1; s >= 0; s--) {
            const step = subRound.steps[s];
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
        continue;
      }
      if (msg.role === 'user') {
        if (currentRound) rounds.push(currentRound);
        currentRound = { user: msg, steps: [], allToolCalls: [], finalAssistant: null };
      } else if (msg.role === 'assistant') {
        if (!currentRound) continue;
        const step: AgentStep = {
          reasoningContent: msg.reasoningContent,
          toolCalls: msg.toolCalls || [],
          toolResults: [],
          partialContent: msg.content || undefined,
          messageId: msg.id,
        };
        currentRound.steps.push(step);
        for (const tc of step.toolCalls) {
          if (tc?.id) stepByToolCallId.set(tc.id, step);
        }
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
      // 子智能体最终回答 = call_agent 工具返回结果（role=tool 且 toolCallId == subRound.toolCallId，
      // 归入父 step.toolResults）。把它提到主内容区直接展示，而非埋在工具结果的 pre 里。
      const subAgentResults: Array<{ subAgentName: string; finalContent: string }> = [];
      for (const step of round.steps) {
        if (!step.subAgentRounds) continue;
        for (const subRound of step.subAgentRounds) {
          const res = step.toolResults.find(r => r.callId === subRound.toolCallId);
          if (res && res.content) {
            subRound.finalContent = res.content;
            subAgentResults.push({ subAgentName: subRound.subAgentName || subRound.subAgentId, finalContent: res.content });
            // 清除最终回答步骤的 partialContent，避免与主内容区结果双重渲染
            const finalStep = subRound.steps.find(s => s.toolCalls.length === 0);
            if (finalStep) finalStep.partialContent = undefined;
          }
        }
      }
      if (subAgentResults.length) round.subAgentResults = subAgentResults;
      const lastStep = round.steps[round.steps.length - 1];
      if (lastStep && !lastStep.toolCalls.length) {
        round.finalAssistant = {
          id: lastStep.messageId || (round.user?.id ? round.user.id + '-fa' : 'fa'),
          conversationId: '',
          role: 'assistant',
          content: lastStep.partialContent || '',
          reasoningContent: lastStep.reasoningContent,
          createdAt: 0,
        };
        round.steps.pop();
      }
      // 兜底：历史数据（重启后加载）或中断的轮次可能没有收尾的纯文本助手消息
      // （最后一轮以工具调用/子智能体结果结束），此时 finalAssistant 为 null，
      // 主内容区的复制/下载/折叠会全部失效（引用空 id）。合成一个 finalAssistant
      // 保证旧数据交互一致；内容为空时导出会回退到子智能体结果。
      if (!round.finalAssistant && round.user && (round.steps.length > 0 || round.allToolCalls.length > 0)) {
        round.finalAssistant = {
          id: round.user.id + '-fa',
          conversationId: '',
          role: 'assistant',
          content: '',
          createdAt: 0,
        };
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
    platformStore.models.filter((m) =>
      m.enabled && CHAT_MODEL_TYPES.includes(m.type),
    ),
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
  // 仅当「当前会话」在流式时才锁定发送；其它会话并行运行时，当前空会话仍可输入/发送
  const canSend = computed(() => (!!input.value.trim() || uploadedFiles.value.length > 0) && !!selectedModelId.value && !store.isConvStreaming(store.currentConvId));

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

  const showSpaceDirPicker = ref(false);
  function createSpaceQuick() {
    showSpaceDirPicker.value = true;
  }
  /** 目录选择回调：以目录名作为空间名，绑定 dirPath */
  async function createSpaceFromDir(dirPath: string) {
    const p = (dirPath || '').trim();
    if (!p) { ElMessage.warning('未选择目录'); return; }
    const sep = p.includes('/') ? '/' : '\\';
    const baseName = p.split(sep).filter(Boolean).pop() || p;
    try {
      const id = await spaceStore.createSpace({ name: baseName, dirPath: p });
      spaceStore.selectSpace(id);
      ElMessage.success(`空间「${baseName}」已创建`);
    } catch (e: any) {
      ElMessage.error(e?.message || '创建空间失败');
    }
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

  /** 新建空间：复用空间编辑对话框，id 为空表示创建模式 */
  function openSpaceCreate() {
    spaceEditForm.value = { id: '', name: '', dirPath: '', description: '' };
    showSpaceEdit.value = true;
  }

  async function saveSpaceEdit() {
    if (!spaceEditForm.value.name.trim()) { ElMessage.warning('名称不能为空'); return; }
    const payload = {
      name: spaceEditForm.value.name.trim(),
      dirPath: spaceEditForm.value.dirPath.trim() || undefined,
      description: spaceEditForm.value.description.trim() || undefined,
    };
    if (!spaceEditForm.value.id) {
      try {
        const id = await spaceStore.createSpace(payload);
        spaceStore.selectSpace(id);
        ElMessage.success(`空间「${payload.name}」已创建`);
      } catch (e: any) {
        ElMessage.error(e?.message || '创建空间失败');
        return;
      }
    } else {
      await spaceStore.updateSpace(spaceEditForm.value.id, payload);
      ElMessage.success('空间已更新');
    }
    showSpaceEdit.value = false;
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
    spaceMenuTarget.value = { ...clampMenuPos(e), space };
  }

  function closeSpaceMenu() {
    spaceMenuTarget.value = null;
  }

  async function moveConvToSpace(convId: string, spaceId: string | null) {
    await store.updateConversation(convId, { spaceId: spaceId || undefined });
    ElMessage.success(spaceId ? '已移动到空间' : '已移出空间');
  }

  /** 发送消息时确保工作目录对应的空间存在：按 dirPath 匹配已有空间；没有则以文件夹名创建并选中。返回空间 ID（无有效工作目录/失败时返回 undefined） */
  async function ensureWorkspaceSpace(): Promise<string | undefined> {
    const wd = (settingsStore.settings.workspaceDir || '').trim();
    // 未设置、占位默认值、或 URL（可能被误设为浏览器导航 URL）时，不自动建空间
    if (!wd || wd === 'workspace' || /^https?:\/\//i.test(wd)) return undefined;
    try {
      const norm = wd.replace(/[\\/]+$/, '');
      const existed = spaceStore.spaces.find((s) => s.dirPath && s.dirPath.replace(/[\\/]+$/, '') === norm);
      if (existed) return existed.id;
      const sep = wd.includes('/') ? '/' : '\\';
      const baseName = wd.split(sep).filter(Boolean).pop() || wd;
      const newId = await spaceStore.createSpace({ name: baseName, dirPath: wd });
      spaceStore.selectSpace(newId);
      ElMessage.success(`已为工作目录创建空间「${baseName}」`);
      return newId;
    } catch (e: any) {
      console.warn('[Chat] 自动创建工作目录空间失败:', e);
      return undefined;
    }
  }

  // ========== 会话文件分类管理 ==========
  const fileCategories = [
    { key: 'upload' as const, label: '上传文件' },
    { key: 'intermediate' as const, label: '中间文件' },
    { key: 'deliverable' as const, label: '交付文件' },
  ];

  function previewInPopup(f: any) {
    store.openTab({ kind: 'file', name: f.name, path: f.path });
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

  /** 自愈：持久化的默认平台/模型若失效（被删/库重置/账号切换），回退到第一个可用对话模型 */
  async function healStalePlatform() {
    const dp = settingsStore.settings.defaultPlatformId;
    const dm = settingsStore.settings.defaultModelId;
    const dpOk = !!dp && platformStore.platforms.some((p) => p.id === dp);
    const dmOk = !!dm && platformStore.models.some((m) => m.id === dm && m.enabled);
    if (dpOk && dmOk) return;
    const firstChat = platformStore.models.find((m) => m.enabled && CHAT_MODEL_TYPES.includes(m.type));
    const fbPlatform = firstChat ? platformStore.platforms.find((p) => p.id === firstChat.platformId) : undefined;
    const nextP = fbPlatform?.id || platformStore.platforms[0]?.id || '';
    const nextM = firstChat?.id || '';
    if (nextP !== dp || nextM !== dm) {
      await settingsStore.update({ defaultPlatformId: nextP, defaultModelId: nextM });
    }
  }

  onMounted(async () => {
    await agentStore.loadAgents();
    await store.loadConversations();
    await platformStore.loadPlatforms();
    await platformStore.loadModels();
    // 自愈：持久化的默认平台/模型若已失效（被删/库重置/账号切换），回退到第一个可用平台/模型，
    // 避免 stale defaultPlatformId 触发 404 且导致聊天无法发送（消息发出去不显示）
    await healStalePlatform();
    await mcpStore.loadServers();
    await skillStore.loadSkills();
    spaceStore.loadSpaces();
    await loadWorkspaceDir();


    const agent = agentStore.selectedAgent;
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    } else {
      // 以数据库为准：优先选 is_default=1 的可用对话模型，其次 settings 里配置的默认，最后第一个
      const def = chatModels.value.find((m) => m.isDefault);
      const settingsModel = chatModels.value.find((m) => m.id === settingsStore.settings.defaultModelId);
      const first = def || settingsModel || chatModels.value[0];
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
        applyConvAgent(conv);
        if (conv?.modelId && conv?.platformId) {
          const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
          if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
        } else if (conv?.modelId) {
          const resolved = platformStore.resolveModel(conv.modelId);
          if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
        }
      } else {
        store.currentConvId = '';
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
    if (!store.isConvStreaming(store.currentConvId)) collapseEarlyOnMobile();
  }));

  watch(() => store.currentConvId, async (id) => {
    if (!id) return;
    isDraftMode.value = false;
    const conv = store.conversations.find((c) => c.id === id);
    applyConvAgent(conv);
    if (conv?.modelId && conv?.platformId) {
      const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    } else if (conv?.modelId) {
      const resolved = platformStore.resolveModel(conv.modelId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    } else {
      applyAgentModel();
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

  /** 打开历史会话时还原其绑定的智能体（会话未绑定则保持当前选择） */
  function applyConvAgent(conv?: Conversation) {
    const bindId = conv?.agentId;
    if (!bindId) return;
    if (!agentStore.agents.some((a) => a.id === bindId)) return;
    if (agentStore.selectedId !== bindId) agentStore.selectAgent(bindId);
  }

  /** 会话未指定模型时，回落到当前智能体绑定的模型 */
  function applyAgentModel() {
    const agent = agentStore.selectedAgent;
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    }
  }

  function onAgentSwitch(id: string) {
    agentStore.selectAgent(id);
    const agent = agentStore.agents.find((a) => a.id === id);
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    }
    // 同步更新当前会话的 agent_id，确保后端 list_sub_agents/call_agent 能查到正确的子智能体
    if (store.currentConvId) {
      void store.updateConversation(store.currentConvId, { agentId: id });
    }
  }

  function onModelChange(modelId: string) {
    const model = platformStore.models.find((m) => m.id === modelId);
    if (model && agentStore.selectedAgent) {
      agentStore.updateAgent(agentStore.selectedId, { modelId: model.modelId, platformId: model.platformId });
      selectedModelId.value = model.id;

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

  async function startNewChat(spaceId?: string | null) {
    store.currentConvId = '';
    isDraftMode.value = true;
    mountedSkillIds.value = [];
    input.value = '';
    quotedUrls.value = [];
    if (isCodeModeActive()) {
      setScene('code');
      if (spaceId === undefined) spaceId = useCodeStore().projectSpaceId;
    }
    if (spaceId !== undefined) {
      spaceStore.selectSpace(spaceId);
      if (spaceId) {
        const sp = spaceStore.spaces.find((s) => s.id === spaceId);
        await settingsStore.update({ workspaceDir: sp?.dirPath || '' });
      } else {
        await settingsStore.update({ workspaceDir: '' });
      }
    }
  }

  async function selectConv(id: string) {
    await store.loadMessages(id);
    isDraftMode.value = false;
    const conv = store.conversations.find((c) => c.id === id);
    applyConvAgent(conv);
    if (conv?.modelId && conv?.platformId) {
      const resolved = platformStore.resolveModel(conv.modelId, conv.platformId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    } else if (conv?.modelId) {
      const resolved = platformStore.resolveModel(conv.modelId);
      if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
    } else {
      applyAgentModel();
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

  // ===== URL 引用（浏览器 → 对话） =====
  /** 输入超过该字符数，发送时全文自动落盘为附件 */
  const LONG_INPUT_THRESHOLD = 5000;
  const quotedUrls = ref<Array<{ url: string; name: string }>>([]);
  function addQuotedUrl(url: string) {
    const u = (url || '').trim();
    if (!u) return;
    if (quotedUrls.value.some((q) => q.url === u)) { ElMessage.info('该链接已在引用中'); return; }
    let host = u;
    try { host = new URL(u).host; } catch { /* 非 URL 原样展示 */ }
    quotedUrls.value = [...quotedUrls.value, { url: u, name: host }];
    ElMessage.success('已引用到任务');
  }
  function removeQuotedUrl(url: string) {
    quotedUrls.value = quotedUrls.value.filter((q) => q.url !== url);
  }

  // 会话标题取首个非引用行，避免 `> ` 引用块污染标题
  function titleFromContent(s: string) {
    const base = (s.split('\n').find((l) => l.trim() && !l.trimStart().startsWith('>')) || s.trim()).trim().replace(/^>\s*/, '');
    return base.slice(0, 24) + (base.length > 24 ? '…' : '');
  }

  async function send() {
    if (!input.value.trim() && uploadedFiles.value.length === 0 && quotedUrls.value.length === 0) return;

    const hasPlatform = platformStore.platforms.length > 0;
    const hasModel = !!selectedModelId.value && !!platformStore.models.find((m) => m.id === selectedModelId.value);
    if (!hasPlatform || !hasModel) {
      const userContent = input.value.trim();
      if (!userContent && uploadedFiles.value.length === 0 && quotedUrls.value.length === 0) return;
      input.value = '';
      uploadedFiles.value = [];
      quotedUrls.value = [];

      // 每次发送都确保工作目录对应空间存在（幂等：已存在则复用，失败则下次仍可重试）
      let spaceId = await ensureWorkspaceSpace();
      // 代码模式：优先使用当前项目绑定的 spaceId，确保会话归入正确项目
      if (isCodeModeActive()) {
        const codeSid = useCodeStore().projectSpaceId;
        if (codeSid) spaceId = codeSid;
      }
      if (store.currentConvId && !store.conversations.some((c) => c.id === store.currentConvId)) {
        store.currentConvId = '';
      }
      if (!store.currentConvId) {
        const title = userContent ? titleFromContent(userContent) : '配置平台';
        const id = await store.createConversation(title, { skillIds: [...mountedSkillIds.value], spaceId });
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
      // 消息带 [[PLATFORM_CONFIG:create]] 标记 —— ChatMessageList 会在该消息下方渲染
      // 内嵌的模型平台配置表单卡片（与 configure_model_platform 工具的交互形态一致），不弹浏览器弹窗
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
    let model = platformStore.models.find((m) => m.id === selectedModelId.value);
    let platform: Platform | undefined = platformStore.platforms.find((p) => p.id === model?.platformId);
    if (!platform || !model) {
      // 自愈回退：选第一个可用的对话模型，避免 stale 平台导致整条消息发不出去也不显示
      const alt = platformStore.models.find((m) => m.enabled && CHAT_MODEL_TYPES.includes(m.type));
      if (alt) {
        const altPlatform = platformStore.platforms.find((p) => p.id === alt.platformId);
        if (altPlatform) {
          model = alt;
          platform = altPlatform;
          selectedModelId.value = alt.id;
          await settingsStore.update({ defaultPlatformId: altPlatform.id, defaultModelId: alt.id });
        }
      }
    }
    if (!platform || !model) {
      ElMessage.error('未配置可用的模型平台，请先到「设置 → 模型平台」添加并启用一个模型');
      return;
    }

    if (!CHAT_MODEL_TYPES.includes(model.type)) {
      ElMessage.warning('「' + (model.alias || model.modelId) + '」不是对话模型（类型：' + model.type + '），不支持聊天功能');
      return;
    }

    const files = [...uploadedFiles.value];
    uploadedFiles.value = [];

    let userContent = content;
    if (files.length > 0) {
      userContent = content || '请分析以下文件';
    } else if (!content.trim() && quotedUrls.value.length > 0) {
      userContent = '请参考以下网页';
    }

    if (!userContent.trim()) { ElMessage.warning('请输入消息'); return; }

    if (store.currentConvId && !store.conversations.some((c) => c.id === store.currentConvId)) {
      store.currentConvId = '';
    }

    try {
      const agent = agentStore.selectedAgent;
      // 每次发送都确保工作目录对应空间存在（幂等：已存在则复用，失败则下次仍可重试）
      let spaceId = await ensureWorkspaceSpace();
      // 代码模式：优先使用当前项目绑定的 spaceId，确保会话归入正确项目
      if (isCodeModeActive()) {
        const codeSid = useCodeStore().projectSpaceId;
        if (codeSid) spaceId = codeSid;
      }
      if (!store.currentConvId) {
        const title = titleFromContent(userContent.trim()) || '网页引用';
        const id = await store.createConversation(title, {
          platformId: platform.id,
          modelId: model.modelId,
          skillIds: [...mountedSkillIds.value],
          spaceId,
        });
        // 会话级 system_prompt：智能体提示词 + 场景提示词（会话级优先级高于 agent 级，需合并写入）
        const scenePrompt = currentScene.value?.prompt || '';
        const sysPrompt = [agent?.systemPrompt, scenePrompt].filter(Boolean).join('\n\n');
        if (sysPrompt) {
          await store.updateConversation(id, { systemPrompt: sysPrompt });
        }
        await saveMountToDb(id);
        await store.loadMessages(id);
        isDraftMode.value = false;
      } else {
        // 已有会话：补齐平台/模型，并把会话归入工作目录对应空间（若尚未归入）
        const updates: { platformId?: string; modelId?: string; spaceId?: string } = {};
        if (!currentConv.value?.platformId) {
          updates.platformId = platform.id;
          updates.modelId = model.modelId;
        }
        if (spaceId && currentConv.value?.spaceId !== spaceId) {
          updates.spaceId = spaceId;
        }
        if (Object.keys(updates).length) {
          await store.updateConversation(store.currentConvId, updates);
        }
      }

      // F3 输入过长：全文自动落盘为附件，正文截断为预览（落盘失败则按原文发送，不阻塞对话）
      if (userContent.length > LONG_INPUT_THRESHOLD) {
        try {
          const { getPlatformAdapter } = await import('@yan-zhi/core');
          const adapter = getPlatformAdapter();
          const convId = store.currentConvId || 'default';
          const filesDir = 'workspace/uploads/' + convId;
          try { await adapter.fs.mkdir(filesDir); } catch {}
          const total = userContent.length;
          const name = 'paste_' + Date.now() + '.txt';
          const newPath = filesDir + '/' + name;
          await adapter.fs.writeFile(newPath, userContent);
          await useFileStore().registerFile({
            conversationId: convId, name, path: newPath,
            category: 'upload', mimeType: 'text/plain', size: new Blob([userContent]).size, source: 'user',
          });
          userContent = userContent.slice(0, 200) + `\n（输入过长，全文 ${total} 字已存为附件，路径: ${newPath}）`;
        } catch { /* 落盘失败按原文发送 */ }
      }

      // 保存上传文件到磁盘并把路径告知智能体（智能体可用 file_read 读取）
      if (files.length > 0) {
        try {
          const { getPlatformAdapter } = await import('@yan-zhi/core');
          const adapter = getPlatformAdapter();
          const convId = store.currentConvId || 'default';
          const filesDir = 'workspace/uploads/' + convId;
          try { await adapter.fs.mkdir(filesDir); } catch {}
          const fileParts: string[] = [];
          for (const f of files) {
            const fileId = 'f_' + (crypto as any).randomUUID?.().slice(0, 12) || 'f_' + Date.now().toString(36);
            const newName = fileId + '_' + f.name;
            const newPath = filesDir + '/' + newName;
            try {
              // dataUrl → 剥出 base64 按原始字节落盘（此前直接把 dataUrl 当文本写入，二进制文件全损坏）
              const m = f.dataUrl.match(/^data:[^;,]*;base64,([\s\S]+)$/);
              if (m) {
                await adapter.fs.writeFileBase64(newPath, m[1]);
              } else {
                await adapter.fs.writeFile(newPath, f.dataUrl);
              }
              await useFileStore().registerFile({
                conversationId: convId, name: f.name, path: newPath,
                category: 'upload', mimeType: f.type, size: f.size, source: 'user',
              });
              fileParts.push(`\n[文件: ${f.name} (${formatSize(f.size)}, ${f.type}) 路径: ${newPath}]`);
            } catch (e: any) {
              fileParts.push(`\n[文件: ${f.name} (${formatSize(f.size)}, ${f.type}) 保存失败: ${e?.message || e}]`);
            }
          }
          if (fileParts.length) userContent = userContent + '\n---\n已上传文件：' + fileParts.join('');
        } catch (e: any) {
          userContent = userContent + '\n---\n[文件保存失败: ' + (e?.message || e) + ']';
        }
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
            const ext = f.name.split('.').pop()?.toLowerCase();
            let preview: string;
            if (ext === 'xlsx' || ext === 'xls') {
              // xlsx/xls 是二进制 zip，必须 base64 读取后解析，按 UTF-8 文本读会得到乱码
              try {
                const b64 = await adapter.fs.readFileBase64(f.path);
                const XLSX = await import('xlsx');
                const wb = XLSX.read(b64, { type: 'base64' });
                const parts: string[] = [];
                for (const sheetName of wb.SheetNames) {
                  const ws = wb.Sheets[sheetName];
                  const csv = XLSX.utils.sheet_to_csv(ws);
                  const lines = csv.split('\n').slice(0, 4);
                  parts.push('Sheet: ' + sheetName + '\n' + lines.join('\n'));
                }
                preview = parts.join('\n\n');
              } catch { preview = '(Excel 文件解析失败)'; }
            } else {
              const fileContent = await adapter.fs.readFile(f.path);
              preview = fileContent.split('\n').slice(0, 6).join('\n');
            }
            fileRefs.push({
              fileId: f.name.split('_')[0],
              fileName: f.name.replace(/^f_[a-f0-9]+_/, ''),
              path: f.path,
              type: ext || 'unknown', size: f.size, preview,
            });
          } catch { /* skip */ }
        }
        if (fileRefs.length > 0) {
          userContent = userContent + '\n\n[Files]\n' + JSON.stringify(fileRefs, null, 2);
        }
      }

      // F1 浏览器 URL 引用：注入 [网页引用]，智能体用 browser_* 工具访问
      if (quotedUrls.value.length > 0) {
        const urlParts = quotedUrls.value.map((q) => `- ${q.name} ${q.url}`).join('\n');
        userContent = userContent + '\n\n[网页引用]\n' + urlParts;
        quotedUrls.value = [];
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
    store.openTab({ kind: 'file', name: f.name, path: f.path });
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
        // dataUrl → 剥出 base64 按原始字节落盘（此前直接写 dataUrl 文本，二进制文件全损坏）
        const m = content.match(/^data:[^;,]*;base64,([\s\S]+)$/);
        if (m) {
          await adapter.fs.writeFileBase64(newPath, m[1]);
        } else {
          await adapter.fs.writeFile(newPath, content);
        }
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

  /** 改动①：工具项展开判定——call_agent 执行中（runningToolCallIds 包含该 toolCallId）强制展开，
   *  让 SubAgentRoundView 实时露出子智能体每一步；执行结束自动折叠回简洁态，保留手动展开（expandedTools）。 */
  function isToolItemOpen(toolCallId: string, key: string, extraOpen = false): boolean {
    return extraOpen || store.isToolCallRunning(toolCallId) || !!expandedTools[key];
  }

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

  /**
   * 获取当前正在流式的 step。
   * 当最后一轮处于流式状态且 finalAssistant 无内容时，返回 round.steps 的最后一个 step，
   * 其 partialContent / reasoningContent 为模型实时输出的内容（messageRounds 是 computed，
   * step.partialContent = msg.content 随每个 chunk 实时更新）。
   * 用于把流式过程中的实时内容"提"到主响应区以跑马灯式显示，而非仅显示三点加载动画。
   */
  function getStreamingStep(round: MessageRound, ri: number): AgentStep | null {
    if (!isLastRoundStreaming(round, ri)) return null;
    const lastStep = round.steps[round.steps.length - 1];
    return lastStep || null;
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

  /* ---------- 智能体内容导出：复制 / 下载为 .md 文件 ---------- */

  /** 清洗助手原始输出为可导出的 Markdown（移除工具调用块与平台配置标记，与渲染逻辑对齐） */
  function sanitizeExportMd(content?: string): string {
    return (content || '')
      .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
      .replace(/\[TOOL_CALL\][\s\S]*$/i, '')
      .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
      .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/i, '')
      .replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]/g, '')
      .split(/\n?@@REASON@@\n?/)[0]
      .trim();
  }

  /** 将子智能体一轮执行（推理正文 + 工具调用 + 最终结果）组装为 Markdown 文本 */
  function buildSubAgentMd(round: SubAgentRound): string {
    const lines: string[] = [];
    lines.push(`# 子智能体「${round.subAgentName || round.subAgentId}」执行记录`);
    lines.push('');
    round.steps.forEach((step, i) => {
      const hasTools = step.toolCalls.length > 0;
      if (!step.reasoningContent && !step.partialContent && !hasTools) return;
      lines.push(`## 步骤 ${i + 1}`);
      lines.push('');
      if (step.reasoningContent) {
        lines.push('> ' + step.reasoningContent.replace(/\n/g, '\n> '));
        lines.push('');
      }
      if (step.partialContent) {
        lines.push(step.partialContent.trim());
        lines.push('');
      }
      if (hasTools) {
        lines.push(`### 工具调用（${step.toolCalls.length}）`);
        lines.push('');
        step.toolCalls.forEach((tc: any, idx: number) => {
          const r = step.toolResults.find(t => t.callId === tc.id);
          const display = resolveToolDisplay(tc);
          lines.push(`${idx + 1}. **${display.server}/${display.tool}**`);
          const args = resolveToolArgs(tc);
          if (args && args !== '{}' && args !== '无') lines.push(`   - 参数：\`${String(args).replace(/\n/g, ' ').slice(0, 300)}\``);
          if (r?.content) {
            const preview = r.content.trim().split('\n').slice(0, 10).join('\n   ');
            lines.push(`   - 结果：\n\n   \`\`\`\n   ${preview}${r.content.trim().split('\n').length > 10 ? '\n   ...' : ''}\n   \`\`\``);
          }
        });
        lines.push('');
      }
    });
    if (round.finalContent) {
      lines.push('## 最终结果');
      lines.push('');
      lines.push(sanitizeExportMd(round.finalContent));
    }
    return lines.join('\n');
  }

  function sanitizeFilename(name: string): string {
    return (name || 'content').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 50) || 'content';
  }

  async function copyMdText(text: string) {
    try { await navigator.clipboard.writeText(text.trim()); ElMessage.success('已复制 Markdown'); }
    catch { ElMessage.error('复制失败'); }
  }

  function downloadMdFile(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success('已下载 Markdown 文件');
  }

  /** 子智能体执行记录：复制 / 下载 .md（SubAgentRoundView 头部按钮） */
  function copySubAgentRoundMd(round: SubAgentRound) { void copyMdText(buildSubAgentMd(round)); }
  function downloadSubAgentRoundMd(round: SubAgentRound) {
    const name = sanitizeFilename(round.subAgentName || round.subAgentId || 'sub-agent');
    downloadMdFile(`${name}-执行记录.md`, buildSubAgentMd(round));
  }

  /** 子智能体最终结果卡片：复制 / 下载 .md */
  function copySubAgentResultMd(sr: { subAgentName: string; finalContent: string }) {
    void copyMdText(sanitizeExportMd(sr.finalContent));
  }
  function downloadSubAgentResultMd(sr: { subAgentName: string; finalContent: string }, idx: number) {
    const name = sanitizeFilename(sr.subAgentName || 'sub-agent');
    downloadMdFile(`${name}-结果${idx + 1}.md`, sanitizeExportMd(sr.finalContent));
  }

  /** 主智能体回复内容（清洗后）：复制 / 下载 .md。
   *  与展示一致：子智能体结果 + 主正文合成一份完整报告，不再是零散片段 */
  function getAssistantExportMd(round: MessageRound): string {
    const direct = sanitizeExportMd(round.finalAssistant?.content);
    const subSections = (round.subAgentResults || [])
      .map((sr) => `## 子智能体「${sr.subAgentName}」结果\n\n${sanitizeExportMd(sr.finalContent)}`)
      .filter(Boolean);
    const parts: string[] = [];
    if (subSections.length) parts.push(subSections.join('\n\n'));
    if (direct) parts.push(direct);
    return parts.join('\n\n---\n\n');
  }
  function copyAssistantMd(round: MessageRound) { void copyMdText(getAssistantExportMd(round)); }
  function downloadAssistantMd(round: MessageRound) {
    const title = sanitizeFilename(currentConv.value?.title || 'assistant');
    const suffix = round.finalAssistant?.id ? '-' + round.finalAssistant.id.slice(0, 6) : '';
    downloadMdFile(`${title}${suffix}.md`, getAssistantExportMd(round));
  }

  function toggleSubAgentResult(key: string) { collapsedSubAgentResults[key] = !collapsedSubAgentResults[key]; }
  function toggleMainResult(key: string) { collapsedMainResults[key] = !collapsedMainResults[key]; }

  async function editMsg(msg: Message) {
    input.value = msg.content || '';
    await nextTick();
    const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement;
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  // F2 消息引用：以 `> ` 引用块插入输入框，最多 20 行，超出省略
  async function quoteMsg(msg: Message) {
    const raw = (msg.content || '')
      .replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]/g, '')
      .replace(/@@REASON@@[\s\S]*$/, '')
      .replace(/\n+$/, '');
    if (!raw) return;
    const lines = raw.split('\n');
    const quoted = lines.slice(0, 20).map((l) => '> ' + l).join('\n') + (lines.length > 20 ? '\n> …' : '');
    const block = quoted + '\n\n';
    input.value = input.value ? input.value.replace(/\s*$/, '') + '\n' + block : block;
    await nextTick();
    const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement;
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  async function delMsg(msg: Message) { await store.deleteMessage(msg.id); }

  function openConvMenu(e: MouseEvent, conv: Conversation) {
    const _p = clampMenuPos(e); ctxMenu.visible = true; ctxMenu.x = _p.x; ctxMenu.y = _p.y; ctxMenu.conv = conv;
  }
  // ========== 会话树空白区右键菜单（新建任务/新建空间） ==========
  const treeMenu = reactive({ visible: false, x: 0, y: 0 });
  function openTreeMenu(e: MouseEvent) {
    // 会话项与空间节点有各自的右键菜单，命中时不弹空白区菜单
    if ((e.target as HTMLElement)?.closest('.conv-item, .tree-space .tree-node-head')) return;
    const _p2 = clampMenuPos(e); treeMenu.visible = true; treeMenu.x = _p2.x; treeMenu.y = _p2.y;
  }
  function treeMenuNewTask() {
    closeTreeMenu();
    startNewChat();
  }
  function treeMenuNewSpace() {
    closeTreeMenu();
    openSpaceCreate();
  }
  function closeTreeMenu() { treeMenu.visible = false; }
  function closeCtxMenu() { ctxMenu.visible = false; closeSpaceMenu(); closeTreeMenu(); }
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
    const conv = store.conversations.find(c => c.id === convId);
    await store.updateConversation(convId, {
      mcpServerIds: serverIds,
      _mcpDisabledTools: disabled,
      _mcpToolAliases: aliases,
      builtinToolIds: conv?.builtinToolIds || [],
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
    platformConfigSaving, manualPlatformConfigVisible, platformConfigEditId, platformConfigForm, platformConfigDialogVisible, resetPlatformConfigForm, openPlatformConfig, onPlatformConfigSubmit, onPlatformConfigCancel, onPlatformConfigClose,
    input, inputFocused, fileInputRef, uploadedFiles,

    browserActive, currentBrowserLabel, closeRightPanel, toggleRightPanel,
    expandedFileCategories, fileSearch, workspaceFiles, selectedFilePaths, filePanelUploadRef, search, messagesRef, showMount, showSkills, skillSearch, filteredSkillStore, toggleSkillMount,
    selectedModelId, expandedReasoning, expandedTools, expandedToolGroups, collapsedToolGroups, collapsedMessages, expandedAgentProcess, expandedStepTools, activeNavRound,
    userRoundIndices, mountedSkillIds, drawerOpen, convCollapsed, sideTab, contextSidebarOpen, toggleContextSidebar, batchMode, selectedConvIds,
    rootConversations, conversationsBySpace, spaceCollapsed, toggleSpaceCollapse, rootCollapsed, toggleRootCollapse,
    mountToolSelection, toolAliasMap, mountSearch, collapsedServers, toggleServerCollapse, filteredTools, initMountSelection, isToolMounted, toggleMountTool, isAllToolsMounted, toggleAllTools, setToolAlias,
    showAgentEdit, editingAgent, debugMode,
    showWorkspaceDir, workspaceDir, hasWorkspaceDir, loadWorkspaceDir, onWorkspaceDirSelected, clearWorkspaceDir,
    tryParseSnapshot, formatSnapshot, snapshotDialog, snapshotActiveTab, snapshotLoading, currentSnapshots, openSnapshotDialog,
    isDraftMode, renamingId, renamingTitle, renameInputRef, ctxMenu,
    md, renderMarkdown, handleContentClick,
    currentConv, filteredConversations, messageRounds, isToolErrorContent,
    chatModels, modelGroups, mountableServers, tokenCount, contextLimit, tokenPercent, tokenBarColor, canSend,
    openEditAgent, openCreateAgent, onAgentSaved, onAgentDeleted,
    showSpaceEdit, spaceEditForm, spaceMenuTarget, selectSpace, createSpaceQuick, createSpaceFromDir, showSpaceDirPicker, openSpaceEdit, openSpaceCreate, saveSpaceEdit, deleteSpaceConfirm, openSpaceMenu, closeSpaceMenu, moveConvToSpace,
    treeMenu, openTreeMenu, treeMenuNewTask, treeMenuNewSpace,
    fileCategories, previewInPopup, showConvFileMenu, reclassifyConvFile,
    onAgentSwitch, onModelChange,
    parseConfigCard, displayAssistantContent, getEditPlatform, getEditReason, onConfigSaved,
    startNewChat, selectConv, triggerFileUpload, handleFileChange, removeFile, formatSize, send, stopChat, regenerateMsg, shouldShowMessage, collectToolCalls,
    filteredFiles, loadWorkspaceFiles, previewFile, toggleFileSelect, triggerFilePanelUpload, handleFilePanelUpload, deleteFileItem,
    scrollToRound, handleScroll, updateActiveNavRound, formatTime, showScrollBottom, showScrollTop, scrollToBottom,
    toggleReasoning, toggleTool, toggleToolGroup, toggleMsgCollapse, collapseEarlyOnMobile, toggleAgentProcess, toggleStepTools, isLastRoundStreaming, getStreamingStep,
    isToolItemOpen,
    getStepToolResult, isStepToolError, isStepToolsRunning, isStepToolsError, getStepToolGroupClass, getStepToolStatusClass,
    isToolGroupRunning, isToolGroupError, getToolGroupStatusClass, resolveToolDisplay, resolveToolArgs, safeJson, isToolError, getToolStatusClass, getToolResult,
    copyMsg, editMsg, quoteMsg, delMsg, openConvMenu, closeCtxMenu, togglePin, startRename, commitRename, deleteConv, toggleConvSelect, batchSelectAll, batchDeleteConvs,
    collapsedSubAgentResults, toggleSubAgentResult, collapsedMainResults, toggleMainResult,
    copySubAgentRoundMd, downloadSubAgentRoundMd, copySubAgentResultMd, downloadSubAgentResultMd,
    copyAssistantMd, downloadAssistantMd,
    quotedUrls, addQuotedUrl, removeQuotedUrl, LONG_INPUT_THRESHOLD,
    sceneMode, currentScene, sceneSkillCount, setScene, clearScene,
    saveMountToDb, saveMount, saveSkills,
  };
}

let instance: ReturnType<typeof createChat> | null = null;

export function useChat() {
  if (!instance) instance = createChat();
  return instance;
}

import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { isChatSelectableAgent } from '../../utils/agentSelectable';
import { DEFAULT_CONTEXT_WINDOW } from '../../utils/context-window';
import { hasLocalPath, isLocalPath, normalizePath, resolveOpenTarget, splitLocalPaths, toWindowsPath } from '../../utils/file-open';
import { buildToolResultIndex } from '../../utils/tool-result';
import { ElMessage, ElMessageBox } from 'element-plus';
import MarkdownIt from 'markdown-it';
import hljs from '../../utils/highlight';
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
  useLicenseStore,
  useCostStore,
} from '../../stores';
import { useGitStore } from '../../stores/git';
import { SKIP_PAGE_SUPPLEMENT } from '../../stores/chat';
import { useSceneConfigStore } from '../../stores/sceneConfig';
import { useTaskTypeStore } from '../../stores/taskType';
import { isCodeModeActive, useCodeStore } from '../../stores/code';
import { activeMode } from '../../stores/mode';
import { useIsMobile } from '../useIsMobile';
import { usePlatform } from '../usePlatform';
import { useRouter } from 'vue-router';
import { api } from '../../api/client';
import { waitForBackend } from '../../api/backend-ready';
import type { Agent, Message, Conversation, Platform, Model } from '@yan-zhi/shared';
import { estimateTokens, CHAT_MODEL_TYPES, buildArtifactRelDir, joinArtifactPath, TASK_TYPES, getTaskType, isParentTaskType, getChildTaskTypes, effectiveContextLimit, contextUsagePercent } from '@yan-zhi/shared';
import { computeCost, normalizePricing, formatCny } from '@yan-zhi/shared';
import {
  selectMedia,
  openMediaViewer,
  openMediaMenu,
  copySelectedMedia,
  absoluteMediaSrc,
} from '../useMediaPreview';

// ★★★ 2026-10-12：这三个「消息分轮」相关类型已随实现一起迁到 `./message-rounds`。
//   ⚠️ 必须**同时 import 和 re-export** —— 本文件内部也在用这些类型（不只是对外暴露），
//      只 re-export 会让文件内的引用全部 `Cannot find name`。re-export 是为了保持
//      `from '.../useChat'` 的既有外部 import 全部有效（零破坏）。
import { buildMessageRounds, type AgentStep, type SubAgentRound, type MessageRound } from './message-rounds';
import { formatContinueTaskPrefill } from './continue-task';
export type { AgentStep, SubAgentRound, MessageRound };
export { buildMessageRounds };

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
  // 场景（模式）配置：运行时以后端 scene_config 表为准（2026-10-12 配置化）
  const sceneConfigStore = useSceneConfigStore();
  const spaceStore = useSpaceStore();
  const fileStore = useFileStore();
  const costStore = useCostStore();
  const distillStore = useDistillStore();
  const isMobile = useIsMobile();
  // E12: 移动端不支持内置浏览器——浏览器 tab/面板相关逻辑统一门控
  const { supportsBrowser } = usePlatform();

  // Skill 蒸馏弹窗状态
  const showDistill = ref(false);
  const distillMessages = ref<Array<{ role: string; content: string }>>([]);

  function distillUserMsg(msg: Message) {
    distillMessages.value = [{ role: 'user', content: msg.content || '' }];
    showDistill.value = true;
  }

  /**
   * 解析本轮请求实际下发的思考强度（reasoning_effort）：
   * ① 会话级覆盖（「+」菜单·模式·思考强度）：null=跟随智能体 / ''=强制关闭 / low|medium|high=覆盖；
   * ② 未覆盖时回退 agent.config.reasoningEffort。
   * ★ '' 与 undefined 语义不同：'' 必须原样下发 —— 后端 options 分支
   *   （`options?.reasoningEffort !== undefined ? ... : agentConfig`）会采纳 '' 来**压过**
   *   智能体配置实现强制关；转成 undefined 则整个不带、回退智能体配置，强制关就失效了。
   *   client.ts 侧 '' 走 `if (options?.reasoningEffort)` 为假 → API 请求不带该参数，正确。
   */
  function resolveReasoningEffort(agent: { config?: { reasoningEffort?: string } } | null | undefined): string | undefined {
    const ov = store.reasoningEffortOverride;
    if (ov !== null) return ov; // '' → 强制关闭（原样下发）；low/medium/high → 覆盖
    return (agent?.config as any)?.reasoningEffort || undefined;
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
  const confirmSupplementOpen = ref(false);
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
    confirmSupplementOpen.value = false;
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
  /** 回到上一页：已答内容由下面的 watch 从 answers 回填，用户可直接改 */
  function onConfirmPrev() {
    if (store.pendingConfirmation) store.prevPendingConfirmation();
  }
  function onConfirmDialogClose() {
    if (store.pendingConfirmation) store.cancelPendingConfirmation();
    resetConfirmForm();
  }
  /** 切页时回填：返回上一页要能看到并修改此前答过的内容（此前是无条件清空 ⇒ 回退必空白） */
  function restoreConfirmPageAnswer() {
    resetConfirmForm();
    const wizard = store.pendingConfirmation;
    const page = confirmCurrentPage.value;
    if (!wizard || !page) return;
    const prev = wizard.answers[wizard.index];
    if (!prev) return;
    const answer = prev.answer || '';
    if (confirmMultiSelect.value) {
      const picked = answer ? answer.split('、') : [];
      confirmChecked.value = (page.options || []).map((opt) => picked.includes(opt));
    } else if (page.options?.length && answer && page.options.includes(answer)) {
      confirmSingle.value = answer;
    } else if (answer) {
      // 自由文字，或不在当前选项里的旧答案 → 走「其他（文字输入）」
      confirmShowText.value = true;
      confirmText.value = answer;
    }
    const supplement = prev.supplement || '';
    if (supplement && supplement !== SKIP_PAGE_SUPPLEMENT) {
      confirmSupplement.value = supplement;
      confirmSupplementOpen.value = true;
    }
  }
  watch(
    [() => store.pendingConfirmation, () => store.pendingConfirmation?.index],
    () => { if (store.pendingConfirmation) restoreConfirmPageAnswer(); },
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
    contextWindow: DEFAULT_CONTEXT_WINDOW,
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
        : DEFAULT_CONTEXT_WINDOW,
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
        contextWindow: model?.contextWindow || DEFAULT_CONTEXT_WINDOW,
      };
    } else {
      resetPlatformConfigForm();
    }
    manualPlatformConfigVisible.value = true;
  }

  /**
   * 打开模型平台配置弹窗：手动新建平台 + 模型，保存后自动拉取模型列表并设为默认。
   * @param checkedModelIds 新增态「拉取模型列表」勾选的模型（空/未拉取 = 回退手填的 modelId）
   */
  async function onPlatformConfigSubmit(checkedModelIds?: string[]) {
    const f = platformConfigForm.value;
    const isEdit = !!platformConfigEditId.value;
    if (!f.name.trim() || !f.apiUrl.trim()) {
      ElMessage.warning('平台名称和 API URL 为必填');
      return;
    }
    const checked = (checkedModelIds || []).filter((x) => x && x.trim());
    if (!isEdit && !f.modelId.trim() && checked.length === 0) {
      ElMessage.warning('模型 ID 为必填（或先拉取模型列表勾选）');
      return;
    }
    platformConfigSaving.value = true;
    try {
      let platformId: string;
      if (isEdit) {
        platformId = platformConfigEditId.value;
        // ★ 目录厂商平台（preset）：协议/API URL 是厂商文档常量（服务端同样拦截），不发这些字段
        const cur = platformStore.platforms.find((x) => x.id === platformId);
        const presetLocked = !!cur?.isBuiltin && !!cur?.presetKey;
        const patch: any = presetLocked
          ? { name: f.name.trim(), pauseMinMs: f.pauseMinMs, pauseMaxMs: f.pauseMaxMs }
          : {
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
        if (checked.length > 0) {
          // 拉取列表勾选了多个：全部带入（首个稍后自动设默认）
          for (const mid of checked) {
            await platformStore.addModel({
              platformId,
              modelId: mid,
              alias: mid.split('/').pop() || mid,
              type: 'llm' as any,
              contextWindow: Number(f.contextWindow) || DEFAULT_CONTEXT_WINDOW,
              enabled: true,
              isDefault: false,
              capabilities: ['function_call'],
            });
          }
        } else {
          await platformStore.addModel({
            platformId,
            modelId: f.modelId.trim(),
            alias: f.alias.trim() || f.modelId.trim().split('/').pop() || f.modelId.trim(),
            type: 'llm' as any,
            contextWindow: Number(f.contextWindow) || DEFAULT_CONTEXT_WINDOW,
            enabled: true,
            isDefault: false,
            capabilities: ['function_call'],
          });
        }
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
  /**
   * 跨页预填（Skill 蒸馏「去调试」，P2-10）：别的视图把测试 prompt 放进 chat store，
   * 这里**取走即清** —— 不清的话用户下次进聊天会被同一条 prompt 再灌一遍。
   * 注意 useChat 是**模块级单例**（见文件末尾的 instance），本 watcher 自 App 启动即常驻，
   * 所以蒸馏页「切完会话再后置 set」的那笔预填同样接得住；immediate 只是兜底。
   */
  watch(
    () => store.pendingPrefill,
    (text) => {
      if (!text) return;
      input.value = text;
      store.pendingPrefill = '';
    },
    { immediate: true },
  );
  /**
   * ★★★ 发送重入锁（2026-10-09，P0 实据修复）。
   *
   * 为什么必须有：`send()` 在取走内容后要跨多个 `await`（建空间 / 建会话 / 落附件 / 读文件预览），
   *   期间 `input.value` 尚未清空；键盘连发、Enter 连按、或"发送"按钮与 Enter 同时触发，
   *   就会**并发进入多次** → 同一句话落库多条。
   *   实测铁证：生产库同一秒写进 **11 条一模一样的 user 消息**「失败原因总结下」。
   *
   * 语义：进入 send() 即刻置位（**在任何 await 之前**），finally 释放；
   *   置位期间重复调用直接忽略。这是"防重复提交"的**唯一入口守卫** ——
   *   放在 store.callLlm 里的 runningConvIds 判据来不及挡（那里已在 await 之后）。
   *
   * ★ 锁粒度 = 按会话（2026-10-17，用户实报「切到别的会话回车发不出消息，刷新才好」）：
   *   锁覆盖整个任务时长（sendInner await store.sendMessage 等 SSE 全程），若还是
   *   全局一把，会话 A 跑任务期间在会话 B 发消息会在锁处被**静默吞掉**——与
   *   ChatInputArea onEnter 注释宣称的「切到别的会话则正常发送」直接矛盾。
   *   key = currentConvId；草稿态（还没建会话）用 '__draft__'，连发互斥语义不变。
   *   对 UI 导出的 `sending` 退化为 computed：「当前会话是否在发送中」，语义不变。
   */
  const sendingConvs = ref<Set<string>>(new Set());
  const sending = computed(() => sendingConvs.value.has(store.currentConvId || '__draft__'));
  const inputRef = ref<any>();
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
  // browserSteps 首次出现：确保 browser tab 存在并打开预览面板（browser_navigate 桥接已自带 openTab，
  // 此处兜底其他 browser_* 工具只 push step 不开 tab 的场景）。
  // ⚠️ 不自动全屏：agent 操作浏览器时只打开预览面板，全屏是用户手动选项（工具条 ⛶ 按钮），
  // 自动 inset:0 会盖住聊天页 —— 用户明确不要这个行为。
  //
  // ★★★ 判据从 `browserSteps.length` 改为 `browserStepSeq`（2026-10-12，根因修复）：
  //   旧判据 `o === 0 && n > 0` 依赖长度的 0→N 跳变。而 `browserSteps` 有
  //   `BROWSER_STEPS_MAX = 120` 上限（push + splice ⇒ **净长度恒 120**），填满后
  //   length **永不再跳变** ⇒ 本 watch **永不触发** ⇒ 长任务的"首个步骤自动开面板"
  //   兜底静默失效。改用**单调递增**的 `browserStepSeq`：语义就是"第几个浏览器步骤"，
  //   裁剪动不了它（同 `lastBrowserToolAt` 的修法，见 stores/chat.ts pushBrowserStep 注释）。
  watch(() => store.browserStepSeq, (n, o) => {
    if (o === 0 && n > 0) {
      if (!supportsBrowser) return; // E12: 移动端不打开浏览器 tab（步骤日志仅留在面板外/消息里）
      if (!store.previewTabs.some((t) => t.kind === 'browser')) {
        store.openTab({ kind: 'browser', name: '浏览器', url: '' });
      } else {
        store.rightPanelOpen = true;
      }
      // ★★★ 执行面直连化（2026-10-10）：**桥档下必须由这里把预览面板打开**。
      //   桥路径下渲染层不执行 `browser_*`（见 stores/chat.ts 的 tool:execute 守卫），
      //   而 `openTab` 此前只嵌在 `dispatchToolCall` 的 `browser_navigate` 分支里 ——
      //   跳过执行 ⇒ 面板不被打开 ⇒ 主进程 `browser:wv:forceOpen` 无人接 ⇒
      //   **第一次 navigate 必失败（拿不到 guest）且预览看不到**。
      //   ⇒ 收口到本 watch（对 SSE 的 `tool:start`/`tool:result` 生效，与是否本地执行无关）。
      //   BrowserPanel 由 `v-if="browserTab"` + `v-show` 驱动，`activeTabId` 指向 browser tab
      //   即会挂载 ⇒ 挂载后 onMounted 自建首个 tab（或恢复已有）。
    }
    // 序号不回退，故无"清零"分支：收起面板由 onTaskFinished 兜底（见下）
  });
  // 浏览器任务生命周期：首次 browser 步骤 → 进入"agent 驾驶"态（锁输入）；
  // 步骤日志清空（任务收尾/reset）→ 退出实况态：解除锁定、清手动收起标记。
  // （不自动收起全屏：全屏已是纯手动，用户开着的就让它开着直到任务结束兜底清理）
  //
  // ★★★ 判据同样改 `browserStepSeq`（2026-10-12）：原 `o === 0 && n > 0` 在数组填满后
  //   **永不触发** ⇒ `browserLockInput` 浮标不再跟随（次要：主判据已迁到 browserTaskActive，
  //   但这里负责 `browserUserDismissed` 复位，失效会让"用户手动收起后本次任务内不再自动展开"
  //   的标记跨任务粘住）。序号单调递增 ⇒ 只在"首个步骤"跳一次，语义与旧实现等价且更准。
  //   ★ "退出实况态"（旧 n===0 分支）不再由本 watch 承担 —— 由 `onTaskFinished` 兜底
  //     （原本 `browserSteps.length = 0` 也只在 reset 路径发生，收尾主路径一直靠 onTaskFinished）。
  watch(() => store.browserStepSeq, (n, o) => {
    if (o === 0 && n > 0) {
      store.browserUserDismissed = false;
      store.browserLockInput = true;
    }
  });
  // 任务结束（completed/aborted/failed）兜底清理：SSE 步骤日志可能未清空，这里强制退出实况态
  store.onTaskFinished(async (convId) => {
    if (store.browserExpanded || store.browserLockInput) {
      store.browserLockInput = false;
      store.browserExpanded = false;
      store.browserUserDismissed = false;
    }
    // ★ 浏览器任务记账随任务收尾一起清（2026-10-08）：不清会让"本会话是浏览器任务"永远为真，
    //   下一个非浏览器任务也会锁住页面。★ 按 convId 精确清 —— 多会话并行时 A 会话收尾
    //   不得解开 B 会话正在跑的浏览器任务锁。
    store.clearBrowserTaskActive(convId);
    // ★ 2026-10-23：任务收尾统一清编号层（用户实报两次「任务停了中间层还在」）。
    //   放在这里而不是只靠 BrowserPanel 的 watcher：面板可能已被卸载/重挂，
    //   而主进程的 highlightEnabled 会据此在每次导航时把橙框重画回来。
    //   用户手动开的层尊重其意图，不自动关（manual 标记见 stores/chat.ts）。
    if (!store.browserHighlightManual) {
      try { (window as any).electronAPI?.browserView?.highlightOffAll?.(); } catch { /* 纯视觉清理 */ }
    }
    store.pausedConvIds.clear();
    store.clearAgentCursor();
    // ★★ agent 开的页面 → **保留**（2026-10-12 用户拍板改向：
    //   「除非智能体自己主动关闭页面才关闭」—— 收尾不再自动关）。
    //   历史：2026-10-08 只弹提示 → 2026-10-09 收尾自动关（closeAgentTabs/closeConvTabs）→
    //   本次改回「页面留存，由模型自己决定关不关」。
    //   保留说明：主进程 closeAgentTabs/closeConvTabs IPC 与 preload 通道**原样保留**
    //   （模型主动批量 close_tab / 用户侧清理仍可用），只是任务收尾钩子不再调用。
    //   记账仍按原节奏取快照+清理（只影响"剩余页面"知会，不再触发关闭）。
    const leftover = store.remainingAgentOpenedTabs(convId);
    store.clearAgentOpenedTabs(convId);
    if (leftover.length > 0) {
      void import('element-plus').then(({ ElMessage }) => {
        ElMessage.info({
          message: `AI 打开了 ${leftover.length} 个页面保留在预览面板（由智能体自行关闭，也可手动关）`,
          duration: 5000,
        });
      }).catch(() => { /* 提示失败不影响收尾 */ });
    }
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

  // ★★★ 后台任务自动展开预览面板（2026-10-18，「后台派发的发布任务 30s 建不出页面」根因修复）：
  //   主进程在 agent navigate 时广播 `tabCreated`，真正建 `<webview>` 壳的是渲染层 BrowserPanel
  //   的同名监听 —— 但它随组件**挂载**才注册，而「面板收起且无 browser 预览 tab」时
  //   BrowserPanel 处于卸载态 ⇒ 广播无人接 ⇒ guest 30s 必超时（主进程日志铁证：
  //   `已广播 tabCreated ... wc=NULL(30s 超时)`，表现为发布队列派发的任务卡死在打开创作者中心）。
  //   既有兜底（browserStepSeq 首步开面板，见上）只覆盖「活跃会话的第一个浏览器步骤」：
  //   后台派发任务（发布队列/定时任务）不是活跃会话、且本 renderer 会话内 seq 已 >0，
  //   两个条件都不满足 ⇒ 面板永远不自动展开。
  //   ⇒ 这里注册**应用级单例**监听（useChat 是模块级单例，本段随 App 启动常驻）：
  //     广播到达时确保 browser 预览 tab 存在 + 面板展开；BrowserPanel 随之挂载并接管后续广播，
  //     模型按报错指引的下一次重试（navigate 复用同 tab 会再广播 / get_page_content）即可建出页面。
  //   ★ 只做"展开"，不碰 tab 的创建/关闭 —— 壳的唯一实现仍是 BrowserPanel.onTabCreated，不写第二份。
  if (supportsBrowser) {
    const api = (window as any).electronAPI?.browserView;
    api?.onTabCreated?.((_tid: string, url: string | null, _scope?: string) => {
      const bt = store.previewTabs.find((t) => t.kind === 'browser');
      if (!bt) {
        store.openTab({ kind: 'browser', name: '浏览器', url: url || '' });
      } else if (!store.rightPanelOpen) {
        store.rightPanelOpen = true;
        store.activeTabId = bt.id;   // 面板是替后台任务自动展开的：直接亮出 agent 正操作的页面
      }
    });
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
  /** 移动端「内容过长自动折叠」的记账集：记录哪几条是**自动**折的，
   *  以便下次重算时只还原自己折过的（用户手动折叠的不动）。
   *  ★ 声明位置必须早于 resetTaskScopedState —— 那会在切任务时 clear 它。 */
  const collapsedByAuto = new Set<string>();

  const activeNavRound = ref<number | null>(null);

  const mountedSkillIds = ref<string[]>([]);

  // ===== 会话场景（对齐 WorkBuddy 新任务页三卡片：日常办公 / 代码开发 / 设计创意）=====
  // 场景区分方式：① 场景系统提示词（发送首条消息时注入会话 system_prompt）
  //              ② 默认挂载 Skill（按关键词匹配技能库自动挂载）
  //              ③ 欢迎卡片示例引导语（ChatWelcome 展示）
  // ★ 2026-10-12 起场景配置化：场景定义运行时来自后端 scene_config 表
  //   （stores/sceneConfig.ts 拉取；scenes.ts 仅作首屏/离线兜底），用户/应用可动态新增模式。
  const SCENE_LS_KEY = 'yz_scene_mode';
  // 动态 key：不再绑死内置 SceneKey 联合类型（自建模式的 key 是任意字符串）
  const sceneMode = ref<string>(localStorage.getItem(SCENE_LS_KEY) || '');
  const sceneSkillCount = ref(0);
  const currentScene = computed(() => sceneConfigStore.sceneByKey(sceneMode.value));
  function persistScene() {
    try { localStorage.setItem(SCENE_LS_KEY, sceneMode.value || ''); } catch { /* ignore */ }
  }
  /** 选择场景：切换场景绑定的智能体（日常办公=日常办公助手 / 代码开发=代码编写助手 / 设计创意=设计创意助手 / 抖音运营=抖音运营助手…），
   *  并在草稿态把挂载重置为「场景智能体自带 Skill ∪ 场景关键词匹配 Skill」 */
  function setScene(key: string) {
    sceneMode.value = key;
    persistScene();
    const scene = sceneConfigStore.sceneByKey(key);
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
  /**
   * 只清场景标记，**不改智能体、不动挂载** —— 任务模式接管时用。
   *
   * ★★★ 为什么不直接调 clearScene()（2026-09-27 修「有声小说目录挂代码 skill」时定下）：
   *   `sceneMode` 是 localStorage 全局单键（不带模式前缀），在开发模式激活过「代码开发」
   *   场景后切到有声小说目录，`currentScene` 仍是代码开发 → 发消息时
   *   `sysPrompt = [agent.systemPrompt, currentScene.prompt]` 会把**代码开发的场景提示词**
   *   注入有声小说任务。
   *   但 clearScene 的语义是「不选场景 = 回到默认办公助手」，它内部会
   *   `onAgentSwitch(默认助手)` 并把挂载还原成默认助手的 skill —— 任务模式刚把智能体
   *   切到「有声小说助手」，紧接着就被它顶回默认助手，**等于白切**。
   *   所以这里只清标记 + 重算计数，智能体与挂载交给 applyTaskTypeAgent 统一收口。
   */
  function resetSceneForTaskMode() {
    if (!sceneMode.value) return;
    sceneMode.value = '';
    sceneSkillCount.value = 0;
    persistScene();
  }

  // 对话左侧栏第三个 tab「文件」（资源管理器/搜索/Git）：选中带目录的空间时展示内容
  const drawerOpen = ref(false);
  const convCollapsed = ref(false);
  // 预览窗打开 → 自动收起任务列表：宽屏（>1199px，与 CSS 断点一致）预览是常驻分栏，
  // 任务列表会被挤得过窄，打开预览时收起列表给预览让位。
  // 窄屏/移动端预览是覆盖抽屉（带遮罩），不占任务列表空间 → 不动。
  // 只收起不强制展开：关闭预览时尊重用户此前手动选择的状态。
  watch(() => store.rightPanelOpen, (open) => {
    if (open && typeof window !== 'undefined' && window.innerWidth > 1199) {
      convCollapsed.value = true;
    }
  });
  const sideTab = ref<'chat' | 'task' | 'file' | 'publish'>('chat');
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
  /** 店铺运营：工作目录按项目（=店铺会话绑定的空间）隔离，未绑定就是空 —— 不继承全局 */
  const shopProjectDir = computed(() => {
    if (activeMode.value !== 'shop') return '';
    const conv = store.conversations.find((c) => c.id === store.currentConvId);
    const sp = conv?.spaceId ? spaceStore.spaces.find((s) => s.id === conv.spaceId) : undefined;
    return sp?.dirPath || '';
  });
  // 对外暴露，UI 展示用（未设置时显示 'workspace'）
  const workspaceDir = computed(() => (activeMode.value === 'shop'
    ? (shopProjectDir.value || 'workspace')
    : (settingsStore.settings.workspaceDir || 'workspace')));
  // 是否已真实设置工作目录（区分 'workspace' 兜底显示与真正选过目录）
  const hasWorkspaceDir = computed(() => (activeMode.value === 'shop'
    ? !!shopProjectDir.value
    : !!settingsStore.settings.workspaceDir));

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

  /**
   * 把「全局工作目录」对齐到空间目录（设置 + server 默认 cwd 同一条通道）。
   *
   * ★ 2026-10-23 实报：「任务在第二本空间里，大模型却一直按第一本干活，+菜单里目录也没切」。
   *   根因：工作目录是**全局单份设置**（最后一次点选的目录），而「草稿发送新建任务」与
   *   「无参新建任务」只绑了会话的 space_id，没同步它 → 前端把旧目录当「显式下发」传给后端，
   *   后端按「显式 > 空间目录」取值，于是提示词、工具、+ 菜单全停在上一个目录。
   *   ⇒ 凡是"会话归属某个空间"的地方都调本函数，保证设置/提示词/工具执行面同源。
   */
  async function syncWorkspaceDirToSpace(spaceId: string | null | undefined): Promise<void> {
    const sp = spaceId ? spaceStore.spaces.find((s) => s.id === spaceId) : undefined;
    const dir = sp?.dirPath || '';
    try {
      if ((settingsStore.settings.workspaceDir || '') !== dir) {
        await settingsStore.update({ workspaceDir: dir });
      }
    } catch { /* 设置落盘失败不阻塞切会话/发消息；服务端那一份仍会下发 */ }
    await pushWorkspaceDir(dir);
  }

  async function onWorkspaceDirSelected(path: string) {
    // 店铺运营：目录绑定到「当前店铺项目」的空间，**不动全局**（否则会串到办公项目）
    if (activeMode.value === 'shop') {
      try {
        const spaceId = await spaceStore.findOrCreateByDirPath(path);
        if (store.currentConvId) await store.updateConversation(store.currentConvId, { spaceId });
        await store.loadConversations();
      } catch { /* 绑定失败不影响其它操作 */ }
      return;
    }
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

  /**
   * 统一的「打开路径」入口 —— 文件与目录都从这里走，各处入口不再各写各的。
   *
   * 背景：此前消息里的「浏览文件」按钮直接切 Git 目录树，点一个文件也要被丢进
   * 目录里自己找；正文里的本机路径则完全不可点。通用阅读能力（FilePreview）其实
   * 早就有，缺的只是统一入口。
   *
   * 规则：
   *  - 文件 → 预览窗 file tab，交给 FilePreview 通用阅读逻辑：
   *           图片 / PDF / Excel / CSV / Markdown / 代码 / 文本内嵌渲染，
   *           不可内嵌的格式降级为「名称+大小+路径 + 本机应用打开 + 打开目录」。
   *  - 目录 → 预览窗 git tab（目录树浏览，可继续点进里面的文件）。
   *  - stat 不可用（Web/OPFS 等端）→ 按文件处理，由 FilePreview 自身给出结果或报错，不静默吞。
   */
  async function openPath(path: string, opts?: { name?: string; forceDir?: boolean }) {
    const p = normalizePath(path);
    if (!p) return;

    let isDir = !!opts?.forceDir;
    if (!isDir) {
      try {
        const { getPlatformAdapter } = await import('@yan-zhi/core');
        const st = await getPlatformAdapter().fs.stat?.(p);
        isDir = !!st?.isDir;
      } catch {
        /* stat 不可用（Web/OPFS 等端）：按文件处理，由 FilePreview 给出结果或报错 */
      }
    }

    const t = resolveOpenTarget(p, isDir);
    const name = opts?.name || t.name;
    if (t.kind === 'dir') store.openTab({ kind: 'git', name, repoPath: t.path });
    else store.openTab({ kind: 'file', name, path: t.path });
  }

  /** 在系统文件管理器中定位/打开（桌面端）。目录直接在文件管理器里打开，文件则选中它。
 *
 *  ★ 空路径与"非桌面端"都要给出**可读提示**，不静默失败 —— 之前 catch 里只有一句
 *    「仅桌面端支持…」，空路径（如空间没绑定目录）也会走到这里，提示就答非所问了。 */
  async function openPathInSystem(path: string, asDir = false) {
    const raw = String(path || '').trim();
    if (!raw) {
      ElMessage.info(asDir ? '该空间未绑定本地目录' : '该文件没有本机路径');
      return;
    }
    // ★ 混合分隔符（`C:\a/03-output\b.mp4`）交给资源管理器会被静默丢弃，
    //   表现为「点了跳去文档」；统一转成原生分隔符再交出去。
    const p = toWindowsPath(raw);
    const electron = (window as unknown as { electronAPI?: any }).electronAPI;
    try {
      // 桌面端优先：目录用 openPath 直接打开，文件用 showItemInFolder 在父目录中选中
      if (asDir && typeof electron?.shell?.openPath === 'function') {
        await electron.shell.openPath(p);
        return;
      }
      if (electron?.shell?.showItemInFolder) {
        await electron.shell.showItemInFolder(p);
        return;
      }
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const shell = getPlatformAdapter().shell;
      if (!shell) throw new Error('无 shell 能力');
      const isWin = /win/i.test(navigator.platform);
      const isMac = /mac/i.test(navigator.platform);
      if (isWin) await shell.exec('explorer.exe', [asDir ? p : `/select,${p}`]);
      else if (isMac) await shell.exec('open', asDir ? [p] : ['-R', p]);
      else await shell.exec('xdg-open', [asDir ? p : p.slice(0, p.lastIndexOf('/')) || p]);
    } catch {
      ElMessage.info('仅桌面端支持在文件管理器中打开');
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
        // ★ 2026-10-12 P2：顶层 systemPrompt 可能被省略（与 messages[0] 重复，不再重复存）→ 从 messages 回退。
        const sysText = (typeof parsed.systemPrompt === 'string' && parsed.systemPrompt)
          ? parsed.systemPrompt
          : (Array.isArray(parsed.messages)
            ? (parsed.messages.find((m: any) => m && m.role === 'system' && typeof m.content === 'string')?.content || '')
            : '');
        if (sysText) {
          lines.push('');
          lines.push('========== 系统提示词 ==========');
          lines.push(sysText);
        }
        return lines.join('\n');
      }
      return JSON.stringify(parsed, null, 2);
    } catch { return raw; }
  }

  const snapshotDialog = ref(false);
  const snapshotActiveTab = ref('');
  const snapshotLoading = ref(false);
  const currentSnapshots = ref<Array<{ id: string; label: string; content: string; chars: number; tokens: number; costLabel: string }>>([]);
  function buildSnapshotEntry(m: any): { id: string; label: string; content: string; chars: number; tokens: number; costLabel: string } {
    const parsed = tryParseSnapshot(m.systemPromptSnapshot);
    const step = parsed?.step ?? 0;
    let content: string;
    if (m.parentToolCallId) {
      // 子智能体快照：以子智能体名标注，避免和主智能体标签混淆
      const subName = parsed?.subAgent?.name || m.subAgentName || '子智能体';
      const label = step === 0 ? `任务 → ${subName}` : `${subName}（#${step}）`;
      content = formatSnapshot(m.systemPromptSnapshot);
      return finalizeSnapshotEntry(m.id, label, content, parsed);
    }
    const agentName = agentStore.selectedAgent?.name || '智能体';
    const label = step === 0 ? `Human → ${agentName}` : `${agentName}（#${step}）`;
    content = formatSnapshot(m.systemPromptSnapshot);
    return finalizeSnapshotEntry(m.id, label, content, parsed);
  }

  /** 快照条目统计尾注（2026-10-20）：字符数 / token 估算 / 花费预估。
   *  token 复用全仓唯一实现 estimateTokens（@yan-zhi/shared，勿另建同名函数）；
   *  花费按**全 input** 估（快照是"本轮实际发送"的上下文，输出侧不在其中），
   *  单价从 platformStore.models 按 snapshot 里的 model.id/alias 匹配，没配价显示"未配置价格"。 */
  function finalizeSnapshotEntry(id: string, label: string, content: string, parsed: any) {
    const tokens = estimateTokens(content);
    let costLabel = '未配置价格';
    try {
      const mid = parsed?.model?.id;
      const malias = parsed?.model?.alias;
      const model = platformStore.models.find((x: any) =>
        (malias && x.alias === malias) || (mid && (x.modelId === mid || String(x.id || '').endsWith(mid))));
      const cost = computeCost(
        { inputTokens: tokens, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, estimated: true },
        normalizePricing(model?.pricing),
      );
      if (!cost.unpriced) costLabel = `≈ ${formatCny(cost.cny)}`;
    } catch { /* 统计失败不影响快照展示 */ }
    return { id, label, content, chars: content.length, tokens, costLabel };
  }

  /** 按需获取单条消息快照：内存里有直接用（本轮流式产生的消息）；历史消息走独立接口/本地库直查 */
  async function fetchSnapshotFor(m: any): Promise<string | undefined> {
    if (m.systemPromptSnapshot) return m.systemPromptSnapshot;
    try {
      // ★ 判据必须是 useServerApi（数据源单一真相源），不是 isLoggedIn：
      //   本地桌面 guest 身份下 isLoggedIn 恒 false（guest 不算登录态），但数据在 server 库
      //   → 此前走本地 adapter 直查 → 查无 → 快照弹窗恒「没有找到提示词数据」。
      if (authStore.useServerApi) {
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
    }))).filter(Boolean) as Array<{ id: string; label: string; content: string; chars: number; tokens: number; costLabel: string }>;
    currentSnapshots.value = entries;
    snapshotActiveTab.value = entries[0]?.id || '';
    snapshotLoading.value = false;
  }

  const isDraftMode = ref(false);
  /** 待建会话的任务级任务类型（「父任务」层：多任务目录里选中的子线）。
   *   startNewChat 一开始就定值，建会话时带下去；不选 = null（跟随目录）。 */
  const pendingTaskType = ref<string | null>(null);
  /** 父任务目录的「选线」框：{ spaceId, spaceName, children }；null = 不显示 */
  const taskLinePicker = ref<{ spaceId: string; spaceName: string; children: Array<{ id: string; label: string; summary: string }> } | null>(null);
  /**
   * 「新任务继续」的待填文案：startNewChat 收尾（restoreDraft('') 之后）写进输入框。
   * ★ 必须由 startNewChat 统一落地：属于父任务目录时 startNewChat 会先弹「选线」框并提前返回，
   *   用户选完线走的是 confirmTaskLine → startNewChat，这里存着的文案才不会丢。
   *   ★ 只预填、不自动发送 —— 用户需要能改完再发。
   */
  const pendingContinuePrefill = ref<string | null>(null);
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

  /**
   * Markdown 渲染缓存（2026-10-10，用户实报「任务一跑整个应用卡死、聊天记录滚不动」）。
   *
   * ★★★ 为什么必须要：`renderMarkdown` 在模板里是**方法调用**
   *   （`v-html="renderMarkdown(round.user.content)"` 等 4 处），Vue 每次重渲都会重新执行它。
   *   而长会话（实测某会话 445 条消息、单条最大 15.8KB）在流式期间**每 50ms 就 flush 一次**
   *   → `messageRounds` 重算 → 整棵消息列表重渲 → **所有历史消息的 Markdown 全部重新解析**。
   *   几十万字符 × 每秒 20 次 = 主线程直接占死，表现就是「整个应用卡」。
   *
   * 策略：`content -> html` 的 LRU 缓存。Markdown 解析是**纯函数**（同样的输入永远同样的
   *   输出），因此缓存永远安全，不存在脏读。流式中的那条消息内容每次都在变 → 它的 key
   *   每帧都是新的，不会被误命中；而**所有历史消息**内容不变 → 后续重渲直接命中缓存，
   *   从「每次全量解析」降级为「每次 O(1) 查找」。
   */
  const MD_CACHE_MAX = 300;
  const mdCache = new Map<string, string>();
  function renderMarkdown(c: string) {
    const src = c || '';
    const hit = mdCache.get(src);
    if (hit !== undefined) return hit;
    const html = md.render(src);
    // LRU：Map 保插入序，超限就丢最旧的一条（而不是 clear，避免抖动时反复全丢）
    if (mdCache.size >= MD_CACHE_MAX) {
      const oldest = mdCache.keys().next().value;
      if (oldest !== undefined) mdCache.delete(oldest);
    }
    mdCache.set(src, html);
    return html;
  }

  /**
   * ★★★ 助手正文专用渲染（2026-10-11，修「任务一跑页面卡死滚不动」的**第二主因**）。
   *
   * 背景：`ChatMessageList.vue:805` 原有同名**组件本地函数**，它在调用（带缓存的）
   *   `renderMarkdown` **之前**先做 4 次贪婪正则 + split（剥 `[TOOL_CALL]` / `<function=>`
   *   / `[[PLATFORM_CONFIG]]` / `@@REASON@@` 分隔符）+ `split('[tool_call]')`。
   *   这段**预处理不受 mdCache 保护** ⇒ 流式期间每帧对 15.8KB 正文重跑正则。
   *   ⇒ 把「预处理 + markdown」整体作为缓存单元（key = 原始 content）。
   *
   * 语义与组件本地版**完全一致**（逻辑逐条搬移，含 `[tool_call]` → chip 占位）。
   * ★ 用独立 LRU（与 renderMarkdown 分开），避免两者互相挤占。
   */
  const ASSISTANT_MD_CACHE_MAX = 200;
  const assistantMdCache = new Map<string, string>();
  function renderAssistantMarkdown(content?: string) {
    const raw = content || '';
    const hit = assistantMdCache.get(raw);
    if (hit !== undefined) return hit;

    // 模型原始输出原样入库；渲染时隐藏文本模式工具调用块（工具调用已由结构化 chip/步骤区展示），
    // 兼容 [TOOL_CALL]{...}[/TOOL_CALL] 与 <function=xxx>...</function> 及未闭合的尾部残留
    let c = raw
      .replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, '')
      .replace(/\[TOOL_CALL\][\s\S]*$/i, '')
      .replace(/<function\s*=\s*\w+\s*>[\s\S]*?<\/function>/gi, '')
      .replace(/<function\s*=\s*\w+\s*>[\s\S]*$/i, '');
    // 去掉平台配置卡片标记和 @@REASON@@ 分隔符（这些由 PlatformConfigCard 组件单独渲染）
    c = c.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/g, '').split('\n@@REASON@@\n')[0].trim();
    const html = c.split(/(\[tool_call\])/g).map((part) => {
      if (part === '[tool_call]') {
        return '<span class="inline-tool-chip"><span class="inline-tool-spinner"></span>正在调用工具</span>';
      }
      return renderMarkdown(part);
    }).join('');

    if (assistantMdCache.size >= ASSISTANT_MD_CACHE_MAX) {
      const oldest = assistantMdCache.keys().next().value;
      if (oldest !== undefined) assistantMdCache.delete(oldest);
    }
    assistantMdCache.set(raw, html);
    return html;
  }

  // 正文图片：统一缩略。模型在总结 md 里输出 ![](url) 是允许的，但尺寸必须严格受控
  // （此前无 renderer，图片按原始尺寸渲染，大图撑破一屏）。
  // src 必须补成可请求地址：模型贴的 /api/generated/... 是站点根相对路径，
  // 打包版桌面端页面在 file:// 下解析不到后端（dev 下靠 vite 的 /api 代理才碰巧能用）。
  // 双击 / 右键进入放大查看、另存为、打开所在目录、复制（事件委托在 handleContentClick）。
  md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    const src = absoluteMediaSrc(token.attrGet('src') || '');
    const alt = self.renderInlineAsText(token.children || [], options, env);
    const title = token.attrGet('title') || '';
    return `<img class="msg-image" src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}"${
      title ? ` title="${md.utils.escapeHtml(title)}"` : ''
    } data-msg-media="image" loading="lazy" draggable="false" />`;
  };

  // ===== 正文里的本机路径 → 可点击，直接进预览（不必先自己找目录）=====
  // 识别口径见 utils/file-open.ts：只认绝对路径，相对路径与网页链接不参与，避免误伤。
  function pathLinkHtml(p: string, extraCls = '') {
    const esc = md.utils.escapeHtml(p);
    return `<a class="file-path-link${extraCls ? ' ' + extraCls : ''}" data-file-path="${esc}" title="点击查看：${esc}">${esc}</a>`;
  }

  // 行内代码里的路径：整段就是一条路径才转（`const p = "C:\a"` 这类片段不转）
  md.renderer.rules.code_inline = (tokens: any[], idx: number) => {
    const raw: string = tokens[idx].content || '';
    if (isLocalPath(raw)) return pathLinkHtml(raw, 'code-inline-path');
    return `<code>${md.utils.escapeHtml(raw)}</code>`;
  };

  // 正文裸路径（默认 text 规则即 escapeHtml，这里分段转义并在路径处插入链接）
  md.renderer.rules.text = (tokens: any[], idx: number, _options: any, env: any) => {
    const content: string = tokens[idx].content || '';
    if ((env && env.inLink) || !hasLocalPath(content)) {
      return md.utils.escapeHtml(content);
    }
    return splitLocalPaths(content)
      .map((seg) => (seg.type === 'path' ? pathLinkHtml(seg.value) : md.utils.escapeHtml(seg.value)))
      .join('');
  };

  // 链接文本内打标记：`[C:\a\b.md](主要链接)` 不再嵌一层 a（HTML 不允许 a 套 a）
  const origLinkOpen = md.renderer.rules.link_open
    || ((tokens: any[], idx: number, o: any, _e: any, self: any) => self.renderToken(tokens, idx, o));
  md.renderer.rules.link_open = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    if (env) env.inLink = true;
    return origLinkOpen(tokens, idx, options, env, self);
  };
  const origLinkClose = md.renderer.rules.link_close
    || ((tokens: any[], idx: number, o: any, _e: any, self: any) => self.renderToken(tokens, idx, o));
  md.renderer.rules.link_close = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    if (env) env.inLink = false;
    return origLinkClose(tokens, idx, options, env, self);
  };

  /** 常见媒体扩展名 —— 正文里这类链接不当作网页打开，而是直接播放/预览 */
  const MEDIA_EXT_RE = /\.(mp4|webm|mov|m4v|ogg|ogv|mp3|wav|m4a|flac)(?=$|[?#])/i;
  const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif)(?=$|[?#])/i;

  function mediaKindOfUrl(url: string): 'image' | 'video' | null {
    if (IMAGE_EXT_RE.test(url)) return 'image';
    if (MEDIA_EXT_RE.test(url)) return 'video';
    return null;
  }

  function handleContentClick(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.classList.contains('code-copy-btn')) {
      const raw = t.getAttribute('data-code') || '';
      navigator.clipboard.writeText(decodeURIComponent(raw)).then(() => {
        t.textContent = '已复制'; setTimeout(() => { t.textContent = '复制'; }, 1500);
      }).catch(() => ElMessage.error('复制失败'));
      return;
    }
    // 正文图片：单击即选中（Ctrl+C 复制对象），双击放大
    const img = t.closest('img.msg-image') as HTMLImageElement | null;
    if (img) {
      selectMedia({ src: img.getAttribute('src') || '', kind: 'image', name: img.getAttribute('alt') || '' });
      return;
    }
    // 点到别处即取消选中，避免 Ctrl+C 误复制上一次点过的图片
    selectMedia(null);
    // 正文里的本机路径链接：文件直接进预览、目录进目录树，不必自己找目录
    const pathEl = t.closest('[data-file-path]') as HTMLElement | null;
    if (pathEl) {
      e.preventDefault();
      void openPath(pathEl.getAttribute('data-file-path') || '');
      return;
    }
    // 链接：媒体文件直接在预览灯箱播放/查看；网页在对话页预览面板的浏览器 tab 打开
    const a = t.closest('a');
    if (a) {
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) || href.startsWith('/')) {
        const kind = mediaKindOfUrl(href);
        if (kind) {
          e.preventDefault();
          openMediaViewer({ src: href, kind, name: (a.textContent || '').trim() || href.split('/').pop() || '' });
          return;
        }
      }
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        // E12: 移动端无内置浏览器——回退系统方式打开（Capacitor Browser 插件/新窗口）
        if (!supportsBrowser) {
          window.open(href, '_blank');
          return;
        }
        // 打开（或激活）browser tab；先置空再设，确保 BrowserPanel 的 watch currentBrowserUrl 触发（重复点同一链接也能重新导航）
        let host = href;
        try { host = new URL(href).hostname || href; } catch { /* keep raw */ }
        store.openTab({ kind: 'browser', name: host, url: href });
        if (store.currentBrowserUrl === href) store.currentBrowserUrl = '';
        nextTick(() => { store.currentBrowserUrl = href; });
      }
    }
  }

  /** 正文双击：图片放大查看 */
  function handleContentDblClick(e: MouseEvent) {
    const img = (e.target as HTMLElement).closest('img.msg-image') as HTMLImageElement | null;
    if (!img) return;
    e.preventDefault();
    openMediaViewer({
      src: img.getAttribute('src') || '',
      kind: 'image',
      name: img.getAttribute('alt') || '',
    });
  }

  /** 正文右键：图片走媒体菜单，其余不拦截（保留浏览器默认菜单） */
  function handleContentContextMenu(e: MouseEvent) {
    const img = (e.target as HTMLElement).closest('img.msg-image') as HTMLImageElement | null;
    if (!img) return;
    e.preventDefault();
    openMediaMenu(e, {
      src: img.getAttribute('src') || '',
      kind: 'image',
      name: img.getAttribute('alt') || '',
    });
  }

  /**
   * 全局 Ctrl/Cmd+C：选中了消息里的图片时复制图片本身。
   * 有文本选区、或在输入框内时不拦截，保留浏览器/输入框默认的文本复制。
   */
  async function handleGlobalKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && (sel.toString() || '').trim()) return;
    if (await copySelectedMedia()) e.preventDefault();
  }

  const currentConv = computed(() => store.conversations.find((c) => c.id === store.currentConvId));
  /**
   * 当前会话是否已归档（2026-10-16）。
   *
   * 归档 = **只读**：可以看、可以搜、不能发新消息（对齐 ChatGPT 与
   * Anthropic Agent SDK 的 archive 语义）。前端禁用输入框 + 顶部提示只是第一道，
   * 真正的闸在服务端（POST /conversations/:id/messages 拦 role=user，
   * createTask 拒绝给归档会话开任务）——前端那道是为了让用户看懂"为什么发不出去"。
   */
  const currentConvArchived = computed(() => !!currentConv.value?.archivedAt);
  const filteredConversations = computed(() => {
    // ★ 生命周期兜底（2026-10-16）：主列表只渲染正常会话。
    //   后端 GET /conversations 默认已按 scope=active 过滤，这里是**第二道**——
    //   一旦后端口径漏了（或旧缓存里混进了已归档行），前端至少不会把它画进主列表。
    //   ⚠️ 不能反过来说"前端有这道就不用改后端"：批量删除/导出这类扫 conversations 的
    //      逻辑走的是 store.conversations 全量，前端过滤拦不住它们。
    let list = store.conversations.filter((c) => !c.archivedAt && !c.deletedAt);
    if (!search.value.trim()) return list;
    const q = search.value.trim().toLowerCase();
    return list.filter((c) => c.title.toLowerCase().includes(q));
  });
  /** 对话根节点：未归入任何空间的会话 */
  const rootConversations = computed(() => filteredConversations.value.filter((c) => !c.spaceId));
  /**
   * 置顶分组（2026-10-09）。
   *
   * ★ 为什么单列一组（issues/会话置顶入口隐蔽-20260919 的「缺失项 1」）：
   *   此前置顶只靠 `pinned DESC` 排到最前，**混在普通会话里没有任何视觉分区** →
   *   用户感知不到"这些是置顶的"（实测反馈：「会话列表没有星标功能」）。
   *   入口（hover 星标 + 右键菜单）其实都在，缺的就是这个"看得出被置顶"的分组。
   * ★ 只收**根级**置顶（未归空间的）：空间内的置顶已在该空间分组内排序靠前，
   *   再抽出来会让同一个会话出现在两处 —— 分组的意义是分区，不是重复展示。
   * ★ 搜索时同样生效（filteredConversations 已含搜索过滤），语义一致。
   */
  const pinnedRootConversations = computed(() => rootConversations.value.filter((c) => !!c.pinned));
  /** 未置顶的根级会话（置顶组之下的主列表；置顶组为空时它等于 rootConversations） */
  const unpinnedRootConversations = computed(() => rootConversations.value.filter((c) => !c.pinned));
  /** 置顶组是否展开（会话级 UI 状态，与 spaceCollapsed 同形态） */
  const pinnedCollapsed = ref(false);
  const togglePinnedCollapse = () => { pinnedCollapsed.value = !pinnedCollapsed.value; };
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

  /**
   * 轮次结构（用户消息 → agent 步骤 → 最终回答）。
   *
   * ★★★ 性能架构（2026-10-11 定稿，「长列表卡死」三层修法中本层的位置）：
   *   ① 数据层窗口 = **分页**（store.loadMessages 首拉最近 50 条 + loadMoreHistory 向前翻页）
   *      —— 即「只渲染尾部 N 轮」的实现位置。刻意**不做** DOM 级虚拟滚动：本列表是
   *      markdown 渲染的变高内容，虚拟滚动需要估高，会破坏浏览器原生滚动锚定 / Ctrl+F /
   *      横岗跳转（querySelector [data-round]）——风险远大于收益。
   *   ② 每帧成本在**源头**消灭：toolResultIndex O(1) 查表（下方的 computed）+
   *      renderMarkdown/AssistantMarkdown LRU + 流式 flush 自适应节流（stores/chat.ts）。
   *   ③ 稳定 key：ChatMessageList 的 v-for 用用户消息 id 作 key（非下标），prepend 翻页
   *      不再全量卸载重挂存量 DOM。
   *
   * ★ 本函数重算一次仅 ~0.2 ms（400 条消息），不是瓶颈；**刻意不做**轮次对象引用复用：
   *   没有 v-memo 这类消费者时引用复用是死代码。而 v-memo 在本模板**不可用**——
   *   模板内 30+ 处交互状态（collapsedMessages / expandedTools / runningToolCallIds /
   *   openActionsMsgId…）都是组件级共享 reactive 容器（身份不变、内容变），
   *   v-memo 浅比较会把「工具运行中→完成」「点开折叠」永久冻住（frozen-UI 陷阱）。
   */
  // ★★★ 2026-10-12：实现已抽出到 `./message-rounds`（纯函数，可独立单测）。
  //   本 computed 只负责"取当前会话消息 + 注入 isToolErrorContent"。
  //   抽出的理由见该文件顶部注释（内容区渲染与否的唯一判定，且出错的形态是整页空白，
  //   只能靠行为测试抓 —— 而 useChat.ts 依赖太重不适合直接单测）。
  const messageRounds = computed<MessageRound[]>(() =>
    buildMessageRounds(store.currentMessages, isToolErrorContent),
  );

  // ==================================================================
  // ★★★ 消息列表窗口化渲染（B1，2026-10-13，内存/卡顿治理最大单项）。
  //
  //   现状：全量轮次进 DOM —— 实测会话 1024 条消息（含工具回执）估算数万 DOM 节点，
  //   UI 进程数百 MB；403 条时已实测渲染主线程饱和（IPC 迟到 34.3s，10-11 日志）。
  //
  //   方案：以**轮次**为单位开窗，DOM 只挂窗口内的轮次。为什么不用像素级虚拟滚动：
  //   轮次高度差极大（一条用户消息 vs 几十个工具步骤），估高做占位条必然跳动，
  //   而消息流的"位置稳定"比"省那几个节点"重要得多。
  //
  //   ★ 语义用**绝对起点**（windowStart），而不是"距末尾 N 轮"：
  //     · `null` = 跟随末尾：窗口恒为末尾 ROUND_WINDOW_SIZE 轮 —— 流式追加时
  //       窗口自然向前滑（用户在看最新输出，滑走的是最老那轮，符合预期）；
  //     · 用户向上滚（视口接近顶部）→ **钉住起点**（记下当前起始下标）并向前扩窗；
  //       此后追加消息只让窗口向下生长，**绝不卸掉用户正在读的内容**；
  //     · 换会话/新任务 → 回到"跟随末尾"。
  //   scrollToRound 跳转前调 ensureRoundVisible 把目标纳入窗口（否则 DOM 不在跳不到）。
  //
  //   ★ 不设"收窄"：收窄需要高度补偿（估高会跳），而窗口只会在用户主动向上滚时变大；
  //     单会话轮次数有限（1024 条 ≈ 300 轮），最坏情形退化为现状，典型收益在"会话打开
  //     初期只挂末尾 30 轮"——重会话切回时的卡顿与内存大头正在这里。
  // ==================================================================
  const ROUND_WINDOW_SIZE = 12;   // 跟随末尾时的窗口大小（轮）
  // ★ 2026-10-19：30 → 12。实测 18 轮/1423 条消息的长会话，30 轮窗口等于全量渲染，
  //   叠加流式 flush 把渲染进程主线程压死。12 轮足够日常阅读；向上滚动仍会懒扩窗。
  const ROUND_WINDOW_STEP = 20;   // 每次向上扩窗的步长（轮）
  /** 窗口起始轮的**身份锚**（该轮 user 消息 id）；null = 跟随末尾。
   *  ★ 用身份而不是下标：向上翻页 loadMoreHistory 会把更早消息 prepend 到数组头部，
   *    全量下标整体位移 —— 记下标的窗口会"锚到别的内容"（用户视野里的消息被换掉）。
   *    记 id 则天然跟随内容平移。 */
  const windowAnchorId = ref<string | null>(null);
  /** 轮次身份（user 消息 id，缺省用轮内首个消息 id 兜底） */
  function roundKey(r: MessageRound | undefined): string | null {
    if (!r) return null;
    return r.user?.id || (r as any).finalAssistant?.id || null;
  }
  /** 当前窗口起始下标：跟随末尾 → total-SIZE；否则 → 锚定轮的新下标 */
  function currentWindowStart(all: MessageRound[]): number {
    if (windowAnchorId.value === null) return Math.max(0, all.length - ROUND_WINDOW_SIZE);
    const i = all.findIndex((r) => roundKey(r) === windowAnchorId.value);
    // 锚定轮找不到（被删除/会话切换竞态）→ 回退到跟随末尾，绝不返回脏下标
    return i >= 0 ? i : Math.max(0, all.length - ROUND_WINDOW_SIZE);
  }
  /** 窗口化轮次：[全量下标, round] 对 —— 模板仍用**全量下标**（data-round /
   *  expandedReasoning['round-'+ri] 等所有 UI 状态 key 都以全量下标为锚，不能换） */
  const visibleRounds = computed<Array<{ ri: number; round: MessageRound }>>(() => {
    const all = messageRounds.value;
    const start = currentWindowStart(all);
    const out: Array<{ ri: number; round: MessageRound }> = [];
    for (let i = start; i < all.length; i++) out.push({ ri: i, round: all[i] });
    return out;
  });
  /** 跳转/定位前把目标轮次纳入窗口（否则 DOM 不存在 → 跳转静默失效） */
  function ensureRoundVisible(ri: number) {
    const all = messageRounds.value;
    if (ri < 0 || ri >= all.length) return;
    const start = currentWindowStart(all);
    if (ri >= start) return;                     // 已在窗口内
    const from = Math.max(0, ri - 3);            // 目标上方留 3 轮上下文
    // 锚点取不到（极端数据：轮内既无 user 也无 finalAssistant）→ 保持 null（跟随末尾）
    windowAnchorId.value = roundKey(all[from]);
  }
  // 换会话/新任务 → 回到"跟随末尾"
  watch(() => store.currentConvId, () => { windowAnchorId.value = null; });
  // 滚近顶部 → 钉住起点并向上扩窗（rAF 节流，与 handleScroll 同一事件源）
  let windowExpandRaf = 0;
  function expandWindowOnScroll() {
    const el = messagesRef.value;
    if (!el) return;
    const all = messageRounds.value;
    if (all.length === 0) return;
    if (el.scrollTop >= el.clientHeight * 0.5) return;   // 只在接近顶部时扩窗
    const start = currentWindowStart(all);
    if (start === 0) return;                              // 已到最早
    const from = Math.max(0, start - ROUND_WINDOW_STEP);
    const anchor = roundKey(all[from]);
    if (anchor) windowAnchorId.value = anchor;            // 扩窗：窗口首轮前移
  }

  /**
   * 窗口是否已覆盖最早一轮（= 再往上没有可扩的轮次了）。
   *
   * ★ 2026-10-13 补：`handleScroll` 里用 `!windowAll.value` 做「无需再扩窗」的短路判断，
   *   但**全仓没有 windowAll 的定义**（上游 HEAD 自带的编译错误：TS2552 Cannot find name）。
   *   口径与 `expandWindowOnScroll` 的早退条件**同源**（`currentWindowStart(all) === 0`），
   *   故按同一判据补上。安全边界：即便判据有偏差，最坏也只是多跑一次会立刻早退的 rAF，
   *   不改变任何行为。
   */
  const windowAll = computed(() => {
    const all = messageRounds.value;
    return all.length === 0 || currentWindowStart(all) === 0;
  });

  /**
   * ★★★ 工具结果索引（2026-10-11，修「任务一跑页面卡死滚不动」的**主因**）。
   *
   * 背景：模板里 `getToolResult(tc.id)` / `isToolError(tc.id)` 是**方法调用**
   *   （`ChatMessageList.vue` 里分别出现 8 处 / 2 处），Vue **不缓存模板函数调用** ——
   *   每次组件重渲都会重新执行。而这两个函数原本是：
   *     `store.currentMessages.find(m => m.role==='tool' && m.toolCallId===id)`  ← O(n) 全表扫描
   *     + `JSON.parse(toolMsg.content)`                                        ← 解析可能 15.8KB 的 JSON
   *
   * 为什么"每次都全量"：流式期间 `chunk` 每 50ms flush 一次 → `messageRounds` 重算
   *   （重算本身仅 0.187ms，**不是瓶颈**）→ 但它返回**全新 round 对象引用** →
   *   整棵消息列表重渲 → 所有历史消息里的 `getToolResult(...)` 全部重跑。
   *   实测会话 445 条消息、一屏 ~50 个工具调用 ⇒ 每帧数百次 find + 数千次 JSON.parse，
   *   每秒 20 帧 ⇒ 主线程占死。
   *
   * 修法：本 computed 与 `messageRounds` **同源同生命周期**（都只依赖 `store.currentMessages`），
   *   一次遍历建好 `callId -> {content, isError}` 索引，热函数降为 **O(1)** 查表。
   *   ★ 索引与 rounds 一起重算 ⇒ 天然不会脏读；content 未变的帧直接命中。
   *   ★ `content` 存的是**解析后的展示文本**（与 `getToolResult` 原语义完全一致），
   *     避免每帧重复 JSON.parse。
   */
  const toolResultIndex = computed<Map<string, { content: string | null; isError: boolean }>>(() =>
    buildToolResultIndex(store.currentMessages),
  );

  function isToolErrorContent(content: string): boolean {
    try {
      const parsed = JSON.parse(content);
      return !!parsed?.isError;
    } catch { return false; }
  }

  /** 可供对话使用的模型：模型自身可见（visible）+ 所属平台总开关打开（llmEnabled）+ 类型是对话类。
   *  平台模型动辄几百个时，用户靠 platform.llmEnabled 一键屏蔽整个平台、靠 model.visible 屏蔽单个模型。 */
  const chatModels = computed(() =>
    platformStore.models.filter((m) =>
      m.enabled &&
      m.visible !== false &&
      CHAT_MODEL_TYPES.includes(m.type) &&
      platformStore.platforms.find((p) => p.id === m.platformId)?.llmEnabled !== false,
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

  // ★★★ 2026-10-11 分页适配：会话还有未加载的更早历史时（hasMore），前端只见到尾部
  //   50 条 → 直接 reduce 会**系统性偏低**（与服务端 context-breakdown 查全量的口径撕裂）。
  //   修法：偏低量用「已加载窗口首条消息的时间」之前的**已压缩摘要**无法在前端便宜地补，
  //   因此改为**懒加载下前端只估「当前可见窗口」并明确标注**：tokenCount 照旧算可见部分，
  //   但用量环的语义变成「当前窗口占用」——服务端压缩决策始终按全量 + 摘要（不受影响）。
  //   ★ 折衷理由：翻页补全量会让 computed 依赖 400+ 条消息（回到每帧全量 reduce 的老路，
  //     正是本次要消灭的）；而 tokenCount 本就是 estimateTokens 估算而非 API 精确值。
  const loadedConvHasMore = computed(() => {
    const p = store.historyPagingByConv[store.currentConvId];
    return !!p && p.hasMore;
  });
  const tokenCount = computed(() =>
    store.currentMessages.reduce(
      (s, m) =>
        s
        + estimateTokens(m.content || '')
        + estimateTokens(m.reasoningContent || '')
        // ★★★ 必须计入 toolCalls（2026-10-09，D2）：后端 tokenCount（packages/core/src/compress/window.ts）
        //   明确把 toolCalls 计入，并注明"toolCalls 常占最长部分"。
        //   前端此前漏了它 → **显示用量系统性偏低**：用户更晚看到"快满了"，
        //   而且前后端口径不一致会让"前端说还有空间、后端却开始压缩"看起来像 bug。
        //   ★ 判据：同一个量在两处计算就必须同口径；这里按后端同样取 arguments 的字符串长度估算。
        + (m.toolCalls || []).reduce((ts, tc) => {
          const anyTc = tc as unknown as {
            function?: { arguments?: unknown; name?: string };
            arguments?: unknown;
            toolName?: string;
          };
          const raw = anyTc.function?.arguments ?? anyTc.arguments;
          const argText = typeof raw === 'string' ? raw : (raw ? JSON.stringify(raw) : '');
          return ts + estimateTokens(argText) + estimateTokens(anyTc.function?.name || anyTc.toolName || '');
        }, 0),
      0,
    ),
  );
  /** 标称上下文窗口（模型配置值）—— 只用来说明"模型 API 上限"，不用来算用量 */
  const declaredContextWindow = computed(() => {
    const m = platformStore.models.find((x) => x.id === selectedModelId.value);
    return m?.contextWindow || DEFAULT_CONTEXT_WINDOW;
  });
  /**
   * ★★★ 有效可用窗口（2026-10-02）—— 用量口径**必须按它算，不能按标称窗口算**。
   *
   * 为什么：标称 1M 的模型在 256K 之后就明显退化（Chroma Context Rot / RULER / 社区甜点区，
   * 详见 `@yan-zhi/shared/utils/context-policy.ts`）。若按标称窗口显示百分比，用户会看到
   * "才用了 30%，还很空" —— 而实际上已经越过了有效边界。这属于**误导性展示**。
   * ★ 与服务端 `effectiveWindowOf`（context-view.ts）共用同一个常量（`EFFECTIVE_CONTEXT_RATIO`），
   *   否则"前端说没事、后端在压缩"会自相矛盾。
   */
  const contextLimit = computed(() => effectiveContextLimit(declaredContextWindow.value));
  const tokenPercent = computed(() => contextUsagePercent(tokenCount.value, declaredContextWindow.value));
  // 注：原 tokenBarColor（80/100 阈值硬编码 hex）已随右侧用量环一并删除 ——
  // Task 6 的 ContextUsagePill 用 token 化配色按 70/90 阈值自行分档。
  /** 能否发送 —— 与 ChatInputArea 的 `canSubmit` **同一口径**（内容 + 模型）。
   *
   *  ★★★ 为什么去掉 `!store.isConvStreaming(...)`（2026-10-10）：
   *   本会话在跑时，发送按钮的语义是「**追加到队列**」（见 send() 入口的
   *   `runningConvEarly` 入队分支，2026-10-11 上移到重入锁之前）—— 那不是"发送被禁止"，
   *   而是"换个去向送"。加这个条件会导致"任务跑着就发不出追加消息"，与设计意图直接冲突。
   *   真正的防重入由 `sending` 锁 + 「取走内容即清空 input」两道防线保证，不需要在 enable 判据里表达。
   */
  const canSend = computed(() => (!!input.value.trim() || uploadedFiles.value.length > 0) && !!selectedModelId.value);

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
  // taskType：目录绑定的任务类型（「目录即任务」）。空串 = 通用。
  // parentId：非空 = 本空间是父任务目录下的「子目录」（创建模式可由父目录右键预置）。
  const spaceEditForm = ref({ id: '', name: '', dirPath: '', description: '', taskType: '', parentId: '' });
  const spaceMenuTarget = ref<{ x: number; y: number; space: any } | null>(null);

  /**
   * 任务类型下拉的选项：**运行时以后端 task_type 表为准**，内置清单只作首屏/离线兜底。
   *
   * ★ 为什么要读库而不是直接用 TASK_TYPES（2026-10-14 配置表化）：
   *   用户在库里（或让大模型）新建的类型若不在下拉里，等于"建了但用不上"；
   *   而库里改过的 SOP/guide 也必须与注入侧同一份 —— 两边都读库才不会漂移。
   * ★ 兜底纪律：store 初始值是 shared 的 TASK_TYPES，拉取失败保留现值不清空。
   */
  const taskTypeStore = useTaskTypeStore();
  const taskTypes = computed(() => taskTypeStore.taskTypes);
  /** 当前编辑表单选中的类型说明（弹窗里给用户看清这个类型会做什么） */
  const pickedTaskType = computed(() => taskTypeStore.byKey(spaceEditForm.value.taskType) || getTaskType(spaceEditForm.value.taskType));

  /** 点空间节点 = 选中它（决定新任务归属）+ 同步工作目录（资源面板/工具执行面与之一致）。
   *  ★ 必须同时做：只 selectSpace 不改 workspaceDir，会出现「面板显示 A 空间的项目资源、
   *    工具却往 B 目录写」的错位（两者都读同一个空间，但 root 来自 dir_path/workspaceDir）。
   *  折叠态由用户的展开/收起操作单独控制（点击时顺带展开，避免"选中了却看不见里面"）。 */
  async function selectSpaceAndSyncDir(id: string) {
    spaceStore.selectSpace(id);
    const sp = spaceStore.spaces.find((s) => s.id === id);
    if (sp?.dirPath) await syncWorkspaceDirToSpace(id);
    // 选中时顺带展开：否则「选中了却看不到里面的任务」
    if (spaceCollapsed.value[id]) spaceCollapsed.value = { ...spaceCollapsed.value, [id]: false };
    // ★ 任务类型 → 专属智能体：选中一个已绑定任务模式的空间时，也把智能体对齐。
    //   否则「设了类型 → 过一会再点进来」会回到默认助手，专属纪律就丢了。
    //   注意只在该空间有 taskType 时切（通用类型 applyTaskTypeAgent 内部直接返回）。
    if (sp?.taskType) applyTaskTypeAgent(sp.taskType);
  }

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
      taskType: space.taskType || '',
      parentId: space.parentId || '',
    };
    showSpaceEdit.value = true;
  }

  /** 新建空间：复用空间编辑对话框，id 为空表示创建模式；
   *  传 parentId = 在父任务目录下建「子目录」（父目录右键菜单入口） */
  function openSpaceCreate(parentId?: string) {
    spaceEditForm.value = { id: '', name: '', dirPath: '', description: '', taskType: '', parentId: parentId || '' };
    showSpaceEdit.value = true;
  }

  async function saveSpaceEdit() {
    if (!spaceEditForm.value.name.trim()) { ElMessage.warning('名称不能为空'); return; }
    const form = spaceEditForm.value;
    const payload = {
      name: form.name.trim(),
      dirPath: form.dirPath.trim() || undefined,
      description: form.description.trim() || undefined,
    };
    if (!form.id) {
      try {
        const id = await spaceStore.createSpace({ ...payload, parentId: form.parentId || undefined });
        // 创建后若选了任务类型，走 updateSpace（后端会建资源目录骨架 + 写 task.json）
        if (form.taskType) {
          await spaceStore.updateSpace(id, { taskType: form.taskType });
          const t = getTaskType(form.taskType);
          // 任务类型 → 专属智能体（A 方案）：选了类型就把人格+技能+工具面对齐
          applyTaskTypeAgent(spaceEditForm.value.taskType);
          ElMessage.success(`空间「${payload.name}」已创建（${t.label}：已生成 00-source 等资源目录）`);
        } else {
          ElMessage.success(`空间「${payload.name}」已创建`);
        }
        spaceStore.selectSpace(id);
      } catch (e: any) {
        ElMessage.error(e?.message || '创建空间失败');
        return;
      }
    } else {
      await spaceStore.updateSpace(form.id, payload);
      // 任务类型单独走一次（仅在变化时请求，后端幂等建目录）
      const cur = spaceStore.spaces.find((s) => s.id === form.id);
      if ((cur?.taskType || '') !== form.taskType) {
        try {
          await spaceStore.updateSpace(form.id, { taskType: spaceEditForm.value.taskType || null });
          const t = getTaskType(form.taskType);
          if (form.taskType) {
            // 任务类型 → 专属智能体（A 方案）
            applyTaskTypeAgent(spaceEditForm.value.taskType);
            ElMessage.success(`已设为「${t.label}」，资源目录（00-source / 01-reference / 02-work / 03-output）已就绪`);
          } else {
            ElMessage.success('已设为「通用」，不再注入任务流程');
          }
        } catch (e: any) {
          ElMessage.error(e?.message || '设置任务类型失败');
          return;
        }
      } else {
        ElMessage.success('空间已更新');
      }
    }
    // ★ 父任务目录收编子目录（2026-10-17 用户拍板「设置成父任务类型自动合并」）：
    //   设成父任务类型后把 dirPath 下的子文件夹同步成子空间 —— 已有平铺空间直接收编、
    //   没有的新建，绝不重复。服务端 PATCH 里也会自动触发，这里显式调是为了拿结果汇报。
    const savedId = form.id || spaceStore.currentSpaceId;
    const saved = spaceStore.spaces.find((s) => s.id === savedId);
    if (saved && !saved.parentId && saved.taskType && isParentTaskType(saved.taskType)) {
      try {
        const r = await spaceStore.syncSubdirs(saved.id);
        const n = r.adopted.length + r.created.length;
        if (n > 0) {
          const parts: string[] = [];
          if (r.adopted.length) parts.push(`收编已有目录 ${r.adopted.length} 个`);
          if (r.created.length) parts.push(`新建子目录 ${r.created.length} 个`);
          ElMessage.success(`「${saved.name}」：${parts.join('、')}（见侧栏层级）`);
        }
      } catch { /* 同步失败不阻塞保存；右键「同步子目录」可重试 */ }
    }
    showSpaceEdit.value = false;
  }

  /**
   * 在系统文件管理器里打开**这个任务的产物目录**（会话右键菜单「打开目录」）。
   *
   * ★★ 为什么需要（2026-09-27 用户要求）：
   *   任务跑完的产物落在 `.yan-zhi/tasks/<convId>/<deliverable|intermediate|upload>/`，
   *   用户想去文件夹里拿文件时，此前只能先打开某个文件的预览再点「打开目录」——
   *   任务本身没有入口。这里补上「直接开这个任务的工作目录」。
   *
   * ★ 目录解析优先问服务端（`/artifact-dir?ensure=1`）：产物根是**服务端算出来**的，
   *   前端自己拼 `workspaceDir` 会与服务端不一致（历史踩过：产物根漂移导致读不到文件）。
   *   取不到（Web/移动端无 shell、或接口失败）时给出可读提示，不静默失败。
   */
  async function openConvDir(conv: any) {
    if (!conv?.id) return;
    const electron = (window as unknown as { electronAPI?: any }).electronAPI;
    if (!electron?.shell?.showItemInFolder && !electron?.shell?.openPath) {
      ElMessage.info('仅桌面端支持在文件管理器中打开目录');
      return;
    }
    try {
      // 列产物目录并顺带建出来：任务还没产出文件时目录可能不存在，
      // 「打开目录」应当能打开一个空目录，而不是报错（用户想看的是"东西放哪"）。
      const r = await api.get<{ dir?: string }>(`/conversations/${conv.id}/artifact-dir?category=deliverable&ensure=1`);
      const dir = 'data' in r ? r.data?.dir : '';
      if (!dir) { ElMessage.warning('未能解析该任务的产物目录'); return; }
      // 优先"直接在文件管理器打开这个目录"；没有 openPath 时退化为"在父目录中选中它"
      if (typeof electron.shell.openPath === 'function') await electron.shell.openPath(dir);
      else await electron.shell.showItemInFolder(dir);
    } catch (e: any) {
      ElMessage.error('打开目录失败：' + (e?.message || e));
    }
  }

  /**
   * 在独立窗口打开会话（2026-10-18 改版）：与模式独立窗口同形态的**完整交互窗口**
   * （1440×900，侧栏/输入框/预览全套保留，顶栏菜单隐藏防切走），固定加载该会话。
   * 旧版 520×760 只读监控器（/task-window/:convId）保留给大模型链路 ——
   * app_open_window / screen_record 的目标窗口 key 是 task-run-<convId>，此处改用
   * conv- 前缀避免撞车（同 key 会聚焦复用，用户窗口会被录屏链路顶掉）。
   * key 按会话隔离 —— 同一会话重复打开聚焦已有窗口而不是再开一个。
   */
  async function openTaskWindow(conv: any) {
    if (!conv?.id) return;
    const { openChildWindow } = await import('../../utils/childWindow');
    const route = `/chat?window=conv&conv=${conv.id}`;
    const ok = await openChildWindow({
      key: `conv-${conv.id}`,
      route,
      width: 1440,
      height: 900,
    });
    if (!ok) {
      // Web / 不支持真窗口 → 新标签页兜底（hash 路由，同一份产物即可）
      window.open(`${location.origin}${location.pathname}#${route}`, '_blank');
    }
  }

  async function deleteSpaceConfirm(space: any) {
    try {
      await ElMessageBox.confirm(
        `确定删除空间"${space.name}"吗？其下会话将归入"未归类"，目录文件不受影响。`,
        '删除空间',
        { type: 'warning', confirmButtonClass: 'yz-confirm-danger', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
      await spaceStore.deleteSpace(space.id);
      ElMessage.success('空间已删除');
    } catch { /* 取消 */ }
  }

  function openSpaceMenu(e: MouseEvent, space: any) {
    e.preventDefault();
    e.stopPropagation();
    // 再次右击同一空间 = 收起（toggle）
    if (spaceMenuTarget.value?.space?.id === space.id) { closeSpaceMenu(); return; }
    // 互斥：关掉会话 / 空白区 / 其它空间菜单
    closeCtxMenu();
    // 先按光标落位（不猜高度夹取），渲染后由宿主组件的 placeMenuAfterRender 按真实尺寸校正
    spaceMenuTarget.value = { x: e.clientX, y: e.clientY, space };
  }

  /** 父任务目录右键「同步子目录」：把 dirPath 下的磁盘子文件夹收编成子空间（幂等，可反复点）。
   *  设父任务类型保存时已自动同步过一次，这里是补扫入口（新放了文件夹 / 自动同步失败）。 */
  async function syncSpaceSubdirsAction(space: any) {
    if (!space?.id) return;
    try {
      const r = await spaceStore.syncSubdirs(space.id);
      const n = r.adopted.length + r.created.length;
      if (!n) { ElMessage.info('没有新的子目录需要同步'); return; }
      const parts: string[] = [];
      if (r.adopted.length) parts.push(`收编已有目录：${r.adopted.join('、')}`);
      if (r.created.length) parts.push(`新建子目录：${r.created.join('、')}`);
      ElMessage.success(parts.join('；'));
    } catch (e: any) {
      ElMessage.error(e?.message || '同步子目录失败');
    }
  }

  function closeSpaceMenu() {
    spaceMenuTarget.value = null;
  }

  async function moveConvToSpace(convId: string, spaceId: string | null) {
    await store.updateConversation(convId, { spaceId: spaceId || undefined });
    ElMessage.success(spaceId ? '已移动到空间' : '已移出空间');
  }

  /** 发送消息时确保工作目录对应的空间存在：按 dirPath 匹配已有空间；没有则以文件夹名创建并选中。返回空间 ID（无有效工作目录/失败时返回 undefined） */
  /**
   * 决定「新任务归属哪个空间」。
   *
   * ★★★ 顺序不能反（2026-09-27 修的真实 bug）：
   *   原实现直接 `let spaceId = await ensureWorkspaceSpace()`，而它**只按 workspaceDir 的
   *   目录路径匹配空间**、匹配不到还会**自动新建并 selectSpace** —— 完全不看用户当前选中的空间。
   *   后果：用户在侧栏选了空间 A（想让任务按 A 的任务类型跑），只要设置里的工作目录指向 B，
   *   任务就落到 B（甚至被建出一个新空间）→ A 绑定的 task_type / SOP **永远不会生效**，
   *   表现为「任务类型选了跟没选一样」。
   *
   * 正确顺序：
   *   ① 用户显式选中的空间（currentSpaceId）—— 用户的意图优先级最高；
   *   ② 其次才按工作目录推断（保持既有「选目录即建空间」的便利行为）；
   *   ③ 都没有 → undefined（不归类，由后端存 null）。
   */
  async function resolveSpaceForNewConv(): Promise<string | undefined> {
    const picked = spaceStore.currentSpaceId;
    if (picked && spaceStore.spaces.some((s) => s.id === picked)) return picked;
    return await ensureWorkspaceSpace();
  }

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
    // ★ 会话登记文件带上 conversationId：FilePreview 走会话产物通道（跨根探测+登记兜底）需要它
    store.openTab({ kind: 'file', name: f.name, path: f.path, conversationId: f.conversationId });
  }

  async function showConvFileMenu(e: MouseEvent, f: any) {
    try {
      const action = await ElMessageBox.confirm('', '文件操作', {
        confirmButtonText: '删除',
        confirmButtonClass: 'yz-confirm-danger',
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

  /**
 * 自愈：持久化的默认平台/模型若失效（被删/库重置/账号切换），回退到第一个可用对话模型。
 *
 * ★★ 必须区分「列表为空」的两种原因（这是「默认模型丢失」反复修不好的真根因）：
 *   ① **还没成功拉到**（移动端内嵌后端冷启动、网络抖动）→ 此时 platforms/models 都是空，
 *      若照常回退，nextM 会是空串，于是把 settings 里的 defaultModelId **改写成空**
 *      —— 用户的默认模型被永久抹掉，之后即使后端就绪、重试成功也**救不回来**。
 *      表现为「刚进移动端模型平台没初始化、输入框没有默认挂载」，且重启也复现。
 *   ② **确实拉到了但没有可用对话模型** → 这时才应该回退（保留原有的自愈语义）。
 *
 * 判据用 platformStore 的 platformsLoaded / modelsLoaded（只有成功响应才置 true）。
 * 两个都没就绪 → 直接 return，不碰用户配置。
 */
async function healStalePlatform() {
    const dp = settingsStore.settings.defaultPlatformId;
    const dm = settingsStore.settings.defaultModelId;
    const dpOk = !!dp && platformStore.platforms.some((p) => p.id === dp);
    const dmOk = !!dm && platformStore.models.some((m) => m.id === dm && m.enabled);
    if (dpOk && dmOk) return;
    // ★ 数据未就绪：不改配置（否则会把有效的默认值清空）
    if (!platformStore.platformsLoaded || !platformStore.modelsLoaded) {
      // 「持久化值在当前列表里查不到」但列表又没拉全 —— 无法判定失效，保持原样
      if (dp || dm) return;
    }
    const firstChat = platformStore.models.find((m) => m.enabled && CHAT_MODEL_TYPES.includes(m.type));
    const fbPlatform = firstChat ? platformStore.platforms.find((p) => p.id === firstChat.platformId) : undefined;
    // ★ 兜底一律回落到**原值**（dp / dm），不再有 `|| ''` 收尾 ——
    //   拿不到候选时就保持现状，绝不把用户配置写成空串。
    const nextP = fbPlatform?.id || platformStore.platforms[0]?.id || dp;
    const nextM = firstChat?.id || dm;
    if (nextP !== dp || nextM !== dm) {
      await settingsStore.update({ defaultPlatformId: nextP, defaultModelId: nextM });
    }
  }

  /**
   * 数据就绪后补挂默认模型。
   *
   * 场景：onMounted 时平台/模型还没拉到（移动端内嵌后端冷启动），
   * 上面的 `selectedModelId` 分支因 `chatModels` 为空而**什么都不选** ——
   * 于是输入框停在「选择模型」空态，用户必须手动进模型页点一下。
   *
   * 这里：只要还没选中模型，就等 `modelsLoaded` 变真后补选一次
   * （优先数据库的 is_default → settings → 第一个可用对话模型，与 mounted 同口径）。
   * 用一个 once 标记防止反复触发；选到即停。
   */
  let modelPickedAfterReady = false;
  function ensureModelWhenReady() {
    if (selectedModelId.value) { modelPickedAfterReady = true; return; }

    // ★★ 数据已就绪 → 根本不需要挂 watch，直接补选一次即可。
    //   这条早退不只是优化，更是**修掉一个致命 bug**：
    //   原实现在任何情况下都调用 `watch(..., { immediate: true })`，
    //   而 immediate 回调是**同步执行**的 —— 回调体里引用了 `const stop`，
    //   此时 `stop` 还处在 TDZ（尚未初始化）→ 抛
    //   `ReferenceError: Cannot access 'stop' before initialization`。
    //   该错误发生在 onMounted 的 await 恢复之后，**直接冒泡成未捕获异常**，
    //   导致 `Chat.vue` 整页挂载失败：页面上只剩底部 TabBar + 一句智能体名，
    //   对话区/顶栏/输入框全部不渲染 —— 这就是用户报的「UI 还错乱了」。
    if (platformStore.modelsLoaded) {
      const def = chatModels.value.find((m) => m.isDefault);
      const settingsModel = chatModels.value.find((m) => m.id === settingsStore.settings.defaultModelId);
      const first = def || settingsModel || chatModels.value[0];
      if (first) { selectedModelId.value = first.id; modelPickedAfterReady = true; }
      return;
    }

    // ★★ `{ immediate: true }` 的回调是**同步执行**的，而它需要能"自我注销"。
    //   任何在 watch() **返回之后**才赋值的变量（`const stop = watch(...)` 或
    //   `const unwatch = watch(...)`）在回调里都是 TDZ → 一访问就抛
    //   `ReferenceError: Cannot access 'stop' before initialization`。
    //   正解：用一个**在外层作用域声明的可变槽位** unwatch，回调里只读它、
    //   且读之前判真（首次同步执行时它还是 undefined，属于合法值，不会抛）。
    let unwatch: (() => void) | null = null;
    /** 统一的停止入口：拿到 watch 句柄后调用才真的注销。 */
    const stopWatch = () => { if (unwatch) { unwatch(); unwatch = null; } };

    unwatch = watch(
      () => [platformStore.modelsLoaded, platformStore.platformsLoaded],
      async () => {
        if (modelPickedAfterReady) return;
        if (!platformStore.modelsLoaded) return;
        // 已有选择（用户手动选/会话带出）就不再干预
        if (selectedModelId.value) { modelPickedAfterReady = true; stopWatch(); return; }
        const def = chatModels.value.find((m) => m.isDefault);
        const settingsModel = chatModels.value.find((m) => m.id === settingsStore.settings.defaultModelId);
        const first = def || settingsModel || chatModels.value[0];
        if (first) {
          selectedModelId.value = first.id;
          modelPickedAfterReady = true;
          stopWatch();
        }
      },
      { immediate: true },
    );

    // 兜底：30s 后无论如何停掉这个监听，避免长期挂着
    setTimeout(() => { if (!modelPickedAfterReady) stopWatch(); }, 30000);
  }

  onMounted(async () => {
    // ★★★ 首屏数据初始化的第一道门：先等后端就绪。
    //
    // 真机顺序是「WebView 先加载前端 → 内嵌 Node 后端后启动」，若不等就发请求，
    // 会出现**极不对称的半初始化**（2026-09-22 实测）：
    //   · loadAgents()（排第一，无重试）→ 网络错误 → agents 静默变成 []，**永久为空**；
    //   · loadPlatforms()（有 getWithRetry，重试 ~10.5s）→ 重试期间后端起来了 → 成功；
    //   · loadSkills()（排更后）→ 那时后端已就绪 → 成功。
    // 结果就是用户看到的「数据初始化不行，要点进模型平台/智能体平台才有数据」。
    //
    // `waitForBackend` 有幂等记忆：授权校验（路由守卫）里已经等过一次，
    // 这里立即返回、零开销；只有在"授权校验超时放行"等边角情况下才真正等待。
    await waitForBackend();

    // ★★★ 授权码是**所有业务请求的前置**（2026-10-12 修复）。
    //
    // keyring 里的授权码是异步 IPC 读取，冷启动存在「后端已就绪但码还没读出来」的窗口。
    // 此时若直接发业务请求：后端门禁返 403，而 `getWithRetry` 对 4xx **不重试**
    // （4xx 是确定性错误）→ agents / conversations / spaces 静默变成 []，
    // 用户看到的就是「历史记录全没了，重启才好」。
    //
    // 路由守卫里虽然 `await licenseStore.init()`，但在「waitForBackend 超时放行」
    // 这条边角路径上 init 可能没跑完；这里再兜一次（init 幂等，已初始化则立即返回）。
    await useLicenseStore().init();

    await agentStore.loadAgents();
    // 场景（模式）配置：拉后端 scene_config（含用户/应用自建模式）；失败保留 scenes.ts 内置兜底
    await sceneConfigStore.loadScenes();
    // 任务类型配置：拉后端 task_type（含用户/应用/大模型自建类型）；失败保留 shared 内置兜底
    await taskTypeStore.loadTaskTypes();
    await store.loadConversations();
    await platformStore.loadPlatforms();
    await platformStore.loadModels();
    // 自愈：持久化的默认平台/模型若已失效（被删/库重置/账号切换），回退到第一个可用平台/模型，
    // 避免 stale defaultPlatformId 触发 404 且导致聊天无法发送（消息发出去不显示）
    await healStalePlatform();
    // ★ 数据没就绪时 mounted 阶段选不出模型（chatModels 为空）→ 先不选，
    //   挂一个「就绪后补选」的等待，避免用户看到空输入框却不知道在等什么。
    ensureModelWhenReady();
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

    // ★ 仅应用首次启动时自动恢复最近会话。
    //   useChat 的 onMounted 会随 ChatMessageList 每次挂载重跑（切模式=重新挂载），
    //   若无条件 selectConv(conversations[0]) 会把「按模式记忆的会话/草稿」覆盖成全局最新会话
    //   —— 这就是「办公/代码互切后对话不切换」的元凶之一。
    if (!chatBootInitDone) {
      chatBootInitDone = true;
      const lastConv = store.conversations[0];
      if (lastConv && !store.currentConvId) {
        await selectConv(lastConv.id);
      }
    }

    if (store.currentConvId) {
      const exists = store.conversations.some((c) => c.id === store.currentConvId);
      if (exists) {
        await loadHistory(store.currentConvId);
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
    document.addEventListener('keydown', handleGlobalKeydown);

    nextTick(() => {
      if (messagesRef.value) messagesRef.value.addEventListener('scroll', handleScroll);
    });
    loadWorkspaceFiles();
  });

  onUnmounted(() => {
    document.removeEventListener('click', closeCtxMenu);
    document.removeEventListener('keydown', handleGlobalKeydown);
    if (messagesRef.value) messagesRef.value.removeEventListener('scroll', handleScroll);
  });

  watch(() => store.currentMessages.length, () => nextTick(() => {
    if (messagesRef.value) {
      // 只在用户本来就贴着底部时跟随；向上翻历史/看工具结果时不抢滚动条。
      // （此前无条件 scrollTop = scrollHeight，任务运行中会把正在读的内容一直顶走）
      if (!showScrollBottom.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
      handleScroll();
    }
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
    // ★ 新任务开始：清空所有历史轮的展开标记（修复「发送前结束的都会展开」）。
    //   时序关键：streaming 在 callLlm 开头（POST 之前）就变 true，此刻新用户消息尚未
    //   经 SSE 回流，messageRounds 里只有历史轮 —— 旧代码展开 round-(length-1) 恰好
    //   误标了历史轮，任务结束后当前轮靠 streaming 失效折叠，历史轮却永远展开。
    //   当前轮执行中的展开由模板里的 isLastRoundStreaming(round, ri) 实时负责，
    //   不需要也不能在这里写 expandedAgentProcess。
    if (isStreaming) {
      // 清空为「未表态」而非 false：false 表示用户手动收起，会让新任务默认也折叠。
      // 未表态时由模板的 isLastRoundStreaming 决定——运行中展开，结束后收起。
      for (const k of Object.keys(expandedAgentProcess)) delete expandedAgentProcess[k];
    }
  });

  /** 打开历史会话时还原其绑定的智能体（会话未绑定则保持当前选择） */
  function applyConvAgent(conv?: Conversation) {
    const bindId = conv?.agentId;
    if (!bindId) return;
    if (!agentStore.agents.some((a) => a.id === bindId)) return;
    // 历史会话可能绑定的是 workflow 型智能体（旧版选择器未过滤时选上的，如「龙珠里面打斗名场面」那条）。
    // 那种绑定已由后端硬拦截兜住并给出指引，这里不该把选择器也拉回它 ——
    // 否则用户打开会话就看到一个不可对话的智能体被选中，点发送只会反复吃拦截提示。
    // 保持当前选择，让用户自行切到可对话的智能体（如「AI 短剧导演」）。
    const bound = agentStore.agents.find((a) => a.id === bindId);
    if (!isChatSelectableAgent(bound)) return;
    if (agentStore.selectedId !== bindId) agentStore.selectAgent(bindId);
  }

  /** 会话未指定模型时，回落到当前智能体绑定的模型 */
  function applyAgentModel() {
    const agent = agentStore.selectedAgent;
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    }
  }

  /** syncConv=false：只切选中智能体+模型，不回写当前会话（模式切换恢复用——
   *  此刻 currentConvId 还是旧模式的会话，回写会把新模式智能体绑到旧会话上，
   *  造成「助手随模式切换串会话」）。 */
  function onAgentSwitch(id: string, syncConv = true) {
    agentStore.selectAgent(id);
    const agent = agentStore.agents.find((a) => a.id === id);
    if (agent?.modelId && chatModels.value.find((m) => m.id === agent.modelId)) {
      selectedModelId.value = agent.modelId;
    }
    // 同步更新当前会话的 agent_id，确保后端 list_sub_agents/call_agent 能查到正确的子智能体
    if (syncConv && store.currentConvId) {
      void store.updateConversation(store.currentConvId, { agentId: id });
    }
  }

  function onModelChange(modelId: string) {
    const model = platformStore.models.find((m) => m.id === modelId);
    if (model && agentStore.selectedAgent) {
      agentStore.updateAgent(agentStore.selectedId, { modelId: model.modelId, platformId: model.platformId });
      selectedModelId.value = model.id;
      // ★ 持久化到当前会话（2026-10-11 修「切模型刷新后回退到第一个模型」）：
      //   此前只改了智能体绑定 + 本地 ref，没写回 conversation.model_id ——
      //   刷新/重挂载时恢复链路（onMounted/watch currentConvId）以 conv.modelId 为准，
      //   旧值把新选择盖掉 → 永远回到第一个模型。会话未创建（草稿态）时跳过，
      //   发送时建会话会带上当前 selectedModelId。
      if (store.currentConvId) {
        void store.updateConversation(store.currentConvId, { modelId: model.modelId, platformId: model.platformId });
      }
    }
  }

  /**
   * 任务类型 → 专属智能体（用户拍板 A 方案：类型 → 智能体 → skill 挂在智能体上）。
   *
   * ★ 为什么在切类型时切智能体：通用助手的提示词压不住各类型的专属纪律
   *   （改写最怕跑飞不逐章、脚本文案最怕写成散文、配音最怕音色没定就批量）。
   *   选定类型即把「人格 + 技能 + 工具面」一次性对齐。
   *
   * ★ 能力不足时**如实提示**，不静默跳过：agentId 指向的智能体在当前库里找不到
   *   （老库未 seed、或该 id 被删）时，用户会看到"切了类型但智能体没变"且毫无提示 ——
   *   这正是最该报出来的一类静默失效。
   *
   * ★★★ 必须同时对齐**技能挂载**与**场景标记**（2026-09-27 修真实 bug）。
   *   本函数原版只调 onAgentSwitch，而它只改「选中智能体 + 模型」，**不碰 mountedSkillIds**。
   *   于是：在有声小说目录里新建任务 → 智能体切成了「有声小说助手」，但 + 菜单 /
   *   上下文栏里显示的仍是**上一个任务残留的挂载**（用代码开发时就是那 6 个代码 skill）
   *   —— 用户看到的现象正是「有声小说目录下新增任务，还挂着代码的 skill」。
   *
   *   同理要清场景：`sceneMode` 是 localStorage 全局单键，在开发模式激活过「代码开发」
   *   场景后切过来，发消息时会把代码场景提示词一起注进有声小说任务（见 resetSceneForTaskMode）。
   */
  function applyTaskTypeAgent(taskType: string | null | undefined): boolean {
    const spec = getTaskType(taskType);
    const target = spec.agentId;
    if (!target) return false; // 通用类型：不改智能体（用用户当前选的）
    // 任务模式接管 → 先摘掉上一个模式的场景标记（只清标记，改智能体的事交给下面统一做）
    resetSceneForTaskMode();
    // ★ 挂载只在**草稿态**重算：已有会话的挂载是用户在该会话里勾过的，
    //   切空间不该顺手改它（与 setScene/clearScene 同一判据）。
    if (agentStore.selectedId === target) {
      if (!store.currentConvId) syncMountsToAgent(target);
      return true;
    }
    if (!agentStore.agents.some((a) => a.id === target)) {
      ElMessage.warning(`任务模式「${spec.label}」的专属智能体未安装（${target}），已沿用当前智能体`);
      return false;
    }
    onAgentSwitch(target);
    if (!store.currentConvId) syncMountsToAgent(target);
    return true;
  }

  /**
   * 把草稿态的技能挂载对齐到指定智能体自带的 skill_ids。
   *
   * ★ 为什么要有这个函数：`onAgentSwitch` 只改「选中智能体 + 模型」，**不动 mountedSkillIds**
   *   （`mountedSkillIds` 的权威来源是会话行 `skill_ids_json`，切会话时由 selectConv 回填）。
   *   草稿态没有会话行可回填，只能显式对齐，否则沿用上一个任务的残留挂载。
   * ★ 只保留真实存在的 skill id（`skillStore` 未加载完时不要清空成空数组）。
   */
  function syncMountsToAgent(agentId: string) {
    const agent = agentStore.agents.find((a) => a.id === agentId);
    const ids = agent?.skillIds || [];
    // skillStore 还没拉到数据时不做过滤：此时"过滤"会把全部 id 判为不存在 →
    // 挂载被清空成 []（表现为"切了类型技能全没了"），比多挂几个不存在的 id 糟得多。
    if (!skillStore.skills.length) {
      mountedSkillIds.value = [...ids];
      return;
    }
    mountedSkillIds.value = ids.filter((id) => skillStore.skills.some((s) => s.id === id));
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
        // ★ 同 onModelChange：写回当前会话，防刷新后恢复链路用旧 conv.modelId 盖掉
        if (store.currentConvId) {
          void store.updateConversation(store.currentConvId, { modelId: model.modelId, platformId: model.platformId });
        }
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

  /**
   * 任务域状态归零 —— 「新建任务」与「切换会话」共用的清理面。
   *
   * ★★★ 为什么必须集中成一份（2026-09-26 用户报「新建任务后文件管理里还是上个任务的文件」）：
   *   新建任务此前只把 store.currentConvId 置空，但**文件管理弹窗的数据源是 fileStore**，
   *   它不随 currentConvId 自动刷新（只有 selectConv 会调 loadConversationFiles）——
   *   于是旧会话的文件一直挂在面板上。顺这条线排查发现「会话域状态没归零」还有十余处
   *   （附件 chip / 右侧预览 tab / 快照弹窗 / MCP 挂载 / 权限模式 / 批量态 …），
   *   全部收敛到这里，避免下次再漏一个。
   *
   * ★ 刻意**不**归零的：跨会话共享且与会话无关的东西 ——
   *   selectedModelId（模型是全局偏好）、mountedSkillIds（草稿态要继承挂载）、
   *   场景 / 工作目录 / 侧栏折叠态 / 预览面板宽度。
   *   ★ 预览 tab 里的 **browser 也保留**（keepBrowser，2026-10-15）：浏览器是应用级
   *     资源（三级归属模型：浏览器=整个应用一份；Git/文件=工作空间级；控制台=会话级）。
   *     任务级清掉它 ⇒ BrowserPanel 卸载 ⇒ 主进程销毁 BrowserView ⇒ 正在跑的
   *     pageAgent 直接断（用户实报「切工作空间后预览浏览器没了，任务执行不了」）。
   *     currentBrowserUrl 仍归零——它只是「agent 导航信号通道」，不是浏览器内容：
   *     不清则 agent 下次导航到同一 URL 时 watch 值不变、导航静默丢失。
   */
  function resetTaskScopedState() {
    // —— 文件域（本次报障的根因）——
    fileStore.clear();                       // 会话文件列表 + fileStore.currentConvId
    fileSearch.value = '';
    // —— 右侧预览域：预览 tab / 面板开合归零；浏览器 tab 保留（应用级资源）——
    store.closeAllPreviewTabs({ keepBrowser: true });
    store.rightPanelOpen = false;
    store.showFilePopup = false;
    store.currentBrowserUrl = '';
    // —— 会话级挂载与权限：切会话时由 store.loadMessages 回填；新建任务须显式归零 ——
    store.mountedMcpServers = [];
    store.mcpDisabledTools = {};
    store.mcpToolAliases = {};
    // 权限模式：新任务默认安全「只读」（2026-09-27 拍板）。
    // 例外——**全自动任务模式**（小说推文：选书/取文/出片/上传/发布/回填全链路）
    // 默认「完全权限 all」（2026-10-07 用户要求：直接全权限不询问，避免反复弹窗打断自动化）。
    // all = 全部工具放行 + 路径守卫不弹窗（前端同时下发 pathGuard=off）。
    // 其它智能体维持只读（安全默认不变）。
    const AUTOPILOT_AGENT_IDS = ['a_builtin_novel_tuiwen_agent'];
    const isAutopilot = AUTOPILOT_AGENT_IDS.includes(agentStore.selectedId);
    store.permissionMode = isAutopilot ? 'all' : 'readonly';
    // 全自动智能体同时关闭路径守卫（否则越界仍会弹授权窗，与"不询问"矛盾）
    if (isAutopilot) {
      try { settingsStore.settings.pathGuard = 'off'; } catch { /* store 未就绪则跳过 */ }
    }
    // —— 弹层 / 搜索 / 导航等瞬时 UI ——
    snapshotDialog.value = false;
    snapshotActiveTab.value = '';
    currentSnapshots.value = [];
    search.value = '';
    activeNavRound.value = null;
    drawerOpen.value = false;
    contextSidebarOpen.value = false;
    batchMode.value = false;
    selectedConvIds.value = new Set();
    renamingId.value = '';
    closeCtxMenu();
    // —— 浏览器实况态：browserSteps 是全局单例，跨会话必须残留清零（否则新任务继承放大/锁定）——
    store.browserSteps.length = 0;
    // ★ 步骤序号一并归零（2026-10-12）：`browserStepSeq` 单调递增，不清则新会话第一个步骤时
    //   `o !== 0` ⇒ "首个步骤自动开预览面板 / 锁输入"两个 watch 都不触发（新任务面板不弹）。
    //   `browserSteps` 能靠 `length = 0` 归零，序号没有等价手段 ⇒ 必须显式复位（store 提供 reset）。
    store.resetBrowserStepSeq();
    store.browserExpanded = false;
    store.browserLockInput = false;
    store.browserUserDismissed = false;
    store.clearBrowserTaskActive(); // 浏览器任务记账：新任务从头算（见 stores/chat.ts 注释）
    // ★ 2026-10-23：手动开标记每轮任务重置。上一轮留下的手动标记会让本轮收尾跳过清理，
    //   编号框就跨任务糊在页面上（用户实报「任务停了中间层还在」）。本轮内用户再点开仍照常生效。
    store.browserHighlightManual = false;
    store.clearAgentOpenedTabs();   // agent 开过的 tab 记账同理（新任务的"待收拾"从零开始）
    store.pausedConvIds.clear();
    store.clearAgentCursor();
    // —— 按「消息 id」分桶的展开态：旧 id 在新会话里永远不会命中，
    //    留着只会无界增长（长会话切换多轮后内存里堆一堆死键）——
    for (const bag of [
      expandedReasoning, expandedTools, expandedToolGroups, collapsedToolGroups, collapsedMessages,
      expandedAgentProcess, expandedStepTools, collapsedSubAgentResults, collapsedMainResults,
    ]) for (const k of Object.keys(bag)) delete bag[k];
    collapsedByAuto.clear(); // 自动折叠记账（否则会把旧会话的 id 当成"我折的"）
  }

  /** 选线框确认：带着子线重新走一遍 startNewChat（这次不会再看父目录分支） */
  async function confirmTaskLine(childId: string) {
    const p = taskLinePicker.value;
    taskLinePicker.value = null;
    if (!p) return;
    await startNewChat(p.spaceId, childId);
  }

  /** 选线框取消：不建会话（父目录下不选线就没有 SOP，建了也是空跑） */
  function cancelTaskLine() {
    taskLinePicker.value = null;
    // 取消选线 = 这次「新任务继续」没发生，别把待填文案漏给下一个新建任务
    pendingContinuePrefill.value = null;
  }

  /**
   * 「新任务继续」（轻量版）：按源任务的属性开一个新任务。
   *
   * ★ 属性怎么继承：空间 + 子线走 startNewChat 的原生入参（写进会话行、永久生效），
   *   智能体沿用任务线的专属智能体（applyTaskTypeAgent），模型随后按源会话覆盖。
   * ★ 一次性上下文只有首条消息的**进度快照**（formatContinueTaskPrefill）：
   *   不复制 taskPlan 对象 —— 新任务要自己重新规划，顶着旧进度卡会假装"已完成"。
   * ★ 不复制源任务的 systemPrompt / 历史消息：任务线提示词由后端按空间+子线现算，
   *   历史消息留在源任务里（用户要看随时点回去）。
   * ★ 与费用提醒条的 startContinuedConversation 区别：那个是"上下文写满后接力"，
   *   建会话即落库、只带智能体/模型/空间；这里是"同一条线开下一个任务"，带子线 + 进度快照，
   *   且停在草稿态让用户先改再发。
   */
  async function continueTaskAsNew(conv: Conversation) {
    pendingContinuePrefill.value = formatContinueTaskPrefill({
      title: conv.title,
      taskType: conv.taskType,
      taskPlan: conv.taskPlan,
    });
    try {
      // 空间 + 子线：源任务有子线就不再弹选线框；没有子线时 startNewChat 会按目录规则弹
      await startNewChat(conv.spaceId ?? null, conv.taskType || null);
      // ★ 弹了选线框就到此为止：用户可能取消，此刻改全局智能体/模型会漏给下一个无关任务；
      //   确认后走 confirmTaskLine → startNewChat，由所选任务线的智能体接管
      //   （源任务本来就没选线，它的模型对下一条线没有继承意义）。
      if (taskLinePicker.value) return;
      // 智能体：源任务显式挂过（如通用任务手切了智能体）→ 一并带过来；类型专属智能体已由 applyTaskTypeAgent 处理
      if (conv.agentId && conv.agentId !== agentStore.selectedId
        && agentStore.agents.some((a) => a.id === conv.agentId)) {
        onAgentSwitch(conv.agentId, false);
        // 草稿态没有会话行可回填挂载，权威来源是智能体的 skill_ids；
        // 不重算会带着上一条任务线智能体的技能（表现为"智能体换了、工具面还是旧的"）
        syncMountsToAgent(conv.agentId);
      }
      // 模型放在最后：onAgentSwitch / applyTaskTypeAgent 都会按智能体回填模型，
      // 源会话显式选过的模型优先级更高（否则"继续"出来的任务会偷偷换模型）
      if (conv.modelId) {
        const resolved = conv.platformId
          ? platformStore.resolveModel(conv.modelId, conv.platformId)
          : platformStore.resolveModel(conv.modelId);
        if (resolved && CHAT_MODEL_TYPES.includes(resolved.type)) selectedModelId.value = resolved.id;
      }
    } catch {
      // 新建失败时别把摘要留在待填位上，否则会漏给下一次无关的新建
      pendingContinuePrefill.value = null;
      ElMessage.error('新建继续任务失败，请重试');
    }
  }

  /**
   * 给**已有会话**换任务线（多任务目录里"这条任务改成带货来做"）。
   * 落库后由注入侧每次读库生效（不复制到内存，避免两处漂移）。
   */
  async function setConvTaskType(convId: string, taskType: string | null) {
    await store.updateConversation(convId, { taskType });
    const spec = getTaskType(taskType);
    if (spec.agentId) applyTaskTypeAgent(taskType);
  }

  /**
   * 新建任务（会话）。
   *
   * @param spaceId 目标空间；undefined = 当前选中空间，null = 不归类
   * @param taskType 任务级任务类型（「父任务」层）：多任务目录里本条任务选的子线。
   *   ★ 父目录（空间绑了父类型）下不传 = 先弹选线框；传了才建会话。
   *     不弹的后果：模型收到父类型的"选线"引导，但会话行上没有子线，
   *     每条任务都被当成"还没选线"，用户每次都要在对话里重选。
   */
  async function startNewChat(spaceId?: string | null, taskType?: string | null) {
    // 切走前先存草稿 —— 必须在 currentConvId 被清空之前，否则会存到草稿键上
    saveCurrentDraft();
    // 任务级类型先定值：选线框确认后会带着子线再进本函数，建会话时用它
    pendingTaskType.value = taskType || null;
    store.currentConvId = '';
    isDraftMode.value = true;
    mountedSkillIds.value = [];
    // 任务域状态全部归零（文件列表 / 预览 tab / MCP 挂载 / 权限 / 批量态 …）
    resetTaskScopedState();
    // 恢复草稿态自己的待发内容：在草稿态写过一半、中途去看别的任务再回来，内容还在
    restoreDraft('');
    if (isCodeModeActive()) {
      setScene('code');
      if (spaceId === undefined) spaceId = useCodeStore().projectSpaceId;
    } else if (activeMode.value === 'wf') {
      // 工作流模式的新会话要带上工作流场景人格（参数补全 / 节点排障视角），
      // 否则场景定义了却从不激活 —— 与开发模式挂 code 场景同一套机制。
      setScene('wf');
    } else if (activeMode.value === 'shop') {
      // 店铺运营模式的新会话自动挂「店铺运营」场景（选品/经营人格 + 选品技能关键词匹配），
      // 与开发模式挂 code、工作流挂 wf 同一套机制。缺了它则场景定义了却从不激活。
      setScene('shop');
    }
    // ★★★ 目标目录绑了任务模式 → 新任务必须按该模式对齐「智能体 + 技能挂载 + 场景」。
    //
    // 修的是用户报的真实 bug：「有声小说目录下新增任务，还挂着代码的 skill」。
    // 三条独立缺陷叠在一起（详见 applyTaskTypeAgent / resetSceneForTaskMode 的注释）：
    //   ① 本函数此前**从不调 applyTaskTypeAgent**（只有点空间"头部"的
    //      selectSpaceAndSyncDir 才调）→ 在空间里点「+」新建任务时智能体不切换；
    //   ② 即便切了智能体，mountedSkillIds 也不会跟着变 → + 菜单里还是上个任务的挂载；
    //   ③ 场景标记跨模式残留 → 代码开发的场景提示词会被注进有声小说任务。
    //
    // ★ 无参调用（侧栏/工作台「+ 新建任务」）时回落到**当前选中的空间** ——
    //   这正是用户点「新增任务」的路径，不回落就等于这条路径永远拿不到任务模式。
    // ★ 只在办公模式生效：dev/wf 模式各有自己的智能体契约（App.vue 切模式时把 dev 固定到
    //   代码编写助手、wf 固定到工作流助手），任务模式在那里接管会顶掉模式本身的人格。
    if (activeMode.value === 'office') {
      const targetSpaceId = spaceId === undefined ? spaceStore.currentSpaceId : spaceId;
      const targetSpace = targetSpaceId
        ? spaceStore.spaces.find((s) => s.id === targetSpaceId)
        : undefined;
      // ★ 父任务目录：先让用户选本条任务走哪条子线（不选就不建会话）。
      //   父类型下空间本身也会切到父类型的智能体（agentId 相同），子线只影响 SOP 注入。
      //   ★ 父/子判定读 store（库行），否则用户在库里建的父子关系不生效。
      //   ★ 子目录（子空间）还没选子线时：上溯父目录拿「可选项」，但任务仍落在子目录 ——
      //     选线框的 spaceId 必须是 targetSpace（不是父），否则任务会被塞进父目录。
      let lineSpace = targetSpace;
      if (lineSpace && !lineSpace.taskType && (lineSpace as any).parentId) {
        lineSpace = spaceStore.spaces.find((s) => s.id === (lineSpace as any).parentId);
      }
      if (lineSpace?.taskType && taskTypeStore.isParent(lineSpace.taskType) && !taskType) {
        const children = taskTypeStore.childrenOf(lineSpace.taskType);
        if (children.length > 0) {
          taskLinePicker.value = {
            spaceId: (targetSpace as any).id,
            spaceName: (targetSpace as any).name || '',
            children,
          };
          return;
        }
      }
      if (targetSpace?.taskType) applyTaskTypeAgent(taskType || targetSpace.taskType);
    }
    // ★ 无参调用（侧栏/工作台「+ 新建任务」）时空间回落到**当前选中空间** —— 新会话也会建在
    //   它下面，所以工作目录必须一起对齐；此前只在显式传了 spaceId 时同步，无参路径留着上一个
    //   目录，工具按旧目录解析相对路径（2026-10-23 实报「第二本的任务按第一本干活」）。
    const dirSpaceId = spaceId !== undefined
      ? spaceId
      : (activeMode.value === 'office' ? spaceStore.currentSpaceId : undefined);
    if (dirSpaceId !== undefined) {
      spaceStore.selectSpace(dirSpaceId);
      // 只有真正绑到空间才改目录；office 无选中空间时不动用户的全局设置
      if (dirSpaceId) await syncWorkspaceDirToSpace(dirSpaceId);
      else if (spaceId === null) await syncWorkspaceDirToSpace(null);
    }
    // 「新任务继续」的预填：必须放在 restoreDraft('') 之后，否则会被草稿态归零吃掉。
    // ★ 只填输入框、不自动发送 —— 预填的是进度快照，用户也要能先改再发。
    // ★ 草稿里已有未发文字时**不顶掉**（用户可能正写到一半就点了「新任务继续」）：
    //   摘要放前面，原文接在后面，两边都不丢。
    if (pendingContinuePrefill.value) {
      const prefill = pendingContinuePrefill.value;
      pendingContinuePrefill.value = null;
      input.value = input.value.trim() ? `${prefill}\n\n${input.value}` : prefill;
    }
  }

  /** 草稿态归零：输入内容 + 待发送的附件/引用 + 文件引用勾选。
   *  ★ 新建任务与切换会话都要清 —— 这些是「准备发给某一个任务」的临时内容，
   *    跟着会话走；不清就会把上一条任务的输入/附件带到下一条（串台）。 */
  function resetDraftState() {
    input.value = '';
    uploadedFiles.value = [];
    selectedFilePaths.value = new Set();
    quotedUrls.value = [];
  }

  /* ===== 输入草稿池（2026-10-22 用户诉求：切任务后输入框里的文字/图片不该丢）=====
   * 每个会话各存一份「文字 + 粘贴的图片 + @ 引用勾选 + 链接引用」：
   * 切走时落一份、切回时原样填回，发送成功后清掉
   * （不清的话切回会把已经发出去的内容又填回输入框）。
   * ★ 只放内存：图片是 base64 dataUrl，直接落 localStorage 会撑爆配额；
   *   与用户确认过的口径一致 —— 「本次运行内保留」。
   * ★ 草稿态（还没建会话）用 '__draft__' 作键，与发送互斥锁同一口径。 */
  interface DraftSnapshot {
    input: string;
    uploadedFiles: Array<{ name: string; size: number; type: string; dataUrl: string }>;
    selectedFilePaths: Set<string>;
    quotedUrls: Array<{ url: string; name: string }>;
  }
  const DRAFT_KEY = '__draft__';
  const draftPool = new Map<string, DraftSnapshot>();

  function draftKeyOf(convId: string): string {
    return convId || DRAFT_KEY;
  }

  /** 切走前落一份；空草稿直接删键（发送后不会「复活」旧内容） */
  function saveCurrentDraft() {
    const key = draftKeyOf(store.currentConvId);
    const snap: DraftSnapshot = {
      input: input.value,
      uploadedFiles: [...uploadedFiles.value],
      selectedFilePaths: new Set(selectedFilePaths.value),
      quotedUrls: [...quotedUrls.value],
    };
    const isEmpty = !snap.input.trim()
      && snap.uploadedFiles.length === 0
      && snap.selectedFilePaths.size === 0
      && snap.quotedUrls.length === 0;
    if (isEmpty) draftPool.delete(key);
    else draftPool.set(key, snap);
  }

  /** 切回时恢复该会话的草稿；没有草稿就归零 */
  function restoreDraft(convId: string) {
    const snap = draftPool.get(draftKeyOf(convId));
    if (!snap) { resetDraftState(); return; }
    input.value = snap.input;
    uploadedFiles.value = [...snap.uploadedFiles];
    selectedFilePaths.value = new Set(snap.selectedFilePaths);
    quotedUrls.value = [...snap.quotedUrls];
  }

  /** 发送出去即清掉，避免切回来把已发送的文字/图片又填回输入框 */
  function dropDraft(convId: string) {
    draftPool.delete(draftKeyOf(convId));
  }

  /** 历史消息加载态：拉取既有会话历史期间为 true，消息区据此在顶部渲染骨架屏。
   *  ★ 新建会话路径（send 里 createConversation 后的 loadMessages）不置位 —— 空会话没有
   *    "历史"可加载，骨架一闪而过反而压掉欢迎卡。 */
  const historyLoading = ref(false);
  /** 历史加载统一入口：finally 兜底，骨架不会因加载异常而卡住 */
  async function loadHistory(convId: string) {
    historyLoading.value = true;
    try {
      await store.loadMessages(convId);
    } finally {
      historyLoading.value = false;
    }
  }

  async function selectConv(id: string) {
    // 切走前把当前输入框（文字 / 粘贴的图片 / @ 引用）存进草稿池，切回来还在
    saveCurrentDraft();
    await loadHistory(id);
    isDraftMode.value = false;
    // 切会话即退出浏览器实况态：锁定/放大只属于发起浏览器任务的那个会话
    store.browserExpanded = false;
    store.browserLockInput = false;
    // ★ 注意：这里**不能**清浏览器任务记账 —— 切回来时若任务仍在跑，锁必须还在
    //   （清了就会出现"切走再切回，agent 还在操作但页面能被点"）。记账的清理时机是
    //   **任务收尾**（onTaskFinished）与**新任务开头**（resetTaskScopedState），不是切会话。
    store.clearAgentCursor();
    // 填入目标会话自己的草稿（没有则归零）—— 各任务的待发内容互不干扰
    restoreDraft(id);
    // 瞬时 UI 也随会话切换收回：搜索词、轮次高亮、会话列表的批量/重命名/抽屉态
    search.value = '';
    activeNavRound.value = null;
    drawerOpen.value = false;
    batchMode.value = false;
    selectedConvIds.value = new Set();
    renamingId.value = '';
    closeCtxMenu();
    const conv = store.conversations.find((c) => c.id === id);
    applyConvAgent(conv);
    // ★ 上下文跟随会话（2026-10-13，与"发消息不改挂空间"配套的另一半）：
    //   点开一个属于空间 A 的会话时，把「选中空间 + 工作目录」对齐到 A ——
    //   否则用户先点了空间 B（workspaceDir 已被切到 B 的目录）再点回 A 会话继续干活，
    //   输入区显示的当前目录还是 B 的，agent 的工具执行面/资源面板也指到 B（错位观感）。
    //   只在会话真实归属某空间时同步；未归类会话不动用户当前的空间选择。
    //   注意：这里**不是**把会话改挂空间（send 侧已根治），只是把"操作上下文"对齐到会话。
    if (conv?.spaceId) {
      const sp = spaceStore.spaces.find((s) => s.id === conv.spaceId);
      if (sp) {
        spaceStore.selectSpace(sp.id);
        if (sp.dirPath) await syncWorkspaceDirToSpace(sp.id);
      }
    }
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
    // ★ 费用账单（2026-10-17）：切会话拉一次库累计 —— 刷新页面后金额不丢（验收 9）。
    //   运行中的增量由 task:cost 事件驱动（chat store switch 转调 cost store）。
    void costStore.loadUsage(id);
    costStore.resetNoticeView(id);
    await nextTick();
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
      handleScroll();
    }
  }

  /**
   * 「新开会话继续」（费用提醒条上的按钮，2026-10-17 方案 §3.6）。
   *
   * ★★ D4 语义：**用户主动，程序绝不代劳** —— 自动发消息 = 直接扣钱，
   *   而那正是提醒想避免的事。所以这里只做两件事：
   *   ① 建一个带原上下文（智能体/平台/模型/空间）的新会话；
   *   ② 把接力指令**预填进输入框**（不发送），用户 review 后自己发。
   *
   * ★ 为什么复用 createConversation 而不是新造"任务快照"：进度早在空间记忆里
   *   （recordTaskProgress / appendTaskProgress 每批都写），接力指令让模型先去读它。
   */
  async function startContinuedConversation() {
    const conv = currentConv.value;
    if (!conv) return;
    try {
      const newId = await store.createConversation(`继续：${conv.title || '任务'}`, {
        agentId: conv.agentId || undefined,
        platformId: conv.platformId || undefined,
        modelId: conv.modelId || undefined,
        spaceId: conv.spaceId || undefined,
      });
      await selectConv(newId);
      // ★ 必须在 selectConv **之后**设值：它会 resetDraftState() 清空输入框
      input.value = `继续任务「${conv.title || '任务'}」。先读取空间记忆中该任务的进度与未完成步骤，从断点继续，不要重复已完成的部分。`;
    } catch {
      ElMessage.error('创建继续会话失败，请重试');
    }
  }

  function triggerFileUpload() {
    fileInputRef.value?.click();
  }
  /** 从拖入或文件选择器加入文件。共享上传/超限/转 dataURL 逻辑。
   *  drag-drop 时 DataTransfer.files 是 FileList，与 input.files 同形；这里宽到数组。 */
  function addFiles(files: FileList | ArrayLike<File>) {
    const maxSize = 10 * 1024 * 1024;
    let added = 0, skipped = 0;
    const arr = Array.from(files as ArrayLike<File>);
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      if (!f || !f.name) { skipped++; continue; }
      if (f.size > maxSize) { ElMessage.warning(`文件「${f.name}」超过 10MB 限制`); skipped++; continue; }
      const reader = new FileReader();
      reader.onload = () => {
        uploadedFiles.value.push({
          name: f.name, size: f.size, type: f.type,
          dataUrl: reader.result as string,
        });
      };
      reader.readAsDataURL(f);
      added++;
    }
    if (added && skipped === 0) ElMessage.success(`已加入 ${added} 个文件`);
    else if (added && skipped) ElMessage.warning(`已加入 ${added} 个，跳过 ${skipped} 个`);
  }
  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;
    addFiles(files);
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
    // ★★★ 任务运行中 → 追加入队（2026-10-11 根因修复）：此判断**必须在重入锁之前**。
    //   原因：下方重入锁覆盖整个 sendInner，而正常路径 sendInner 尾部 `await store.sendMessage`
    //   = callLlm `await subscribeTaskSseWithReconnect`（等整个任务 SSE 流结束）——
    //   任务跑多久锁就挂多久 ⇒ 任务运行中点发送在锁处被**静默 return**，连 sendInner 里的
    //   入队分支都不可达 ⇒ 输入框保留原文（16:11 用户实报「追加功能失效」的直接根因）。
    //   把入队提到锁前：同步判断 + 同步入队 + 清输入框，零 await，完全不受锁影响。
    //   （sendInner 内的旧入队分支已删除：send() 是唯一调用方，锁前已拦，留两份必漂移。）
    {
      const runningConvEarly = store.currentConvId;
      if (runningConvEarly && store.isConvStreaming(runningConvEarly)) {
        if (uploadedFiles.value.length > 0) {
          ElMessage.warning('任务进行中的追加消息暂不支持附件，请等任务结束后再发送带附件的消息');
          return;
        }
        const queueTextEarly = input.value.trim();
        if (!queueTextEarly) return;
        store.enqueueMessage(runningConvEarly, queueTextEarly);
        input.value = '';
        // 已入队发送 → 同步清掉草稿，切走再切回不能把这段又填回输入框
        dropDraft(runningConvEarly);
        return;
      }
    }
    // ★★★ 重入锁（2026-10-09 起为全局锁；2026-10-17 改按会话粒度，见 sendingConvs 声明处注释）：
    //   key 在进入时冻结 —— sendInner 建会话后 currentConvId 会变，但锁仍挂原 key 直到
    //   finally，草稿态（'__draft__'）连发仍互斥。锁命中不再静默（此前零反馈，用户以为回车坏了）。
    const lockKey = store.currentConvId || '__draft__';
    if (sendingConvs.value.has(lockKey)) {
      ElMessage.warning('该会话正在发送中，请稍候');
      return;
    }
    sendingConvs.value.add(lockKey);
    try {
      await sendInner();
    } finally {
      sendingConvs.value.delete(lockKey);
    }
  }

  async function sendInner() {
    if (!input.value.trim() && uploadedFiles.value.length === 0 && quotedUrls.value.length === 0) return;
    // 内容已确定要发出：清掉该会话草稿，避免切走再切回把已发送的内容又填回输入框
    dropDraft(store.currentConvId);

    const hasPlatform = platformStore.platforms.length > 0;
    const hasModel = !!selectedModelId.value && !!platformStore.models.find((m) => m.id === selectedModelId.value);
    if (!hasPlatform || !hasModel) {
      const userContent = input.value.trim();
      if (!userContent && uploadedFiles.value.length === 0 && quotedUrls.value.length === 0) return;
      input.value = '';
      uploadedFiles.value = [];
      quotedUrls.value = [];

      // 每次发送都确保工作目录对应空间存在（幂等：已存在则复用，失败则下次仍可重试）
      let spaceId = await resolveSpaceForNewConv();
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
        const id = await store.createConversation(title, { skillIds: [...mountedSkillIds.value], spaceId, taskType: pendingTaskType.value });
        // 新会话归属该空间 → 工作目录一起对齐（否则工具按上一个目录解析相对路径）
        if (spaceId) await syncWorkspaceDirToSpace(spaceId);
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

    // ===== 任务运行中 → 追加入队（不打断当前任务）=====
    // ★ 该判断已上移到 send() 入口（重入锁之前）—— 此处在锁之后，任务运行中根本到不了
    //   （锁覆盖整个任务 SSE 时长）。历史注释保留在 send() 处：此前是「输入框禁用 + 直接 return」，
    //   表现为「一个会话跑着，别的会话/新建会话就发不出消息」；后改为入队。
    //   （这里不再重复判 —— 同一语义两处各写一份必漂移，项目既有教训。）

    // ★★★ 取走内容即清空输入框（2026-10-09，多会话发消息"消失"修复）：
    //   此前 input.value 要等下面「建空间 → 建会话 → 落附件」多个 await 之后才清空，
    //   期间输入框仍有内容 → 连按 Enter / 双击会把同一句话再发一次；第二次走到
    //   store.sendMessage 时第一次已 runningConvIds.add → 命中静默 return（消息凭空消失）。
    //   提到这里（取内容那一刻）后，重入锁之外再加一道：第二个 send 进来时 input 已空 → 早退。
    const content = input.value;
    input.value = '';
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

    // 全程锁定目标会话：下面有多个 await（建空间/建会话/落盘附件），期间用户若切换会话，
    // 消息与任务仍须归属「点发送那一刻」的会话，否则多会话并行时会串台。
    let convId = store.currentConvId;
    if (convId && !store.conversations.some((c) => c.id === convId)) {
      convId = '';
      store.currentConvId = '';
    }
    try {
      const agent = agentStore.selectedAgent;
      // 每次发送都确保工作目录对应空间存在（幂等：已存在则复用，失败则下次仍可重试）
      let spaceId = await resolveSpaceForNewConv();
      // 代码模式：优先使用当前项目绑定的 spaceId，确保会话归入正确项目
      if (isCodeModeActive()) {
        const codeSid = useCodeStore().projectSpaceId;
        if (codeSid) spaceId = codeSid;
      }
      if (!convId) {
        const title = titleFromContent(userContent.trim()) || '网页引用';
        const id = await store.createConversation(title, {
          platformId: platform.id,
          modelId: model.modelId,
          skillIds: [...mountedSkillIds.value],
          spaceId,
          taskType: pendingTaskType.value,
        });
        convId = id;
        // ★ 新会话归属该空间 → 工作目录一起对齐（2026-10-23 实报）：草稿态下用户先选了
        //   「第二本」空间再发第一条消息，此前只绑 space_id 不同步目录，全局仍是「第一本」，
        //   后端按「前端显式下发 > 空间目录」取值 → 提示词/工具全落在第一本。
        if (spaceId) await syncWorkspaceDirToSpace(spaceId);
        // 会话级 system_prompt：智能体提示词 + 场景提示词（会话级优先级高于 agent 级，需合并写入）
        const scenePrompt = currentScene.value?.prompt || '';
        const sysPrompt = [agent?.systemPrompt, scenePrompt].filter(Boolean).join('\n\n');
        if (sysPrompt) {
          await store.updateConversation(convId, { systemPrompt: sysPrompt });
        }
        await saveMountToDb(convId);
        await store.loadMessages(convId);
        isDraftMode.value = false;
      } else {
        // 已有会话：补齐平台/模型。
        // ★★★ 不再改挂空间（2026-10-13，用户实报"任务在 A 空间跑，点了 B 空间再发消息，
        //   会话和文件目录全变成 B 的"）：
        //   此处原逻辑是 `if (spaceId && currentConv.spaceId !== spaceId) updates.spaceId = spaceId`
        //   —— spaceId 来自 resolveSpaceForNewConv()（= 用户当前选中的空间）。用户中途点过
        //   空间 B（哪怕只是想看看 B 里有什么，selectSpaceAndSyncDir 还会同步改 workspaceDir），
        //   回到 A 会话继续发消息，整个会话就被悄悄迁到 B：任务列表里 A 空间少一个、B 空间多一个，
        //   产物目录也跟着空间走（artifact-root = 会话所属空间 dirPath）→ 文件全落错地方。
        //   ★ 语义对齐：**会话归属创建时的空间，发消息不改变归属**（与 Claude 的项目归属一致）；
        //     跨空间移动是显式操作（右键"移动到空间"/行内 Rank 按钮），不隐性发生。
        //     新会话（上方 !convId 分支）不受影响——它本来就该归当前选中的空间。
        const updates: { platformId?: string; modelId?: string; spaceId?: string } = {};
        if (!currentConv.value?.platformId) {
          updates.platformId = platform.id;
          updates.modelId = model.modelId;
        }
        if (Object.keys(updates).length) {
          await store.updateConversation(convId, updates);
        }
      }

      // F3 输入过长：全文自动落盘为附件，正文截断为预览（落盘失败则按原文发送，不阻塞对话）
      if (userContent.length > LONG_INPUT_THRESHOLD) {
        try {
          const { getPlatformAdapter } = await import('@yan-zhi/core');
          const adapter = getPlatformAdapter();
          const upsConvId = convId || 'default';
          const filesDir = await resolveArtifactDirFor('upload');
          try { await adapter.fs.mkdir(filesDir); } catch {}
          const total = userContent.length;
          const name = 'paste_' + Date.now() + '.txt';
          const newPath = filesDir + '/' + name;
          await adapter.fs.writeFile(newPath, userContent);
          await useFileStore().registerFile({
            conversationId: upsConvId, name, path: newPath,
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
          const upsConvId = convId || 'default';
          const filesDir = await resolveArtifactDirFor('upload');
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

      // input.value 已在取内容那一刻清空（见上方「取走内容即清空输入框」）——
      // 这里不再重复清，避免"清空时机"这一语义出现两处（本项目既有教训：同一语义两处各写一份必漂移）。

      if (selectedFilePaths.value.size > 0) {
        const fileRefs: Array<Record<string, unknown>> = [];
        for (const filePath of selectedFilePaths.value) {
          const f = workspaceFiles.value.find(wf => wf.path === filePath);
          // 目录引用（@folder，2026-10-03 P1）：目录不在文件索引里 —— 若路径不是任何已索引
          // 文件、但有已索引文件位于其下，即判定为目录。不读内容，注入目录引用说明。
          if (!f) {
            const under = workspaceFiles.value.filter(wf => wf.path.startsWith(filePath + '/') || wf.path.startsWith(filePath + '\\'));
            if (under.length > 0) {
              fileRefs.push({
                fileName: (filePath.split(/[\\/]/).pop() || filePath) + '/',
                path: filePath,
                type: 'folder',
                size: 0,
                preview: `(目录引用：该目录下约 ${under.length} 个已索引文件。请用 file_list / code_search / code_outline / code_semantic_search 自行探索，不要假设目录内容)`,
              });
            }
            continue;
          }
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
        reasoningEffort: resolveReasoningEffort(agent),
      }, convId);

    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Chat] 发送失败:', e);

      const reason = e?.message || '请求失败';
      // 按错误类型区分提示：401（Key 无效）/404（URL 不对）/网络不通才是平台配置问题，
      // 引导用户修正配置；400（请求格式错误，如 tool_calls 配对）/429（频率超限）与配置无关，
      // 不再展示「平台无法访问」提示与 PLATFORM_CONFIG 配置卡片，避免误导用户改配置。
      const statusMatch = /^LLM 请求失败: (\d{3})/.exec(reason);
      const isConfigIssue = statusMatch
        ? ['401', '404'].includes(statusMatch[1])
        : /代理或网络不通/.test(reason);
      // ★ 2026-10-14：403（额度耗尽 / Key 无权限）单列一类「平台配置/额度」问题 —— 此前落到
      //   笼统的「⚠️ 调用失败。」，用户不知道是余额不足还是别的。给出可读提示 + 平台配置卡片（好换平台/模型）。
      const isQuotaIssue = statusMatch?.[1] === '403'
        || /额度|配额|insufficient_user_quota|insufficient_quota|invalid_api_key|余额不足|欠费/.test(reason);
      const needsPlatformCard = isConfigIssue || isQuotaIssue;
      const msgs = store.currentMessages;
      const last = msgs[msgs.length - 1];
      // 服务端任务失败时已把「（调用失败：…）」写入会话（message:updated 先于 task:error 到达），
      // 非配置类错误（400/429 等）不再重复追加前端提示；配置类错误仍追加引导卡片。
      const serverReported = !!(last && last.role === 'assistant' &&
        typeof last.content === 'string' && last.content.startsWith('（调用失败：'));
      if (needsPlatformCard || !serverReported) {
        const tipText = isConfigIssue
          ? '⚠️ 平台无法访问，请在下方修正平台配置。'
          : isQuotaIssue
            ? '⚠️ 平台额度已用尽或 Key 无权限，请更换平台/模型，或在下方修正平台配置。'
            : '⚠️ 调用失败。';
        // 配置/额度类错误走 @@REASON@@ 结构（PlatformConfigCard 单独渲染原因）；其余用纯文本，
        // 避免无卡片时 @@REASON@@ 字面量泄漏到正文。
        const fullContent = needsPlatformCard
          ? `${tipText}\n@@REASON@@\n${reason}${platform ? `\n[[PLATFORM_CONFIG:edit:${platform.id}]]` : '\n[[PLATFORM_CONFIG:create]]'}`
          : `${tipText}\n${reason}`;
        if (last && last.role === 'assistant' && !last.content) {
          await store.updateMessage(last.id, { content: fullContent });
        } else if (convId) {
          await store.addMessage({
            conversationId: convId,
            role: 'assistant',
            content: fullContent,
          });
        }
      }
      await nextTick();
      scrollToBottom();
    }
  }

  function stopChat() {
    store.stop();
  }

  /** 全屏实况收起（用户手动）：本次浏览器任务内不再自动放大 */
  function dismissBrowserExpanded() {
    store.browserExpanded = false;
    store.browserUserDismissed = true;
  }

  // ===== 追加消息队列（任务运行中在输入框上方堆叠，可「立即发送 / 编辑 / 删除」）=====
  const queuedList = computed(() => store.queuedOf(store.currentConvId));

  /** 解析某会话应使用的平台/模型：优先会话自身绑定，回落当前选择，再回落第一个可用对话模型 */
  function resolveConvPlatformModel(convId: string): { platform: Platform; model: Model } | null {
    const conv = store.conversations.find((c) => c.id === convId);
    let model = platformStore.models.find((m) => m.id === selectedModelId.value);
    if (conv?.modelId) {
      const resolved = conv.platformId
        ? platformStore.resolveModel(conv.modelId, conv.platformId)
        : platformStore.resolveModel(conv.modelId);
      if (resolved) model = resolved;
    }
    let platform = platformStore.platforms.find((p) => p.id === model?.platformId);
    if (platform && model && CHAT_MODEL_TYPES.includes(model.type)) return { platform, model };
    // 自愈回退：选第一个可用的对话模型
    const alt = platformStore.models.find((m) => m.enabled && CHAT_MODEL_TYPES.includes(m.type));
    const altPlatform = alt ? platformStore.platforms.find((p) => p.id === alt.platformId) : undefined;
    if (alt && altPlatform) return { platform: altPlatform, model: alt };
    return null;
  }

  /** 逐条发送排队的追加消息（任务收尾后自动触发）。
   *  每轮只取队首一条起新一轮任务，不做合并——多条时等这条任务结束，
   *  收尾回调再次触发本函数取下一条，链式串行排空队列。 */
  // 按会话的在途守卫：同会话已有一次 flush 在发送时，其余触发直接跳过，
  // 消息留在队列里等在途那条任务收尾回调取下一条（emitTaskFinished 双发时防止第二条撞互斥被静默丢弃）。
  // ★ 记时间戳而非布尔：闸门只应在「本会话确有一次追加发送在途」时占着。若本会话已不在
  //   运行、闸门却仍占着（上次在途发送异常收场，如 SSE 卡死令 sendMessage 永不返回），
  //   闸门就成了死锁，会让该会话的追加队列**永久失效**——必须自愈。
  //   宽限期用于避开「闸门已加、callLlm 尚未把 convId 记入 runningConvIds」的启动微任务
  //   窗口，避免误清一个正在启动的合法发送。
  const GATE_GRACE_MS = 3000;
  const flushingConvs = new Map<string, number>();
  async function flushQueuedAfterTask(convId: string) {
    const heldAt = flushingConvs.get(convId);
    if (heldAt !== undefined) {
      // 死锁自愈：本会话没在跑任务、闸门却已占超宽限期 → 判定为上次异常收场，释放
      if (store.isConvStreaming(convId) || Date.now() - heldAt <= GATE_GRACE_MS) return;
      flushingConvs.delete(convId);
    }
    // ★★ 本会话仍在跑任务时**绝不能取消息**：callLlm 有「同会话互斥」守卫，会直接
    //    `return` 什么都不做；而消息此刻已被 takeFirstQueuedMessage 取出队列 →
    //    **用户消息被静默吞掉**（2026-10-04 用户反馈「点『立即发送』没反应、消息不见了」的真因）。
    //   正解是保持消息留在队列里（用户看得见），等本次任务收尾回调再来取。
    if (store.isConvStreaming(convId)) return;
    // 先确认有可用对话模型再取消息，避免取出来发不出去导致消息丢失
    const pm = resolveConvPlatformModel(convId);
    if (!pm) {
      ElMessage.warning('追加消息未发送：未配置可用的对话模型');
      return;
    }
    // 跳过空内容条目，取到第一条非空的为止（链路不能断，否则后续消息卡死在队列里）
    let text = '';
    for (;;) {
      const item = store.takeFirstQueuedMessage(convId);
      if (!item) return;
      const t = item.content.trim();
      if (t) { text = t; break; }
    }
    const agent = agentStore.selectedAgent;
    flushingConvs.set(convId, Date.now());
    try {
      await store.sendMessage(text, pm.platform, pm.model, undefined, {
        temperature: agent?.temperature,
        maxTokens: agent?.maxTokens,
        topP: agent?.topP,
        frequencyPenalty: agent?.frequencyPenalty,
        presencePenalty: agent?.presencePenalty,
        reasoningEffort: resolveReasoningEffort(agent),
      }, convId);
    } catch (e: any) {
      console.error('[Chat] 追加消息发送失败:', e);
      ElMessage.error('追加消息发送失败：' + (e?.message || e));
    } finally {
      flushingConvs.delete(convId);
    }
  }

  /** 「立即发送」：注入运行中的任务，模型下一轮 LLM 调用时带上（不等整个任务结束）。
   *  ★ 幂等：同一条连点多次只注入一次（store 内在途守卫 + 后端 clientMsgId 去重，见 chat.ts）。 */
  async function sendQueuedNow(id: string) {
    const convId = store.currentConvId;
    if (!convId) return;
    // ★ 已结束任务（或注入失败）→ 退回普通发送，起新一轮；点谁发谁（把该条提到队首）。
    const res = await store.injectQueuedMessage(convId, id);
    if (res.ok) {
      if (!res.duplicate) ElMessage.success('已追加，模型下一轮将带上');
      await nextTick();
      scrollToBottom();
      return;
    }
    store.promoteQueuedMessage(convId, id);
    await flushQueuedAfterTask(convId);
    // 仍未发出去（会话仍在运行 / 闸门占着）→ 必须明确告知。
    // 否则点击「立即发送」会毫无反馈，用户以为按钮坏了（2026-10-04 用户反馈）。
    if (store.queuedOf(convId).some((q) => q.id === id)) {
      ElMessage.info('当前任务仍在运行，本条将在它结束后自动发送');
    }
  }

  /** 「编辑」：消息回到输入框，队列里移除该条 */
  function editQueued(id: string) {
    const convId = store.currentConvId;
    if (!convId) return;
    const item = store.queuedOf(convId).find((q) => q.id === id);
    if (!item) return;
    input.value = item.content;
    store.removeQueuedMessage(convId, id);
    void nextTick(() => {
      try { (inputRef.value as any)?.focus?.(); } catch { /* ignore */ }
    });
  }

  /** 「删除」：从追加队列移除 */
  function removeQueued(id: string) {
    const convId = store.currentConvId;
    if (!convId) return;
    store.removeQueuedMessage(convId, id);
  }

  // 任务收尾（完成/中止/失败）→ 自动把该会话排队的追加消息发出去
  store.onTaskFinished((convId) => { void flushQueuedAfterTask(convId); });

  async function regenerateMsg() {
    // 锁定目标会话：regenerate 流程跨越 await，期间用户若切会话，任务会落到错误会话。
    const convId = store.currentConvId;
    if (!convId || store.streaming) return;
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
      }, convId);
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

  /**
   * 解析产物目录（上传 / 中间 / 交付三分类）。
   *
   * 优先向服务端要 —— 服务端用同一套 shared 规则解析，并顺带 mkdir -p，
   * 与媒体落盘、提示词注入保持目录一致；服务端不可用时按 shared 规则本地兜底，
   * 保证上传不中断。
   *
   * 桌面端拿绝对路径（adapter 直写磁盘）；浏览器/移动端的文件系统根就是用户
   * 选定的目录，因此用相对路径。
   */
  async function resolveArtifactDirFor(
    category: 'upload' | 'intermediate' | 'deliverable',
  ): Promise<string> {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    const conv = currentConv.value;
    // 兜底路径也走主规则：优先按会话 id 归档（与服务端落盘一致），无会话上下文才退旧命名
    const rel = buildArtifactRelDir({
      conversationId: store.currentConvId,
      title: conv?.title,
      createdAt: (conv as any)?.createdAt || Date.now(),
      category,
    });
    const ws = (settingsStore.settings.workspaceDir || '').trim();

    if (store.currentConvId) {
      const r = await api.get<{ dir?: string; relDir?: string }>(
        `/conversations/${store.currentConvId}/artifact-dir?category=${category}&ensure=1`,
      );
      if ('data' in r && r.data) {
        const picked = adapter.platform === 'desktop' ? r.data.dir : r.data.relDir;
        if (picked) return picked;
      }
    }

    // 兜底：桌面端挂到工作目录，其余按相对用户根目录
    if (adapter.platform === 'desktop') return joinArtifactPath(ws || 'workspace', rel);
    return ws ? rel : joinArtifactPath('workspace', rel);
  }

  async function handleFilePanelUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;
    try {
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const adapter = getPlatformAdapter();
      const filesDir = await resolveArtifactDirFor('upload');
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
      await ElMessageBox.confirm('确认删除「' + f.name + '」？', '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
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
    // ★ 窗口化渲染：目标轮次可能在窗外（DOM 不存在）—— 先扩窗覆盖它，
    //   等 DOM 挂载后再滚（否则 querySelector 落空静默失效，跳转"点了没反应"）。
    ensureRoundVisible(ri);
    activeNavRound.value = ri;
    nextTick(() => {
      const group = document.querySelector(`[data-round="${ri}"]`) as HTMLElement;
      if (!group) return;
      group.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handleScroll() {
    const el = messagesRef.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    // 长会话内存治理：只有用户在看底部时才允许裁剪头部旧消息；
    // 向上翻历史时置 false，避免把正在读的内容抽走。
    store.setChatAtBottom(atBottom);
    const canScroll = el.scrollHeight > el.clientHeight;
    showScrollBottom.value = canScroll && !atBottom;
    showScrollTop.value = canScroll && el.scrollTop > el.clientHeight;
    updateActiveNavRound(el);
    // ★ 窗口化：滚近顶部时懒扩窗（rAF 节流，每帧最多一次）
    if (!windowAll.value && !windowExpandRaf) {
      windowExpandRaf = requestAnimationFrame(() => { windowExpandRaf = 0; expandWindowOnScroll(); });
    }
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
  function toggleAgentProcess(key: string) {
    const cur = expandedAgentProcess[key];
    if (cur !== undefined) { expandedAgentProcess[key] = !cur; return; }
    // 未表态 → 默认收起，首次点击展开（与 Claude Code / ChatGPT 一致，不默认展示工具细节）
    expandedAgentProcess[key] = true;
  }
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

  /**
   * ★★ 2026-10-11：加 WeakMap 缓存（模板里 6 处调用，每帧重执行；纯计算但含 2 次正则 +
   *   mcpServers 线性 find）。
   *   ⚠️ 正确性关键：结果依赖 `mcpStore.servers`（会变）⇒ 缓存条目必须**带上当时的 servers 引用**，
   *      命中时比对引用一致才返回；不一致则重算。否则 MCP 服务器改名/新增后显示会脏。
   *   ★ WeakMap 以 tc 对象为 key：tc 引用稳定（messageRounds 直接引用 msg.toolCalls 元素），
   *     且只有 `tool_call` 事件会整组替换（低频）⇒ 高频 chunk 路径稳定命中，无内存泄漏。
   */
  const toolDisplayCache = new WeakMap<object, { servers: unknown; value: { server: string; tool: string } }>();
  function resolveToolDisplay(tc: any): { server: string; tool: string } {
    const servers = mcpStore.servers;
    if (tc && typeof tc === 'object') {
      const hit = toolDisplayCache.get(tc);
      if (hit && hit.servers === servers) return hit.value;
    }
    const value = resolveToolDisplayUncached(tc);
    if (tc && typeof tc === 'object') toolDisplayCache.set(tc, { servers, value });
    return value;
  }

  function resolveToolDisplayUncached(tc: any): { server: string; tool: string } {
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

  /** ★★ 2026-10-11：WeakMap 缓存（模板 2 处；纯函数：同一 tc → 同一输出，无外部依赖） */
  const toolArgsCache = new WeakMap<object, string>();
  function resolveToolArgs(tc: any): string {
    if (tc && typeof tc === 'object') {
      const hit = toolArgsCache.get(tc);
      if (hit !== undefined) return hit;
    }
    const args = tc?.function?.arguments ?? tc?.arguments;
    let out: string;
    if (!args) out = '{}';
    else if (typeof args === 'string') {
      try { out = JSON.stringify(JSON.parse(args), null, 2); } catch { out = args; }
    } else out = safeJson(args);
    if (tc && typeof tc === 'object') toolArgsCache.set(tc, out);
    return out;
  }

  /**
   * 7.2 工具调用折叠摘要行的「对象」提示：从参数里挑最关键的一个值展示
   * （文件路径 / 命令 / URL / 查询词…），让摘要行呈现「工具名 · 对象」而不是裸工具名。
   * 纯只读展示，不参与任何业务逻辑；挑不出对象就返回空串（行内不渲染该段）。
   */
  const toolTargetHintCache = new WeakMap<object, string>();
  function toolTargetHint(tc: any): string {
    if (tc && typeof tc === 'object') {
      const hit = toolTargetHintCache.get(tc);
      if (hit !== undefined) return hit;
    }
    const out = toolTargetHintUncached(tc);
    if (tc && typeof tc === 'object') toolTargetHintCache.set(tc, out);
    return out;
  }
  function toolTargetHintUncached(tc: any): string {
    let args: any = tc?.function?.arguments ?? tc?.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { return ''; }
    }
    if (!args || typeof args !== 'object') return '';
    const keys = [
      'path', 'file_path', 'filePath', 'dir', 'directory', 'cwd', 'workspace_dir',
      'command', 'cmd', 'url', 'query', 'q', 'pattern', 'keyword',
      'name', 'title', 'skill', 'workflow', 'agent', 'id',
    ];
    for (const k of keys) {
      const v = (args as any)[k];
      if (typeof v === 'string' && v.trim()) {
        const s = v.trim().replace(/\s+/g, ' ');
        return s.length > 40 ? s.slice(0, 40) + '…' : s;
      }
    }
    return '';
  }

  function safeJson(v: unknown): string {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }

  /**
   * ★★★ 2026-10-11：改为查 `toolResultIndex`（O(1)），不再每次 find + JSON.parse。
   *   语义与原实现**完全一致**（解析逻辑已整体搬进索引 computed）。
   *   模板里 8 处调用、流式期间每帧数百次 → 从 O(n) 降为 O(1)。
   */
  function isToolError(toolCallId: string): boolean {
    return toolResultIndex.value.get(toolCallId)?.isError || false;
  }

  function getToolStatusClass(toolCallId: string): string {
    if (!getToolResult(toolCallId)) return 'tool-status-running';
    return isToolError(toolCallId) ? 'tool-status-error' : 'tool-status-ok';
  }

  /**
   * ★★★ 2026-10-11：改为查 `toolResultIndex`（O(1)）。
   *   ⚠️ 语义差异点（有意为之，需知）：旧实现里 `toolMsg.content` 为空串时返回 null；
   *      索引建表时对 `!raw` 也存 `{content:null}` ⇒ 行为一致。
   *   返回 null 表示"工具还没结果"（模板据此显示 running 态）。
   */
  function getToolResult(toolCallId: string): string | null {
    return toolResultIndex.value.get(toolCallId)?.content ?? null;
  }

  /**
   * ★ 2026-10-20 懒加载：工具是否**已有结果**（role='tool' 消息存在），与「正文是否已加载」
   *   解耦。列表下发时普通工具回执正文被掏空（见 store.stripToolResultContent），
   *   getToolResult 对"已结束但未加载"也会返回 null —— 模板据此区分 running / done。
   */
  function isToolResultDone(toolCallId: string): boolean {
    return toolResultIndex.value.has(toolCallId);
  }
  /** 打开工具卡片时按需拉取结果（幂等，见 store.fetchToolResult） */
  function requestToolResult(toolCallId: string): void {
    const convId = store.currentConvId;
    if (!toolCallId || !convId) return;
    void store.fetchToolResult(convId, toolCallId);
  }
  /**
   * 执行详情按需加载（2026-10-24，用户：「都是概览信息和最终大模型的响应就好了」「展开时再拉」）。
   * 首屏只有显示消息；这些函数只在用户点开某一轮 / 某个 call_agent 卡片时被调用。
   */
  /** 本轮过程规模（概览条文案用：N 步 · M 次工具调用） */
  function roundMetaOf(userMessageId?: string) {
    return store.roundMetaOf(store.currentConvId, userMessageId);
  }
  /** 这一轮的执行详情是否已加载（加载后 hasAgentProcess 才会变真） */
  function roundDetailsLoaded(userMessageId?: string): boolean {
    return store.isRoundDetailsLoaded(store.currentConvId, userMessageId);
  }
  /** 展开某一轮 → 拉中间步骤 + 工具回执（返回 Promise，调用方可等它落地再收 loading） */
  function requestRoundDetails(userMessageId?: string): Promise<void> {
    if (!userMessageId) return Promise.resolve();
    return store.loadRoundDetails(store.currentConvId, userMessageId);
  }
  /** 展开某个 call_agent 卡片 → 拉该子智能体的内部步骤 */
  function requestSubAgentDetails(toolCallId: string): void {
    if (!toolCallId) return;
    void store.loadSubAgentDetails(store.currentConvId, toolCallId);
  }
  /** 展开工具项并触发懒加载（取代 toggleTool 的 header 点击） */
  function openToolItem(key: string, toolCallId: string): void {
    const willOpen = !isToolItemOpen(toolCallId, key);
    expandedTools[key] = !expandedTools[key];
    if (willOpen) requestToolResult(toolCallId);
  }

  /** 保留原实现（仅供测试对照 / 极端回退用；正常路径不再调用） */
  function getToolResultUncached(toolCallId: string): string | null {
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
    // 2026-10-24：再次右击同一会话 = 收起（toggle，与任务列表 / 运维资源树同规则）。
    // 判据 = 菜单已开且目标就是这一条；文档 mousedown 已排除右键，不会被提前关掉。
    if (ctxMenu.visible && ctxMenu.conv?.id === conv.id) { closeCtxMenu(); return; }
    // 互斥：会话 / 空间 / 空白区三份菜单同时只留一个
    closeSpaceMenu();
    closeTreeMenu();
    ctxMenu.visible = true; ctxMenu.x = e.clientX; ctxMenu.y = e.clientY; ctxMenu.conv = conv;
  }
  // ========== 会话树空白区右键菜单（新建任务/新建空间） ==========
  const treeMenu = reactive({ visible: false, x: 0, y: 0 });
  function openTreeMenu(e: MouseEvent) {
    // 会话项与空间节点有各自的右键菜单，命中时不弹空白区菜单。
    // 办公侧栏用 .conv-item / .tree-space，四模式任务段（TaskListSection）用 .tls-item / .tls-group-head。
    if ((e.target as HTMLElement)?.closest('.conv-item, .tree-space .tree-node-head, .tls-item, .tls-group-head')) return;
    // 再右击一次空白区 = 收起
    if (treeMenu.visible) { closeTreeMenu(); return; }
    ctxMenu.visible = false;
    closeSpaceMenu();
    treeMenu.visible = true; treeMenu.x = e.clientX; treeMenu.y = e.clientY;
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
      // ★ 2026-10-16 语义变更：删除 = 移入回收站（可恢复）。
      //   确认文案必须说清去向，否则用户以为"删了"就再也找不到（旧文案只有"删除会话？"）。
      await ElMessageBox.confirm(`把会话"${conv.title}"移入回收站？回收站里可以恢复`, '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
      await store.deleteConversation(conv.id);
      ElMessage.success('已移入回收站');
    } catch {}
  }

  /**
   * 归档 / 取消归档（2026-10-16）。
   * ★ 归档后会话**只读**（对齐 ChatGPT / Anthropic Agent SDK）：可见、可搜、不可发消息。
   *   要继续对话必须先取消归档 —— 所以这里成功后若当前会话正是它，就清掉选中，
   *   让用户回主列表重新选（否则输入框还开着，第一道防线只剩前端禁用）。
   */
  async function archiveConv(conv: Conversation | null, archived = true) {
    if (!conv) return;
    closeCtxMenu();
    try {
      await store.archiveConversation(conv.id, archived);
      if (store.currentConvId === conv.id) store.currentConvId = '';
      ElMessage.success(archived ? '已归档（可随时恢复）' : '已取消归档');
    } catch (e: any) {
      ElMessage.error(e?.message || '操作失败');
    }
  }

  /** 一键归档某空间下的全部会话（侧栏空间右键菜单，2026-10-16） */
  async function archiveAllInSpace(space: { id: string; name?: string } | null) {
    if (!space?.id) return;
    closeSpaceMenu();
    try {
      const n = await store.archiveAllInSpace(space.id);
      ElMessage.success(n > 0 ? `已归档「${space.name || '该空间'}」的 ${n} 个会话` : '该空间没有可归档的会话');
    } catch (e: any) {
      ElMessage.error(e?.message || '归档失败');
    }
  }

  /** 从回收站恢复 */
  async function restoreConv(conv: Conversation | null) {
    if (!conv) return;
    try {
      await store.restoreConversation(conv.id);
      ElMessage.success('已恢复到主列表');
      await loadLifecycleLists();
    } catch (e: any) {
      ElMessage.error(e?.message || '恢复失败');
    }
  }

  /** 回收站内永久删除（真删，不可恢复） */
  async function purgeConv(conv: Conversation | null) {
    if (!conv) return;
    try {
      await ElMessageBox.confirm(`永久删除"${conv.title}"？消息将一并删除且无法恢复`, '永久删除', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
      await store.purgeConversation(conv.id);
      ElMessage.success('已永久删除');
      await loadLifecycleLists();
    } catch {}
  }

  // ═══ 归档 / 回收站列表（2026-10-16）══════════════════════════════════════
  /** 侧栏「已归档」分组与「回收站」的数据：独立数组，**不并入** store.conversations
   *  （并入会让主列表、批量选择、导出全都看到它们 —— 那正是归档要消除的"打扰"）。 */
  const archivedConversations = ref<Conversation[]>([]);
  const trashedConversations = ref<Conversation[]>([]);
  async function loadLifecycleLists() {
    try {
      const [arch, trash] = await Promise.all([
        store.loadConversationsByScope('archived'),
        store.loadConversationsByScope('trashed'),
      ]);
      archivedConversations.value = arch;
      trashedConversations.value = trash;
    } catch { /* 拉取失败保留旧列表，不闪空 */ }
    await store.loadLifecycleCounts();
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
      await ElMessageBox.confirm(`把 ${selectedConvIds.value.size} 个会话移入回收站？回收站里可以恢复`, '提示', { type: 'warning', confirmButtonClass: 'yz-confirm-danger' });
      await store.deleteConversations([...selectedConvIds.value]);
      selectedConvIds.value = new Set();
      batchMode.value = false;
      ElMessage.success('已移入回收站');
    } catch {}
  }

  // ========== 批量模式：通过右键进入（不再有「批量」按钮） ==========
  /** 进入批量模式，并把指定会话加入已选集合 */
  function enterBatchSelect(id: string) {
    batchMode.value = true;
    const next = new Set(selectedConvIds.value);
    next.add(id);
    selectedConvIds.value = next;
  }
  /** 退出批量模式并清空已选 */
  function exitBatchMode() {
    batchMode.value = false;
    selectedConvIds.value = new Set();
  }
  /** 空白区右键「批量管理」：仅切换批量模式开关（开启时不清空已选，便于连续操作） */
  function toggleBatchMode() {
    if (batchMode.value) exitBatchMode();
    else batchMode.value = true;
  }
  /** 批量模式下点击目录节点：切换选中该目录下全部会话（全选/全不选） */
  function toggleSelectAllInSpace(spaceId: string) {
    const list = conversationsBySpace.value[spaceId] || [];
    const allSelected = list.length > 0 && list.every((c) => selectedConvIds.value.has(c.id));
    const next = new Set(selectedConvIds.value);
    if (allSelected) {
      for (const c of list) next.delete(c.id);
    } else {
      for (const c of list) next.add(c.id);
    }
    selectedConvIds.value = next;
  }
  /** 批量模式下点击根节点（任务）：切换选中其下全部会话（全选/全不选） */
  function toggleSelectAllInRoot() {
    const list = rootConversations.value;
    const allSelected = list.length > 0 && list.every((c) => selectedConvIds.value.has(c.id));
    const next = new Set(selectedConvIds.value);
    if (allSelected) {
      for (const c of list) next.delete(c.id);
    } else {
      for (const c of list) next.add(c.id);
    }
    selectedConvIds.value = next;
  }
  /** 给定一组会话，返回整组勾选状态：checked=全选, indeterminate=部分选 */
  function selectState(convs?: { id: string }[]) {
    if (!convs || convs.length === 0) return { checked: false, indeterminate: false };
    let sel = 0;
    for (const c of convs) if (selectedConvIds.value.has(c.id)) sel++;
    return { checked: sel === convs.length, indeterminate: sel > 0 && sel < convs.length };
  }
  /** 目录（空间）节点的整组勾选状态 */
  function spaceSelectState(spaceId: string) {
    return selectState(conversationsBySpace.value[spaceId]);
  }
  /** 根节点（任务）的整组勾选状态 */
  function rootSelectState() {
    return selectState(rootConversations.value);
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
    confirmText, confirmSingle, confirmChecked, confirmShowText, confirmSupplement, confirmSupplementOpen, confirmDialogVisible, confirmCurrentPage, confirmMultiSelect, resetConfirmForm, onConfirmNext, onConfirmPrev, onConfirmSkip, onConfirmDialogClose,
    platformConfigSaving, manualPlatformConfigVisible, platformConfigEditId, platformConfigForm, platformConfigDialogVisible, resetPlatformConfigForm, openPlatformConfig, onPlatformConfigSubmit, onPlatformConfigCancel, onPlatformConfigClose,
    input, inputFocused, inputRef, fileInputRef, uploadedFiles,

    browserActive, currentBrowserLabel, closeRightPanel, toggleRightPanel,
    dismissBrowserExpanded,
    expandedFileCategories, fileSearch, workspaceFiles, selectedFilePaths, filePanelUploadRef, search, messagesRef, showMount, showSkills, skillSearch, filteredSkillStore, toggleSkillMount,
    selectedModelId, expandedReasoning, expandedTools, expandedToolGroups, collapsedToolGroups, collapsedMessages, expandedAgentProcess, expandedStepTools, activeNavRound,
    userRoundIndices, mountedSkillIds, drawerOpen, convCollapsed, sideTab, contextSidebarOpen, toggleContextSidebar, batchMode, selectedConvIds,
    rootConversations, conversationsBySpace, spaceCollapsed, toggleSpaceCollapse, rootCollapsed, toggleRootCollapse,
    // 置顶分组（2026-10-09）：让"被置顶"在长列表里看得出来（issue 缺失项 1）
    pinnedRootConversations, unpinnedRootConversations, pinnedCollapsed, togglePinnedCollapse,
    mountToolSelection, toolAliasMap, mountSearch, collapsedServers, toggleServerCollapse, filteredTools, initMountSelection, isToolMounted, toggleMountTool, isAllToolsMounted, toggleAllTools, setToolAlias,
    showAgentEdit, editingAgent, debugMode,
    showWorkspaceDir, workspaceDir, hasWorkspaceDir, loadWorkspaceDir, onWorkspaceDirSelected, clearWorkspaceDir,
    tryParseSnapshot, formatSnapshot, snapshotDialog, snapshotActiveTab, snapshotLoading, currentSnapshots, openSnapshotDialog,
    isDraftMode, renamingId, renamingTitle, renameInputRef, ctxMenu,
    // 任务级任务类型（「父任务」层）：多任务目录选线 + 给已有会话换线
    taskLinePicker, confirmTaskLine, cancelTaskLine, setConvTaskType,
    taskTypeStore,
    md, renderMarkdown, renderAssistantMarkdown, handleContentClick, handleContentDblClick, handleContentContextMenu,
    openPath, openPathInSystem,
    currentConv, filteredConversations, messageRounds, visibleRounds, ensureRoundVisible, isToolErrorContent,
    chatModels, modelGroups, mountableServers, tokenCount, contextLimit, tokenPercent, loadedConvHasMore, canSend,
    // 标称窗口（模型 API 上限）：UI 需要同时展示"实际可用 / 标称"两个数，
    // 否则用户看到"才用 30%"会以为很空 —— 而 30% 可能已越过有效边界。
    declaredContextWindow,
    openEditAgent, openCreateAgent, onAgentSaved, onAgentDeleted,
    showSpaceEdit, spaceEditForm, spaceMenuTarget, selectSpace, selectSpaceAndSyncDir, createSpaceQuick, createSpaceFromDir, showSpaceDirPicker, openSpaceEdit, openSpaceCreate, saveSpaceEdit, deleteSpaceConfirm, openSpaceMenu, closeSpaceMenu, moveConvToSpace, syncSpaceSubdirsAction,
    taskTypes, pickedTaskType, applyTaskTypeAgent, syncMountsToAgent,
    treeMenu, openTreeMenu, treeMenuNewTask, treeMenuNewSpace, closeTreeMenu,
    enterBatchSelect, exitBatchMode, toggleBatchMode, toggleSelectAllInSpace, toggleSelectAllInRoot,
    spaceSelectState, rootSelectState,
    fileCategories, previewInPopup, showConvFileMenu, reclassifyConvFile,
    onAgentSwitch, onModelChange,
    parseConfigCard, displayAssistantContent, getEditPlatform, getEditReason, onConfigSaved,
    queuedList, sendQueuedNow, editQueued, removeQueued, flushQueuedAfterTask,
    startNewChat, continueTaskAsNew, selectConv, triggerFileUpload, addFiles, handleFileChange, removeFile, formatSize, send, sending, stopChat, regenerateMsg, shouldShowMessage, collectToolCalls,
    // 费用账单（2026-10-17）：会话头金额 / 提醒条 / 「新开会话继续」
    costStore, startContinuedConversation,
    filteredFiles, loadWorkspaceFiles, previewFile, toggleFileSelect, triggerFilePanelUpload, handleFilePanelUpload, deleteFileItem,
    resolveArtifactDirFor,
    openConvDir,
    openTaskWindow,
    scrollToRound, handleScroll, updateActiveNavRound, formatTime, showScrollBottom, showScrollTop, scrollToBottom,
    historyLoading,
    toggleReasoning, toggleTool, toggleToolGroup, toggleMsgCollapse, collapseEarlyOnMobile, toggleAgentProcess, toggleStepTools, isLastRoundStreaming, getStreamingStep,
    isToolItemOpen,
    getStepToolResult, isStepToolError, isStepToolsRunning, isStepToolsError, getStepToolGroupClass, getStepToolStatusClass,
    isToolGroupRunning, isToolGroupError, getToolGroupStatusClass, resolveToolDisplay, resolveToolArgs, toolTargetHint, safeJson, isToolError, getToolStatusClass, getToolResult,
    toolResultIndex, getToolResultUncached,
    isToolResultDone, requestToolResult, openToolItem,
    roundMetaOf, roundDetailsLoaded, requestRoundDetails, requestSubAgentDetails,
    copyMsg, editMsg, quoteMsg, delMsg, openConvMenu, closeCtxMenu, togglePin, startRename, commitRename, deleteConv, toggleConvSelect, batchSelectAll, batchDeleteConvs,
    // 会话生命周期（2026-10-16 归档 + 回收站）
    archiveConv, restoreConv, purgeConv, loadLifecycleLists, archivedConversations, trashedConversations,
    archiveAllInSpace,
    currentConvArchived,
    collapsedSubAgentResults, toggleSubAgentResult, collapsedMainResults, toggleMainResult,
    copySubAgentRoundMd, downloadSubAgentRoundMd, copySubAgentResultMd, downloadSubAgentResultMd,
    copyAssistantMd, downloadAssistantMd,
    quotedUrls, addQuotedUrl, removeQuotedUrl, LONG_INPUT_THRESHOLD,
    sceneMode, currentScene, sceneSkillCount, setScene, clearScene,
    saveMountToDb, saveMount, saveSkills,
  };
}

let instance: ReturnType<typeof createChat> | null = null;

/** 应用级一次性标记：自动恢复最近会话只在首次启动执行（切模式重挂载不覆盖） */
let chatBootInitDone = false;

export function useChat() {
  if (!instance) instance = createChat();
  return instance;
}
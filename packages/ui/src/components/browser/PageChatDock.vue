<!--
  页面内对话面板（P0/P1）——浏览器面板右侧停靠的「页面助手」。

  对标（WorkMateAI 内置浏览器）：右侧停靠对话，轻任务就地做，重任务移交主智能体。
  设计见 docs/浏览器-页面内对话与页面指令-方案-20261016.md §4（对话）与 §5（页面指令）。

  ★ 三个"必须"：
    1) **按 tab 隔离**：状态全部走 `usePageChatStore`（键 = tabId），组件本身不持消息状态 ——
       切 tab 时本组件不重建，靠 tabId 取对应状态，"切 tab 结果串了另一页的回答"从结构上不可能。
    2) **关闭标签页即清除**：由 BrowserPanel 在关 tab 时调 `dropTab(tabId)`（本组件不做，避免两处实现）。
    3) **动手就动这一页**：提示词里写明执行面口径（不要新开页 / 不要传 tabId / 未绑定先用
       browser_navigate 原地建绑定），见 utils/pageContext.ts 的 buildPageTaskPrompt。
-->
<template>
  <div
    class="page-chat-dock"
    data-yz-annotate-id="browser-page-chat"
    data-yz-annotate-label="页面对话"
  >
    <!-- 头部：归属 + 历史/技能 + 指令入口 + 清空/收起 -->
    <div class="pcd-head">
      <span class="pcd-title">💬 页面对话</span>
      <span class="pcd-scope" :title="scopeHint">{{ isOwnConv ? '本页专属会话' : '当前会话' }}</span>
      <!-- 按钮组单独成容器并允许换行：面板只有 340px 宽，按钮多了之后
           "一个 flex:1 的 spacer + 一堆按钮" 会把按钮挤成竖排或直接溢出 -->
      <div class="pcd-head-actions">
        <!-- P3-4 自愈：脚本刚跑失败才出现（只出文本、不自动执行、不改指令库） -->
        <button
          v-if="state.repairHint" class="pcd-icon-btn repair"
          title="让 AI 看报错给出修正版脚本（只出文本，不自动执行）"
          :disabled="state.streaming || convBusy" @click="onRepairScript"
        >🛠 修复脚本</button>
        <button class="pcd-icon-btn" title="历史页面会话（列表 / 打开 / 删除）" @click="historyVisible = true">🕘 历史</button>
        <button
          class="pcd-icon-btn" title="把这次页面对话蒸馏成 Skill（可存进技能商店）"
          :disabled="!distillMessages.length" @click="distillVisible = true"
        >✨ 技能</button>
        <button class="pcd-icon-btn" title="页面指令（管理 / 新建）" @click="$emit('manage')">指令</button>
        <button class="pcd-icon-btn" :disabled="!state.messages.length" title="清空本页对话" @click="onClear">清空</button>
        <button class="pcd-icon-btn" title="收起面板" @click="$emit('close')"><el-icon :size="14"><Close /></el-icon></button>
      </div>
    </div>

    <!-- 消息流 -->
    <div ref="listRef" class="pcd-list" @scroll="onListScroll">
      <div v-if="!state.messages.length" class="pcd-empty">
        <p class="pcd-empty-title">就这个页面聊点什么</p>
        <p class="pcd-empty-sub">问答 / 点击 / 填写这类轻任务在这里就地做；跨页操作、数据分析请走工具栏「移交给主智能体」。</p>
        <template v-if="matchedCmds.length">
          <div class="pcd-chips">
            <button
              v-for="c in matchedCmds" :key="c.pageCommandId" class="pcd-chip" type="button"
              :class="{ 'is-script': c.pageKind === 'script' }"
              :title="chipTitle(c)"
              :disabled="state.streaming || convBusy" @click="runDef(c)"
            >{{ c.pageKind === 'script' ? '⚙ ' : '' }}{{ c.name }}</button>
          </div>
        </template>
        <template v-else>
          <p class="pcd-empty-sub">当前页面暂无匹配指令。</p>
          <button class="pcd-chip" type="button" @click="$emit('manage')">新建指令</button>
        </template>
        <p v-if="cmdsStore.warning" class="pcd-warn">⚠️ {{ cmdsStore.warning }}</p>
      </div>
      <div
        v-for="m in state.messages" :key="m.id"
        class="pcd-msg" :class="[m.role === 'user' ? 'is-user' : 'is-assistant', { 'is-note': m.error }]"
      >
        <!-- 错误/提示泡可折叠（2026-11-15 用户「聊天页面UI真的需要优化」）：
             授权指引/委派失败这类长说明只露首行，点开再看 —— 不再整屏刷错误 */
        -->
        <details v-if="m.error" class="pcd-note">
          <summary>{{ firstLine(m.content) }}</summary>
          <div v-html="renderMarkdown(m.content)"></div>
        </details>
        <div v-else class="pcd-bubble" :class="{ 'is-clamped': isClamped(m) }">
          <div v-html="renderAssistantMarkdown(m.content)"></div>
          <button v-if="isClampable(m)" class="pcd-expand" @click="toggleExpand(m.id)">
            {{ expandedIds.has(m.id) ? '收起' : '展开全文' }}
          </button>
        </div>
        <span v-if="m.streaming" class="pcd-cursor">▍</span>
      </div>
    </div>

    <!-- 工具活动条（2026-11-15 用户「工具调用参考聊天模式」）：与主对话浏览器步骤条同款，
         名称+人话+状态的小字流水，不把工具调用灌进消息流 -->
    <div v-if="state.tools.length" class="pcd-tools">
      <div v-for="(t, i) in state.tools" :key="i" class="pcd-tool">
        <span class="pcd-tool-dot" :class="t.status"></span>
        <span class="pcd-tool-label" :title="t.name">{{ t.label }}</span>
        <span v-if="t.status === 'timeout'" class="pcd-tool-warn">超时未回执</span>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="pcd-input-row">
      <textarea
        v-model="draft"
        class="pcd-input"
        rows="2"
        :disabled="state.streaming"
        :placeholder="inputPlaceholder"
        @keydown.enter.exact.prevent="onSend()"
      ></textarea>
      <!-- 模型切换（2026-11-15）：与办公聊天输入框**同款同位** —— 底部工具条上、发送键旁
           （第一版独立占一行被用户打回「UI还是不对」）。形态 = 胶囊按钮 + 搜索 + 平台分组弹层，
           modelGroups 复用 useChat 那份（同一实现，不另写一套） -->
      <div class="pcd-actions">
        <el-popover
          v-model:visible="modelPopOpen"
          placement="top-start" :width="260" trigger="click" :show-arrow="false"
          popper-class="model-select-popper"
        >
          <template #reference>
            <button type="button" class="model-select-btn" :title="`模型：${currentModelName}`">
              <el-icon :size="13"><Cpu /></el-icon>
              <span class="model-select-name">{{ currentModelName }}</span>
              <el-icon :size="11"><ArrowDown /></el-icon>
            </button>
          </template>
          <div class="pop-select-list pop-select-models">
            <el-input v-model="modelSearch" size="small" placeholder="搜索模型" clearable class="pop-model-search">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <div class="pop-select-item" :class="{ active: !modelOverrideKey }" @click="pickOverride('')">
              <span class="pop-select-name">跟随全局默认模型</span>
            </div>
            <div class="pop-model-scroll">
              <template v-for="g in filteredModelGroups" :key="g.platformId">
                <div class="pop-select-label pop-model-group">
                  <span class="pop-model-platform">{{ g.platformName }}</span>
                  <span class="pop-model-count">{{ g.models.length }}</span>
                </div>
                <div
                  v-for="m in g.models" :key="m.id"
                  class="pop-select-item pop-select-model" :class="{ active: m.id === modelOverrideKey }"
                  @click="pickOverride(m.id, g.platformId)"
                >
                  <span class="pop-select-name">{{ m.alias || m.modelId }}</span>
                  <span class="pop-select-ctx">{{ m.contextWindow ? `${Math.round(m.contextWindow / 1000)}K` : '' }}</span>
                </div>
              </template>
              <div v-if="!filteredModelGroups.length" class="pop-model-empty">没有匹配的模型</div>
            </div>
          </div>
        </el-popover>
        <span class="pcd-hint">Enter 发送 · Shift+Enter 换行</span>
        <button v-if="state.streaming" class="pcd-btn stop" @click="onStop">■ 停止</button>
        <button
          v-else class="pcd-btn send"
          :disabled="!draft.trim() || convBusy" @click="onSend()"
        >发送</button>
      </div>
    </div>

    <!-- P3-5 历史：列表 / 打开（切本 tab 的会话绑定并读回消息）/ 删除（软删进回收站） -->
    <PageChatHistoryDialog
      v-model:visible="historyVisible"
      :tab-id="tabId"
      :current-conv-id="state.conversationId"
      :current-host="hostOf(url || '')"
      @opened="scrollToBottom"
    />

    <!-- 总结成 Skill：复用主对话那套蒸馏弹窗（勾选素材 → 蒸馏 → 改造 → 存进技能商店）。
         ★ 只喂**真正的对话**（distillMessagesOf 丢掉"已停止/漂移告警"这类本地面板提示），
           否则用户存出来的技能里会多出一条莫名其妙的运维步骤。 -->
    <DistillDialog v-model:visible="distillVisible" :messages="distillMessages" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ArrowDown, Close, Cpu, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePageChatStore } from '../../stores/page-chat';
import { usePageCommandsStore } from '../../stores/page-commands';
import { usePlatformStore } from '../../stores/platform';
import { useSettingsStore } from '../../stores/settings';
// 命令中枢（2026-10-16）：chips 的清单经命令总线取（与聊天框的 `/` 菜单同一套口径）
import { useCommandsStore } from '../../stores/commands';
import type { CommandDef } from '@yan-zhi/core';
import {
  buildScriptRepairPrompt, buildScriptSource, digestOf, formatScriptResult, inputPromptsOf, needsConfirm,
  renderCommandBody, usedVarsOf, type PageCommand, type PageCommandVars,
} from '../../utils/pageCommand';
import { collectPageContext, hostOf } from '../../utils/pageContext';
import { distillMessagesOf } from '../../utils/pageChatHistory';
import { useChat } from '../../composables/chat/useChat';
// P3-5：历史弹窗（本目录）+ 总结成 skill（复用主对话那套蒸馏弹窗，不另造一套）
import PageChatHistoryDialog from './PageChatHistoryDialog.vue';
import DistillDialog from '../DistillDialog.vue';

const props = defineProps<{
  /** 当前页所在 tab（状态键） */
  tabId: string;
  /** 当前页地址（空 / 非 http ⇒ 不可对话） */
  url: string;
  /** 当前页标题（指令模板 ${title} 用） */
  title?: string;
  /** 归属空间：'preview'（对话右栏）| 'page'（/browser 独立页） */
  scope: string;
  /** 已存在的会话 id：preview 空间传当前会话；page 空间留空 ⇒ 本 tab 自建会话 */
  convId?: string;
  /** 会话的智能体（preview 空间传当前会话的 agentId；留空走服务端默认） */
  agentId?: string;
  /** 面板当前标签数（P0.1 漂移检测：执行期间多出来的标签页可能是 AI 自己开的） */
  tabCount?: number;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'manage'): void }>();

const pageChat = usePageChatStore();
const cmdsStore = usePageCommandsStore();
const commandsStore = useCommandsStore();
const { renderMarkdown, renderAssistantMarkdown, store: chatStore } = useChat();

// ===== 模型切换（2026-11-15）：与办公聊天输入框**同款形态**（用户拍板不要两套）——
// 胶囊按钮 + 搜索 + 平台分组弹层；modelGroups 直接复用 useChat 那份（同一实现，不再各写一份）。
const platformStore = usePlatformStore();
const settingsStore = useSettingsStore();
const { modelGroups } = useChat();
const modelPopOpen = ref(false);
const modelSearch = ref('');
const filteredModelGroups = computed(() => {
  const kw = modelSearch.value.trim().toLowerCase();
  const groups = modelGroups.value as Array<{ platformId: string; platformName: string; models: any[] }>;
  if (!kw) return groups;
  return groups
    .map((g) => ({ ...g, models: g.models.filter((m) => String(`${m.alias || ''}${m.modelId || ''}`).toLowerCase().includes(kw)) }))
    .filter((g) => g.models.length > 0);
});
const modelOverrideKey = computed(() => {
  const o = pageChat.modelOverride;
  return o ? `${o.platformId}::${o.modelId}` : '';
});
const currentModelName = computed(() => {
  const o = pageChat.modelOverride;
  if (o) return o.alias;
  // 跟随全局：显示全局默认模型的名字（取不到就笼统说"默认"）
  for (const g of modelGroups.value as Array<{ platformId: string; models: any[] }>) {
    const hit = g.models.find((m) => String(m.id) === String((settingsStore.settings as any).defaultModelId));
    if (hit) return String(hit.alias || hit.modelId);
  }
  return '默认';
});
/** 面板覆盖的选中值是「platformId::modelId」，pick 时拆开写回 store */
function pickOverride(modelId: string, platformId?: string): void {
  if (!modelId) { pageChat.setModelOverride(null); modelPopOpen.value = false; return; }
  const g = (modelGroups.value as Array<{ platformId: string; models: any[] }>).find((x) => x.platformId === platformId);
  const m = g?.models.find((x) => String(x.id) === String(modelId));
  if (m && g) pageChat.setModelOverride({ platformId: g.platformId, modelId: String(modelId), alias: String(m.alias || m.modelId) });
  modelPopOpen.value = false;
}
// ★ 游戏窗是独立渲染进程：platformStore 的模型清单未必加载（共享缓存被单实体视图清空的老坑，
//   MEMORY 判据 #6）。进面板时兜底拉一次，保证选择器有货。
onMounted(async () => {
  try {
    if (!platformStore.modelsLoaded || !(platformStore.models || []).length) {
      if (!platformStore.platformsLoaded) await platformStore.loadPlatforms();
      await platformStore.loadModels();
    }
  } catch { /* 取不到模型清单就不显示可选项，选择器仍可见 */ }
});

const draft = ref('');
const listRef = ref<HTMLElement | null>(null);
/** P3-5：历史弹窗 / 蒸馏弹窗的开关 */
const historyVisible = ref(false);
const distillVisible = ref(false);

// ===== 长内容折叠（2026-11-15 用户「聊天页面UI真的需要优化，说了多少遍」）=====
// 错误/授权指引类 note 只露首行（details）；超过 600 字的助手消息默认钳到 280px 可展开。
const CLAMP_LEN = 600;
const expandedIds = ref(new Set<string>());
function firstLine(s: string): string {
  const line = String(s || '').split('\n').find((l) => l.trim()) || '';
  return line.length > 90 ? line.slice(0, 90) + '…' : line;
}
function isClampable(m: { id?: string; content: string; error?: boolean }): boolean {
  return !m.error && String(m.content || '').length > CLAMP_LEN;
}
function isClamped(m: { id: string; content: string; error?: boolean }): boolean {
  return isClampable(m) && !expandedIds.value.has(m.id);
}
function toggleExpand(id: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  expandedIds.value = next;
}

const state = computed(() => pageChat.stateOf(props.tabId));
/** 蒸馏素材：只含真正的对话（丢掉"已停止""页面漂移"这类本地面板提示） */
const distillMessages = computed(() => distillMessagesOf(state.value.messages));
const isOwnConv = computed(() => !!state.value.ownConversation);
// preview 空间共用主会话：主会话正在跑任务时不允许再塞一条（避免同会话任务互抢）
const convBusy = computed(() =>
  !isOwnConv.value && !!props.convId && chatStore.isConvStreaming(props.convId),
);
const scopeHint = computed(() => (isOwnConv.value
  ? '这页的对话落在它自己的会话里，关闭标签页即清除'
  : '这页的对话落在当前会话里（能直接操作这一页）'));
const inputPlaceholder = computed(() => (convBusy.value
  ? '当前会话正在执行任务，等它结束再问'
  : '问这一页的内容，或让它在这一页上做点什么…'));

/** 当前页命中的页面指令（P1）：站点专属在前、全局在后；一条都没有时给"新建指令"。
 *  ★ 2026-10-16 起经**命令总线**取（`CommandDef` 形态，`kind:'page'`）——
 *    与聊天框的 `/` 菜单共用同一套"列出 + 搜索"口径，不再各写一份列表逻辑。
 *    匹配与排序仍是 `utils/pageCommand` 的 matchPageCommands（总线只做形态转换）。 */
const matchedCmds = computed(() => commandsStore.pageDefsFor(props.url || ''));

/** chips 的 tooltip：优先说明，其次指令正文（点下去之前的最后一道"这条到底要干什么"） */
function chipTitle(c: CommandDef): string {
  const prefix = c.pageKind === 'script' ? '脚本指令（执行前确认）：' : '';
  const raw = commandsStore.pageCommandById(c.pageCommandId);
  return prefix + (c.desc || raw?.body || '');
}

/**
 * 执行一条 chips = 先按 `pageCommandId` 回查原始指令行，再走**原有**执行路径。
 * ★ 命令总线只负责"列出 + 触发"，不认识 `/llm/tasks` 也不认识 `run_script` ——
 *   执行口径始终只有 `runCommand` 一处（脚本型那条更是带着确认与审计）。
 */
function runDef(c: CommandDef) {
  const raw = commandsStore.pageCommandById(c.pageCommandId);
  if (!raw) { ElMessage.warning('这条指令已不在指令库里，刷新后再试'); return; }
  void runCommand(raw);
}

onMounted(() => { void cmdsStore.load(); });

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// 新消息 / 流式增量 → **智能跟随**到底部（2026-11-15 用户咆哮「我往上滚动的时候不要一直往下跳」）：
// 只有用户本来就贴在底部（±48px）时才跟随；用户往上翻了就绝不拽人，直到他滚回底部。
// 用"下一次滚动事件是否由程序发起"防抖：程序滚到底后 anchor 恢复 true。
const followBottom = ref(true);
function onListScroll(): void {
  const el = listRef.value;
  if (!el) return;
  followBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
}
// 新消息 / 流式增量 → 跟到底部（用"总字数"当增量信号，避免 deep watch 整棵消息树）
watch(
  () => [state.value.messages.length, state.value.messages.reduce((n, m) => n + m.content.length, 0)],
  () => {
    if (!followBottom.value) return;   // 用户在看历史：不拽
    scrollToBottom();
  },
);

async function sendText(text: string): Promise<void> {
  draft.value = '';
  followBottom.value = true;   // 用户自己发言 → 重新跟随到底
  scrollToBottom();
  const r = await pageChat.send({
    tabId: props.tabId,
    tab: { url: props.url, title: props.title },
    question: text,
    convId: props.convId,
    agentId: props.agentId,
    tabCount: props.tabCount,
  });
  if (!r.ok && r.msg) ElMessage.warning(r.msg);
}

async function onSend() {
  const text = draft.value.trim();
  if (!text) return;
  if (!/^https?:\/\//i.test(props.url || '')) { ElMessage.warning('先打开一个网页，再对话'); return; }
  if (convBusy.value) { ElMessage.warning('当前会话正在执行任务，等它结束再问'); return; }
  await sendText(text);
}

/** 当前页的变量（指令模板与脚本 ctx 共用同一份取值口径） */
function varsNow(selection = ''): PageCommandVars {
  return {
    url: props.url || '',
    title: props.title || '',
    host: hostOf(props.url || ''),
    selection,
  };
}

/** `${input:提示}` 逐个弹框；返回 null = 用户取消（**整条指令不发**，避免发出没填完的指令） */
async function promptInputs(c: PageCommand): Promise<Record<string, string> | null> {
  const inputs: Record<string, string> = {};
  for (const prompt of inputPromptsOf(c.body)) {
    try {
      const r = await ElMessageBox.prompt(prompt, c.name, {
        confirmButtonText: '确定', cancelButtonText: '取消', inputPlaceholder: prompt,
      });
      inputs[prompt] = String((r as any)?.value ?? '').trim();
    } catch { return null; }
  }
  return inputs;
}

/** `${selection}` 用到时才现采一次选区（正文/脚本要进 prompt，现采比常驻采集便宜） */
async function selectionNow(c: PageCommand): Promise<string> {
  if (!usedVarsOf(c.body).includes('selection')) return '';
  try {
    return (await collectPageContext(props.tabId, { url: props.url, title: props.title })).selection;
  } catch { return ''; }   // 取不到就留空，不阻断
}

/**
 * 跑一条页面指令：
 *   · 任务型 → 模板插值后走**与手输完全相同**的发送通道（发进会话，由模型执行）；
 *   · 脚本型 → 在本页执行脚本（P2）：默认每次弹确认，结果落面板消息 + 写审计。
 */
async function runCommand(c: PageCommand) {
  if (!/^https?:\/\//i.test(props.url || '')) { ElMessage.warning('先打开一个网页，再用指令'); return; }
  if (state.value.streaming) { ElMessage.warning('这一页正在执行上一条，等它结束或点停止'); return; }
  if (convBusy.value) { ElMessage.warning('当前会话正在执行任务，等它结束再问'); return; }
  if (c.kind === 'script') { await runScriptCommand(c); return; }

  const inputs = await promptInputs(c);
  if (!inputs) return;
  const question = renderCommandBody(c.body, varsNow(await selectionNow(c)), inputs).trim();
  if (!question) { ElMessage.warning('指令内容为空，检查一下模板变量'); return; }

  cmdsStore.markUsed(c.id);
  await sendText(question);
}

/**
 * 脚本型指令（P2）：**默认每次执行都要人工确认**（用户拍板口径）。
 * 免确认只有两条线上的前提同时成立：① 全局设置「允许信任脚本指令」打开；② 这条指令被标了信任
 * （服务端只在收到 trust:true 时才把 need_confirm 置 0，且**内置/导入来源永远置 1**）。
 */
async function runScriptCommand(c: PageCommand) {
  const api = (globalThis as any)?.window?.electronAPI;
  if (!api?.browserView?.action) {
    ElMessage.warning('脚本型指令需要在桌面端使用（网页端无法在页面里执行脚本）');
    return;
  }
  const inputs = await promptInputs(c);
  if (!inputs) return;

  const vars = varsNow(await selectionNow(c));
  const script = buildScriptSource(c.body, vars, inputs);

  if (needsConfirm(c)) {
    const ok = await confirmScript(c, script, vars);
    if (!ok) { pageChat.note(props.tabId, `已取消执行「${c.name}」。`); return; }
  }

  const started = Date.now();
  pageChat.note(props.tabId, `⚙ 执行脚本指令：**${c.name}**`);
  const audit = (status: 'ok' | 'error', extra: { result_digest?: string; error?: string }) =>
    cmdsStore.reportRun(c.id, {
      status, started_at: started, ended_at: Date.now(),
      tab_id: props.tabId, url: props.url, host: vars.host, ...extra,
    });

  try {
    const r = await api.browserView.action(props.tabId, 'run_script', { script });
    const dur = Date.now() - started;
    if (r?.error) {
      pageChat.note(props.tabId, `⚠️ 「${c.name}」执行失败：${r.error}${r.hint ? '\n' + r.hint : ''}`, true);
      // P3-4 自愈入口：把"原脚本 + 真实报错"备好，面板头部出现「🛠 修复脚本」
      state.value.repairHint = buildScriptRepairPrompt(c.name, script, String(r.error));
      audit('error', { error: String(r.error).slice(0, 500) });
    } else {
      pageChat.note(props.tabId, formatScriptResult(c.name, r?.result, dur));
      audit('ok', { result_digest: digestOf(r?.result) });
    }
    cmdsStore.markUsed(c.id);
  } catch (e: any) {
    pageChat.note(props.tabId, `⚠️ 「${c.name}」执行异常：${e?.message || e}`, true);
    state.value.repairHint = buildScriptRepairPrompt(c.name, script, String(e?.message || e));
    audit('error', { error: String(e?.message || e).slice(0, 500) });
  }
}

/**
 * P3-4 自愈：把"原脚本 + 报错"交给模型出修正版（**只出文本、不执行**）。
 * 用户拿到修正脚本后，自己在指令编辑器里替换、再手动跑 —— 这一步不做自动替换：
 * 自动改用户的指令库、或自动重跑，都属于"没经过同意就动手"。
 */
async function onRepairScript() {
  const hint = state.value.repairHint;
  if (!hint) return;
  state.value.repairHint = '';                 // 先清空，避免连点重复发送
  if (convBusy.value) { ElMessage.warning('当前会话正在执行任务，等它结束再问'); return; }
  await sendText(hint);
}

/** 执行前的确认弹窗：展示**将要执行的完整脚本**（变量已渲染）+ 权限风险（方案 §5.4） */
async function confirmScript(c: PageCommand, script: string, vars: PageCommandVars): Promise<boolean> {
  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = '<div style="font-size:12px;line-height:1.7">'
    + `<div>在 <b>${esc(vars.host || vars.url)}</b> 这一页执行脚本指令 <b>${esc(c.name)}</b>：</div>`
    + '<pre style="max-height:200px;overflow:auto;background:#f5f7fa;padding:8px;border-radius:6px;'
    + 'font-size:12px;white-space:pre-wrap;word-break:break-word">' + esc(script) + '</pre>'
    + '<div style="color:#e6a23c">⚠️ 脚本以**你自己的身份**在这一页运行：可读取本页内容与登录态、'
    + '可发起请求、可修改并提交表单。</div>'
    + '<div style="color:#909399;margin-top:6px">想以后不再确认？在「页面指令」里给这条指令打开「信任」'
    + '（需先在浏览器设置里允许信任脚本指令）。</div></div>';
  try {
    await ElMessageBox.confirm(html, '确认执行脚本', {
      dangerouslyUseHTMLString: true, confirmButtonText: '执行', cancelButtonText: '取消', type: 'warning',
    });
    return true;
  } catch { return false; }
}

function onStop() { void pageChat.stop(props.tabId); }
function onClear() { pageChat.clearTab(props.tabId); scrollToBottom(); }

/**
 * 当前页地址 / 标签数变化：跟到底部 + **执行期间漂移就明说**（P0.1）。
 *
 * 漂移场景：页面内对话让 AI"在这一页点/填"，它却把页导航走了（或另开一页作答）——
 * 用户会看到一个"看起来正常、答的却是别的页"的结果（本仓最难查的一类）。
 * 这里不假装没事：直接把漂移说出来；基线随之更新，同一任务只提醒一次。
 */
watch(() => props.url, (now) => {
  const st = state.value;
  if (st.streaming && st.targetUrl && now && now !== st.targetUrl) {
    // ★ P3-6：锁定的是**标签页**不是地址 —— 页内导航（点链接→翻页→读结果）是这类任务的正常组成，
    //   所以钉住时说的是"结果来自这一页的新地址"，而不是"可能来自新页面"。
    pageChat.note(
      props.tabId,
      st.pinnedTabId
        ? `⚠️ 执行期间本页地址已变为 ${now}（原 ${st.targetUrl}）—— 结果来自这一页的新地址。`
        : `⚠️ 执行期间页面地址已变为 ${now}（原 ${st.targetUrl}），下面的结果可能来自新页面。`,
      true,
    );
    st.targetUrl = now;
  }
  scrollToBottom();
});

watch(() => props.tabCount, (now) => {
  const st = state.value;
  if (st.streaming && now && st.targetTabCount && now > st.targetTabCount) {
    const extra = now - st.targetTabCount;
    // ★ P3-6：执行面已被钉在开始那一页时，"新标签页"不可能是 AI 开的（new_tab 会被主进程拒绝），
    //   结果也仍来自锁定页 —— 措辞必须跟着走，否则就是在说一句自己也不信的话。
    pageChat.note(
      props.tabId,
      st.pinnedTabId
        ? `⚠️ 执行期间新增了 ${extra} 个标签页（本次任务已锁定在开始那一页，结果仍来自该页）。`
        : `⚠️ 执行期间新增了 ${extra} 个标签页（可能是 AI 自己开的），结果可能来自新页面。`,
      true,
    );
    st.targetTabCount = now;
  }
});
</script>

<style scoped>
.page-chat-dock {
  width: 340px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0;
  border-left: 1px solid var(--el-border-color, #dcdfe6);
  background: var(--el-bg-color, #fff);
}
.pcd-head {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  font-size: 13px; flex-shrink: 0;
}
.pcd-title { font-weight: 600; color: var(--el-text-color-primary, #303133); flex-shrink: 0; }
.pcd-scope { font-size: 11px; color: var(--el-text-color-secondary, #909399); flex-shrink: 0; }
/* 按钮组：占满剩余宽度、靠右、放不下就换行
   （340px 的面板里要放 6 个入口，"flex:1 的 spacer + 一排按钮"会把按钮挤到溢出的解法） */
.pcd-head-actions {
  flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end;
  flex-wrap: wrap; gap: 2px 4px;
}
.pcd-icon-btn {
  border: none; background: transparent; cursor: pointer; font-size: 12px; white-space: nowrap;
  color: var(--el-text-color-secondary, #909399); padding: 2px 4px; border-radius: 4px;
}
.pcd-icon-btn:hover:not(:disabled) { background: var(--el-fill-color-light, #f5f7fa); color: var(--el-color-primary); }
.pcd-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pcd-icon-btn.repair { color: var(--el-color-warning, #e6a23c); }

.pcd-list { flex: 1; min-height: 0; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.pcd-empty { color: var(--el-text-color-secondary, #909399); font-size: 12px; line-height: 1.6; }
.pcd-empty-title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary, #303133); margin: 0 0 4px; }
.pcd-empty-sub { margin: 0 0 10px; }
.pcd-warn { margin: 8px 0 0; color: var(--el-color-warning, #e6a23c); }
.pcd-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pcd-chip {
  border: 1px solid var(--el-border-color, #dcdfe6); background: var(--el-bg-color, #fff);
  color: var(--el-text-color-regular, #606266); border-radius: 12px; padding: 3px 10px;
  font-size: 12px; cursor: pointer;
}
.pcd-chip:hover:not(:disabled) { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.pcd-chip:disabled { opacity: 0.5; cursor: not-allowed; }
/* 脚本型：虚线边框 + ⚙ 前缀，一眼区分"点下去会弹确认并在这页跑脚本" */
.pcd-chip.is-script { border-style: dashed; }

.pcd-msg { display: flex; flex-direction: column; }
.pcd-msg.is-user { align-items: flex-end; }
.pcd-bubble {
  max-width: 100%; font-size: 13px; line-height: 1.7; padding: 6px 10px; border-radius: 8px;
  background: var(--el-fill-color-light, #f5f7fa); color: var(--el-text-color-primary, #303133);
  word-break: break-word; overflow-wrap: anywhere;
}
.pcd-msg.is-user .pcd-bubble { background: var(--el-color-primary-light-9, #ecf5ff); }
.pcd-msg.is-assistant .pcd-bubble :deep(p) { margin: 0 0 6px; }
.pcd-msg.is-assistant .pcd-bubble :deep(pre) { margin: 6px 0; overflow-x: auto; font-size: 12px; }
.pcd-msg.is-assistant .pcd-bubble :deep(table) { border-collapse: collapse; font-size: 12px; }
.pcd-msg.is-assistant .pcd-bubble :deep(th),
.pcd-msg.is-assistant .pcd-bubble :deep(td) { border: 1px solid var(--el-border-color-lighter, #ebeef5); padding: 2px 6px; }
.pcd-note { font-size: 12px; color: var(--el-color-warning, #e6a23c); background: var(--el-color-warning-light-9, #fdf6ec); padding: 6px 10px; border-radius: 8px; }
.pcd-note summary { cursor: pointer; list-style: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pcd-note summary::-webkit-details-marker { display: none; }
.pcd-note summary::before { content: '⚠ '; }
.pcd-note[open] summary { border-bottom: 1px dashed var(--el-color-warning-light-5, #f0d8a8); padding-bottom: 4px; margin-bottom: 4px; }
.pcd-bubble.is-clamped { max-height: 280px; overflow: hidden; position: relative; }
.pcd-bubble.is-clamped::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 32px; background: linear-gradient(transparent, var(--el-fill-color-light, #f5f7fa)); pointer-events: none; }
.pcd-expand { align-self: flex-start; border: none; background: transparent; color: var(--el-color-primary, #409eff); font-size: 11px; cursor: pointer; padding: 2px 0; }
.pcd-cursor { color: var(--el-color-primary); animation: pcd-blink 1s steps(2, start) infinite; }
@keyframes pcd-blink { to { visibility: hidden; } }

/* 工具活动条：弱化小字，一眼看出 agent 正在动哪块（与主对话步骤条同语义） */
.pcd-tools {
  flex-shrink: 0; max-height: 108px; overflow-y: auto;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  padding: 4px 10px; display: flex; flex-direction: column; gap: 2px;
}
.pcd-tool { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--el-text-color-secondary, #909399); min-width: 0; }
.pcd-tool-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--el-text-color-placeholder, #c0c4cc); flex: none; }
.pcd-tool-dot.running { background: var(--el-color-primary); animation: pcd-blink 1s steps(2, start) infinite; }
.pcd-tool-dot.done { background: var(--el-color-success, #67c23a); }
.pcd-tool-dot.timeout { background: var(--el-color-warning, #e6a23c); }
.pcd-tool-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pcd-tool-warn { color: var(--el-color-warning, #e6a23c); flex: none; }

.pcd-input-row { flex-shrink: 0; border-top: 1px solid var(--el-border-color-lighter, #ebeef5); padding: 8px; }
.pcd-input {
  width: 100%; resize: none; box-sizing: border-box; font-size: 13px; line-height: 1.5;
  border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 6px; padding: 6px 8px;
  background: var(--el-bg-color, #fff); color: var(--el-text-color-primary, #303133); outline: none;
}
.pcd-input:focus { border-color: var(--el-color-primary); }
/* 模型胶囊进 actions 行（同办公聊天：工具条右侧、发送键旁），不再独立占行 */
.pcd-actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.pcd-actions .model-select-btn { flex-shrink: 0; }
.pcd-actions .model-select-name { max-width: 110px; }
.pcd-hint { flex: 1; font-size: 11px; color: var(--el-text-color-placeholder, #a8abb2); text-align: right; }
.pcd-btn {
  border: none; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer;
  background: var(--el-color-primary); color: #fff;
}
.pcd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pcd-btn.stop { background: var(--el-color-warning, #e6a23c); }
</style>

<!-- 模型弹层样式：与 views/chat.css 同名同款（popper 挂 body，必须非 scoped；
     抽共享组件前先保持双份一致，改这边要同步 chat.css） -->
<style>
.model-select-popper .pop-select-list { max-height: 260px; overflow-y: auto; }
.model-select-popper .pop-select-label { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; padding: 4px 12px 2px; }
.model-select-popper .pop-select-item {
  display: flex; align-items: center; gap: 6px; padding: 8px 12px;
  border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--color-text);
  transition: background 0.15s;
}
.model-select-popper .pop-select-item:hover { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.model-select-popper .pop-select-item.active { color: var(--color-primary); font-weight: 600; background: color-mix(in srgb, var(--color-primary) 14%, transparent); }
.model-select-popper .pop-select-model { gap: 8px; }
.model-select-popper .pop-select-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-select-popper .pop-select-ctx { flex-shrink: 0; font-size: 11.5px; font-weight: 400; color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
.model-select-popper .pop-select-item.active .pop-select-ctx { color: var(--color-primary); }
.model-select-popper .pop-select-models { display: flex; flex-direction: column; max-height: 340px; overflow: hidden; }
.model-select-popper .pop-model-search { flex-shrink: 0; margin-bottom: 6px; }
.model-select-popper .pop-model-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.model-select-popper .pop-model-group { display: flex; align-items: center; gap: 5px; }
.model-select-popper .pop-model-platform { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-select-popper .pop-model-count { flex-shrink: 0; font-size: 10.5px; font-weight: 500; opacity: 0.75; }
.model-select-popper .pop-model-empty { padding: 14px 12px; text-align: center; font-size: 12px; color: var(--color-text-secondary); }
</style>

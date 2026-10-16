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
  <div class="page-chat-dock">
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
        <button class="pcd-icon-btn" title="收起面板" @click="$emit('close')">✕</button>
      </div>
    </div>

    <!-- 消息流 -->
    <div ref="listRef" class="pcd-list">
      <div v-if="!state.messages.length" class="pcd-empty">
        <p class="pcd-empty-title">就这个页面聊点什么</p>
        <p class="pcd-empty-sub">问答 / 点击 / 填写这类轻任务在这里就地做；跨页操作、数据分析请走工具栏「移交给主智能体」。</p>
        <template v-if="matchedCmds.length">
          <div class="pcd-chips">
            <button
              v-for="c in matchedCmds" :key="c.id" class="pcd-chip" type="button"
              :class="{ 'is-script': c.kind === 'script' }"
              :title="(c.kind === 'script' ? '脚本指令（执行前确认）：' : '') + (c.description || c.body)"
              :disabled="state.streaming || convBusy" @click="runCommand(c)"
            >{{ c.kind === 'script' ? '⚙ ' : '' }}{{ c.name }}</button>
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
        <div v-if="m.error" class="pcd-note" v-html="renderMarkdown(m.content)"></div>
        <div v-else class="pcd-bubble" v-html="renderAssistantMarkdown(m.content)"></div>
        <span v-if="m.streaming" class="pcd-cursor">▍</span>
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
      <div class="pcd-actions">
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { usePageChatStore } from '../../stores/page-chat';
import { usePageCommandsStore } from '../../stores/page-commands';
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
const { renderMarkdown, renderAssistantMarkdown, store: chatStore } = useChat();

const draft = ref('');
const listRef = ref<HTMLElement | null>(null);
/** P3-5：历史弹窗 / 蒸馏弹窗的开关 */
const historyVisible = ref(false);
const distillVisible = ref(false);

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

/** 当前页命中的页面指令（P1）：站点专属在前、全局在后；一条都没有时给"新建指令" */
const matchedCmds = computed(() => cmdsStore.matched(props.url || ''));

onMounted(() => { void cmdsStore.load(); });

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// 新消息 / 流式增量 → 跟到底部（用"总字数"当增量信号，避免 deep watch 整棵消息树）
watch(
  () => [state.value.messages.length, state.value.messages.reduce((n, m) => n + m.content.length, 0)],
  scrollToBottom,
);

async function sendText(text: string): Promise<void> {
  draft.value = '';
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
    pageChat.note(
      props.tabId,
      `⚠️ 执行期间页面地址已变为 ${now}（原 ${st.targetUrl}），下面的结果可能来自新页面。`,
      true,
    );
    st.targetUrl = now;
  }
  scrollToBottom();
});

watch(() => props.tabCount, (now) => {
  const st = state.value;
  if (st.streaming && now && st.targetTabCount && now > st.targetTabCount) {
    pageChat.note(
      props.tabId,
      `⚠️ 执行期间新增了 ${now - st.targetTabCount} 个标签页（可能是 AI 自己开的），结果可能来自新页面。`,
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
.pcd-cursor { color: var(--el-color-primary); animation: pcd-blink 1s steps(2, start) infinite; }
@keyframes pcd-blink { to { visibility: hidden; } }

.pcd-input-row { flex-shrink: 0; border-top: 1px solid var(--el-border-color-lighter, #ebeef5); padding: 8px; }
.pcd-input {
  width: 100%; resize: none; box-sizing: border-box; font-size: 13px; line-height: 1.5;
  border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 6px; padding: 6px 8px;
  background: var(--el-bg-color, #fff); color: var(--el-text-color-primary, #303133); outline: none;
}
.pcd-input:focus { border-color: var(--el-color-primary); }
.pcd-actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.pcd-hint { flex: 1; font-size: 11px; color: var(--el-text-color-placeholder, #a8abb2); }
.pcd-btn {
  border: none; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer;
  background: var(--el-color-primary); color: #fff;
}
.pcd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pcd-btn.stop { background: var(--el-color-warning, #e6a23c); }
</style>

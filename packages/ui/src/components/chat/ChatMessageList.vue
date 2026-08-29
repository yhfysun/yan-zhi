<template>
  <div class="messages" ref="messagesRef">
    <TaskPlanCard v-if="store.planSteps.length" class="chat-plan-card" />
    <div v-for="(round, ri) in messageRounds" :key="ri" :class="['round-group']" :data-round="ri">
      <div v-if="round.user" class="msg msg-user">
        <div class="msg-avatar avatar-user"><el-icon><User /></el-icon></div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-role-name">你</span>
            <span v-if="round.user.createdAt" class="msg-time">{{ formatTime(round.user.createdAt) }}</span>
          </div>
          <div
            v-if="round.user.content"
            class="msg-block"
            :class="{ 'msg-collapsed': collapsedMessages[round.user.id] }"
            @click="collapsedMessages[round.user.id] ? toggleMsgCollapse(round.user.id) : null"
          >
            <div v-show="!collapsedMessages[round.user.id]">
              <div v-if="round.user.content" class="msg-content" v-html="renderMarkdown(round.user.content)" @click="handleContentClick"></div>
            </div>
            <div v-show="collapsedMessages[round.user.id]" class="msg-collapsed-placeholder">
              <span class="collapsed-line">{{ (round.user.content || '').replace(/\n/g, ' ').slice(0, 120) }}</span>
              <span class="collapsed-hint">点击展开</span>
            </div>
          </div>
          <div class="msg-actions">
            <el-tooltip content="复制" placement="top"><el-button text size="small" circle @click="copyMsg(round.user)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
            <el-tooltip content="编辑" placement="top"><el-button text size="small" circle @click="editMsg(round.user)"><el-icon><EditPen /></el-icon></el-button></el-tooltip>
            <el-tooltip content="蒸馏为 Skill" placement="top"><el-button text size="small" circle @click="distillUserMsg(round.user)"><el-icon><MagicStick /></el-icon></el-button></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(round.user)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
            <el-tooltip content="查看提示词" placement="top"><el-button text size="small" circle @click="openSnapshotDialog(round.user)"><el-icon><View /></el-icon></el-button></el-tooltip>
          </div>
        </div>
      </div>

      <div v-if="round.finalAssistant || round.steps.length > 0" class="msg msg-assistant">
        <div class="msg-avatar avatar-assistant" :class="{ streaming: isLastRoundStreaming(round, ri) }"><el-icon><ChatDotRound /></el-icon></div>
        <div class="msg-body">
          <div class="agent-response-card" :class="{ 'msg-collapsed': collapsedMessages[round.finalAssistant?.id || ''] }" @click="collapsedMessages[round.finalAssistant?.id || ''] ? toggleMsgCollapse(round.finalAssistant?.id || '') : null">
            <div v-show="collapsedMessages[round.finalAssistant?.id || '']" class="msg-collapsed-placeholder">
              <span class="collapsed-line">{{ (round.finalAssistant?.content || '').replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]/g, '').split('@@REASON@@')[0].replace(/\n/g, ' ').trim().slice(0, 120) }}</span>
              <span class="collapsed-hint">点击展开</span>
            </div>
            <div v-show="!collapsedMessages[round.finalAssistant?.id || '']">
              <div class="agent-response-body">
                <div v-if="round.finalAssistant?.reasoningContent && !round.hasAgentProcess" class="msg-reasoning">
                  <div class="reasoning-header" @click="toggleReasoning('agent-fa-' + ri)">
                    <el-icon><CaretRight v-if="!expandedReasoning['agent-fa-' + ri]" /><CaretBottom v-else /></el-icon>
                    <span>思考过程</span>
                  </div>
                  <div v-show="expandedReasoning['agent-fa-' + ri]" class="reasoning-body">{{ round.finalAssistant.reasoningContent }}</div>
                </div>
                <template v-if="round.finalAssistant?.content">
                  <div class="msg-content" v-html="renderAssistantMarkdown(round.finalAssistant.content)" @click="handleContentClick"></div>
                  <PlatformConfigCard
                    v-if="parseConfigCard(round.finalAssistant.content)"
                    :mode="parseConfigCard(round.finalAssistant.content)!.mode"
                    :platform="getEditPlatform(round.finalAssistant.content)"
                    :reason="getEditReason(round.finalAssistant.content)"
                    class="msg-config-card"
                    @saved="onConfigSaved"
                  />
                </template>
                <div v-else-if="isLastRoundStreaming(round, ri)" class="msg-content streaming">
                  <span class="typing-dots" aria-label="正在输入"><span></span><span></span><span></span></span>
                </div>
              </div>

              <div v-if="round.hasAgentProcess" class="agent-process-header" @click="toggleAgentProcess('round-' + ri)">
                <el-icon :size="14" class="agent-process-icon">
                  <CaretRight v-if="!expandedAgentProcess['round-' + ri]" />
                  <CaretBottom v-else />
                </el-icon>
                <span>智能体思考过程</span>
                <span class="agent-process-stats">({{ round.agentStats?.reasoningCount || 0 }} 次推理，{{ round.agentStats?.toolCallCount || 0 }} 个工具调用)</span>
                <el-icon :size="12" class="agent-process-chevron">
                  <ArrowDown v-if="!expandedAgentProcess['round-' + ri]" />
                  <ArrowRight v-else />
                </el-icon>
              </div>
              <div v-if="round.hasAgentProcess" v-show="expandedAgentProcess['round-' + ri]" class="agent-process-steps">
                <div v-for="(step, si) in round.steps" :key="'agent-step-' + ri + '-' + si" class="agent-step">
                  <div v-if="step.reasoningContent" class="msg-reasoning">
                    <div class="reasoning-header" @click="toggleReasoning('agent-step-' + ri + '-' + si)">
                      <el-icon><CaretRight v-if="!expandedReasoning['agent-step-' + ri + '-' + si]" /><CaretBottom v-else /></el-icon>
                      <span>推理 {{ si + 1 }}</span>
                    </div>
                    <div v-show="expandedReasoning['agent-step-' + ri + '-' + si]" class="reasoning-body">{{ step.reasoningContent }}</div>
                  </div>
                  <div v-if="step.partialContent" class="agent-step-partial" v-html="renderMarkdown(step.partialContent)" @click="handleContentClick"></div>
                  <div v-if="step.toolCalls.length" class="msg-reasoning" style="background:rgba(15,23,42,0.03);border-color:rgba(15,23,42,0.08)">
                    <div class="reasoning-header" @click="toggleStepTools('agent-step-' + ri + '-' + si)" style="color:var(--color-text-secondary)">
                      <el-icon :size="14" class="tool-group-dot" :class="getStepToolGroupClass(step)">
                        <Loading v-if="isStepToolsRunning(step)" class="is-loading" />
                        <CircleCheck v-else-if="!isStepToolsError(step)" />
                        <CircleClose v-else />
                      </el-icon>
                      <span>调用 {{ step.toolCalls.length }} 个工具</span>
                      <el-icon :size="12" style="margin-left:auto;color:var(--color-text-secondary)">
                        <ArrowDown v-if="expandedStepTools['agent-step-' + ri + '-' + si] !== false" />
                        <ArrowRight v-else />
                      </el-icon>
                    </div>
                    <div v-show="expandedStepTools['agent-step-' + ri + '-' + si] !== false" class="tool-group-body" style="margin-top:6px;border-top:1px solid rgba(15,23,42,0.06);padding-top:6px">
                      <div v-for="(tc, idx) in step.toolCalls" :key="idx" class="tool-item">
                        <div class="tool-item-header" @click="toggleTool('agent-step-' + ri + '-' + si + '-' + idx)">
                          <div class="tool-item-left">
                            <el-icon :size="12" class="tool-item-status" :class="getStepToolStatusClass(step, tc.id)">
                              <CircleCheck v-if="getStepToolResult(step, tc.id) && !isStepToolError(step, tc.id)" />
                              <CircleClose v-else-if="isStepToolError(step, tc.id)" />
                              <Loading v-else class="is-loading" />
                            </el-icon>
                            <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                            <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                          </div>
                          <el-icon :size="12" class="tool-item-chevron">
                            <ArrowDown v-if="expandedTools['agent-step-' + ri + '-' + si + '-' + idx]" />
                            <ArrowRight v-else />
                          </el-icon>
                        </div>
                        <div v-show="expandedTools['agent-step-' + ri + '-' + si + '-' + idx]" class="tool-item-body">
                          <div class="tool-item-section">
                            <div class="tool-item-label">参数</div>
                            <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                          </div>
                          <div v-if="getStepToolResult(step, tc.id)" class="tool-item-section">
                            <div class="tool-item-label">结果</div>
                            <pre class="tool-item-json" :class="{ 'tool-item-json-error': isStepToolError(step, tc.id) }">{{ getStepToolResult(step, tc.id) }}</pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="!round.steps.length && round.allToolCalls.length" class="agent-old-tools">
                  <div class="msg-reasoning">
                    <div class="reasoning-header" @click="toggleToolGroup('round-' + ri)">
                      <el-icon :size="14" class="tool-group-dot" :class="getToolGroupStatusClass(null, round.allToolCalls)">
                        <Loading v-if="isToolGroupRunning(round.allToolCalls)" class="is-loading" />
                        <CircleCheck v-else-if="!isToolGroupError(round.allToolCalls)" />
                        <CircleClose v-else />
                      </el-icon>
                      <span>工具调用 ({{ round.allToolCalls.length }})</span>
                      <el-icon :size="12" style="margin-left:auto;color:var(--color-text-secondary)">
                        <ArrowDown v-if="!expandedToolGroups['round-' + ri]" />
                        <ArrowRight v-else />
                      </el-icon>
                    </div>
                    <div v-show="!expandedToolGroups['round-' + ri]" class="tool-group-body" style="margin-top:6px;border-top:1px dashed rgba(139,92,246,0.12);padding-top:6px">
                      <div v-for="(tc, idx) in round.allToolCalls" :key="idx" class="tool-item">
                        <div class="tool-item-header" @click="toggleTool('round-' + ri + '-' + idx)">
                          <div class="tool-item-left">
                            <el-icon :size="12" class="tool-item-status" :class="getToolStatusClass(tc.id)">
                              <CircleCheck v-if="getToolResult(tc.id) && !isToolError(tc.id)" />
                              <CircleClose v-else-if="isToolError(tc.id)" />
                              <Loading v-else class="is-loading" />
                            </el-icon>
                            <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                            <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                          </div>
                          <el-icon :size="12" class="tool-item-chevron">
                            <ArrowDown v-if="expandedTools['round-' + ri + '-' + idx]" />
                            <ArrowRight v-else />
                          </el-icon>
                        </div>
                        <div v-show="expandedTools['round-' + ri + '-' + idx]" class="tool-item-body">
                          <div class="tool-item-section">
                            <div class="tool-item-label">参数</div>
                            <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                          </div>
                          <div v-if="getToolResult(tc.id)" class="tool-item-section">
                            <div class="tool-item-label">结果</div>
                            <pre class="tool-item-json" :class="{ 'tool-item-json-error': isToolError(tc.id) }">{{ getToolResult(tc.id) }}</pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="msg-actions msg-actions-assistant">
            <el-tooltip content="复制" placement="top"><el-button text size="small" circle @click="copyMsg(round.finalAssistant!)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
            <el-tooltip content="重新生成" placement="top"><el-button text size="small" circle :disabled="store.streaming" @click="regenerateMsg"><el-icon><Refresh /></el-icon></el-button></el-tooltip>
            <el-tooltip content="蒸馏为 Skill" placement="top"><el-button text size="small" circle @click="distillAssistantMsg(round)"><el-icon><MagicStick /></el-icon></el-button></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button text size="small" circle @click="delMsg(round.finalAssistant!)"><el-icon><Delete /></el-icon></el-button></el-tooltip>
            <el-tooltip content="折叠" placement="top"><el-button text size="small" circle @click.stop="toggleMsgCollapse(round.finalAssistant!.id)"><el-icon><Fold /></el-icon></el-button></el-tooltip>
          </div>
        </div>
      </div>
    </div>

    <el-empty v-if="store.currentMessages.length === 0 && !store.streaming && selectedModelId" description="输入消息开始对话" />

    <div v-if="store.currentMessages.length === 0 && !store.streaming && !selectedModelId" class="welcome-card">
      <div class="welcome-icon"><el-icon :size="56"><ChatDotRound /></el-icon></div>
      <h2>欢迎使用 AI 助手</h2>
      <p v-if="platformStore.platforms.length === 0">请先配置模型平台，点击下方按钮开始</p>
      <p v-else>请在下方面板选择模型，然后开始对话</p>
      <div class="welcome-actions" v-if="platformStore.platforms.length > 0">
        <el-button @click="input = '帮我写一段 Python 代码'; $nextTick(() => { const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement; if (ta) ta.focus(); })">帮我写一段 Python 代码</el-button>
        <el-button @click="input = '解释什么是机器学习'; $nextTick(() => { const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement; if (ta) ta.focus(); })">解释什么是机器学习</el-button>
        <el-button @click="input = '帮我分析这个项目的结构'; $nextTick(() => { const ta = document.querySelector('.input-textarea textarea') as HTMLTextAreaElement; if (ta) ta.focus(); })">帮我分析这个项目的结构</el-button>
      </div>
      <el-button type="primary" size="large" round @click="openPlatformConfig" style="margin-top:8px">
        <el-icon><Setting /></el-icon> 配置模型
      </el-button>
    </div>
  </div>


  <div
    v-if="userRoundIndices.length > 1"
    class="round-nav"
    ref="roundNavRef"
    @mouseenter="onNavEnter"
    @mousemove="onNavMove"
    @mouseleave="onNavLeave"
  >
    <div
      v-for="d in dashCount"
      :key="d"
      class="round-nav-dash"
      @click="onDashClick(d - 1)"
    >
      <span class="dash-line" :style="dashStyle(d - 1)" />
    </div>
  </div>
  <div
    v-if="navListVisible"
    class="round-nav-list"
    ref="navListRef"
    @mouseenter="onListEnter"
    @mouseleave="onNavLeave"
  >

    <div class="round-nav-list-items">
      <div
        v-for="(ri, idx) in userRoundIndices"
        :key="ri"
        class="round-nav-list-item"
        :class="{ active: ri === activeNavRound }"
        @click="scrollToRound(ri)"
      >
        <span class="round-nav-list-idx">{{ idx + 1 }}</span>
        <span class="round-nav-list-text">{{ getRoundText(ri) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  User, ChatDotRound, CaretRight, CaretBottom, ArrowDown, ArrowRight, Loading, CircleCheck,
  CircleClose, CopyDocument, EditPen, MagicStick, Delete, View, Fold, Refresh, Setting,
} from '@element-plus/icons-vue';
import { ref, watch, nextTick, computed } from 'vue';
import { useChat } from '../../composables/chat/useChat';
import TaskPlanCard from '../TaskPlanCard.vue';
import PlatformConfigCard from '../PlatformConfigCard.vue';

const {
  store, platformStore, messagesRef, messageRounds, formatTime, collapsedMessages, toggleMsgCollapse,
  renderMarkdown, handleContentClick, copyMsg, editMsg, distillUserMsg, delMsg,
  openSnapshotDialog, isLastRoundStreaming, parseConfigCard, getEditPlatform,
  getEditReason, onConfigSaved, expandedReasoning, toggleReasoning, expandedAgentProcess,
  toggleAgentProcess, expandedStepTools, toggleStepTools, getStepToolGroupClass, isStepToolsRunning,
  isStepToolsError, toggleTool, getStepToolStatusClass, getStepToolResult, isStepToolError, resolveToolDisplay,
  resolveToolArgs, expandedTools, toggleToolGroup, getToolGroupStatusClass, isToolGroupRunning,
  isToolGroupError, expandedToolGroups, getToolStatusClass, getToolResult, isToolError, distillAssistantMsg, regenerateMsg,
  selectedModelId, input, openPlatformConfig,
  userRoundIndices, activeNavRound, scrollToRound,
} = useChat();
const document = window.document;

function renderAssistantMarkdown(content?: string) {
  let c = content || '';
  // 去掉平台配置卡片标记和 @@REASON@@ 分隔符（这些由 PlatformConfigCard 组件单独渲染）
  c = c.replace(/\[\[PLATFORM_CONFIG:[^\]]*\]\]\s*$/g, '').split('\n@@REASON@@\n')[0].trim();
  return c.split(/(\[tool_call\])/g).map((part) => {
    if (part === '[tool_call]') {
      return '<span class="inline-tool-chip"><span class="inline-tool-spinner"></span>正在调用工具</span>';
    }
    return renderMarkdown(part);
  }).join('');
}

const roundNavRef = ref<HTMLElement | null>(null);
const navListRef = ref<HTMLElement | null>(null);
const navListVisible = ref(false);
const hoverPos = ref<number | null>(null);
let navHideTimer: number | null = null;
let listScrollRaf: number | null = null;

// 横岗（codex 风格）：数量上限 35，超过按比例映射；可点击跳转附近消息
const MAX_NAV_DASHES = 35;
const dashCount = computed(() => Math.min(MAX_NAV_DASHES, userRoundIndices.value.length));
const activeDashIdx = computed(() => {
  const total = userRoundIndices.value.length;
  if (total === 0) return -1;
  const ai = activeNavRound.value === null ? -1 : userRoundIndices.value.indexOf(activeNavRound.value);
  if (ai < 0) return -1;
  return Math.min(dashCount.value - 1, Math.floor((ai / total) * dashCount.value));
});

// 横岗索引 → 问题列表索引（按比例映射）
function dashToListIdx(dashIdx: number): number {
  const total = userRoundIndices.value.length;
  if (total === 0) return -1;
  return Math.min(total - 1, Math.floor((dashIdx / dashCount.value) * total));
}

// 每个横岗的样式：hover 时以鼠标位置为中心最长，向两侧渐变变短；无 hover 时 active 最长
function dashStyle(d: number): Record<string, string> {
  const normal = 8, max = 14;
  const normalColor = 'rgba(148,163,184,0.45)';
  const activeColor = 'var(--color-primary)';
  if (hoverPos.value === null) {
    if (d === activeDashIdx.value) {
      return { width: max + 'px', height: '2.5px', backgroundColor: activeColor, boxShadow: '0 0 4px rgba(59,130,246,0.4)' };
    }
    return { width: normal + 'px', height: '1.5px', backgroundColor: normalColor, boxShadow: 'none' };
  }
  const dist = Math.abs(d - hoverPos.value);
  const range = 4;
  const decay = Math.max(0, 1 - dist / range);
  const width = normal + (max - normal) * decay;
  const height = (1.5 + decay).toFixed(2) + 'px';
  const bg = decay > 0.05 ? activeColor : normalColor;
  const shadow = decay > 0.4 ? `0 0 ${(4 * decay).toFixed(1)}px rgba(59,130,246,0.5)` : 'none';
  return { width: width.toFixed(1) + 'px', height, backgroundColor: bg, boxShadow: shadow };
}

// 鼠标在横岗区域移动 → 中心横岗最长、两侧渐变变短 + 侧边列表同步滚动
function onNavMove(ev: MouseEvent) {
  const nav = roundNavRef.value;
  if (!nav) return;
  const rect = nav.getBoundingClientRect();
  const ratio = (ev.clientY - rect.top) / rect.height;
  const pos = Math.max(0, Math.min(dashCount.value - 1, ratio * dashCount.value));
  if (hoverPos.value === null || Math.abs(pos - hoverPos.value) > 0.01) {
    hoverPos.value = pos;
    scrollListToPos(pos);
  }
}

function scrollListToPos(pos: number) {
  if (listScrollRaf !== null) return;
  listScrollRaf = requestAnimationFrame(() => {
    listScrollRaf = null;
    const list = navListRef.value;
    if (!list) return;
    const items = list.querySelector('.round-nav-list-items') as HTMLElement | null;
    if (!items) return;
    const listIdx = dashToListIdx(pos);
    if (listIdx < 0) return;
    const item = items.children[listIdx] as HTMLElement | null;
    if (item) {
      items.scrollTop = item.offsetTop - (items.clientHeight - item.clientHeight) / 2;
    }
  });
}

// 点击横岗跳转到对应附近消息
function onDashClick(dashIdx: number) {
  const listIdx = dashToListIdx(dashIdx);
  if (listIdx < 0) return;
  const ri = userRoundIndices.value[listIdx];
  if (ri !== undefined) scrollToRound(ri);
}


function stripMarkdown(s: string): string {
  return (s || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '[代码块]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRoundText(ri: number): string {
  const round = messageRounds.value[ri];
  const text = stripMarkdown(round?.user?.content || '');
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
}

function onNavEnter() {
  if (navHideTimer) { clearTimeout(navHideTimer); navHideTimer = null; }
  navListVisible.value = true;
  // 列表展开时自动定位到当前选中项（居中）
  nextTick(() => {
    const list = navListRef.value;
    if (!list) return;
    const activeItem = list.querySelector('.round-nav-list-item.active') as HTMLElement | null;
    if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function onListEnter() {
  if (navHideTimer) { clearTimeout(navHideTimer); navHideTimer = null; }
}

function onNavLeave() {
  if (navHideTimer) { clearTimeout(navHideTimer); navHideTimer = null; }
  hoverPos.value = null;
  navHideTimer = window.setTimeout(() => { navListVisible.value = false; }, 200);
}

watch(activeNavRound, () => {
  nextTick(() => {
    const nav = roundNavRef.value;
    if (nav) {
      const active = nav.querySelector('.round-nav-dash.active') as HTMLElement | null;
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const list = navListRef.value;
    if (list) {
      const activeItem = list.querySelector('.round-nav-list-item.active') as HTMLElement | null;
      if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
});
</script>

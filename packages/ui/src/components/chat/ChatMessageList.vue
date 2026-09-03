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
              <div v-if="round.hasAgentProcess" class="agent-process-header" @click="toggleAgentProcess('round-' + ri)">
                <el-icon :size="14" class="agent-process-icon">
                  <CaretRight v-if="!isProcessOpen(round, ri)" />
                  <CaretBottom v-else />
                </el-icon>
                <span>智能体思考过程</span>
                <span class="agent-process-stats">({{ round.agentStats?.reasoningCount || 0 }} 次推理，{{ round.agentStats?.toolCallCount || 0 }} 个工具调用)</span>
                <el-icon :size="12" class="agent-process-chevron">
                  <ArrowDown v-if="!isProcessOpen(round, ri)" />
                  <ArrowRight v-else />
                </el-icon>
              </div>
              <div v-if="round.hasAgentProcess" v-show="isProcessOpen(round, ri)" class="agent-process-steps">
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
                            <ArrowDown v-if="isToolItemOpen(tc.id, 'agent-step-' + ri + '-' + si + '-' + idx)" />
                            <ArrowRight v-else />
                          </el-icon>
                        </div>
                        <div v-show="isToolItemOpen(tc.id, 'agent-step-' + ri + '-' + si + '-' + idx)" class="tool-item-body">
                          <div class="tool-item-section">
                            <div class="tool-item-label">参数</div>
                            <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                          </div>
                          <div v-if="getStepToolResult(step, tc.id)" class="tool-item-section">
                            <div class="tool-item-label">结果</div>
                            <pre class="tool-item-json" :class="{ 'tool-item-json-error': isStepToolError(step, tc.id) }">{{ getStepToolResult(step, tc.id) }}</pre>
                          </div>
                          <div v-if="detectGitPath(getStepToolResult(step, tc.id))" class="tool-item-section">
                            <el-button size="small" @click="openInGit(detectGitPath(getStepToolResult(step, tc.id))!)">浏览文件</el-button>
                          </div>
                          <SubAgentRoundView
                            v-if="tc.toolName === 'call_agent' && step.subAgentRounds?.find(r => r.toolCallId === tc.id)"
                            :round="step.subAgentRounds!.find(r => r.toolCallId === tc.id)!"
                            :id-prefix="'sub-' + ri + '-' + si + '-' + idx"
                          />
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
                    <div v-show="!expandedToolGroups['round-' + ri]" class="tool-group-body" style="margin-top:6px;border-top:1px dashed color-mix(in srgb, var(--color-primary) 12%, transparent);padding-top:6px">
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
                          <div v-if="detectGitPath(getToolResult(tc.id))" class="tool-item-section">
                            <el-button size="small" @click="openInGit(detectGitPath(getToolResult(tc.id))!)">浏览文件</el-button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
                  <DeliverableFileCard
                    v-if="getRoundDeliverableFiles(round).length"
                    :files="getRoundDeliverableFiles(round)"
                    class="msg-deliverable-card"
                  />
                </template>
                <template v-else-if="isLastRoundStreaming(round, ri)">
                  <!-- 有实时正文：跑马灯式流式显示 + 末尾闪烁光标 -->
                  <div v-if="getStreamingText(round, ri)" class="msg-content streaming-content" v-html="renderStreamingContent(getStreamingText(round, ri))" @click="handleContentClick"></div>
                  <!-- 有思考但无正文：显示正在思考 + 实时思考内容 -->
                  <div v-else-if="getStreamingReasoning(round, ri)" class="msg-reasoning streaming-reasoning">
                    <div class="reasoning-header"><span>正在思考…</span></div>
                    <div class="reasoning-body">{{ getStreamingReasoning(round, ri) }}</div>
                  </div>
                  <!-- 刚开始无任何内容：三点初始态 -->
                  <div v-else class="msg-content streaming">
                    <span class="typing-dots" aria-label="正在输入"><span></span><span></span><span></span></span>
                  </div>
                </template>
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

  <!-- ask_user 内联表单（消息流末尾独立渲染，不受横岗 hover 与轮次数控制） -->
  <div v-if="store.pendingQuestion" class="inline-ask-card">
    <div class="inline-ask-icon"><el-icon><ChatDotRound /></el-icon></div>
    <div class="inline-ask-body">
      <div class="inline-ask-question">{{ store.pendingQuestion.question }}</div>
      <div v-if="askMultiSelect" class="inline-ask-options">
        <el-checkbox v-for="(opt, i) in store.pendingQuestion.options" :key="i" v-model="askChecked[i]">{{ opt }}</el-checkbox>
      </div>
      <div v-else-if="store.pendingQuestion.options?.length" class="inline-ask-options">
        <button v-for="(opt, i) in store.pendingQuestion.options" :key="i" type="button" class="inline-ask-opt" :class="{ 'is-active': askSingle === opt }" @click="askSingle = opt">{{ opt }}</button>
        <button type="button" class="inline-ask-opt inline-ask-opt-text" :class="{ 'is-active': askShowText }" @click="askShowText = true">其他（文字输入）</button>
      </div>
      <el-input v-if="!store.pendingQuestion.options?.length || askShowText" v-model="askText" type="textarea" :rows="3" placeholder="输入你的回答..." @keyup.ctrl.enter="onAskSubmit" />
      <button v-if="store.pendingQuestion.allowSupplement !== false && !askSupplementOpen" type="button" class="inline-ask-toggle" @click="askSupplementOpen = true">+ 补充说明</button>
      <el-input v-if="store.pendingQuestion.allowSupplement !== false && askSupplementOpen" v-model="askSupplement" type="textarea" :rows="2" placeholder="补充说明（可选）" class="inline-ask-supplement" @keyup.ctrl.enter="onAskSubmit" />
      <div class="inline-ask-actions">
        <el-button size="small" @click="onAskSkip">跳过</el-button>
        <el-button size="small" type="primary" @click="onAskSubmit">提交</el-button>
      </div>
    </div>
  </div>

  <!-- confirm_user 内联表单（多页确认向导，独立渲染） -->
  <div v-if="store.pendingConfirmation && confirmCurrentPage" class="inline-ask-card">
    <div class="inline-ask-icon"><el-icon><ChatDotRound /></el-icon></div>
    <div class="inline-ask-body">
      <div class="inline-ask-step">第 {{ store.pendingConfirmation.index + 1 }} / {{ store.pendingConfirmation.pages.length }} 页</div>
      <div class="inline-ask-question">{{ confirmCurrentPage.question }}</div>
      <div v-if="confirmCurrentPage.description" class="inline-ask-desc">{{ confirmCurrentPage.description }}</div>
      <div v-if="confirmMultiSelect" class="inline-ask-options">
        <el-checkbox v-for="(opt, i) in confirmCurrentPage.options" :key="i" v-model="confirmChecked[i]">{{ opt }}</el-checkbox>
      </div>
      <div v-else-if="confirmCurrentPage.options?.length" class="inline-ask-options">
        <button v-for="(opt, i) in confirmCurrentPage.options" :key="i" type="button" class="inline-ask-opt" :class="{ 'is-active': confirmSingle === opt }" @click="confirmSingle = opt">{{ opt }}</button>
        <button v-if="confirmCurrentPage.allowText !== false" type="button" class="inline-ask-opt inline-ask-opt-text" :class="{ 'is-active': confirmShowText }" @click="confirmShowText = true">其他（文字输入）</button>
      </div>
      <el-input v-if="confirmCurrentPage.allowText !== false && (!confirmCurrentPage.options?.length || confirmMultiSelect || confirmShowText)" v-model="confirmText" type="textarea" :rows="3" placeholder="输入你的回答..." />
      <button v-if="confirmCurrentPage.allowSupplement !== false && !confirmSupplementOpen" type="button" class="inline-ask-toggle" @click="confirmSupplementOpen = true">+ 补充说明</button>
      <el-input v-if="confirmCurrentPage.allowSupplement !== false && confirmSupplementOpen" v-model="confirmSupplement" type="textarea" :rows="2" placeholder="补充说明（可选）" class="inline-ask-supplement" />
      <div class="inline-ask-actions">
        <el-button size="small" @click="onConfirmSkip">跳过</el-button>
        <el-button size="small" type="primary" @click="onConfirmNext">
          {{ store.pendingConfirmation.index < store.pendingConfirmation.pages.length - 1 ? '下一页' : '完成' }}
        </el-button>
      </div>
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


    <transition name="scroll-fab">
      <button v-if="showScrollTop" class="scroll-fab scroll-fab-top" @click="messagesRef!.scrollTop = 0" aria-label="滚动到顶部">
        <el-icon><ArrowUp /></el-icon>
      </button>
    </transition>
    <transition name="scroll-fab">
      <button v-if="showScrollBottom" class="scroll-fab scroll-fab-bottom" @click="scrollToBottom" aria-label="滚动到底部">
        <el-icon><ArrowDown /></el-icon>
      </button>
    </transition>
  </div>
</template>

<script setup lang="ts">
import {
  User, ChatDotRound, CaretRight, CaretBottom, ArrowDown, ArrowRight, ArrowUp, Loading, CircleCheck,
  CircleClose, CopyDocument, EditPen, MagicStick, Delete, View, Fold, Refresh, Setting,
} from '@element-plus/icons-vue';
import { ref, watch, nextTick, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useChat } from '../../composables/chat/useChat';
import type { MessageRound } from '../../composables/chat/useChat';
import { useSettingsStore } from '../../stores/settings';
import TaskPlanCard from '../TaskPlanCard.vue';
import PlatformConfigCard from '../PlatformConfigCard.vue';
import SubAgentRoundView from './SubAgentRoundView.vue';
import DeliverableFileCard from './DeliverableFileCard.vue';

const {
  store, platformStore, fileStore, messagesRef, messageRounds, formatTime, collapsedMessages, toggleMsgCollapse,
  renderMarkdown, handleContentClick, copyMsg, editMsg, distillUserMsg, delMsg,
  openSnapshotDialog, isLastRoundStreaming, getStreamingStep, parseConfigCard, getEditPlatform,
  getEditReason, onConfigSaved, expandedReasoning, toggleReasoning, expandedAgentProcess,
  toggleAgentProcess, expandedStepTools, toggleStepTools, getStepToolGroupClass, isStepToolsRunning,
  isStepToolsError, toggleTool, getStepToolStatusClass, getStepToolResult, isStepToolError, resolveToolDisplay,
  resolveToolArgs, expandedTools, toggleToolGroup, getToolGroupStatusClass, isToolGroupRunning,
  isToolGroupError, expandedToolGroups, getToolStatusClass, getToolResult, isToolError, distillAssistantMsg, regenerateMsg,
  isToolItemOpen,
  selectedModelId, input, openPlatformConfig,
  userRoundIndices, activeNavRound, scrollToRound,
  showScrollBottom, showScrollTop, scrollToBottom,
  askMultiSelect, askChecked, askSingle, askShowText, askText, askSupplement, onAskSubmit, onAskSkip,
  confirmCurrentPage, confirmMultiSelect, confirmChecked, confirmSingle, confirmShowText,
  confirmText, confirmSupplement, onConfirmSkip, onConfirmNext,
} = useChat();
const askSupplementOpen = ref(false);
const confirmSupplementOpen = ref(false);
const document = window.document;
const router = useRouter();

// ask_user / confirm_user 表单出现时自动滚动到底部
watch(
  () => !!store.pendingQuestion || !!store.pendingConfirmation,
  (show) => {
    if (show) {
      nextTick(() => {
        setTimeout(() => {
          const el = messagesRef.value;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }, 50);
      });
    }
  },
);

// 流式过程中：智能体思考过程区域限高后，自动滚到底部以看到最新工具调用进度
watch(
  messageRounds,
  () => {
    if (!store.streaming) return;
    nextTick(() => {
      const all = messagesRef.value?.querySelectorAll<HTMLElement>('.agent-process-steps');
      const last = all?.[all.length - 1];
      if (last) last.scrollTop = last.scrollHeight;
    });
  },
  { flush: 'post' },
);

/** 从工具结果文本中检测目录绝对路径，用于「浏览文件」 */
function detectGitPath(text: unknown): string | null {
  if (text == null) return null;
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  const m = s.match(/(?:[A-Za-z]:[\\/][^\s"'<>|]+)|(?:\/(?:home|Users|root|tmp|opt|var|src|projects|code|workspace)[^\s"'<>|]*)/);
  return m ? m[0].replace(/["',]+$/, '') : null;
}
function openInGit(path: string) {
  const settingsStore = useSettingsStore();
  settingsStore.update({ workspaceDir: path });
  const repoName = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Git';
  store.openTab({ kind: 'git', name: repoName, repoPath: path });
}

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

/** 取整轮所有 assistant 消息产出的交付文件（按真实消息 id 集合过滤）
 *  交付文件在 chat.ts 中以产生 file_write 工具调用的那条助手消息真实 id 注册，
 *  该消息通常带 toolCalls 属于中间步骤，故需收集整轮 steps 的 messageId 命中过滤，
 *  而非仅用合成的 finalAssistant.id（永远匹配不到真实 messageId）。
 */
function getRoundDeliverableFiles(round: MessageRound) {
  const ids = new Set<string>();
  round.steps.forEach((s) => { if (s.messageId) ids.add(s.messageId); });
  if (round.finalAssistant?.id) ids.add(round.finalAssistant.id);
  return fileStore.filesByCategory.deliverable.filter((f) => f.messageId && ids.has(f.messageId));
}

/** 智能体思考过程是否展开：流式过程中强制展开（让工具调用进度实时可见），结束后由用户控制可折叠 */
function isProcessOpen(round: MessageRound, ri: number): boolean {
  return !!expandedAgentProcess['round-' + ri] || isLastRoundStreaming(round, ri);
}

/** 获取当前流式 step 的实时正文内容（跑马灯式逐步增长的 partialContent） */
function getStreamingText(round: MessageRound, ri: number): string {
  const step = getStreamingStep(round, ri);
  return step?.partialContent || '';
}

/** 获取当前流式 step 的实时思考内容 */
function getStreamingReasoning(round: MessageRound, ri: number): string {
  const step = getStreamingStep(round, ri);
  return step?.reasoningContent || '';
}

/** 流式渲染：正文 markdown + 末尾闪烁光标（跑马灯进行中指示） */
function renderStreamingContent(content: string): string {
  return renderAssistantMarkdown(content) + '<span class="streaming-cursor" aria-hidden="true"></span>';
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
      return { width: max + 'px', height: '2.5px', backgroundColor: activeColor, boxShadow: '0 0 4px color-mix(in srgb, var(--color-primary) 40%, transparent)' };
    }
    return { width: normal + 'px', height: '1.5px', backgroundColor: normalColor, boxShadow: 'none' };
  }
  const dist = Math.abs(d - hoverPos.value);
  const range = 4;
  const decay = Math.max(0, 1 - dist / range);
  const width = normal + (max - normal) * decay;
  const height = (1.5 + decay).toFixed(2) + 'px';
  const bg = decay > 0.05 ? activeColor : normalColor;
  const shadow = decay > 0.4 ? `0 0 ${(4 * decay).toFixed(1)}px color-mix(in srgb, var(--color-primary) 50%, transparent)` : 'none';
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

<style scoped>
.inline-ask-card {
  display: flex; gap: 10px; margin: 12px auto; padding: 14px 16px;
  max-width: 85%;
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: 16px; border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  animation: inline-ask-in .25s ease-out;
}
@keyframes inline-ask-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.inline-ask-icon {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
  background: var(--color-primary, #6366f1); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}
.inline-ask-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.inline-ask-step { font-size: 12px; color: var(--el-text-color-secondary, #888); }
.inline-ask-question { font-size: 14px; font-weight: 500; color: var(--el-text-color-primary, #fff); line-height: 1.5; }
.inline-ask-desc { font-size: 13px; color: var(--el-text-color-secondary, #aaa); line-height: 1.4; }
.inline-ask-options { display: flex; flex-wrap: wrap; gap: 8px; }
.inline-ask-opt {
  padding: 6px 14px; border: 1px solid var(--el-border-color, #2d2d3a); border-radius: 8px;
  background: transparent; color: var(--el-text-color-regular, #ccc); font-size: 13px; cursor: pointer; transition: all .15s;
}
.inline-ask-opt:hover { border-color: var(--color-primary, #6366f1); color: var(--color-primary, #6366f1); }
.inline-ask-opt.is-active { border-color: var(--color-primary, #6366f1); background: var(--color-primary, #6366f1); color: #fff; }
.inline-ask-opt-text { font-style: italic; }
.inline-ask-supplement { margin-top: 4px; }
.inline-ask-toggle { align-self: flex-start; padding: 2px 8px; border: none; background: transparent; color: var(--color-text-secondary, #888); font-size: 12px; cursor: pointer; border-radius: 6px; transition: all .15s; }
.inline-ask-toggle:hover { color: var(--color-primary, #6366f1); background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
.inline-ask-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

/* 流式跑马灯：实时正文容器 */
.streaming-content {
  position: relative;
  will-change: contents;
  contain: content;
}
/* 末尾闪烁光标（v-html 内，需 :deep 穿透）；暗色主题下用主色 + 发光确保对比度 */
.streaming-content :deep(.streaming-cursor) {
  display: inline-block;
  width: 8px;
  height: 1.1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--color-primary, #6366f1);
  border-radius: 1px;
  box-shadow: 0 0 6px color-mix(in srgb, var(--color-primary) 55%, transparent);
  animation: streamingBlink 1.1s ease-in-out infinite;
}
@keyframes streamingBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
}
/* 流式思考：淡显，暗色主题下提升正文对比度 */
.streaming-reasoning {
  border-color: color-mix(in srgb, var(--color-primary) 28%, transparent);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.streaming-reasoning .reasoning-header { color: var(--color-primary, #8B5CF6); }
.streaming-reasoning .reasoning-body { color: var(--color-text-primary, #e5e7eb); }

/* 思考过程区域：平滑出现动画 */
.agent-process-header {
  animation: fadeInDown 0.25s ease-out;
}
.agent-process-steps {
  animation: fadeInDown 0.3s ease-out;
}
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

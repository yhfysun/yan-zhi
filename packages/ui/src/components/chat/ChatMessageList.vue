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
            <el-tooltip v-if="debugMode" content="请求快照" placement="top"><el-button text size="small" circle @click="openSnapshotDialog(round.user)"><el-icon><View /></el-icon></el-button></el-tooltip>
            <el-tooltip content="折叠" placement="top"><el-button text size="small" circle @click.stop="toggleMsgCollapse(round.user.id)"><el-icon><Fold /></el-icon></el-button></el-tooltip>
          </div>
        </div>
      </div>

      <div v-if="round.finalAssistant || round.steps.length > 0" class="msg msg-assistant">
        <div class="msg-avatar avatar-assistant" :class="{ streaming: isLastRoundStreaming(round, ri) }"><el-icon><ChatDotRound /></el-icon></div>
        <div class="msg-body">
          <div class="agent-response-card" :class="{ 'msg-collapsed': collapsedMessages[round.finalAssistant?.id || ''] }" @click="collapsedMessages[round.finalAssistant?.id || ''] ? toggleMsgCollapse(round.finalAssistant?.id || '') : null">
            <div v-show="collapsedMessages[round.finalAssistant?.id || '']" class="msg-collapsed-placeholder">
              <span class="collapsed-line">{{ (round.finalAssistant?.content || '').replace(/\n/g, ' ').slice(0, 120) }}</span>
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
                  <div class="msg-content" v-html="renderMarkdown(displayAssistantContent(round.finalAssistant.content))" @click="handleContentClick"></div>
                  <PlatformConfigCard
                    v-if="parseConfigCard(round.finalAssistant.content)"
                    :mode="parseConfigCard(round.finalAssistant.content)!.mode"
                    :platform="getEditPlatform(round.finalAssistant.content)"
                    :reason="getEditReason(round.finalAssistant.content)"
                    class="msg-config-card"
                    @saved="onConfigSaved"
                  />
                </template>
                <div v-else-if="isLastRoundStreaming(round, ri)" class="msg-content streaming"><span class="cursor">▋</span></div>
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
                  <div v-if="step.partialContent" class="agent-step-partial" v-html="renderMarkdown(step.partialContent)"></div>
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

  <div v-if="showScrollBottom || showScrollTop" class="scroll-nav">
    <button v-if="showScrollTop" class="scroll-nav-btn" @click="scrollToTop" title="回到顶部">
      <el-icon :size="18"><ArrowUp /></el-icon>
    </button>
    <button v-if="showScrollBottom" class="scroll-nav-btn" @click="scrollToBottom" title="回到底部">
      <el-icon :size="18"><ArrowDown /></el-icon>
    </button>
  </div>

  <div v-if="userRoundIndices.length > 1" class="round-nav">
    <div
      v-for="(ri, idx) in userRoundIndices"
      :key="ri"
      class="round-nav-dash"
      :class="{ active: ri === activeNavRound }"
      :title="'跳到提问 #' + (idx + 1)"
      @click="scrollToRound(ri)"
    >
      <span class="dash-line" />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  User, ChatDotRound, CaretRight, CaretBottom, ArrowDown, ArrowRight, Loading, CircleCheck,
  CircleClose, CopyDocument, EditPen, MagicStick, Delete, View, Fold, Refresh, Setting,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import TaskPlanCard from '../TaskPlanCard.vue';
import PlatformConfigCard from '../PlatformConfigCard.vue';

const {
  store, platformStore, messagesRef, messageRounds, formatTime, collapsedMessages, toggleMsgCollapse,
  renderMarkdown, handleContentClick, copyMsg, editMsg, distillUserMsg, delMsg, debugMode,
  openSnapshotDialog, isLastRoundStreaming, displayAssistantContent, parseConfigCard, getEditPlatform,
  getEditReason, onConfigSaved, expandedReasoning, toggleReasoning, expandedAgentProcess,
  toggleAgentProcess, expandedStepTools, toggleStepTools, getStepToolGroupClass, isStepToolsRunning,
  isStepToolsError, toggleTool, getStepToolStatusClass, getStepToolResult, isStepToolError, resolveToolDisplay,
  resolveToolArgs, expandedTools, toggleToolGroup, getToolGroupStatusClass, isToolGroupRunning,
  isToolGroupError, expandedToolGroups, getToolStatusClass, getToolResult, isToolError, distillAssistantMsg, regenerateMsg,
  selectedModelId, input, openPlatformConfig, showScrollBottom, showScrollTop, scrollToTop,
  scrollToBottom, userRoundIndices, activeNavRound, scrollToRound,
} = useChat();
const document = window.document;
</script>

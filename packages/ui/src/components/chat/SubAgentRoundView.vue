<template>
  <div class="sub-agent-round">
    <div class="sub-agent-header" @click="toggleRoot">
      <el-icon :size="13" class="sub-agent-icon"><CaretRight v-if="!rootOpen" /><CaretBottom v-else /></el-icon>
      <span class="sub-agent-name">{{ round.subAgentName || round.subAgentId }}</span>
      <span class="sub-agent-depth">· 第 {{ round.depth }} 层</span>
      <span v-if="isRunning" class="sub-agent-status running">执行中…</span>
      <!-- 概览行的「正在干啥」：只给工具名，不展开步骤树 —— 想看细节再点开 -->
      <code v-if="runningToolName" class="sub-agent-current">{{ runningToolName }}</code>
      <span class="sub-agent-stats">({{ reasoningCount }} 次推理，{{ toolCallCount }} 个工具调用)</span>
      <el-icon :size="11" class="sub-agent-chevron"><ArrowDown v-if="!rootOpen" /><ArrowRight v-else /></el-icon>
    </div>
    <!-- 收起状态下的实时「想什么 / 说什么」（2026-10-24 用户：「思考内容也要能看到，还有响应内容」）。
         ★ 只取**最后一步**的推理与正文：DOM 量恒定，不会像展开整棵步骤树那样拖死界面。 -->
    <div v-if="!rootOpen && isRunning && (tailReasoning || tailContent)" class="sub-agent-tail">
      <div v-if="tailReasoning" class="msg-reasoning">
        <DeepThinkBadge
          state="thinking"
          :chars="tailReasoning.length"
          :open="tailReasoningOpen"
          @toggle="tailReasoningOpen = !tailReasoningOpen"
        />
        <div v-if="tailReasoningOpen" class="reasoning-body">{{ tailReasoning }}</div>
        <div v-else class="dtb-peek">{{ peekText(tailReasoning) }}</div>
      </div>
      <div v-if="tailContent" class="sub-agent-tail-content" v-html="renderMarkdown(tailContent)"></div>
    </div>
    <div v-if="rootOpen" class="sub-agent-body">
      <div v-if="hasHiddenSteps" class="agent-steps-fold">
        <button type="button" class="agent-steps-fold-btn" @click="toggleEarlierSteps">
          {{ showAllSteps ? '收起更早的步骤' : `已折叠更早的 ${hiddenStepCount} 步 · 点击展开` }}
        </button>
      </div>
      <template v-for="(step, si) in round.steps" :key="'sub-' + idPrefix + '-' + si">
      <div v-if="isStepRendered(si)" class="agent-step">
        <div v-if="step.reasoningContent" class="msg-reasoning">
          <div class="reasoning-header" @click="toggleReasoning(idPrefix + '-' + si)">
            <el-icon><CaretRight v-if="!reasoningOpen[idPrefix + '-' + si]" /><CaretBottom v-else /></el-icon>
            <span>推理 {{ si + 1 }}</span>
          </div>
          <div v-if="reasoningOpen[idPrefix + '-' + si]" class="reasoning-body">{{ step.reasoningContent }}</div>
        </div>
        <div v-if="step.partialContent" class="agent-step-partial" v-html="renderMarkdown(step.partialContent)"></div>
        <div v-if="step.toolCalls.length" class="tool-group-card">
          <div class="reasoning-header" @click="toggleStep(idPrefix + '-' + si)" style="color:var(--color-text-secondary)">
            <el-icon :size="14" class="tool-group-dot"><CircleCheck /></el-icon>
            <span>调用 {{ step.toolCalls.length }} 个工具</span>
            <el-icon :size="12" style="margin-left:auto;color:var(--color-text-secondary)"><ArrowDown v-if="stepOpen[idPrefix + '-' + si] !== false" /><ArrowRight v-else /></el-icon>
          </div>
          <div v-if="stepOpen[idPrefix + '-' + si] !== false" class="tool-group-body">
            <div v-for="(tc, idx) in step.toolCalls" :key="idx" class="tool-item">
              <div class="tool-item-header" @click="toggleToolItem(idPrefix + '-' + si + '-' + idx)">
                <div class="tool-item-left">
                  <el-icon :size="12" class="tool-item-status"><CircleCheck /></el-icon>
                  <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                  <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                  <span v-if="toolTargetHint(tc)" class="tool-item-target" :title="toolTargetHint(tc)">{{ toolTargetHint(tc) }}</span>
                </div>
                <el-icon :size="12" class="tool-item-chevron"><ArrowDown v-if="toolOpen[idPrefix + '-' + si + '-' + idx]" /><ArrowRight v-else /></el-icon>
              </div>
              <div v-if="toolOpen[idPrefix + '-' + si + '-' + idx]" class="tool-item-body">
                <div class="tool-item-section">
                  <div class="tool-item-label">参数</div>
                  <pre class="tool-item-json">{{ resolveToolArgs(tc) }}</pre>
                </div>
                <div v-if="getStepResult(step, tc.id)" class="tool-item-section">
                  <div class="tool-item-label">结果</div>
                  <pre class="tool-item-json" :class="{ 'tool-item-json-error': isStepResultError(step, tc.id) }">{{ getStepResult(step, tc.id) }}</pre>
                </div>
                <SubAgentRoundView
                  v-if="tc.toolName === 'call_agent' && getSubRound(step, tc.id)"
                  :round="getSubRound(step, tc.id)!"
                  :id-prefix="idPrefix + '-' + si + '-' + idx"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      </template>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { CaretRight, CaretBottom, ArrowDown, ArrowRight, CircleCheck } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { useChatStore } from '../../stores';
import type { SubAgentRound, AgentStep } from '../../composables/chat/useChat';
import { stepRenderRange, ROUND_STEP_RENDER_LIMIT } from '../../composables/chat/message-rounds';
import DeepThinkBadge from './DeepThinkBadge.vue';

const props = defineProps<{ round: SubAgentRound; idPrefix: string }>();

const { renderMarkdown, resolveToolDisplay, resolveToolArgs, toolTargetHint } = useChat();
const chatStore = useChatStore();

const isRunning = computed(() => chatStore.isToolCallRunning(props.round.toolCallId));

/**
 * 默认**收起**，只留一行概览（名字 · 层数 · 执行中 · N 次推理 / M 个工具调用），
 * 与主智能体的过程摘要同一语义（2026-10-24 用户：「不要默认展开，和外面智能体一样概览就好，
 * 要不然应用又容易卡死」）。
 * ★ 子智能体一次长任务能产出上百步，展开即整棵步骤树进 DOM，流式期间每帧重渲 —— 默认关闭。
 */
const rootOpen = ref(false);
const reasoningOpen = ref<Record<string, boolean>>({});
const stepOpen = ref<Record<string, boolean>>({});
const toolOpen = ref<Record<string, boolean>>({});

/**
 * 子智能体步骤窗口（2026-10-19）：实测一次长任务里子智能体产生 193 步 / 124KB 结果，
 * 全量挂 DOM 会让流式期间每帧重渲整棵树。默认只渲染末尾 40 步，点按钮恢复全量。
 */
const showAllSteps = ref(false);
const stepRange = computed(() => stepRenderRange(props.round.steps.length, showAllSteps.value));
const hiddenStepCount = computed(() => stepRange.value.start);
const hasHiddenSteps = computed(() => props.round.steps.length > ROUND_STEP_RENDER_LIMIT);
function isStepRendered(si: number): boolean {
  return si >= stepRange.value.start && si < stepRange.value.end;
}
function toggleEarlierSteps(): void {
  showAllSteps.value = !showAllSteps.value;
}

function toggleRoot() { rootOpen.value = !rootOpen.value; }
function toggleReasoning(k: string) { reasoningOpen.value[k] = !reasoningOpen.value[k]; }
function toggleStep(k: string) { stepOpen.value[k] = stepOpen.value[k] === false; }
function toggleToolItem(k: string) { toolOpen.value[k] = !toolOpen.value[k]; }

const reasoningCount = computed(() => props.round.steps.filter(s => s.reasoningContent).length);
const toolCallCount = computed(() => props.round.steps.reduce((sum, s) => sum + s.toolCalls.length, 0));

/** 收起态展示的实时片段：取最后一步的推理与正文（只算这两个字符串，成本恒定） */
const lastStep = computed<AgentStep | null>(() => props.round.steps[props.round.steps.length - 1] || null);
const tailReasoning = computed(() => lastStep.value?.reasoningContent || '');
const tailContent = computed(() => lastStep.value?.partialContent || '');
const tailReasoningOpen = ref(false);
/** 思考正文常常几千字，收起态只给尾部 140 字（与主智能体的「跑马灯摘要」同一规则） */
function peekText(text: string): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return flat.length > 140 ? `…${flat.slice(-140)}` : flat;
}

/**
 * 概览行里「正在执行哪个工具」—— 回答"它在干啥"，但**不展开步骤树**。
 * ★ 2026-10-24：默认展开被实报「应用又容易卡死」，改为概览；可事后仍要知道在跑什么。
 */
const runningToolName = computed(() => {
  if (!isRunning.value) return '';
  const steps = props.round.steps;
  for (let si = steps.length - 1; si >= 0; si--) {
    const step = steps[si];
    const tcs = step.toolCalls || [];
    for (let i = tcs.length - 1; i >= 0; i--) {
      const tc = tcs[i];
      const done = (step.toolResults || []).some(r => r.callId === tc.id);
      if (!done) return resolveToolDisplay(tc).tool;
    }
  }
  return '';
});

function getStepResult(step: AgentStep, tcId: string): string | undefined {
  const r = step.toolResults.find(t => t.callId === tcId);
  return r?.content;
}
function isStepResultError(step: AgentStep, tcId: string): boolean {
  const r = step.toolResults.find(t => t.callId === tcId);
  return r?.isError || false;
}
function getSubRound(step: AgentStep, tcId: string): SubAgentRound | undefined {
  return step.subAgentRounds?.find(r => r.toolCallId === tcId);
}
</script>
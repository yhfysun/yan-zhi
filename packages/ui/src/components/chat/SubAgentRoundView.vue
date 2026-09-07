<template>
  <div class="sub-agent-round">
    <div class="sub-agent-header" @click="toggleRoot">
      <el-icon :size="13" class="sub-agent-icon"><CaretRight v-if="!rootOpen" /><CaretBottom v-else /></el-icon>
      <span class="sub-agent-name">{{ round.subAgentName || round.subAgentId }}</span>
      <span class="sub-agent-depth">· 第 {{ round.depth }} 层</span>
      <span v-if="isRunning" class="sub-agent-status running">执行中…</span>
      <span class="sub-agent-stats">({{ reasoningCount }} 次推理，{{ toolCallCount }} 个工具调用)</span>
      <span class="sub-agent-header-actions" @click.stop>
        <el-tooltip content="复制 Markdown" placement="top"><el-button text size="small" circle @click="copySubAgentRoundMd(round)"><el-icon><CopyDocument /></el-icon></el-button></el-tooltip>
        <el-tooltip content="下载为 .md 文件" placement="top"><el-button text size="small" circle @click="downloadSubAgentRoundMd(round)"><el-icon><Download /></el-icon></el-button></el-tooltip>
      </span>
      <el-icon :size="11" class="sub-agent-chevron"><ArrowDown v-if="!rootOpen" /><ArrowRight v-else /></el-icon>
    </div>
    <div v-show="rootOpen" class="sub-agent-body">
      <div v-for="(step, si) in round.steps" :key="'sub-' + idPrefix + '-' + si" class="agent-step">
        <div v-if="step.reasoningContent" class="msg-reasoning">
          <div class="reasoning-header" @click="toggleReasoning(idPrefix + '-' + si)">
            <el-icon><CaretRight v-if="!reasoningOpen[idPrefix + '-' + si]" /><CaretBottom v-else /></el-icon>
            <span>推理 {{ si + 1 }}</span>
          </div>
          <div v-show="reasoningOpen[idPrefix + '-' + si]" class="reasoning-body">{{ step.reasoningContent }}</div>
        </div>
        <div v-if="step.partialContent" class="agent-step-partial" v-html="renderMarkdown(step.partialContent)"></div>
        <div v-if="step.toolCalls.length" class="msg-reasoning" style="background:rgba(15,23,42,0.03);border-color:rgba(15,23,42,0.08)">
          <div class="reasoning-header" @click="toggleStep(idPrefix + '-' + si)" style="color:var(--color-text-secondary)">
            <el-icon :size="14" class="tool-group-dot"><CircleCheck /></el-icon>
            <span>调用 {{ step.toolCalls.length }} 个工具</span>
            <el-icon :size="12" style="margin-left:auto;color:var(--color-text-secondary)"><ArrowDown v-if="stepOpen[idPrefix + '-' + si] !== false" /><ArrowRight v-else /></el-icon>
          </div>
          <div v-show="stepOpen[idPrefix + '-' + si] !== false" class="tool-group-body" style="margin-top:6px;border-top:1px solid rgba(15,23,42,0.06);padding-top:6px">
            <div v-for="(tc, idx) in step.toolCalls" :key="idx" class="tool-item">
              <div class="tool-item-header" @click="toggleToolItem(idPrefix + '-' + si + '-' + idx)">
                <div class="tool-item-left">
                  <el-icon :size="12" class="tool-item-status"><CircleCheck /></el-icon>
                  <span class="tool-item-server">{{ resolveToolDisplay(tc).server }}</span>
                  <code class="tool-item-fn">{{ resolveToolDisplay(tc).tool }}</code>
                </div>
                <el-icon :size="12" class="tool-item-chevron"><ArrowDown v-if="toolOpen[idPrefix + '-' + si + '-' + idx]" /><ArrowRight v-else /></el-icon>
              </div>
              <div v-show="toolOpen[idPrefix + '-' + si + '-' + idx]" class="tool-item-body">
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

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { CaretRight, CaretBottom, ArrowDown, ArrowRight, CircleCheck, CopyDocument, Download } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { useChatStore } from '../../stores';
import type { SubAgentRound, AgentStep } from '../../composables/chat/useChat';

const props = defineProps<{ round: SubAgentRound; idPrefix: string }>();

const { renderMarkdown, resolveToolDisplay, resolveToolArgs, copySubAgentRoundMd, downloadSubAgentRoundMd } = useChat();
const chatStore = useChatStore();

const isRunning = computed(() => chatStore.isToolCallRunning(props.round.toolCallId));

const rootOpen = ref(true);
const reasoningOpen = ref<Record<string, boolean>>({});
const stepOpen = ref<Record<string, boolean>>({});
const toolOpen = ref<Record<string, boolean>>({});

function toggleRoot() { rootOpen.value = !rootOpen.value; }
function toggleReasoning(k: string) { reasoningOpen.value[k] = !reasoningOpen.value[k]; }
function toggleStep(k: string) { stepOpen.value[k] = stepOpen.value[k] === false; }
function toggleToolItem(k: string) { toolOpen.value[k] = !toolOpen.value[k]; }

const reasoningCount = computed(() => props.round.steps.filter(s => s.reasoningContent).length);
const toolCallCount = computed(() => props.round.steps.reduce((sum, s) => sum + s.toolCalls.length, 0));

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
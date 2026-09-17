<!--
  OpsStepCards.vue — 运维 AI 模式的执行步骤卡（openspec 任务 7.6）

  - 数据来源：窗口会话消息（assistant.toolCalls + role=tool 结果消息），**不新增后端**
  - 每张卡：序号 + 工具名 + 状态 + 耗时 + 真实输出（默认折叠，点开看输出）
  - 危险/需确认步骤标「需确认」徽标（生产连接二次确认等，文案由输出/参数里的「确认」判定）
-->
<template>
  <div v-if="steps.length" class="osc" :class="{ 'is-compact': compact }">
    <div class="osc-head">
      <span class="osc-title">执行步骤</span>
      <span class="osc-count">{{ doneCount }}/{{ steps.length }}</span>
      <span class="osc-spacer"></span>
      <button class="osc-toggle" type="button" @click="allOpen = !allOpen">
        {{ allOpen ? '全部收起' : '全部展开' }}
      </button>
    </div>

    <div
      v-for="s in steps"
      :key="s.callId || s.index"
      class="osc-card"
      :class="[`is-${s.status}`, { open: isOpen(s.index) }]"
    >
      <button class="osc-row" type="button" @click="toggle(s.index)">
        <span class="osc-idx">{{ String(s.index).padStart(2, '0') }}</span>
        <span class="osc-name" :title="s.toolName">{{ s.toolName }}</span>
        <span v-if="s.needConfirm" class="osc-badge warn" title="该步骤需要人工确认后才继续">需确认</span>
        <span v-if="s.status === 'running'" class="osc-badge run">执行中</span>
        <span v-else-if="s.status === 'failed'" class="osc-badge fail">失败</span>
        <span v-else class="osc-badge ok">完成</span>
        <span v-if="s.durationMs !== null" class="osc-dur">{{ fmtDuration(s.durationMs) }}</span>
        <el-icon class="osc-caret" :size="12"><ArrowRight /></el-icon>
      </button>
      <div v-show="isOpen(s.index)" class="osc-body">
        <div v-if="s.argsText" class="osc-args">{{ s.argsText }}</div>
        <pre v-if="s.output" class="osc-out">{{ s.output }}</pre>
        <div v-else-if="s.status === 'running'" class="osc-out osc-out-pending">执行中，等待输出…</div>
        <div v-else class="osc-out osc-out-pending">无输出</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import type { OpsStep } from '../../views/plugin/opsSession';

const props = withDefaults(defineProps<{
  steps: OpsStep[];
  /** 紧凑模式（底部折叠条里用） */
  compact?: boolean;
}>(), { compact: false });

const allOpen = ref(false);
const openSet = ref<Set<number>>(new Set());
/** 运行中的步骤默认展开，让用户看到实时输出 */
const autoOpen = computed(() => new Set(props.steps.filter((s) => s.status === 'running').map((s) => s.index)));

function isOpen(i: number): boolean {
  return allOpen.value || autoOpen.value.has(i) || openSet.value.has(i);
}
function toggle(i: number) {
  const s = new Set(openSet.value);
  if (s.has(i)) s.delete(i); else s.add(i);
  openSet.value = s;
}

const doneCount = computed(() => props.steps.filter((s) => s.status !== 'running').length);

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}
</script>

<style scoped>
.osc {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0 2px;
}

.osc-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
}

.osc-title { font-size: 11px; font-weight: 600; color: var(--color-text-tertiary); }
.osc-count { font-size: 10.5px; color: var(--color-text-tertiary); font-family: Consolas, monospace; }
.osc-spacer { flex: 1; }

.osc-toggle {
  border: none; background: transparent; cursor: pointer;
  font-size: 10.5px; font-family: inherit; color: var(--color-primary);
  padding: 0 2px;
}
.osc-toggle:hover { text-decoration: underline; }

.osc-card {
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-surface) 70%, transparent);
}
.osc-card.is-running { border-color: color-mix(in srgb, var(--color-primary) 45%, transparent); }
.osc-card.is-failed { border-color: color-mix(in srgb, var(--el-color-danger, #dc2626) 40%, transparent); }

.osc-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 7px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 11.5px;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}
.osc-row:hover { background: var(--glass-bg-hover); }

.osc-idx {
  font-family: Consolas, monospace;
  font-size: 10px;
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.osc-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Consolas, monospace;
  font-weight: 600;
}

.osc-badge {
  flex-shrink: 0;
  font-size: 9.5px;
  line-height: 14px;
  padding: 0 5px;
  border-radius: 7px;
}
.osc-badge.ok { background: color-mix(in srgb, var(--el-color-success, #16a34a) 15%, transparent); color: var(--el-color-success, #16a34a); }
.osc-badge.run { background: color-mix(in srgb, var(--color-primary) 15%, transparent); color: var(--color-primary); }
.osc-badge.fail { background: color-mix(in srgb, var(--el-color-danger, #dc2626) 15%, transparent); color: var(--el-color-danger, #dc2626); }
.osc-badge.warn { background: color-mix(in srgb, var(--el-color-warning, #c2740b) 18%, transparent); color: var(--el-color-warning, #c2740b); }

.osc-dur { flex-shrink: 0; font-size: 10px; color: var(--color-text-tertiary); font-family: Consolas, monospace; }
.osc-caret { flex-shrink: 0; color: var(--color-text-tertiary); transition: transform 0.15s ease; }
.osc-card.open .osc-caret { transform: rotate(90deg); }

.osc-body {
  border-top: 1px dashed var(--glass-border);
  padding: 6px 8px 8px;
}

.osc-args {
  font-family: Consolas, monospace;
  font-size: 10.5px;
  color: var(--color-text-secondary);
  word-break: break-all;
  margin-bottom: 5px;
}

.osc-out {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-text) 5%, transparent);
  border-radius: 6px;
  padding: 6px 7px;
}
.osc-out-pending { color: var(--color-text-tertiary); font-style: italic; }

/* 紧凑模式（底部折叠条）：限高、字号再小一档 */
.osc.is-compact .osc-out { max-height: 110px; }
.osc.is-compact .osc-row { padding: 4px 6px; }
</style>

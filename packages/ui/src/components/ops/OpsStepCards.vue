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
      <span v-if="failedCount" class="osc-fail">{{ failedCount }} 失败</span>
      <span class="osc-spacer"></span>
      <span class="osc-total">{{ totalText }}</span>
      <button class="osc-toggle" type="button" @click="allOpen = !allOpen">
        {{ allOpen ? '收起' : '展开' }}
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
        <span class="osc-name" :title="fullName(s.toolName)">{{ shortName(s.toolName) }}</span>
        <span
          v-if="s.argsText && summarizeArgs(s.argsText)"
          class="osc-summary"
          :title="s.argsText"
        >{{ summarizeArgs(s.argsText) }}</span>
        <span v-if="s.needConfirm" class="osc-badge warn" title="该步骤需要人工确认后才继续">需确认</span>
        <span v-if="s.status === 'running'" class="osc-badge run">执行中</span>
        <span v-else-if="s.status === 'failed'" class="osc-badge fail">失败</span>
        <span v-else class="osc-badge ok">完成</span>
        <span v-if="s.durationMs !== null" class="osc-dur">{{ fmtDuration(s.durationMs) }}</span>
        <el-icon class="osc-caret" :size="12"><ArrowRight /></el-icon>
      </button>
      <div v-show="isOpen(s.index)" class="osc-body">
        <!-- 命令类工具直接显示**要执行的命令行**（用户要核对的是"它到底跑了什么"），
             其余工具才把 JSON 参数美化展示 -->
        <div v-if="commandOf(s.argsText)" class="osc-cmd">
          <span class="osc-cmd-prompt">$</span>{{ commandOf(s.argsText) }}
        </div>
        <div v-else-if="s.argsText" class="osc-args">{{ prettyArgs(s.argsText) }}</div>
        <!-- 执行结果（2026-10-21 用户实报「执行命令的结果展示啊这些」）：
             此前把工具原始输出整段塞进 <pre> —— 一条 `docker ps` 40 行容器就铺满整屏，
             真正要看的结论反而被淹掉。现在默认只给**摘要**（行数 + 头几行要点），
             原文点「展开完整输出」再看，且限高滚动。 -->
        <template v-if="s.output">
          <div class="osc-out-head">
            <span class="osc-out-meta">{{ outputMeta(s.output) }}</span>
            <button
              v-if="isLongOutput(s.output)"
              type="button"
              class="osc-out-toggle"
              @click.stop="toggleOutput(s.index)"
            >{{ outputOpen.has(s.index) ? '收起输出' : '展开完整输出' }}</button>
          </div>
          <pre v-if="isLongOutput(s.output) && !outputOpen.has(s.index)" class="osc-out osc-out-preview">{{ outputPreview(s.output) }}</pre>
          <pre v-else class="osc-out">{{ s.output }}</pre>
        </template>
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
import { isLongOutput, outputMeta, outputPreview } from './step-output';

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
const failedCount = computed(() => props.steps.filter((s) => s.status === 'failed').length);
const totalText = computed(() => {
  const ms = props.steps.reduce((a, s) => a + (s.durationMs || 0), 0);
  return ms > 0 ? fmtDuration(ms) : '';
});

/** 工具名去插件前缀：plugin_ops-shell__ssh_exec → ssh_exec */
function shortName(name: string): string {
  return (name || 'tool').replace(/^plugin_[\w-]+__/, '');
}
function fullName(name: string): string {
  return name || 'tool';
}
/** 展开态的参数字面量：JSON 缩进后展示（原样一行难读） */
function prettyArgs(args: string): string {
  const raw = (args || '').trim();
  if (!raw) return '';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}
/** 命令类参数（command / cmd / sql）→ 直接给人看的单行文本；非命令类返回空串 */
function commandOf(args: string): string {
  const raw = (args || '').trim();
  if (!raw) return '';
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const v = o.command ?? o.cmd ?? o.sql;
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  } catch { /* 非 JSON：不当命令处理 */ }
  return '';
}
/** 参数摘要：把 JSON 压成「键=值」一行，让每步说清干了什么（原来只有全名与耗时） */
function summarizeArgs(args: string): string {
  const raw = (args || '').trim();
  if (!raw) return '';
  const KEY_PRIORITY = ['command', 'cmd', 'sql', 'container', 'path', 'remotePath', 'localPath', 'name', 'host'];
  const pick = (o: Record<string, unknown>): string => {
    for (const k of KEY_PRIORITY) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.replace(/\s+/g, ' ').trim();
    }
    const first = Object.values(o).find((v) => typeof v === 'string' && v.trim());
    return typeof first === 'string' ? first.replace(/\s+/g, ' ').trim() : '';
  };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return pick(v as Record<string, unknown>).slice(0, 120);
  } catch { /* 非 JSON：按原文截断 */ }
  return raw.replace(/\s+/g, ' ').slice(0, 120);
}

/** 输出折叠/展开态（按步骤序号，本组件内独立，不跨窗口共享） */
const outputOpen = ref<Set<number>>(new Set());
function toggleOutput(i: number) {
  const s = new Set(outputOpen.value);
  if (s.has(i)) s.delete(i); else s.add(i);
  outputOpen.value = s;
}

/** 长输出判定 / 预览 / meta 文案的**实现**在 step-output.ts（纯函数，可单测） */

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
.osc-fail { font-size: 9.5px; color: var(--el-color-danger, #dc2626); }
.osc-spacer { flex: 1; }
.osc-total { font-size: 10px; color: var(--color-text-tertiary); font-family: Consolas, monospace; }

.osc-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  text-align: right;
  padding-left: 6px;
}

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
  flex: 0 1 auto;
  max-width: 45%;
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
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 5px;
}

/* 要执行的命令行：等宽 + 浅色强调条，和「输出」在视觉上分开（一个是我让它跑的，一个是它吐回来的） */
.osc-cmd {
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-all;
  padding: 4px 8px;
  margin-bottom: 5px;
  border-left: 2px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
  border-radius: 0 5px 5px 0;
}
.osc-cmd-prompt { color: var(--color-primary); margin-right: 6px; user-select: none; }

.osc-out {
  margin: 0;
  max-height: 260px;
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
/* 折叠态预览：高度随内容，不再给大块底色（避免"一整屏深色块"的观感） */
.osc-out-preview { max-height: none; }
.osc-out-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 4px;
}
.osc-out-meta {
  font-size: 10px; color: var(--color-text-tertiary);
  font-family: Consolas, monospace;
}
.osc-out-toggle {
  margin-left: auto;
  border: none; background: transparent; padding: 0;
  font-family: inherit; font-size: 10px;
  color: var(--color-primary); cursor: pointer;
}
.osc-out-toggle:hover { text-decoration: underline; }
.osc-out-pending { color: var(--color-text-tertiary); font-style: italic; }

/* 紧凑模式（底部折叠条）：限高、字号再小一档 */
.osc.is-compact .osc-out { max-height: 110px; }
.osc.is-compact .osc-row { padding: 4px 6px; }
</style>

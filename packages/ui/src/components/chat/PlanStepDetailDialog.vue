<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="560px"
    append-to-body
    class="plan-step-dialog"
    @closed="stopPolling"
  >
    <div v-if="loading" class="psd-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>正在加载步骤详情…</span>
    </div>
    <div v-else-if="error" class="psd-error">{{ error }}</div>
    <template v-else-if="detail">
      <div class="psd-head">
        <span class="psd-index">步骤 {{ detail.index }}</span>
        <span class="psd-title">{{ detail.title }}</span>
        <span class="psd-status" :class="'status-' + detail.status">{{ statusLabel }}</span>
      </div>

      <div class="psd-metrics">
        <div class="psd-metric">
          <label>耗时</label>
          <b>{{ detail.timingAvailable ? fmtDuration(detail.durationMs) : '未记录' }}</b>
        </div>
        <div class="psd-metric">
          <label>工具调用</label>
          <b>{{ detail.toolCallCount }} 次</b>
        </div>
        <div v-if="detail.activeMs > 0" class="psd-metric">
          <label>返工累计</label>
          <b>{{ fmtDuration(detail.activeMs) }}</b>
        </div>
        <div v-if="detail.waitMs > 0" class="psd-metric">
          <label>其中等待</label>
          <b>{{ fmtDuration(detail.waitMs) }}</b>
        </div>
      </div>

      <div v-if="!detail.timingAvailable" class="psd-hint">
        该步骤没有计时数据（存量计划），无法按时间窗聚合运行详情。
      </div>
      <div v-if="detail.waitMs > 0" class="psd-hint warn">
        这段等待来自时间窗内长时间没有任何活动（等用户确认 / 等外部响应 / 页面卡住），已从 Top3 的耗时里扣除。
      </div>
      <div v-else-if="detail.containsWait" class="psd-hint warn">
        该步骤耗时超过 10 分钟且期间没有工具调用，可能包含等待（等用户确认 / 等外部响应）。
      </div>

      <ul class="psd-calls">
        <li
          v-for="c in detail.toolCalls"
          :key="c.id"
          class="psd-call"
          :class="{ error: c.isError }"
        >
          <div class="psd-call-head">
            <span class="psd-call-name">{{ c.name }}</span>
            <span v-if="c.subAgentName" class="psd-call-sub">{{ c.subAgentName }}</span>
            <span class="psd-call-dur">{{ fmtDuration(c.durationMs) }}</span>
          </div>
          <div v-if="c.resultPreview" class="psd-call-result">{{ c.resultPreview }}</div>
          <div v-else class="psd-call-result muted">（无结果）</div>
        </li>
        <li v-if="detail.timingAvailable && !detail.toolCalls.length" class="psd-empty">
          该步骤时间窗内没有工具调用。
        </li>
      </ul>
      <div v-if="detail.truncated" class="psd-hint">结果过多，已截断显示。</div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Loading } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import { fmtDuration } from '../../composables/chat/round-timing';

interface PlanStepToolCall {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  isError: boolean;
  resultPreview: string;
  resultLength: number;
  subAgentName?: string;
}

interface PlanStepDetail {
  index: number;
  title: string;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number;
  activeMs: number;
  /** 时间窗内无活动的长间隙之和（等用户/等外部） */
  waitMs: number;
  timingAvailable: boolean;
  containsWait: boolean;
  toolCallCount: number;
  toolCalls: PlanStepToolCall[];
  truncated: boolean;
}

const props = defineProps<{ convId?: string | null }>();

const visible = ref(false);
const loading = ref(false);
const error = ref('');
const detail = ref<PlanStepDetail | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: '待开始', running: '进行中', done: '已完成', failed: '失败',
};
const statusLabel = computed(() => STEP_STATUS_LABEL[detail.value?.status || ''] || detail.value?.status || '');
const dialogTitle = computed(() => (detail.value ? `步骤 ${detail.value.index} 运行详情` : '步骤运行详情'));

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startPolling(index: number) {
  stopPolling();
  pollTimer = setInterval(() => { void fetchDetail(index, true); }, 3000);
}

async function fetchDetail(index: number, silent = false): Promise<void> {
  const convId = String(props.convId || '').trim();
  if (!convId) { error.value = '缺少会话信息，无法加载步骤详情'; return; }
  if (!silent) { loading.value = true; error.value = ''; }
  try {
    const res = await api.get<PlanStepDetail>(`/conversations/${convId}/plan/steps/${index}/detail`);
    if (!('data' in res)) throw new Error(res.error || '加载步骤详情失败');
    detail.value = res.data;
    error.value = '';
    // 运行中的步骤持续刷新，直到它进入终态；静默轮询失败不清空已有内容
    if (res.data?.status === 'running') startPolling(index);
    else stopPolling();
  } catch (e: any) {
    if (!silent) {
      detail.value = null;
      error.value = e?.message || '加载步骤详情失败';
    }
  } finally {
    if (!silent) loading.value = false;
  }
}

/** 供父组件调用：打开并加载某一步（index 从 1 起） */
async function open(index: number): Promise<void> {
  visible.value = true;
  detail.value = null;
  await fetchDetail(index);
}

onBeforeUnmount(stopPolling);

defineExpose({ open });
</script>

<style scoped>
.psd-loading,
.psd-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 4px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.psd-error { color: var(--el-color-danger); }
.psd-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.psd-index {
  flex: none;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.psd-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-word;
}
.psd-status {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}
.psd-status.status-running { color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.psd-status.status-done { color: var(--el-color-success); background: var(--el-color-success-light-9); }
.psd-status.status-failed { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
.psd-metrics {
  display: flex;
  gap: 22px;
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.psd-metric { display: flex; flex-direction: column; gap: 2px; }
.psd-metric label { font-size: 11px; color: var(--el-text-color-secondary); }
.psd-metric b { font-size: 14px; color: var(--el-text-color-primary); }
.psd-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 6px 10px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.psd-hint.warn {
  color: var(--el-color-warning-dark-2, #b88230);
  background: color-mix(in srgb, var(--el-color-warning, #e6a23c) 12%, transparent);
}
.psd-calls {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
}
.psd-call {
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.psd-call + .psd-call { margin-top: 8px; }
.psd-call.error { border-color: var(--el-color-danger-light-5); }
.psd-call-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.psd-call-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
.psd-call-sub {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 0 6px;
  border-radius: 999px;
  background: var(--el-fill-color);
}
.psd-call-dur {
  margin-left: auto;
  flex: none;
  font-size: 12px;
  color: var(--el-color-warning-dark-2, #b88230);
}
.psd-call-result {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  word-break: break-word;
  white-space: pre-wrap;
}
.psd-call-result.muted { color: var(--el-text-color-placeholder); }
.psd-empty {
  padding: 14px 10px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

<!--
  RunMonitor.vue —— 运行面板：订阅 SSE 显示节点级进度 + 最终结果
  - 事件来自 /workflow/runs/:id/stream（node:start / node:ok / node:error / run:completed / run:failed）
  - 只做展示，不持有运行生命周期：runId 由父组件给，关闭订阅由本组件卸载时执行
-->
<template>
  <div class="run-monitor">
    <div class="rm-head">
      <span class="rm-status" :class="`is-${status}`">{{ statusText }}</span>
      <span class="rm-id" :title="runId">{{ runId }}</span>
      <span v-if="elapsed" class="rm-elapsed">{{ elapsed }}ms</span>
      <span class="rm-spacer"></span>
      <span class="rm-count">{{ doneCount }}/{{ nodes.length }} 节点</span>
      <button v-if="status === 'running'" class="rm-cancel" :disabled="cancelling" @click="onCancel">
        {{ cancelling ? '取消中…' : '取消' }}
      </button>
    </div>

    <div class="rm-nodes">
      <div v-for="n in nodes" :key="n.nodeId" class="rm-node" :class="`is-${n.status}`">
        <el-icon :size="13" class="rm-node-icon">
          <Loading v-if="n.status === 'running'" />
          <CircleCheck v-else-if="n.status === 'ok'" />
          <CircleClose v-else-if="n.status === 'error'" />
          <VideoPlay v-else />
        </el-icon>
        <span class="rm-node-id">{{ n.nodeId }}</span>
        <span class="rm-node-type">{{ n.nodeType || '' }}</span>
        <span v-if="n.cost != null" class="rm-node-cost">{{ n.cost }}ms</span>
        <span v-if="n.msg" class="rm-node-msg" :title="n.msg">{{ n.msg }}</span>
      </div>
      <div v-if="!nodes.length" class="rm-empty">等待节点执行…</div>
    </div>

    <div v-if="errorMsg" class="rm-error">{{ errorMsg }}</div>

    <div v-if="result != null" class="rm-result">
      <div class="rm-result-head" @click="resultOpen = !resultOpen">
        <span>运行结果</span>
        <el-icon :size="12"><ArrowDown v-if="resultOpen" /><ArrowRight v-else /></el-icon>
      </div>
      <pre v-if="resultOpen" class="rm-result-body">{{ prettyResult }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Loading, CircleCheck, CircleClose, VideoPlay, ArrowDown, ArrowRight } from '@element-plus/icons-vue';
import { useWorkflowStore } from '../../stores/workflow';
import type { WorkflowRunEvent } from '../../stores/workflow';

const props = defineProps<{ runId: string }>();
const emit = defineEmits<{
  (e: 'finish', payload: { status: 'completed' | 'failed'; result?: Record<string, unknown>; error?: string }): void;
}>();

const wf = useWorkflowStore();

interface NodeState {
  nodeId: string;
  nodeType?: string;
  status: 'pending' | 'running' | 'ok' | 'error';
  startAt?: number;
  endAt?: number;
  cost?: number | null;
  msg?: string;
}

const nodes = ref<NodeState[]>([]);
const status = ref<'running' | 'completed' | 'failed' | 'aborted' | 'paused'>('running');
const result = ref<Record<string, unknown> | null>(null);
const errorMsg = ref('');
const resultOpen = ref(true);
const cancelling = ref(false);
const startedAt = ref(Date.now());
const finishedAt = ref<number | null>(null);

const STATUS_TEXT: Record<string, string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  aborted: '已取消',
  paused: '已暂停（断点）',
};
const statusText = computed(() => STATUS_TEXT[status.value] || status.value);
const doneCount = computed(() => nodes.value.filter((n) => n.status === 'ok' || n.status === 'error').length);
const elapsed = computed(() => ((finishedAt.value ?? Date.now()) - startedAt.value) || 0);
const prettyResult = computed(() => {
  try { return JSON.stringify(result.value, null, 2); } catch { return String(result.value); }
});

let close: (() => void) | null = null;
let lastSeq = 0;

function nodeOf(nodeId: string, nodeType?: string): NodeState {
  let n = nodes.value.find((x) => x.nodeId === nodeId);
  if (!n) {
    n = { nodeId, nodeType, status: 'pending' };
    nodes.value = [...nodes.value, n];
  }
  return n;
}

function onEvent(e: WorkflowRunEvent) {
  if (e.seq && e.seq > lastSeq) lastSeq = e.seq;
  const id = e.nodeId || '__run__';
  if (e.type === 'node:start') {
    const n = nodeOf(id, e.nodeType);
    n.status = 'running';
    n.startAt = Date.now();
  } else if (e.type === 'node:ok') {
    const n = nodeOf(id, e.nodeType);
    n.status = 'ok';
    n.endAt = Date.now();
    n.cost = n.startAt ? n.endAt - n.startAt : null;
  } else if (e.type === 'node:error') {
    const n = nodeOf(id, e.nodeType);
    n.status = 'error';
    n.endAt = Date.now();
    n.cost = n.startAt ? n.endAt - n.startAt : null;
    n.msg = e.msg || '节点失败';
  } else if (e.type === 'run:completed') {
    finish('completed', e.result ?? null);
  } else if (e.type === 'run:paused') {
    finish('paused', e.result ?? null);
  } else if (e.type === 'run:aborted') {
    finish('aborted', null, e.msg || '已取消');
  } else if (e.type === 'run:failed') {
    finish('failed', null, e.msg || '工作流执行失败');
  }
}

function finish(next: typeof status.value, res: Record<string, unknown> | null, err = '') {
  status.value = next;
  finishedAt.value = Date.now();
  result.value = res;
  errorMsg.value = err;
  emit('finish', {
    status: next === 'failed' ? 'failed' : 'completed',
    result: res ?? undefined,
    error: err || undefined,
  });
}

async function onCancel() {
  cancelling.value = true;
  try {
    await wf.cancelRun(props.runId);
    // 事件可能因为「当前这一跳还没结束」稍后才到，这里先乐观置态，避免按钮点了没反应
    status.value = 'aborted';
    finishedAt.value = Date.now();
  } catch (e: any) {
    errorMsg.value = e?.message || '取消失败';
  } finally {
    cancelling.value = false;
  }
}

function subscribe() {
  close?.();
  lastSeq = 0;
  nodes.value = [];
  status.value = 'running';
  result.value = null;
  errorMsg.value = '';
  startedAt.value = Date.now();
  finishedAt.value = null;
  close = wf.subscribeRun(props.runId, 0, onEvent);
}

subscribe();
watch(() => props.runId, () => subscribe());
onBeforeUnmount(() => { close?.(); close = null; });
</script>

<style scoped>
.run-monitor { display: flex; flex-direction: column; gap: 10px; }
.rm-head { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.rm-spacer { flex: 1; }
.rm-status { padding: 1px 8px; border-radius: 10px; font-size: 12px; }
.rm-status.is-running { background: #e6f1fb; color: #185fa5; }
.rm-status.is-completed { background: #eaf3de; color: #3b6d11; }
.rm-status.is-failed { background: #fcebeb; color: #a32d2d; }
.rm-status.is-aborted { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.rm-status.is-paused { background: #faeeda; color: #854f0b; }
.rm-cancel {
  font-size: 12px; padding: 2px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--el-border-color); background: transparent; color: var(--el-text-color-regular);
}
.rm-cancel:hover:not(:disabled) { border-color: var(--el-color-danger); color: var(--el-color-danger); }
.rm-cancel:disabled { opacity: 0.6; cursor: not-allowed; }
.rm-id { color: var(--el-text-color-secondary); font-family: var(--font-mono, monospace); }
.rm-elapsed, .rm-count { color: var(--el-text-color-secondary); }
.rm-nodes {
  display: flex; flex-direction: column; gap: 4px;
  max-height: 220px; overflow: auto; padding: 8px;
  border: 1px solid var(--el-border-color-lighter); border-radius: 8px;
}
.rm-node { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 4px; border-radius: 6px; }
.rm-node.is-running { background: #f5f9ff; }
.rm-node.is-error { background: #fef5f5; }
.rm-node-icon { flex: none; }
.rm-node.is-ok .rm-node-icon { color: #3b6d11; }
.rm-node.is-error .rm-node-icon { color: #a32d2d; }
.rm-node.is-running .rm-node-icon { color: #185fa5; }
.rm-node-id { font-family: var(--font-mono, monospace); }
.rm-node-type { color: var(--el-text-color-secondary); }
.rm-node-cost { color: var(--el-text-color-secondary); }
.rm-node-msg {
  color: #a32d2d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;
}
.rm-empty { font-size: 12px; color: var(--el-text-color-placeholder); padding: 8px; }
.rm-error {
  font-size: 12px; color: #a32d2d; background: #fef5f5; padding: 8px 10px; border-radius: 8px;
}
.rm-result { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; }
.rm-result-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px; font-size: 12px; cursor: pointer; background: var(--el-fill-color-lighter);
}
.rm-result-body {
  margin: 0; padding: 10px; max-height: 320px; overflow: auto;
  font-size: 12px; line-height: 1.6; font-family: var(--font-mono, monospace);
  white-space: pre-wrap; word-break: break-all;
}
</style>

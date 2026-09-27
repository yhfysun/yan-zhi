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

    <!-- 人工确认（human_confirm 节点挂起）：流水线的结构确认点，不确认走不下去 -->
    <div v-if="pendingConfirm" class="rm-confirm">
      <div class="rm-confirm-head">
        <el-icon :size="13"><QuestionFilled /></el-icon>
        <span>需要你确认</span>
        <span v-if="pendingConfirm.nodeId" class="rm-confirm-node">{{ pendingConfirm.nodeId }}</span>
      </div>
      <div v-if="pendingConfirm.question" class="rm-confirm-q">{{ pendingConfirm.question }}</div>

      <!-- 多页向导：逐页回答 -->
      <div v-if="pendingConfirm.pages && pendingConfirm.pages.length" class="rm-confirm-pages">
        <div v-for="(p, i) in pendingConfirm.pages" :key="i" class="rm-confirm-page">
          <div class="rm-confirm-page-q">
            {{ i + 1 }}. {{ p.question }}
            <span v-if="p.required" class="rm-req">*</span>
          </div>
          <div v-if="p.description" class="rm-confirm-page-desc">{{ p.description }}</div>
          <!-- 有选项：点选（多选/单选）-->
          <div v-if="p.options && p.options.length" class="rm-confirm-opts">
            <el-radio-group v-if="!p.multiSelect" v-model="confirmAnswers[i]">
              <el-radio v-for="o in p.options" :key="o" :value="o">{{ o }}</el-radio>
            </el-radio-group>
            <el-checkbox-group v-else v-model="(confirmAnswers as any)[i]">
              <el-checkbox v-for="o in p.options" :key="o" :value="o">{{ o }}</el-checkbox>
            </el-checkbox-group>
          </div>
          <!-- 无选项或允许自由输入：文本框 -->
          <el-input
            v-else
            v-model="confirmAnswers[i]"
            size="small"
            placeholder="填写你的确认内容"
          />
        </div>
      </div>

      <!-- ask 形态：单个回答框 -->
      <el-input
        v-else
        v-model="confirmText"
        type="textarea"
        :rows="3"
        placeholder="输入你的回答"
      />

      <div v-if="pendingConfirm.artifact" class="rm-confirm-artifact">
        待确认产物：<span class="rm-confirm-artifact-name">{{ pendingConfirm.artifact }}</span>
      </div>

      <div class="rm-confirm-actions">
        <!-- 打回：onReject=abort 时后端会中止流水线；retry 则由下游决定重做 -->
        <el-button size="small" :disabled="confirmSubmitting" @click="submitConfirm(true)">
          {{ pendingConfirm.onReject === 'abort' ? '拒绝并中止' : '打回重做' }}
        </el-button>
        <el-button size="small" type="primary" :loading="confirmSubmitting" @click="submitConfirm(false)">
          确认继续
        </el-button>
      </div>
    </div>

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
import { Loading, CircleCheck, CircleClose, VideoPlay, ArrowDown, ArrowRight, QuestionFilled } from '@element-plus/icons-vue';
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

// ── 人工确认（human_confirm 节点）──
interface PendingConfirm {
  runId?: string;
  nodeId?: string;
  callId: string;
  kind?: 'ask' | 'confirm';
  question?: string;
  pages?: Array<{ question?: string; description?: string; options?: string[]; multiSelect?: boolean; allowText?: boolean; allowSupplement?: boolean; required?: boolean }>;
  artifact?: string;
  onReject?: 'retry' | 'abort';
}
const pendingConfirm = ref<PendingConfirm | null>(null);
/** ask 形态的回答文本 */
const confirmText = ref('');
/** confirm 形态（多页向导）的逐页答案 */
const confirmAnswers = ref<Record<number, string>>({});
const confirmSubmitting = ref(false);

/** 提交确认结果：唤醒后端挂起的 human_confirm 节点 */
async function submitConfirm(rejected = false) {
  const pc = pendingConfirm.value;
  if (!pc) return;
  confirmSubmitting.value = true;
  try {
    const answers = (pc.pages || []).map((p, i) => ({
      question: p.question,
      answer: confirmAnswers.value[i] || '',
    }));
    const r = await wf.confirmRun(pc.runId || props.runId, pc.callId, {
      rejected,
      text: confirmText.value,
      answers,
    });
    if (!r.ok) {
      // 409 = 确认已失效（超时/服务重启）→ 如实告知，别静默清掉 UI 让用户以为提交了
      errorMsg.value = r.error || '提交失败';
      return;
    }
    pendingConfirm.value = null;
    confirmText.value = '';
    confirmAnswers.value = {};
    // 恢复执行：状态回到 running，等后续节点事件
    status.value = 'running';
    finishedAt.value = null;
  } finally {
    confirmSubmitting.value = false;
  }
}

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
    // human_confirm 节点挂起：这不是"结束"，而是**在等用户确认**。
    // 必须弹确认区（此前一律当 paused 结束处理 → 用户看到「已暂停」却不知道要回答什么，
    // 流水线永远卡住 —— 这正是 human_confirm 要解决的场景）。
    if (e.pendingConfirm) {
      pendingConfirm.value = e.pendingConfirm as unknown as PendingConfirm;
      status.value = 'paused';
      return;
    }
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
  pendingConfirm.value = null;
  confirmText.value = '';
  confirmAnswers.value = {};
  close = wf.subscribeRun(props.runId, 0, onEvent);
  // ★ 刷新恢复：SSE 重放的是**内存里的事件缓冲**，服务重启过就没有了；
  //   而待确认状态一直在 workflow_run 表里 → 主动查一次，把确认 UI 补回来。
  void wf.fetchPendingConfirm(props.runId).then((pc) => {
    if (pc && !pendingConfirm.value) {
      pendingConfirm.value = pc as unknown as PendingConfirm;
      status.value = 'paused';
    }
  });
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
/* 人工确认区：流水线的结构确认点，视觉上要显眼（用户不理会它整条流水线就停着） */
.rm-confirm {
  border: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;
  font-size: 12px;
}
.rm-confirm-head { display: flex; align-items: center; gap: 6px; font-weight: 600; color: var(--color-primary); }
.rm-confirm-node { font-weight: 400; font-size: 11px; opacity: 0.7; }
.rm-confirm-q { line-height: 1.6; white-space: pre-wrap; }
.rm-confirm-pages { display: flex; flex-direction: column; gap: 10px; }
.rm-confirm-page { display: flex; flex-direction: column; gap: 4px; }
.rm-confirm-page-q { font-weight: 500; line-height: 1.5; }
.rm-confirm-page-desc { font-size: 11px; opacity: 0.75; line-height: 1.5; }
.rm-req { color: #d4380d; }
.rm-confirm-opts { display: flex; flex-wrap: wrap; gap: 4px; }
.rm-confirm-artifact { font-size: 11px; opacity: 0.8; }
.rm-confirm-artifact-name { font-weight: 600; }
.rm-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
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

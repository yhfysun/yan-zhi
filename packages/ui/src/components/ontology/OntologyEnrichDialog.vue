<template>
  <el-dialog
    :model-value="modelValue"
    :title="`AI 富化 · ${ontologyName || ''}`"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @open="load"
  >
    <div class="oe-head">
      <el-button size="small" type="primary" :loading="starting" @click="start">开始富化</el-button>
      <span class="oe-hint">只补没有描述的字段；人工已写的口径不会被覆盖。生成结果是草稿，采纳后才写回本体。</span>
    </div>

    <div v-if="job" class="oe-job">
      <span class="oe-status" :data-status="job.status">{{ statusText }}</span>
      <span class="oe-meta">模型 {{ job.model || '默认' }} · {{ job.done }}/{{ job.total }}</span>
      <span v-if="job.error" class="oe-error">{{ job.error }}</span>
    </div>

    <div v-if="drafts.length" class="oe-actions">
      <el-checkbox :model-value="allChecked" @update:model-value="toggleAll">全选待处理</el-checkbox>
      <span style="flex: 1" />
      <el-button size="small" :disabled="!selectedIds.length" @click="discardSelected">丢弃</el-button>
      <el-button size="small" type="primary" :disabled="!selectedIds.length" :loading="applying" @click="acceptSelected">
        采纳并写回
      </el-button>
    </div>

    <div v-if="drafts.length" class="oe-list">
      <div v-for="d in drafts" :key="d.id" class="oe-item" :data-status="d.status">
        <el-checkbox
          :model-value="selectedIds.includes(d.id)"
          :disabled="d.status !== 'pending'"
          @update:model-value="(v: boolean) => toggleOne(d.id, v)"
        />
        <div class="oe-item-body">
          <div class="oe-item-head">
            <span class="oe-kind">{{ KIND_LABEL[d.kind] || d.kind }}</span>
            <span class="oe-field">{{ d.field_name }}</span>
            <el-tag v-if="d.status !== 'pending'" size="small" :type="d.status === 'accepted' ? 'success' : 'info'">
              {{ d.status === 'accepted' ? '已采纳' : '已丢弃' }}
            </el-tag>
            <el-tag v-else-if="payload(d).source === 'glossary'" size="small" type="warning">术语表</el-tag>
            <span class="oe-conf">置信度 {{ Math.round((d.confidence || 0) * 100) }}%</span>
          </div>
          <div v-if="payload(d).description" class="oe-desc">{{ payload(d).description }}</div>
          <div v-if="payload(d).synonyms?.length" class="oe-syn">同义词：{{ (payload(d).synonyms || []).join('、') }}</div>
        </div>
      </div>
    </div>
    <div v-else class="oe-empty">还没有草稿。点「开始富化」生成建议。</div>

    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';

interface Job {
  id: string; status: 'queued' | 'running' | 'done' | 'error';
  model: string | null; total: number; done: number; error: string | null;
}
interface Draft {
  id: string; job_id: string; kind: string; field_name: string;
  payload_json: string; confidence: number | null; status: 'pending' | 'accepted' | 'discarded';
}

const props = defineProps<{ modelValue: boolean; ontologyId: string; ontologyName?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'applied'): void }>();

const KIND_LABEL: Record<string, string> = { ontology: '本体', dimension: '维度', measure: '度量', time: '时间维度' };

const job = ref<Job | null>(null);
const drafts = ref<Draft[]>([]);
const selectedIds = ref<string[]>([]);
const starting = ref(false);
const applying = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const statusText = computed(() => {
  const s = job.value?.status;
  return s === 'queued' ? '排队中' : s === 'running' ? '生成中…' : s === 'done' ? '已完成' : s === 'error' ? '失败' : '';
});
const allChecked = computed(() => {
  const pending = drafts.value.filter((d) => d.status === 'pending');
  return pending.length > 0 && pending.every((d) => selectedIds.value.includes(d.id));
});

function stopPolling(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

function payload(d: Draft): { description?: string; synonyms?: string[]; source?: string } {
  try { return JSON.parse(d.payload_json || '{}'); } catch { return {}; }
}

function toggleAll(v: boolean): void {
  selectedIds.value = v ? drafts.value.filter((d) => d.status === 'pending').map((d) => d.id) : [];
}
function toggleOne(id: string, v: boolean): void {
  selectedIds.value = v ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter((x) => x !== id);
}

async function load(): Promise<void> {
  if (!props.ontologyId) return;
  const res = await api.get<Job[]>(`/ontologies/${props.ontologyId}/enrich/jobs`);
  if ('error' in res) { ElMessage.error(res.error); return; }
  const list = res.data || [];
  job.value = list[0] || null;
  if (job.value) await loadDrafts(job.value.id);
  else drafts.value = [];
  if (job.value && (job.value.status === 'queued' || job.value.status === 'running')) startPolling();
}

async function loadDrafts(jobId: string): Promise<void> {
  const res = await api.get<{ job: Job; drafts: Draft[] }>(`/ontologies/${props.ontologyId}/enrich/jobs/${jobId}`);
  if ('error' in res) return;
  job.value = res.data.job;
  drafts.value = res.data.drafts || [];
  selectedIds.value = selectedIds.value.filter((id) => drafts.value.some((d) => d.id === id && d.status === 'pending'));
}

function startPolling(): void {
  stopPolling();
  timer = setInterval(async () => {
    if (!job.value) return stopPolling();
    await loadDrafts(job.value.id);
    if (job.value.status !== 'queued' && job.value.status !== 'running') stopPolling();
  }, 2000);
}

async function start(): Promise<void> {
  starting.value = true;
  try {
    const res = await api.post<Job>(`/ontologies/${props.ontologyId}/enrich`, {});
    if ('error' in res) { ElMessage.error(res.error); return; }
    job.value = res.data;
    drafts.value = [];
    selectedIds.value = [];
    startPolling();
  } finally {
    starting.value = false;
  }
}

async function acceptSelected(): Promise<void> {
  if (!selectedIds.value.length) return;
  applying.value = true;
  try {
    const res = await api.post<{ accepted: number; skipped: number }>(
      `/ontologies/${props.ontologyId}/enrich/drafts/accept`, { ids: selectedIds.value },
    );
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success(`已采纳 ${res.data.accepted} 条${res.data.skipped ? `，跳过 ${res.data.skipped} 条（已被人工填写）` : ''}`);
    selectedIds.value = [];
    if (job.value) await loadDrafts(job.value.id);
    emit('applied');
  } finally {
    applying.value = false;
  }
}

async function discardSelected(): Promise<void> {
  if (!selectedIds.value.length) return;
  const res = await api.post<{ discarded: number }>(
    `/ontologies/${props.ontologyId}/enrich/drafts/discard`, { ids: selectedIds.value },
  );
  if ('error' in res) { ElMessage.error(res.error); return; }
  ElMessage.success(`已丢弃 ${res.data.discarded} 条`);
  selectedIds.value = [];
  if (job.value) await loadDrafts(job.value.id);
}

watch(() => props.modelValue, (v) => { if (v) void load(); else stopPolling(); });
onBeforeUnmount(stopPolling);
</script>

<style scoped>
.oe-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.oe-hint { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; }
.oe-job { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; background: var(--glass-bg, rgba(127,127,127,.08)); margin-bottom: 10px; }
.oe-status { font-weight: 600; font-size: 12px; }
.oe-status[data-status="error"] { color: var(--el-color-danger); }
.oe-status[data-status="done"] { color: var(--el-color-success); }
.oe-meta { font-size: 12px; color: var(--color-text-secondary); }
.oe-error { font-size: 12px; color: var(--el-color-danger); }
.oe-actions { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.oe-list { max-height: 420px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.oe-item { display: flex; gap: 10px; padding: 10px; border: 1px solid var(--glass-border); border-radius: 8px; }
.oe-item[data-status="accepted"] { opacity: .7; }
.oe-item[data-status="discarded"] { opacity: .45; }
.oe-item-body { flex: 1; min-width: 0; }
.oe-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.oe-kind { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--glass-bg, rgba(127,127,127,.12)); }
.oe-field { font-weight: 600; font-size: 13px; }
.oe-conf { font-size: 12px; color: var(--color-text-secondary); margin-left: auto; }
.oe-desc { font-size: 13px; margin-top: 4px; line-height: 1.5; }
.oe-syn { font-size: 12px; color: var(--color-text-secondary); margin-top: 3px; }
.oe-empty { text-align: center; color: var(--color-text-secondary); padding: 24px 0; font-size: 13px; }
</style>

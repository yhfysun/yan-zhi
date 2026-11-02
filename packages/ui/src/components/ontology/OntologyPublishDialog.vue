<template>
  <el-dialog
    :model-value="modelValue"
    :title="`发布预检 · ${ontologyName || ''}`"
    width="680px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @open="load"
  >
    <div v-if="loading" class="op-empty">正在检查影响面…</div>
    <div v-else-if="error" class="op-empty">{{ error }}</div>
    <template v-else-if="data">
      <div class="op-head">
        <span class="op-version">发布后版本 v{{ data.version + 1 }}</span>
        <span class="op-sub">{{ data.publishedAt ? `上次发布 ${new Date(data.publishedAt).toLocaleString('zh-CN')}` : '首次发布' }}</span>
      </div>

      <div v-if="!data.baselineExists" class="op-note">首次发布：以下字段将对智能体可见。</div>
      <div v-else-if="!data.diff.length" class="op-note">口径无变化，仅版本 +1。</div>

      <div v-if="data.diff.length" class="op-diff">
        <div class="op-diff-title">口径变更（{{ data.diff.length }}）</div>
        <div v-for="(d, i) in data.diff" :key="i" class="op-diff-row" :data-change="d.change">
          <span class="op-sign">{{ d.change === 'added' ? '+' : d.change === 'removed' ? '−' : '±' }}</span>
          <span class="op-kind">{{ KIND[d.kind] || d.kind }}</span>
          <span class="op-name dw-mono">{{ d.name }}</span>
          <span class="op-val">
            <template v-if="d.change === 'changed'">
              <del>{{ d.before || '（空）' }}</del>
              <span class="op-arrow">→</span>
              <ins>{{ d.after || '（空）' }}</ins>
            </template>
            <template v-else>{{ d.after || d.before || '（空）' }}</template>
          </span>
        </div>
      </div>

      <div class="op-agents">
        <div class="op-diff-title">引用本体的智能体（{{ data.agents.length }}）</div>
        <div v-if="!data.agents.length" class="op-empty-inline">没有智能体挂载该本体（或挂载范围为空）。</div>
        <div v-else class="op-agent-tags">
          <el-tag v-for="a in data.agents" :key="a.id" size="small" effect="plain" class="op-agent-tag">{{ a.name }}</el-tag>
        </div>
      </div>

      <div v-if="canRollback" class="op-rollback">
        <span>发布后 24 小时内可回滚到上一次发布（{{ new Date(data.rollbackUntil!).toLocaleString('zh-CN') }} 前）。</span>
        <el-button size="small" text type="warning" :loading="rolling" @click="rollback">回滚到上次发布</el-button>
      </div>
    </template>

    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button size="small" type="primary" :loading="publishing" :disabled="!data" @click="publishNow">
        {{ data ? `确认发布 v${data.version + 1}` : '确认发布' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../../api/client';

interface Impact {
  version: number;
  publishedAt: number | null;
  baselineExists: boolean;
  diff: Array<{ kind: string; name: string; change: 'added' | 'removed' | 'changed'; before?: string; after?: string }>;
  agents: Array<{ id: string; name: string; mounted: boolean }>;
  rollbackUntil: number | null;
}

const props = defineProps<{ modelValue: boolean; ontologyId: string; ontologyName?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'published'): void }>();

const KIND: Record<string, string> = { description: '描述', dimension: '维度', time: '时间', measure: '度量' };

const data = ref<Impact | null>(null);
const loading = ref(false);
const error = ref('');
const publishing = ref(false);
const rolling = ref(false);

const canRollback = computed(() => !!data.value?.rollbackUntil && data.value.rollbackUntil > Date.now());

async function load(): Promise<void> {
  data.value = null;
  error.value = '';
  if (!props.ontologyId) return;
  loading.value = true;
  try {
    const res = await api.get<Impact>(`/ontologies/${props.ontologyId}/impact`);
    if ('error' in res) { error.value = res.error; return; }
    data.value = res.data;
  } finally {
    loading.value = false;
  }
}

async function publishNow(): Promise<void> {
  publishing.value = true;
  try {
    const res = await api.post(`/ontologies/${props.ontologyId}/publish`);
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success('已发布，智能体即刻生效');
    emit('update:modelValue', false);
    emit('published');
  } finally {
    publishing.value = false;
  }
}

async function rollback(): Promise<void> {
  try {
    await ElMessageBox.confirm('回滚会把口径恢复到上一次发布，并产生一个新版本。确认？', '回滚', { type: 'warning' });
  } catch { return; }
  rolling.value = true;
  try {
    const res = await api.post(`/ontologies/${props.ontologyId}/rollback`);
    if ('error' in res) { ElMessage.error(res.error); return; }
    ElMessage.success('已回滚到上一次发布');
    emit('update:modelValue', false);
    emit('published');
  } finally {
    rolling.value = false;
  }
}
</script>

<style scoped>
.op-empty { text-align: center; color: var(--color-text-secondary); padding: 28px 0; font-size: 13px; }
.op-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.op-version { font-size: 14px; font-weight: 600; }
.op-sub { font-size: 12px; color: var(--color-text-secondary); }
.op-note { font-size: 12px; color: var(--color-text-secondary); background: var(--glass-bg, rgba(127,127,127,.08)); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
.op-diff { margin-bottom: 12px; }
.op-diff-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.op-diff-row { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px dashed var(--glass-border); font-size: 12px; }
.op-sign { width: 14px; font-weight: 700; text-align: center; }
.op-diff-row[data-change="added"] .op-sign { color: var(--el-color-success); }
.op-diff-row[data-change="removed"] .op-sign { color: var(--el-color-danger); }
.op-diff-row[data-change="changed"] .op-sign { color: var(--el-color-warning); }
.op-kind { font-size: 11px; color: var(--color-text-secondary); width: 34px; }
.op-name { min-width: 90px; }
.op-val { flex: 1; color: var(--color-text-secondary); }
.op-val del { color: var(--el-color-danger); }
.op-val ins { color: var(--el-color-success); text-decoration: none; }
.op-arrow { margin: 0 4px; }
.op-agents { margin-bottom: 12px; }
.op-agent-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.op-agent-tag { border-color: #d6336c !important; color: #d6336c !important; }
.op-empty-inline { font-size: 12px; color: var(--color-text-secondary); }
.op-rollback { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--color-text-secondary); border-top: 1px solid var(--glass-border); padding-top: 10px; }
</style>

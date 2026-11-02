<template>
  <el-dialog
    :model-value="modelValue"
    title="推断关联"
    width="680px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="load"
  >
    <p class="rs-hint">
      按 <code>xxx_id</code> 命名与目标表主键推断 N:1 关系。多条候选时不会猜；采用后仍需保存本体。
    </p>

    <div v-if="loading" class="rs-empty">正在分析表结构…</div>
    <div v-else-if="!rows.length" class="rs-empty">
      {{ error || '没有可推断的关联（或目标表尚未生成本体）。' }}
    </div>
    <div v-else class="rs-list">
      <div v-for="(r, i) in rows" :key="i" class="rs-item">
        <div class="rs-main">
          <span class="rs-col">{{ r.sourceColumn }}</span>
          <span class="rs-arrow">→</span>
          <span class="rs-target">{{ r.targetTable }}.{{ r.targetColumn }}</span>
          <el-tag size="small" :type="r.confidence >= 0.8 ? 'success' : 'warning'">{{ Math.round(r.confidence * 100) }}%</el-tag>
          <el-tag v-if="!targetCode(r)" size="small" type="info">目标本体未生成</el-tag>
          <el-tag v-if="r.adopted" size="small" type="success">已采用</el-tag>
        </div>
        <div class="rs-reason">{{ r.reason }}</div>
      </div>
    </div>

    <div v-if="rows.length" class="rs-actions">
      <span class="rs-count">共 {{ rows.length }} 条建议</span>
      <span style="flex: 1" />
      <el-button size="small" type="primary" :loading="adopting" @click="adoptAll">全部采用</el-button>
    </div>

    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';

interface Suggestion {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  type: 'N:1';
  confidence: number;
  reason: string;
}
interface Row extends Suggestion { adopted: boolean }
interface OntologyLite { code: string; sourceSql: string }

const props = defineProps<{
  modelValue: boolean;
  datasourceId: string;
  sourceTable: string;
  sourceCode: string;
  existingRelations: Array<{ target: string; sourceAttr: string; targetAttr: string }>;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'adopt', rel: { target: string; sourceAttr: string; targetAttr: string }): void;
}>();

const rows = ref<Row[]>([]);
const ontologies = ref<OntologyLite[]>([]);
const loading = ref(false);
const adopting = ref(false);
const error = ref('');

/** 从 source_sql 里取主表名（生成的本体统一是 `FROM "表"`） */
function tableOf(sql: string): string {
  const m = /FROM\s+["`]?([A-Za-z0-9_$.]+)["`]?/i.exec(String(sql || ''));
  const raw = m ? m[1] : '';
  const bare = raw.includes('.') ? raw.slice(raw.lastIndexOf('.') + 1) : raw;
  return bare.toLowerCase();
}

function targetCode(s: Suggestion): string {
  const want = String(s.targetTable || '').toLowerCase();
  const hit = ontologies.value.find((o) => tableOf(o.sourceSql) === want);
  return hit ? hit.code : '';
}

async function load(): Promise<void> {
  rows.value = [];
  error.value = '';
  if (!props.datasourceId) { error.value = '本体未绑定数据源'; return; }
  loading.value = true;
  try {
    const [sug, onto] = await Promise.all([
      api.get<Suggestion[]>(`/datasources/${props.datasourceId}/relation-suggestions`),
      api.get<OntologyLite[]>(`/ontologies?datasourceId=${encodeURIComponent(props.datasourceId)}`),
    ]);
    if ('error' in onto) ontologies.value = [];
    else ontologies.value = onto.data || [];

    if ('error' in sug) { error.value = sug.error; return; }
    const want = String(props.sourceTable || '').toLowerCase();
    const existing = new Set(props.existingRelations.map((r) => `${r.target}|${r.sourceAttr}|${r.targetAttr}`));
    rows.value = (sug.data || [])
      .filter((s) => String(s.sourceTable).toLowerCase() === want)
      .map((s) => {
        const code = targetCode(s);
        return { ...s, adopted: !!code && existing.has(`${code}|${s.sourceColumn}|${s.targetColumn}`) };
      });
  } finally {
    loading.value = false;
  }
}

function adoptOne(r: Row): boolean {
  if (r.adopted) return false;
  const code = targetCode(r);
  if (!code) return false;
  emit('adopt', { target: code, sourceAttr: r.sourceColumn, targetAttr: r.targetColumn });
  r.adopted = true;
  return true;
}

function adoptAll(): void {
  adopting.value = true;
  try {
    let n = 0;
    for (const r of rows.value) if (adoptOne(r)) n += 1;
    if (n) ElMessage.success(`已加入 ${n} 条关联，保存草稿后生效`);
    else ElMessage.info('没有可采用的建议（目标本体未生成或已采用）');
  } finally {
    adopting.value = false;
  }
}
</script>

<style scoped>
.rs-hint { font-size: 12px; color: var(--color-text-secondary); margin: 0 0 12px; line-height: 1.6; }
.rs-empty { text-align: center; color: var(--color-text-secondary); padding: 28px 0; font-size: 13px; }
.rs-list { display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow: auto; }
.rs-item { border: 1px solid var(--glass-border); border-radius: 8px; padding: 10px 12px; }
.rs-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rs-col { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 600; }
.rs-arrow { color: var(--color-text-secondary); }
.rs-target { font-family: var(--font-mono, monospace); font-size: 13px; }
.rs-reason { font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; }
.rs-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.rs-count { font-size: 12px; color: var(--color-text-secondary); }
</style>

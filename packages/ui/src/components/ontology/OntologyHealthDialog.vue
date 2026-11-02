<template>
  <el-dialog
    :model-value="modelValue"
    title="本体健康度"
    width="720px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="load"
  >
    <div v-if="loading" class="oh-empty">统计中…</div>
    <div v-else-if="error" class="oh-empty">{{ error }}</div>
    <template v-else-if="data">
      <div class="oh-summary">
        <div class="oh-stat"><b>{{ data.summary.count }}</b><span>本体</span></div>
        <div class="oh-stat"><b>{{ pct(data.summary.descriptionRate) }}</b><span>描述覆盖率</span></div>
        <div class="oh-stat"><b>{{ data.summary.missingSamples }}</b><span>缺样本值</span></div>
        <div class="oh-stat"><b>{{ data.summary.missingSynonyms }}</b><span>缺同义词</span></div>
        <div class="oh-stat"><b>{{ data.summary.lowConfidence }}</b><span>低置信度</span></div>
      </div>

      <el-table :data="data.rows" size="small" border max-height="380" :row-class-name="rowClass">
        <el-table-column prop="name" label="本体" min-width="150" show-overflow-tooltip />
        <el-table-column prop="fields" label="字段" width="64" align="right" />
        <el-table-column label="描述覆盖" width="160">
          <template #default="{ row }">
            <div class="oh-rate">
              <div class="oh-bar"><i :style="{ width: pct(row.descriptionRate) }" /></div>
              <span>{{ pct(row.descriptionRate) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="missingSamples" label="缺样本" width="72" align="right" />
        <el-table-column prop="missingSynonyms" label="缺同义词" width="84" align="right" />
        <el-table-column prop="lowConfidence" label="低置信" width="72" align="right" />
        <el-table-column prop="status" label="状态" width="80" />
      </el-table>
      <p class="oh-hint">描述覆盖率低的排前面；建议先补描述，再用「AI 富化」生成样本值与同义词草稿。</p>
    </template>
    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../../api/client';

interface HealthRow {
  id: string; code: string; name: string; status: string;
  fields: number; described: number; descriptionRate: number;
  missingSamples: number; missingSynonyms: number; lowConfidence: number;
}
interface HealthData {
  rows: HealthRow[];
  summary: { count: number; fields: number; described: number; descriptionRate: number; missingSamples: number; missingSynonyms: number; lowConfidence: number };
}

const props = defineProps<{ modelValue: boolean; datasourceId?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const data = ref<HealthData | null>(null);
const loading = ref(false);
const error = ref('');

const pct = (v: number) => `${Math.round((Number(v) || 0) * 100)}%`;
const rowClass = ({ row }: { row: HealthRow }) => (row.descriptionRate < 0.5 ? 'oh-low' : '');

async function load(): Promise<void> {
  data.value = null;
  error.value = '';
  loading.value = true;
  try {
    const q = props.datasourceId ? `?datasourceId=${encodeURIComponent(props.datasourceId)}` : '';
    const res = await api.get<HealthData>(`/ontologies/health${q}`);
    if ('error' in res) { error.value = res.error; return; }
    data.value = res.data;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.oh-empty { text-align: center; color: var(--color-text-secondary); padding: 28px 0; font-size: 13px; }
.oh-summary { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.oh-stat { flex: 1; min-width: 96px; border: 1px solid var(--glass-border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.oh-stat b { font-size: 16px; }
.oh-stat span { font-size: 11.5px; color: var(--color-text-secondary); }
.oh-rate { display: flex; align-items: center; gap: 8px; }
.oh-bar { flex: 1; height: 5px; border-radius: 999px; background: var(--glass-bg, rgba(127,127,127,.15)); overflow: hidden; }
.oh-bar i { display: block; height: 100%; background: var(--dw-brand, #7c3aed); }
.oh-hint { margin: 8px 0 0; font-size: 12px; color: var(--color-text-secondary); }
:deep(.el-table__row.oh-low) { background: #fff8e6; }
</style>

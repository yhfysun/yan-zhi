<!--
图表卡片（build_chart_dsl 产物）
- 只拿到图表定义（.ychart.json）+ 数据文件路径；数据由前端按路径读取，不进模型上下文。
- kind=table 渲染明细，其余渲染 DataChart；数据口径与看板/本体取数共用同一套映射。
-->
<template>
  <div class="cf-card">
    <div class="cf-head">
      <el-icon><TrendCharts /></el-icon>
      <span class="cf-title">{{ dsl.title }}</span>
      <span class="cf-tag">{{ kindLabel }}</span>
      <span v-if="env" class="cf-total">共 {{ env.total }} 条</span>
      <div class="cf-actions">
        <button class="cf-btn" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>
    <div class="cf-body">
      <div v-if="error" class="cf-err">{{ error }}</div>
      <div v-else-if="loading" class="cf-empty">取数中…</div>
      <div v-else-if="dsl.kind === 'table'" class="cf-table">
        <div v-if="!env || !env.rows.length" class="cf-empty">当前条件无数据</div>
        <el-table v-else :data="rows" size="small" height="100%" stripe>
          <el-table-column
            v-for="c in env.columns"
            :key="c"
            :prop="c"
            :label="c"
            min-width="100"
            show-overflow-tooltip
          />
        </el-table>
      </div>
      <div v-else-if="!chart || !chart.points.length" class="cf-empty">当前条件无数据</div>
      <DataChart v-else :spec="spec" :data="chart" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { TrendCharts } from '@element-plus/icons-vue';
import type { ChartDslFile } from '../../utils/chart-file';
import type { ChartData, ChartKind, ChartSpec } from './chart-spec';
import { envelopeToChartData, envelopeToObjects, loadDataFile, type DataFileEnvelope } from '../../utils/data-file';

const DataChart = defineAsyncComponent(() => import('./DataChart.vue'));

const props = defineProps<{ dsl: ChartDslFile }>();

const loading = ref(false);
const error = ref('');
const env = ref<DataFileEnvelope | null>(null);
const chart = ref<ChartData | null>(null);

const kindLabel = computed(() => ({
  line: '折线图', area: '面积图', bar: '柱状图', pie: '饼图', scatter: '散点图', table: '明细表',
}[props.dsl.kind]));

const spec = computed<ChartSpec>(() => ({
  kind: props.dsl.kind as ChartKind,
  dim: props.dsl.dim,
  measure: props.dsl.measures[0] || '',
  ...(props.dsl.measures.length ? { measures: [...props.dsl.measures] } : {}),
  ...(props.dsl.series ? { series: props.dsl.series } : {}),
  ...(props.dsl.percent ? { percent: true } : {}),
}));

const rows = computed(() => (env.value ? envelopeToObjects(env.value) : []));

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  chart.value = null;
  try {
    const data = await loadDataFile(props.dsl.dataPath);
    if (!data) { error.value = '数据文件读取失败（可能已被清理）'; return; }
    env.value = data;
    if (props.dsl.kind !== 'table') {
      chart.value = envelopeToChartData(data, {
        xField: props.dsl.dim,
        measures: props.dsl.measures,
        ...(props.dsl.series ? { seriesField: props.dsl.series } : {}),
        ...(props.dsl.topN ? { topN: props.dsl.topN } : {}),
        ...(props.dsl.percent ? { percent: true } : {}),
      });
    }
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.dsl.dataPath, load);
</script>

<style scoped>
.cf-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-fill-color-blank); margin: 10px 0; overflow: hidden; }
.cf-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.cf-head .el-icon { color: var(--el-color-primary); }
.cf-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.cf-tag { font-size: 11px; color: var(--color-text-secondary); border: 1px solid var(--el-border-color-lighter); border-radius: 4px; padding: 0 5px; }
.cf-total { font-size: 11px; color: var(--color-text-tertiary); }
.cf-actions { margin-left: auto; }
.cf-btn { font-size: 12px; padding: 2px 9px; border-radius: 5px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--color-text-secondary); cursor: pointer; }
.cf-btn:hover { background: var(--btn-bg-hover); color: var(--color-text); }
.cf-body { height: 280px; padding: 8px 10px; }
.cf-table { height: 100%; }
.cf-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: var(--color-text-tertiary); }
.cf-err { font-size: 12px; color: var(--el-color-danger); padding: 6px; white-space: pre-wrap; }
</style>

<!--
看板单卡：按 widget 的 kind 自己取数与渲染。
- chart：POST /query-contract/aggregate（活取数，不存行数据）
- table：POST /query-contract/run 首页 20 行
- text / metric / infographic：静态内容
拖拽与宽度调整由父组件（DashboardPanel）负责，这里只发事件。
-->
<template>
  <div class="dwc-card">
    <div
      class="dwc-head"
      :class="{ dragging }"
      draggable="true"
      @dragstart="$emit('dragstart', $event)"
      @dragend="$emit('dragend', $event)"
    >
      <span class="dwc-grip" title="拖动排序">⠿</span>
      <span class="dwc-title">{{ widget.title || defaultTitle }}</span>
      <div class="dwc-actions">
        <button class="dwc-btn" title="切换宽度" @click="$emit('cycle-width')">{{ widget.pos.w }}/12</button>
        <button class="dwc-btn" title="刷新" :disabled="loading" @click="load">↻</button>
        <button class="dwc-btn danger" title="移除" @click="$emit('remove')">×</button>
      </div>
    </div>

    <div class="dwc-body">
      <div v-if="error" class="dwc-error">{{ error }}</div>

      <template v-else-if="widget.kind === 'chart'">
        <div v-if="loading" class="dwc-empty">取数中…</div>
        <div v-else-if="!chartData || !chartData.points.length" class="dwc-empty">当前条件无数据</div>
        <DataChart v-else :spec="chartSpec" :data="chartData" />
      </template>

      <template v-else-if="widget.kind === 'table'">
        <div v-if="loading" class="dwc-empty">取数中…</div>
        <div v-else-if="!tableRows?.rows.length" class="dwc-empty">当前条件无数据</div>
        <el-table v-else :data="tableRows.rows" size="small" height="100%" stripe>
          <el-table-column
            v-for="c in tableRows.columns"
            :key="c"
            :prop="c"
            :label="c"
            min-width="100"
            show-overflow-tooltip
          />
        </el-table>
      </template>

      <div v-else-if="widget.kind === 'text'" class="dwc-text">{{ widget.text }}</div>

      <div v-else-if="widget.kind === 'metric'" class="dwc-metrics">
        <div v-for="(m, i) in widget.metrics || []" :key="i" class="dwc-metric">
          <div class="dwc-metric-label">{{ m.label }}</div>
          <div class="dwc-metric-value">{{ m.value }}</div>
          <div v-if="m.hint" class="dwc-metric-hint">{{ m.hint }}</div>
        </div>
      </div>

      <InfographicBlock
        v-else-if="widget.kind === 'infographic' && widget.syntax"
        :syntax="widget.syntax"
        :title="widget.title"
        :height="240"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { api } from '../../api/client';
import type { DashboardWidget } from '@yan-zhi/shared';
import type { ChartData, ChartKind, ChartSpec } from '../chat/chart-spec';
import { buildOntologyIntent, ontologyRowsToChartData, type OntologyGrain } from '../chat/ontology-view';

const DataChart = defineAsyncComponent(() => import('../chat/DataChart.vue'));
// 信息图依赖较重，只有真的出现该 widget 时才加载
const InfographicBlock = defineAsyncComponent(() => import('../chat/InfographicBlock.vue'));

const props = defineProps<{ widget: DashboardWidget; dragging?: boolean }>();
defineEmits<{
  (e: 'remove'): void;
  (e: 'cycle-width'): void;
  (e: 'dragstart', ev: DragEvent): void;
  (e: 'dragend', ev: DragEvent): void;
}>();

interface TableResp {
  columns: string[];
  rows: Record<string, unknown>[];
}

const loading = ref(false);
const error = ref('');
const chartData = ref<ChartData | null>(null);
const tableRows = ref<TableResp | null>(null);

const defaultTitle = computed(() => ({
  chart: '图表', table: '明细', text: '文本', metric: '指标', infographic: '信息图',
}[props.widget.kind] || '组件'));

const chartSpec = computed<ChartSpec>(() => {
  const s = (props.widget.spec || {}) as Partial<ChartSpec>;
  return {
    kind: (s.kind || 'bar') as ChartKind,
    dim: String(s.dim || ''),
    measure: String(s.measure || ''),
    ...(s.series ? { series: s.series } : {}),
    ...(s.agg ? { agg: s.agg } : {}),
    ...(s.timeGrain ? { timeGrain: s.timeGrain } : {}),
    ...(s.topN ? { topN: s.topN } : {}),
    ...(s.percent ? { percent: true } : {}),
  };
});

/** 契约 → 取数请求公共字段 */
function baseBody(): Record<string, unknown> | null {
  const c = props.widget.contract;
  if (!c) return null;
  const body: Record<string, unknown> = {};
  if (c.datasourceId) body.datasourceId = c.datasourceId;
  if (c.table) body.table = c.table;
  else if (c.base) body.base = c.base;
  else return null;
  return body;
}

const isOntology = computed(() => props.widget.contract?.mode === 'ontology' && !!props.widget.contract?.ontology);

interface OntRunResp {
  columns: string[];
  rows: Record<string, unknown>[];
}

/** 本体契约：按业务字段名取数（spec 里存的是本体字段名，不是 SQL 列名） */
async function loadOntology(kind: 'chart' | 'table'): Promise<OntRunResp | null> {
  const ontology = props.widget.contract?.ontology;
  if (!ontology) return null;
  const s = (props.widget.spec || {}) as Record<string, unknown>;
  const measures = Array.isArray(s.measures) && s.measures.length
    ? (s.measures as unknown[]).map(String).filter(Boolean)
    : [String(s.measure || '')].filter(Boolean);
  const dim = String(s.dim || '');
  const seriesField = kind === 'chart' && s.series ? String(s.series) : '';
  const isTime = !!s.timeGrain;
  const intent = buildOntologyIntent({
    ...(isTime && dim ? { timeDimension: { name: dim, grain: s.timeGrain as OntologyGrain } } : { dimensions: dim ? [dim] : [] }),
    ...(seriesField ? { dimensions: [dim, seriesField].filter(Boolean) } : {}),
    measures: measures.map((name) => ({ name })),
    limit: kind === 'table' ? 20 : 1000,
  });
  const r = await api.post<OntRunResp>('/query-contract/ontology/run', { ontology, intent });
  if ('error' in r) { error.value = String(r.error); return null; }
  return r.data;
}

async function loadChart(): Promise<void> {
  const s = (props.widget.spec || {}) as Record<string, unknown>;
  if (isOntology.value) {
    const data = await loadOntology('chart');
    if (!data) return;
    const measures = Array.isArray(s.measures) && s.measures.length
      ? (s.measures as unknown[]).map(String).filter(Boolean)
      : [String(s.measure || '')].filter(Boolean);
    chartData.value = ontologyRowsToChartData(data.rows, {
      xField: String(s.dim || ''),
      measures,
      ...(s.series ? { seriesField: String(s.series) } : {}),
      ...(s.topN ? { topN: Number(s.topN) } : {}),
      ...(s.percent ? { percent: true } : {}),
    });
    return;
  }
  const body = baseBody();
  if (!body) { error.value = 'chart widget 缺少取数契约'; return; }
  const spec = chartSpec.value;
  body.dim = spec.dim;
  body.measureCol = spec.measure;
  body.agg = spec.agg || 'sum';
  if (spec.series) body.series = spec.series;
  if (spec.timeGrain) body.timeGrain = spec.timeGrain;
  if (spec.topN) body.topN = spec.topN;
  if (spec.percent) body.percent = true;
  const r = await api.post<ChartData>('/query-contract/aggregate', body);
  if ('error' in r) { error.value = String(r.error); return; }
  chartData.value = r.data;
}

async function loadTable(): Promise<void> {
  if (isOntology.value) {
    const data = await loadOntology('table');
    if (!data) return;
    tableRows.value = { columns: data.columns, rows: data.rows };
    return;
  }
  const body = baseBody();
  if (!body) { error.value = 'table widget 缺少取数契约'; return; }
  body.page = 1;
  body.pageSize = 20;
  const r = await api.post<TableResp>('/query-contract/run', body);
  if ('error' in r) { error.value = String(r.error); return; }
  tableRows.value = r.data;
}

async function load(): Promise<void> {
  if (props.widget.kind !== 'chart' && props.widget.kind !== 'table') return;
  loading.value = true;
  error.value = '';
  try {
    if (props.widget.kind === 'chart') await loadChart();
    else await loadTable();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.widget.id, load);
</script>

<style scoped>
.dwc-card { display: flex; flex-direction: column; height: 100%; min-height: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); overflow: hidden; }
.dwc-head { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--el-border-color-lighter); cursor: grab; }
.dwc-head.dragging { opacity: 0.5; }
.dwc-grip { color: var(--color-text-tertiary); font-size: 12px; }
.dwc-title { flex: 1 1 auto; font-size: 12px; font-weight: 600; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dwc-actions { display: flex; gap: 2px; }
.dwc-btn { border: none; background: transparent; color: var(--color-text-secondary); cursor: pointer; font-size: 12px; padding: 1px 4px; border-radius: 4px; }
.dwc-btn:hover { background: var(--el-fill-color); color: var(--color-text); }
.dwc-btn.danger:hover { color: var(--el-color-danger); }
.dwc-body { flex: 1 1 auto; min-height: 0; padding: 6px 8px; overflow: hidden; }
.dwc-body > * { height: 100%; }
.dwc-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: var(--color-text-tertiary); }
.dwc-error { color: var(--el-color-danger); font-size: 12px; padding: 6px; white-space: pre-wrap; }
.dwc-text { font-size: 13px; line-height: 1.6; color: var(--color-text); white-space: pre-wrap; overflow: auto; }
.dwc-metrics { display: flex; flex-wrap: wrap; gap: 10px; align-content: flex-start; }
.dwc-metric { flex: 1 1 120px; padding: 8px; border-radius: 6px; background: var(--el-fill-color-lighter); }
.dwc-metric-label { font-size: 11px; color: var(--color-text-secondary); }
.dwc-metric-value { font-size: 20px; font-weight: 700; color: var(--color-text); }
.dwc-metric-hint { font-size: 11px; color: var(--color-text-tertiary); }
</style>

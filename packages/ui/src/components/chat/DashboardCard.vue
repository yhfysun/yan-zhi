<!--
看板卡片（.ydash 渲染）
- 12 列网格按 pos 排布；chart/table 活取数，metric/text/infographic 直接渲染。
- 可刷新、可导出 .ydash 源文件；不依赖看板库（静态网格，后续再接拖拽）。
-->
<template>
  <div class="dash-card">
    <div class="dash-head">
      <el-icon class="dash-icon"><DataBoard /></el-icon>
      <span class="dash-title">{{ dash.title }}</span>
      <span class="dash-tag">看板</span>
      <div class="dash-actions">
        <button class="dash-btn" @click="refresh">刷新</button>
        <button class="dash-btn" @click="exportYdash">.ydash</button>
      </div>
    </div>
    <div v-if="dash.description" class="dash-desc">{{ dash.description }}</div>

    <div class="dash-grid">
      <section
        v-for="w in sortedWidgets"
        :key="w.id"
        class="dash-widget"
        :style="gridStyle(w)"
      >
        <header v-if="w.title" class="dw-head">{{ w.title }}</header>
        <div class="dw-body">
          <div v-if="w.kind === 'metric'" class="dw-metrics">
            <div v-for="(m, i) in w.metrics || []" :key="i" class="dw-metric">
              <span class="dw-m-label">{{ m.label }}</span>
              <b class="dw-m-value">{{ m.value }}</b>
              <i v-if="m.hint" class="dw-m-hint">{{ m.hint }}</i>
            </div>
          </div>

          <p v-else-if="w.kind === 'text'" class="dw-text">{{ w.text }}</p>

          <div v-else-if="w.kind === 'chart'" class="dw-chart">
            <div v-if="errors[w.id]" class="dw-err">{{ errors[w.id] }}</div>
            <div v-else-if="!chartData[w.id]" class="dw-empty">取数中…</div>
            <DataChart v-else :spec="w.spec!" :data="chartData[w.id]!" />
          </div>

          <div v-else-if="w.kind === 'table'" class="dw-table">
            <div v-if="errors[w.id]" class="dw-err">{{ errors[w.id] }}</div>
            <div v-else-if="!tables[w.id]?.columns.length" class="dw-empty">取数中…</div>
            <el-table v-else :data="tables[w.id]?.rows || []" size="small" height="100%" stripe>
              <el-table-column
                v-for="c in tables[w.id]?.columns || []"
                :key="c"
                :prop="c"
                :label="c"
                show-overflow-tooltip
              />
            </el-table>
          </div>

          <InfographicBlock
            v-else-if="w.kind === 'infographic'"
            :syntax="w.syntax!"
            :title="w.title"
            :height="220"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive } from 'vue';
import { DataBoard } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import type { ChartData } from './chart-spec';
import type { DocumentDataContract } from '../../utils/document-types';
import type { YdashFile, YdashWidget } from '../../utils/ydash';
import { toYdash } from '../../utils/ydash';

const DataChart = defineAsyncComponent(() => import('./DataChart.vue'));
const InfographicBlock = defineAsyncComponent(() => import('./InfographicBlock.vue'));

const props = defineProps<{ dash: YdashFile }>();

const chartData = reactive<Record<string, ChartData | null>>({});
const tables = reactive<Record<string, { columns: string[]; rows: Array<Record<string, unknown>> }>>({});
const errors = reactive<Record<string, string>>({});

const sortedWidgets = computed(() =>
  [...props.dash.widgets].sort((a, b) => (a.pos.y - b.pos.y) || (a.pos.x - b.pos.x)),
);

function gridStyle(w: YdashWidget) {
  return {
    gridColumn: `${w.pos.x + 1} / span ${Math.min(Math.max(w.pos.w, 1), 12)}`,
    gridRow: `${w.pos.y + 1} / span ${Math.max(w.pos.h, 2)}`,
  };
}

function contractBody(contract: DocumentDataContract) {
  return {
    ...(contract.datasourceId ? { datasourceId: contract.datasourceId } : {}),
    ...(contract.table ? { table: contract.table } : {}),
    ...(contract.base ? { base: contract.base } : {}),
    ...(contract.filters?.length ? { filters: contract.filters } : {}),
  };
}

async function loadChart(w: YdashWidget) {
  const spec = w.spec!;
  const body: Record<string, unknown> = {
    ...contractBody(w.contract || {}),
    dim: spec.dim,
    measureCol: spec.measure,
    agg: spec.agg || 'sum',
  };
  if (spec.series) body.series = spec.series;
  if (spec.timeGrain) body.timeGrain = spec.timeGrain;
  if (spec.topN) body.topN = spec.topN;
  if (spec.percent) body.percent = true;
  const resp = await api.post<ChartData>('/query-contract/aggregate', body);
  if ('error' in resp) { errors[w.id] = String(resp.error); chartData[w.id] = null; return; }
  chartData[w.id] = resp.data;
}

async function loadTable(w: YdashWidget) {
  const body: Record<string, unknown> = {
    ...contractBody(w.contract || {}),
    page: 1,
    pageSize: 100,
  };
  const resp = await api.post<{ columns: string[]; rows: Array<Record<string, unknown>> }>('/query-contract/run', body);
  if ('error' in resp) { errors[w.id] = String(resp.error); return; }
  tables[w.id] = { columns: resp.data.columns || [], rows: resp.data.rows || [] };
}

function loadAll() {
  for (const w of props.dash.widgets) {
    if (w.kind === 'chart') void loadChart(w);
    if (w.kind === 'table') void loadTable(w);
  }
}

function refresh() {
  for (const k of Object.keys(errors)) delete errors[k];
  for (const k of Object.keys(chartData)) delete chartData[k];
  for (const k of Object.keys(tables)) delete tables[k];
  loadAll();
}

function exportYdash() {
  const text = toYdash({
    title: props.dash.title,
    ...(props.dash.description ? { description: props.dash.description } : {}),
    ...(props.dash.variables ? { variables: props.dash.variables } : {}),
    widgets: props.dash.widgets,
  });
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(props.dash.title || 'dashboard').replace(/[\\/:*?"<>|]/g, '_')}.ydash`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

onMounted(loadAll);
</script>

<style scoped>
.dash-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-fill-color-blank); margin: 10px 0; overflow: hidden; }
.dash-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.dash-icon { color: var(--el-color-primary); }
.dash-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.dash-tag { font-size: 11px; color: var(--color-text-secondary); border: 1px solid var(--el-border-color-lighter); border-radius: 4px; padding: 0 5px; }
.dash-actions { margin-left: auto; display: flex; gap: 6px; }
.dash-btn { font-size: 12px; padding: 2px 9px; border-radius: 5px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--color-text-secondary); cursor: pointer; }
.dash-btn:hover { background: var(--btn-bg-hover); color: var(--color-text); }
.dash-desc { padding: 8px 14px 0; font-size: 12px; color: var(--color-text-secondary); }
.dash-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: 56px; gap: 10px; padding: 12px; }
.dash-widget { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: #fff; overflow: hidden; }
.dw-head { padding: 6px 10px; font-size: 12px; font-weight: 600; color: var(--color-text); border-bottom: 1px solid var(--el-border-color-lighter); }
.dw-body { flex: 1 1 auto; min-height: 0; padding: 8px 10px; }
.dw-chart, .dw-table { height: 100%; min-height: 0; }
.dw-metrics { display: flex; flex-wrap: wrap; gap: 12px; height: 100%; align-items: center; }
.dw-metric { display: flex; flex-direction: column; }
.dw-m-label { font-size: 11px; color: var(--color-text-secondary); }
.dw-m-value { font-size: 22px; font-weight: 700; color: var(--color-text); }
.dw-m-hint { font-size: 11px; color: var(--color-text-tertiary); font-style: normal; }
.dw-text { font-size: 13px; line-height: 1.7; color: var(--color-text); white-space: pre-wrap; margin: 0; }
.dw-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: var(--color-text-tertiary); }
.dw-err { font-size: 12px; color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, transparent); border-left: 3px solid var(--color-danger); padding: 6px 8px; }
</style>

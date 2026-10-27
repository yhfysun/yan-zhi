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
        <button class="dash-btn primary" :disabled="!selectedCount" @click="openSave">
          存入看板{{ selectedCount ? `（${selectedCount}）` : '' }}
        </button>
      </div>
    </div>
    <div v-if="dash.description" class="dash-desc">{{ dash.description }}</div>

    <div class="dash-grid">
      <section
        v-for="w in sortedWidgets"
        :key="w.id"
        class="dash-widget"
        :class="{ off: !selected[w.id] }"
        :style="gridStyle(w)"
      >
        <el-checkbox v-model="selected[w.id]" class="dw-pick" size="small" :title="selected[w.id] ? '取消选择' : '选入看板'" />
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

    <el-dialog v-model="saveOpen" title="存入看板" width="380px" append-to-body>
      <div class="dash-save">
        <el-select v-model="dashId" size="small" placeholder="选择看板" style="width: 100%">
          <el-option
            v-for="d in dashStore.list"
            :key="d.id"
            :label="`${d.title}（${d.widgetCount} 个组件）`"
            :value="d.id"
          />
        </el-select>
        <div class="dash-save-new">
          <el-input v-model="newTitle" size="small" placeholder="或新建看板名称" @keyup.enter="createDash" />
          <el-button size="small" :disabled="!newTitle.trim()" @click="createDash">新建</el-button>
        </div>
        <div class="dash-save-tip">
          只存入选中的 {{ selectedCount }} 个组件（取数契约 + 图表定义），打开看板时按当时数据活取。
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="saveOpen = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" :disabled="!dashId" @click="doSave">存入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { DataBoard } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';
import type { ChartData } from './chart-spec';
import type { DocumentDataContract } from '../../utils/document-types';
import type { YdashFile, YdashWidget } from '../../utils/ydash';
import { toDashboardWidget, toYdash } from '../../utils/ydash';
import { buildOntologyIntent, ontologyRowsToChartData, type OntologyGrain } from './ontology-view';
import { envelopeToChartData, envelopeToObjects, loadDataFile } from '../../utils/data-file';
import { useDashboardStore } from '../../stores/dashboard';
import { useChat } from '../../composables/chat/useChat';

const DataChart = defineAsyncComponent(() => import('./DataChart.vue'));
const InfographicBlock = defineAsyncComponent(() => import('./InfographicBlock.vue'));

const props = defineProps<{ dash: YdashFile }>();

const chartData = reactive<Record<string, ChartData | null>>({});
const tables = reactive<Record<string, { columns: string[]; rows: Array<Record<string, unknown>> }>>({});
const errors = reactive<Record<string, string>>({});

// ===== 勾选组件 → 存入右侧看板 =====
const dashStore = useDashboardStore();
const chat = useChat();
const selected = reactive<Record<string, boolean>>({});
for (const w of props.dash.widgets) selected[w.id] = true;
const selectedCount = computed(() => props.dash.widgets.filter((w) => selected[w.id]).length);
const saveOpen = ref(false);
const saving = ref(false);
const dashId = ref('');
const newTitle = ref('');

async function openSave(): Promise<void> {
  saveOpen.value = true;
  newTitle.value = '';
  await dashStore.loadList();
  dashId.value = dashStore.list[0]?.id || '';
}

async function createDash(): Promise<void> {
  const title = newTitle.value.trim();
  if (!title) return;
  const created = await dashStore.create(title);
  if (!created) { ElMessage.error(dashStore.error || '新建看板失败'); return; }
  dashId.value = created.id;
  newTitle.value = '';
}

async function doSave(): Promise<void> {
  if (!dashId.value) return;
  const picked = props.dash.widgets.filter((w) => selected[w.id]);
  if (!picked.length) { ElMessage.warning('先勾选要存入的组件'); return; }
  saving.value = true;
  let saved = 0;
  for (const w of picked) {
    const updated = await dashStore.saveWidget(dashId.value, toDashboardWidget(w));
    if (!updated) break;
    saved += 1;
  }
  saving.value = false;
  if (saved !== picked.length) {
    ElMessage.error(`${dashStore.error || '存入失败'}（已存 ${saved}/${picked.length}）`);
    return;
  }
  saveOpen.value = false;
  ElMessage.success(`已存入看板：${saved} 个组件`);
  chat.store.openTab({ kind: 'dashboard', name: '看板' });
}

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

const isOntology = (c?: DocumentDataContract) => c?.mode === 'ontology' && !!c.ontology;
const isFileContract = (c?: DocumentDataContract) => c?.mode === 'file' && !!c.path;

/** 本体契约：按业务字段名取数（spec 里是本体字段，不是 SQL 列名） */
async function loadOntologyRows(w: YdashWidget, kind: 'chart' | 'table') {
  const spec = (w.spec || {}) as Record<string, unknown>;
  const measures = Array.isArray(spec.measures) && spec.measures.length
    ? (spec.measures as unknown[]).map(String).filter(Boolean)
    : [String(spec.measure || '')].filter(Boolean);
  const dim = String(spec.dim || '');
  const intent = buildOntologyIntent({
    ...(spec.timeGrain && dim
      ? { timeDimension: { name: dim, grain: spec.timeGrain as OntologyGrain } }
      : { dimensions: dim ? [dim] : [] }),
    measures: measures.map((name) => ({ name })),
    limit: kind === 'table' ? 100 : 1000,
  });
  const resp = await api.post<{ columns: string[]; rows: Array<Record<string, unknown>> }>(
    '/query-contract/ontology/run',
    { ontology: w.contract!.ontology, intent },
  );
  if ('error' in resp) { errors[w.id] = String(resp.error); return null; }
  return resp.data;
}

async function loadChart(w: YdashWidget) {
  const spec = w.spec!;
  if (isFileContract(w.contract)) {
    const env = await loadDataFile(w.contract!.path!);
    if (!env) { errors[w.id] = '数据文件读取失败'; chartData[w.id] = null; return; }
    const measures = spec.measures?.length ? spec.measures : [spec.measure];
    chartData[w.id] = envelopeToChartData(env, {
      xField: spec.dim,
      measures,
      ...(spec.series ? { seriesField: spec.series } : {}),
      ...(spec.topN ? { topN: spec.topN } : {}),
      ...(spec.percent ? { percent: true } : {}),
    });
    return;
  }
  if (isOntology(w.contract)) {
    const rows = await loadOntologyRows(w, 'chart');
    if (!rows) { chartData[w.id] = null; return; }
    chartData[w.id] = ontologyRowsToChartData(rows.rows, {
      xField: spec.dim,
      measures: spec.measures?.length ? spec.measures : [spec.measure],
      ...(spec.topN ? { topN: spec.topN } : {}),
      ...(spec.percent ? { percent: true } : {}),
    });
    return;
  }
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
  if (isFileContract(w.contract)) {
    const env = await loadDataFile(w.contract!.path!);
    if (!env) { errors[w.id] = '数据文件读取失败'; return; }
    tables[w.id] = { columns: env.columns, rows: envelopeToObjects(env) };
    return;
  }
  if (isOntology(w.contract)) {
    const rows = await loadOntologyRows(w, 'table');
    if (rows) tables[w.id] = { columns: rows.columns || [], rows: rows.rows || [] };
    return;
  }
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
.dash-btn.primary { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.dash-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dash-desc { padding: 8px 14px 0; font-size: 12px; color: var(--color-text-secondary); }
.dash-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: 56px; gap: 10px; padding: 12px; }
.dash-widget { position: relative; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: #fff; overflow: hidden; }
.dash-widget.off { opacity: 0.5; }
.dw-pick { position: absolute; top: 4px; right: 6px; z-index: 2; }
.dash-save { display: flex; flex-direction: column; gap: 8px; }
.dash-save-new { display: flex; gap: 6px; }
.dash-save-tip { font-size: 12px; color: var(--color-text-tertiary); }
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

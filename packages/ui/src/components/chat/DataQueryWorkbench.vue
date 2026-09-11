<!--
数据浏览工作台（data-query-contract Q1+Q2）
- 表格视图：左侧「列过滤器」按需动态生成；el-table 分页明细（仅参数化 /api/query-contract/run，不走 LLM）
- 视图切换：表格 / 折线 / 柱 / 饼（/api/query-contract/aggregate 分组聚合）
- 主题对齐亮色；工具栏固定顶部，表格区独立滚动
-->
<template>
  <div class="dqw-root">
    <!-- 顶部：来源信息 + 视图切换 -->
    <div class="dqw-toolbar">
      <div class="dqw-head">
        <span class="dqw-source">
          {{ sourceLabel }}
        </span>
        <div class="dqw-dialect-tag" v-if="result?.truncated" title="结果集过大，仅展示当前页">
          已截断
        </div>
        <span v-if="result" class="dqw-count">
          共 {{ result.total >= 0 ? result.total : '-' }} 条
        </span>
      </div>
      <div class="dqw-viewbar">
        <button
          v-for="v in viewModes"
          :key="v.key"
          class="dqw-view-btn"
          :class="{ on: mode === v.key }"
          @click="setMode(v.key)"
        >{{ v.label }}</button>
      </div>
    </div>

    <div v-if="error" class="dqw-error">{{ error }}</div>

    <!-- 过滤器条（可加列）  固定顶部 -->
    <div v-if="mode === 'table'" class="dqw-filters">
      <div class="dqw-filter-label">过滤器</div>
      <div class="dqw-filter-controls">
        <template v-for="active in activeFilterCols" :key="active">
          <div class="dqw-filter-item">
            <span class="dqw-filter-name">{{ displayName(active) }}</span>
            <select
              v-if="hasEnum(active)"
              class="dqw-input"
              :value="filterVals[active] ?? ''"
              @change="onEnumChange(active, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">(全部)</option>
              <option v-for="o in enumOptions(active)" :key="o.label" :value="String(o.raw)">{{ o.label }}</option>
            </select>
            <el-input
              v-else
              class="dqw-input"
              size="small"
              :placeholder="`${active} 等于…`"
              clearable
              :model-value="filterVals[active] ?? ''"
              @change="(v: any) => applyTextFilter(active, v)"
            />
            <el-button size="small" text circle @click="removeFilter(active)" title="移除该过滤">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </template>
        <el-select
          class="dqw-input dqw-add"
          size="small"
          placeholder="+ 加过滤器"
          clearable
          :model-value="''"
          @change="applyAddColumn"
        >
          <el-option v-for="c in addableCols" :key="c" :label="c" :value="c" />
        </el-select>
        <el-button v-if="activeFilterCols.length" size="small" @click="clearFilters">清除</el-button>
      </div>
    </div>

    <!-- 主体 -->
    <div class="dqw-body" :class="{ scrolling: mode === 'table' }">
      <!-- 表格视图 -->
      <template v-if="mode === 'table'">
        <div v-if="loading" class="dqw-empty">查询中…</div>
        <div v-else-if="!result || !result.columns.length" class="dqw-empty">当前条件无数据</div>
        <el-table
          v-else
          class="dqw-table"
          :data="result!.rows"
          height="100%"
          size="small"
          border
          @sort-change="onSort"
        >
          <el-table-column
            v-for="col in result!.columns"
            :key="col"
            :prop="col"
            :label="col"
            sortable="custom"
            show-overflow-tooltip
          />
        </el-table>
        <div v-if="result && result.columns.length" class="dqw-pagebar">
          <el-pagination
            small
            layout="total, sizes, prev, pager, next"
            :total="Math.max(result.total, 0)"
            :page-size="pageSize"
            :current-page="page"
            :page-sizes="[10, 25, 50, 100]"
            :disabled="loading"
            @update:page-size="(s:number)=>changePageSize(s)"
            @update:current-page="(p:number)=>goPage(p)"
          />
        </div>
      </template>

      <!-- 聚合图视图 -->
      <template v-else>
        <div class="dqw-chart-cfg">
          <div class="dqw-cfg-line">
            <span class="dqw-cfg-label">分组(X 轴)</span>
            <el-select v-model="chartDim" size="small" filterable placeholder="选择维度列">
              <el-option v-for="c in aggDimCols" :key="c" :label="c" :value="c" />
            </el-select>
          </div>
          <div class="dqw-cfg-line">
            <span class="dqw-cfg-label">度量(Y 轴)</span>
            <el-select v-model="chartMeasure" size="small" filterable placeholder="选择度量列">
              <el-option v-for="c in chartMeasureCols" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select v-model="chartAgg" size="small" style="width: 120px">
              <el-option label="计数" value="count" />
              <el-option label="求和" value="sum" />
              <el-option label="平均" value="avg" />
              <el-option label="最小" value="min" />
              <el-option label="最大" value="max" />
            </el-select>
            <el-button size="small" type="primary" :loading="aggLoading" @click="loadAgg">生成</el-button>
          </div>
        </div>
        <div v-if="aggLoading" class="dqw-empty">聚合中…</div>
        <div v-else-if="!aggPoints.length" class="dqw-empty">请设 X/Y 后点「生成」，在当前过滤下展示分组聚合</div>
        <div v-else class="dqw-canvas">
          <svg class="dqw-svg" :viewBox="'0 0 600 300'" preserveAspectRatio="xMidYMid meet">
            <!-- 饼 -->
            <template v-if="mode === 'pie'">
              <path
                v-for="(p, i) in pieArcs"
                :key="i"
                :d="p.path"
                :fill="color(i)"
                stroke="#fff" stroke-width="1"
              />
              <g font-size="10" fill="#334155">
                <text
                  v-for="(p, i) in aggPoints" :key="'t'+i"
                  :x="labelX[i]" :y="labelY[i]" text-anchor="middle"
                >{{ shortLabel(p.key) }}</text>
              </g>
            </template>
            <!-- 折线/柱：共用坐标 -->
            <template v-else>
              <line v-for="g in gridLines" :key="'g'+g" :x1="padL" :x2="600-padR" :y1="g" :y2="g" stroke="#e2e8f0" />
              <template v-if="mode === 'bar'">
                <rect
                  v-for="(p, i) in aggPoints" :key="i"
                  :x="barX(i)" :y="barY(p.value)" :width="barW" :height="Math.max(plotH - (barY(p.value)-padT), 0)"
                  :fill="color(i)" rx="1"
                />
              </template>
              <polyline
                v-else
                :points="linePoints" fill="none" stroke="#3b82f6" stroke-width="2"
              />
            </template>
            <g font-size="10" fill="#475569">
              <text v-for="(label, i) in axisLabels" :key="'ax'+i" :x="axisX(i)" y="292" text-anchor="middle">{{ label }}</text>
              <text v-for="t in yTicks" :key="'yt'+t" :x="padL-4" :y="yTickY(t)" text-anchor="end">{{ t }}</text>
            </g>
          </svg>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Close } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import type { DataTabContract } from '../../stores/chat';

interface RunResp {
  columns: string[]; rows: Record<string, unknown>[];
  rowCount: number; total: number; truncated: boolean; sql: string;
  filterSamples?: Array<{ col: string; kind: string; values?: Array<{ label: string; raw: unknown }>; controllable: boolean }>;
}
interface FilterSampleMap { [col: string]: { kind: string; values?: Array<{ label: string; raw: unknown }> } }
interface Point { key: string; value: number }

const props = defineProps<{ contract: DataTabContract }>();

const viewModes = [
  { key: 'table', label: '表格' },
  { key: 'line', label: '折线' },
  { key: 'bar', label: '柱状' },
  { key: 'pie', label: '饼图' },
] as const;
type Mode = typeof viewModes[number]['key'];

const mode = ref<Mode>('table');
const result = ref<RunResp | null>(null);
const loading = ref(false);
const error = ref('');
const page = ref(1);
const pageSize = ref(25);
const sort = ref<{ col: string; dir: 'asc' | 'desc' } | null>(null);

// 列过滤（动态生成）
const samples = ref<FilterSampleMap>({});
const filterVals = ref<Record<string, string>>({});
const activeFilterCols = ref<string[]>([]);
// 可加过滤的列 = 全部列，逐个点击时才去采样控制类型与候选
function addableCols() { return result.value?.columns || []; }

const sourceLabel = computed(() =>
  props.contract.table
    ? `表 ${props.contract.table}`
    : (props.contract.base ? (props.contract.base as string).replace(/\s+/g, ' ').slice(0, 40) : '项目库'));
const initialFilterCols = computed(() => props.contract.filterCols || []);

async function runQuery(opts: { page?: number; size?: number; fetchSamples?: string[] } = {}) {
  const p = opts.page ?? page.value;
  const size = opts.size ?? pageSize.value;
  loading.value = true; error.value = '';
  const body: Record<string, unknown> = {};
  body.datasourceId = props.contract.datasourceId;
  if (props.contract.table) body.table = props.contract.table;
  else if (props.contract.base) body.base = props.contract.base;
  else throw new Error('契约缺少 table 或 base');
  const cleanedFilters = Object.entries(filterVals.value)
    .filter(([, v]) => v !== '' && v != null)
    .map(([col, v]) => ({ col, op: 'eq' as const, value: v }));
  if (cleanedFilters.length) body.filters = cleanedFilters;
  if (sort.value) body.sort = [sort.value];
  body.page = p; body.pageSize = size;
  if (opts.fetchSamples?.length) body.sampleFilters = opts.fetchSamples;
  const resp = await api.post<RunResp>('/query-contract/run', body);
  if ('error' in resp) { error.value = String(resp.error); loading.value = false; return; }
  const data = resp.data;
  result.value = data;
  // 记录采样结果（合并，不覆盖已有）
  if (data.filterSamples?.length) {
    for (const s of data.filterSamples) { samples.value[s.col] = { kind: s.kind, values: s.values }; }
  }
  loading.value = false;
}

async function goPage(p: number) { page.value = p; await runQuery({ page: p }); }
async function changePageSize(s: number) { pageSize.value = s; await runQuery({ size: s, page: 1 }); }
async function onSort({ prop, order }: { prop: string; order: string | null }) {
  sort.value = order ? { col: prop, dir: order === 'ascending' ? 'asc' : 'desc' } : null;
  await runQuery({ page: 1 });
}

function displayName(col: string) { return col; }
function hasEnum(col: string) { return !!(samples.value[col] && (samples.value[col].values || []).length); }
function enumOptions(col: string) { return (samples.value[col]?.values || []); }

/** 从候选列里挑选想加为过滤器的列 */
async function applyAddColumn(col: string) {
  if (!col || activeFilterCols.value.includes(col)) return;
  activeFilterCols.value.push(col);
  filterVals.value[col] = '';
  // 针对新列只采一次样（其余沿用本轮 result），再分页触发一次
  loading.value = true; error.value = '';
  const body: Record<string, unknown> = { page: 1, pageSize: pageSize.value };
  body.datasourceId = props.contract.datasourceId;
  if (props.contract.table) body.table = props.contract.table; else body.base = props.contract.base;
  body.sampleFilters = [col];
  const resp = await api.post<RunResp>('/query-contract/run', body);
  loading.value = false;
  if ('error' in resp) { error.value = String(resp.error); return; }
  if (resp.data.filterSamples) for (const s of resp.data.filterSamples) samples.value[s.col] = { kind: s.kind, values: s.values };
}
function removeFilter(col: string) {
  activeFilterCols.value = activeFilterCols.value.filter((c) => c !== col);
  delete filterVals.value[col];
  void runQuery({ page: 1 });
}
function clearFilters() {
  activeFilterCols.value = []; filterVals.value = {};
  void runQuery({ page: 1 });
}
function onEnumChange(col: string, val: string) {
  filterVals.value[col] = val;
  void runQuery({ page: 1 });
}
function applyTextFilter(col: string, val: unknown) {
  filterVals.value[col] = val == null ? '' : String(val);
  void runQuery({ page: 1 });
}

// ===== Q2 聚合图 =====
const chartDim = ref('');
const chartMeasure = ref('');
const chartAgg = ref<'sum' | 'count' | 'avg' | 'min' | 'max'>('sum');
const aggPoints = ref<Point[]>([]);
const aggLoading = ref(false);
const aggErr = ref('');

// 简单启发：取结果列做维度/度量候选
const aggDimCols = computed(() => result.value?.columns || []);
const chartMeasureCols = computed(() => result.value?.columns || []);

async function loadAgg() {
  if (!chartDim.value || !chartMeasure.value) { error.value = '请先选 X 维度列与 Y 度量列'; return; }
  aggLoading.value = true; error.value = '';
  const body: Record<string, unknown> = { page: 1, pageSize: 0 };
  body.datasourceId = props.contract.datasourceId;
  if (props.contract.table) body.table = props.contract.table; else if (props.contract.base) body.base = props.contract.base;
  const cleanedFilters = Object.entries(filterVals.value)
    .filter(([, v]) => v !== '' && v != null)
    .map(([col, v]) => ({ col, op: 'eq' as const, value: v }));
  if (cleanedFilters.length) body.filters = cleanedFilters;
  body.dim = chartDim.value; body.measureCol = chartMeasure.value; body.agg = chartAgg.value;
  const resp = await api.post<{ points: Point[]; total: number }>('/query-contract/aggregate', body);
  aggLoading.value = false;
  if ('error' in resp) { error.value = String(resp.error); return; }
  aggPoints.value = resp.data.points || [];
}

function setMode(m: Mode) {
  mode.value = m;
  if (m !== 'table' && !chartDim.value) {
    // 默认把当前表第一个非 id 列当维度
    const cols = result.value?.columns || [];
    chartDim.value = cols.find((c) => !/^(id|_id)$/i.test(c)) || cols[0] || '';
    // 度量默认选第一个不是图表已选的列
    chartMeasure.value = cols.find((c) => c !== chartDim.value && !/^created|updated|_at$/i.test(c)) || '';
    if (chartDim.value && chartMeasure.value) void loadAgg();
  }
}

// ===== 轻量 SVG 图渲染（无第三方依赖，深/亮主题内联）=====
const padL = 46, padR = 16, padT = 12, padBottom = 26;
const plotH = 300 - padT - padBottom;

function color(i: number) {
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16', '#6366f1', '#14b8a6'];
  return palette[i % palette.length];
}
const maxVal = computed(() => Math.max(1, ...aggPoints.value.map((p) => p.value)));
const n = computed(() => Math.max(aggPoints.value.length, 1));

function barY(v: number) { return padT + plotH - (v / maxVal.value) * plotH; }
function barX(i: number) { return padL + (i / n.value) * (600 - padL - padR) + 2; }
const barW = computed(() => Math.max((600 - padL - padR) / n.value - 4, 1));
function linePoints() {
  return aggPoints.value
    .map((p, i) => {
      const x = padL + (i / Math.max(n.value - 1, 1)) * (600 - padL - padR);
      return `${x},${barY(p.value)}`;
    })
    .join(' ');
}
const gridLines = computed(() => [0.25, 0.5, 0.75].map((r) => padT + plotH - r * plotH));
const yTicks = computed(() => [0, 0.5, 1].map((r) => Math.round(maxVal.value * r)));
function yTickY(t: number) { return 300 - 6 - ((t / maxVal.value) * plotH); }
const axisLabels = computed(() => aggPoints.value.map((p, i) => (i % Math.ceil(aggPoints.value.length / 8) === 0 ? shortLabel(p.key) : '')));
function axisX(i: number) { return padL + (i / n.value) * (600 - padL - padR) + (600 - padL - padR) / (2 * n.value); }
function shortLabel(k: string) { return k.length > 7 ? k.slice(0, 6) + '…' : k; }

function polar(i: number, inner: number, outer: number) {
  const total = aggPoints.value.reduce((s, p) => s + Math.max(p.value, 0), 1) || 1;
  const start = aggPoints.value.slice(0, i).reduce((s, p) => s + Math.max(p.value, 0), 0) / total;
  const ang = aggPoints.value[i] ? Math.max(aggPoints.value[i].value, 0) / total : 0;
  const a0 = start * 2 * Math.PI - Math.PI / 2;
  const a1 = (start + ang) * 2 * Math.PI - Math.PI / 2;
  const cx = 300, cy = 150, R = 100;
  const p = (a: number, r: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  const large = ang > 0.5 ? 1 : 0;
  const r = inner === 0 ? R : inner;
  const ro = outer === 0 ? R : outer;
  if (ang >= 0.9999) return `M ${cx},${cy} m -${R},0 a ${R},${R} 0 1,1 ${2 * R},0 a ${R},${R} 0 1,1 -${2 * R},0`;
  return `M ${cx},${cy} L ${p(a0, ro)} A ${ro},${ro} 0 ${large} 1 ${p(a1, ro)} Z`;
}
const pieArcs = computed(() =>
  aggPoints.value
    .filter((p) => p.value > 0)
    .map((_, i) => ({ path: polar(i, 0, 0) })));
const labelX = computed(() => aggPoints.value.map(() => 300));
const labelY = computed(() => aggPoints.value.map((_, i) => 170 + i * 16 - Math.max(aggPoints.value.length - 1, 0) * 8));

watch(() => props.contract, () => { resetAll(); }, { deep: true });
function resetAll() {
  mode.value = 'table'; result.value = null; samples.value = {};
  filterVals.value = {}; activeFilterCols.value = initialFilterCols.value.slice(); aggPoints.value = [];
  page.value = 1; sort.value = null; chartDim.value = ''; chartMeasure.value = '';
  aggLoading.value = false; loading.value = false; error.value = '';
  // 有声明过滤器 → 采样 + 带首页数据；无 → 直接首页
  if (initialFilterCols.value.length) { void samplePreset(); } else { void runQuery({ page: 1 }); }
}
async function samplePreset() {
  loading.value = true;
  const body: Record<string, unknown> = { page: 1, pageSize: pageSize.value, sampleFilters: initialFilterCols.value };
  body.datasourceId = props.contract.datasourceId;
  if (props.contract.table) body.table = props.contract.table; else if (props.contract.base) body.base = props.contract.base;
  const resp = await api.post<RunResp>('/query-contract/run', body);
  loading.value = false;
  if (!('error' in resp)) {
    result.value = resp.data;
    if (resp.data.filterSamples) for (const s of resp.data.filterSamples) samples.value[s.col] = { kind: s.kind, values: s.values };
    if (initialFilterCols.value.length) for (const c of initialFilterCols.value) { if (!samples.value[c]) samples.value[c] = { kind: 'text' }; }
  } else error.value = String(resp.error);
}

onMounted(() => { resetAll(); });
</script>

<style scoped>
.dqw-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.dqw-toolbar { flex: 0 0 auto; padding: 10px 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.dqw-head { display: flex; align-items: center; gap: 10px; }
.dqw-source { font-weight: 600; color: var(--color-text); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dqw-dialect-tag { font-size: 11px; color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 12%, transparent); padding: 1px 6px; border-radius: 4px; }
.dqw-count { font-size: 12px; color: var(--color-text-secondary); }
.dqw-viewbar { display: flex; gap: 6px; margin-top: 8px; }
.dqw-view-btn { border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--color-text-secondary); padding: 3px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; }
.dqw-view-btn:hover { background: var(--btn-bg-hover); color: var(--color-text); }
.dqw-view-btn.on { background: var(--el-color-primary); border-color: var(--el-color-primary); color: #fff; }
.dqw-filters { flex: 0 0 auto; display: flex; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--el-border-color-lighter); align-items: flex-start; flex-wrap: wrap; background: var(--el-fill-color-lighter); }
.dqw-filter-label { font-size: 12px; color: var(--color-text-secondary); padding-top: 5px; }
.dqw-filter-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.dqw-filter-item { display: flex; align-items: center; gap: 4px; border: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-blank); border-radius: 6px; padding: 1px 2px 1px 6px; }
.dqw-filter-name { font-size: 12px; color: var(--color-text); font-weight: 600; }
.dqw-input :deep(.el-input__wrapper), .dqw-input { font-size: 12px; }
.dqw-input { width: 150px; }
.dqw-add { width: 130px; }
.dqw-body { flex: 1 1 auto; min-height: 0; position: relative; }
.dqw-body.scrolling { overflow: hidden; }
.dqw-table { height: 100%; }
.dqw-pagebar { flex: 0 0 auto; padding: 6px 0; border-top: 1px solid var(--el-border-color-lighter); display: flex; justify-content: flex-end; }
.dqw-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-tertiary); font-size: 13px; padding: 24px; }
.dqw-error { flex: 0 0 auto; color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, transparent); border-left: 3px solid var(--color-danger); padding: 6px 10px; font-size: 12px; white-space: pre-wrap; }
.dqw-chart-cfg { padding: 8px 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.dqw-cfg-line { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dqw-cfg-label { width: 86px; font-size: 12px; color: var(--color-text-secondary); flex: 0 0 auto; }
.dqw-cfg-line :deep(.el-select) { width: 200px; }
.dqw-canvas { height: 100%; display: flex; align-items: center; justify-content: center; padding: 8px; box-sizing: border-box; }
.dqw-svg { width: 100%; height: 100%; max-height: 300px; }
</style>

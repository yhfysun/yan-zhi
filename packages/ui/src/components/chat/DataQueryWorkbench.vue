<!--
数据浏览工作台（data-query-contract Q1+Q2）
- 表格视图：左侧「列过滤器」按需动态生成；el-table 分页明细（仅参数化 /api/query-contract/run，不走 LLM）
- 图表视图：ECharts（按需懒加载）。支持多系列、时间粒度、TopN、占比；导出 PNG
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
          v-for="v in modeOptions"
          :key="v.key"
          class="dqw-view-btn"
          :class="{ on: mode === v.key }"
          @click="setMode(v.key)"
        >{{ v.label }}</button>
        <el-select
          v-if="mode === 'table' && columnOptions.length > 4"
          v-model="visibleCols"
          multiple
          collapse-tags
          collapse-tags-tooltip
          size="small"
          class="dqw-colsel"
          placeholder="显示列"
        >
          <el-option v-for="c in columnOptions" :key="c" :label="c" :value="c" />
        </el-select>
        <div class="dqw-export">
          <el-button size="small" @click="openPin">钉到看板</el-button>
          <el-button size="small" :loading="exporting === 'word'" @click="exportWord">导出 Word</el-button>
          <el-button size="small" :loading="exporting === 'excel'" @click="exportExcel">导出 Excel</el-button>
        </div>
      </div>
    </div>

    <div v-if="error" class="dqw-error">{{ error }}</div>

    <!-- 本体模式：按业务字段名取数（无自由 SQL） -->
    <div v-if="isOntologyMode" class="dqw-ont">
      <span class="dqw-cfg-label">本体</span>
      <el-select v-model="ontologyRef" filterable size="small" placeholder="选择本体" style="width: 200px" @change="onOntPick">
        <el-option v-for="o in ontologies" :key="o.code" :label="o.name" :value="o.code" />
      </el-select>
      <template v-if="menu">
        <span class="dqw-cfg-label">时间</span>
        <el-select v-model="ontTime" size="small" filterable clearable placeholder="不取" style="width: 140px">
          <el-option v-for="t in menu.timeDimensions" :key="t.name" :label="t.name" :value="t.name" />
        </el-select>
        <el-select v-if="ontTime" v-model="ontGrain" size="small" clearable placeholder="原始" style="width: 80px">
          <el-option label="日" value="day" />
          <el-option label="周" value="week" />
          <el-option label="月" value="month" />
          <el-option label="季" value="quarter" />
          <el-option label="年" value="year" />
        </el-select>
        <span class="dqw-cfg-label">维度</span>
        <el-select
          v-model="ontDims"
          multiple
          collapse-tags
          collapse-tags-tooltip
          filterable
          clearable
          size="small"
          placeholder="不分组"
          style="width: 180px"
        >
          <el-option v-for="d in menu.dimensions" :key="d.name" :label="d.name" :value="d.name" />
        </el-select>
        <span class="dqw-cfg-label">度量</span>
        <el-select
          v-model="ontMeasures"
          multiple
          collapse-tags
          collapse-tags-tooltip
          filterable
          clearable
          size="small"
          placeholder="不取度量"
          style="width: 180px"
        >
          <el-option v-for="m in menu.measures" :key="m.name" :label="m.name" :value="m.name" />
        </el-select>
        <el-select
          v-if="menu.filters.length"
          v-model="ontFilters"
          multiple
          collapse-tags
          collapse-tags-tooltip
          size="small"
          placeholder="过滤器"
          style="width: 150px"
        >
          <el-option v-for="f in menu.filters" :key="f.name" :label="f.name" :value="f.name" />
        </el-select>
        <el-select v-model="ontLimit" size="small" style="width: 92px">
          <el-option label="200 行" :value="200" />
          <el-option label="500 行" :value="500" />
          <el-option label="1000 行" :value="1000" />
        </el-select>
        <el-button size="small" type="primary" :loading="loading" @click="runOntology">查询</el-button>
      </template>
      <span v-if="menu?.description" class="dqw-ont-desc" :title="menu.description">{{ menu.description }}</span>
    </div>

    <!-- 过滤器条（可加列）  固定顶部 -->
    <div v-if="mode === 'table' && !isOntologyMode" class="dqw-filters">
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
          stripe
          highlight-current-row
          @sort-change="onSort"
        >
          <el-table-column
            v-for="col in visibleCols"
            :key="col"
            :prop="col"
            :label="col"
            :width="columnMeta[col]?.width"
            :align="columnMeta[col]?.align || 'left'"
            sortable="custom"
            show-overflow-tooltip
            :formatter="(_row: any, _col: any, value: any) => formatCell(value)"
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

      <!-- 图表视图 -->
      <template v-else>
        <div class="dqw-chart-cfg">
          <div class="dqw-cfg-line">
            <span class="dqw-cfg-label">图种</span>
            <el-select v-model="chartKind" size="small" style="width: 96px">
              <el-option label="折线" value="line" />
              <el-option label="面积" value="area" />
              <el-option label="柱状" value="bar" />
              <el-option label="饼图" value="pie" />
              <el-option label="散点" value="scatter" />
            </el-select>
            <span class="dqw-cfg-label">分组(X)</span>
            <el-select
              v-if="isOntologyMode"
              v-model="chartOntX"
              size="small"
              filterable
              placeholder="维度"
              style="width: 150px"
            >
              <el-option-group v-if="menu?.timeDimensions.length" label="时间维度">
                <el-option v-for="t in menu.timeDimensions" :key="t.name" :label="t.name" :value="t.name" />
              </el-option-group>
              <el-option v-for="d in menu?.dimensions || []" :key="d.name" :label="d.name" :value="d.name" />
            </el-select>
            <el-select v-else v-model="chartDim" size="small" filterable placeholder="维度列" style="width: 150px">
              <el-option v-for="c in result?.columns || []" :key="c" :label="c" :value="c" />
            </el-select>
            <template v-if="!isOntologyMode">
              <span class="dqw-cfg-label">系列</span>
              <el-select v-model="chartSeries" size="small" filterable clearable placeholder="不分组" style="width: 130px">
                <el-option v-for="c in seriesCols" :key="c" :label="c" :value="c" />
              </el-select>
            </template>
            <span class="dqw-cfg-label">度量(Y)</span>
            <el-select
              v-if="isOntologyMode"
              v-model="chartOntMeasures"
              multiple
              collapse-tags
              collapse-tags-tooltip
              filterable
              size="small"
              placeholder="度量"
              style="width: 190px"
            >
              <el-option v-for="m in menu?.measures || []" :key="m.name" :label="m.name" :value="m.name" />
            </el-select>
            <el-select v-else v-model="chartMeasure" size="small" filterable placeholder="度量列" style="width: 150px">
              <el-option v-for="c in result?.columns || []" :key="c" :label="c" :value="c" />
            </el-select>
          </div>
          <div class="dqw-cfg-line">
            <template v-if="!isOntologyMode">
              <span class="dqw-cfg-label">聚合</span>
              <el-select v-model="chartAgg" size="small" style="width: 92px">
                <el-option label="计数" value="count" />
                <el-option label="求和" value="sum" />
                <el-option label="平均" value="avg" />
                <el-option label="最小" value="min" />
                <el-option label="最大" value="max" />
              </el-select>
            </template>
            <template v-if="isOntologyMode ? isOntTimeX : canGrain">
              <span class="dqw-cfg-label">粒度</span>
              <el-select v-if="isOntologyMode" v-model="chartOntGrain" size="small" style="width: 92px">
                <el-option label="日" value="day" />
                <el-option label="周" value="week" />
                <el-option label="月" value="month" />
                <el-option label="季" value="quarter" />
                <el-option label="年" value="year" />
              </el-select>
              <el-select v-else v-model="chartGrain" size="small" clearable placeholder="原始" style="width: 92px">
                <el-option label="日" value="day" />
                <el-option label="周" value="week" />
                <el-option label="月" value="month" />
                <el-option label="季" value="quarter" />
                <el-option label="年" value="year" />
              </el-select>
            </template>
            <span class="dqw-cfg-label">TopN</span>
            <el-select v-model="chartTopN" size="small" clearable placeholder="不限" style="width: 84px">
              <el-option v-for="n in [5, 10, 20, 50]" :key="n" :label="`前 ${n}`" :value="n" />
            </el-select>
            <el-checkbox v-model="chartPercent" size="small">占比</el-checkbox>
            <el-button size="small" type="primary" :loading="aggLoading" @click="loadAgg">生成</el-button>
            <el-button size="small" :disabled="!agg || !agg.points.length" @click="exportPng">导出 PNG</el-button>
          </div>
        </div>
        <div v-if="aggLoading" class="dqw-empty">聚合中…</div>
        <div v-else-if="!agg || !agg.points.length" class="dqw-empty">请设 X/Y 后点「生成」，在当前过滤下展示分组聚合</div>
        <div v-else class="dqw-canvas">
          <DataChart ref="chartRef" :spec="chartSpec" :data="agg" />
        </div>
      </template>
    </div>
    <!-- 钉到看板 -->
    <el-dialog v-model="pinOpen" title="钉到看板" width="380px" append-to-body>
      <div class="dqw-pin">
        <el-select v-model="pinDashId" size="small" placeholder="选择看板" style="width: 100%">
          <el-option
            v-for="d in dashStore.list"
            :key="d.id"
            :label="`${d.title}（${d.widgetCount} 个组件）`"
            :value="d.id"
          />
        </el-select>
        <div class="dqw-pin-new">
          <el-input v-model="pinNewTitle" size="small" placeholder="或新建看板名称" @keyup.enter="createPinDash" />
          <el-button size="small" :disabled="!pinNewTitle.trim()" @click="createPinDash">新建</el-button>
        </div>
        <div class="dqw-pin-tip">
          钉入的是「取数契约 + 图表定义」，不复制数据；打开看板时按当前数据活取数。
        </div>
      </div>
      <template #footer>
        <el-button size="small" @click="pinOpen = false">取消</el-button>
        <el-button size="small" type="primary" :disabled="!pinDashId" :loading="pinning" @click="doPin">钉入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api/client';
import type { DataTabContract } from '../../stores/chat';
import { useDashboardStore } from '../../stores/dashboard';
import { useChat } from '../../composables/chat/useChat';
import type { DashboardWidget } from '@yan-zhi/shared';
import type { ChartData, ChartKind, ChartSpec } from './chart-spec';
import { buildOntologyIntent, ontologyRowsToChartData } from './ontology-view';
import { formatCell, inferColumnMeta } from '../../utils/table-meta';
import type { DocxBlock } from '../../utils/report-docx';
import type { XlsxSheet } from '../../utils/report-xlsx';

// ECharts 只在首次打开图表视图时加载（组件异步 chunk，不进首屏）
const DataChart = defineAsyncComponent(() => import('./DataChart.vue'));

interface RunResp {
  columns: string[]; rows: Record<string, unknown>[];
  rowCount: number; total: number; truncated: boolean; sql: string;
  filterSamples?: Array<{ col: string; kind: string; values?: Array<{ label: string; raw: unknown }>; controllable: boolean }>;
}
interface FilterSampleMap { [col: string]: { kind: string; values?: Array<{ label: string; raw: unknown }> } }

const props = defineProps<{ contract: DataTabContract }>();

const viewModes = [
  { key: 'table', label: '表格' },
  { key: 'chart', label: '图表' },
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
  props.contract.mode === 'ontology'
    ? (menu.value?.name || props.contract.ontology || '本体')
    : props.contract.table
      ? `表 ${props.contract.table}`
      : (props.contract.base ? (props.contract.base as string).replace(/\s+/g, ' ').slice(0, 40) : '项目库'));
const initialFilterCols = computed(() => props.contract.filterCols || []);

// ===== 本体模式（mode=ontology）：按业务字段名取数，不暴露自由 SQL）=====
interface OntMenu {
  id: string;
  code: string;
  name: string;
  description?: string;
  datasourceId: string;
  timeDimensions: Array<{ name: string; description?: string }>;
  dimensions: Array<{ name: string; description?: string }>;
  measures: Array<{ name: string; agg?: string; description?: string }>;
  filters: Array<{ name: string; description?: string; isDefault?: boolean }>;
  selections: Array<{ name: string }>;
}

const isOntologyMode = computed(() => props.contract.mode === 'ontology');
// 本体模式同样支持表格/图表：图表直接用本体取数结果（已按维度聚合）搭 ChartData
const modeOptions = viewModes;

const ontologies = ref<Array<{ code: string; name: string; description?: string }>>([]);
const ontologyRef = ref(props.contract.ontology || '');
const menu = ref<OntMenu | null>(null);
/** 时间维度：服务端只接受一个，单独一栏（可带粒度） */
const ontTime = ref('');
const ontGrain = ref<'' | Grain>('');
/** 普通维度 / 度量：均可多选 */
const ontDims = ref<string[]>([]);
const ontMeasures = ref<string[]>([]);
const ontFilters = ref<string[]>([]);
const ontLimit = ref(500);

async function loadOntologies(): Promise<void> {
  const r = await api.get<Array<{ code: string; name: string; description?: string }>>('/ontologies');
  if ('error' in r) { error.value = String(r.error); return; }
  ontologies.value = r.data || [];
  if (!ontologyRef.value && ontologies.value.length) ontologyRef.value = ontologies.value[0].code;
  if (ontologyRef.value) await loadMenu();
}

async function loadMenu(): Promise<void> {
  if (!ontologyRef.value) return;
  const r = await api.get<OntMenu>(`/query-contract/ontology/${encodeURIComponent(ontologyRef.value)}`);
  if ('error' in r) { error.value = String(r.error); menu.value = null; return; }
  menu.value = r.data;
  // 默认选中：第一个时间维度、第一个维度、第一个度量、声明为默认的过滤器
  if (!menu.value.timeDimensions.some((t) => t.name === ontTime.value)) ontTime.value = menu.value.timeDimensions[0]?.name || '';
  ontDims.value = ontDims.value.filter((d) => menu.value!.dimensions.some((x) => x.name === d));
  if (!ontDims.value.length && menu.value.dimensions.length) ontDims.value = [menu.value.dimensions[0].name];
  ontMeasures.value = ontMeasures.value.filter((m) => menu.value!.measures.some((x) => x.name === m));
  if (!ontMeasures.value.length && menu.value.measures.length) ontMeasures.value = [menu.value.measures[0].name];
  ontFilters.value = menu.value.filters.filter((f) => f.isDefault).map((f) => f.name);
  await runOntology();
}

async function onOntPick(): Promise<void> {
  ontTime.value = ''; ontDims.value = []; ontMeasures.value = []; ontFilters.value = []; ontGrain.value = '';
  chartOntX.value = ''; chartOntMeasures.value = []; agg.value = null;
  await loadMenu();
}

async function runOntology(): Promise<void> {
  if (!ontologyRef.value) { error.value = '请选择本体'; return; }
  loading.value = true; error.value = '';
  const intent = buildOntologyIntent({
    ...(ontTime.value ? { timeDimension: { name: ontTime.value, ...(ontGrain.value ? { grain: ontGrain.value } : {}) } } : {}),
    dimensions: ontDims.value,
    measures: ontMeasures.value.map((name) => ({
      name,
      ...(menu.value?.measures.find((m) => m.name === name)?.agg ? { agg: menu.value.measures.find((m) => m.name === name)!.agg } : {}),
    })),
    filters: ontFilters.value,
    limit: ontLimit.value,
  });
  try {
    const resp = await api.post<RunResp>('/query-contract/ontology/run', { ontology: ontologyRef.value, intent });
    if ('error' in resp) { error.value = String(resp.error); result.value = null; return; }
    result.value = { ...resp.data, total: resp.data.rowCount ?? resp.data.rows.length };
    page.value = 1;
    sort.value = null;
  } finally {
    loading.value = false;
  }
}

// 列显隐 + 类型感知宽度/对齐（明细列多时默认全选，用户可自行收敛）
const visibleCols = ref<string[]>([]);
/** 上一次结果的列集合：用于识别「新出现的列」 */
const prevCols = ref<string[]>([]);
const columnOptions = computed(() => result.value?.columns || []);
const columnMeta = computed(() => inferColumnMeta(result.value?.columns || [], result.value?.rows || []));
watch(() => result.value, (r) => {
  const cols = r?.columns || [];
  if (!cols.length) { visibleCols.value = []; prevCols.value = []; return; }
  // 本体模式没有「显示列」开关（列数少时不渲染），一律全显——否则新加的维度列会被永久藏掉
  if (isOntologyMode.value) { visibleCols.value = [...cols]; prevCols.value = cols; return; }
  const meta = inferColumnMeta(cols, r?.rows || []);
  const meaningful = cols.filter((c) => meta[c]?.kind !== 'empty');
  // 首次（列多时）自动隐藏整列空值/空 JSON 的噪声列
  const autoHidden = new Set(meaningful.length >= 3 ? cols.filter((c) => !meaningful.includes(c)) : []);
  const prev = new Set(prevCols.value);
  const kept = visibleCols.value.filter((c) => cols.includes(c));
  // ★ 新出现的列必须并入：旧逻辑只保留旧列，先查一次再选维度会让维度列永久消失
  const added = cols.filter((c) => !prev.has(c) && !autoHidden.has(c));
  visibleCols.value = cols.filter((c) => kept.includes(c) || added.includes(c));
  prevCols.value = cols;
});

async function runQuery(opts: { page?: number; size?: number; fetchSamples?: string[] } = {}) {
  const p = opts.page ?? page.value;
  const size = opts.size ?? pageSize.value;
  loading.value = true; error.value = '';
  const body = queryBody();
  if (!body) { error.value = '契约缺少 table 或 base'; loading.value = false; return; }
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
  const body = queryBody();
  if (!body) { error.value = '契约缺少 table 或 base'; loading.value = false; return; }
  body.page = 1; body.pageSize = pageSize.value;
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

// ===== 图表（P0 图表层）=====
type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';

const chartRef = ref<InstanceType<typeof DataChart> | null>(null);
const chartKind = ref<ChartKind>('line');
const chartDim = ref('');
const chartSeries = ref('');
const chartMeasure = ref('');
const chartAgg = ref<'count' | 'sum' | 'avg' | 'min' | 'max'>('sum');
const chartGrain = ref<'' | Grain>('');
const chartTopN = ref<number | ''>('');
const chartPercent = ref(false);
const agg = ref<ChartData | null>(null);
const aggLoading = ref(false);

// 本体模式的图表配置：X 用业务字段名，Y 可多选（多度量 → 多系列）
const chartOntX = ref('');
const chartOntMeasures = ref<string[]>([]);
const chartOntGrain = ref<Grain>('day');
const isOntTimeX = computed(() => !!menu.value?.timeDimensions.some((t) => t.name === chartOntX.value));
// 切到本体模式时，把栏里已选的时间/维度/度量带进图表配置，少点两下
watch(isOntologyMode, (on) => {
  if (!on) return;
  chartOntX.value = chartOntX.value || ontTime.value || ontDims.value[0] || '';
  if (!chartOntMeasures.value.length) chartOntMeasures.value = [...ontMeasures.value];
}, { immediate: true });

const seriesCols = computed(() => (result.value?.columns || []).filter((c) => c !== chartDim.value));

/** 只有看起来像日期的列才给时间粒度，避免对普通字符串做 dateTrunc 全变空 */
const DATE_DIM_RE = /(_at$|_date$|date|time|day|month|year|created|updated)/i;
const canGrain = computed(() => DATE_DIM_RE.test(chartDim.value));
watch(canGrain, (ok) => { if (!ok) chartGrain.value = ''; });

const chartSpec = computed<ChartSpec>(() => ({
  kind: chartKind.value,
  dim: isOntologyMode.value ? chartOntX.value : chartDim.value,
  measure: isOntologyMode.value ? (chartOntMeasures.value[0] || '') : chartMeasure.value,
  ...(isOntologyMode.value || !chartSeries.value ? {} : { series: chartSeries.value }),
  percent: chartPercent.value,
}));

async function loadOntologyAgg(): Promise<void> {
  if (!ontologyRef.value) { error.value = '请选择本体'; return; }
  if (!chartOntX.value) { error.value = '请选择分组(X)维度'; return; }
  if (!chartOntMeasures.value.length) { error.value = '请选择度量(Y)'; return; }
  aggLoading.value = true; error.value = '';
  const measures = chartOntMeasures.value.map((name) => {
    const def = menu.value?.measures.find((m) => m.name === name);
    return { name, ...(def?.agg ? { agg: def.agg } : {}) };
  });
  const intent = buildOntologyIntent({
    ...(isOntTimeX.value
      ? { timeDimension: { name: chartOntX.value, grain: chartOntGrain.value } }
      : { dimensions: [chartOntX.value] }),
    measures,
    filters: ontFilters.value,
    limit: ontLimit.value,
  });
  const resp = await api.post<RunResp>('/query-contract/ontology/run', { ontology: ontologyRef.value, intent });
  aggLoading.value = false;
  if ('error' in resp) { error.value = String(resp.error); agg.value = null; return; }
  agg.value = ontologyRowsToChartData(resp.data.rows, {
    xField: chartOntX.value,
    measures: chartOntMeasures.value,
    ...(chartTopN.value ? { topN: Number(chartTopN.value) } : {}),
    ...(chartPercent.value ? { percent: true } : {}),
  });
}

async function loadAgg() {
  if (isOntologyMode.value) { await loadOntologyAgg(); return; }
  if (!chartDim.value || !chartMeasure.value) { error.value = '请先选 X 维度列与 Y 度量列'; return; }
  aggLoading.value = true; error.value = '';
  const body = queryBody();
  if (!body) { error.value = '契约缺少 table 或 base'; aggLoading.value = false; return; }
  body.page = 1; body.pageSize = 0;
  body.dim = chartDim.value;
  body.measureCol = chartMeasure.value;
  body.agg = chartAgg.value;
  if (chartSeries.value) body.series = chartSeries.value;
  if (chartGrain.value) body.timeGrain = chartGrain.value;
  if (chartTopN.value) body.topN = Number(chartTopN.value);
  if (chartPercent.value) body.percent = true;
  const resp = await api.post<ChartData>('/query-contract/aggregate', body);
  aggLoading.value = false;
  if ('error' in resp) { error.value = String(resp.error); agg.value = null; return; }
  agg.value = resp.data;
}

function exportPng() {
  const url = chartPng();
  if (!url) { error.value = '图表尚未就绪，先点「生成」'; return; }
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.contract.title || props.contract.table || 'chart'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ===== 导出 Word / Excel =====
const WORD_DETAIL_LIMIT = 2000;
const DOCX_KIND = { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' };
const XLSX_KIND = { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' };
const exporting = ref<'' | 'word' | 'excel'>('');

const exportTitle = computed(() =>
  props.contract.title
  || (isOntologyMode.value ? (menu.value?.name || '本体数据') : props.contract.table ? `表 ${props.contract.table}` : '数据导出'));

/** 当前契约 + 过滤 + 排序 → 请求体（明细 / 聚合 / 导出共用） */
function queryBody(): Record<string, unknown> | null {
  const body: Record<string, unknown> = { datasourceId: props.contract.datasourceId };
  if (props.contract.table) body.table = props.contract.table;
  else if (props.contract.base) body.base = props.contract.base;
  else return null;
  const filters = Object.entries(filterVals.value)
    .filter(([, v]) => v !== '' && v != null)
    .map(([col, v]) => ({ col, op: 'eq' as const, value: v }));
  if (filters.length) body.filters = filters;
  if (sort.value) body.sort = [sort.value];
  return body;
}

/** 行对象 → 二维数组（对象值转 JSON 字符串，null 原样保留给 Excel 空单元格） */
function matrixOf(rows: Record<string, unknown>[], columns: string[]): Array<Array<string | number | null>> {
  return rows.map((row) => columns.map((col) => {
    const v = row[col];
    if (v == null) return null;
    if (typeof v === 'number' || typeof v === 'string') return v;
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }));
}

function chartPng(): string {
  const handle = chartRef.value as unknown as { toPng?: (o?: { background?: string }) => string } | null;
  return handle?.toPng?.({ background: '#ffffff' }) || '';
}

function chartKindLabel(): string {
  return { line: '折线', area: '面积', bar: '柱状', pie: '饼图', scatter: '散点' }[chartKind.value] || chartKind.value;
}

function describeConditions(): string {
  const parts: string[] = [];
  const filters = Object.entries(filterVals.value)
    .filter(([, v]) => v !== '' && v != null)
    .map(([col, v]) => `${col} = ${v}`);
  if (filters.length) parts.push('过滤：' + filters.join('；'));
  if (sort.value) parts.push(`排序：${sort.value.col} ${sort.value.dir === 'desc' ? '降序' : '升序'}`);
  parts.push(`导出时间：${new Date().toLocaleString()}`);
  return parts.join('　');
}

/** 导出用全量明细（不走分页；服务端上限 5 万行） */
async function fetchExportRows(): Promise<RunResp | null> {
  // 本体模式：导出当前取数结果（已按上限 1000 行截断），不再走自由 SQL 通道
  if (isOntologyMode.value) {
    if (!result.value?.columns.length) { error.value = '请先查询本体数据'; return null; }
    return result.value;
  }
  const body = queryBody();
  if (!body) { error.value = '契约缺少 table 或 base'; return null; }
  const resp = await api.post<RunResp>('/query-contract/export', body);
  if ('error' in resp) { error.value = String(resp.error); return null; }
  if (!resp.data.columns.length) { error.value = '当前条件无可导出数据'; return null; }
  return resp.data;
}

async function exportExcel() {
  exporting.value = 'excel';
  error.value = '';
  try {
    const data = await fetchExportRows();
    if (!data) return;
    const sheets: XlsxSheet[] = [
      { name: '明细', columns: data.columns, rows: matrixOf(data.rows, data.columns) },
    ];
    if (agg.value?.points.length) {
      sheets.push({
        name: '聚合',
        columns: [agg.value.dim || chartDim.value, ...agg.value.series],
        rows: agg.value.points.map((p) => [p.key, ...p.values]),
      });
    }
    const [{ buildWorkbookXlsx }, { saveDeliverableBytes, safeFileName }] = await Promise.all([
      import('../../utils/report-xlsx'),
      import('../../utils/deliverable-save'),
    ]);
    const bytes = await buildWorkbookXlsx(sheets);
    await saveDeliverableBytes(bytes, safeFileName(exportTitle.value, '数据导出') + '.xlsx', XLSX_KIND);
  } catch (e: any) {
    error.value = '导出失败：' + (e?.message || e);
  } finally {
    exporting.value = '';
  }
}

async function exportWord() {
  exporting.value = 'word';
  error.value = '';
  try {
    const data = await fetchExportRows();
    if (!data) return;
    const blocks: DocxBlock[] = [];
    blocks.push({ type: 'paragraph', text: describeConditions() });

    const png = agg.value?.points.length ? chartPng() : '';
    if (png) {
      blocks.push({
        type: 'image',
        dataUrl: png,
        caption: `图 1  ${chartDim.value} × ${chartMeasure.value}（${chartKindLabel()}）`,
      });
    }

    const rows = data.rows.slice(0, WORD_DETAIL_LIMIT);
    const truncated = data.rows.length > WORD_DETAIL_LIMIT;
    blocks.push({ type: 'heading', level: 2, text: `明细（共 ${data.total >= 0 ? data.total : data.rows.length} 条）` });
    blocks.push({
      type: 'table',
      columns: data.columns,
      rows: matrixOf(rows, data.columns),
      caption: truncated ? `表 1  仅含前 ${WORD_DETAIL_LIMIT} 行，完整明细请导出 Excel` : '表 1',
    });

    const [{ buildReportDocx }, { saveDeliverableBytes, safeFileName }] = await Promise.all([
      import('../../utils/report-docx'),
      import('../../utils/deliverable-save'),
    ]);
    const blob = await buildReportDocx({ title: exportTitle.value, subtitle: sourceLabel.value, blocks });
    const name = safeFileName(exportTitle.value, '数据导出') + '.docx';
    await saveDeliverableBytes(new Uint8Array(await blob.arrayBuffer()), name, DOCX_KIND);
  } catch (e: any) {
    error.value = '导出失败：' + (e?.message || e);
  } finally {
    exporting.value = '';
  }
}

// ===== 钉到看板 =====
const dashStore = useDashboardStore();
const { store: chatStore } = useChat();
const pinOpen = ref(false);
const pinDashId = ref('');
const pinNewTitle = ref('');
const pinning = ref(false);

async function openPin() {
  pinDashId.value = '';
  pinNewTitle.value = '';
  pinOpen.value = true;
  await dashStore.loadList();
  pinDashId.value = dashStore.list[0]?.id || '';
}

async function createPinDash() {
  const title = pinNewTitle.value.trim();
  if (!title) return;
  const created = await dashStore.create(title);
  if (!created) { error.value = dashStore.error || '新建看板失败'; return; }
  pinDashId.value = created.id;
  pinNewTitle.value = '';
}

/** 钉入的是「取数契约 + 图表定义」，不含行数据 */
function pinnedWidget(): DashboardWidget {
  const hasChart = !!agg.value?.points.length;
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? `dw_${crypto.randomUUID()}`
    : `dw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const dim = isOntologyMode.value ? chartOntX.value : chartDim.value;
  const measures = isOntologyMode.value ? [...chartOntMeasures.value] : (chartMeasure.value ? [chartMeasure.value] : []);
  return {
    id,
    kind: hasChart ? 'chart' : 'table',
    title: exportTitle.value,
    contract: { ...props.contract },
    spec: {
      ...(hasChart ? { kind: chartKind.value } : {}),
      dim,
      measure: measures[0] || '',
      measures,
      ...(isOntologyMode.value
        ? {
          ...(isOntTimeX.value ? { timeGrain: chartOntGrain.value } : {}),
        }
        : {
          agg: chartAgg.value,
          ...(chartSeries.value ? { series: chartSeries.value } : {}),
          ...(chartGrain.value ? { timeGrain: chartGrain.value } : {}),
        }),
      ...(chartTopN.value ? { topN: Number(chartTopN.value) } : {}),
      ...(chartPercent.value ? { percent: true } : {}),
    },
    pos: hasChart ? { x: 0, y: 0, w: 6, h: 6 } : { x: 0, y: 0, w: 12, h: 5 },
  };
}

async function doPin() {
  if (!pinDashId.value) return;
  pinning.value = true;
  const saved = await dashStore.saveWidget(pinDashId.value, pinnedWidget());
  pinning.value = false;
  if (!saved) { error.value = dashStore.error || '钉入失败'; return; }
  pinOpen.value = false;
  chatStore.openTab({ kind: 'dashboard', name: '看板' });
  ElMessage.success('已钉入看板');
}

function setMode(m: Mode) {
  mode.value = m;
  if (m !== 'chart') return;
  const cols = result.value?.columns || [];
  if (!chartDim.value) chartDim.value = cols.find((c) => !/^(id|_id)$/i.test(c)) || cols[0] || '';
  if (!chartMeasure.value) {
    chartMeasure.value = cols.find((c) => c !== chartDim.value && !/^created|updated|_at$/i.test(c))
      || cols.find((c) => c !== chartDim.value)
      || '';
  }
  if (chartDim.value && chartMeasure.value && !agg.value && !aggLoading.value) void loadAgg();
}

watch(() => props.contract, () => { resetAll(); }, { deep: true });
function resetAll() {
  mode.value = 'table'; result.value = null; samples.value = {};
  filterVals.value = {}; activeFilterCols.value = initialFilterCols.value.slice();
  page.value = 1; sort.value = null; error.value = '';
  agg.value = null; aggLoading.value = false;
  chartKind.value = 'line'; chartDim.value = ''; chartSeries.value = ''; chartMeasure.value = '';
  chartAgg.value = 'sum'; chartGrain.value = ''; chartTopN.value = ''; chartPercent.value = false;
  loading.value = false;
  if (isOntologyMode.value) { void loadOntologies(); return; }
  // 有声明过滤器 → 采样 + 带首页数据；无 → 直接首页
  if (initialFilterCols.value.length) { void samplePreset(); } else { void runQuery({ page: 1 }); }
}
async function samplePreset() {
  loading.value = true;
  const body = queryBody();
  if (!body) { loading.value = false; error.value = '契约缺少 table 或 base'; return; }
  body.page = 1; body.pageSize = pageSize.value;
  body.sampleFilters = initialFilterCols.value;
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
.dqw-colsel { width: 180px; margin-left: auto; }
.dqw-export { display: flex; gap: 6px; margin-left: auto; }
.dqw-export :deep(.el-button + .el-button) { margin-left: 0; }
.dqw-pin { display: flex; flex-direction: column; gap: 8px; }
.dqw-pin-new { display: flex; gap: 6px; align-items: center; }
.dqw-pin-tip { font-size: 11px; color: var(--color-text-tertiary); line-height: 1.5; }
.dqw-ont { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.dqw-ont-desc { font-size: 11px; color: var(--color-text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.dqw-table :deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--el-fill-color-lighter);
  font-weight: 600;
  color: var(--color-text);
}
.dqw-table :deep(.el-table__cell) { padding: 4px 0; }
.dqw-table :deep(.cell) { font-size: 12px; line-height: 1.5; }
.dqw-table :deep(.el-table__row:hover > td.el-table__cell) {
  background: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
}
.dqw-table :deep(.el-table__row--striped td.el-table__cell) {
  background: var(--el-fill-color-lighter);
}
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
.dqw-cfg-line { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.dqw-cfg-label { font-size: 12px; color: var(--color-text-secondary); flex: 0 0 auto; }
.dqw-canvas { height: 100%; display: flex; align-items: stretch; justify-content: center; padding: 10px 12px 6px; box-sizing: border-box; min-height: 260px; }
.dqw-canvas > * { flex: 1 1 auto; min-height: 240px; }
</style>

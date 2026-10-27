<!--
数据浏览工作台（data-query-contract Q1+Q2）
- 表格视图：左侧「列过滤器」按需动态生成；el-table 分页明细（仅参数化 /api/query-contract/run，不走 LLM）
- 图表视图：ECharts（按需懒加载）。支持多系列、时间粒度、TopN、占比；导出 PNG
- 主题对齐亮色；工具栏固定顶部，表格区独立滚动
-->
<template>
  <div class="dqw-root">
    <!-- 顶部单行工具条：视图切换（hover 展开）/ 来源 / 条数 / 更多操作（hover 下拉） -->
    <div class="dqw-toolbar">
      <div class="dqw-viewswitch" @mouseenter="viewOpen = true" @mouseleave="viewOpen = false">
        <button type="button" class="dqw-trigger" :class="{ open: viewOpen }" @click="viewOpen = !viewOpen">
          <el-icon class="dqw-trigger-icon"><component :is="currentView.icon" /></el-icon>
          <span>{{ currentView.label }}</span>
          <span class="dqw-caret" :class="{ open: viewOpen }">▾</span>
        </button>
        <div v-show="viewOpen" class="dqw-pop dqw-view-menu">
          <button
            v-for="v in viewOptions"
            :key="v.key"
            type="button"
            class="dqw-pop-item"
            :class="{ on: viewKind === v.key }"
            @click="pickView(v.key)"
          >
            <el-icon><component :is="v.icon" /></el-icon>
            <span>{{ v.label }}</span>
            <span v-if="viewKind === v.key" class="dqw-pop-check">✓</span>
          </button>
        </div>
      </div>

      <span v-if="!embedded" class="dqw-source" :title="sourceLabel">{{ sourceLabel }}</span>
      <span v-if="result?.truncated" class="dqw-dialect-tag" title="结果集过大，仅展示当前页">已截断</span>
      <span v-if="result" class="dqw-count">共 {{ result.total >= 0 ? result.total : '-' }} 条</span>

      <div class="dqw-toolbar-right">
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
        <div class="dqw-menu-wrap" @mouseenter="actionsOpen = true" @mouseleave="actionsOpen = false">
          <div class="dqw-split">
            <button
              type="button"
              class="dqw-trigger dqw-split-main"
              :class="{ open: actionsOpen }"
              :disabled="!!exporting"
              title="导出 Excel"
              @click="runAction(exportExcel)"
            >
              <el-icon><Tickets /></el-icon>
              <span>{{ exporting === 'excel' ? '导出中…' : '导出 Excel' }}</span>
            </button>
            <button
              type="button"
              class="dqw-trigger dqw-split-caret"
              :class="{ open: actionsOpen }"
              aria-label="其它导出方式 / 钉到看板"
              title="其它导出方式 / 钉到看板"
              @click="actionsOpen = !actionsOpen"
            >
              <span class="dqw-caret" :class="{ open: actionsOpen }">▾</span>
            </button>
          </div>
          <div v-show="actionsOpen" class="dqw-pop dqw-actions-menu">
            <button type="button" class="dqw-pop-item" :disabled="!!exporting" @click="runAction(exportWord)">
              <el-icon><Document /></el-icon>
              <span>{{ exporting === 'word' ? '导出中…' : '导出 Word' }}</span>
            </button>
            <button
              v-if="mode === 'chart'"
              type="button"
              class="dqw-pop-item"
              :disabled="!agg || !agg.points.length"
              @click="runAction(exportPng)"
            >
              <el-icon><Download /></el-icon><span>导出 PNG</span>
            </button>
            <button type="button" class="dqw-pop-item dqw-pop-sep" @click="runAction(openPin)">
              <el-icon><Star /></el-icon><span>钉到看板</span>
            </button>
          </div>
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

    <!-- 过滤器条  固定顶部 -->
    <div v-if="mode === 'table' && !isOntologyMode && activeFilterCols.length" class="dqw-filters">
      <span class="dqw-filter-label">
        <el-icon><Filter /></el-icon>
        过滤器
      </span>
      <div class="dqw-filter-controls">
        <template v-for="active in activeFilterCols" :key="active">
          <div class="dqw-filter-item" :class="{ active: !!filterVals[active] }">
            <span class="dqw-filter-name">{{ displayName(active) }}</span>
            <el-select
              v-if="hasEnum(active)"
              class="dqw-input"
              size="small"
              clearable
              placeholder="全部"
              :model-value="filterVals[active] ?? ''"
              @change="(v: any) => onEnumChange(active, v ?? '')"
            >
              <el-option v-for="o in enumOptions(active)" :key="String(o.raw)" :label="o.label" :value="String(o.raw)" />
            </el-select>
            <el-input
              v-else
              class="dqw-input"
              size="small"
              :placeholder="`${active} 等于…`"
              clearable
              :model-value="filterVals[active] ?? ''"
              @change="(v: any) => applyTextFilter(active, v)"
            />
          </div>
        </template>
        <el-button size="small" text class="dqw-filter-clear" @click="clearFilters">清除</el-button>
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
          highlight-current-row
          @sort-change="onSort"
        >
          <el-table-column
            v-for="col in visibleCols"
            :key="col"
            :prop="col"
            :label="col"
            :min-width="columnMeta[col]?.width"
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
      <div v-else class="dqw-chart-area">
        <div class="dqw-chart-stage">
          <div v-if="aggLoading" class="dqw-empty">聚合中…</div>
          <div v-else-if="chartHint" class="dqw-empty">{{ chartHint }}</div>
          <div v-else-if="!agg || !agg.points.length" class="dqw-empty">选一个「维度 + 指标」即可出图</div>
          <div v-else class="dqw-canvas">
            <DataChart ref="chartRef" :spec="chartSpec" :data="agg" />
          </div>
        </div>
        <!-- 图表下方常驻字段条：直接点标签切换（维度多选、指标多选），不再用下拉 -->
        <div class="dqw-chart-fields">
          <div class="dqw-field-row">
            <span class="dqw-field-label">维度</span>
            <div class="dqw-field-list">
              <template v-if="isOntologyMode">
                <button
                  v-for="t in menu?.timeDimensions || []"
                  :key="'t-' + t.name"
                  type="button"
                  class="dqw-pill"
                  :class="{ on: chartOntX === t.name }"
                  @click="pickOntX(t.name)"
                >
                  <span class="dqw-pill-box radio" />
                  <span>{{ t.name }}</span>
                </button>
                <button
                  v-for="d in menu?.dimensions || []"
                  :key="'d-' + d.name"
                  type="button"
                  class="dqw-pill"
                  :class="{ on: chartOntX === d.name }"
                  @click="pickOntX(d.name)"
                >
                  <span class="dqw-pill-box radio" />
                  <span>{{ d.name }}</span>
                </button>
                <span v-if="!menu?.timeDimensions.length && !menu?.dimensions.length" class="dqw-field-empty">无可用字段</span>
              </template>
              <template v-else>
                <button
                  v-for="c in chartDimOptions"
                  :key="c"
                  type="button"
                  class="dqw-pill"
                  :class="{ on: chartDimPick.includes(c) }"
                  @click="toggleDim(c)"
                >
                  <span class="dqw-pill-box" :class="{ radio: chartCaps.dims === 'single' }">{{ chartDimPick.includes(c) && chartCaps.dims !== 'single' ? '✓' : '' }}</span>
                  <span>{{ c }}</span>
                </button>
                <span v-if="!chartDimOptions.length" class="dqw-field-empty">无可用字段</span>
              </template>
            </div>
            <template v-if="isOntologyMode ? isOntTimeX : canGrain">
              <span class="dqw-field-label">粒度</span>
              <div class="dqw-field-list dqw-field-list-tight">
                <button
                  v-if="!isOntologyMode"
                  type="button"
                  class="dqw-pill"
                  :class="{ on: !chartGrain }"
                  @click="chartGrain = ''"
                >
                  <span class="dqw-pill-box radio" />
                  <span>原始</span>
                </button>
                <button
                  v-for="g in grainOptions"
                  :key="g.value"
                  type="button"
                  class="dqw-pill"
                  :class="{ on: (isOntologyMode ? chartOntGrain : chartGrain) === g.value }"
                  @click="pickGrain(g.value)"
                >
                  <span class="dqw-pill-box radio" />
                  <span>{{ g.label }}</span>
                </button>
              </div>
            </template>
          </div>
          <div class="dqw-field-row">
            <span class="dqw-field-label">指标</span>
            <div class="dqw-field-list">
              <button
                v-for="c in chartMeasureOptions"
                :key="c"
                type="button"
                class="dqw-pill"
                :class="{ on: isMeasurePicked(c) }"
                @click="toggleMeasure(c)"
              >
                <span class="dqw-pill-box" :class="{ radio: chartCaps.measures === 'single' }">{{ isMeasurePicked(c) && chartCaps.measures !== 'single' ? '✓' : '' }}</span>
                <span>{{ c }}</span>
              </button>
              <span v-if="!chartMeasureOptions.length" class="dqw-field-empty">无可用字段</span>
            </div>
          </div>
        </div>
      </div>
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
import { ElMessage } from 'element-plus';
import { Aim, DataLine, Document, Download, Filter, Grid, Histogram, PieChart, Star, Tickets, TrendCharts } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import type { DataTabContract } from '../../stores/chat';
import { useDashboardStore } from '../../stores/dashboard';
import { useChat } from '../../composables/chat/useChat';
import type { DashboardWidget, InlineDataViewChart } from '@yan-zhi/shared';
import type { ChartData, ChartKind, ChartSpec } from './chart-spec';
import { buildOntologyIntent, ontologyRowsToChartData } from './ontology-view';
import { formatCell, inferColumnMeta, splitColumnRoles } from '../../utils/table-meta';
import type { DocxBlock } from '../../utils/report-docx';
import type { XlsxSheet } from '../../utils/report-xlsx';
import { exportFileName } from '../../utils/download-name';

// ECharts 只在首次打开图表视图时加载（组件异步 chunk，不进首屏）
const DataChart = defineAsyncComponent(() => import('./DataChart.vue'));

interface RunResp {
  columns: string[]; rows: Record<string, unknown>[];
  rowCount: number; total: number; truncated: boolean; sql: string;
  filterSamples?: Array<{ col: string; kind: string; values?: Array<{ label: string; raw: unknown }>; controllable: boolean }>;
}
interface FilterSampleMap { [col: string]: { kind: string; values?: Array<{ label: string; raw: unknown }> } }

/** embedded = 被聊天卡片（含外层标题条）包裹时，不再重复渲染标题
 *  messageId = 所在的助手消息（内嵌在某一轮消息里时传入）：导出的 PNG/Excel/Word
 *  登记交付文件时带上，交付卡片才能精确挂到那一轮（2026-10-27「三个交付文件只显示一个」）。 */
const props = withDefaults(defineProps<{ contract: DataTabContract; embedded?: boolean; messageId?: string }>(), { embedded: false });

/** 视图 = 表格 / 各类图表：hover 下拉统一切换（图种与视图不再分两处） */
const viewOptions = [
  { key: 'table', label: '表格', icon: Grid },
  { key: 'line', label: '折线图', icon: TrendCharts },
  { key: 'bar', label: '柱状图', icon: Histogram },
  { key: 'pie', label: '饼图', icon: PieChart },
  { key: 'area', label: '面积图', icon: DataLine },
  { key: 'scatter', label: '散点图', icon: Aim },
] as const;
type Mode = 'table' | 'chart';

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
// 可加过滤的列 = 全部列（过滤器由契约声明，不在这里增删）

const sourceLabel = computed(() =>
  props.contract.mode === 'ontology'
    ? (menu.value?.name || props.contract.ontology || '本体')
    : props.contract.table
      ? `表 ${props.contract.table}`
      // ★ 不再把 base SQL 贴到标题栏：那是一串英文 SQL，用户既看不懂也没必要看
      : (props.contract.title || '查询结果'));
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

/** 清空已选值（过滤器本身是契约声明，不可移除） */
function clearFilters() {
  for (const k of Object.keys(filterVals.value)) filterVals.value[k] = '';
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
/** 维度可多选：第 1 个作 X，第 2 个作系列（更多维度暂不使用） */
const chartDimPick = ref<string[]>([]);
/** 指标可多选：每个指标一条系列 */
const chartMeasurePick = ref<string[]>([]);
const chartDim = computed(() => chartDimPick.value[0] || '');
const chartSeries = computed(() => chartDimPick.value[1] || '');
const chartMeasure = computed(() => chartMeasurePick.value[0] || '');
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

// ===== 图表下方常驻字段条：点标签直接切换（维度/指标多选，粒度为单选） =====
/** 图型能力：饼图只能一个维度 + 一个指标；折线/柱状/面积/散点支持多指标、两个维度（第 2 个拆系列） */
interface ChartCaps { measures: 'single' | 'multi'; dims: 'single' | 'two' }
const CHART_CAPS: Record<ChartKind, ChartCaps> = {
  line: { measures: 'multi', dims: 'two' },
  area: { measures: 'multi', dims: 'two' },
  bar: { measures: 'multi', dims: 'two' },
  scatter: { measures: 'multi', dims: 'two' },
  pie: { measures: 'single', dims: 'single' },
};
const chartCaps = computed<ChartCaps>(() => CHART_CAPS[chartKind.value] ?? { measures: 'multi', dims: 'two' });

/** 切换图型后把超出的选择收回去（切到饼图时多选的指标/维度要收敛成单选，否则选了不生效） */
function clampChartSelection(): void {
  const caps = chartCaps.value;
  if (caps.measures === 'single') {
    if (chartMeasurePick.value.length > 1) chartMeasurePick.value = [chartMeasurePick.value[0]];
    if (chartOntMeasures.value.length > 1) chartOntMeasures.value = [chartOntMeasures.value[0]];
  }
  if (caps.dims === 'single' && chartDimPick.value.length > 1) {
    chartDimPick.value = [chartDimPick.value[0]];
  }
}

const grainOptions: Array<{ value: Grain; label: string }> = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
  { value: 'year', label: '年' },
];

/** 非本体维度最多两个：第 1 个作 X，第 2 个作系列；选第三个时替换系列位。单选图型直接替换 */
function toggleDim(col: string): void {
  const cur = chartDimPick.value;
  if (chartCaps.value.dims === 'single') {
    chartDimPick.value = cur[0] === col ? [] : [col];
    return;
  }
  if (cur.includes(col)) {
    chartDimPick.value = cur.filter((x) => x !== col);
    return;
  }
  chartDimPick.value = cur.length < 2 ? [...cur, col] : [cur[0], col];
}

function isMeasurePicked(col: string): boolean {
  return (isOntologyMode.value ? chartOntMeasures.value : chartMeasurePick.value).includes(col);
}

function toggleMeasure(col: string): void {
  const cur = isOntologyMode.value ? chartOntMeasures.value : chartMeasurePick.value;
  // 单指标图型（饼图）：再点已选项取消，点其它项替换
  const next = chartCaps.value.measures === 'single'
    ? (cur[0] === col ? [] : [col])
    : (cur.includes(col) ? cur.filter((x) => x !== col) : [...cur, col]);
  if (isOntologyMode.value) chartOntMeasures.value = next;
  else chartMeasurePick.value = next;
}

function pickOntX(name: string): void {
  chartOntX.value = name;
}

function pickGrain(g: Grain): void {
  if (isOntologyMode.value) chartOntGrain.value = g;
  else chartGrain.value = chartGrain.value === g ? '' : g;
}
// 切到本体模式时，把栏里已选的时间/维度/度量带进图表配置，少点两下
watch(isOntologyMode, (on) => {
  if (!on) return;
  chartOntX.value = chartOntX.value || ontTime.value || ontDims.value[0] || '';
  if (!chartOntMeasures.value.length) chartOntMeasures.value = [...ontMeasures.value];
}, { immediate: true });

/**
 * 列角色：数值列 = 度量，文本/日期/ID/布尔 = 维度（空列两边都不要）。
 * ★ 图表必须按「指标 × 维度」画：此前把任意列塞进 Y（截图里 Y=类型 文本列 → 全画成 1）。
 */
const columnRoles = computed(() => splitColumnRoles(result.value?.columns || [], result.value?.rows || []));
const chartDimOptions = computed(() => (isOntologyMode.value
  ? [...(menu.value?.timeDimensions || []), ...(menu.value?.dimensions || [])].map((x) => x.name)
  : columnRoles.value.dims));
const chartMeasureOptions = computed(() => (isOntologyMode.value
  ? (menu.value?.measures || []).map((m) => m.name)
  : columnRoles.value.measures));
/** 图表缺数值指标时的说明：别让用户拿文本列当 Y 画出一排 1 */
const chartHint = computed(() => {
  if (isOntologyMode.value) return '';
  if (result.value?.columns.length && !columnRoles.value.measures.length) {
    return '当前结果没有数值列（指标）：先用聚合（COUNT/SUM 等）取到数值列，再切图表';
  }
  return '';
});

/** 图表配置的默认值只在「没选或选了非法列」时收敛，不覆盖用户手选 */
function seedChartDefaults(): void {
  if (isOntologyMode.value) {
    if (!chartOntX.value) chartOntX.value = ontTime.value || ontDims.value[0] || '';
    if (!chartOntMeasures.value.length) chartOntMeasures.value = [...ontMeasures.value];
    return;
  }
  const { dims, measures } = columnRoles.value;
  const pickedDims = chartDimPick.value.filter((c) => dims.includes(c)).slice(0, 2);
  chartDimPick.value = pickedDims.length ? pickedDims : (dims[0] ? [dims[0]] : []);
  const pickedMeasures = chartMeasurePick.value.filter((c) => measures.includes(c));
  chartMeasurePick.value = pickedMeasures.length ? pickedMeasures : (measures[0] ? [measures[0]] : []);
}
watch([() => result.value, mode], () => { if (mode.value === 'chart') seedChartDefaults(); });

/** 只有看起来像日期的列才给时间粒度，避免对普通字符串做 dateTrunc 全变空 */
const DATE_DIM_RE = /(_at$|_date$|date|time|day|month|year|created|updated)/i;
const canGrain = computed(() => DATE_DIM_RE.test(chartDim.value));
watch(canGrain, (ok) => { if (!ok) chartGrain.value = ''; });

const chartSpec = computed<ChartSpec>(() => ({
  kind: chartKind.value,
  dim: isOntologyMode.value ? chartOntX.value : chartDim.value,
  measure: isOntologyMode.value ? (chartOntMeasures.value[0] || '') : chartMeasure.value,
  measures: isOntologyMode.value ? [...chartOntMeasures.value] : [...chartMeasurePick.value],
  ...(isOntologyMode.value || !chartSeries.value ? {} : { series: chartSeries.value }),
  ...(isOntologyMode.value ? {} : { agg: chartAgg.value }),
  ...(chartTopN.value ? { topN: Number(chartTopN.value) } : {}),
  ...(isOntologyMode.value
    ? (isOntTimeX.value ? { timeGrain: chartOntGrain.value } : {})
    : (chartGrain.value ? { timeGrain: chartGrain.value } : {})),
  percent: chartPercent.value,
}));

/** 落到契约里的图表配置（刷新 / 换设备 / 新建看板共用这一份口径） */
function chartOfSpec(s: ChartSpec): InlineDataViewChart {
  return {
    kind: s.kind,
    dim: s.dim,
    ...(s.measure ? { measure: s.measure } : {}),
    ...(s.measures?.length ? { measures: [...s.measures] } : {}),
    ...(s.series ? { series: s.series } : {}),
    ...(s.timeGrain ? { timeGrain: s.timeGrain } : {}),
    ...(s.agg ? { agg: s.agg } : {}),
    ...(s.topN ? { topN: s.topN } : {}),
    ...(s.percent ? { percent: true } : {}),
  };
}

/**
 * 图表配置变化 → 写回契约消息（防抖 400ms）。
 * 与契约里已有的配置相同就不重复请求（恢复视图时也会走到这里）。
 */
let chartPersistTimer: ReturnType<typeof setTimeout> | null = null;
watch(chartSpec, (s) => {
  if (mode.value !== 'chart') return;
  if (!s.dim || !(s.measures?.length || s.measure)) return;
  const chart = chartOfSpec(s);
  if (props.contract.chart && JSON.stringify(props.contract.chart) === JSON.stringify(chart)) return;
  if (chartPersistTimer) clearTimeout(chartPersistTimer);
  chartPersistTimer = setTimeout(() => {
    chartPersistTimer = null;
    chatStore.persistDataViewChart(props.contract, chart);
  }, 400);
});

/** 契约里已保存过图表：直接按图表打开（刷新后保持用户上次的选择） */
function applyContractChart(): void {
  const c = props.contract.chart;
  if (!c || !c.dim) return;
  chartKind.value = (c.kind as ChartKind) || 'line';
  const measures = c.measures?.length ? [...c.measures] : (c.measure ? [c.measure] : []);
  if (isOntologyMode.value) {
    chartOntX.value = c.dim;
    chartOntMeasures.value = measures;
    if (c.timeGrain) chartOntGrain.value = c.timeGrain as Grain;
  } else {
    chartDimPick.value = [c.dim, ...(c.series ? [c.series] : [])];
    chartMeasurePick.value = measures;
    chartGrain.value = (c.timeGrain as Grain) || '';
    chartTopN.value = c.topN || '';
    chartPercent.value = c.percent === true;
  }
  mode.value = 'chart';
  clampChartSelection();
}

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
  if (chartMeasurePick.value.length > 1) body.measureCols = [...chartMeasurePick.value];
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

const PNG_KIND = { mimeType: 'image/png', label: 'PNG' };

/** PNG 与 Word/Excel 走同一条交付通道：桌面端落「交付文件」目录并登记，Web 端下载 */
async function exportPng() {
  const url = chartPng();
  if (!url) { error.value = '图表尚未就绪'; return; }
  const base64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { saveDeliverableBytes } = await import('../../utils/deliverable-save');
  await saveDeliverableBytes(bytes, exportFileName(exportTitle.value, '.png', { fallback: 'chart' }), PNG_KIND, { messageId: props.messageId });
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
    const [{ buildWorkbookXlsx }, { saveDeliverableBytes }] = await Promise.all([
      import('../../utils/report-xlsx'),
      import('../../utils/deliverable-save'),
    ]);
    const bytes = await buildWorkbookXlsx(sheets);
    await saveDeliverableBytes(bytes, exportFileName(exportTitle.value, '.xlsx', { fallback: '数据导出' }), XLSX_KIND, { messageId: props.messageId });
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
      const dimName = isOntologyMode.value ? chartOntX.value : chartDim.value;
      const metricNames = (isOntologyMode.value ? chartOntMeasures.value : chartMeasurePick.value).join(' / ');
      blocks.push({
        type: 'image',
        dataUrl: png,
        caption: `图 1  ${dimName} × ${metricNames || chartMeasure.value}（${chartKindLabel()}）`,
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

    const [{ buildReportDocx }, { saveDeliverableBytes }] = await Promise.all([
      import('../../utils/report-docx'),
      import('../../utils/deliverable-save'),
    ]);
    const blob = await buildReportDocx({ title: exportTitle.value, subtitle: sourceLabel.value, blocks });
    const name = exportFileName(exportTitle.value, '.docx', { fallback: '数据导出' });
    await saveDeliverableBytes(new Uint8Array(await blob.arrayBuffer()), name, DOCX_KIND, { messageId: props.messageId });
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
  const measures = isOntologyMode.value ? [...chartOntMeasures.value] : [...chartMeasurePick.value];
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

/** 视图下拉：表格 ↔ 各图表类型；切到图表即按当前维度/指标自动出图 */
const viewKind = computed<string>({
  get: () => (mode.value === 'table' ? 'table' : chartKind.value),
  set: (v) => {
    if (v === 'table') { mode.value = 'table'; return; }
    chartKind.value = v as ChartKind;
    mode.value = 'chart';
    clampChartSelection();
    seedChartDefaults();
  },
});

/** hover 菜单：视图切换 / 更多操作（钉看板 + 导出），点一下也保持展开（触屏可用） */
const viewOpen = ref(false);
const actionsOpen = ref(false);
const currentView = computed(() => viewOptions.find((v) => v.key === viewKind.value) || viewOptions[0]);
function pickView(key: string): void {
  viewKind.value = key;
  viewOpen.value = false;
}
function runAction(fn: () => unknown): void {
  actionsOpen.value = false;
  void fn();
}

let aggTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAgg(): void {
  if (mode.value !== 'chart') return;
  const ready = isOntologyMode.value
    ? !!chartOntX.value && chartOntMeasures.value.length > 0
    : !!chartDim.value && !!chartMeasure.value;
  // 全部取消勾选时把旧图清掉，否则会停在上一次的结果上（看起来像选择没生效）
  if (!ready) { agg.value = null; return; }
  if (aggTimer) clearTimeout(aggTimer);
  aggTimer = setTimeout(() => { void loadAgg(); }, 250);
}
// ★ 必须监听「多选数组」本身：只监听 chartDim/chartMeasure（第一项）时，
//   加第二个指标/维度不会触发重查 ⇒ 永远停在单系列（用户实报「多个指标就一条线」）。
watch(
  () => [
    chartDimPick.value.join('\u0001'),
    chartMeasurePick.value.join('\u0001'),
    chartKind.value,
    chartGrain.value,
    chartAgg.value,
    chartTopN.value,
    chartPercent.value,
    mode.value,
    // 恢复出的图表配置可能早于首屏明细返回：结果到了要补一次聚合，否则图上空白
    result.value,
  ],
  scheduleAgg,
);
watch([chartOntX, chartOntMeasures, chartOntGrain], scheduleAgg);

watch(() => props.contract, () => { resetAll(); }, { deep: true });
function resetAll() {
  mode.value = 'table'; result.value = null; samples.value = {};
  filterVals.value = {}; activeFilterCols.value = initialFilterCols.value.slice();
  page.value = 1; sort.value = null; error.value = '';
  agg.value = null; aggLoading.value = false;
  chartKind.value = 'line'; chartDimPick.value = []; chartMeasurePick.value = [];
  chartAgg.value = 'sum'; chartGrain.value = ''; chartTopN.value = ''; chartPercent.value = false;
  applyContractChart();
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
.dqw-toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 6px 12px; border-bottom: 1px solid var(--el-border-color-lighter); }
.dqw-source { font-weight: 600; color: var(--color-text); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dqw-count { font-size: 12px; color: var(--color-text-tertiary); flex: none; }
.dqw-dialect-tag { font-size: 11px; color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 12%, transparent); padding: 1px 6px; border-radius: 4px; flex: none; }
.dqw-toolbar-right { display: flex; align-items: center; gap: 6px; margin-left: auto; flex: none; }
.dqw-colsel { width: 170px; }

/* hover 下拉：视图切换 / 更多操作（对齐 harness 的轻量触发按钮） */
.dqw-viewswitch, .dqw-menu-wrap { position: relative; flex: none; }
.dqw-trigger { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; border: 1px solid var(--el-border-color); border-radius: 7px; background: var(--el-fill-color-blank); color: var(--color-text-secondary); font-size: 12px; cursor: pointer; transition: background .15s, border-color .15s, color .15s; white-space: nowrap; }
.dqw-trigger:hover, .dqw-trigger.open { background: color-mix(in srgb, var(--el-color-primary) 8%, transparent); border-color: color-mix(in srgb, var(--el-color-primary) 45%, transparent); color: var(--el-color-primary); }
.dqw-trigger-icon { font-size: 14px; }
/* 拆分按钮：左半直接导出 Excel，右半展开其它导出方式 */
.dqw-split { display: inline-flex; align-items: stretch; }
.dqw-split-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.dqw-split-caret { border-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 0 5px; }
.dqw-split-main:disabled { color: var(--color-text-tertiary); cursor: default; }
.dqw-caret { font-size: 10px; line-height: 1; color: var(--color-text-tertiary); transition: transform .15s; }
.dqw-caret.open { transform: rotate(180deg); }
.dqw-pop { position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; min-width: 132px; padding: 4px; border-radius: 8px; border: 1px solid var(--el-border-color-lighter); background: var(--el-bg-color-overlay); box-shadow: 0 10px 24px rgba(15, 23, 42, .12), 0 2px 6px rgba(15, 23, 42, .06); }
/* hover 菜单与触发按钮之间有 4px 间隙：补一条透明桥，鼠标穿过去不会误关 */
.dqw-pop::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; height: 6px; }
.dqw-actions-menu { left: auto; right: 0; min-width: 148px; }
.dqw-pop-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; text-align: left; cursor: pointer; white-space: nowrap; }
.dqw-pop-item:hover:not(:disabled) { background: var(--el-fill-color-light); color: var(--color-text); }
.dqw-pop-item.on { color: var(--el-color-primary); font-weight: 600; background: color-mix(in srgb, var(--el-color-primary) 8%, transparent); }
.dqw-pop-item:disabled { color: var(--color-text-disabled, #c0c4cc); cursor: default; }
.dqw-pop-check { margin-left: auto; font-size: 11px; color: var(--el-color-primary); }
.dqw-pop-sep { margin-top: 4px; border-top: 1px solid var(--el-border-color-lighter); border-radius: 0 0 6px 6px; padding-top: 7px; }
.dqw-pin { display: flex; flex-direction: column; gap: 8px; }
.dqw-pin-new { display: flex; gap: 6px; align-items: center; }
.dqw-pin-tip { font-size: 11px; color: var(--color-text-tertiary); line-height: 1.5; }
.dqw-ont { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.dqw-ont-desc { font-size: 11px; color: var(--color-text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
/* 表格：去掉斑马纹与竖线，只留浅横线 + hover 高亮；数字等宽便于纵向比对 */
.dqw-table :deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--el-fill-color-light);
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 12px;
  height: 36px;
  padding: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.dqw-table :deep(.el-table__cell) { padding: 8px 0; border-bottom: 1px solid var(--el-border-color-lighter); transition: background .12s ease; }
.dqw-table :deep(.cell) {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--color-text);
  padding: 0 14px;
  font-variant-numeric: tabular-nums;
}
.dqw-table :deep(.el-table__row:hover > td.el-table__cell) {
  background: color-mix(in srgb, var(--el-color-primary) 5%, transparent);
}
.dqw-table :deep(.el-table__row.current-row > td.el-table__cell) {
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}
/* Element Plus 默认在表格底部画一条 1px 线，这里已有边框，去掉避免双线 */
.dqw-table :deep(.el-table__inner-wrapper::before) { display: none; }
.dqw-table :deep(.caret-wrapper) { opacity: .4; }
.dqw-table :deep(th.el-table__cell:hover .caret-wrapper) { opacity: 1; }

/* 过滤器：一行轻量 chip，不再用裸 select 撑一个大方框 */
.dqw-filters { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); flex-wrap: wrap; }
.dqw-filter-label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-text-tertiary); flex: none; }
.dqw-filter-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.dqw-filter-item { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 2px 0 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 7px; background: var(--el-bg-color); transition: border-color .15s, background .15s; }
.dqw-filter-item:hover { border-color: var(--el-border-color); }
.dqw-filter-item.active { border-color: color-mix(in srgb, var(--el-color-primary) 35%, transparent); background: color-mix(in srgb, var(--el-color-primary) 4%, transparent); }
.dqw-filter-name { font-size: 12px; color: var(--color-text-secondary); font-weight: 600; white-space: nowrap; }
.dqw-filter-clear { color: var(--color-text-tertiary); padding: 0 2px; }
.dqw-input { width: 132px; }
.dqw-input :deep(.el-input__wrapper),
.dqw-input :deep(.el-select__wrapper) { box-shadow: none !important; background: transparent; padding: 0 4px; }
.dqw-input :deep(.el-input__inner),
.dqw-input :deep(.el-select__selected-item) { font-size: 12px; }
.dqw-input :deep(.el-select__wrapper) { min-height: 24px; }
.dqw-body { flex: 1 1 auto; min-height: 0; position: relative; }
.dqw-body.scrolling { overflow: hidden; }
.dqw-table { height: 100%; }
.dqw-pagebar { flex: 0 0 auto; padding: 6px 0; border-top: 1px solid var(--el-border-color-lighter); display: flex; justify-content: flex-end; }
.dqw-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-tertiary); font-size: 13px; padding: 24px; }
.dqw-error { flex: 0 0 auto; color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, transparent); border-left: 3px solid var(--color-danger); padding: 6px 10px; font-size: 12px; white-space: pre-wrap; }
.dqw-chart-area { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* 图表下方常驻字段条：直接点标签切换，不占画布空间也不藏在下拉里 */
.dqw-chart-fields {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 12px 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.dqw-field-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dqw-field-label { flex: none; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); white-space: nowrap; }
.dqw-field-list { display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; overflow-x: auto; padding: 3px 0; scrollbar-width: thin; }
.dqw-field-list-tight { flex: 0 0 auto; overflow: visible; padding-left: 4px; }
.dqw-field-empty { font-size: 12px; color: var(--color-text-tertiary); }
.dqw-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 3px 9px 3px 7px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.dqw-pill:hover { background: var(--el-fill-color-light); color: var(--color-text); }
.dqw-pill.on {
  border-style: solid;
  border-color: color-mix(in srgb, var(--el-color-primary) 38%, transparent);
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
  color: var(--el-color-primary);
  font-weight: 600;
}
.dqw-pill-box {
  width: 13px;
  height: 13px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--el-border-color);
  border-radius: 3px;
  font-size: 9px;
  line-height: 1;
  color: var(--el-color-primary);
  transition: border-color .16s ease;
}
.dqw-pill-box.radio { border-radius: 50%; }
.dqw-pill.on .dqw-pill-box { border-color: var(--el-color-primary); }
.dqw-pill.on .dqw-pill-box.radio::after {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--el-color-primary);
}
.dqw-chart-stage { flex: 1 1 auto; min-height: 0; position: relative; }
.dqw-cfg-label { font-size: 12px; color: var(--color-text-secondary); flex: 0 0 auto; }
.dqw-canvas { height: 100%; display: flex; align-items: stretch; justify-content: center; padding: 6px 12px 2px; box-sizing: border-box; min-height: 200px; }
.dqw-canvas > * { flex: 1 1 auto; min-height: 180px; }
</style>

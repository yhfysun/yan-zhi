<!--
文档类型渲染卡片
- 结构来自 DocumentInstance；表格/图表用 contract 活取数，信息图用 AntV Infographic 渲染。
- 「导出 Word」把图表/信息图先导出 PNG，再交给 report-docx 生成 .docx。
- DataChart / InfographicBlock 都是异步组件：没有图表/信息图时不加载对应大包。
-->
<template>
  <div class="doc-card">
    <div class="doc-head">
      <el-icon class="doc-icon"><Document /></el-icon>
      <span class="doc-type">{{ typeName }}</span>
      <div v-if="!hideActions" class="doc-actions">
        <div ref="wordWrapRef" class="doc-word-wrap">
          <button
            class="doc-btn doc-word-btn"
            :disabled="exporting"
            :aria-expanded="wordOpen"
            title="下载（Word / 源文件，文件名自动带时间戳）"
            @click.stop="wordOpen = !wordOpen"
          >
            <el-icon><Download /></el-icon>
            <span>{{ exporting ? '导出中…' : '下载' }}</span>
            <span class="doc-caret" :class="{ open: wordOpen }">▾</span>
          </button>
          <div v-show="wordOpen" class="doc-word-menu">
            <button class="doc-word-item" :disabled="exporting" @click="runExportWord('native')">
              <span class="doc-word-item-icon primary"><el-icon><EditPen /></el-icon></span>
              <span class="doc-word-item-text">
                <span class="doc-word-item-title">可编辑模式</span>
                <span class="doc-word-item-hint">Word 原生图表，双击可编辑数据</span>
              </span>
            </button>
            <button class="doc-word-item" :disabled="exporting" @click="runExportWord('image')">
              <span class="doc-word-item-icon success"><el-icon><Picture /></el-icon></span>
              <span class="doc-word-item-text">
                <span class="doc-word-item-title">图片模式</span>
                <span class="doc-word-item-hint">图表/指标渲染为高清 PNG，样式与预览一致</span>
              </span>
            </button>
            <button class="doc-word-item" :disabled="exporting" @click="exportYdocFile">
              <span class="doc-word-item-icon muted"><el-icon><Document /></el-icon></span>
              <span class="doc-word-item-text">
                <span class="doc-word-item-title">源文件 .ydoc</span>
                <span class="doc-word-item-hint">结构化 JSON，可再次导入编辑</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="doc-body">
      <h1
        class="doc-title-main"
        :class="{ 'doc-editable': editable }"
        :contenteditable="editable"
        @blur="onTitleBlur($event)"
        v-html="plainToRichHtml(effectiveDoc.title)"
      ></h1>

      <!-- 编辑工具条：像文档编辑器一样，点正文/标题后在这里换样式 -->
      <div v-if="editable" class="doc-edit-toolbar">
        <button type="button" title="加粗" @mousedown.prevent @click="execInline('bold')"><b>B</b></button>
        <button type="button" title="斜体" @mousedown.prevent @click="execInline('italic')"><i>I</i></button>
        <span class="doc-tb-sep"></span>
        <button type="button" @mousedown.prevent @click="formatHeading(1)">H1</button>
        <button type="button" @mousedown.prevent @click="formatHeading(2)">H2</button>
        <button type="button" @mousedown.prevent @click="formatHeading(3)">H3</button>
        <button type="button" @mousedown.prevent @click="formatParagraph">正文</button>
        <span class="doc-tb-sep"></span>
        <button type="button" title="无序列表" @mousedown.prevent @click="formatList('bullets')">• 列表</button>
        <button type="button" title="有序列表" @mousedown.prevent @click="formatList('ordered')">1. 列表</button>
        <button type="button" @mousedown.prevent @click="insertTable">表格</button>
        <button type="button" @mousedown.prevent @click="insertPageBreak">分页</button>
        <span class="doc-tb-tip">选中文字可加粗/斜体；光标所在段落用 H1/H2/H3 换样式</span>
      </div>

      <div
        v-if="editable || effectiveDoc.subtitle"
        class="doc-subtitle"
        :class="{ 'doc-editable': editable }"
        :contenteditable="editable"
        @focus="activeIndex = -1"
        @blur="onSubtitleBlur($event)"
        v-html="plainToRichHtml(effectiveDoc.subtitle || '')"
      ></div>

      <!-- 变量表单：模板声明了 variables 时，渲染前先让用户填 -->
      <div v-if="typeDef?.variables?.length && !editable" class="doc-vars">
        <label v-for="v in typeDef.variables" :key="v.key" class="doc-var">
          <span>{{ v.label }}</span>
          <el-select v-if="v.type === 'select'" v-model="varValues[v.key]" size="small" style="width: 150px">
            <el-option v-for="o in v.options || []" :key="o" :label="o" :value="o" />
          </el-select>
          <el-input
            v-else
            v-model="varValues[v.key]"
            size="small"
            style="width: 150px"
            :type="v.type === 'date' ? 'date' : 'text'"
          />
        </label>
      </div>

      <template v-for="(s, i) in effectiveDoc.sections" :key="i">
        <component
          :is="'h' + s.level"
          v-if="s.kind === 'heading'"
          class="doc-h"
          :class="['doc-h' + s.level, { 'doc-editable': editable }]"
          :contenteditable="editable"
          @focus="activeIndex = i"
          @blur="onSectionBlur(i, $event)"
          v-html="sectionHtml(s)"
        ></component>

        <p
          v-else-if="s.kind === 'paragraph'"
          class="doc-p"
          :class="{ 'doc-editable': editable }"
          :contenteditable="editable"
          @focus="activeIndex = i"
          @blur="onSectionBlur(i, $event)"
          v-html="sectionHtml(s)"
        ></p>

        <component
          :is="s.kind === 'ordered' ? 'ol' : 'ul'"
          v-else-if="s.kind === 'bullets' || s.kind === 'ordered'"
          class="doc-list"
        >
          <li v-for="(it, ii) in s.items" :key="ii">
            <span
              :class="{ 'doc-editable': editable }"
              :contenteditable="editable"
              @focus="activeIndex = i"
              @blur="onListItemBlur(i, ii, $event)"
              v-html="itemHtml(it)"
            ></span>
          </li>
        </component>

        <template v-else-if="s.kind === 'metrics'">
          <table v-if="editable" class="doc-metrics-edit">
            <tbody>
              <tr v-for="(m, mi) in s.items" :key="mi">
                <td class="lbl"><span contenteditable @focus="activeIndex = i" @blur="onMetricBlur(i, mi, 'label', $event)">{{ m.label }}</span></td>
                <td class="val"><span contenteditable @focus="activeIndex = i" @blur="onMetricBlur(i, mi, 'value', $event)">{{ m.value }}</span></td>
                <td class="hint"><span contenteditable @focus="activeIndex = i" @blur="onMetricBlur(i, mi, 'hint', $event)">{{ m.hint || '' }}</span></td>
              </tr>
            </tbody>
          </table>
          <div v-else class="doc-metrics">
            <div v-for="(m, mi) in s.items" :key="mi" class="doc-metric">
              <div class="doc-metric-label">{{ m.label }}</div>
              <div class="doc-metric-value">{{ m.value }}</div>
              <div v-if="m.hint" class="doc-metric-hint">{{ m.hint }}</div>
            </div>
          </div>
        </template>

        <template v-else-if="s.kind === 'table'">
          <div v-if="tableError[i]" class="doc-err">{{ tableError[i] }}</div>
          <template v-else-if="editable && !s.contract">
            <table class="doc-table-edit">
              <thead>
                <tr>
                  <th v-for="(c, ci) in s.columns" :key="ci">
                    <span contenteditable @focus="activeIndex = i" @blur="onColBlur(i, ci, $event)">{{ c }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in s.rows" :key="ri">
                  <td v-for="(v, ci) in row" :key="ci">
                    <span contenteditable @focus="activeIndex = i" @blur="onCellBlur(i, ri, ci, $event)">{{ v }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div
              v-if="s.caption || editable"
              class="doc-caption"
              :class="{ 'doc-editable': editable }"
              :contenteditable="editable"
              @focus="activeIndex = i"
              @blur="onCaptionBlur(i, $event)"
            >{{ s.caption || '' }}</div>
          </template>
          <template v-else>
            <div v-if="!tableOf(i, s).columns.length" class="doc-empty">取数中…</div>
            <template v-else>
              <el-table class="doc-table" :data="tableOf(i, s).objectRows" size="small" border>
                <el-table-column
                  v-for="c in tableOf(i, s).columns"
                  :key="c"
                  :prop="c"
                  :label="c"
                  show-overflow-tooltip
                />
              </el-table>
              <div v-if="editable" class="doc-edit-hint">该表由取数契约活取数；改内容请改数据源或让智能体重取。</div>
              <div
                v-if="s.caption || editable"
                class="doc-caption"
                :class="{ 'doc-editable': editable }"
                :contenteditable="editable"
                @focus="activeIndex = i"
                @blur="onCaptionBlur(i, $event)"
              >{{ s.caption || '' }}</div>
            </template>
          </template>
        </template>

        <template v-else-if="s.kind === 'chart'">
          <div v-if="chartError[i]" class="doc-err">{{ chartError[i] }}</div>
          <div v-else-if="!chartData[i]" class="doc-empty">图表取数中…</div>
          <div v-else class="doc-chart">
            <DataChart :ref="(el: any) => setChartRef(i, el)" :spec="s.spec" :data="chartData[i]!" />
          </div>
          <div v-if="editable" class="doc-chart-cfg">
            <span class="doc-edit-label">图型</span>
            <el-select :model-value="(s as any).spec.kind" size="small" style="width: 96px" @update:model-value="setChartField(i, 'kind', $event)">
              <el-option value="line" label="折线" />
              <el-option value="area" label="面积" />
              <el-option value="bar" label="柱状" />
              <el-option value="pie" label="饼图" />
              <el-option value="scatter" label="散点" />
            </el-select>
            <span class="doc-edit-label">维度</span>
            <el-input :model-value="(s as any).spec.dim" size="small" style="width: 140px" @change="setChartField(i, 'dim', $event)" />
            <span class="doc-edit-label">指标</span>
            <el-input :model-value="(s as any).spec.measure" size="small" style="width: 140px" @change="setChartField(i, 'measure', $event)" />
            <span class="doc-edit-label">系列</span>
            <el-input :model-value="(s as any).spec.series || ''" size="small" style="width: 140px" @change="setChartField(i, 'series', $event)" />
            <button type="button" class="doc-mini-btn" @click="toggleChartData(i, s)">
              {{ (s as any).data && chartDataOpen[i] ? '收起数据' : '编辑数据' }}
            </button>
            <button v-if="(s as any).data" type="button" class="doc-mini-btn" @click="resetChartData(i, s)">恢复取数</button>
          </div>
          <div v-if="editable && (s as any).data && chartDataOpen[i]" class="doc-chart-data">
            <table>
              <thead>
                <tr>
                  <th>类别</th>
                  <th v-for="(ser, si) in (s as any).data.series" :key="si">{{ ser.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(cat, ri) in (s as any).data.categories" :key="ri">
                  <td><input class="doc-data-input" :value="cat" @change="setInlineCat(i, s, ri, $event)" /></td>
                  <td v-for="(ser, si) in (s as any).data.series" :key="si">
                    <input class="doc-data-input" type="number" :value="ser.values[ri]" @change="setInlineVal(i, s, si, ri, $event)" />
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="doc-inline-ops">
              <button type="button" class="doc-mini-btn" @click="addInlineRow(i, s)">+ 行</button>
              <button type="button" class="doc-mini-btn" @click="addInlineSeries(i, s)">+ 系列</button>
              <span class="doc-edit-hint">改的是内联数据，预览与 Word 导出都用这份</span>
            </div>
          </div>
          <div
            v-if="s.caption || editable"
            class="doc-caption"
            :class="{ 'doc-editable': editable }"
            :contenteditable="editable"
            @focus="activeIndex = i"
            @blur="onCaptionBlur(i, $event)"
          >{{ s.caption || '' }}</div>
        </template>

        <template v-else-if="s.kind === 'infographic'">
          <InfographicBlock :ref="(el: any) => setIgRef(i, el)" :syntax="s.syntax" :title="s.title" :height="360" />
          <div
            v-if="s.caption || editable"
            class="doc-caption"
            :class="{ 'doc-editable': editable }"
            :contenteditable="editable"
            @focus="activeIndex = i"
            @blur="onCaptionBlur(i, $event)"
          >{{ s.caption || '' }}</div>
        </template>

        <template v-else-if="s.kind === 'image'">
          <img class="doc-image" :src="s.src" alt="" />
          <div
            v-if="s.caption || editable"
            class="doc-caption"
            :class="{ 'doc-editable': editable }"
            :contenteditable="editable"
            @focus="activeIndex = i"
            @blur="onCaptionBlur(i, $event)"
          >{{ s.caption || '' }}</div>
        </template>

        <hr v-else-if="s.kind === 'pageBreak'" class="doc-break" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Document, Download, EditPen, Picture } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import type { ChartData } from './chart-spec';
import type { ChartInlineData, DocumentDataContract, DocumentInstance, DocumentSection } from '../../utils/document-types';
import { applyDocumentVariables, findDocumentType } from '../../utils/document-types';
import { useDocumentTypeStore } from '../../stores/document-type';
import { buildReportDocx, type DocxBlock } from '../../utils/report-docx';
import type { NativeChartData } from '../../utils/docx-native-chart';
import { sanitizeRichHtml, richHtmlToText, htmlHasMarkup, plainToRichHtml } from '../../utils/rich-text';
import { exportFileName } from '../../utils/download-name';
import { metricsToPng } from '../../utils/metrics-image';
import { toYdoc } from '../../utils/ydoc';

const DataChart = defineAsyncComponent(() => import('./DataChart.vue'));
const InfographicBlock = defineAsyncComponent(() => import('./InfographicBlock.vue'));

const props = withDefaults(defineProps<{ doc: DocumentInstance; hideActions?: boolean; editable?: boolean }>(), {
  hideActions: false,
  editable: false,
});

// ===== 原位编辑：直接改 props.doc（预览里传的是响应式副本），保存时序列化回 .ydoc =====
const activeIndex = ref(-1);

function plainText(ev: Event): string {
  const el = ev.target as HTMLElement | null;
  return (el?.innerText || '').replace(/ /g, ' ').trim();
}

/** 段落/标题的展示 HTML：优先存过的富文本，其次把 **加粗** 之类的纯文本转成 HTML */
function sectionHtml(s: any): string {
  if (s && typeof s.html === 'string' && s.html.trim()) return sanitizeRichHtml(s.html);
  return plainToRichHtml(s?.text || '');
}
function itemHtml(it: string): string {
  const s = String(it || '');
  return /<\/?[a-z]/i.test(s) ? sanitizeRichHtml(s) : plainToRichHtml(s);
}

function srcSections(): any[] {
  return props.doc.sections as any[];
}

function onTitleBlur(ev: Event): void {
  const t = plainText(ev);
  if (t) props.doc.title = t;
}
function onSubtitleBlur(ev: Event): void {
  const t = plainText(ev);
  if (t) props.doc.subtitle = t;
  else delete props.doc.subtitle;
}
/** 标题/正文失焦：同时存纯文本与富文本（只有真带格式才写 html） */
function onSectionBlur(i: number, ev: Event): void {
  const s = srcSections()[i];
  if (!s || (s.kind !== 'heading' && s.kind !== 'paragraph')) return;
  const el = ev.target as HTMLElement | null;
  const html = sanitizeRichHtml(el?.innerHTML || '');
  s.text = richHtmlToText(html);
  if (htmlHasMarkup(html)) s.html = html;
  else delete s.html;
}
function onListItemBlur(i: number, ii: number, ev: Event): void {
  const s = srcSections()[i];
  if (!s || (s.kind !== 'bullets' && s.kind !== 'ordered')) return;
  const el = ev.target as HTMLElement | null;
  const html = sanitizeRichHtml(el?.innerHTML || '');
  s.items[ii] = htmlHasMarkup(html) ? html : richHtmlToText(html);
}
function onCaptionBlur(i: number, ev: Event): void {
  const s = srcSections()[i];
  if (!s || !('caption' in s)) return;
  const t = plainText(ev);
  if (t) s.caption = t;
  else delete s.caption;
}
function onMetricBlur(i: number, mi: number, field: 'label' | 'value' | 'hint', ev: Event): void {
  const s = srcSections()[i];
  if (s?.kind === 'metrics' && s.items?.[mi]) s.items[mi][field] = plainText(ev);
}
function onColBlur(i: number, ci: number, ev: Event): void {
  const s = srcSections()[i];
  if (s?.kind === 'table' && s.columns) s.columns[ci] = plainText(ev);
}
function onCellBlur(i: number, ri: number, ci: number, ev: Event): void {
  const s = srcSections()[i];
  if (s?.kind === 'table' && s.rows?.[ri]) s.rows[ri][ci] = plainText(ev);
}

/** 选区加粗/斜体：execCommand 作用于当前 contenteditable 的选区，失焦时统一落库 */
function execInline(cmd: 'bold' | 'italic'): void {
  try { document.execCommand(cmd); } catch { /* 浏览器不支持时忽略 */ }
}

/** 工具栏：把光标所在段落在「标题 / 正文」之间转换；没有光标时追加一段 */
function formatHeading(level: 1 | 2 | 3): void {
  const i = activeIndex.value;
  const list = srcSections();
  const s = list[i];
  if (!s) return;
  if (s.kind === 'heading' || s.kind === 'paragraph') {
    list[i] = { kind: 'heading', level, text: s.text || '', ...(s.html ? { html: s.html } : {}) };
  } else list.splice(i + 1, 0, { kind: 'heading', level, text: '新标题' });
}
function formatParagraph(): void {
  const i = activeIndex.value;
  const list = srcSections();
  const s = list[i];
  if (!s) return;
  if (s.kind === 'heading' || s.kind === 'paragraph') {
    list[i] = { kind: 'paragraph', text: s.text || '', ...(s.html ? { html: s.html } : {}) };
  } else list.splice(i + 1, 0, { kind: 'paragraph', text: '' });
}
/** 段落 → 有序/无序列表（再点一次换另一种） */
function formatList(kind: 'bullets' | 'ordered'): void {
  const i = activeIndex.value;
  const list = srcSections();
  const s = list[i];
  if (!s) return;
  if (s.kind === 'bullets' || s.kind === 'ordered' || s.kind === 'paragraph' || s.kind === 'heading') {
    const text = String(s.text || richHtmlToText(s.html || '') || '');
    list[i] = { kind, items: [text] };
  } else list.splice(i + 1, 0, { kind, items: [''] });
}
function insertTable(): void {
  const i = activeIndex.value;
  const at = i >= 0 ? i + 1 : srcSections().length;
  srcSections().splice(at, 0, { kind: 'table', columns: ['列 1', '列 2'], rows: [['', '']] });
  activeIndex.value = at;
}
function insertPageBreak(): void {
  const i = activeIndex.value;
  const at = i >= 0 ? i + 1 : srcSections().length;
  srcSections().splice(at, 0, { kind: 'pageBreak' });
  activeIndex.value = at;
}
function setChartField(i: number, field: 'kind' | 'dim' | 'measure' | 'series', value: unknown): void {
  const s = srcSections()[i];
  if (s?.kind !== 'chart') return;
  const v = typeof value === 'string' ? value.trim() : value;
  if (field === 'series' && !v) delete (s.spec as any).series;
  else (s.spec as any)[field] = v;
  void loadChart(i, s);
}

const docTypeStore = useDocumentTypeStore();
const typeDef = computed(() => findDocumentType(props.doc.type, docTypeStore.custom));
const varValues = ref<Record<string, string>>({});
watch(typeDef, (t) => {
  const next: Record<string, string> = {};
  for (const v of t?.variables || []) next[v.key] = varValues.value[v.key] ?? v.default ?? '';
  varValues.value = next;
}, { immediate: true });
/** 填了变量的文档副本；模板/导出都读它 */
const effectiveDoc = computed(() => applyDocumentVariables(props.doc, varValues.value));

const typeName = computed(() => typeDef.value?.name || props.doc.type);
const exporting = ref(false);
const wordOpen = ref(false);
const wordWrapRef = ref<HTMLElement | null>(null);

/** 点空白处收起下载菜单（按钮与菜单项自己 stop，不触发这里） */
function closeWordMenuOnOutside(e: MouseEvent) {
  if (wordWrapRef.value && !wordWrapRef.value.contains(e.target as Node)) wordOpen.value = false;
}

const chartData = reactive<Record<number, ChartData | null>>({});
const chartDataOpen = reactive<Record<number, boolean>>({});
const chartError = reactive<Record<number, string>>({});
const tableData = reactive<Record<number, { columns: string[]; objectRows: Array<Record<string, unknown>> }>>({});
const tableError = reactive<Record<number, string>>({});

const chartRefs: Record<number, { toPng?: (o?: { background?: string }) => string }> = {};
const igRefs: Record<number, { toPng?: () => Promise<string> }> = {};

function setChartRef(i: number, el: unknown) {
  if (el) chartRefs[i] = el as { toPng?: (o?: { background?: string }) => string };
  else delete chartRefs[i];
}
function setIgRef(i: number, el: unknown) {
  if (el) igRefs[i] = el as { toPng?: () => Promise<string> };
  else delete igRefs[i];
}

/** 表格数据：contract 走参数化取数；内联 rows 直接转对象行 */
function tableOf(i: number, s: Extract<DocumentSection, { kind: 'table' }>) {
  if (s.contract) {
    return tableData[i] || { columns: [], objectRows: [] };
  }
  const columns = s.columns || [];
  const rows = s.rows || [];
  return {
    columns,
    objectRows: rows.map((r) => Object.fromEntries(columns.map((c, ci) => [c, r[ci] ?? null])) as Record<string, unknown>),
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

/** 内联图表数据 → 渲染用的 ChartData（预览与 Word 导出共用） */
function inlineToChartData(d: ChartInlineData, spec?: { dim?: string; measure?: string }): ChartData {
  return {
    series: d.series.map((s) => s.name),
    points: d.categories.map((c, ri) => ({ key: c, values: d.series.map((s) => Number(s.values[ri]) || 0) })),
    total: d.categories.length,
    dim: spec?.dim || '',
    measure: spec?.measure || '',
  };
}

/** 编辑数据：第一次点开时用当前取数结果做种子，之后改的是内联数据 */
function toggleChartData(i: number, s: any): void {
  if (s.data) { chartDataOpen[i] = !chartDataOpen[i]; return; }
  const d = chartData[i];
  if (!d || !d.points.length) return;
  s.data = {
    categories: d.points.map((p) => p.key),
    series: d.series.map((name, si) => ({ name, values: d.points.map((p) => Number(p.values[si]) || 0) })),
  };
  chartDataOpen[i] = true;
  chartData[i] = inlineToChartData(s.data, s.spec);
}
function resetChartData(i: number, s: any): void {
  delete s.data;
  chartDataOpen[i] = false;
  chartData[i] = null;
  void loadChart(i, s);
}
function setInlineCat(i: number, s: any, ri: number, ev: Event): void {
  s.data.categories[ri] = (ev.target as HTMLInputElement).value;
  chartData[i] = inlineToChartData(s.data, s.spec);
}
function setInlineVal(i: number, s: any, si: number, ri: number, ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  s.data.series[si].values[ri] = Number.isFinite(v) ? v : 0;
  chartData[i] = inlineToChartData(s.data, s.spec);
}
function addInlineRow(i: number, s: any): void {
  s.data.categories.push(`新增 ${s.data.categories.length + 1}`);
  s.data.series.forEach((ser: { values: number[] }) => ser.values.push(0));
  chartData[i] = inlineToChartData(s.data, s.spec);
}
function addInlineSeries(i: number, s: any): void {
  s.data.series.push({ name: `系列 ${s.data.series.length + 1}`, values: s.data.categories.map(() => 0) });
  chartData[i] = inlineToChartData(s.data, s.spec);
}

async function loadChart(i: number, s: Extract<DocumentSection, { kind: 'chart' }>) {
  const spec = s.spec;
  if (s.data) { chartData[i] = inlineToChartData(s.data, spec); return; }
  const body: Record<string, unknown> = {
    ...contractBody(s.contract),
    dim: spec.dim,
    measureCol: spec.measure,
    agg: spec.agg || 'sum',
  };
  if (spec.series) body.series = spec.series;
  if (spec.timeGrain) body.timeGrain = spec.timeGrain;
  if (spec.topN) body.topN = spec.topN;
  if (spec.percent) body.percent = true;
  const resp = await api.post<ChartData>('/query-contract/aggregate', body);
  if ('error' in resp) { chartError[i] = String(resp.error); return; }
  chartData[i] = resp.data;
}

async function loadTable(i: number, s: Extract<DocumentSection, { kind: 'table' }>) {
  if (!s.contract) return;
  const body: Record<string, unknown> = {
    ...contractBody(s.contract),
    page: 1,
    pageSize: Math.min(Math.max(s.limit || 100, 1), 200),
  };
  const resp = await api.post<{ columns: string[]; rows: Array<Record<string, unknown>> }>('/query-contract/run', body);
  if ('error' in resp) { tableError[i] = String(resp.error); return; }
  const columns = resp.data.columns || [];
  tableData[i] = {
    columns,
    objectRows: (resp.data.rows || []).map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null]))),
  };
}

async function srcToDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const r = await fetch(src);
  const blob = await r.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** 下载默认名：<标题>-<可编辑|图片>-<时间戳>.docx（两种模式不互相覆盖） */
function wordFileName(mode: WordExportMode): string {
  return exportFileName(effectiveDoc.value.title, '.docx', {
    fallback: 'document',
    label: mode === 'native' ? '可编辑' : '图片',
  });
}

/** 下载结构化源文件（.ydoc），可再导入编辑 */
function exportYdocFile(): void {
  wordOpen.value = false;
  const name = exportFileName(effectiveDoc.value.title, '.ydoc', { fallback: 'document' });
  downloadBlob(new Blob([toYdoc(effectiveDoc.value)], { type: 'application/json;charset=utf-8' }), name);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

type WordExportMode = 'native' | 'image';

function runExportWord(mode: WordExportMode): void {
  wordOpen.value = false;
  void exportWord(mode);
}

/** 原生图表数据：直接取当前渲染用的 ChartData，保证与屏幕上看到的一致 */
function nativeChartOf(i: number, kind: string): NativeChartData | null {
  const d = chartData[i];
  if (!d || !d.points.length || !d.series.length) return null;
  if (!['line', 'area', 'bar', 'pie'].includes(kind)) return null;
  return {
    kind: kind as NativeChartData['kind'],
    categories: d.points.map((p) => p.key),
    series: d.series.map((name, si) => ({
      name,
      values: d.points.map((p) => Number(p.values[si]) || 0),
    })),
  };
}

async function buildDocxBlob(mode: WordExportMode): Promise<Blob> {
  const doc = effectiveDoc.value;
  const blocks: DocxBlock[] = [];
  for (let i = 0; i < doc.sections.length; i++) {
    const s = doc.sections[i];
    if (s.kind === 'heading') { blocks.push({ type: 'heading', level: s.level, text: s.text, ...(s.html ? { html: s.html } : {}) }); continue; }
    if (s.kind === 'paragraph') { blocks.push({ type: 'paragraph', text: s.text, ...(s.html ? { html: s.html } : {}) }); continue; }
    if (s.kind === 'bullets' || s.kind === 'ordered') {
      blocks.push({
        type: 'list',
        ordered: s.kind === 'ordered',
        items: s.items.map((it) => (/<\/?[a-z]/i.test(it) ? { html: it } : { text: it })),
        ...(s.caption ? { caption: s.caption } : {}),
      });
      continue;
    }
    if (s.kind === 'metrics') {
      // 图片模式：指标按预览的卡片样式画成 PNG（Word 表格版明显掉档次）
      const png = mode === 'image' ? metricsToPng(s.items) : '';
      if (png) { blocks.push({ type: 'image', dataUrl: png }); continue; }
      blocks.push({ type: 'metrics', items: s.items });
      continue;
    }
    if (s.kind === 'pageBreak') { blocks.push({ type: 'pageBreak' }); continue; }
    if (s.kind === 'table') {
      const t = tableOf(i, s);
      if (t.columns.length) {
        blocks.push({
          type: 'table',
          columns: t.columns,
          rows: t.objectRows.map((r) => t.columns.map((c) => (r[c] as string | number | null) ?? null)),
          ...(s.caption ? { caption: s.caption } : {}),
        });
      }
      continue;
    }
    if (s.kind === 'chart') {
      const native = mode === 'native' ? nativeChartOf(i, s.spec.kind) : null;
      if (native) {
        blocks.push({
          type: 'nativeChart',
          marker: `__YZCHART_${i + 1}__`,
          data: native,
          ...(s.caption ? { caption: s.caption } : {}),
        });
        continue;
      }
      const png = chartRefs[i]?.toPng?.({ background: '#ffffff' });
      if (png) blocks.push({ type: 'image', dataUrl: png, ...(s.caption ? { caption: s.caption } : {}) });
      continue;
    }
    if (s.kind === 'infographic') {
      const png = await igRefs[i]?.toPng?.();
      if (png) blocks.push({ type: 'image', dataUrl: png, ...(s.caption ? { caption: s.caption } : {}) });
      continue;
    }
    if (s.kind === 'image') {
      try {
        const dataUrl = await srcToDataUrl(s.src);
        blocks.push({ type: 'image', dataUrl, ...(s.caption ? { caption: s.caption } : {}) });
      } catch { /* 外链图片取不到时跳过 */ }
    }
  }

  return buildReportDocx({
    title: doc.title,
    ...(doc.subtitle ? { subtitle: doc.subtitle } : {}),
    ...(doc.author ? { author: doc.author } : {}),
    blocks,
  });
}

async function exportWord(mode: WordExportMode = 'native'): Promise<void> {  if (exporting.value) return;
  exporting.value = true;
  try {
    let blob: Blob;
    try {
      blob = await buildDocxBlob(mode);
    } catch (e) {
      // 原生图表注入失败时退回图片，不要让用户拿不到 Word
      if (mode !== 'native') throw e;
      blob = await buildDocxBlob('image');
    }
    downloadBlob(blob, wordFileName(mode));
  } finally {
    exporting.value = false;
  }
}

// 预览窗（FilePreview）把它放到顶部「下载」下拉里调用
defineExpose({ exportWord });

onMounted(() => {
  void docTypeStore.load();
  document.addEventListener('click', closeWordMenuOnOutside);
  props.doc.sections.forEach((s, i) => {
    if (s.kind === 'chart') void loadChart(i, s);
    if (s.kind === 'table' && s.contract) void loadTable(i, s);
  });
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeWordMenuOnOutside);
});
</script>

<style scoped>
.doc-card { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-fill-color-blank); margin: 10px 0; overflow: hidden; }
.doc-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.doc-icon { color: var(--el-color-primary); }
.doc-title { font-size: 13px; font-weight: 600; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-type { font-size: 11px; color: var(--color-text-secondary); border: 1px solid var(--el-border-color-lighter); border-radius: 4px; padding: 0 5px; }
.doc-actions { margin-left: auto; }
.doc-btn { font-size: 12px; padding: 2px 9px; border-radius: 5px; border: 1px solid var(--btn-border); background: var(--btn-bg); color: var(--color-text-secondary); cursor: pointer; }
.doc-btn:hover:not(:disabled) { background: var(--btn-bg-hover); color: var(--color-text); }
/* 导出 Word：hover 展开「动态 / 静态」两种口径 */
.doc-word-wrap { position: relative; }
.doc-word-btn { display: inline-flex; align-items: center; gap: 5px; }
.doc-caret { font-size: 10px; line-height: 1; color: var(--color-text-tertiary); transition: transform .15s ease; }
.doc-caret.open { transform: rotate(180deg); }
.doc-word-menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; min-width: 244px; padding: 6px;
  border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color-overlay);
  box-shadow: 0 10px 24px rgba(15, 23, 42, .12), 0 2px 6px rgba(15, 23, 42, .06);
}
/* 按钮与菜单间的 4px 间隙补桥，鼠标穿过去不误关 */
.doc-word-menu::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; height: 6px; }
.doc-word-item { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 8px 9px; border: 0; border-radius: 7px; background: transparent; text-align: left; cursor: pointer; }
.doc-word-item:hover:not(:disabled) { background: var(--el-fill-color-light); }
.doc-word-item-icon {
  width: 26px; height: 26px; flex: none; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center; font-size: 14px;
}
.doc-word-item-icon.primary { color: var(--el-color-primary); background: color-mix(in srgb, var(--el-color-primary) 10%, transparent); }
.doc-word-item-icon.success { color: var(--el-color-success); background: color-mix(in srgb, var(--el-color-success) 12%, transparent); }
.doc-word-item-icon.muted { color: var(--color-text-secondary); background: var(--el-fill-color); }
.doc-word-item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.doc-word-item-title { font-size: 12.5px; font-weight: 600; color: var(--color-text); }
.doc-word-item-hint { font-size: 11px; color: var(--color-text-tertiary); line-height: 1.4; }
.doc-word-item:disabled { opacity: .6; cursor: default; }
.doc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.doc-body { padding: 18px 22px 22px; }
.doc-title-main { font-size: 22px; font-weight: 700; text-align: center; line-height: 1.5; margin: 2px 0 6px; color: var(--color-text); }
.doc-subtitle { font-size: 13px; color: var(--color-text-secondary); text-align: center; margin-bottom: 16px; line-height: 1.6; }
.doc-vars { display: flex; flex-wrap: wrap; gap: 10px; padding: 8px 10px; margin-bottom: 10px; border: 1px dashed var(--el-border-color); border-radius: 6px; background: var(--el-fill-color-lighter); }
.doc-var { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-secondary); }
.doc-h { color: var(--color-text); font-weight: 700; }
.doc-h1 { font-size: 19px; margin: 24px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--el-border-color-lighter); }
.doc-h2 { font-size: 16px; margin: 18px 0 8px; }
.doc-h3 { font-size: 14px; margin: 14px 0 6px; }
.doc-p { font-size: 14px; line-height: 1.95; color: #1f2937; margin: 0 0 12px; text-align: justify; text-indent: 2em; }
.doc-list { margin: 0 0 12px 1.6em; padding-left: 1.2em; font-size: 14px; line-height: 1.9; color: #1f2937; }
.doc-list li { margin: 2px 0; }
.doc-list li span { display: inline-block; min-width: 40px; }
.doc-p strong, .doc-h strong, .doc-title-main strong { color: #0f172a; }
.doc-metrics { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
.doc-metric { flex: 1 1 140px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 12px; background: var(--el-fill-color-lighter); }
.doc-metric-label { font-size: 11px; color: var(--color-text-secondary); }
.doc-metric-value { font-size: 20px; font-weight: 700; color: var(--color-text); margin-top: 2px; }
.doc-metric-hint { font-size: 11px; color: var(--color-text-tertiary); margin-top: 2px; }
.doc-table { margin: 8px 0; }
.doc-table :deep(.el-table__header-wrapper th .cell) { white-space: nowrap; font-weight: 600; color: var(--color-text-secondary); }
.doc-table :deep(.el-table__cell) { padding: 7px 0; }
.doc-table :deep(.cell) { font-size: 12px; }
.doc-chart { height: 280px; margin: 8px 0; }
.doc-image { max-width: 100%; border-radius: 6px; margin: 8px 0; }
.doc-caption { font-size: 11px; color: var(--color-text-tertiary); text-align: center; margin: 4px 0 10px; }
.doc-empty { font-size: 12px; color: var(--color-text-tertiary); padding: 10px 0; }
.doc-err { font-size: 12px; color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, transparent); border-left: 3px solid var(--color-danger); padding: 6px 10px; margin: 8px 0; white-space: pre-wrap; }
.doc-break { border: none; border-top: 1px dashed var(--el-border-color); margin: 16px 0; }

/* ===== 原位编辑 ===== */
.doc-edit-toolbar {
  position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 6px 8px; margin: -4px -4px 8px; border-bottom: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-bg-color) 92%, transparent); backdrop-filter: blur(4px);
}
.doc-edit-toolbar button {
  min-width: 28px; height: 24px; padding: 0 7px; border: 1px solid var(--el-border-color-lighter); border-radius: 5px;
  background: var(--el-bg-color); color: var(--color-text-secondary); font-size: 12px; cursor: pointer;
}
.doc-edit-toolbar button:hover { color: var(--el-color-primary); border-color: color-mix(in srgb, var(--el-color-primary) 40%, transparent); }
.doc-tb-sep { width: 1px; height: 16px; background: var(--el-border-color-lighter); margin: 0 4px; }
.doc-tb-tip { font-size: 11px; color: var(--color-text-tertiary); margin-left: auto; }
.doc-editable { outline: 1px dashed transparent; border-radius: 3px; transition: background .12s, outline-color .12s; }
.doc-editable:hover { outline-color: color-mix(in srgb, var(--el-color-primary) 35%, transparent); background: color-mix(in srgb, var(--el-color-primary) 3%, transparent); }
.doc-editable:focus { outline: 1px solid var(--el-color-primary); background: color-mix(in srgb, var(--el-color-primary) 5%, transparent); }
.doc-metrics-edit { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
.doc-metrics-edit td { border: 1px solid var(--el-border-color-lighter); padding: 5px 8px; font-size: 12px; }
.doc-metrics-edit td.lbl { width: 30%; background: var(--el-fill-color-lighter); font-weight: 600; color: var(--color-text-secondary); }
.doc-metrics-edit td.val { width: 34%; font-weight: 700; font-size: 13px; }
.doc-metrics-edit td.hint { color: var(--color-text-tertiary); }
.doc-metrics-edit span, .doc-table-edit span { display: block; min-height: 18px; }
.doc-table-edit { width: 100%; border-collapse: collapse; margin: 6px 0; }
.doc-table-edit th, .doc-table-edit td { border: 1px solid var(--el-border-color-lighter); padding: 5px 8px; font-size: 12px; text-align: left; }
.doc-table-edit th { background: var(--el-fill-color-lighter); font-weight: 600; color: var(--color-text-secondary); }
.doc-chart-cfg { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px; margin-top: 4px; border: 1px dashed var(--el-border-color-lighter); border-radius: 6px; }
.doc-edit-label { font-size: 12px; color: var(--color-text-secondary); }
.doc-mini-btn { height: 24px; padding: 0 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 5px; background: var(--el-bg-color); color: var(--color-text-secondary); font-size: 12px; cursor: pointer; }
.doc-mini-btn:hover { color: var(--el-color-primary); border-color: color-mix(in srgb, var(--el-color-primary) 40%, transparent); }
.doc-chart-data { margin-top: 6px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px; background: var(--el-fill-color-lighter); overflow: auto; }
.doc-chart-data table { width: 100%; border-collapse: collapse; }
.doc-chart-data th, .doc-chart-data td { border: 1px solid var(--el-border-color-lighter); padding: 3px; font-size: 12px; }
.doc-chart-data th { background: var(--el-bg-color); font-weight: 600; color: var(--color-text-secondary); white-space: nowrap; }
.doc-data-input { width: 100%; min-width: 90px; border: 0; background: transparent; font: inherit; color: var(--color-text); padding: 2px 4px; }
.doc-data-input:focus { outline: 1px solid var(--el-color-primary); border-radius: 3px; background: var(--el-bg-color); }
.doc-inline-ops { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.doc-edit-hint { font-size: 11px; color: var(--color-text-tertiary); margin: 4px 0 8px; }
</style>

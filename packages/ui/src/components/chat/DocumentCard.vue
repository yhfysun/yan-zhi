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
      <span class="doc-title">{{ effectiveDoc.title }}</span>
      <span class="doc-type">{{ typeName }}</span>
      <div class="doc-actions">
        <button class="doc-btn" :disabled="exporting" @click="exportYdoc">.ydoc</button>
        <button class="doc-btn" :disabled="exporting" @click="exportWord">
          {{ exporting ? '导出中…' : '导出 Word' }}
        </button>
      </div>
    </div>

    <div class="doc-body">
      <div v-if="effectiveDoc.subtitle" class="doc-subtitle">{{ effectiveDoc.subtitle }}</div>

      <!-- 变量表单：模板声明了 variables 时，渲染前先让用户填 -->
      <div v-if="typeDef?.variables?.length" class="doc-vars">
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
          :class="'doc-h' + s.level"
        >{{ s.text }}</component>

        <p v-else-if="s.kind === 'paragraph'" class="doc-p">{{ s.text }}</p>

        <div v-else-if="s.kind === 'metrics'" class="doc-metrics">
          <div v-for="(m, mi) in s.items" :key="mi" class="doc-metric">
            <div class="doc-metric-label">{{ m.label }}</div>
            <div class="doc-metric-value">{{ m.value }}</div>
            <div v-if="m.hint" class="doc-metric-hint">{{ m.hint }}</div>
          </div>
        </div>

        <template v-else-if="s.kind === 'table'">
          <div v-if="tableError[i]" class="doc-err">{{ tableError[i] }}</div>
          <div v-else-if="!tableOf(i, s).columns.length" class="doc-empty">取数中…</div>
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
            <div v-if="s.caption" class="doc-caption">{{ s.caption }}</div>
          </template>
        </template>

        <template v-else-if="s.kind === 'chart'">
          <div v-if="chartError[i]" class="doc-err">{{ chartError[i] }}</div>
          <div v-else-if="!chartData[i]" class="doc-empty">图表取数中…</div>
          <div v-else class="doc-chart">
            <DataChart :ref="(el: any) => setChartRef(i, el)" :spec="s.spec" :data="chartData[i]!" />
          </div>
          <div v-if="s.caption" class="doc-caption">{{ s.caption }}</div>
        </template>

        <template v-else-if="s.kind === 'infographic'">
          <InfographicBlock :ref="(el: any) => setIgRef(i, el)" :syntax="s.syntax" :title="s.title" :height="360" />
          <div v-if="s.caption" class="doc-caption">{{ s.caption }}</div>
        </template>

        <template v-else-if="s.kind === 'image'">
          <img class="doc-image" :src="s.src" alt="" />
          <div v-if="s.caption" class="doc-caption">{{ s.caption }}</div>
        </template>

        <hr v-else-if="s.kind === 'pageBreak'" class="doc-break" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue';
import { Document } from '@element-plus/icons-vue';
import { api } from '../../api/client';
import type { ChartData } from './chart-spec';
import type { DocumentDataContract, DocumentInstance, DocumentSection } from '../../utils/document-types';
import { applyDocumentVariables, findDocumentType } from '../../utils/document-types';
import { useDocumentTypeStore } from '../../stores/document-type';
import { buildReportDocx, type DocxBlock } from '../../utils/report-docx';
import { toYdoc } from '../../utils/ydoc';

const DataChart = defineAsyncComponent(() => import('./DataChart.vue'));
const InfographicBlock = defineAsyncComponent(() => import('./InfographicBlock.vue'));

const props = defineProps<{ doc: DocumentInstance }>();

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

const chartData = reactive<Record<number, ChartData | null>>({});
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

async function loadChart(i: number, s: Extract<DocumentSection, { kind: 'chart' }>) {
  const spec = s.spec;
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

function safeName(): string {
  return (effectiveDoc.value.title || 'document').replace(/[\\/:*?"<>|]/g, '_');
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

/** 导出中间格式：与聊天围栏同构，可再次导入/编辑/版本化 */
function exportYdoc() {
  downloadBlob(new Blob([toYdoc(effectiveDoc.value)], { type: 'application/json;charset=utf-8' }), `${safeName()}.ydoc`);
}

async function exportWord() {
  exporting.value = true;
  try {
    const doc = effectiveDoc.value;
    const blocks: DocxBlock[] = [];
    for (let i = 0; i < doc.sections.length; i++) {
      const s = doc.sections[i];
      if (s.kind === 'heading') { blocks.push({ type: 'heading', level: s.level, text: s.text }); continue; }
      if (s.kind === 'paragraph') { blocks.push({ type: 'paragraph', text: s.text }); continue; }
      if (s.kind === 'metrics') { blocks.push({ type: 'metrics', items: s.items }); continue; }
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

    const blob = await buildReportDocx({
      title: doc.title,
      ...(doc.subtitle ? { subtitle: doc.subtitle } : {}),
      ...(doc.author ? { author: doc.author } : {}),
      blocks,
    });
    downloadBlob(blob, `${safeName()}.docx`);
  } finally {
    exporting.value = false;
  }
}

onMounted(() => {
  void docTypeStore.load();
  props.doc.sections.forEach((s, i) => {
    if (s.kind === 'chart') void loadChart(i, s);
    if (s.kind === 'table' && s.contract) void loadTable(i, s);
  });
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
.doc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.doc-body { padding: 14px 16px 18px; }
.doc-subtitle { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 12px; }
.doc-vars { display: flex; flex-wrap: wrap; gap: 10px; padding: 8px 10px; margin-bottom: 10px; border: 1px dashed var(--el-border-color); border-radius: 6px; background: var(--el-fill-color-lighter); }
.doc-var { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-secondary); }
.doc-h { color: var(--color-text); margin: 14px 0 8px; }
.doc-h1 { font-size: 18px; }
.doc-h2 { font-size: 16px; }
.doc-h3 { font-size: 14px; }
.doc-p { font-size: 13px; line-height: 1.75; color: var(--color-text); margin: 6px 0; white-space: pre-wrap; }
.doc-metrics { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
.doc-metric { flex: 1 1 140px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 12px; background: var(--el-fill-color-lighter); }
.doc-metric-label { font-size: 11px; color: var(--color-text-secondary); }
.doc-metric-value { font-size: 20px; font-weight: 700; color: var(--color-text); margin-top: 2px; }
.doc-metric-hint { font-size: 11px; color: var(--color-text-tertiary); margin-top: 2px; }
.doc-table { margin: 8px 0; }
.doc-chart { height: 280px; margin: 8px 0; }
.doc-image { max-width: 100%; border-radius: 6px; margin: 8px 0; }
.doc-caption { font-size: 11px; color: var(--color-text-tertiary); text-align: center; margin: 4px 0 10px; }
.doc-empty { font-size: 12px; color: var(--color-text-tertiary); padding: 10px 0; }
.doc-err { font-size: 12px; color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, transparent); border-left: 3px solid var(--color-danger); padding: 6px 10px; margin: 8px 0; white-space: pre-wrap; }
.doc-break { border: none; border-top: 1px dashed var(--el-border-color); margin: 16px 0; }
</style>

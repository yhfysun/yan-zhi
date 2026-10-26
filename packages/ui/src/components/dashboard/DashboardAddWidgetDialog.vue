<!--
看板「添加组件」：图表/明细走本体取数（业务字段名，不暴露 SQL），指标卡/文本为静态内容。
只写入「取数契约 + 图表定义」，行数据仍由卡片活取数。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    title="添加组件"
    width="520px"
    append-to-body
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="daw">
      <div class="daw-kinds">
        <button
          v-for="k in kindOptions"
          :key="k.key"
          class="daw-kind"
          :class="{ on: kind === k.key }"
          @click="pickKind(k.key)"
        >{{ k.label }}</button>
      </div>

      <template v-if="needsData">
        <div class="daw-row">
          <span class="daw-label">本体</span>
          <el-select v-model="ontologyRef" filterable size="small" placeholder="选择本体" style="width: 200px" @change="loadMenu">
            <el-option v-for="o in ontologies" :key="o.code" :label="o.name" :value="o.code" />
          </el-select>
        </div>

        <template v-if="menu">
          <div class="daw-row">
            <span class="daw-label">分组</span>
            <el-select v-model="xField" size="small" filterable placeholder="选择维度" style="width: 200px">
              <el-option-group v-if="menu.timeDimensions.length" label="时间维度">
                <el-option v-for="t in menu.timeDimensions" :key="t.name" :label="t.name" :value="t.name" />
              </el-option-group>
              <el-option v-for="d in menu.dimensions" :key="d.name" :label="d.name" :value="d.name" />
            </el-select>
            <template v-if="kind !== 'table' && isTimeX">
              <span class="daw-label">粒度</span>
              <el-select v-model="grain" size="small" style="width: 84px">
                <el-option label="日" value="day" />
                <el-option label="周" value="week" />
                <el-option label="月" value="month" />
                <el-option label="季" value="quarter" />
                <el-option label="年" value="year" />
              </el-select>
            </template>
          </div>

          <div class="daw-row">
            <span class="daw-label">度量</span>
            <el-select
              v-model="measures"
              :multiple="kind !== 'table'"
              collapse-tags
              collapse-tags-tooltip
              filterable
              clearable
              size="small"
              :placeholder="kind === 'table' ? '不带度量就取明细' : '至少选一个度量'"
              style="width: 300px"
            >
              <el-option v-for="m in menu.measures" :key="m.name" :label="m.name" :value="m.name" />
            </el-select>
          </div>
        </template>
      </template>

      <template v-else-if="kind === 'metric'">
        <div class="daw-row">
          <span class="daw-label">指标名</span>
          <el-input v-model="metricLabel" size="small" placeholder="如 本月成交额" style="width: 300px" />
        </div>
        <div class="daw-row">
          <span class="daw-label">数值</span>
          <el-input v-model="metricValue" size="small" placeholder="如 ¥12.8 万" style="width: 300px" />
        </div>
        <div class="daw-row">
          <span class="daw-label">说明</span>
          <el-input v-model="metricHint" size="small" placeholder="可选，如 环比 +8%" style="width: 300px" />
        </div>
      </template>

      <template v-else>
        <div class="daw-row daw-row-top">
          <span class="daw-label">文本</span>
          <el-input v-model="text" type="textarea" :rows="4" placeholder="写一段说明文字" style="width: 300px" />
        </div>
      </template>

      <div class="daw-row">
        <span class="daw-label">标题</span>
        <el-input v-model="title" size="small" :placeholder="defaultTitle" style="width: 300px" />
      </div>

      <div v-if="error" class="daw-error">{{ error }}</div>
    </div>

    <template #footer>
      <el-button size="small" @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button size="small" type="primary" :loading="saving" @click="submit">添加</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { DashboardWidget, DashboardWidgetKind } from '@yan-zhi/shared';
import type { ChartKind } from '../chat/chart-spec';
import { api } from '../../api/client';
import { useDashboardStore } from '../../stores/dashboard';

interface OntMenu {
  code: string;
  name: string;
  timeDimensions: Array<{ name: string }>;
  dimensions: Array<{ name: string }>;
  measures: Array<{ name: string; agg?: string }>;
}

type KindKey = ChartKind | 'table' | 'metric' | 'text';

const props = defineProps<{ modelValue: boolean; dashboardId: string }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'added'): void;
}>();

const dashStore = useDashboardStore();

const kindOptions: Array<{ key: KindKey; label: string }> = [
  { key: 'line', label: '折线图' },
  { key: 'bar', label: '柱状图' },
  { key: 'pie', label: '饼图' },
  { key: 'area', label: '面积图' },
  { key: 'table', label: '明细表' },
  { key: 'metric', label: '指标卡' },
  { key: 'text', label: '文本' },
];

const kind = ref<KindKey>('line');
const needsData = computed(() => kind.value !== 'metric' && kind.value !== 'text');

const ontologies = ref<Array<{ code: string; name: string }>>([]);
const ontologyRef = ref('');
const menu = ref<OntMenu | null>(null);
const xField = ref('');
const measures = ref<string[]>([]);
const grain = ref<'day' | 'week' | 'month' | 'quarter' | 'year'>('day');

const metricLabel = ref('');
const metricValue = ref('');
const metricHint = ref('');
const text = ref('');
const title = ref('');
const saving = ref(false);
const error = ref('');

const isTimeX = computed(() => !!menu.value?.timeDimensions.some((t) => t.name === xField.value));

const defaultTitle = computed(() => {
  if (kind.value === 'text') return '文本';
  if (kind.value === 'metric') return metricLabel.value || '指标';
  return menu.value ? `${menu.value.name} · ${xField.value || '明细'}` : '组件';
});

async function loadOntologies(): Promise<void> {
  const r = await api.get<Array<{ code: string; name: string }>>('/ontologies');
  if ('error' in r) { error.value = String(r.error); return; }
  ontologies.value = r.data || [];
  if (!ontologyRef.value && ontologies.value.length) {
    ontologyRef.value = ontologies.value[0].code;
    await loadMenu();
  }
}

async function loadMenu(): Promise<void> {
  menu.value = null;
  xField.value = '';
  measures.value = [];
  if (!ontologyRef.value) return;
  const r = await api.get<OntMenu>(`/query-contract/ontology/${encodeURIComponent(ontologyRef.value)}`);
  if ('error' in r) { error.value = String(r.error); return; }
  menu.value = r.data;
  xField.value = r.data.timeDimensions[0]?.name || r.data.dimensions[0]?.name || '';
  if (kind.value !== 'table') measures.value = r.data.measures[0] ? [r.data.measures[0].name] : [];
}

function pickKind(k: KindKey): void {
  kind.value = k;
  error.value = '';
  if (k === 'table') measures.value = measures.value.slice(0, 1);
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `dw_${crypto.randomUUID()}`
    : `dw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function buildWidget(): DashboardWidget | null {
  const id = newId();
  const widgetTitle = title.value.trim() || defaultTitle.value;

  if (kind.value === 'text') {
    if (!text.value.trim()) { error.value = '文本内容不能为空'; return null; }
    return { id, kind: 'text', title: widgetTitle, text: text.value, pos: { x: 0, y: 0, w: 12, h: 3 } };
  }

  if (kind.value === 'metric') {
    if (!metricLabel.value.trim() || !metricValue.value.trim()) { error.value = '指标名与数值都要填'; return null; }
    return {
      id,
      kind: 'metric',
      title: widgetTitle,
      metrics: [{ label: metricLabel.value.trim(), value: metricValue.value.trim(), ...(metricHint.value.trim() ? { hint: metricHint.value.trim() } : {}) }],
      pos: { x: 0, y: 0, w: 4, h: 4 },
    };
  }

  if (!ontologyRef.value) { error.value = '请选择本体'; return null; }
  if (!xField.value) { error.value = '请选择分组维度'; return null; }
  if (kind.value !== 'table' && !measures.value.length) { error.value = '图表至少需要一个度量'; return null; }

  const widgetKind: DashboardWidgetKind = kind.value === 'table' ? 'table' : 'chart';
  const spec: Record<string, unknown> = {
    dim: xField.value,
    measure: measures.value[0] || '',
    measures: [...measures.value],
    ...(kind.value !== 'table' && isTimeX.value ? { timeGrain: grain.value } : {}),
    ...(kind.value !== 'table' ? { kind: kind.value } : {}),
  };
  return {
    id,
    kind: widgetKind,
    title: widgetTitle,
    contract: { mode: 'ontology', ontology: ontologyRef.value },
    spec,
    pos: widgetKind === 'chart' ? { x: 0, y: 0, w: 6, h: 6 } : { x: 0, y: 0, w: 12, h: 5 },
  };
}

async function submit(): Promise<void> {
  error.value = '';
  const widget = buildWidget();
  if (!widget) return;
  saving.value = true;
  const updated = await dashStore.saveWidget(props.dashboardId, widget);
  saving.value = false;
  if (!updated) { error.value = dashStore.error || '添加失败'; return; }
  ElMessage.success('已添加组件');
  emit('added');
  emit('update:modelValue', false);
}

/** 每次打开都重置表单（不保留上次选择的脏状态） */
watch(() => props.modelValue, async (open) => {
  if (!open) return;
  error.value = '';
  title.value = '';
  text.value = '';
  metricLabel.value = '';
  metricValue.value = '';
  metricHint.value = '';
  if (!ontologies.value.length) await loadOntologies();
});
</script>

<style scoped>
.daw { display: flex; flex-direction: column; gap: 10px; }
.daw-kinds { display: flex; flex-wrap: wrap; gap: 6px; }
.daw-kind { padding: 4px 10px; font-size: 12px; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--color-text-secondary); cursor: pointer; }
.daw-kind:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.daw-kind.on { border-color: var(--el-color-primary); background: color-mix(in srgb, var(--el-color-primary) 12%, transparent); color: var(--el-color-primary); font-weight: 600; }
.daw-row { display: flex; align-items: center; gap: 8px; }
.daw-row-top { align-items: flex-start; }
.daw-label { flex: 0 0 46px; font-size: 12px; color: var(--color-text-secondary); }
.daw-error { font-size: 12px; color: var(--el-color-danger); }
</style>

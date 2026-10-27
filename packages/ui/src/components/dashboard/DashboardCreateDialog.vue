<!--
新建看板（对齐 harness 的创建流程）：
- 从**当前会话**里收集图表候选：build_chart_dsl 的 [ychart] 产物 + 内嵌数据视图（带当前图表配置时按图表，否则按明细表）
- 勾选（默认全选）→ 自动排版 → 建看板并逐个保存 widget
不再只弹一个「输入名称」的框，建完是空看板。
-->
<template>
  <el-dialog
    :model-value="modelValue"
    title="新建看板"
    width="560px"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="dcd">
      <div class="dcd-field">
        <span class="dcd-label">看板名称</span>
        <el-input v-model="title" maxlength="40" placeholder="看板名称" @keyup.enter="create" />
      </div>

      <div class="dcd-cands">
        <div class="dcd-cands-head">
          <span class="dcd-cands-title">本任务中的图表</span>
          <span class="dcd-cands-count">{{ pickedCount }} / {{ candidates.length }}</span>
          <el-button v-if="candidates.length" text size="small" class="dcd-toggle" @click="toggleAll">
            {{ allPicked ? '全不选' : '全选' }}
          </el-button>
        </div>
        <div v-if="!candidates.length" class="dcd-empty">
          本任务还没有可用的图表。先让智能体出图（或在内嵌数据视图里切到图表），再回来新建看板；
          也可以直接创建空看板，之后从数据工作台「钉到看板」添加。
        </div>
        <label
          v-for="c in candidates"
          :key="c.key"
          class="dcd-item"
          :class="{ on: !!selected[c.key] }"
        >
          <el-checkbox v-model="selected[c.key]" />
          <span class="dcd-item-title" :title="c.title">{{ c.title }}</span>
          <span class="dcd-item-kind" :class="c.widget.kind">{{ c.kindLabel }}</span>
        </label>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="creating" :disabled="!title.trim()" @click="create">
        {{ candidates.length ? `生成看板（${pickedCount}）` : '创建空看板' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { DashboardWidget, InlineDataView } from '@yan-zhi/shared';
import { useDashboardStore } from '../../stores/dashboard';
import { useChat } from '../../composables/chat/useChat';
import { collectRoundToolTexts } from '../../composables/chat/message-rounds';
import { collectChartDsls, type ChartDslFile } from '../../utils/chart-file';
import type { ChartSpec } from '../chat/chart-spec';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created', id: string): void;
}>();

const KIND_LABEL: Record<string, string> = {
  line: '折线图', area: '面积图', bar: '柱状图', pie: '饼图', scatter: '散点图', table: '明细表',
};

interface Candidate {
  key: string;
  title: string;
  kindLabel: string;
  widget: DashboardWidget;
}

const { messageRounds, currentConv } = useChat();
const dashStore = useDashboardStore();
const MAX_WIDGETS = 40;

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `dw_${crypto.randomUUID()}`
    : `dw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function dataViewKey(v: InlineDataView): string {
  return `${v.title || ''}|${v.base || ''}|${v.table || ''}|${v.ontology || ''}|${v.path || ''}|${v.datasourceId || ''}`;
}

/** 契约里存过的图表配置 → ChartSpec；没配过图表的视图按明细表处理 */
function specOfView(dv: InlineDataView): ChartSpec | null {
  const c = dv.chart;
  if (!c || !c.dim) return null;
  const measures = c.measures?.length ? [...c.measures] : undefined;
  return {
    kind: (c.kind || 'line') as ChartSpec['kind'],
    dim: c.dim,
    measure: c.measure || measures?.[0] || '',
    ...(measures ? { measures } : {}),
    ...(c.series ? { series: c.series } : {}),
    ...(c.timeGrain ? { timeGrain: c.timeGrain as ChartSpec['timeGrain'] } : {}),
    ...(c.agg ? { agg: c.agg as ChartSpec['agg'] } : {}),
    ...(c.topN ? { topN: c.topN } : {}),
    ...(c.percent ? { percent: true } : {}),
  };
}

function widgetFromChartDsl(dsl: ChartDslFile): DashboardWidget {
  const isTable = dsl.kind === 'table';
  return {
    id: uid(),
    kind: isTable ? 'table' : 'chart',
    title: dsl.title,
    contract: { mode: 'file', path: dsl.dataPath, title: dsl.title },
    spec: isTable ? {} : {
      kind: dsl.kind,
      dim: dsl.dim,
      measure: dsl.measures[0] || '',
      measures: [...dsl.measures],
      ...(dsl.series ? { series: dsl.series } : {}),
      ...(dsl.topN ? { topN: dsl.topN } : {}),
      ...(dsl.percent ? { percent: true } : {}),
    },
    pos: { x: 0, y: 0, w: isTable ? 12 : 6, h: isTable ? 5 : 6 },
  };
}

function widgetFromDataView(dv: InlineDataView, spec: ChartSpec | null): DashboardWidget {
  return {
    id: uid(),
    kind: spec ? 'chart' : 'table',
    title: dv.title || '数据明细',
    contract: { ...dv },
    spec: spec ? {
      kind: spec.kind,
      dim: spec.dim,
      measure: spec.measure,
      ...(spec.measures?.length ? { measures: [...spec.measures] } : {}),
      ...(spec.series ? { series: spec.series } : {}),
      ...(spec.timeGrain ? { timeGrain: spec.timeGrain } : {}),
      ...(spec.agg ? { agg: spec.agg } : {}),
      ...(spec.topN ? { topN: spec.topN } : {}),
      ...(spec.percent ? { percent: true } : {}),
    } : {},
    pos: { x: 0, y: 0, w: 6, h: 6 },
  };
}

/** 扫当前会话的每一轮：图表 DSL 优先，其次是内嵌数据视图（去重） */
const candidates = computed<Candidate[]>(() => {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const round of messageRounds.value) {
    for (const dsl of collectChartDsls(collectRoundToolTexts(round))) {
      const key = `ychart:${dsl.dataPath}:${dsl.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, title: dsl.title || '图表', kindLabel: KIND_LABEL[dsl.kind] || dsl.kind, widget: widgetFromChartDsl(dsl) });
    }
    const views = round.dataViews?.length ? round.dataViews : (round.dataView ? [round.dataView] : []);
    for (const dv of views) {
      const key = `dv:${dataViewKey(dv)}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const spec = specOfView(dv);
      out.push({
        key,
        title: dv.title || '数据明细',
        kindLabel: spec ? (KIND_LABEL[spec.kind] || spec.kind) : '明细表',
        widget: widgetFromDataView(dv, spec),
      });
    }
  }
  return out;
});

const title = ref('');
const selected = reactive<Record<string, boolean>>({});
const creating = ref(false);

const pickedCount = computed(() => candidates.value.filter((c) => selected[c.key]).length);
const allPicked = computed(() => candidates.value.length > 0 && pickedCount.value === candidates.value.length);

function toggleAll(): void {
  const next = !allPicked.value;
  for (const c of candidates.value) selected[c.key] = next;
}

// 每次打开都重置：名称默认取会话标题，候选默认全选
watch(() => props.modelValue, (open) => {
  if (!open) return;
  title.value = currentConv.value?.title || '我的看板';
  for (const k of Object.keys(selected)) delete selected[k];
  for (const c of candidates.value) selected[c.key] = true;
}, { immediate: true });

/** 自动排版：图表半宽（6 列）两两一行，明细表整行（12 列） */
function layoutPositions(list: Candidate[]): Map<string, { x: number; y: number; w: number; h: number }> {
  const map = new Map<string, { x: number; y: number; w: number; h: number }>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const c of list) {
    const w = c.widget.kind === 'table' ? 12 : 6;
    const h = c.widget.kind === 'table' ? 5 : 6;
    if (x + w > 12) { x = 0; y += rowH; rowH = 0; }
    map.set(c.key, { x, y, w, h });
    x += w;
    rowH = Math.max(rowH, h);
    if (x >= 12) { x = 0; y += rowH; rowH = 0; }
  }
  return map;
}

async function create(): Promise<void> {
  const name = title.value.trim();
  if (!name || creating.value) return;
  creating.value = true;
  try {
    const created = await dashStore.create(name);
    if (!created) { ElMessage.error(dashStore.error || '新建看板失败'); return; }
    const all = candidates.value.filter((c) => selected[c.key]);
    const chosen = all.slice(0, MAX_WIDGETS);
    if (all.length > MAX_WIDGETS) ElMessage.warning(`看板最多 ${MAX_WIDGETS} 个组件，已取前 ${MAX_WIDGETS} 个`);
    const posMap = layoutPositions(chosen);
    let saved = 0;
    for (const c of chosen) {
      const ok = await dashStore.saveWidget(created.id, { ...c.widget, pos: posMap.get(c.key)! });
      if (!ok) break;
      saved += 1;
    }
    if (saved !== chosen.length) {
      ElMessage.error(`${dashStore.error || '保存图表失败'}（已保存 ${saved}/${chosen.length}）`);
    } else {
      ElMessage.success(chosen.length ? `已生成看板：${saved} 个图表` : '已创建空看板');
    }
    emit('created', created.id);
    emit('update:modelValue', false);
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.dcd { display: flex; flex-direction: column; gap: 14px; }
.dcd-field { display: flex; align-items: center; gap: 10px; }
.dcd-label { flex: none; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.dcd-cands { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; }
.dcd-cands-head { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: var(--el-fill-color-lighter); border-bottom: 1px solid var(--el-border-color-lighter); }
.dcd-cands-title { font-size: 12px; font-weight: 600; color: var(--color-text); }
.dcd-cands-count { font-size: 12px; color: var(--color-text-tertiary); }
.dcd-toggle { margin-left: auto; }
.dcd-empty { padding: 16px 12px; font-size: 12px; line-height: 1.7; color: var(--color-text-tertiary); }
.dcd-item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-bottom: 1px solid var(--el-border-color-lighter); cursor: pointer; transition: background .12s ease; }
.dcd-item:last-child { border-bottom: 0; }
.dcd-item:hover { background: var(--el-fill-color-light); }
.dcd-item.on { background: color-mix(in srgb, var(--el-color-primary) 4%, transparent); }
.dcd-item-title { flex: 1 1 auto; min-width: 0; font-size: 12.5px; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcd-item-kind { flex: none; font-size: 11px; color: var(--color-text-tertiary); border: 1px solid var(--el-border-color-lighter); border-radius: 4px; padding: 0 6px; line-height: 1.7; }
.dcd-item-kind.chart { color: var(--el-color-primary); border-color: color-mix(in srgb, var(--el-color-primary) 35%, transparent); }
</style>

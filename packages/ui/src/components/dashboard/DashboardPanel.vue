<!--
看板面板：左侧看板列表，右侧 12 列网格。
- 拖拽卡片到另一张卡上 → 重排（HTML5 drag，不引第三方布局库）
- 卡片宽度在 4 / 6 / 12 列之间循环，立即落库
- 数据按 widget 契约活取数，见 DashboardWidgetCard
-->
<template>
  <div class="dash-root">
    <aside class="dash-side">
      <div class="dash-side-head">
        <span class="dash-side-title">看板</span>
        <el-button size="small" text @click="createNew">+ 新建</el-button>
      </div>
      <div v-if="store.error" class="dash-error">{{ store.error }}</div>
      <div
        v-for="d in store.list"
        :key="d.id"
        class="dash-side-item"
        :class="{ on: d.id === store.current?.id }"
        @click="openDash(d.id)"
      >
        <div class="dash-side-item-title">{{ d.title }}</div>
        <div class="dash-side-item-meta">{{ d.widgetCount }} 个组件</div>
        <button class="dash-side-del" title="删除看板" @click.stop="removeDash(d.id)">×</button>
      </div>
      <div v-if="!store.list.length && !store.loading" class="dash-side-empty">还没有看板</div>
    </aside>

    <section class="dash-main">
      <div v-if="!store.current" class="dash-empty">
        <div>选择左侧看板，或从数据工作台点「钉到看板」把当前图表/明细钉进来。</div>
        <el-button type="primary" size="small" @click="createNew">新建看板</el-button>
      </div>
      <template v-else>
        <div class="dash-main-head">
          <span class="dash-main-title">{{ store.current.title }}</span>
          <span class="dash-main-meta">{{ widgets.length }} / {{ MAX_WIDGETS }} 个组件 · 拖动卡片排序</span>
          <el-button size="small" type="primary" @click="openAdd">+ 添加组件</el-button>
          <el-button size="small" text @click="renameCurrent">重命名</el-button>
        </div>
        <div v-if="!widgets.length" class="dash-empty">
          <div>这个看板还是空的：选图表类型 → 选本体与维度度量，或者从数据工作台点「钉到看板」。</div>
          <el-button type="primary" size="small" @click="openAdd">添加组件</el-button>
        </div>
        <div v-else class="dash-grid">
          <div
            v-for="w in widgets"
            :key="w.id"
            class="dash-cell"
            :style="cellStyle(w)"
            @dragover.prevent
            @drop.prevent="onDrop(w.id)"
          >
            <DashboardWidgetCard
              :widget="w"
              :dragging="dragId === w.id"
              @remove="removeWidget(w.id)"
              @cycle-width="cycleWidth(w)"
              @dragstart="onDragStart(w.id, $event)"
              @dragend="dragId = ''"
            />
          </div>
        </div>
      </template>
    </section>

    <DashboardAddWidgetDialog
      v-if="store.current"
      v-model="addOpen"
      :dashboard-id="store.current.id"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { DashboardWidget } from '@yan-zhi/shared';
import { useDashboardStore } from '../../stores/dashboard';
import DashboardWidgetCard from './DashboardWidgetCard.vue';
import DashboardAddWidgetDialog from './DashboardAddWidgetDialog.vue';

const MAX_WIDGETS = 40;
const store = useDashboardStore();
const dragId = ref('');
const addOpen = ref(false);

const widgets = computed<DashboardWidget[]>(() => store.current?.widgets || []);

function openAdd(): void {
  if (!store.current) return;
  addOpen.value = true;
}

function cellStyle(w: DashboardWidget) {
  return {
    gridColumn: `span ${Math.min(12, Math.max(1, w.pos.w))}`,
    gridRow: `span ${Math.max(1, w.pos.h)}`,
  };
}

onMounted(async () => {
  await store.loadList();
  if (!store.current && store.list.length) await store.open(store.list[0].id);
});

async function openDash(id: string): Promise<void> {
  await store.open(id);
}

async function createNew(): Promise<void> {
  let title = '';
  try {
    const r = await ElMessageBox.prompt('看板名称', '新建看板', {
      inputValue: '我的看板',
      inputValidator: (v) => (!!String(v || '').trim() || '名称不能为空'),
    });
    title = String(r.value || '').trim();
  } catch { return; }
  if (!title) return;
  const created = await store.create(title);
  // 新建后直接进入「添加组件」：否则空看板是个死胡同（没有任何可下手的地方）
  if (created && !(created.widgets || []).length) addOpen.value = true;
}

async function renameCurrent(): Promise<void> {
  const cur = store.current;
  if (!cur) return;
  let title = '';
  try {
    const r = await ElMessageBox.prompt('看板名称', '重命名', { inputValue: cur.title });
    title = String(r.value || '').trim();
  } catch { return; }
  if (!title || title === cur.title) return;
  await store.rename(cur.id, title);
}

async function removeDash(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后该看板及其全部组件不可恢复。', '删除看板', { type: 'warning' });
  } catch { return; }
  await store.remove(id);
}

function onDragStart(id: string, ev: DragEvent): void {
  dragId.value = id;
  ev.dataTransfer?.setData('text/plain', id);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}

/** 拖到目标卡上：把拖动项插到目标位置，落库 sort_order */
async function onDrop(targetId: string): Promise<void> {
  const sourceId = dragId.value;
  dragId.value = '';
  const dash = store.current;
  if (!dash || !sourceId || sourceId === targetId) return;
  const ids = (dash.widgets || []).map((w) => w.id);
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return;
  ids.splice(to, 0, ...ids.splice(from, 1));
  await store.reorder(dash.id, ids);
}

/** 宽度在 4 / 6 / 12 之间循环（12 栅格，常见 BI 三档） */
async function cycleWidth(w: DashboardWidget): Promise<void> {
  const dash = store.current;
  if (!dash) return;
  const next = w.pos.w === 4 ? 6 : w.pos.w === 6 ? 12 : 4;
  await store.saveWidget(dash.id, { ...w, pos: { ...w.pos, w: next } });
}

async function removeWidget(id: string): Promise<void> {
  const dash = store.current;
  if (!dash) return;
  await store.removeWidget(dash.id, id);
  ElMessage.success('已移除');
}
</script>

<style scoped>
.dash-root { display: flex; height: 100%; min-height: 0; }
.dash-side { flex: 0 0 200px; display: flex; flex-direction: column; border-right: 1px solid var(--el-border-color-lighter); min-height: 0; }
.dash-side-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--el-border-color-lighter); }
.dash-side-title { font-size: 13px; font-weight: 600; color: var(--color-text); }
.dash-side-item { position: relative; padding: 8px 26px 8px 10px; cursor: pointer; border-bottom: 1px solid var(--el-border-color-lighter); }
.dash-side-item:hover { background: var(--el-fill-color-lighter); }
.dash-side-item.on { background: color-mix(in srgb, var(--el-color-primary) 10%, transparent); }
.dash-side-item-title { font-size: 12px; font-weight: 600; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-side-item-meta { font-size: 11px; color: var(--color-text-tertiary); }
.dash-side-del { position: absolute; top: 6px; right: 6px; border: none; background: transparent; color: var(--color-text-tertiary); cursor: pointer; font-size: 14px; }
.dash-side-del:hover { color: var(--el-color-danger); }
.dash-side-empty { padding: 16px; font-size: 12px; color: var(--color-text-tertiary); text-align: center; }
.dash-main { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 8px 10px; }
.dash-main-head { display: flex; align-items: center; gap: 10px; padding-bottom: 8px; }
.dash-main-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
.dash-main-meta { font-size: 11px; color: var(--color-text-tertiary); }
.dash-empty { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-size: 13px; color: var(--color-text-tertiary); }
.dash-error { padding: 6px 10px; font-size: 12px; color: var(--el-color-danger); }
.dash-grid { flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: 40px; gap: 8px; align-content: start; }
.dash-cell { min-width: 0; min-height: 0; }
</style>

<!--
  TaskListSection.vue — 四模式同构的任务（会话）列表段（openspec 决策 13 / tasks 5f）
  - 数据源唯一：chatStore.conversations（按 spaceId 过滤），只读不缓存
  - 嵌入各模式左栏「任务段」：与该模式资源段并列，分隔线区隔
  - 两段各自可折叠由父级（模式左栏容器）负责，本组件自身可滚动
  - ★ 交互口径与办公侧栏（ChatSidebar）完全一致：
      空白处右键 → 批量管理 / 新建任务 / 新建目录（空间）
      任务行右键 → 批量选择 / 置顶 / 重命名 / 移动到空间 / 删除
      批量模式 → 行首勾选、目录节点整组勾选、底部批量条
      （复用 useChat 的同一份状态与动作，不另起一套实现）
-->
<template>
  <!-- 整个任务段拦截 contextmenu 并阻止冒泡：
       - 任务行/分组头有各自菜单（其 handler 自带 .stop，不会再冒泡到根）
       - 空白区与标题行右键 → 弹任务段的「批量管理/新建任务/新建目录」
       - 根节点上的 .stop 是关键：运维页左栏父级 .ops-connections 也挂了 contextmenu，
         不拦住会出现「任务段右键同时弹出资源菜单」的两菜单叠加。
       注意 openTreeMenu 内部会过滤 .tls-item / .tls-group-head（它们有自己的菜单）。 -->
  <div class="tls" @contextmenu.prevent.stop="openTreeMenu($event)">
    <div class="tls-head">
      <span class="tls-title">任务 ({{ convs.length }})</span>
      <button
        v-if="batchMode"
        class="tls-exit"
        type="button"
        title="退出批量"
        @click="exitBatchMode"
      >退出批量</button>
      <button v-else class="tls-new" type="button" title="新建任务" @click="onNew">
        <el-icon :size="12"><EditPen /></el-icon>
      </button>
    </div>

    <div class="tls-body">
      <!-- 分组节点：有 spaceId 过滤时按空间名做组节点；无过滤时用「未归类」根 -->
      <div
        v-for="grp in visibleGroups"
        :key="grp.id"
        class="tls-group"
      >
        <div class="tls-group-head" @click="toggleGroup(grp.id)">
          <el-icon class="tls-caret" :class="{ expanded: !collapsed[grp.id] }"><CaretRight /></el-icon>
          <el-icon class="tls-group-icon"><component :is="grp.icon" /></el-icon>
          <span class="tls-group-label" :title="grp.title">{{ grp.title }}</span>
          <el-checkbox
            v-if="batchMode"
            class="tls-select-all"
            :model-value="groupSelectState(grp.id).checked"
            :indeterminate="groupSelectState(grp.id).indeterminate"
            @click.stop
            @change="toggleSelectAllInGroup(grp.id)"
          />
          <span class="tls-count">{{ grp.convs.length }}</span>
        </div>

        <div v-show="!collapsed[grp.id]" class="tls-children">
          <button
            v-for="c in grp.convs"
            :key="c.id"
            type="button"
            class="tls-item"
            :class="{
              active: c.id === chatStore.currentConvId && !batchMode,
              pinned: c.pinned,
              selecting: batchMode,
            }"
            :title="c.title || '新任务'"
            @click="onRowClick(c)"
            @contextmenu.prevent.stop="onRowCtx($event, c)"
          >
            <el-checkbox
              v-if="batchMode"
              class="tls-check"
              :model-value="selectedConvIds.has(c.id)"
              @click.stop
              @change="toggleConvSelect(c.id)"
            />
            <el-icon v-if="c.pinned" class="tls-pin"><Star /></el-icon>
            <span class="tls-dot" v-else-if="!batchMode"></span>
            <span v-if="renamingId !== c.id" class="tls-label">{{ c.title || '新任务' }}</span>
            <el-input
              v-else
              v-model="renamingTitle"
              size="small"
              class="tls-rename"
              @click.stop
              @blur="commitRename"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="renamingId = ''"
            />
          </button>
          <div v-if="!grp.convs.length" class="tls-empty">暂无任务</div>
        </div>
      </div>

      <div v-if="!convs.length" class="tls-empty tls-empty-root">暂无任务，发送消息自动创建</div>
    </div>

    <!-- 批量操作条：与办公侧栏 .batch-bar 同口径 -->
    <div v-if="batchMode && selectedConvIds.size > 0" class="tls-batch-bar">
      <span>已选 {{ selectedConvIds.size }} 个</span>
      <el-button size="small" :disabled="!convs.length" @click="batchSelectAllHere">全选</el-button>
      <el-button size="small" type="danger" @click="batchDeleteConvs">删除选中</el-button>
    </div>

    <!-- 空白区右键菜单（与办公侧栏 treeMenu 同项） -->
    <Teleport to="body">
      <ul v-if="treeMenu.visible" class="ctx-menu" :style="{ top: treeMenu.y + 'px', left: treeMenu.x + 'px' }">
        <li @click="toggleBatchMode(); closeTreeMenu()">
          <el-icon><Tools /></el-icon>{{ batchMode ? '退出批量模式' : '批量管理' }}
        </li>
        <li class="ctx-sep" />
        <li @click="onTreeNewTask">
          <el-icon><ChatDotRound /></el-icon>新建任务
        </li>
        <li @click="treeMenuNewSpace">
          <el-icon><FolderOpened /></el-icon>新建目录
        </li>
      </ul>
    </Teleport>

    <!-- 任务行右键菜单（与办公侧栏 ctxMenu 同项） -->
    <Teleport to="body">
      <ul v-if="rowMenu.visible" class="ctx-menu" :style="{ top: rowMenu.y + 'px', left: rowMenu.x + 'px' }">
        <li @click="onRowMenuBatch">
          <el-icon><Tools /></el-icon>{{ batchMode && selectedConvIds.has(rowMenu.conv?.id || '') ? '移出批量选择' : '批量选择' }}
        </li>
        <li v-if="batchMode" @click="exitBatchMode()">
          <el-icon><Close /></el-icon>退出批量模式
        </li>
        <li class="ctx-sep" />
        <li @click="onRowMenuPin">
          <el-icon><Star /></el-icon>{{ rowMenu.conv?.pinned ? '取消置顶' : '置顶' }}
        </li>
        <li @click="onRowMenuRename">
          <el-icon><EditPen /></el-icon>重命名
        </li>
        <li class="has-submenu">
          <el-icon><FolderOpened /></el-icon>移动到空间
          <el-icon class="submenu-arrow"><ArrowRight /></el-icon>
          <ul class="ctx-submenu">
            <li v-if="spaceStore.spaces.length === 0" class="disabled-hint">暂无空间，请先创建</li>
            <li @click="onRowMenuMove(null)">
              <el-icon><Close /></el-icon>未归类
            </li>
            <li v-for="sp in spaceStore.spaces" :key="sp.id" @click="onRowMenuMove(sp.id)">
              <el-icon><FolderOpened /></el-icon>{{ sp.name }}
            </li>
          </ul>
        </li>
        <li class="danger" @click="onRowMenuDelete">
          <el-icon><Delete /></el-icon>删除
        </li>
      </ul>
    </Teleport>

    <!-- 新建/编辑空间对话框：本组件在四个模式下都可能挂载，故自持一份（与办公侧栏同表单） -->
    <el-dialog
      v-model="showSpaceEdit"
      :title="spaceEditForm.id ? '编辑空间' : '新建目录'"
      width="460px"
      :close-on-click-modal="false"
      class="compact-dialog"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="名称">
          <el-input v-model="spaceEditForm.name" placeholder="目录名称" maxlength="50" />
        </el-form-item>
        <el-form-item label="目录">
          <div class="tls-dir-row">
            <el-input v-model="spaceEditForm.dirPath" placeholder="绑定本地目录（可选）" clearable />
            <el-button @click="dirPickerVisible = true">
              <el-icon><FolderOpened /></el-icon>&nbsp;浏览
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="spaceEditForm.description" type="textarea" :rows="2" placeholder="目录描述（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSpaceEdit = false">取消</el-button>
        <el-button type="primary" @click="saveSpaceEdit">{{ spaceEditForm.id ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <WorkspaceDirDialog v-model="dirPickerVisible" :current-path="spaceEditForm.dirPath" @selected="onSpaceDirSelected" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  EditPen, Top, Star, CaretRight, ChatDotRound, FolderOpened, Tools, Close, Delete, ArrowRight,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useChatStore } from '../../stores/chat';
import { useChat } from '../../composables/chat/useChat';
import { useCodeStore } from '../../stores/code';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';
import { clampMenuPos } from '../../utils/menuPosition';

const props = withDefaults(defineProps<{
  /** 过滤会话的 spaceId：默认取 codeStore.projectSpaceId（开发模式语义），传 null 显示全部 */
  spaceId?: string | null;
}>(), { spaceId: undefined });

const chatStore = useChatStore();
const codeStore = useCodeStore();
const chat = useChat();
const {
  batchMode, selectedConvIds, renamingId, renamingTitle, commitRename,
  openTreeMenu, treeMenu, treeMenuNewTask, treeMenuNewSpace, closeTreeMenu,
  enterBatchSelect, exitBatchMode, toggleBatchMode, toggleConvSelect, batchDeleteConvs,
  moveConvToSpace, togglePin, deleteConv, spaceStore,
  showSpaceEdit, spaceEditForm, saveSpaceEdit, startRename,
} = chat;

const effSpaceId = computed(() => (props.spaceId === undefined ? codeStore.projectSpaceId : props.spaceId));

const convs = computed(() => {
  const sid = effSpaceId.value;
  const list = sid ? chatStore.conversations.filter((c) => c.spaceId === sid) : chatStore.conversations;
  // 置顶在前，其余按更新时间倒序（与侧栏一致的时间语义）
  // ★ 本组件没有搜索框，因此**不消费** useChat 的全局 search：
  //   那是 useChat 的单例状态，办公侧栏搜过之后切到运维/安全会残留过滤，
  //   而这里无从清空 → 表现为「任务列表莫名少了几条」。
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
});

/** 分组：spaceId 固定（如开发模式）时单组；传 null（运维/安全）时按空间分组 */
const groups = computed(() => {
  const sid = effSpaceId.value;
  if (sid) {
    const sp = spaceStore.spaces.find((s) => s.id === sid);
    return [{ id: sid, title: sp?.name || '当前目录', icon: FolderOpened, convs: convs.value }];
  }
  // 全部模式：未归类 + 各空间
  const out: Array<{ id: string; title: string; icon: any; convs: any[] }> = [];
  const rootList = convs.value.filter((c) => !c.spaceId);
  out.push({ id: '__root__', title: '未归类', icon: ChatDotRound, convs: rootList });
  for (const sp of spaceStore.spaces) {
    out.push({
      id: sp.id,
      title: sp.name,
      icon: FolderOpened,
      convs: convs.value.filter((c) => c.spaceId === sp.id),
    });
  }
  return out;
});

const collapsed = ref<Record<string, boolean>>({});
function toggleGroup(id: string) {
  collapsed.value = { ...collapsed.value, [id]: !collapsed.value[id] };
}

/** 无 spaceId 过滤时，空的「未归类」组不占位（仅在有任务或搜索时显示） */
const visibleGroups = computed(() => {
  if (effSpaceId.value) return groups.value;
  return groups.value.filter((g) => g.id !== '__root__' || g.convs.length > 0);
});

function groupSelectState(id: string) {
  const list = groups.value.find((g) => g.id === id)?.convs || [];
  if (!list.length) return { checked: false, indeterminate: false };
  let sel = 0;
  for (const c of list) if (selectedConvIds.value.has(c.id)) sel++;
  return { checked: sel === list.length, indeterminate: sel > 0 && sel < list.length };
}
function toggleSelectAllInGroup(id: string) {
  const list = groups.value.find((g) => g.id === id)?.convs || [];
  const allSel = list.length > 0 && list.every((c) => selectedConvIds.value.has(c.id));
  const next = new Set(selectedConvIds.value);
  if (allSel) for (const c of list) next.delete(c.id);
  else for (const c of list) next.add(c.id);
  selectedConvIds.value = next;
}

function batchSelectAllHere() {
  selectedConvIds.value = new Set(convs.value.map((c) => c.id));
}

function onPick(id: string) {
  if (id !== chatStore.currentConvId) void chat.selectConv(id);
}
function onRowClick(c: any) {
  if (batchMode.value) toggleConvSelect(c.id);
  else onPick(c.id);
}
function onNew() {
  void chat.startNewChat(effSpaceId.value || null);
}
/** 空白区右键「新建任务」：带上当前目录，避免开发模式下新任务落到未归类 */
function onTreeNewTask() {
  closeTreeMenu();
  void chat.startNewChat(effSpaceId.value || null);
}

// ===== 任务行右键 =====
const rowMenu = ref<{ visible: boolean; x: number; y: number; conv: any }>({
  visible: false, x: 0, y: 0, conv: null,
});
function onRowCtx(e: MouseEvent, c: any) {
  e.preventDefault();
  e.stopPropagation();
  const p = clampMenuPos(e);
  rowMenu.value = { visible: true, x: p.x, y: p.y, conv: c };
}
function closeRowMenu() { rowMenu.value = { ...rowMenu.value, visible: false }; }
function onRowMenuBatch() {
  const c = rowMenu.value.conv;
  if (c) {
    if (batchMode.value && selectedConvIds.value.has(c.id)) toggleConvSelect(c.id);
    else enterBatchSelect(c.id);
  }
  closeRowMenu();
}
function onRowMenuPin() { void togglePin(rowMenu.value.conv); closeRowMenu(); }
function onRowMenuRename() {
  const c = rowMenu.value.conv;
  closeRowMenu();
  if (c) { startRename(c); void nextTick(() => focusRename(c.id)); }
}
function onRowMenuMove(spaceId: string | null) {
  const c = rowMenu.value.conv;
  closeRowMenu();
  if (c) void moveConvToSpace(c.id, spaceId);
}
function onRowMenuDelete() { void deleteConv(rowMenu.value.conv); closeRowMenu(); }

function focusRename(id: string) {
  const el = document.querySelector(`.tls-item .tls-rename input`) as HTMLInputElement | null;
  if (el) { el.focus(); el.select(); }
  void id;
}

// ===== 新建/编辑空间（本组件自持，避免依赖办公侧栏的对话框实例） =====
const dirPickerVisible = ref(false);
function onSpaceDirSelected(path: string) {
  spaceEditForm.value.dirPath = path;
  if (!spaceEditForm.value.name.trim() && path) {
    const sep = path.includes('\\') ? '\\' : '/';
    const base = path.split(sep).filter(Boolean).pop() || '';
    if (base) spaceEditForm.value.name = base.replace(/[:.]$/, '');
  }
}

function onDocMouseDown(e: MouseEvent) {
  // target 可能是 document / window（无 closest），必须先做元素判定；
  // 这里静默 return 会让菜单永不关闭，故用可选链 + instanceof 双保险。
  const t = e.target;
  if (t instanceof Element && (t.closest('.ctx-menu') || t.closest('.tls'))) return;
  closeRowMenu();
  closeTreeMenu();
}
onMounted(() => document.addEventListener('mousedown', onDocMouseDown, true));
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown, true);
  // 菜单与批量选择都是 useChat 的共享状态：切模式会卸载本组件，
  // 但状态仍留在可见/已选 —— 新挂载的同类组件会把菜单重新渲染出来
  // （表现为「切过去就挂着一个菜单」）、并把上一模式勾选的会话带过来。
  // 本组件卸载即视为「离开该模式的任务列表」，一并复位。
  closeRowMenu();
  closeTreeMenu();
  if (batchMode.value) exitBatchMode();
});
</script>

<style scoped>
.tls {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tls-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 6px;
}

.tls-title {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--el-text-color-secondary, #94a3b8);
}

.tls-new,
.tls-exit {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-secondary, #94a3b8);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.tls-new { width: 20px; height: 20px; }
.tls-exit {
  height: 20px; padding: 0 8px;
  font-size: 11px; font-family: inherit;
  color: var(--el-color-warning, #e6a23c);
}

.tls-new:hover {
  background: color-mix(in srgb, var(--color-primary, #4f46e5) 10%, transparent);
  color: var(--color-primary, #4f46e5);
}
.tls-exit:hover { background: color-mix(in srgb, var(--el-color-warning, #e6a23c) 12%, transparent); }

.tls-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px 8px;
}

/* ===== 分组节点 ===== */
.tls-group-head {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 6px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.13s ease;
}
.tls-group-head:hover { background: var(--glass-bg-hover, rgba(15, 23, 42, 0.05)); }
.tls-caret {
  font-size: 11px;
  color: var(--el-text-color-secondary, #94a3b8);
  transition: transform 0.16s ease;
  flex-shrink: 0;
}
.tls-caret.expanded { transform: rotate(90deg); }
.tls-group-icon { font-size: 12px; color: var(--el-text-color-secondary, #94a3b8); flex-shrink: 0; }
.tls-group-label {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--el-text-color-regular, #475569);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tls-count {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--el-text-color-placeholder, #cbd5e1);
}
.tls-select-all { flex-shrink: 0; height: auto; margin-right: 2px; }

.tls-children { padding-left: 6px; }

/* ===== 任务行 ===== */
.tls-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  font-size: 12px;
  font-family: inherit;
  color: var(--el-text-color-regular, #475569);
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease;
}

.tls-item:hover {
  background: var(--glass-bg-hover, rgba(15, 23, 42, 0.05));
  color: var(--el-text-color-primary, #1e293b);
}

.tls-item.active {
  background: color-mix(in srgb, var(--color-primary, #4f46e5) 10%, transparent);
  color: var(--color-primary, #4f46e5);
  font-weight: 500;
}

.tls-item.pinned { background: color-mix(in srgb, var(--el-color-warning, #e6a23c) 8%, transparent); }
.tls-item.selecting { cursor: default; }
.tls-check { flex-shrink: 0; height: auto; }

.tls-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--el-text-color-placeholder, #cbd5e1);
}

.tls-item.active .tls-dot {
  background: var(--color-primary, #4f46e5);
}

.tls-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tls-rename { flex: 1; min-width: 0; }

.tls-pin {
  flex-shrink: 0;
  display: flex;
  font-size: 11px;
  color: var(--el-color-warning, #e6a23c);
}

.tls-empty {
  padding: 8px 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary, #94a3b8);
}
.tls-empty-root { padding: 10px 8px; }

/* ===== 批量条 ===== */
.tls-batch-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  font-size: 11px;
  color: var(--el-text-color-secondary, #94a3b8);
}
.tls-batch-bar > span { flex: 1; }

/* ===== 空间对话框内目录行 ===== */
.tls-dir-row { display: flex; gap: 6px; width: 100%; }
.tls-dir-row .el-input { flex: 1; }
</style>
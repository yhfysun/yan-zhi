<!--
  TaskListSection.vue — 四模式同构的任务（会话）列表段（openspec 决策 13 / tasks 5f）
  - 数据源唯一：chatStore.conversations（按 spaceId 过滤），只读不缓存
  - 嵌入各模式左栏「任务段」：与该模式资源段并列，分隔线区隔
  - 两段各自可折叠由父级（模式左栏容器）负责，本组件自身可滚动
  - ★ 交互口径与办公侧栏（ChatSidebar）完全一致：
      空白处右键/长按 → 批量管理 / 新建任务 / 新建目录（空间）
      任务行右键/长按 → 批量选择 / 置顶 / 重命名 / 移动到空间 / 删除
      任务行行尾 hover 操作组 → 置顶 / 重命名 / 移动空间 / 删除（触屏无 hover，长按兜底）
      显式「新建任务」按钮 → 列表头部 + 空列表 CTA
      批量模式 → 行首勾选、目录节点整组勾选、底部批量条
      （复用 useChat 的同一份状态与动作 + useTaskRowActions 共享操作，不另起一套实现）
-->
<template>
  <!-- 整个任务段拦截 contextmenu 并阻止冒泡：
       - 任务行/分组头有各自菜单（其 handler 自带 .stop，不会再冒泡到根）
       - 空白区与标题行右键 → 弹任务段的「批量管理/新建任务/新建目录」
       - 根节点上的 .stop 是关键：运维页左栏父级 .ops-connections 也挂了 contextmenu，
         不拦住会出现「任务段右键同时弹出资源菜单」的两菜单叠加。
       注意 openTreeMenu 内部会过滤 .tls-item / .tls-group-head（它们有自己的菜单）。 -->
  <div class="tls" @contextmenu.prevent.stop="openTreeMenu($event)" v-on="bindLongPress((ev) => openTreeMenu(ev))">
    <div class="tls-head">
      <span class="tls-title">任务 ({{ convs.length }})</span>
      <button
        v-if="batchMode"
        class="tls-exit"
        type="button"
        title="退出批量"
        @click="exitBatchMode"
      >退出批量</button>
      <!-- 显式「新建任务」入口（Task 2.4）：替换原 20×20px 小图标 -->
      <button v-else class="new-task-btn" type="button" @click="onNew">
        <el-icon :size="12"><Plus /></el-icon>
        <span>新建任务</span>
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
            v-on="bindLongPress((ev) => onRowCtx(ev, c))"
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
            <!-- 7.4 运行状态徽标：与 ChatSidebar 同款呼吸圆点 -->
            <span v-if="!batchMode && chatStore.isConvStreaming(c.id)" class="conv-run-badge" title="运行中"></span>
            <span v-if="renamingId !== c.id" class="tls-label">{{ c.title || '新任务' }}</span>
            <el-input
              v-else
              v-model="renamingTitle"
              size="small"
              class="tls-rename"
              @click.stop
              @blur="rows.commitRename"
              @keydown.enter.prevent="rows.commitRename"
              @keydown.esc.prevent="rows.cancelRename"
            />
            <!-- 行尾 hover 操作组：置顶/重命名/移动空间/删除；「移动」与右键菜单同一 moveTo 流程。
                 行是 <button>，故内层用 span[role=button]，避免交互元素嵌套。 -->
            <span v-if="!batchMode && renamingId !== c.id" class="task-row-actions" @click.stop @dblclick.stop>
              <span
                class="task-row-act"
                :class="{ 'is-on': c.pinned }"
                role="button"
                :title="c.pinned ? '取消置顶' : '置顶'"
                @click="rows.togglePinned(c)"
              ><el-icon :size="12"><Top /></el-icon></span>
              <span class="task-row-act" role="button" title="重命名" @click="rows.startRename(c)">
                <el-icon :size="12"><EditPen /></el-icon>
              </span>
              <span class="task-row-act" role="button" title="移动到空间" @click="rows.openMoveMenu(c, $event)">
                <el-icon :size="12"><FolderOpened /></el-icon>
              </span>
              <span class="task-row-act is-danger" role="button" title="删除" @click="rows.remove(c)">
                <el-icon :size="12"><Delete /></el-icon>
              </span>
            </span>
          </button>
          <div v-if="!grp.convs.length" class="tls-empty">暂无任务</div>
        </div>
      </div>

      <!-- 空列表 + 主 CTA（Task 3.2）：统一 EmptyState 组件 -->
      <EmptyState
        v-if="!convs.length"
        icon="📝"
        title="暂无任务"
        description="还没有任务，点下方按钮开始"
        action-text="新建任务"
        @action="onNew"
      />
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

    <!-- 行内「移动」按钮的空间选择浮层：与右键菜单「移动到空间」子菜单同列表、同一 moveTo 流程 -->
    <Teleport to="body">
      <ul v-if="rows.moveMenu.visible" class="ctx-menu" :style="{ top: rows.moveMenu.y + 'px', left: rows.moveMenu.x + 'px' }">
        <li v-if="spaceStore.spaces.length === 0" class="disabled-hint">暂无空间，请先创建</li>
        <li @click="rows.pickMoveTarget(null)">
          <el-icon><Close /></el-icon>未归类
        </li>
        <li v-for="sp in spaceStore.spaces" :key="sp.id" @click="rows.pickMoveTarget(sp.id)">
          <el-icon><FolderOpened /></el-icon>{{ sp.name }}
        </li>
      </ul>
    </Teleport>

    <!-- 移动端：任务行底部动作面板（Task 11.3）——长按任务行触发（bindLongPress 同一入口
         onRowCtx 按 useMobileShell 分流），替代右键样式的定位菜单；「移动到空间」子菜单
         在面板里平铺为「移动到：××」项。桌面端不渲染（rowSheet 恒关）。 -->
    <ActionSheet
      :visible="rowSheet.visible"
      :title="rowSheet.conv?.title || '任务操作'"
      :actions="rowSheetActions"
      @close="closeRowSheet"
      @select="onRowSheetSelect"
    />

    <!-- 新建/编辑空间对话框：统一 FormDialog（本组件在四个模式下都可能挂载，故自持一份，
         与办公侧栏同表单；取消/保存底栏由 FormDialog 默认渲染） -->
    <FormDialog
      v-model="showSpaceEdit"
      :title="spaceEditForm.id ? '编辑空间' : '新建目录'"
      width="460px"
      dialog-class="compact-dialog"
      :confirm-text="spaceEditForm.id ? '保存' : '创建'"
      @submit="saveSpaceEdit"
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
    </FormDialog>

    <WorkspaceDirDialog v-model="dirPickerVisible" :current-path="spaceEditForm.dirPath" @selected="onSpaceDirSelected" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import {
  EditPen, Top, Star, CaretRight, ChatDotRound, FolderOpened, Tools, Close, Delete, ArrowRight, Plus,
} from '@element-plus/icons-vue';
import { useChatStore } from '../../stores/chat';
import { useChat } from '../../composables/chat/useChat';
import { useCodeStore } from '../../stores/code';
import { useTaskRowActions } from '../../composables/useTaskRowActions';
import { bindLongPress } from '../../composables/useLongPress';
import { useMobileShell } from '../../composables/useMobileShell';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';
import FormDialog from '../FormDialog.vue';
import EmptyState from '../common/EmptyState.vue';
import ActionSheet from '../common/ActionSheet.vue';
import type { ActionSheetAction } from '../common/ActionSheet.vue';
import { clampMenuPos } from '../../utils/menuPosition';

const props = withDefaults(defineProps<{
  /** 过滤会话的 spaceId：默认取 codeStore.projectSpaceId（开发模式语义），传 null 显示全部 */
  spaceId?: string | null;
}>(), { spaceId: undefined });

const chatStore = useChatStore();
const codeStore = useCodeStore();
const chat = useChat();
/** 移动外壳判定（视口窄 或 Capacitor）：任务行长按菜单据此改弹底部动作面板（Task 11.3） */
const isMobileShell = useMobileShell();
const {
  batchMode, selectedConvIds, renamingId, renamingTitle,
  openTreeMenu, treeMenu, treeMenuNewTask, treeMenuNewSpace, closeTreeMenu,
  enterBatchSelect, exitBatchMode, toggleBatchMode, toggleConvSelect, batchDeleteConvs,
  spaceStore,
  showSpaceEdit, spaceEditForm, saveSpaceEdit,
} = chat;

// 任务行共享操作（置顶/重命名/删除/移动空间/激活）：与办公侧栏（ChatSidebar）共用同一 composable。
// DOM 差异走适配：本组件的 rename 输入框没绑 useChat 的 renameInputRef，用选择器聚焦。
const rows = useTaskRowActions({ focusRenameInput: focusRename });

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

  /**
   * 置顶分组（2026-10-09）。
   *
   * ★ 为什么加（issues/会话置顶入口隐蔽-20260919 的「缺失项 1」，issue 备注明确写了
   *   「若改造需同步两处，避免只有侧边栏生效」——这处此前确实漏了）：
   *   置顶项此前只靠 `pinned` 排序排到各组最前，**混在普通任务里没有视觉分区**，
   *   用户看不出"这些是置顶的」。issue 原话：「功能存在但不可发现 ≈ 功能不存在」。
   * ★ 置顶组只在**全部模式**（无 spaceId 过滤）下出现：进了某个空间就该只看该空间的任务，
   *   再抽一个跨空间的置顶组会与"当前目录"语义冲突。
   * ★ 置顶项从原组**排除**（两处不重复）—— 分区不是重复展示。
   */
  const pinnedConvs = sid ? [] : convs.value.filter((c) => !!c.pinned);
  const unpinned = (list: any[]) => list.filter((c) => !!c.pinned === false);

  if (sid) {
    const sp = spaceStore.spaces.find((s) => s.id === sid);
    return [{ id: sid, title: sp?.name || '当前目录', icon: FolderOpened, convs: convs.value }];
  }
  // 全部模式：置顶 + 未归类 + 各空间
  const out: Array<{ id: string; title: string; icon: any; convs: any[] }> = [];
  // 置顶组只在有置顶项时插入（无置顶不占位 —— 契合"极简、不加多余元素"的一贯要求）
  if (pinnedConvs.length > 0) {
    out.push({ id: '__pinned__', title: '置顶', icon: Star, convs: pinnedConvs });
  }
  const rootList = unpinned(convs.value.filter((c) => !c.spaceId));
  out.push({ id: '__root__', title: '未归类', icon: ChatDotRound, convs: rootList });
  for (const sp of spaceStore.spaces) {
    out.push({
      id: sp.id,
      title: sp.name,
      icon: FolderOpened,
      convs: unpinned(convs.value.filter((c) => c.spaceId === sp.id)),
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
  // 置顶组同理：groups 已在无置顶项时不插入它，这里再兜一层（防将来改动漏判）
  return groups.value.filter(
    (g) => (g.id !== '__root__' && g.id !== '__pinned__') || g.convs.length > 0,
  );
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

function onRowClick(c: any) {
  if (batchMode.value) toggleConvSelect(c.id);
  else rows.activate(c);
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
// ===== 移动端：任务行底部动作面板（Task 11.3）=====
const rowSheet = ref<{ visible: boolean; conv: any }>({ visible: false, conv: null });
function onRowCtx(e: MouseEvent, c: any) {
  e.preventDefault();
  e.stopPropagation();
  // 移动外壳（触屏）：改弹 ActionSheet（spec「移动端弹窗规范」），不再用定位菜单
  if (isMobileShell.value) {
    rowSheet.value = { visible: true, conv: c };
    return;
  }
  const p = clampMenuPos(e);
  rowMenu.value = { visible: true, x: p.x, y: p.y, conv: c };
}
function closeRowSheet() { rowSheet.value = { ...rowSheet.value, visible: false }; }

/** 面板动作：与桌面右键菜单同项；「移动到空间」子菜单平铺为带参 key（move:<spaceId>） */
const rowSheetActions = computed<ActionSheetAction[]>(() => {
  const c = rowSheet.value.conv;
  if (!c) return [];
  const list: ActionSheetAction[] = [
    { key: 'batch', label: batchMode.value && selectedConvIds.value.has(c.id) ? '移出批量选择' : '批量选择' },
  ];
  if (batchMode.value) list.push({ key: 'exit-batch', label: '退出批量模式' });
  list.push(
    { key: 'pin', label: c.pinned ? '取消置顶' : '置顶' },
    { key: 'rename', label: '重命名' },
  );
  if (spaceStore.spaces.length === 0) {
    list.push({ key: 'no-space', label: '暂无空间，请先创建', disabled: true });
  } else {
    list.push({ key: 'move:null', label: '移动到：未归类' });
    for (const sp of spaceStore.spaces) list.push({ key: `move:${sp.id}`, label: `移动到：${sp.name}` });
  }
  list.push({ key: 'delete', label: '删除', danger: true });
  return list;
});

function onRowSheetSelect(a: ActionSheetAction) {
  const c = rowSheet.value.conv;
  closeRowSheet();
  if (!c) return;
  if (a.key === 'batch') {
    if (batchMode.value && selectedConvIds.value.has(c.id)) toggleConvSelect(c.id);
    else enterBatchSelect(c.id);
  } else if (a.key === 'exit-batch') exitBatchMode();
  else if (a.key === 'pin') rows.togglePinned(c);
  else if (a.key === 'rename') rows.startRename(c);
  else if (a.key === 'move:null') rows.moveTo(c, null);
  else if (a.key.startsWith('move:')) rows.moveTo(c, a.key.slice(5));
  else if (a.key === 'delete') rows.remove(c);
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
// 行内操作统一走 useTaskRowActions（与办公侧栏同口径），本组件只负责关自己的浮层
function onRowMenuPin() { rows.togglePinned(rowMenu.value.conv); closeRowMenu(); }
function onRowMenuRename() {
  const c = rowMenu.value.conv;
  closeRowMenu();
  if (c) rows.startRename(c);
}
function onRowMenuMove(spaceId: string | null) {
  const c = rowMenu.value.conv;
  closeRowMenu();
  rows.moveTo(c, spaceId);
}
function onRowMenuDelete() { rows.remove(rowMenu.value.conv); closeRowMenu(); }

/** 本组件的 rename 输入框靠选择器定位（useChat 的 renameInputRef 只被办公侧栏绑定） */
function focusRename() {
  const el = document.querySelector(`.tls-item .tls-rename input`) as HTMLInputElement | null;
  if (el) { el.focus(); el.select(); }
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
  // .as-sheet：底部动作面板（Teleport 到 body）——mousedown 先关面板会让 click 落空。
  const t = e.target;
  if (t instanceof Element && t.closest('.ctx-menu')) return;
  // 行内「移动」浮层：点浮层外任何位置都收起（含 .tls 内部的其它行）
  rows.closeMoveMenu();
  if (t instanceof Element && (t.closest('.tls') || t.closest('.as-sheet'))) return;
  closeRowMenu();
  closeRowSheet();
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
  color: var(--el-text-color-secondary, var(--color-text-secondary));
}

/* 「新建任务」按钮的基础样式在 styles/task-row.css（与办公侧栏共用，Task 2.4） */
.tls-exit {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px; padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 11px; font-family: inherit;
  color: var(--el-color-warning, var(--color-warning));
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.tls-exit:hover { background: color-mix(in srgb, var(--el-color-warning, var(--color-warning)) 12%, transparent); }

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
.tls-group-head:hover { background: var(--glass-bg-hover, var(--color-surface-hover)); }
.tls-caret {
  font-size: 11px;
  color: var(--el-text-color-secondary, var(--color-text-secondary));
  transition: transform 0.16s ease;
  flex-shrink: 0;
}
.tls-caret.expanded { transform: rotate(90deg); }
.tls-group-icon { font-size: 12px; color: var(--el-text-color-secondary, var(--color-text-secondary)); flex-shrink: 0; }
.tls-group-label {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--el-text-color-regular, var(--color-text-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tls-count {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--el-text-color-placeholder, var(--color-text-tertiary));
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
  font-size: var(--font-size-base);
  font-family: inherit;
  color: var(--el-text-color-regular, var(--color-text-secondary));
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease;
}

.tls-item:hover {
  background: var(--glass-bg-hover, var(--color-surface-hover));
  color: var(--el-text-color-primary, var(--color-text));
}

.tls-item.active {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  font-weight: 500;
}

.tls-item.pinned { background: color-mix(in srgb, var(--el-color-warning, var(--color-warning)) 8%, transparent); }
.tls-item.selecting { cursor: default; }
.tls-check { flex-shrink: 0; height: auto; }

.tls-dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--el-text-color-placeholder, var(--color-text-tertiary));
}

.tls-item.active .tls-dot {
  background: var(--color-primary);
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
  color: var(--el-color-warning, var(--color-warning));
}

.tls-empty {
  padding: 8px 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary, var(--color-text-secondary));
}

/* ===== 批量条 ===== */
.tls-batch-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid var(--glass-border, var(--color-border));
  font-size: 11px;
  color: var(--el-text-color-secondary, var(--color-text-secondary));
}
.tls-batch-bar > span { flex: 1; }

/* ===== 空间对话框内目录行 ===== */
.tls-dir-row { display: flex; gap: 6px; width: 100%; }
.tls-dir-row .el-input { flex: 1; }
</style>
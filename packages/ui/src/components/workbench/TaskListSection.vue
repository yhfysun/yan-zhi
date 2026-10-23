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
  <div class="tls" @contextmenu.prevent.stop="openTlsTreeMenu($event)" v-on="bindLongPress((ev) => openTlsTreeMenu(ev))">
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
        :data-group-id="grp.id"
      >
        <div class="tls-group-head" @click="toggleGroup(grp.id)" @dblclick="onGroupDblClick(grp.id)">
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
          <!-- 组头「新建任务」入口（2026-10-23 实报：运维的工作目录/未归类组头没有新建任务按钮）。
               与办公侧栏组头行尾 +（chat.css .tree-add-icon）同交互：hover 显示、@click.stop 不触发折叠。
               置顶组是虚拟分组不提供；未归类（__root__）新建进 null；真实空间组新建进该空间。 -->
          <span
            v-if="grp.id !== '__pinned__'"
            class="tls-group-add"
            role="button"
            title="在此目录新建任务"
            @click.stop="newChatInGroup(grp.id)"
          ><el-icon :size="12"><Plus /></el-icon></span>
        </div>

        <div v-show="!collapsed[grp.id]" class="tls-children">
          <button
            v-for="c in grp.convs"
            :key="c.id"
            type="button"
            class="tls-item"
            :class="{
              active: c.id === (props.activeConvId || chatStore.currentConvId) && !batchMode,
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
            <el-icon v-if="c.pinned" class="tls-pin"><StarFilled /></el-icon>
            <span class="tls-dot" v-else-if="!batchMode"></span>
            <!-- 7.4 运行状态徽标：与 ChatSidebar 同款呼吸圆点 -->
            <span v-if="!batchMode && chatStore.isConvStreaming(c.id)" class="conv-run-badge" title="运行中"></span>
            <!-- 来源标记：与办公侧栏同款（打开/删除在浏览器面板的「历史」入口里做） -->
            <el-tooltip v-if="c.source === BROWSER_PAGE_SOURCE" content="来自浏览器页面对话（在浏览器面板「历史」里打开 / 删除）" placement="top">
              <span class="conv-src-badge">页面</span>
            </el-tooltip>
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
                 行是 <button>，故内层用 span[role=button]，避免交互元素嵌套。
                 ★ rowActions=false（运维）：整组不渲染 —— 操作组悬浮盖在标题上，窄栏里
                 想点行打开任务很容易误点成删除（2026-10-23 实报）；动作右键/长按面板全有。 -->
            <span v-if="rowActions && !batchMode && renamingId !== c.id" class="task-row-actions" @click.stop @dblclick.stop>
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
                <el-icon :size="12"><Rank /></el-icon>
              </span>
              <!-- 归档（对齐办公侧栏同款入口）：移出工作台列表但数据全留，可在侧栏「已归档」恢复 -->
              <span class="task-row-act" role="button" title="归档（可恢复；归档后只读）" @click="archiveConv(c, true)">
                <el-icon :size="12"><FolderChecked /></el-icon>
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
      <ul v-if="treeMenu.visible" ref="treeMenuEl" class="ctx-menu" :style="{ top: treeMenu.y + 'px', left: treeMenu.x + 'px' }">
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

    <!-- 组头（未归类 / 工作目录）右键菜单：新建任务（进该组）/ 新建目录。
         此前组头被 openTreeMenu 过滤（返回、不弹空白区菜单）却没配自己的菜单
         = 右键组头毫无反应（2026-10-23 实报「没有新建任务按钮」）。 -->
    <Teleport to="body">
      <ul v-if="groupMenu.visible" ref="groupMenuEl" class="ctx-menu" :style="{ top: groupMenu.y + 'px', left: groupMenu.x + 'px' }">
        <li @click="onGroupMenuNewTask">
          <el-icon><ChatDotRound /></el-icon>新建任务
        </li>
        <li @click="onGroupMenuNewSpace">
          <el-icon><FolderOpened /></el-icon>新建目录
        </li>
      </ul>
    </Teleport>

    <!-- 任务行右键菜单（与办公侧栏 ctxMenu 同项） -->
    <Teleport to="body">
      <ul v-if="rowMenu.visible" ref="rowMenuEl" class="ctx-menu" :style="{ top: rowMenu.y + 'px', left: rowMenu.x + 'px' }">
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
        <!-- 归档（与办公侧栏右键菜单同项同语义） -->
        <li @click="archiveConv(rowMenu.conv, true); closeRowMenu()">
          <el-icon><FolderChecked /></el-icon>归档
        </li>
        <li class="has-submenu">
          <el-icon><Rank /></el-icon>移动到空间
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
      <ul v-if="rows.moveMenu.visible" ref="moveMenuEl" class="ctx-menu" :style="{ top: rows.moveMenu.y + 'px', left: rows.moveMenu.x + 'px' }">
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
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  EditPen, Top, Star, StarFilled, CaretRight, ChatDotRound, FolderOpened, Rank, Tools, Close, Delete, ArrowRight, Plus, FolderChecked,
} from '@element-plus/icons-vue';
import { useChatStore } from '../../stores/chat';
import { useChat } from '../../composables/chat/useChat';
import { useCodeStore } from '../../stores/code';
import { useTaskRowActions } from '../../composables/useTaskRowActions';
import { bindLongPress } from '../../composables/useLongPress';
import { placeMenuAfterRender } from '../../composables/useMenuPlacement';
import { useMobileShell } from '../../composables/useMobileShell';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';
import FormDialog from '../FormDialog.vue';
import EmptyState from '../common/EmptyState.vue';
import ActionSheet from '../common/ActionSheet.vue';
import type { ActionSheetAction } from '../common/ActionSheet.vue';
// 来源标记的白名单常量取自 core（别在模板里写 'browser-page' 字面量）
import { CONV_SOURCE_BROWSER_PAGE } from '@yan-zhi/core';

/** 会话来源徽标的判据（与办公侧栏 ChatSidebar 同口径：两处都要标，漏一处就是"只有一边生效"） */
const BROWSER_PAGE_SOURCE = CONV_SOURCE_BROWSER_PAGE;

const props = withDefaults(defineProps<{
  /** 过滤会话的 spaceId：默认取 codeStore.projectSpaceId（开发模式语义），传 null 显示全部 */
  spaceId?: string | null;
  /**
   * 行点击的自定义出口（2026-10-21）。
   *
   * ★ 为什么需要：默认行为是 `chat.selectConv`（全局 chat store），但运维模式下
   *   "一条会话"意味着"一台服务器"——点会话必须顺带把对应服务器打开。
   *   父级传了这个回调就完全接管点击，不传则保持通用行为（办公/开发/安全共用本组件）。
   */
  onOpen?: (convId: string) => void;
  /**
   * 当前高亮的会话 id（2026-10-21）。
   *
   * ★ 为什么需要：默认高亮判定读 `chatStore.currentConvId`（全局单例），
   *   而运维模式每条会话挂在各自窗口上，全局那个值根本不是它 →
   *   点击后行永远不高亮，用户实报「切换点击效果都没有」。
   *   传了就用外部值，不传保持原逻辑。
   */
  activeConvId?: string;
  /**
   * 行尾 hover 操作组开关（2026-10-23）。
   *
   * ★ 为什么需要：操作组绝对定位贴行尾、悬浮盖在标题上（styles/task-row.css），
   *   运维左栏窄、标题短，想点行打开任务很容易误点成归档/删除 —— 用户实报「很容易误点击」。
   *   传 false 整组不渲染，操作收敛到右键菜单 / 移动端长按面板（同一批动作，不缺功能）。
   *   默认 true：办公/开发/安全的行内操作不变。
   */
  rowActions?: boolean;
}>(), { spaceId: undefined, activeConvId: '', rowActions: true });

const chatStore = useChatStore();
const codeStore = useCodeStore();
const chat = useChat();
/** 移动外壳判定（视口窄 或 Capacitor）：任务行长按菜单据此改弹底部动作面板（Task 11.3） */
const isMobileShell = useMobileShell();
const {
  batchMode, selectedConvIds, renamingId, renamingTitle,
  openTreeMenu, treeMenu, treeMenuNewTask, treeMenuNewSpace, closeTreeMenu,
  enterBatchSelect, exitBatchMode, toggleBatchMode, toggleConvSelect, batchDeleteConvs,
  spaceStore, startNewChat, selectSpaceAndSyncDir,
  showSpaceEdit, spaceEditForm, saveSpaceEdit,
  archiveConv,
} = chat;

// 任务行共享操作（置顶/重命名/删除/移动空间/激活）：与办公侧栏（ChatSidebar）共用同一 composable。
// DOM 差异走适配：本组件的 rename 输入框没绑 useChat 的 renameInputRef，用选择器聚焦。
const rows = useTaskRowActions({ focusRenameInput: focusRename });

// ===== 右键菜单贴光标：渲染后按真实尺寸校正（2026-10-18，与办公侧栏 ChatSidebar 同口径）=====
// 旧 clampMenuPos 按猜的 320px 高度夹取，光标越靠下菜单被推得越远。打开时先落光标坐标，
// 这里在各菜单 v-if 渲染完成后量真实尺寸校正（贴光标右下 / 放不下翻上方 / 再贴边）。
const treeMenuEl = ref<HTMLElement | null>(null);
const rowMenuEl = ref<HTMLElement | null>(null);
const moveMenuEl = ref<HTMLElement | null>(null);

const effSpaceId = computed(() => (props.spaceId === undefined ? codeStore.projectSpaceId : props.spaceId));

const convs = computed(() => {
  const sid = effSpaceId.value;
  // ★ 生命周期兜底（2026-10-16，与 ChatSidebar 同口径）：后端已按 scope=active 过滤，
  //   这里再排一遍是防旧缓存/别处写入把归档/回收站会话带进 store.conversations。
  //   两处 UI 若口径不一致，会出现「侧栏没有、工作台还在」的灵异列表。
  const list = (sid ? chatStore.conversations.filter((c) => c.spaceId === sid) : chatStore.conversations)
    .filter((c) => !c.archivedAt && !c.deletedAt);
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

/** 双击空间组头 → 在该空间新建会话（2026-10-13，与办公侧栏 ChatSidebar 同口径：
 *  类 Claude 的"双击项目=进入并新建会话"。组头单击仍是折叠/展开，语义不冲突。
 *  只对真实空间组生效（__pinned__/__root__ 不是空间，忽略）。 */
function onGroupDblClick(id: string) {
  if (id === '__pinned__' || id === '__root__') return;
  const sp = spaceStore.spaces.find((s) => s.id === id);
  if (!sp) return;
  // 双击先触发两次 click（两次 toggleGroup 互相抵消），再确保展开收尾，消除抖动
  if (collapsed.value[id]) toggleGroup(id);
  void selectSpaceAndSyncDir(id);
  void startNewChat(id);
}

/** 在某组（未归类 = null / 某空间 = spaceId）下新建任务：与列表头「新建任务」按钮同 startNewChat 流程 */
function newChatInGroup(groupId: string) {
  const spaceId = groupId === '__root__' || groupId === '__pinned__' ? null : groupId;
  void chat.startNewChat(spaceId);
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
  if (batchMode.value) { toggleConvSelect(c.id); return; }
  if (props.onOpen) { props.onOpen(c.id); return; }
  rows.activate(c);
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

// ===== 组头（未归类 / 工作目录）右键菜单（2026-10-23 实报：目录组头右键什么都不弹）=====
// 通用 openTreeMenu 会过滤 .tls-group-head（它"有自己的菜单"），但本组件此前并没给它配菜单
// → 右键组头 = 毫无反应。这里补一个组头专属菜单：新建任务（进该组）/ 新建目录。
// 与空白区菜单（treeMenu）分开一份状态，互不干扰。
const groupMenu = ref<{ visible: boolean; x: number; y: number; groupId: string }>({
  visible: false, x: 0, y: 0, groupId: '',
});
const groupMenuEl = ref<HTMLElement | null>(null);

/** 根节点 contextmenu 分流：组头 → 组头菜单（toggle：同组再击收起）；其余 → 空白区菜单 */
function openTlsTreeMenu(e: MouseEvent) {
  const head = (e.target as HTMLElement)?.closest?.('.tls-group-head')?.closest('.tls-group') as HTMLElement | null;
  if (head) {
    const id = head.getAttribute('data-group-id') || '';
    // 同组右击第二次 = 收起（2026-10-23 实报「再右击隐藏？」）
    if (groupMenu.value.visible && groupMenu.value.groupId === id) {
      closeGroupMenu();
      return;
    }
    groupMenu.value = { visible: true, x: e.clientX, y: e.clientY, groupId: id };
    closeRowMenu();
    closeTreeMenu();
    return;
  }
  // 右键空白区/标题行：收其它菜单再弹空白区菜单
  closeRowMenu();
  closeGroupMenu();
  openTreeMenu(e);
}
function closeGroupMenu() { groupMenu.value = { ...groupMenu.value, visible: false }; }
function onGroupMenuNewTask() {
  const id = groupMenu.value.groupId;
  closeGroupMenu();
  newChatInGroup(id);
}
function onGroupMenuNewSpace() {
  closeGroupMenu();
  treeMenuNewSpace();
}
// ===== 右键菜单贴光标：渲染后按真实尺寸校正（2026-10-18，与办公侧栏 ChatSidebar 同口径）=====
// 旧 clampMenuPos 按猜的 320px 高度夹取，光标越靠下菜单被推得越远。打开时先落光标坐标，
// 这里在各菜单 v-if 渲染完成后量真实尺寸校正（贴光标右下 / 放不下翻上方 / 再贴边）。
// ★ 必须放在 rowMenu 声明**之后**：watch 创建时会同步跑一次 getter 收集依赖，
//   写在前面就是「Cannot access 'rowMenu' before initialization」（TDZ）——组件 setup 直接抛错，
//   表现为「模式切换整页空白 + App.vue 强制重挂连环报错」（2026-10-18 实报）。
watch(
  () => [treeMenu.visible, rowMenu.value.visible, rows.moveMenu.visible, groupMenu.value.visible] as const,
  ([tv, rv, mv, gv]) => {
    if (tv) placeMenuAfterRender(treeMenuEl, treeMenu, (p) => { treeMenu.x = p.x; treeMenu.y = p.y; });
    if (rv && rowMenu.value) placeMenuAfterRender(rowMenuEl, rowMenu.value, (p) => { rowMenu.value = { ...rowMenu.value, ...p }; });
    if (mv) placeMenuAfterRender(moveMenuEl, rows.moveMenu, (p) => { rows.moveMenu.x = p.x; rows.moveMenu.y = p.y; });
    if (gv) placeMenuAfterRender(groupMenuEl, groupMenu.value, (p) => { groupMenu.value = { ...groupMenu.value, ...p }; });
  },
);
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
  // 2026-10-23 实报「再点右击隐藏？」：右键同一行第二次 = 收起（toggle），
  // 判据 = 菜单已开且目标就是这一行。
  if (rowMenu.value.visible && rowMenu.value.conv?.id === c.id) {
    closeRowMenu();
    return;
  }
  // 先按光标重定位（不猜高度夹取），渲染后由 placeMenuAfterRender 按真实尺寸校正。
  // 右键行 = 关组头/空白区菜单（contextmenu 处理器之间显式互斥）
  closeGroupMenu();
  closeTreeMenu();
  rowMenu.value = { visible: true, x: e.clientX, y: e.clientY, conv: c };
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
    { key: 'archive', label: '归档' },
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
  else if (a.key === 'archive') archiveConv(c, true);
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
  // ★ 右键（button=2）不在这里收：mousedown 先于 contextmenu 触发，若这里关了菜单，
  //   contextmenu 里的「同目标再击=收起」toggle 判据（visible 已被置 false）永远失效。
  //   右键的收/切由 contextmenu 处理器负责（onRowCtx / openTlsTreeMenu 内显式互斥）。
  if (e.button === 2) return;
  // .ctx-menu 命中即放行：mousedown 先关会让菜单项的 click 落空（与办公侧栏同规则）。
  const t = e.target;
  if (t instanceof Element && t.closest('.ctx-menu')) return;
  // 2026-10-23 实报「右击下拉关不掉 / 点任务行没反应」：旧规则「点 .tls 内部一律 return（不关
  // 行菜单）」是给行尾 hover 按钮时代留的例外 —— 点行想打开任务，菜单却挂在屏幕上。
  // 改为：点浮层内不关，点浮层外（**含列表内部**）一律收起；行点击语义由 onRowClick 负责。
  closeGroupMenu();
  rows.closeMoveMenu();
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
  closeGroupMenu();
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
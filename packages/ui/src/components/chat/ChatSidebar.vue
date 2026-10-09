<template>
  <aside class="sidebar">
    <div class="sidebar-tabs">
      <div class="sb-tab" :class="{ active: sideTab === 'chat' }" @click="sideTab = 'chat'">
        <el-icon><ChatDotRound /></el-icon> 任务
      </div>
      <div class="sb-tab" :class="{ active: sideTab === 'task' }" @click="sideTab = 'task'">
        <el-icon><Timer /></el-icon> 定时任务
      </div>
      <div class="sb-tab" :class="{ active: sideTab === 'file' }" @click="sideTab = 'file'">
        <el-icon><FolderOpened /></el-icon> 文件
      </div>
    </div>

    <div v-if="sideTab === 'chat'" class="conv-list">
      <div class="conv-header">
        <!-- 搜索框 + 新建任务图标同一行：空态由大 CTA 承担新建，这里图标仅服务有任务时的快速新建
             （2026-10-04：原独立一行描边按钮与空态大按钮重复，用户红框要求收敛） -->
        <div class="conv-search-row">
          <el-input v-model="search" placeholder="搜索任务" size="small" clearable :prefix-icon="Search" />
          <button v-if="!batchMode" class="conv-new-icon" type="button" title="新建任务" @click="startNewChat()">
            <el-icon :size="14"><Plus /></el-icon>
          </button>
        </div>
        <div v-if="batchMode" class="conv-header-row">
          <el-button size="small" type="warning" style="flex:1" @click="exitBatchMode">退出批量</el-button>
        </div>
      </div>

      <div class="conv-tree" @contextmenu.prevent="openTreeMenu($event)" v-on="bindLongPress((ev) => openTreeMenu(ev))">
        <!-- 对话根节点：未归类会话 -->
        <div class="tree-node tree-root">
          <div class="tree-node-head" @click="toggleRootCollapse">
            <el-icon class="tree-caret" :class="{ expanded: !rootCollapsed }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><ChatDotRound /></el-icon>
            <span class="tree-node-label">任务</span>
            <el-checkbox
              v-if="batchMode"
              class="tree-select-all"
              :model-value="rootSelectState().checked"
              :indeterminate="rootSelectState().indeterminate"
              @click.stop
              @change="toggleSelectAllInRoot"
            />
            <span class="tree-count">{{ rootConversations.length }}</span>
            <el-icon class="tree-add-icon" @click.stop="startNewChat(null)"><Plus /></el-icon>
          </div>
          <div v-show="!rootCollapsed" class="tree-children">
            <!-- ── 置顶分组（2026-10-09）──────────────────────────────
                 ★ 为什么加：此前置顶只靠 `pinned DESC` 排到最前，混在普通会话里**没有视觉分区**，
                   用户感知不到"这些是置顶的"（issues/会话置顶入口隐蔽 的缺失项 1；
                   入口 hover 星标 + 右键菜单其实都已具备，缺的就是这个"看得出被置顶"的分组）。
                 ★ 无置顶项时**整组不渲染**（不占位、不打扰）—— 契合"极简、不加多余元素"的一贯要求。
                 ★ 行渲染与下方主列表**刻意保持同款**（项目既有做法：注释里多处写"与根列表同款"）。
                   两处若需同步改动，注意别只改一处（issue 备注已提示过同类风险）。 -->
            <div v-if="pinnedRootConversations.length > 0" class="tree-node tree-pinned">
              <div class="tree-node-head" @click="togglePinnedCollapse">
                <el-icon class="tree-caret" :class="{ expanded: !pinnedCollapsed }"><CaretRight /></el-icon>
                <el-icon class="tree-node-icon"><Star /></el-icon>
                <span class="tree-node-label">置顶</span>
                <span class="tree-count">{{ pinnedRootConversations.length }}</span>
              </div>
              <div v-show="!pinnedCollapsed" class="tree-children">
                <div
                  v-for="conv in pinnedRootConversations"
                  :key="conv.id"
                  class="conv-item pinned"
                  :class="{ active: conv.id === store.currentConvId, selecting: batchMode }"
                  @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
                  @contextmenu.prevent="openConvMenu($event, conv)"
                  v-on="bindLongPress((ev) => openConvMenu(ev, conv))"
                  @dblclick="!batchMode && rows.startRename(conv)"
                >
                  <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
                  <el-icon class="pin-icon"><Star /></el-icon>
                  <span v-if="renamingId !== conv.id" class="conv-title">{{ conv.title }}</span>
                  <el-input
                    v-else
                    v-model="renamingTitle"
                    size="small"
                    @click.stop
                    @blur="rows.commitRename"
                    @keydown.enter.prevent="rows.commitRename"
                    @keydown.esc.prevent="rows.cancelRename"
                    ref="renameInputRef"
                  />
                  <span v-if="store.isConvStreaming(conv.id)" class="conv-run-badge" title="运行中"></span>
                  <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                    <el-icon class="scheduled-badge"><Timer /></el-icon>
                  </el-tooltip>
                  <span v-if="!batchMode && renamingId !== conv.id" class="task-row-actions" @click.stop @dblclick.stop>
                    <span class="task-row-act is-on" role="button" title="取消置顶" @click="rows.togglePinned(conv)"><el-icon :size="12"><Top /></el-icon></span>
                    <span class="task-row-act" role="button" title="重命名" @click="rows.startRename(conv)"><el-icon :size="12"><EditPen /></el-icon></span>
                    <span class="task-row-act" role="button" title="移动到空间" @click="rows.openMoveMenu(conv, $event)"><el-icon :size="12"><FolderOpened /></el-icon></span>
                    <span class="task-row-act is-danger" role="button" title="删除" @click="rows.remove(conv)"><el-icon :size="12"><Delete /></el-icon></span>
                  </span>
                </div>
              </div>
            </div>
            <div
              v-for="conv in unpinnedRootConversations"
              :key="conv.id"
              class="conv-item"
              :class="{ active: conv.id === store.currentConvId, pinned: conv.pinned, selecting: batchMode }"
              @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
              @contextmenu.prevent="openConvMenu($event, conv)"
              v-on="bindLongPress((ev) => openConvMenu(ev, conv))"
              @dblclick="!batchMode && rows.startRename(conv)"
            >
              <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
              <el-icon class="pin-icon" v-if="conv.pinned"><Star /></el-icon>
              <el-icon v-else-if="!batchMode"><ChatDotRound /></el-icon>
              <span v-if="renamingId !== conv.id" class="conv-title">{{ conv.title }}</span>
              <el-input
                v-else
                v-model="renamingTitle"
                size="small"
                @click.stop
                @blur="rows.commitRename"
                @keydown.enter.prevent="rows.commitRename"
                @keydown.esc.prevent="rows.cancelRename"
                ref="renameInputRef"
              />
              <!-- 7.4 运行状态徽标：该任务正在跑时行内呼吸圆点 -->
              <span v-if="store.isConvStreaming(conv.id)" class="conv-run-badge" title="运行中"></span>
              <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                <el-icon class="scheduled-badge"><Timer /></el-icon>
              </el-tooltip>
              <!-- 行尾 hover 操作组：置顶/重命名/移动空间/删除（移动与右键菜单同一 moveTo 流程） -->
              <span v-if="!batchMode && renamingId !== conv.id" class="task-row-actions" @click.stop @dblclick.stop>
                <span
                  class="task-row-act"
                  :class="{ 'is-on': conv.pinned }"
                  role="button"
                  :title="conv.pinned ? '取消置顶' : '置顶'"
                  @click="rows.togglePinned(conv)"
                ><el-icon :size="12"><Top /></el-icon></span>
                <span class="task-row-act" role="button" title="重命名" @click="rows.startRename(conv)">
                  <el-icon :size="12"><EditPen /></el-icon>
                </span>
                <span class="task-row-act" role="button" title="移动到空间" @click="rows.openMoveMenu(conv, $event)">
                  <el-icon :size="12"><FolderOpened /></el-icon>
                </span>
                <span class="task-row-act is-danger" role="button" title="删除" @click="rows.remove(conv)">
                  <el-icon :size="12"><Delete /></el-icon>
                </span>
              </span>
            </div>
            <!-- 空态（Task 3.2）：统一 EmptyState 组件；搜索无结果时不给 CTA -->
            <EmptyState
              v-if="!rootCollapsed && rootConversations.length === 0"
              icon="📝"
              :title="search ? '无匹配' : '暂无任务'"
              :action-text="!search && !batchMode ? '新建任务' : undefined"
              @action="startNewChat(null)"
            />
          </div>
        </div>

        <!-- 各空间节点 -->
        <div v-for="sp in spaceStore.spaces" :key="sp.id" class="tree-node tree-space">
          <div
            class="tree-node-head"
            :class="{ 'tree-node-active': spaceStore.currentSpaceId === sp.id }"
            @click="onSpaceHeadClick(sp.id)"
            @contextmenu.prevent="openSpaceMenu($event, sp)"
            v-on="bindLongPress((ev) => openSpaceMenu(ev, sp))"
          >
            <el-icon class="tree-caret" :class="{ expanded: !spaceCollapsed[sp.id] }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><FolderOpened /></el-icon>
            <span class="tree-node-label" :title="sp.dirPath || sp.name">{{ sp.name }}</span>
            <!-- 任务模式徽标：点它直接打开编辑弹窗改模式（改模式是高频动作，只藏在右键菜单里不好找）。
                 @click.stop 防止冒泡到行上（行点击是"选中空间"，语义不同）。 -->
            <span
              v-if="sp.taskType"
              class="tree-task-badge tree-task-badge-click"
              :title="`任务模式：${taskTypeLabel(sp.taskType)}（点击更改）`"
              @click.stop="openSpaceEdit(sp)"
            >{{ taskTypeLabel(sp.taskType) }}</span>
            <el-checkbox
              v-if="batchMode"
              class="tree-select-all"
              :model-value="spaceSelectState(sp.id).checked"
              :indeterminate="spaceSelectState(sp.id).indeterminate"
              @click.stop
              @change="toggleSelectAllInSpace(sp.id)"
            />
            <span class="tree-count">{{ conversationsBySpace[sp.id]?.length || 0 }}</span>
            <el-icon class="tree-add-icon" @click.stop="startNewChat(sp.id)"><Plus /></el-icon>
          </div>
          <div v-show="!spaceCollapsed[sp.id]" class="tree-children">
            <div
              v-for="conv in conversationsBySpace[sp.id] || []"
              :key="conv.id"
              class="conv-item"
              :class="{ active: conv.id === store.currentConvId, pinned: conv.pinned, selecting: batchMode }"
              @click="batchMode ? toggleConvSelect(conv.id) : rows.activate(conv)"
              @contextmenu.prevent="openConvMenu($event, conv)"
              v-on="bindLongPress((ev) => openConvMenu(ev, conv))"
              @dblclick="!batchMode && rows.startRename(conv)"
            >
              <el-checkbox v-if="batchMode" :model-value="selectedConvIds.has(conv.id)" @click.stop @change="toggleConvSelect(conv.id)" />
              <el-icon class="pin-icon" v-if="conv.pinned"><Star /></el-icon>
              <el-icon v-else-if="!batchMode"><ChatDotRound /></el-icon>
              <span v-if="renamingId !== conv.id" class="conv-title">{{ conv.title }}</span>
              <el-input
                v-else
                v-model="renamingTitle"
                size="small"
                @click.stop
                @blur="rows.commitRename"
                @keydown.enter.prevent="rows.commitRename"
                @keydown.esc.prevent="rows.cancelRename"
                ref="renameInputRef"
              />
              <!-- 7.4 运行状态徽标：与根列表同款 -->
              <span v-if="store.isConvStreaming(conv.id)" class="conv-run-badge" title="运行中"></span>
              <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                <el-icon class="scheduled-badge"><Timer /></el-icon>
              </el-tooltip>
              <!-- 行尾 hover 操作组：与根列表同款，共用 useTaskRowActions -->
              <span v-if="!batchMode && renamingId !== conv.id" class="task-row-actions" @click.stop @dblclick.stop>
                <span
                  class="task-row-act"
                  :class="{ 'is-on': conv.pinned }"
                  role="button"
                  :title="conv.pinned ? '取消置顶' : '置顶'"
                  @click="rows.togglePinned(conv)"
                ><el-icon :size="12"><Top /></el-icon></span>
                <span class="task-row-act" role="button" title="重命名" @click="rows.startRename(conv)">
                  <el-icon :size="12"><EditPen /></el-icon>
                </span>
                <span class="task-row-act" role="button" title="移动到空间" @click="rows.openMoveMenu(conv, $event)">
                  <el-icon :size="12"><FolderOpened /></el-icon>
                </span>
                <span class="task-row-act is-danger" role="button" title="删除" @click="rows.remove(conv)">
                  <el-icon :size="12"><Delete /></el-icon>
                </span>
              </span>
            </div>
            <EmptyState
              v-if="!spaceCollapsed[sp.id] && (!conversationsBySpace[sp.id] || conversationsBySpace[sp.id].length === 0)"
              icon="📝"
              :title="search ? '无匹配' : '暂无任务'"
              :action-text="!search && !batchMode ? '新建任务' : undefined"
              @action="startNewChat(sp.id)"
            />
          </div>
        </div>

      </div>

      <div v-if="batchMode && selectedConvIds.size > 0" class="batch-bar">
        <span>已选 {{ selectedConvIds.size }} 个</span>
        <el-button size="small" :disabled="filteredConversations.length === 0" @click="batchSelectAll">全选</el-button>
        <el-button size="small" type="danger" @click="batchDeleteConvs">删除选中</el-button>
      </div>
    </div>

    <div v-else-if="sideTab === 'task'" class="task-tab">
      <ScheduledTaskDialog />
    </div>

    <!-- 文件 tab：资源管理器 / 搜索 / Git（竖排视图按钮 + 面板） -->
    <div v-else class="task-tab file-tab-wrap">
      <ChatFileTab />
    </div>
  </aside>

  <Teleport to="body">
<!-- 移动外壳（触屏）下任务行菜单改由底部动作面板承载（Task 11.3），定位菜单只在非移动壳渲染 -->
<ul v-if="ctxMenu.visible && !isTouchShell" class="ctx-menu" :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }">
    <li @click="(batchMode && selectedConvIds.has(ctxMenu.conv!.id) ? toggleConvSelect(ctxMenu.conv!.id) : enterBatchSelect(ctxMenu.conv!.id)); closeCtxMenu()">
      <el-icon><Tools /></el-icon>{{ batchMode && selectedConvIds.has(ctxMenu.conv!.id) ? '移出批量选择' : '批量选择' }}
    </li>
    <li v-if="batchMode" @click="exitBatchMode()">
      <el-icon><Close /></el-icon>退出批量模式
    </li>
    <li class="ctx-sep" />
    <li @click="rows.togglePinned(ctxMenu.conv)">
      <el-icon><Star /></el-icon>{{ ctxMenu.conv?.pinned ? '取消置顶' : '置顶' }}
    </li>
    <li @click="rows.startRename(ctxMenu.conv!)">
      <el-icon><EditPen /></el-icon>重命名
    </li>
    <!-- 在系统文件管理器里打开该任务的产物目录（仅桌面端有效，其它端给出提示） -->
    <li @click="openConvDir(ctxMenu.conv); closeCtxMenu()">
      <el-icon><FolderOpened /></el-icon>打开目录
    </li>
    <li class="has-submenu">
      <el-icon><FolderOpened /></el-icon>移动到空间
      <el-icon class="submenu-arrow"><ArrowRight /></el-icon>
      <ul class="ctx-submenu">
        <li v-if="spaceStore.spaces.length === 0" class="disabled-hint">暂无空间，请先创建</li>
        <li @click="rows.moveTo(ctxMenu.conv!, null)">
          <el-icon><Close /></el-icon>未归类
        </li>
        <li v-for="sp in spaceStore.spaces" :key="sp.id" @click="rows.moveTo(ctxMenu.conv!, sp.id)">
          <el-icon><FolderOpened /></el-icon>{{ sp.name }}
        </li>
      </ul>
    </li>
    <li class="danger" @click="rows.remove(ctxMenu.conv)">
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

  <!-- 移动端：任务行（会话）底部动作面板（Task 11.3）—— openConvMenu 是右键/长按的共用入口，
       ctxMenu.visible 在移动外壳下即弹 ActionSheet；动作与桌面右键菜单一致（移动到空间平铺）。 -->
  <ActionSheet
    :visible="isTouchShell && ctxMenu.visible"
    :title="ctxMenu.conv?.title || '任务操作'"
    :actions="convSheetActions"
    @close="closeCtxMenu()"
    @select="onConvSheetSelect"
  />

  <!-- 新建/编辑空间：统一 FormDialog（取消/保存底栏由组件默认渲染） -->
  <FormDialog
    v-model="showSpaceEdit"
    :title="spaceEditForm.id ? '编辑空间' : '新建空间'"
    width="460px"
    dialog-class="compact-dialog"
    :confirm-text="spaceEditForm.id ? '保存' : '创建'"
    @submit="saveSpaceEdit"
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="名称">
        <el-input v-model="spaceEditForm.name" placeholder="空间名称" maxlength="50" />
      </el-form-item>
      <el-form-item label="目录">
        <div class="space-dir-row">
          <el-input v-model="spaceEditForm.dirPath" placeholder="绑定本地目录（可选）" clearable />
          <el-button @click="dirPickerVisible = true">
            <el-icon><FolderOpened /></el-icon>&nbsp;浏览
          </el-button>
        </div>
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="spaceEditForm.description" type="textarea" :rows="2" placeholder="空间描述（可选）" />
      </el-form-item>
      <!-- 任务类型：「目录即任务」——选定后自动生成资源目录骨架，模型按流程分步引导 -->
      <el-form-item label="任务类型">
        <el-select v-model="spaceEditForm.taskType" placeholder="通用（不限定流程）" clearable style="width: 100%">
          <el-option
            v-for="t in taskTypes"
            :key="t.id"
            :label="t.label"
            :value="t.id"
          >
            <span class="tt-opt-label">{{ t.label }}</span>
            <span class="tt-opt-summary">{{ t.summary }}</span>
          </el-option>
        </el-select>
        <div v-if="spaceEditForm.taskType" class="tt-guide">{{ pickedTaskType.guide }}</div>
      </el-form-item>
    </el-form>
  </FormDialog>

  <!-- 空间目录选择器（桌面端可用原生目录选择，Web 端为内置浏览器） -->
  <WorkspaceDirDialog v-model="dirPickerVisible" :current-path="spaceEditForm.dirPath" @selected="onSpaceDirSelected" />

  <!-- 空间记忆（MEMORY.md）：跨会话、该空间下所有智能体共享的长期记忆。
       注意：这不是 memory 表的维度，而是挂在 space 上的一份文件，故入口在空间上而非「记忆管理」页。 -->
  <el-dialog v-model="spaceMemoryOpen" :title="`空间记忆 · ${spaceMemoryForm.name}`" width="680px" :close-on-click-modal="false" class="compact-dialog">
    <div v-if="spaceMemoryLoading" style="padding: 12px"><el-skeleton :rows="5" animated /></div>
    <template v-else>
      <p class="space-memory-hint">
        本空间下所有会话、任意智能体共享的长期记忆（每行一条，格式建议 <code>- [日期] 内容</code>）。
        对话中会随系统提示词注入。
      </p>
      <el-input v-model="spaceMemoryForm.content" type="textarea" :rows="14" placeholder="暂无内容，可在此沉淀空间级约定、关键决策与重要事实" />
      <p v-if="spaceMemoryForm.path" class="space-memory-path">文件：{{ spaceMemoryForm.path }}</p>
    </template>
    <template #footer>
      <el-button @click="spaceMemoryOpen = false">取消</el-button>
      <el-button type="primary" :loading="spaceMemorySaving" @click="saveSpaceMemory">保存</el-button>
    </template>
  </el-dialog>

  <Teleport to="body">
<ul v-if="spaceMenuTarget" class="ctx-menu" :style="{ top: spaceMenuTarget.y + 'px', left: spaceMenuTarget.x + 'px' }" @click.stop>
    <li @click="openSpaceEdit(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><EditPen /></el-icon>{{ spaceMenuTarget.space.taskType ? '更改任务模式' : '设置任务模式' }}
    </li>
    <!-- 在系统文件管理器里打开这个空间的绑定目录（仅桌面端有效，其它端给提示） -->
    <li @click="openPathInSystem(spaceMenuTarget.space.dirPath, true); closeSpaceMenu()">
      <el-icon><FolderOpened /></el-icon>打开目录
    </li>
    <li @click="openSpaceMemory(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><Memo /></el-icon>空间记忆
    </li>
    <li @click="treeMenuNewSpace(); closeSpaceMenu()">
      <el-icon><Plus /></el-icon>新建空间
    </li>
    <li class="danger" @click="deleteSpaceConfirm(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><Delete /></el-icon>删除空间
    </li>
  </ul>
</Teleport>

  <!-- 会话树空白区右键菜单 -->
  <Teleport to="body">
<ul v-if="treeMenu.visible" class="ctx-menu" :style="{ top: treeMenu.y + 'px', left: treeMenu.x + 'px' }">
    <li @click="toggleBatchMode(); closeTreeMenu()">
      <el-icon><Tools /></el-icon>{{ batchMode ? '退出批量模式' : '批量管理' }}
    </li>
    <li class="ctx-sep" />
    <li @click="treeMenuNewTask">
      <el-icon><ChatDotRound /></el-icon>新建任务
    </li>
    <li @click="treeMenuNewSpace">
      <el-icon><FolderOpened /></el-icon>新建空间
    </li>
  </ul>
</Teleport>

</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import {
  Plus, ChatDotRound, Star, EditPen, Delete, FolderOpened, ArrowRight, Close, Search, CaretRight, Timer, Memo, Tools, Top,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getTaskType } from '@yan-zhi/shared';
import { useChat } from '../../composables/chat/useChat';
import { useTaskRowActions } from '../../composables/useTaskRowActions';
import { bindLongPress } from '../../composables/useLongPress';
import { useMobileShell } from '../../composables/useMobileShell';
import ScheduledTaskDialog from './ScheduledTaskDialog.vue';
import ChatFileTab from './ChatFileTab.vue';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';
import FormDialog from '../FormDialog.vue';
import EmptyState from '../common/EmptyState.vue';
import ActionSheet from '../common/ActionSheet.vue';
import type { ActionSheetAction } from '../common/ActionSheet.vue';

const {
  sideTab, search, store, batchMode, toggleConvSelect,
  openConvMenu, selectedConvIds, renamingId, renamingTitle, renameInputRef,
  filteredConversations, startNewChat, batchSelectAll, batchDeleteConvs,
  rootConversations, conversationsBySpace, spaceCollapsed, toggleSpaceCollapse, rootCollapsed, toggleRootCollapse,
  // 置顶分组（2026-10-09）
  pinnedRootConversations, unpinnedRootConversations, pinnedCollapsed, togglePinnedCollapse,
  spaceStore, openSpaceMenu, openSpaceEdit, showSpaceEdit, spaceEditForm,
  saveSpaceEdit, deleteSpaceConfirm, spaceMenuTarget, closeSpaceMenu, ctxMenu,
  openConvDir, openPathInSystem,
  taskTypes, pickedTaskType, selectSpaceAndSyncDir,
  closeCtxMenu,
  treeMenu, openTreeMenu, treeMenuNewTask, treeMenuNewSpace, closeTreeMenu,
  enterBatchSelect, exitBatchMode, toggleBatchMode, toggleSelectAllInSpace, toggleSelectAllInRoot,
  spaceSelectState, rootSelectState,
} = useChat();

// 任务行共享操作（置顶/重命名/删除/移动空间/激活）：与 TaskListSection 共用同一 composable。
// 重命名聚焦走 useChat 内置的 renameInputRef（模板里 rename 输入框绑了该 ref），无需额外适配。
const rows = useTaskRowActions();

// ===== 移动端：任务行（会话）底部动作面板（Task 11.3）=====
// 动作与桌面右键菜单同项；「移动到空间」子菜单平铺为带参 key（move:<spaceId>）
const convSheetActions = computed<ActionSheetAction[]>(() => {
  const c = ctxMenu.conv;
  if (!c) return [];
  const list: ActionSheetAction[] = [
    { key: 'batch', label: batchMode.value && selectedConvIds.value.has(c.id) ? '移出批量选择' : '批量选择' },
  ];
  if (batchMode.value) list.push({ key: 'exit-batch', label: '退出批量模式' });
  list.push(
    { key: 'pin', label: c.pinned ? '取消置顶' : '置顶' },
    { key: 'rename', label: '重命名' },
    { key: 'open-dir', label: '打开目录' },
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

function onConvSheetSelect(a: ActionSheetAction) {
  const c = ctxMenu.conv;
  closeCtxMenu();
  if (!c) return;
  if (a.key === 'batch') {
    if (batchMode.value && selectedConvIds.value.has(c.id)) toggleConvSelect(c.id);
    else enterBatchSelect(c.id);
  } else if (a.key === 'exit-batch') exitBatchMode();
  else if (a.key === 'pin') rows.togglePinned(c);
  else if (a.key === 'rename') rows.startRename(c);
  else if (a.key === 'open-dir') openConvDir(c);
  else if (a.key === 'move:null') rows.moveTo(c, null);
  else if (a.key.startsWith('move:')) rows.moveTo(c, a.key.slice(5));
  else if (a.key === 'delete') rows.remove(c);
}

/**
 * 点空间节点：
 *  · 已选中 → 纯折叠/展开（用户在看空间内部的任务列表）；
 *  · 未选中 → 选中它并同步工作目录（表达「接下来的任务归这个空间」——
 *    这是任务类型/SOP 生效的前提，2026-09-27 补）。
 */
function onSpaceHeadClick(id: string) {
  if (spaceStore.currentSpaceId === id) {
    toggleSpaceCollapse(id);
    return;
  }
  void selectSpaceAndSyncDir(id);
}

/** 空间的任务类型标签（列表上直接可见，省得进编辑弹窗才知道） */
function taskTypeLabel(id?: string) {
  return getTaskType(id).label;
}

/**
 * 是否触屏形态（窄视口 或 Capacitor）。
 * 只用于**文案**：触屏上要说「长按」，桌面/Web 上说「右键」——
 * 否则用户按提示操作却按不出来（2026-09-22 反馈的「长按没有实现」）。
 * ★ 交互本身不依赖它：`bindLongPress` 内部按 `pointerType === 'touch'` 判定，
 *   鼠标右键照常走原生 contextmenu，两侧互不影响。
 */
const isTouchShell = useMobileShell();

// ===== 空间目录选择：浏览本地目录，选完自动回填路径，名称留空时以目录名带出 =====
const dirPickerVisible = ref(false);
function onSpaceDirSelected(path: string) {
  spaceEditForm.value.dirPath = path;
  if (!spaceEditForm.value.name.trim() && path) {
    const sep = path.includes('\\') ? '\\' : '/';
    const base = path.split(sep).filter(Boolean).pop() || '';
    if (base) spaceEditForm.value.name = base.replace(/[:.]$/, '');
  }
}

// ===== 空间记忆（MEMORY.md）：读写 /api/spaces/:id/memory =====
const spaceMemoryOpen = ref(false);
const spaceMemoryLoading = ref(false);
const spaceMemorySaving = ref(false);
const spaceMemoryForm = ref({ id: '', name: '', content: '', path: '' });

async function openSpaceMemory(space: any) {
  if (!space?.id) return;
  spaceMemoryForm.value = { id: space.id, name: space.name || '空间', content: '', path: '' };
  spaceMemoryOpen.value = true;
  spaceMemoryLoading.value = true;
  try {
    const r = await spaceStore.readSpaceMemory(space.id);
    spaceMemoryForm.value.content = r.content;
    spaceMemoryForm.value.path = r.path;
  } catch (e: any) {
    ElMessage.error(e?.message || '读取空间记忆失败');
    spaceMemoryOpen.value = false;
  } finally {
    spaceMemoryLoading.value = false;
  }
}

async function saveSpaceMemory() {
  const { id, content } = spaceMemoryForm.value;
  if (!id) return;
  spaceMemorySaving.value = true;
  try {
    const r = await spaceStore.writeSpaceMemory(id, content);
    spaceMemoryForm.value.path = r.path || spaceMemoryForm.value.path;
    ElMessage.success('空间记忆已保存');
    spaceMemoryOpen.value = false;
  } catch (e: any) {
    ElMessage.error(e?.message || '保存空间记忆失败');
  } finally {
    spaceMemorySaving.value = false;
  }
}

function onDocMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('.ctx-menu')) return;
  closeCtxMenu();
  // 行内「移动」浮层：点浮层外任何位置（含任务行）都收起
  rows.closeMoveMenu();
}

onMounted(() => document.addEventListener('mousedown', onDocMouseDown, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true));
</script>

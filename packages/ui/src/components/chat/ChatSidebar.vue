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
        <el-input v-model="search" placeholder="搜索任务" size="small" clearable :prefix-icon="Search" />
        <div class="conv-header-row">
          <span v-if="!batchMode" class="batch-hint">右键会话进入批量，可整目录/整任务勾选</span>
          <el-button v-else size="small" type="warning" style="flex:1" @click="exitBatchMode">退出批量</el-button>
        </div>
      </div>

      <div class="conv-tree" @contextmenu.prevent="openTreeMenu($event)">
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
            <div
              v-for="conv in rootConversations"
              :key="conv.id"
              class="conv-item"
              :class="{ active: conv.id === store.currentConvId, pinned: conv.pinned, selecting: batchMode }"
              @click="batchMode ? toggleConvSelect(conv.id) : (drawerOpen = false, selectConv(conv.id))"
              @contextmenu.prevent="openConvMenu($event, conv)"
              @dblclick="!batchMode && startRename(conv)"
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
                @blur="commitRename"
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="renamingId = ''"
                ref="renameInputRef"
              />
              <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                <el-icon class="scheduled-badge"><Timer /></el-icon>
              </el-tooltip>
            </div>
            <div v-if="!rootCollapsed && rootConversations.length === 0" class="tree-empty">{{ search ? '无匹配' : '暂无任务' }}</div>
          </div>
        </div>

        <!-- 各空间节点 -->
        <div v-for="sp in spaceStore.spaces" :key="sp.id" class="tree-node tree-space">
          <div
            class="tree-node-head"
            @click="toggleSpaceCollapse(sp.id)"
            @contextmenu.prevent="openSpaceMenu($event, sp)"
          >
            <el-icon class="tree-caret" :class="{ expanded: !spaceCollapsed[sp.id] }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><FolderOpened /></el-icon>
            <span class="tree-node-label" :title="sp.dirPath || sp.name">{{ sp.name }}</span>
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
              @click="batchMode ? toggleConvSelect(conv.id) : (drawerOpen = false, selectConv(conv.id))"
              @contextmenu.prevent="openConvMenu($event, conv)"
              @dblclick="!batchMode && startRename(conv)"
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
                @blur="commitRename"
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="renamingId = ''"
                ref="renameInputRef"
              />
              <el-tooltip v-if="conv.scheduledTaskId" content="定时任务发起" placement="top">
                <el-icon class="scheduled-badge"><Timer /></el-icon>
              </el-tooltip>
            </div>
            <div v-if="!spaceCollapsed[sp.id] && (!conversationsBySpace[sp.id] || conversationsBySpace[sp.id].length === 0)" class="tree-empty">{{ search ? '无匹配' : '暂无任务' }}</div>
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
<ul v-if="ctxMenu.visible" class="ctx-menu" :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }">
    <li @click="(batchMode && selectedConvIds.has(ctxMenu.conv!.id) ? toggleConvSelect(ctxMenu.conv!.id) : enterBatchSelect(ctxMenu.conv!.id)); closeCtxMenu()">
      <el-icon><Tools /></el-icon>{{ batchMode && selectedConvIds.has(ctxMenu.conv!.id) ? '移出批量选择' : '批量选择' }}
    </li>
    <li v-if="batchMode" @click="exitBatchMode()">
      <el-icon><Close /></el-icon>退出批量模式
    </li>
    <li class="ctx-sep" />
    <li @click="togglePin(ctxMenu.conv)">
      <el-icon><Star /></el-icon>{{ ctxMenu.conv?.pinned ? '取消置顶' : '置顶' }}
    </li>
    <li @click="startRename(ctxMenu.conv!)">
      <el-icon><EditPen /></el-icon>重命名
    </li>
    <li class="has-submenu">
      <el-icon><FolderOpened /></el-icon>移动到空间
      <el-icon class="submenu-arrow"><ArrowRight /></el-icon>
      <ul class="ctx-submenu">
        <li v-if="spaceStore.spaces.length === 0" class="disabled-hint">暂无空间，请先创建</li>
        <li @click="moveConvToSpace(ctxMenu.conv!.id, null)">
          <el-icon><Close /></el-icon>未归类
        </li>
        <li v-for="sp in spaceStore.spaces" :key="sp.id" @click="moveConvToSpace(ctxMenu.conv!.id, sp.id)">
          <el-icon><FolderOpened /></el-icon>{{ sp.name }}
        </li>
      </ul>
    </li>
    <li class="danger" @click="deleteConv(ctxMenu.conv)">
      <el-icon><Delete /></el-icon>删除
    </li>
  </ul>
</Teleport>

  <el-dialog v-model="showSpaceEdit" :title="spaceEditForm.id ? '编辑空间' : '新建空间'" width="460px" :close-on-click-modal="false" class="compact-dialog">
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
    </el-form>
    <template #footer>
      <el-button @click="showSpaceEdit = false">取消</el-button>
      <el-button type="primary" @click="saveSpaceEdit">{{ spaceEditForm.id ? '保存' : '创建' }}</el-button>
    </template>
  </el-dialog>

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
      <el-icon><EditPen /></el-icon>编辑空间
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
import { ref, onMounted, onBeforeUnmount } from 'vue';
import {
  Plus, ChatDotRound, Star, EditPen, Delete, FolderOpened, ArrowRight, Close, Search, CaretRight, Timer, Memo, Tools,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useChat } from '../../composables/chat/useChat';
import ScheduledTaskDialog from './ScheduledTaskDialog.vue';
import ChatFileTab from './ChatFileTab.vue';
import WorkspaceDirDialog from '../WorkspaceDirDialog.vue';

const {
  sideTab, search, store, batchMode, toggleConvSelect,
  selectConv, drawerOpen, openConvMenu, startRename, selectedConvIds, renamingId, renamingTitle,
  commitRename, renameInputRef, filteredConversations, startNewChat, batchSelectAll, batchDeleteConvs,
  rootConversations, conversationsBySpace, spaceCollapsed, toggleSpaceCollapse, rootCollapsed, toggleRootCollapse,
  spaceStore, openSpaceMenu, openSpaceEdit, showSpaceEdit, spaceEditForm,
  saveSpaceEdit, deleteSpaceConfirm, spaceMenuTarget, closeSpaceMenu, moveConvToSpace, ctxMenu,
  togglePin, deleteConv, closeCtxMenu,
  treeMenu, openTreeMenu, treeMenuNewTask, treeMenuNewSpace, closeTreeMenu,
  enterBatchSelect, exitBatchMode, toggleBatchMode, toggleSelectAllInSpace, toggleSelectAllInRoot,
  spaceSelectState, rootSelectState,
} = useChat();

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
}

onMounted(() => document.addEventListener('mousedown', onDocMouseDown, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true));
</script>

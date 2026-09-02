<template>
  <aside class="sidebar">
    <div class="sidebar-tabs">
      <div class="sb-tab" :class="{ active: sideTab === 'chat' }" @click="sideTab = 'chat'">
        <el-icon><ChatDotRound /></el-icon> 对话
      </div>
      <div class="sb-tab" :class="{ active: sideTab === 'task' }" @click="sideTab = 'task'">
        <el-icon><Timer /></el-icon> 定时任务
      </div>
    </div>

    <div v-if="sideTab === 'chat'" class="conv-list">
      <div class="conv-header">
        <el-input v-model="search" placeholder="搜索会话" size="small" clearable :prefix-icon="Search" />
        <div class="conv-header-row">
          <el-button size="small" @click="batchMode = !batchMode" :type="batchMode ? 'warning' : ''" style="flex:1">
            {{ batchMode ? '取消' : '批量' }}
          </el-button>
        </div>
      </div>

      <div class="conv-tree">
        <!-- 对话根节点：未归类会话 -->
        <div class="tree-node tree-root">
          <div class="tree-node-head" @click="toggleRootCollapse">
            <el-icon class="tree-caret" :class="{ expanded: !rootCollapsed }"><CaretRight /></el-icon>
            <el-icon class="tree-node-icon"><ChatDotRound /></el-icon>
            <span class="tree-node-label">任务</span>
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
              @contextmenu.prevent="!batchMode && openConvMenu($event, conv)"
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
            <div v-if="!rootCollapsed && rootConversations.length === 0" class="tree-empty">{{ search ? '无匹配' : '暂无会话' }}</div>
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
              @contextmenu.prevent="!batchMode && openConvMenu($event, conv)"
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
            <div v-if="!spaceCollapsed[sp.id] && (!conversationsBySpace[sp.id] || conversationsBySpace[sp.id].length === 0)" class="tree-empty">{{ search ? '无匹配' : '暂无会话' }}</div>
          </div>
        </div>

      </div>

      <div v-if="batchMode && selectedConvIds.size > 0" class="batch-bar">
        <span>已选 {{ selectedConvIds.size }} 个</span>
        <el-button size="small" :disabled="filteredConversations.length === 0" @click="batchSelectAll">全选</el-button>
        <el-button size="small" type="danger" @click="batchDeleteConvs">删除选中</el-button>
      </div>
    </div>

    <div v-else class="task-tab">
      <ScheduledTaskDialog />
    </div>
  </aside>

  <ul v-if="ctxMenu.visible" class="ctx-menu" :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }">
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

  <el-dialog v-model="showSpaceEdit" title="编辑空间" width="460px">
    <el-form label-width="80px">
      <el-form-item label="名称">
        <el-input v-model="spaceEditForm.name" placeholder="空间名称" />
      </el-form-item>
      <el-form-item label="目录">
        <el-input v-model="spaceEditForm.dirPath" placeholder="绑定的本地目录（可选）" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="spaceEditForm.description" type="textarea" :rows="2" placeholder="空间描述（可选）" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showSpaceEdit = false">取消</el-button>
      <el-button type="primary" @click="saveSpaceEdit">保存</el-button>
    </template>
  </el-dialog>

  <ul v-if="spaceMenuTarget" class="ctx-menu" :style="{ top: spaceMenuTarget.y + 'px', left: spaceMenuTarget.x + 'px' }" @click.stop>
    <li @click="openSpaceEdit(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><EditPen /></el-icon>编辑空间
    </li>
    <li class="danger" @click="deleteSpaceConfirm(spaceMenuTarget.space); closeSpaceMenu()">
      <el-icon><Delete /></el-icon>删除空间
    </li>
  </ul>

</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import {
  Plus, ChatDotRound, Star, EditPen, Delete, FolderOpened, ArrowRight, Close, Search, CaretRight, Timer,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import ScheduledTaskDialog from './ScheduledTaskDialog.vue';

const {
  sideTab, search, store, batchMode, toggleConvSelect,
  selectConv, drawerOpen, openConvMenu, startRename, selectedConvIds, renamingId, renamingTitle,
  commitRename, renameInputRef, filteredConversations, startNewChat, batchSelectAll, batchDeleteConvs,
  rootConversations, conversationsBySpace, spaceCollapsed, toggleSpaceCollapse, rootCollapsed, toggleRootCollapse,
  spaceStore, openSpaceMenu, openSpaceEdit, showSpaceEdit, spaceEditForm,
  saveSpaceEdit, deleteSpaceConfirm, spaceMenuTarget, closeSpaceMenu, moveConvToSpace, ctxMenu,
  togglePin, deleteConv, closeCtxMenu,
} = useChat();

function onDocMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('.ctx-menu')) return;
  closeCtxMenu();
}

onMounted(() => document.addEventListener('mousedown', onDocMouseDown, true));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true));
</script>

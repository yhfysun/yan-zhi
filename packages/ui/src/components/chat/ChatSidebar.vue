<template>
  <aside class="sidebar">
    <div class="sidebar-tabs">
      <div class="sb-tab" :class="{ active: sideTab === 'agent' }" @click="sideTab = 'agent'">
        <el-icon><User /></el-icon> 智能体
      </div>
      <div class="sb-tab" :class="{ active: sideTab === 'chat' }" @click="sideTab = 'chat'">
        <el-icon><ChatDotRound /></el-icon> 会话
      </div>
    </div>

    <div v-if="sideTab === 'agent'" class="agent-list">
      <div class="agent-item add-agent" @click="openCreateAgent">
        <el-icon><Plus /></el-icon> 新建智能体
      </div>
      <div
        v-for="ag in agentStore.agents"
        :key="ag.id"
        class="agent-item"
        :class="{ active: ag.id === agentStore.selectedId }"
        @click="agentStore.selectAgent(ag.id)"
      >
        <div class="agent-avatar">{{ ag.name.slice(0, 1) }}</div>
        <div class="agent-info">
          <div class="agent-name">
            <el-icon v-if="ag.isDefault" class="lock-icon"><Lock /></el-icon>
            {{ ag.name }}
          </div>
          <div class="agent-summary">{{ ag.description || '无描述' }}</div>
        </div>
        <el-button class="agent-edit-btn" text size="small" circle @click.stop="openEditAgent(ag)">
          <el-icon><EditPen /></el-icon>
        </el-button>
      </div>
    </div>

    <div v-else class="conv-list">
      <div class="space-selector">
        <div class="space-tabs">
          <div class="space-tab" :class="{ active: spaceStore.currentSpaceId === null }" @click="selectSpace(null)" title="全部会话">
            全部
          </div>
          <div
            v-for="sp in spaceStore.spaces"
            :key="sp.id"
            class="space-tab"
            :class="{ active: spaceStore.currentSpaceId === sp.id }"
            :title="sp.dirPath || sp.name"
            @click="selectSpace(sp.id)"
            @contextmenu.prevent="openSpaceMenu($event, sp)"
          >
            <el-icon :size="12"><FolderOpened /></el-icon>
            <span class="space-tab-name">{{ sp.name }}</span>
          </div>
          <div class="space-tab add-space-tab" @click="createSpaceQuick" title="新建空间">
            <el-icon><Plus /></el-icon>
          </div>
        </div>
        <div v-if="spaceStore.currentSpaceId && spaceStore.currentSpace" class="space-current-hint" :title="spaceStore.currentSpace.dirPath">
          <el-icon :size="12"><FolderOpened /></el-icon>
          <span>{{ spaceStore.currentSpace.dirPath || '未绑定目录' }}</span>
        </div>
      </div>
      <div class="conv-header">
        <el-input v-model="search" placeholder="搜索会话" size="small" clearable :prefix-icon="Search" />
        <div class="conv-header-row">
          <el-button type="primary" size="small" plain @click="startNewChat" style="flex:1">
            <el-icon><Plus /></el-icon> 新建
          </el-button>
          <el-button size="small" @click="batchMode = !batchMode" :type="batchMode ? 'warning' : ''">
            {{ batchMode ? '取消' : '批量' }}
          </el-button>
        </div>
      </div>
      <div class="conv-items">
        <div
          v-for="conv in filteredConversations"
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
        </div>
        <el-empty v-if="filteredConversations.length === 0" :description="search ? '无匹配会话' : '新建会话开始对话'" :image-size="50" />
      </div>
      <div v-if="batchMode && selectedConvIds.size > 0" class="batch-bar">
        <span>已选 {{ selectedConvIds.size }} 个</span>
        <el-button size="small" :disabled="filteredConversations.length === 0" @click="batchSelectAll">全选</el-button>
        <el-button size="small" type="danger" @click="batchDeleteConvs">删除选中</el-button>
      </div>
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
import {
  Plus, ChatDotRound, Star, EditPen, User, Delete, FolderOpened, ArrowRight, Close, Search,
} from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';

const {
  sideTab, agentStore, openCreateAgent, openEditAgent, search, store, batchMode, toggleConvSelect,
  selectConv, drawerOpen, openConvMenu, startRename, selectedConvIds, renamingId, renamingTitle,
  commitRename, renameInputRef, filteredConversations, startNewChat, batchSelectAll, batchDeleteConvs,
  spaceStore, selectSpace, createSpaceQuick, openSpaceMenu, openSpaceEdit, showSpaceEdit, spaceEditForm,
  saveSpaceEdit, deleteSpaceConfirm, spaceMenuTarget, closeSpaceMenu, moveConvToSpace, ctxMenu,
  togglePin, deleteConv,
} = useChat();
</script>

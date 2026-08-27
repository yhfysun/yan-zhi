<template>
  <div class="chat-topbar">
    <el-button class="hamburger-btn" text circle @click="drawerOpen = !drawerOpen">
      <el-icon :size="20"><Expand /></el-icon>
    </el-button>
    <span class="conv-title-display">{{ currentConv?.title || '新对话' }}</span>
    <el-dropdown class="model-pill-dropdown" trigger="click" popper-class="model-pill-popper" @command="onModelChange">
      <span class="model-pill">
        <span class="model-pill-dot"></span>
        <span class="model-pill-name">{{ selectedModel?.alias || selectedModel?.modelId || '选择模型' }}</span>
        <span class="model-pill-reasoning">推理增强</span>
        <el-icon :size="12"><ArrowDown /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <template v-for="group in modelGroups" :key="group.platformId">
            <el-dropdown-item disabled class="model-pill-group-label">{{ group.platformName }}</el-dropdown-item>
            <el-dropdown-item
              v-for="model in group.models"
              :key="model.id"
              :command="model.id"
              :disabled="model.id === selectedModelId"
              class="model-pill-option"
            >
              <span>{{ model.alias || model.modelId }}</span>
              <span class="model-pill-option-id">{{ model.modelId }}</span>
            </el-dropdown-item>
          </template>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <div class="chat-topbar-actions">
      <el-tooltip content="上下文栏" placement="bottom">
        <el-button size="small" circle :type="contextSidebarOpen ? 'primary' : ''" @click="toggleContextSidebar" aria-label="切换上下文栏">
          <el-icon><Grid /></el-icon>
        </el-button>
      </el-tooltip>
      <ChatFilePanel />
      <el-tooltip content="侧栏（预览窗口）" placement="bottom">
        <el-button size="small" circle @click="toggleRightPanel" :type="store.rightPanelOpen ? 'primary' : ''" aria-label="切换右侧栏">
          <el-icon><Operation /></el-icon>
        </el-button>
      </el-tooltip>
      <el-dropdown v-if="isMobile && authStore.isLoggedIn" trigger="click">
        <span class="mobile-user-avatar">{{ authStore.user?.username?.slice(0, 1) || 'U' }}</span>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-dropdown-header">
              <span class="user-dropdown-name">{{ authStore.user?.username }}</span>
            </div>
            <el-dropdown-item divided @click="authStore.logout()">
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <router-link v-else-if="isMobile" to="/login" class="mobile-user-avatar" style="text-decoration:none;font-size:14px">
        <el-icon :size="18"><User /></el-icon>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, Expand, Grid, Operation, SwitchButton, User } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import ChatFilePanel from './ChatFilePanel.vue';

const {
  drawerOpen, currentConv, toggleRightPanel, store, isMobile, authStore,
  modelGroups, selectedModelId, onModelChange, contextSidebarOpen, toggleContextSidebar,
} = useChat();

const selectedModel = computed(() => {
  for (const group of modelGroups.value) {
    const match = group.models.find((model) => model.id === selectedModelId.value);
    if (match) return match;
  }
  return undefined;
});
</script>

<style scoped>
.model-pill-dropdown {
  flex-shrink: 0;
  margin-left: 2px;
}

.model-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--el-fill-color-blank, #fff);
  color: var(--el-text-color-primary, #1e293b);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.model-pill:hover {
  border-color: var(--el-color-primary, #7c3aed);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.12);
}

.model-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
  flex-shrink: 0;
}

.model-pill-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-pill-reasoning {
  padding-left: 7px;
  border-left: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  color: var(--el-text-color-secondary, #64748b);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .model-pill {
    height: 30px;
    padding: 0 8px;
    gap: 5px;
  }

  .model-pill-name {
    max-width: 112px;
  }

  .model-pill-reasoning {
    display: none;
  }
}
</style>

<style>
.model-pill-popper {
  border-radius: 10px !important;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1)) !important;
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(15, 23, 42, 0.12)) !important;
}

.model-pill-group-label {
  color: var(--el-text-color-secondary, #64748b) !important;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.model-pill-option {
  min-width: 260px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.model-pill-option-id {
  color: var(--el-text-color-secondary, #64748b);
  font-size: 11px;
}
</style>

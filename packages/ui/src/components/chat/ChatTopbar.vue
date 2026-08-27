<template>
  <div class="chat-topbar">
    <el-button class="hamburger-btn" text circle @click="drawerOpen = !drawerOpen">
      <el-icon :size="20"><Expand /></el-icon>
    </el-button>
    <span class="conv-title-display">{{ currentConv?.title || '新对话' }}</span>
    <div class="chat-topbar-actions">
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
import { Expand, Operation, SwitchButton, User } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import ChatFilePanel from './ChatFilePanel.vue';

const {
  drawerOpen, currentConv, toggleRightPanel, store, isMobile, authStore,
} = useChat();
</script>

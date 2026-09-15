<template>
  <div class="chat-topbar">
    <el-button class="hamburger-btn" text circle @click="drawerOpen = !drawerOpen">
      <el-icon :size="20"><Expand /></el-icon>
    </el-button>
    <span class="conv-title-display">{{ currentConv?.title || '新任务' }}</span>
    <el-tooltip content="新建任务" placement="bottom">
      <el-button size="small" circle class="new-chat-btn" @click="startNewChat()" aria-label="新建任务">
        <el-icon><EditPen /></el-icon>
      </el-button>
    </el-tooltip>
    <div class="chat-topbar-actions">
      <el-tooltip content="上下文栏" placement="bottom">
        <el-button size="small" circle :type="contextSidebarOpen ? 'primary' : ''" @click="toggleContextSidebar" aria-label="切换上下文栏">
          <el-icon><Grid /></el-icon>
        </el-button>
      </el-tooltip>

      <ChatFilePanel />

      <el-tooltip content="代码模式（IDE 工作台）" placement="bottom">
        <el-button size="small" circle class="code-mode-btn" @click="goCodeMode" aria-label="进入代码模式">
          <el-icon :size="16"><Code /></el-icon>
        </el-button>
      </el-tooltip>
      <el-dropdown trigger="click">
        <el-button size="small" circle title="右侧栏视图" aria-label="右侧栏视图">
          <el-icon><Operation /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="supportsBrowser" @click="store.openTab({ kind: 'browser', name: '浏览器', url: '' })">
              <el-icon><Monitor /></el-icon><span>浏览器预览</span>
            </el-dropdown-item>
            <el-dropdown-item @click="openGitTab" :disabled="!hasWorkspaceDir">
              <el-icon><FolderOpened /></el-icon><span>Git 文件</span>
            </el-dropdown-item>
            <el-dropdown-item @click="openConsoleTab">
              <el-icon><Cpu /></el-icon><span>控制台</span>
            </el-dropdown-item>
            <el-dropdown-item divided @click="store.rightPanelOpen = !store.rightPanelOpen">
              <el-icon><Fold v-if="store.rightPanelOpen" /><Expand v-else /></el-icon>
              <span>{{ store.rightPanelOpen ? '收起右侧栏' : '展开右侧栏' }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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
import { useRouter } from 'vue-router';
import { Code } from 'lucide-vue-next';
import { Cpu, Expand, FolderOpened, Fold, Grid, Monitor, Operation, EditPen, SwitchButton, User } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { usePlatform } from '../../composables/usePlatform';
import { useSettingsStore } from '../../stores/settings';
import ChatFilePanel from './ChatFilePanel.vue';

const router = useRouter();

const {
  drawerOpen, currentConv, store, isMobile, authStore,
  contextSidebarOpen, toggleContextSidebar,
  startNewChat,
} = useChat();

const settingsStore = useSettingsStore();
// E12: 移动端不支持内置浏览器——隐藏「浏览器预览」下拉入口
const { supportsBrowser } = usePlatform();
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

/** 进入代码模式（IDE 工作台）：携带当前会话，右侧对话区继续同一会话 */
function goCodeMode() {
  router.push('/code');
}

function openGitTab() {
  const dir = settingsStore.settings.workspaceDir || '';
  const repoName = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Git';
  store.openTab({ kind: 'git', name: repoName, repoPath: dir });
}

function openConsoleTab() {
  store.openTab({ kind: 'console', name: '控制台' });
}
</script>

<style scoped>
.code-mode-btn {
  color: var(--color-text-secondary);
}
.code-mode-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.new-chat-btn {
  flex-shrink: 0;
  margin-left: 6px;
}
</style>


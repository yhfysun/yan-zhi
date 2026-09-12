<template>
  <div class="chat-topbar">
    <el-button class="hamburger-btn" text circle @click="drawerOpen = !drawerOpen">
      <el-icon :size="20"><Expand /></el-icon>
    </el-button>
    <span class="conv-title-display">{{ currentConv?.title || '新任务' }}</span>
    <AppMenu
      class="model-pill-dropdown"
      :items="modelMenuItems"
      placement="bottom-start"
      :width="280"
      @select="onModelMenuSelect"
    >
      <span class="model-pill">
        <span class="model-pill-dot"></span>
        <span class="model-pill-name">{{ selectedModel?.alias || selectedModel?.modelId || '选择模型' }}</span>
        <el-icon :size="12"><ArrowDown /></el-icon>
      </span>
    </AppMenu>
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
            <el-dropdown-item @click="store.openTab({ kind: 'browser', name: '浏览器', url: '' })">
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
import { ArrowDown, Cpu, Expand, FolderOpened, Fold, Grid, Monitor, Operation, EditPen, SwitchButton, User } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { useSettingsStore } from '../../stores/settings';
import AppMenu from '../AppMenu.vue';
import type { MenuNode } from '../AppMenuPanel.vue';

const router = useRouter();

const {
  drawerOpen, currentConv, store, isMobile, authStore,
  modelGroups, selectedModelId, onModelChange, contextSidebarOpen, toggleContextSidebar,
  startNewChat,
} = useChat();

const settingsStore = useSettingsStore();
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

/** 模型分组 → AppMenu 节点：分组标题用 group 类型，不再用 disabled 项冒充 */
const modelMenuItems = computed<MenuNode[]>(() => {
  const items: MenuNode[] = [];
  for (const group of modelGroups.value) {
    items.push({ key: `group-${group.platformId}`, label: group.platformName, type: 'group' });
    for (const model of group.models) {
      items.push({
        key: model.id,
        label: model.alias || model.modelId,
        desc: model.modelId,
        selected: model.id === selectedModelId.value,
      });
    }
  }
  return items;
});

function onModelMenuSelect(node: MenuNode) {
  if (node.key === selectedModelId.value) return;
  onModelChange(node.key);
}

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

.model-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.1));
  background: var(--el-fill-color-blank, #fff);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.model-pill:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.model-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 16%, transparent);
  flex-shrink: 0;
}

.model-pill-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
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
}
</style>


<template>
  <div class="chat-topbar">
    <el-button class="hamburger-btn" text circle @click="drawerOpen = !drawerOpen">
      <el-icon :size="20"><Expand /></el-icon>
    </el-button>
    <span class="conv-title-display">{{ currentConv?.title || '新任务' }}</span>
    <el-tooltip content="新建任务" placement="bottom">
      <el-button size="small" circle class="new-chat-btn" @click="startNewChat()" aria-label="新建任务">
        <!-- 用 DocumentAdd（"新建文档"）而非 EditPen：EditPen 已被输入框工具条的
             「新建任务」圆钮占用，两者同屏会撞脸（2026-09-21 实测 2 处重复）。 -->
        <el-icon><DocumentAdd /></el-icon>
      </el-button>
    </el-tooltip>
    <div class="chat-topbar-actions">
      <!-- 模式切换已统一收进主顶栏模式下拉（WebTopBar ModeSwitcher），此处不再重复入口 -->

      <el-tooltip content="上下文栏" placement="bottom">
        <el-button size="small" circle :type="contextSidebarOpen ? 'primary' : ''" @click="toggleContextSidebar" aria-label="切换上下文栏">
          <!-- 用 DataLine 而非 Grid：Grid 已被右侧面板空态的「数据浏览」占用，
               两者同屏会撞脸（2026-09-21 实测 2 处重复）。 -->
          <el-icon><DataLine /></el-icon>
        </el-button>
      </el-tooltip>

      <ChatFilePanel />

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
              <!-- 原为 Cpu：与 TabBar「模型」项同图标，下拉展开时同屏撞脸（2026-09-21 实测）。
                   控制台 = 服务端/平台控制台，用 Platform 更贴语义。 -->
              <el-icon><Platform /></el-icon><span>控制台</span>
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
      <!-- ★★★ 本机单机端（Capacitor）→ 中性「本机」头像，不给登录入口（2026-09-27）。
           移动端跑内嵌后端、身份恒为 guest（本地自带，非用户登录），与桌面端同一形态；
           此前是无条件 `v-else-if="isMobile"` → 移动端稳定渲染出「登录」死入口。 -->
      <span v-else-if="isMobile && isLocalClient" class="mobile-user-avatar is-local" title="本机">{{ localIdentityInitial }}</span>
      <router-link v-else-if="isMobile" to="/login" class="mobile-user-avatar" style="text-decoration:none;font-size:14px">
        <el-icon :size="18"><Avatar /></el-icon>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Expand, FolderOpened, Fold, DataLine, Monitor, Operation, DocumentAdd, SwitchButton, Avatar, Platform } from '@element-plus/icons-vue';
import { useChat } from '../../composables/chat/useChat';
import { usePlatform } from '../../composables/usePlatform';
import { useSettingsStore } from '../../stores/settings';
import { isLocalClient } from '../../api/client';
import ChatFilePanel from './ChatFilePanel.vue';

const {
  drawerOpen, currentConv, store, isMobile, authStore,
  contextSidebarOpen, toggleContextSidebar,
  startNewChat,
} = useChat();

const settingsStore = useSettingsStore();
// E12: 移动端不支持内置浏览器——隐藏「浏览器预览」下拉入口
const { supportsBrowser } = usePlatform();
const hasWorkspaceDir = computed(() => !!settingsStore.settings.workspaceDir);

/** 本机身份首字母（本机单机端的中性头像，不暴露 guest 这个内部身份） */
const localIdentityInitial = computed(() => '本');

// 「代码模式」圆形按钮已删（决策 1）：进入开发模式统一走顶栏模式下拉。

// 模式切换统一走主顶栏 ModeSwitcher，此处不再保留重复入口

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
.new-chat-btn {
  flex-shrink: 0;
  margin-left: 6px;
}

</style>
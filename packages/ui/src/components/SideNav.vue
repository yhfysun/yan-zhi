<template>
  <nav class="side-nav">
    <div class="nav-top">
      <el-tooltip v-for="item in navItems" :key="item.path" :content="item.label" placement="right" :show-after="400">
        <router-link :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }">
          <el-icon :size="20"><component :is="item.icon" /></el-icon>
        </router-link>
      </el-tooltip>
    </div>

    <div class="nav-bottom">
      <el-dropdown v-if="authStore.isLoggedIn" trigger="click" popper-class="sidenav-user-popper">
        <span class="nav-avatar" :title="authStore.user?.username">
          {{ authStore.user?.username?.slice(0, 1) || 'U' }}
        </span>
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
      <el-tooltip v-else content="登录" placement="right">
        <span class="nav-item" @click="$router.push('/login')">
          <el-icon :size="20"><User /></el-icon>
        </span>
      </el-tooltip>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { ChatDotRound, Connection, Box, Files, Setting, Cpu, User, SwitchButton } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const navItems = [
  { path: '/chat', label: '聊天', icon: ChatDotRound },
  { path: '/models', label: '模型平台', icon: Cpu },
  { path: '/mcp', label: 'MCP 服务', icon: Connection },
  { path: '/skills', label: 'Skill 商店', icon: Files },
  { path: '/agents', label: '智能体', icon: Box },
  { path: '/settings', label: '设置', icon: Setting },
];

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/');
}
</script>

<style scoped>
.side-nav {
  position: fixed; left: 0; top: 0; bottom: 0; width: 52px;
  display: flex; flex-direction: column; align-items: center;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border-right: 1px solid var(--glass-border);
  padding: 10px 0;
  z-index: 100;
}

.nav-top {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding-top: 4px;
}

.nav-bottom {
  display: flex; flex-direction: column; align-items: center; padding-bottom: 4px;
}

.nav-item {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px; cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative; text-decoration: none;
}
.nav-item:hover {
  color: var(--color-text);
  background: var(--glass-bg-hover);
}
.nav-item.active {
  color: var(--color-primary);
  background: rgba(124, 58, 237, 0.1);
}
.nav-item.active::before {
  content: ''; position: absolute; left: 0; top: 25%; height: 50%;
  width: 3px; background: var(--color-primary); border-radius: 0 2px 2px 0;
}
.nav-item:active { transform: scale(0.93); }

.nav-avatar {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(236, 72, 153, 0.15));
  color: var(--color-primary);
  cursor: pointer; user-select: none;
  transition: all 0.2s ease;
}
.nav-avatar:hover {
  transform: scale(1.06);
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.2);
}
</style>

<style>
.sidenav-user-popper {
  border-radius: var(--radius-md) !important;
  border: 1px solid var(--glass-border) !important;
  box-shadow: var(--shadow-lg) !important;
  padding: 4px !important; min-width: 140px !important;
}
.sidenav-user-popper .el-dropdown-menu__item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px;
}
.user-dropdown-header {
  padding: 8px 14px 4px; font-size: 12px;
  color: var(--color-text-secondary); white-space: nowrap;
}
</style>

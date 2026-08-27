<template>
  <!-- 桌面平台：可折叠带标签侧栏 -->
  <nav v-if="isDesktop" class="side-nav side-nav-desktop" :class="{ collapsed }">
    <div class="nav-top">
      <el-tooltip
        v-for="item in navItems"
        :key="item.path"
        :content="item.label"
        placement="right"
        :show-after="400"
        :disabled="!collapsed"
      >
        <router-link :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }">
          <el-icon :size="20"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </el-tooltip>
    </div>

    <div class="nav-bottom">
      <el-dropdown v-if="authStore.isLoggedIn" trigger="click" popper-class="sidenav-user-popper">
        <div class="nav-avatar-wrap" :title="authStore.user?.username">
          <span class="nav-avatar">{{ authStore.user?.username?.slice(0, 1) || 'U' }}</span>
          <span class="nav-label nav-username">{{ authStore.user?.username }}</span>
        </div>
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
      <el-tooltip v-else content="登录" placement="right" :disabled="!collapsed">
        <div class="nav-avatar-wrap" @click="$router.push('/login')">
          <span class="nav-avatar"><el-icon :size="20"><User /></el-icon></span>
          <span class="nav-label nav-username">登录</span>
        </div>
      </el-tooltip>
      <!-- 折叠 / 展开切换按钮 -->
      <button
        class="nav-collapse-btn"
        type="button"
        :title="collapsed ? '展开侧栏' : '折叠侧栏'"
        @click="toggle()"
      >
        <el-icon :size="18"><component :is="collapsed ? Expand : Fold" /></el-icon>
        <span class="nav-label nav-collapse-label">{{ collapsed ? '展开' : '折叠' }}</span>
      </button>
    </div>
  </nav>

  <!-- Web 宽屏：保留原有 52px 图标 dock（浏览器/MCP 为桌面端专属，web 端不显示） -->
  <nav v-else-if="!isMobile" class="side-nav">
    <div class="nav-top">
      <el-tooltip v-for="item in navItems.filter(i => i.path !== '/mcp' && i.path !== '/browser')" :key="item.path" :content="item.label" placement="right" :show-after="400">
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

  <!-- 移动端底部 TabBar：常用入口 + 更多 -->
  <nav v-if="isMobile" class="tab-bar">
    <router-link
      v-for="item in mobilePrimaryItems"
      :key="item.path"
      :to="item.path"
      class="tab-bar-item"
      :class="{ active: isActive(item.path) }"
    >
      <el-icon :size="20"><component :is="item.icon" /></el-icon>
      <span class="tab-bar-label">{{ item.tabLabel || item.label }}</span>
    </router-link>
    <button
      type="button"
      class="tab-bar-item tab-bar-more"
      :class="{ active: isMoreActive }"
      @click="showMore = true"
    >
      <el-icon :size="20"><MoreFilled /></el-icon>
      <span class="tab-bar-label">更多</span>
    </button>
  </nav>

  <!-- 移动端“更多”底部抽屉 -->
  <transition name="tab-more-fade">
    <div v-if="isMobile && showMore" class="tab-more-mask" @click.self="showMore = false">
      <div class="tab-more-sheet">
        <div class="tab-more-header">
          <span>更多功能</span>
          <button type="button" class="tab-more-close" aria-label="关闭" @click="showMore = false">×</button>
        </div>
        <div class="tab-more-grid">
          <router-link
            v-for="item in mobileMoreItems"
            :key="item.path"
            :to="item.path"
            class="tab-more-item"
            :class="{ active: isActive(item.path) }"
            @click="showMore = false"
          >
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
            <span>{{ item.tabLabel || item.label }}</span>
          </router-link>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChatDotRound, Box, Files, Setting, Cpu, User, SwitchButton, Suitcase, Connection, Fold, Expand, Monitor, HomeFilled, MagicStick, ChatLineRound, Promotion, Collection, MoreFilled } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { useIsMobile } from '../composables/useIsMobile';
import { usePlatform } from '../composables/usePlatform';
import { useSidebarState } from '../composables/useSidebarState';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isMobile = useIsMobile();
const { isDesktop } = usePlatform();
const { collapsed, toggle } = useSidebarState();

const navItems = [
  { path: '/home', label: '首页', tabLabel: '首页', icon: HomeFilled },
  { path: '/chat', label: '聊天', tabLabel: '对话', icon: ChatDotRound },
  { path: '/peers', label: '客户端节点', tabLabel: '节点', icon: ChatLineRound },
  { path: '/connections', label: 'IM 连接', tabLabel: '连接', icon: Promotion },
  { path: '/knowledge', label: '知识库', tabLabel: '知识', icon: Collection },
  { path: '/browser', label: '浏览器', tabLabel: '浏览器', icon: Monitor },
  { path: '/models', label: '模型平台', tabLabel: '模型', icon: Cpu },
  { path: '/tools', label: '工具管理', tabLabel: '工具', icon: Suitcase },
  { path: '/skills', label: 'Skill 商店', tabLabel: 'Skills', icon: Files },
  { path: '/distill', label: 'Skill 蒸馏', tabLabel: '蒸馏', icon: MagicStick },
  { path: '/agents', label: '智能体', tabLabel: '智能体', icon: Box },
  { path: '/mcp', label: 'MCP 服务', tabLabel: 'MCP', icon: Connection },
  { path: '/settings', label: '设置', tabLabel: '设置', icon: Setting },
];

const mobilePrimaryPaths = new Set(['/home', '/chat', '/agents', '/tools']);
const mobilePrimaryItems = computed(() => navItems.filter((item) => mobilePrimaryPaths.has(item.path)));
const mobileMoreItems = computed(() =>
  navItems.filter((item) => !mobilePrimaryPaths.has(item.path) && item.path !== '/mcp' && item.path !== '/browser'),
);
const isMoreActive = computed(() => mobileMoreItems.value.some((item) => isActive(item.path)));
const showMore = ref(false);

watch(
  () => route.path,
  () => {
    showMore.value = false;
  },
);

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
  border: none; background: transparent; font-family: inherit; padding: 0;
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

/* ===== 桌面端可折叠带标签侧栏（覆盖 .side-nav 默认值） ===== */
.side-nav-desktop {
  width: 220px;
  /* 桌面端侧栏从标题栏下方开始；web/mobile 无 --titlebar-h 变量，回退 0px */
  top: var(--titlebar-h, 0px);
  align-items: stretch;
  padding: 10px 8px;
  /* 桌面端实色背景，关闭毛玻璃 */
  background: var(--el-bg-color, #fff);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transition: width 0.2s ease;
}
.side-nav-desktop.collapsed {
  width: 56px;
}
[data-theme="dark"] .side-nav-desktop {
  background: var(--el-bg-color, #1b1d23);
}

.side-nav-desktop .nav-top {
  align-items: stretch;
  gap: 2px;
}

.side-nav-desktop .nav-item {
  width: auto;
  height: 40px;
  padding: 0 14px;
  gap: 12px;
  border-radius: 10px;
  justify-content: flex-start;
}
.side-nav-desktop.collapsed .nav-item {
  width: 40px;
  padding: 0;
  justify-content: center;
}

.side-nav-desktop .nav-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  flex: 1;
  text-align: left;
}
.side-nav-desktop.collapsed .nav-label {
  display: none;
}

.side-nav-desktop .nav-bottom {
  align-items: stretch;
  gap: 4px;
  padding: 0 4px 4px;
}

/* 用户头像行：展开时整行可点，折叠时只剩圆形头像 */
.side-nav-desktop .nav-avatar-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 8px 0 7px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.side-nav-desktop .nav-avatar-wrap:hover {
  background: var(--glass-bg-hover);
}
.side-nav-desktop.collapsed .nav-avatar-wrap {
  width: 40px;
  padding: 0;
  justify-content: center;
}
.side-nav-desktop .nav-avatar-wrap .nav-avatar {
  flex-shrink: 0;
}

/* 折叠 / 展开切换按钮 */
.nav-collapse-btn {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 10px;
  transition: all 0.18s ease;
  font-family: inherit;
}
.side-nav-desktop.collapsed .nav-collapse-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  justify-content: center;
  margin: 0 auto;
}
.nav-collapse-btn:hover {
  color: var(--color-text);
  background: var(--glass-bg-hover);
}
.nav-collapse-btn .nav-collapse-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  flex: 1;
  text-align: left;
}

/* ===== Mobile bottom TabBar ===== */
.tab-bar {
  display: none;
}

@media (max-width: 767px) {
  .tab-bar {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 56px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-filter);
    -webkit-backdrop-filter: var(--glass-filter);
    border-top: 1px solid var(--glass-border);
    z-index: 100;
    justify-content: space-around;
    align-items: flex-start;
    padding-top: 6px;
  }

  .tab-bar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 3px;
    min-width: 0;
    min-height: 44px;
    text-decoration: none;
    color: var(--color-text-secondary);
    font-size: 10px;
    font-weight: 500;
    border-radius: 10px;
    padding: 4px 2px;
    margin: 0 2px;
    transition: color 0.18s ease, background-color 0.18s ease;
    position: relative;
    border: none; background: transparent; font-family: inherit;
  }

  .tab-bar-item:hover {
    color: var(--color-text);
  }

  .tab-bar-item.active {
    color: var(--color-primary);
    background: rgba(124, 58, 237, 0.1);
  }

  .tab-bar-item.active .el-icon {
    transform: translateY(-1px) scale(1.06);
    transition: transform 0.18s ease;
  }

  .tab-bar-item.active::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 18px;
    height: 3px;
    background: var(--color-primary);
    border-radius: 0 0 2px 2px;
  }

  .tab-bar-label {
    font-size: 10px;
    line-height: 1;
  }
}

.tab-bar-more {
  cursor: pointer;
}

.tab-more-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
}

.tab-more-sheet {
  width: 100%;
  max-height: 72vh;
  overflow: auto;
  background: var(--el-bg-color, #fff);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px calc(16px + env(safe-area-inset-bottom, 0px));
}

.tab-more-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 12px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.tab-more-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  border-radius: 8px;
}

.tab-more-close:hover {
  color: var(--color-text);
  background: var(--glass-bg-hover);
}

.tab-more-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.tab-more-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 4px;
  border-radius: 12px;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-decoration: none;
  transition: color 0.18s ease, background-color 0.18s ease;
}

.tab-more-item:hover {
  color: var(--color-text);
  background: var(--glass-bg-hover);
}

.tab-more-item.active {
  color: var(--color-primary);
  background: rgba(124, 58, 237, 0.1);
}

.tab-more-fade-enter-active,
.tab-more-fade-leave-active {
  transition: opacity 0.2s ease;
}

.tab-more-fade-enter-from,
.tab-more-fade-leave-to {
  opacity: 0;
}

.tab-more-fade-enter-active .tab-more-sheet,
.tab-more-fade-leave-active .tab-more-sheet {
  transition: transform 0.22s ease;
}

.tab-more-fade-enter-from .tab-more-sheet,
.tab-more-fade-leave-to .tab-more-sheet {
  transform: translateY(100%);
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

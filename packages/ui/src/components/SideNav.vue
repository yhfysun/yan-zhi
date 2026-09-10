<template>
  <!-- 桌面平台：可折叠带标签侧栏（分组导航） -->
  <nav v-if="isDesktop" class="side-nav side-nav-desktop" :class="{ collapsed }">
    <div class="nav-top">
      <template v-for="g in navGroups" :key="g.label">
        <div v-if="!collapsed" class="nav-group-label">{{ g.label }}</div>
        <template v-for="item in g.items" :key="item.path">
          <el-tooltip
            :content="item.label"
            placement="right"
            :show-after="400"
            :disabled="!collapsed"
          >
            <router-link v-if="item.kind === 'route'" :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }">
              <el-icon :size="20"><component :is="item.icon" /></el-icon>
              <span class="nav-label">{{ item.label }}</span>
            </router-link>
            <router-link v-else to="/settings" class="nav-item">
              <el-icon :size="20"><component :is="item.icon" /></el-icon>
              <span class="nav-label">{{ item.label }}</span>
            </router-link>
          </el-tooltip>
        </template>
      </template>
    </div>

    <div class="nav-bottom">
      <el-dropdown v-if="authStore.isLoggedIn" trigger="click" popper-class="sidenav-user-popper">
        <div class="nav-avatar-wrap" :title="authStore.user?.username">
          <span class="nav-avatar">{{ authStore.user?.username?.slice(0, 1) || 'U' }}<i class="login-dot" /></span>
          <span class="nav-label nav-username">{{ authStore.user?.username }}</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-dropdown-header">
              <span class="user-dropdown-name">{{ authStore.user?.username }}</span>
            </div>
            <el-dropdown-item @click="$router.push('/settings')">
              <el-icon><Setting /></el-icon>
              <span>设置</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/memory')">
              <el-icon><Collection /></el-icon>
              <span>记忆管理</span>
            </el-dropdown-item>
            <el-dropdown-item divided @click="$router.push('/data-sources')">
              <el-icon><DataLine /></el-icon>
              <span>数据源</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/ontologies')">
              <el-icon><Share /></el-icon>
              <span>本体管理</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/std-attributes')">
              <el-icon><Collection /></el-icon>
              <span>标准属性</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/sql-console')">
              <el-icon><Operation /></el-icon>
              <span>SQL 控制台</span>
            </el-dropdown-item>
            <el-dropdown-item v-for="it in pluginMoreItems" :key="'more-' + it.id" @click="$router.push(it.route)">
              <el-icon><component :is="resolvePluginIcon(it.icon)" /></el-icon>
              <span>{{ it.label }}</span>
            </el-dropdown-item>
            <el-dropdown-item v-if="!isElectron" divided @click="authStore.logout()">
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-tooltip v-else-if="!isElectron" content="登录" placement="right" :disabled="!collapsed">
        <div class="nav-avatar-wrap is-login-entry" @click="$router.push('/login')">
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

  <!-- Web 宽屏：52px 图标 dock -->
  <nav v-else-if="!isMobile" class="side-nav">
    <div class="nav-top">
      <template v-for="item in navItems" :key="item.path">
        <el-tooltip :content="item.label" placement="right" :show-after="400">
          <router-link v-if="item.kind === 'route'" :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }">
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
          </router-link>
          <router-link v-else to="/settings" class="nav-item">
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
          </router-link>
        </el-tooltip>
      </template>
    </div>

    <div class="nav-bottom">
      <el-tooltip :content="settingsStore.settings.darkMode ? '切换浅色模式' : '切换深色模式'" placement="right">
        <button class="nav-item nav-theme-toggle" type="button" aria-label="切换主题" @click="toggleTheme">
          <el-icon :size="20"><component :is="settingsStore.settings.darkMode ? Sunny : Moon" /></el-icon>
        </button>
      </el-tooltip>
      <el-dropdown v-if="authStore.isLoggedIn" trigger="click" popper-class="sidenav-user-popper">
        <span class="nav-avatar" :title="authStore.user?.username">
          {{ authStore.user?.username?.slice(0, 1) || 'U' }}<i class="login-dot" />
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-dropdown-header">
              <span class="user-dropdown-name">{{ authStore.user?.username }}</span>
            </div>
            <el-dropdown-item @click="$router.push('/settings')">
              <el-icon><Setting /></el-icon>
              <span>设置</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/memory')">
              <el-icon><Collection /></el-icon>
              <span>记忆管理</span>
            </el-dropdown-item>
            <el-dropdown-item divided @click="$router.push('/data-sources')">
              <el-icon><DataLine /></el-icon>
              <span>数据源</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/ontologies')">
              <el-icon><Share /></el-icon>
              <span>本体管理</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/std-attributes')">
              <el-icon><Collection /></el-icon>
              <span>标准属性</span>
            </el-dropdown-item>
            <el-dropdown-item @click="$router.push('/sql-console')">
              <el-icon><Operation /></el-icon>
              <span>SQL 控制台</span>
            </el-dropdown-item>
            <el-dropdown-item v-for="it in pluginMoreItems" :key="'more2-' + it.id" @click="$router.push(it.route)">
              <el-icon><component :is="resolvePluginIcon(it.icon)" /></el-icon>
              <span>{{ it.label }}</span>
            </el-dropdown-item>
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

  <!-- 移动端底部 TabBar：五个核心入口 -->
  <nav v-if="isMobile" class="tab-bar">
    <template v-for="item in mobilePrimaryItems" :key="item.path">
      <router-link
        v-if="item.kind === 'route'"
        :to="item.path"
        class="tab-bar-item"
        :class="{ active: isActive(item.path) }"
      >
        <el-icon :size="20"><component :is="item.icon" /></el-icon>
        <span class="tab-bar-label">{{ item.tabLabel || item.label }}</span>
      </router-link>
      <router-link
        v-else
        to="/settings"
        class="tab-bar-item"
      >
        <el-icon :size="20"><component :is="item.icon" /></el-icon>
        <span class="tab-bar-label">{{ item.tabLabel || item.label }}</span>
      </router-link>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ChatDotRound, Setting, User, SwitchButton, Fold, Expand, Monitor, Collection, Moon, Sunny, HomeFilled, Promotion, DataLine, Operation, Share } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { useSettingsStore } from '../stores/settings';
import { useIsMobile } from '../composables/useIsMobile';
import { usePlatform } from '../composables/usePlatform';
import { useSidebarState } from '../composables/useSidebarState';
import { usePluginStore } from '../stores/plugin';
import { resolvePluginIcon } from '../plugin-icons';
import { isElectron, isCapacitor } from '../api/client';

const route = useRoute();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const isMobile = useIsMobile();
const { isDesktop } = usePlatform();
const { collapsed, toggle } = useSidebarState();

interface NavItem {
  path: string;
  label: string;
  tabLabel?: string;
  icon: any;
  kind: 'route' | 'settings';
  group: string;
  /** 移动端 TabBar 不显示该项（如内置浏览器仅桌面端） */
  hideOnMobile?: boolean;
}

const builtinNavItems: NavItem[] = [
  { path: '/home', label: '首页', tabLabel: '首页', icon: HomeFilled, kind: 'route', group: '工作台' },
  { path: '/chat', label: '任务', tabLabel: '任务', icon: ChatDotRound, kind: 'route', group: '工作台' },
  { path: '/browser', label: '浏览器', tabLabel: '浏览器', icon: Monitor, kind: 'route', group: '工作台', hideOnMobile: true },
  { path: '/chat-hub', label: '消息', tabLabel: '消息', icon: Promotion, kind: 'route', group: '工作台' },
  { path: '', label: '设置', tabLabel: '设置', icon: Setting, kind: 'settings', group: '系统' },
];

const pluginStore = usePluginStore();
function matchWhen(when?: string): boolean {
  if (!when || when === 'all') return true;
  if (when === 'desktop') return isDesktop;
  if (when === 'mobile') return isMobile.value;
  if (when === 'web') return !isDesktop && !isMobile.value;
  return true;
}
/** 侧栏「插件」分组：不含声明进「更多」菜单的项 */
const pluginNavItems = computed<NavItem[]>(() =>
  pluginStore.sidebar
    .filter((item) => matchWhen(item.when))
    .filter((item) => !item.moreGroup || item.moreGroup === 'nav')
    .map((item) => ({
      path: item.route,
      label: item.label,
      tabLabel: item.label,
      icon: resolvePluginIcon(item.icon),
      kind: 'route' as const,
      group: '插件',
    })),
);
/** 「更多」菜单项（Web 端渲染进用户下拉；桌面端由 TitleBar 承担） */
const pluginMoreItems = computed(() =>
  pluginStore.sidebar
    .filter((item) => matchWhen(item.when))
    .filter((item) => item.moreGroup && item.moreGroup !== 'nav'),
);
const navItems = computed<NavItem[]>(() => [...builtinNavItems, ...pluginNavItems.value].filter((i) => !(i as any).hideOnMobile || !isCapacitor));
/** 桌面展开态按 group 分组渲染 */
const navGroups = computed(() => {
  const groups: Array<{ label: string; items: NavItem[] }> = [];
  for (const item of navItems.value) {
    let g = groups.find((x) => x.label === item.group);
    if (!g) { g = { label: item.group, items: [] }; groups.push(g); }
    g.items.push(item);
  }
  return groups;
});
/** 移动端底部 TabBar：五个核心入口（对话 / 智能体 / 浏览器 / 知识库 / 设置） */
const mobilePrimaryItems = computed<NavItem[]>(() => [
  ...builtinNavItems.filter((i) => ['/chat', '/chat-hub'].includes(i.path)),
  { path: '', label: '设置', tabLabel: '设置', icon: Setting, kind: 'settings', group: '系统' },
]);

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/');
}

function toggleTheme() {
  settingsStore.update({ darkMode: !settingsStore.settings.darkMode });
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
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
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
  flex-shrink: 0;
}
.nav-item:hover {
  color: var(--color-text);
  background: var(--glass-bg-hover);
}
.nav-item.active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}
.nav-item.active::before {
  content: ''; position: absolute; left: 0; top: 25%; height: 50%;
  width: 3px; background: var(--color-primary); border-radius: 0 2px 2px 0;
}
.nav-item:active { transform: scale(0.93); }

.nav-avatar {
  position: relative;
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  cursor: pointer; user-select: none;
  transition: all 0.2s ease;
}
.nav-avatar:hover {
  transform: scale(1.06);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 20%, transparent);
}
/* 登录状态点：绿点 = 已登录在线 */
.nav-avatar .login-dot {
  position: absolute; right: -2px; bottom: -2px;
  width: 11px; height: 11px; border-radius: 50%;
  background: #22c55e;
  border: 2px solid var(--glass-bg);
}
/* 未登录入口：主题色实底按钮，明确可点 */
.nav-avatar-wrap.is-login-entry .nav-avatar {
  background: var(--color-primary);
  color: #fff;
}

/* ===== 桌面端可折叠带标签侧栏（覆盖 .side-nav 默认值） ===== */
.side-nav-desktop {
  width: 220px;
  top: var(--titlebar-h, 0px);
  align-items: stretch;
  padding: 10px 8px;
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

/* 分组标题（仅桌面展开态显示） */
.nav-group-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
  opacity: 0.7;
  padding: 10px 14px 4px;
  white-space: nowrap;
  user-select: none;
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
.side-nav-desktop.collapsed .nav-group-label {
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
/* 用户菜单：圆角/边框/阴影交由 styles/menu.css 统一基座，仅保留布局定制 */
.sidenav-user-popper {
  min-width: 140px !important;
}
.sidenav-user-popper .el-dropdown-menu__item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px;
}
</style>

<template>
  <div class="title-bar">
    <!-- 拖拽背景层：铺满整条标题栏，按钮等交互元素作为兄弟叠在其上方 -->
    <div class="drag-region"></div>

    <!-- 内容层：pointer-events:none 使非按钮区域点击穿透到拖拽层 -->
    <div class="title-content">
      <!-- 左侧：品牌 logo（朱砂对话气泡）+ 名称 -->
      <div class="brand">
        <svg class="brand-logo" viewBox="0 0 24 24" role="img" aria-label="言智">
          <path d="M12 2.5C6.8 2.5 2.5 6.3 2.5 11c0 2.8 1.5 5.3 3.8 6.9L5.2 21l4.6-2.2c.7.1 1.4.2 2.2.2 5.2 0 9.5-3.8 9.5-8.5S17.2 2.5 12 2.5z" fill="var(--color-primary)" />
          <circle cx="8.2" cy="11" r="1.5" fill="#fff" />
          <circle cx="12" cy="11" r="1.5" fill="#fff" />
          <circle cx="15.8" cy="11" r="1.5" fill="#fff" />
        </svg>
        <span class="brand-name">言智</span>
      </div>

      <!-- 横排主导航：核心 4 页 + 更多下拉（其它功能入口 + 设置，统一收进弹层） -->
      <nav class="title-nav">
        <router-link
          v-for="m in navMenus"
          :key="m.path"
          :to="m.path"
          class="title-nav-item"
          :class="{ active: isActive(m.path) }"
        >
          <el-icon :size="15"><component :is="m.icon" /></el-icon>
          <span>{{ m.label }}</span>
        </router-link>
        <!-- 更多：用 el-popover 而非 el-dropdown —— dropdown 会把内容包进 el-scrollbar（overflow 裁剪），
             二级 hover 面板向右飞出会被裁掉并撑出横向滚动条；popover 内容无滚动包裹，飞出面板正常渲染 -->
        <el-popover
          v-model:visible="moreOpen"
          trigger="click"
          placement="bottom-start"
          :show-arrow="false"
          :width="'auto'"
          popper-class="more-menu-popper"
        >
          <template #reference>
            <button class="title-nav-item" :class="{ active: moreActive || moreOpen }" type="button">
              <el-icon :size="15"><More /></el-icon>
              <span>更多</span>
            </button>
          </template>
          <HoverMenu :items="moreItems" :width="196" @select="onMoreSelect" />
        </el-popover>
      </nav>

      <!-- 中部：可拖拽留白（flex:1） -->
      <div class="title-spacer"></div>

      <!-- 登录状态：头像（绿点=已登录）/ 登录按钮 -->
      <el-dropdown v-if="authStore.isLoggedIn" trigger="click" popper-class="sidenav-user-popper">
        <span class="title-avatar" :title="authStore.user?.username">
          {{ authStore.user?.username?.slice(0, 1) || 'U' }}<i class="login-dot" />
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-dropdown-header">
              <span class="user-dropdown-name">{{ authStore.user?.username }}</span>
            </div>
            <el-dropdown-item command="/settings">
              <el-icon><Setting /></el-icon>
              <span>设置</span>
            </el-dropdown-item>
            <el-dropdown-item command="/memory">
              <el-icon><Collection /></el-icon>
              <span>记忆管理</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button v-else class="title-login-btn" type="button" @click="$router.push('/login')">登录</button>

      <!-- 主题切换 -->
      <button class="win-btn title-theme-btn" type="button" title="切换主题" @click="toggleTheme">
        <el-icon :size="15">
          <Sunny v-if="settingsStore.settings.darkMode" />
          <Moon v-else />
        </el-icon>
      </button>

      <!-- 右侧：窗口控制按钮 -->
      <div class="window-controls">
        <button class="win-btn" title="最小化" @click="onMinimize">
          <el-icon :size="16"><Minus /></el-icon>
        </button>
        <button class="win-btn" title="最大化" @click="onToggleMaximize">
          <el-icon :size="14">
            <CopyDocument v-if="isMaximized" />
            <FullScreen v-else />
          </el-icon>
        </button>
        <button class="win-btn win-btn--close" title="关闭" @click="onClose">
          <el-icon :size="16"><Close /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Minus, FullScreen, CopyDocument, Close, Moon, Sunny, HomeFilled, ChatDotRound, Monitor, Promotion, Setting, Collection,
  More, Cpu, Tools, Files, User, Link, Platform, MagicStick, Memo, Box, DataLine, Operation, Share,
} from '@element-plus/icons-vue';
import { useSettingsStore, useAuthStore, usePluginStore, openSettingsDrawer } from '@yan-zhi/ui';
import { resolvePluginIcon } from '@yan-zhi/ui/plugin-icons';
import HoverMenu from '@yan-zhi/ui/components/HoverMenu.vue';
import type { HoverMenuItem } from '@yan-zhi/ui/components/HoverMenu.vue';

// Electron 渲染进程通过 contextBridge 注入的 API
const api = (window as any).electronAPI;
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

// 横排主导航：核心 4 页
const navMenus = [
  { path: '/home', label: '首页', icon: HomeFilled },
  { path: '/chat', label: '任务', icon: ChatDotRound },
  { path: '/browser', label: '浏览器', icon: Monitor },
  { path: '/chat-hub', label: '消息', icon: Promotion },
];
function isActive(p: string) {
  return route.path === p || route.path.startsWith(p + '/');
}

// 插件注入的导航项（原 SideNav pluginNavItems 等价迁移；桌面端 when 过滤）
const pluginStore = usePluginStore();
const pluginMenus = computed<HoverMenuItem[]>(() =>
  pluginStore.sidebar
    .filter((it) => !it.when || it.when === 'all' || it.when === 'desktop')
    .map((it) => ({ path: it.route, label: it.label, icon: resolvePluginIcon(it.icon) as HoverMenuItem['icon'] })),
);

// 「更多」下拉：按「能力 / 数据 / 连接」三组 hover 二级展开 + 底部独立项（记忆/插件/设置/插件注入）
// MCP 不再单列：已并入 /tools 工具页「MCP 服务」tab
const moreItems = computed<HoverMenuItem[]>(() => [
  {
    key: 'group-capability',
    label: '能力',
    icon: MagicStick,
    children: [
      { key: 'agents', label: '智能体', icon: User, path: '/agents', desc: '创建与编辑智能体' },
      { key: 'skills', label: 'Skill', icon: Files, path: '/skills', desc: '技能商店与详情' },
      { key: 'distill', label: 'Skill 蒸馏', icon: MagicStick, path: '/distill', desc: '沉淀会话为技能' },
      { key: 'tools', label: '工具', icon: Tools, path: '/tools', desc: '工具库 · MCP · 远程商城' },
    ],
  },
  {
    key: 'group-data',
    label: '数据',
    icon: DataLine,
    children: [
      { key: 'knowledge', label: '知识库', icon: Collection, path: '/knowledge', desc: '文档与知识条目' },
      { key: 'data-sources', label: '数据源', icon: DataLine, path: '/data-sources', desc: '数据库连接管理' },
      { key: 'ontologies', label: '本体管理', icon: Share, path: '/ontologies', desc: '数据本体建模' },
      { key: 'sql-console', label: 'SQL 控制台', icon: Operation, path: '/sql-console', desc: '查询与探索' },
    ],
  },
  {
    key: 'group-connection',
    label: '连接',
    icon: Link,
    children: [
      { key: 'models', label: '模型平台', icon: Cpu, path: '/models', desc: '模型服务接入' },
      { key: 'connections', label: 'IM 连接', icon: Link, path: '/connections', desc: '飞书 / 企微 / 微信' },
      { key: 'peers', label: '客户端节点', icon: Platform, path: '/peers', desc: '远程设备节点' },
    ],
  },
  { key: 'divider-memory', label: '', divider: true },
  { key: 'memory', label: '记忆管理', icon: Memo, path: '/memory' },
  { key: 'plugins', label: '插件管理', icon: Box, path: '/plugins' },
  { key: 'divider-settings', label: '', divider: true },
  { key: 'settings', label: '设置', icon: Setting, path: '/settings' },
  ...(pluginMenus.value.length
    ? [
        { key: 'divider-plugins', label: '', divider: true },
        ...pluginMenus.value.map((m) => ({ ...m })),
      ]
    : []),
]);

const moreActive = computed(
  () =>
    moreItems.value.some((it) => it.children?.some((c) => c.path && isActive(c.path))) ||
    moreItems.value.some((it) => it.path && isActive(it.path)) ||
    pluginMenus.value.some((m) => m.path !== undefined && isActive(m.path)),
);

const moreOpen = ref(false);

function onMoreSelect(item: HoverMenuItem) {
  moreOpen.value = false;
  if (item.path) router.push(item.path);
}

// 是否处于最大化状态
const isMaximized = ref(false);

// 窗口尺寸变化监听回调
let resizeHandler: (() => void) | null = null;

// 最小化
async function onMinimize() {
  try { api?.minimize(); } catch {}
}

// 最大化 / 还原切换（Electron 主进程的 window-maximize 已实现 toggle 逻辑）
async function onToggleMaximize() {
  try {
    api?.maximize();
    // 点击后立即同步状态（resize 事件可能不会触发，例如从最大化还原）
    if (api?.isMaximized) {
      isMaximized.value = await api.isMaximized();
    }
  } catch {}
}

// 关闭窗口
async function onClose() {
  try { api?.close(); } catch {}
}

onMounted(async () => {
  try {
    await settingsStore.load();
  } catch {}

  if (!api) return;
  try {
    // 初始化最大化状态
    isMaximized.value = await api.isMaximized();
    // 监听窗口尺寸变化，同步最大化状态
    resizeHandler = async () => {
      try { isMaximized.value = await api.isMaximized(); } catch {}
    };
    window.addEventListener('resize', resizeHandler);
  } catch {}
});

function toggleTheme() {
  settingsStore.update({ darkMode: !settingsStore.settings.darkMode });
}

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
});
</script>

<style scoped>
.title-bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 36px;
  width: 100%;
  background: var(--glass-bg);
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
}

/* 拖拽背景层：绝对定位铺满整条标题栏，置于最底层；使用 Electron 原生拖拽 */
.drag-region {
  position: absolute;
  inset: 0;
  z-index: 0;
  -webkit-app-region: drag;
  app-region: drag;
}

/* 内容层：透传点击事件到拖拽层，仅按钮拦截点击 */
.title-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* 品牌区 */
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

.brand-logo {
  width: 22px;
  height: 22px;
  display: block;
}

.brand-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0.02em;
}

/* 横排主导航（桌面端菜单上移标题栏） */
.title-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 10px;
}

.title-nav-item {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 11px;
  border: none;
  border-radius: 7px;
  background: transparent;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  cursor: pointer;
  pointer-events: auto;
  text-decoration: none;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  transition: background 0.15s ease, color 0.15s ease;
}

.title-nav-item:hover {
  background: var(--glass-bg-hover);
  color: var(--color-text);
}

.title-nav-item.active {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-weight: 500;
}

/* 登录头像（绿点=已登录）/ 登录按钮 */
.title-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
  outline: none;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.title-avatar .login-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  border: 1.5px solid var(--glass-bg);
}

.title-login-btn {
  height: 24px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

/* 中部留白（可拖拽） */
.title-spacer {
  flex: 1;
  height: 100%;
}

/* 窗口控制按钮组 */
.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
}

.title-theme-btn {
  width: 40px;
  color: var(--color-text-secondary);
}

.title-theme-btn:hover {
  background: var(--glass-bg-hover);
  color: var(--color-primary);
}

.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 36px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  pointer-events: auto;
  /* 按钮区域禁用拖拽，允许点击 */
  -webkit-app-region: no-drag;
  app-region: no-drag;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.win-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.win-btn:active {
  background: rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] .win-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

[data-theme="dark"] .win-btn:active {
  background: rgba(255, 255, 255, 0.12);
}

/* 关闭按钮 hover 变红、图标变白 */
.win-btn--close:hover {
  background: #e81123;
  color: #ffffff;
}

.win-btn--close:active {
  background: #c50f1f;
  color: #ffffff;
}
</style>

<style>
/* 「更多」菜单 popper（teleport 到 body，需全局作用域；不依赖 chat.css 的 plus-menu-popper） */
.more-menu-popper {
  border-radius: 12px !important;
  border: 1px solid var(--glass-border) !important;
  box-shadow: var(--shadow-lg) !important;
  padding: 4px !important;
  background: var(--el-bg-color-overlay, var(--glass-bg));
}
</style>

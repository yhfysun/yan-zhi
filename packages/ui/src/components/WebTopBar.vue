<!--
  WebTopBar.vue — desktop 与 web 共享的顶部横排菜单
  - 原 desktop 版本搬自 apps/desktop/src/components/TitleBar.vue
  - Electron API（窗口控制 / 最大化监听）以可选链调用，web 端 electronAPI=undefined 时安全跳过
  - 拖拽区 (-webkit-app-region: drag) 在浏览器中被忽略，无副作用
  - "/ops" 菜单项已删除：routes 表里没有该路由，web 端点击会落到根重定向（不必要）
-->
<template>
  <div class="title-bar">
    <!-- 管理员视图切换横幅（2026-11-01）：以目标用户身份查看数据时常驻提示 -->
    <div v-if="viewAsInfo && authStore.hasPermission('admin')" class="viewas-banner">
      <el-icon :size="13"><User /></el-icon>
      <span>正在查看 <b>{{ viewAsInfo.username }}</b> 的数据（你的操作都以该身份执行）</span>
      <button class="viewas-exit" type="button" @click="exitViewAs">退出查看</button>
    </div>
    <!-- 拖拽背景层：铺满整条标题栏，按钮等交互元素作为兄弟叠在其上方 -->
    <div class="drag-region"></div>

    <!-- 内容层：pointer-events:none 使非按钮区域点击穿透到拖拽层 -->
    <div class="title-content">
      <!-- 左侧：品牌 logo -->
      <div class="brand">
        <img class="brand-logo" src="../assets/titlebar-logo.png" alt="言智" draggable="false" />
      </div>

      <!-- 当前模式下拉 + 顶部工作方式切换 + 工具“更多”。 -->
      <nav v-if="!modeLocked" class="title-nav">
        <ModeSwitcher />
        <WorkspaceModeSwitch />
        <el-popover
          v-model:visible="moreOpen"
          :disabled="moreSuppressed"
          :trigger="isTouchLike ? 'click' : 'hover'"
          :show-after="isTouchLike ? 0 : 120"
          :hide-after="isTouchLike ? 0 : 120"
          placement="bottom-start"
          :show-arrow="false"
          :width="'auto'"
          popper-class="yz-menu-popper more-menu-popper"
        >
          <template #reference>
            <button class="title-nav-item" :class="{ active: moreActive || moreOpen }" type="button" aria-label="更多">
              <el-icon :size="15"><More /></el-icon>
              <span>更多</span>
            </button>
          </template>
          <HoverMenu :items="moreItems" :width="196" @select="onMoreSelect" />
        </el-popover>

        <!-- 刷新：界面卡住/白屏时的自助恢复出口（紧接「更多」之后） -->
        <button class="title-nav-item title-nav-item--icon" type="button" title="刷新界面" @click="onReload">
          <el-icon :size="15"><Refresh /></el-icon>
        </button>
        <button
          v-if="officeSidebarAvailable"
          class="title-nav-item title-nav-item--icon office-sidebar-toggle"
          type="button"
          :class="{ active: !officeAiSidebarCollapsed }"
          :title="officeAiSidebarCollapsed ? '展开办公侧栏（Ctrl+B）' : '收起办公侧栏（Ctrl+B）'"
          :aria-label="officeAiSidebarCollapsed ? '展开办公侧栏' : '收起办公侧栏'"
          :aria-pressed="!officeAiSidebarCollapsed"
          @click="toggleOfficeAiSidebar"
        >
          <el-icon :size="15"><Expand v-if="officeAiSidebarCollapsed" /><Fold v-else /></el-icon>
          <span>侧栏</span>
        </button>
      </nav>

      <!-- 中部：可拖拽留白（flex:1） -->
      <div class="title-spacer"></div>

      <!-- 右侧：全局搜索（⌘K/Ctrl+K 或点按钮，基础版检索任务/空间）。
           「新任务」不放顶栏——ChatTopbar / 输入框工具条 / 侧栏三处已有入口，
           再摆一个会和头像挤在一起（2026-10-04 用户红框反馈）。
           ★ 模式窗口同样隐藏（与主导航同一口径：不做任何能切走路由的入口）。 -->
      <div v-if="!modeLocked" class="title-quick">
        <button class="top-search-button" type="button" aria-label="搜索工作区" @click="onGlobalSearch">
          <el-icon :size="15"><Search /></el-icon>
          <span>搜索工作区</span>
          <kbd>Ctrl K</kbd>
        </button>
        <el-popover
          v-model:visible="notificationOpen"
          trigger="click"
          placement="bottom-end"
          :show-arrow="false"
          :width="344"
          popper-class="yz-menu-popper top-notification-popper"
        >
          <template #reference>
            <button
              class="title-nav-item title-nav-item--icon top-notification-button"
              type="button"
              title="通知"
              aria-label="通知"
            >
              <el-icon :size="15"><Bell /></el-icon>
              <span v-if="unreadNotificationCount" class="top-notification-badge">
                {{ unreadNotificationCount > 9 ? '9+' : unreadNotificationCount }}
              </span>
            </button>
          </template>
          <section class="top-notification-panel" aria-label="通知中心">
            <header class="top-notification-head">
              <div>
                <strong>通知</strong>
                <span>{{ unreadNotificationCount ? `${unreadNotificationCount} 条未读` : '没有未读通知' }}</span>
              </div>
              <button
                v-if="notificationItems.length"
                type="button"
                class="top-notification-readall"
                @click="markNotificationsRead"
              >
                全部已读
              </button>
            </header>
            <div v-if="notificationItems.length" class="top-notification-list">
              <button
                v-for="item in notificationItems"
                :key="item.key"
                type="button"
                class="top-notification-item"
                :class="{ unread: item.at > notificationSeenAt }"
                @click="openNotification(item.convId)"
              >
                <span class="top-notification-state" :class="item.kind">
                  <el-icon :size="13">
                    <CircleCheck v-if="item.kind === 'done'" />
                    <WarningFilled v-else-if="item.kind === 'error'" />
                    <ChatDotRound v-else />
                  </el-icon>
                </span>
                <span class="top-notification-copy">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.body }}</small>
                  <time>{{ formatNotificationTime(item.at) }}</time>
                </span>
              </button>
            </div>
            <div v-else class="top-notification-empty">
              <el-icon :size="18"><Bell /></el-icon>
              <span>任务完成、出错或需要你处理时会显示在这里</span>
            </div>
          </section>
        </el-popover>
        <button
          class="title-nav-item title-nav-item--icon"
          :class="{ active: route.path.startsWith('/chat-hub') }"
          type="button"
          title="消息中心"
          aria-label="消息中心"
          @click="router.push('/chat-hub')"
        >
          <el-icon :size="15"><ChatDotRound /></el-icon>
        </button>
        <!-- 超级剪贴板入口（2026-10-29）：桌面端才有独立面板窗；召唤键见设置 → 快捷键 -->
        <button v-if="clipboardAvailable" class="title-nav-item title-nav-item--icon" type="button"
                title="超级剪贴板（全局快捷键召唤）" @click="onOpenClipboard">
          <el-icon :size="15"><CopyDocument /></el-icon>
        </button>
        <!-- 游戏窗（P2）：独立置顶窗跑 /browser，用于网页游戏/盯盘这类不该被主窗口遮住的场景 -->
        <button v-if="gameWindowSupported" class="title-nav-item title-nav-item--icon" type="button"
                title="游戏窗（独立置顶）" @click="onOpenGameWindow">
          <el-icon :size="15"><VideoPlay /></el-icon>
        </button>
      </div>

      <!--
        身份区：头像下拉 / 未登录时的登录入口。

        ★★★ 桌面端必须有头像入口（2026-09-27 第二次修正，之前修反了）：
          第一版我把桌面端的登录按钮直接删掉（`v-else-if="!isElectron"`），
          结果桌面端**什么身份入口都没有了** —— 因为：
            · `authStore.isLoggedIn` 在桌面端恒 false（guest 不算登录态）；
            · 桌面端 `SideNav` 也不渲染（`v-if="isMobile"`，非窄屏非 Capacitor），
              而 SideNav 里那套头像原本是桌面端能看到的最近入口。
          两头都进不去 → 用户看到的只有那个"点了被弹回"的死按钮，删掉后连按钮都没了。

          正解：桌面端渲染**中性头像**（不叫"登录"、不引导登录）——本机替代 guest 论：
            · 有心跳保存的真实用户 → 显示其首字母；
            · 否则显示"本"（本机），不暴露 guest 这个内部身份；
            · 下拉里给「设置 / 记忆管理」，**不提供退出登录**（没有登录态可退）。
          Web/移动端仍走「未登录 → 登录入口」的老逻辑（将来接用户体系要用）。 -->
      <el-dropdown v-if="!modeLocked && authStore.isLoggedIn" trigger="click" popper-class="sidenav-user-popper yz-menu-popper" @visible-change="(v: boolean) => (avatarMenuOpen = v)" @command="onAvatarCommand">
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
            <!-- 退出登录（2026-11-01 RBAC）：multi 模式登录态下的账号切换入口 -->
            <el-dropdown-item divided command="__logout__">
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <!-- 桌面端：本机身份头像。guest 不是登录账号，只保留设置与记忆入口。 -->
      <el-dropdown v-else-if="!modeLocked && isElectron" trigger="click" popper-class="sidenav-user-popper yz-menu-popper" @visible-change="(v: boolean) => (avatarMenuOpen = v)" @command="onAvatarCommand">
        <span class="title-avatar is-local" :title="localIdentityTitle">
          {{ localIdentityInitial }}
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="user-dropdown-header">
              <span class="user-dropdown-name">{{ localIdentityTitle }}</span>
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
      <!-- Web/移动端：未登录 → 登录入口（模式窗口不渲染，避免切走路由） -->
      <button v-else-if="!modeLocked" class="title-login-btn" type="button" @click="$router.push('/login')">登录</button>

      <!-- 主题切换 -->
      <button class="win-btn title-theme-btn" type="button" title="切换主题" @click="toggleTheme">
        <el-icon :size="15">
          <Sunny v-if="settingsStore.settings.darkMode" />
          <Moon v-else />
        </el-icon>
      </button>

      <!-- 右侧：窗口控制按钮（★ 仅桌面渲染：web 端 electronAPI 不存在，按钮只会是死控件；
           Task 4 之后这里就是 Electron 唯一的窗口控制区，独立标题栏行已不存在） -->
      <div v-if="isElectron" class="window-controls">
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

    <!-- ⌘K 全局搜索面板：Teleport 到 body，⌘K/Ctrl+K 与 🔍 按钮共用（基础版：任务/空间） -->
    <CommandPalette v-model:visible="paletteVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Minus, FullScreen, CopyDocument, Close, Moon, Sunny, ChatDotRound, Monitor, Setting, Collection,
  More, Cpu, Tools, Files, User, Link, Platform, MagicStick, Memo, Box, DataLine, Operation, Share, Refresh, Key,
  Search, VideoCamera, SwitchButton, VideoPlay, Notebook, Bell, CircleCheck, WarningFilled, Fold, Expand,
} from '@element-plus/icons-vue';
import { useSettingsStore, useAuthStore, usePluginStore, useChatStore } from '@yan-zhi/ui';
import { getViewAs, setViewAs } from '../api/client';
import { isElectron, isCapacitor } from '../api/client';
import { ElMessage } from 'element-plus';
import { plainRect } from '../composables/pluginWindowHotkeys';
import { resolvePluginIcon } from '@yan-zhi/ui/plugin-icons';
import HoverMenu from './HoverMenu.vue';
import type { HoverMenuItem } from './HoverMenu.vue';
import { titleBarOverlayOpen } from '../composables/useTitleBarOverlay';
import { openSettingsDialog } from '../composables/useSettingsDialog';
import CommandPalette from './common/CommandPalette.vue';
import ModeSwitcher from './workbench/ModeSwitcher.vue';
import WorkspaceModeSwitch from './workbench/WorkspaceModeSwitch.vue';
import { useChat } from '../composables/chat/useChat';
import { activeMode } from '../stores/mode';
import { officeAiSidebarCollapsed, officePanel, toggleOfficeAiSidebar } from '../stores/officeWorkbench';
import { isStandaloneWindow } from '../utils/modeWindow';

// 独立窗口锁定（模式窗口 / 会话窗口）：整个生命周期内上下文不变（窗口打开时即带
// window= 标记），用常量而非 computed —— 避免模板里每个分支都走 hash 解析。
const modeLocked = isStandaloneWindow();

// 超级剪贴板（2026-10-29）：只有桌面端主进程提供了面板能力才显示入口
const clipboardAvailable = typeof window !== 'undefined' && !!(window as any).electronAPI?.clipboardPanel;
function onOpenClipboard() {
  try { (window as any).electronAPI?.clipboardPanel?.toggle?.(); } catch { /* 主进程未就绪 */ }
}

// Electron 渲染进程通过 contextBridge 注入的 API（web 端为 undefined，全部走可选链）
const api = (window as any).electronAPI;

/** 游戏窗能力：只有桌面端能开独立置顶窗（Web 端没有 childWindow） */
const gameWindowSupported = computed(() => !!(api && api.childWindow && api.childWindow.open));

/**
 * 独立置顶游戏窗（P2）：跑 /browser，置顶 + 可缩放。
 * 为什么需要：网页游戏/盯盘时主窗口一挡就看不见画面；且截图要求窗口可见，
 * 被遮挡或最小化都会让 capturePage 失败。key 固定，重复点击聚焦已有窗口。
 */
function onOpenGameWindow() {
  try {
    void api.childWindow.open({
      key: 'browser-game',
      // window=game：让这个窗口进入"独立窗"形态（隐藏全局导航），否则会带着
      // 首页/对话/浏览器那排导航，看着就是主窗口换了个皮。
      route: '/browser?window=game&szwin=1',
      width: 1024,
      height: 760,
      // ★ 默认**不置顶**：置顶会让它在切到别的应用时一直挡在前面（用户实报）。
      //   需要时在执行条上点「置顶」自己开。
      alwaysOnTop: false,
    });
  } catch { /* 子窗口不可用时静默降级：主窗口内 /browser 仍可正常使用 */ }
}
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const officeSidebarAvailable = computed(() => (
  activeMode.value === 'office'
  && ['/chat', '/memory', '/scheduled-tasks', '/publish-queue'].includes(route.path)
));

/**
 * 桌面端「本机身份」展示名与首字母。
 *
 * ★ 为什么不显示 guest：guest 是**内部数据归属身份**（后端 seed 全归它），
 *   不是用户身份 —— 把 "guest" 摆在头像上会让用户以为"我被登录成了一个陌生账号"。
 *   桌面端是本机应用，用「本机」表述更贴事实。
 * ★ 真实用户（有心跳保存的登录）走上面的 isLoggedIn 分支，不会落到这里。
 */
const localIdentityTitle = computed(() => '本机');
const localIdentityInitial = computed(() => '本');

/**
 * 触屏判定（无 hover 能力）：「更多」等 hover 菜单在触屏上退化为 click/tap 触发（Task 4.1）。
 * 用 matchMedia('(hover: none)') 而非 'ontouchstart' in window —— 触屏笔记本两者皆真，
 * 只有前者能表达「没有鼠标 hover」这一交互事实，桌面/触屏本不退化。
 * setup 时求值一次即可：设备输入能力不会在会话中途改变。
 */
const isTouchLike = (() => {
  try { return window.matchMedia('(hover: none)').matches; } catch { return false; }
})();

function isActive(p: string) {
  return route.path === p || route.path.startsWith(p + '/');
}

// 插件注入的导航项：moreGroup 声明的进「更多」对应分组，其余进底部独立项（历史行为）
const pluginStore = usePluginStore();
// 远程控制（remote-control 插件）：仅插件**启用**时出「更多」入口 ——
// 未安装/已停用时不渲染菜单项（用户拍板：没有这个插件就不该看到这个菜单）
const rcPluginEnabled = computed(() =>
  pluginStore.plugins.some((p) => p.manifest.id === 'remote-control' && p.state === 'enabled'),
);
const pluginSidebarItems = computed(() =>
  pluginStore.sidebar
    .filter((it) => !it.when || it.when === 'all' || it.when === 'desktop'),
);
const pluginMenus = computed<HoverMenuItem[]>(() =>
  pluginSidebarItems.value
    .filter((it) => !it.moreGroup || it.moreGroup === 'nav')
    .map((it) => ({ path: it.route, label: it.label, icon: resolvePluginIcon(it.icon) as HoverMenuItem['icon'] })),
);

/** 插件声明的「更多」新分组（如 ops → 运维）：非 nav/capability/data/connection 的 moreGroup 值 */
const pluginNewGroups = computed<Array<{ key: string; label: string; items: HoverMenuItem[] }>>(() => {
  const groups: Array<{ key: string; label: string; items: HoverMenuItem[] }> = [];
  for (const it of pluginSidebarItems.value) {
    if (!it.moreGroup || ['nav', 'capability', 'data', 'connection'].includes(it.moreGroup)) continue;
    let g = groups.find((x) => x.key === it.moreGroup);
    if (!g) { g = { key: `group-${it.moreGroup}`, label: it.moreGroupLabel || it.moreGroup, items: [] }; groups.push(g); }
    g.items.push({ key: `plugin-${it.id}`, label: it.label, icon: resolvePluginIcon(it.icon) as HoverMenuItem['icon'], path: it.route, desc: it.desc });
  }
  return groups;
});

/** 插件项并入既有分组（capability/data/connection） */
function mergeIntoGroup(base: HoverMenuItem, groupKey: string): HoverMenuItem {
  const extras = pluginSidebarItems.value.filter((it) => it.moreGroup === groupKey);
  if (!extras.length) return base;
  return {
    ...base,
    children: [
      ...(base.children || []),
      ...extras.map((it) => ({
        key: `plugin-${it.id}`,
        label: it.label,
        icon: resolvePluginIcon(it.icon) as HoverMenuItem['icon'],
        path: it.route,
        desc: it.desc,
      })),
    ],
  };
}

/**
 * 插件桌面窗口入口：清单 `contributes.windows[].menu` 为 true 的窗口在「更多」里出现一项。
 * 点了直接开窗（围栏/面板这类不在应用路由里的界面），所以只做桌面端。
 * ★ 业务零侵入：宿主只认清单声明，不认具体插件 id。
 */
const pluginWindowMenus = computed<HoverMenuItem[]>(() => {
  if (!isElectron) return [];
  const out: HoverMenuItem[] = [];
  for (const p of pluginStore.enabledPlugins) {
    for (const w of p.manifest.contributes?.windows || []) {
      if (!w.menu) continue;
      out.push({
        key: `plugin-window:${p.manifest.id}/${w.id}`,
        label: `${p.manifest.name} · ${w.label}`,
        icon: resolvePluginIcon(w.icon || '') as HoverMenuItem['icon'],
        desc: w.placement === 'desktop' ? '钉在桌面层（最小化本应用可见）' : undefined,
      });
    }
  }
  return out;
});

/** 开插件窗口：失败必须说出来，静默等于「点了没反应」。 */
async function openPluginWindowEntry(composite: string): Promise<void> {
  const [pluginId, windowId] = composite.split('/');
  const plugin = pluginStore.enabledPlugins.find((x) => x.manifest.id === pluginId);
  const w = plugin?.manifest.contributes?.windows?.find((x) => x.id === windowId);
  const api = (window as { electronAPI?: { pluginWindow?: { open: (o: unknown) => Promise<{ ok?: boolean; error?: string }> } } })
    .electronAPI?.pluginWindow;
  if (!w || !api) {
    ElMessage.error('打不开：当前环境没有桌面窗口能力');
    return;
  }
  try {
    const rect = plainRect(w.rect);
    const r = await api.open({
      pluginId,
      entry: w.entry,
      placement: w.placement || 'normal',
      ...(rect ? { rect } : {}),
      ...(w.resizable ? { resizable: true } : {}),
    });
    if (r?.ok === false) ElMessage.error(`打开「${w.label}」失败：${r.error || '未知错误'}`);
  } catch (e) {
    ElMessage.error(`打开「${w.label}」失败：${(e as Error).message}`);
  }
}

// 「更多」下拉：按「能力 / 数据 / 连接」三组 hover 二级展开 + 底部独立项（记忆/插件/设置/插件注入）
// MCP 不再单列：已并入 /tools 工具页「MCP 服务」tab
const moreItems = computed<HoverMenuItem[]>(() => [
  mergeIntoGroup({
    key: 'group-capability',
    label: '能力',
    icon: MagicStick,
    children: [
      { key: 'agents', label: '智能体', icon: User, path: '/agents', desc: '创建与编辑智能体' },
      { key: 'skills', label: 'Skill', icon: Files, path: '/skills', desc: '技能商店与详情' },
      { key: 'distill', label: 'Skill 蒸馏', icon: MagicStick, path: '/distill', desc: '沉淀会话为技能' },
      { key: 'tools', label: '工具', icon: Tools, path: '/tools', desc: '工具库 · MCP · 远程商城' },
    ],
  }, 'capability'),
  mergeIntoGroup({
    key: 'group-data',
    label: '数据',
    icon: DataLine,
    children: [
      { key: 'knowledge', label: '知识库', icon: Collection, path: '/knowledge', desc: '文档与知识条目' },
      { key: 'notes', label: '笔记', icon: Notebook, path: '/notes', desc: '笔记 · 计划 · 收藏' },
      { key: 'data-sources', label: '数据源', icon: DataLine, path: '/data-sources', desc: '数据库连接管理' },
      { key: 'ontologies', label: '本体管理', icon: Share, path: '/ontologies', desc: '数据本体建模' },
      { key: 'sql-console', label: 'SQL 控制台', icon: Operation, path: '/sql-console', desc: '查询与探索' },
    ],
  }, 'data'),
  mergeIntoGroup({
    key: 'group-connection',
    label: '连接',
    icon: Link,
    children: [
      { key: 'models', label: '模型平台', icon: Cpu, path: '/models', desc: '模型服务接入' },
      { key: 'connections', label: 'IM 连接', icon: Link, path: '/connections', desc: '飞书 / 企微 / 微信' },
      { key: 'peers', label: '客户端节点', icon: Platform, path: '/peers', desc: '远程设备节点' },
    ],
  }, 'connection'),
  // 插件声明的新分组（如 ops-shell 的「运维」），排在连接组之后
  ...pluginNewGroups.value.map((g) => ({ key: g.key, label: g.label, icon: Box, children: g.items })),
  // 远程控制入口：remote-control 插件启用才有（控制端页 /remote，给手机/浏览器远控本机；
  // 本机点开也可当控制端去控别的电脑）
  ...(rcPluginEnabled.value
    ? [{ key: 'remote-control', label: '远程控制', icon: Monitor, path: '/remote', desc: '手机 / 浏览器观看并操作本机' }]
    : []),
  { key: 'divider-memory', label: '', divider: true },
  { key: 'live', label: '直播', icon: VideoCamera, path: '/live', desc: '宠物主播预演' },
  { key: 'team', label: '团队工作台', icon: Cpu, path: '/team', desc: '团队资源、额度、节点与远程任务' },
  { key: 'memory', label: '记忆管理', icon: Memo, path: '/memory' },
  { key: 'plugins', label: '插件管理', icon: Box, path: '/plugins' },
  ...pluginWindowMenus.value,
  { key: 'license-manage', label: '授权管理', icon: Key, path: '/license-manage' },
  // 管理后台（RBAC，2026-11-01）：guest 本地单机 = 本机管理员也显示；multi 模式仅 admin 权限可见
  ...(authStore.hasPermission('admin')
    ? [
        {
          key: 'group-admin',
          label: '管理后台',
          icon: Setting,
          children: [
            { key: 'admin-enterprise', label: '企业工作台', icon: Cpu, path: '/admin/enterprise', desc: '团队资源、额度、MCP 与节点' },
            { key: 'admin-users', label: '用户管理', icon: User, path: '/admin/users', desc: '账号与密码重置' },
            { key: 'admin-orgs', label: '组织管理', icon: Collection, path: '/admin/orgs', desc: '部门/团队层级' },
            { key: 'admin-roles', label: '角色权限', icon: Key, path: '/admin/roles', desc: '角色与授权' },
          ],
        },
      ]
    : []),
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

const moreOpen = ref(false)
// 用户头像下拉展开状态：与"更多"弹层一样落在内容区上方，需一并避让 BrowserView
const avatarMenuOpen = ref(false);
const notificationOpen = ref(false);
// 浮层任一展开 → 通知 BrowserPanel 临时隐藏原生 BrowserView（关闭后自动恢复）
watch([moreOpen, avatarMenuOpen, notificationOpen], ([m, a, n]) => {
  titleBarOverlayOpen.value = m || a || n;
});

const chatStore = useChatStore();
const NOTIFICATION_SEEN_KEY = 'yz:topbar:notifications-seen';
const notificationSeenAt = ref(readNotificationSeenAt());
let notificationReadTimer: ReturnType<typeof setTimeout> | null = null;

function readNotificationSeenAt(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(NOTIFICATION_SEEN_KEY)) || 0);
  } catch {
    return 0;
  }
}

type TopNotificationKind = 'input' | 'done' | 'error';
interface TopNotificationItem {
  key: string;
  convId: string;
  kind: TopNotificationKind;
  title: string;
  body: string;
  at: number;
}

const notificationItems = computed<TopNotificationItem[]>(() => {
  const titles = new Map<string, string>();
  for (const conv of chatStore.conversations || []) {
    titles.set(conv.id, conv.title || '未命名任务');
  }
  const items: TopNotificationItem[] = [];
  const questions = (chatStore.questionPendingByConv || {}) as Record<string, { question?: string }>;
  for (const [convId, question] of Object.entries(questions)) {
    if (!question) continue;
    items.push({
      key: `input-${convId}`,
      convId,
      kind: 'input',
      title: '智能体在等你',
      body: String(question.question || titles.get(convId) || '需要你补充信息'),
      at: Date.now(),
    });
  }
  const stats = (chatStore.runStatsByConv || {}) as Record<string, { status?: string; endedAt?: number }>;
  for (const [convId, stat] of Object.entries(stats)) {
    const at = Number(stat.endedAt) || 0;
    if (!at || (stat.status !== 'completed' && stat.status !== 'error')) continue;
    items.push({
      key: `${stat.status}-${convId}-${at}`,
      convId,
      kind: stat.status === 'error' ? 'error' : 'done',
      title: stat.status === 'error' ? '任务执行失败' : '任务已完成',
      body: titles.get(convId) || '任务',
      at,
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, 6);
});

const unreadNotificationCount = computed(
  () => notificationItems.value.filter((item) => item.at > notificationSeenAt.value).length,
);

function markNotificationsRead(): void {
  const newest = notificationItems.value[0]?.at || Date.now();
  notificationSeenAt.value = newest;
  try { localStorage.setItem(NOTIFICATION_SEEN_KEY, String(newest)); } catch { /* 隐私模式 */ }
}

function formatNotificationTime(at: number): string {
  if (!at) return '';
  const diff = Math.max(0, Date.now() - at);
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

async function openNotification(convId: string): Promise<void> {
  notificationOpen.value = false;
  markNotificationsRead();
  if (convId && convId !== chatStore.currentConvId) {
    try { await useChat().selectConv(convId); } catch { /* 会话可能已删除 */ }
  }
  await router.push('/chat');
}

watch(notificationOpen, (open) => {
  if (!open) return;
  if (notificationReadTimer) clearTimeout(notificationReadTimer);
  notificationReadTimer = setTimeout(markNotificationsRead, 900);
});

/**
 * 「更多」点选后短暂屏蔽 hover：trigger=hover 时，点了菜单项 → 路由跳转触发重渲染，
 * 而鼠标此刻仍在浮层区域 → el-popover 立刻又判定「hover 中」把浮层重开
 * （实测：点「记忆管理」跳 /memory 后浮层依旧可见）。屏蔽 300ms 让鼠标有时间移开。
 */
const moreSuppressed = ref(false);
let moreSuppressTimer: ReturnType<typeof setTimeout> | null = null;
function suppressMore() {
  moreSuppressed.value = true;
  moreOpen.value = false;
  if (moreSuppressTimer) clearTimeout(moreSuppressTimer);
  moreSuppressTimer = setTimeout(() => { moreSuppressed.value = false; moreSuppressTimer = null; }, 300);
}

function onMoreSelect(item: HoverMenuItem) {
  suppressMore();
  // 桌面端设置入口改开侧导航弹窗（Task 10.3）；Web 端保留 /settings 页内形式
  if (item.key === 'settings' && isElectron) {
    openSettingsDialog();
    return;
  }
  if (item.key === 'remote-control') {
    // /remote 是全屏裸路由：主窗口内跳转会整个盖住应用且没有返回钮；主进程
    // window.open 同源地址又被 setWindowOpenHandler 拦 —— 桌面端走独立子窗口
    // （key 固定，重复点击聚焦已有窗口）；Web 端同窗口跳转（浏览器可后退）。
    const w = window as unknown as { electronAPI?: { childWindow?: { open?: (o: Record<string, unknown>) => Promise<unknown> } } };
    if (w.electronAPI?.childWindow?.open) {
      void w.electronAPI.childWindow.open({ key: 'remote-control', route: '/remote', width: 1100, height: 760 });
      return;
    }
  }
  const winKey = String(item.key || '');
  if (winKey.startsWith('plugin-window:')) {
    void openPluginWindowEntry(winKey.slice('plugin-window:'.length));
    return;
  }
  if (item.path) router.push(item.path);
}

// 刷新界面：桌面端交主进程做硬刷新（丢弃渲染进程缓存），Web 端退回浏览器重载。
// 用于界面卡住 / 白屏时的一键自救；只重载前端，不重启后端进程。
function onReload() {
  suppressMore();
  try {
    if (typeof api?.reload === 'function') { api.reload(); return; }
  } catch { /* 主进程不可达 → 退回页面重载 */ }
  window.location.reload();
}

// 头像下拉：el-dropdown-item 的 command 会冒泡到 el-dropdown 的 command 事件，
// 此前未挂监听导致「设置 / 记忆管理」点击无反应
/** 管理员视图切换横幅（2026-11-01）：激活时顶栏常驻提示，一键退出回自己的数据 */
const viewAsInfo = computed(() => (authStore.hasPermission('admin') ? getViewAs() : null));
function exitViewAs() {
  setViewAs(null);
  window.location.reload();
}

function onAvatarCommand(cmd: string) {
  // 桌面端设置入口改开侧导航弹窗（Task 10.3）；Web 端保留 /settings 页内形式
  if (cmd === '/settings' && isElectron) {
    openSettingsDialog();
    return;
  }
  // 账号切换（2026-11-01 RBAC）：退出清 token 回登录页；未登录直接去登录页
  if (cmd === '__logout__') {
    authStore.logout();
    router.push('/login');
    return;
  }
  if (cmd) router.push(cmd);
}

// ===== 7.4 快捷入口 =====
// 全局搜索（⌘K 命令面板基础版）：按钮与 ⌘K/Ctrl+K 快捷键都打开 CommandPalette（任务/空间检索）。
const paletteVisible = ref(false);
function onGlobalSearch() {
  paletteVisible.value = true;
}

/**
 * 全局快捷键（2026-11-02）：
 *   ⌘K / Ctrl+K 命令面板（桌面与 Web 都监听；浏览器里 Ctrl+K 默认聚焦地址栏，需 preventDefault）
 *   Ctrl+B 折叠/展开任务侧栏    Ctrl+J 开关右侧上下文栏    Ctrl+N 新建任务
 * ★ B/J/N 在输入框内不拦截：聊天输入框里这三个键有文本编辑语义；
 *   K 没有输入冲突（且输入框内也需要它开面板），故不受此限制。
 */
function onCmdKKeydown(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
  const key = e.key.toLowerCase();
  if (key === 'k') {
    e.preventDefault();
    paletteVisible.value = true;
    return;
  }
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  if (key === 'b') {
    e.preventDefault();
    if (!route.path.startsWith('/chat')) { void router.push('/chat'); return; }
    if (activeMode.value === 'office' && officePanel.value === 'ai') {
      toggleOfficeAiSidebar();
      return;
    }
    const chat = useChat();
    chat.convCollapsed.value = !chat.convCollapsed.value;
    return;
  }
  if (key === 'j') {
    e.preventDefault();
    if (!route.path.startsWith('/chat')) { void router.push('/chat'); return; }
    useChat().toggleContextSidebar();
    return;
  }
  if (key === 'n') {
    e.preventDefault();
    if (!route.path.startsWith('/chat')) void router.push('/chat');
    void useChat().startNewChat();
  }
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

  // ⌘K / Ctrl+K 全局搜索快捷键：桌面 / Web 通用
  window.addEventListener('keydown', onCmdKKeydown);

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
  window.removeEventListener('keydown', onCmdKKeydown);
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  if (moreSuppressTimer) { clearTimeout(moreSuppressTimer); moreSuppressTimer = null; }
  if (notificationReadTimer) { clearTimeout(notificationReadTimer); notificationReadTimer = null; }
});
</script>

<style scoped>
/* 管理员视图切换横幅（2026-11-01） */
.viewas-banner {
  position: absolute; left: 0; right: 0; top: 100%; z-index: 60;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 5px 16px; font-size: 12.5px;
  background: var(--el-color-warning-light-9, #fdf6ec);
  color: var(--el-color-warning-dark-2, #b88230);
  border-bottom: 1px solid var(--el-color-warning-light-7, #f3d19e);
  -webkit-app-region: no-drag;
}
.viewas-banner b { font-weight: 700; }
.viewas-exit {
  border: 1px solid currentColor; border-radius: 999px;
  background: transparent; color: inherit;
  font-size: 11.5px; padding: 1px 10px; cursor: pointer;
}
.viewas-exit:hover { background: currentColor; color: #fff; }

.title-bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 56px;
  width: 100%;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--glass-bg) 96%, white), var(--glass-bg));
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .35), 0 8px 24px rgba(24, 31, 44, .06);
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
  z-index: 50;
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
  height: 100%;
  padding: 0 16px 0 18px;
  border-right: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
}

.brand-logo {
  width: 28px;
  height: 28px;
  display: block;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

/* 横排主导航（桌面端菜单上移标题栏） */
.title-nav {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: 10px;
  min-width: 0;
  max-width: min(58vw, 760px);
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 1;
}
.title-nav::-webkit-scrollbar { display: none; }

@media (max-width: 1180px) {
  .title-nav-item > span { display: none; }
  .title-nav-item { padding: 0 9px; }
  .top-search-button {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
  .top-search-button span,
  .top-search-button kbd { display: none; }
}

@media (max-width: 860px) {
  .brand { padding: 0 8px; }
  .title-nav { margin-left: 4px; }
  .title-nav-item { padding: 0 8px; gap: 4px; }
  .title-spacer { min-width: 4px; }
  .title-quick { margin-right: 2px; }
}

/* 320px 实机宽度：当前页、更多、刷新、登录、主题五项带文字会超出 34px。
   导航项保留图标并写 aria-label，文字只在视觉层收起；登录与主题仍完整可见。 */
@media (max-width: 420px) {
  .brand { padding: 0 6px; }
  .title-nav { margin-left: 2px; gap: 2px; }
  .title-nav-item { padding: 0 7px; }
  .title-nav-item > span { display: none; }
  .title-spacer { min-width: 2px; }
  .title-login-btn { min-width: 40px; padding: 0 9px; }
  .title-theme-btn { width: 40px; flex-shrink: 0; }
}

.title-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 11px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  cursor: pointer;
  pointer-events: auto;
  text-decoration: none;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  transition: background 0.15s ease, color 0.15s ease;
  /* ★ 文字绝不换行：顶栏高度只有 36px，一旦折行「浏览器」会占三行把整条顶栏撑乱
     （实测 390px 宽下就是如此）。flex 子项默认 min-width:auto 会阻止收缩 → 显式 nowrap。 */
  white-space: nowrap;
  flex-shrink: 0;
}

.title-nav-item > span { white-space: nowrap; }

.title-nav-item:hover {
  background: var(--glass-bg-hover);
  color: var(--color-text);
}

.title-nav-item.active {
  background: color-mix(in srgb, var(--color-primary) 14%, var(--glass-bg));
  color: var(--color-primary);
  font-weight: 650;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 22%, transparent);
}
.title-nav-item.disabled { opacity: .42; cursor: not-allowed; }

/* 纯图标导航项（刷新）：收窄左右内边距，与带文字的项视觉对齐 */
.title-nav-item--icon {
  padding: 0 8px;
}

/* 右侧快捷组：搜索图标，位于身份区左侧 */
.title-quick {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
  flex-shrink: 0;
  pointer-events: auto;
}

.top-notification-button { position: relative; }

.top-notification-badge {
  position: absolute;
  top: 3px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border: 2px solid var(--glass-bg, var(--el-bg-color));
  border-radius: 8px;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 8px;
  font-weight: 700;
  line-height: 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.top-notification-panel {
  overflow: hidden;
  border-radius: 9px;
  background: var(--el-bg-color-overlay);
}

.top-notification-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px 9px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.top-notification-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.top-notification-head strong {
  color: var(--el-text-color-primary);
  font-size: 12.5px;
}

.top-notification-head span {
  color: var(--el-text-color-secondary);
  font-size: 10.5px;
}

.top-notification-readall {
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.top-notification-readall:hover { background: var(--el-color-primary-light-9); }

.top-notification-list {
  max-height: min(420px, 60vh);
  overflow: auto;
  padding: 4px;
}

.top-notification-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.top-notification-item:hover { background: var(--el-fill-color-light); }
.top-notification-item.unread {
  background: color-mix(in srgb, var(--el-color-primary-light-9) 74%, transparent);
}

.top-notification-state {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.top-notification-state.done {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.top-notification-state.error {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.top-notification-state.input {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.top-notification-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.top-notification-copy strong {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-notification-copy small {
  overflow: hidden;
  color: var(--el-text-color-regular);
  font-size: 10.5px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-notification-copy time {
  color: var(--el-text-color-placeholder);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

.top-notification-empty {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 18px 14px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.top-search-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: clamp(156px, 14vw, 220px);
  height: 34px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 74%, transparent);
  color: var(--color-text-secondary);
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.top-search-button:hover {
  border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
  color: var(--color-text);
}
.top-search-button span {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-search-button kbd {
  padding: 2px 5px;
  border: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-bg) 72%, transparent);
  font: 10px/1.2 var(--font-mono, Consolas, monospace);
  color: var(--color-text-tertiary);
}

/* 登录头像（绿点=已登录）/ 登录按钮 */
.title-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary);
  font-size: 12px;
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

/* 桌面端「本机」身份头像：中性灰底（不用主题色实底 —— 那是"可点的登录入口"的语义），
   只有 hover 才提亮，表明它是个可点开的菜单而不是状态指示。 */
.title-avatar.is-local {
  background: var(--glass-bg-hover, color-mix(in srgb, var(--color-text) 6%, transparent));
  color: var(--color-text-secondary);
}
.title-avatar.is-local:hover {
  background: var(--glass-bg-active, color-mix(in srgb, var(--color-text) 10%, transparent));
  color: var(--color-text-primary, #0f172a);
}

.title-login-btn {
  height: 30px;
  padding: 0 14px;
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
  width: 42px;
  height: 56px;
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
  height: 56px;
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
/* 「更多」菜单 popper：外观统一由 HoverMenu.vue 的 .yz-menu-popper 基座提供
   （此前这里另写一份 → 与模式下拉漂移；保留 .more-menu-popper 仅作定位/调试锚点） */

</style>

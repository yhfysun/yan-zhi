<template>
  <div class="app-shell" :class="{ 'platform-desktop': isDesktop, 'nav-collapsed': collapsed, 'is-electron': isElectron }">

    <!-- 内容区域 -->
    <div class="app-body">
      <div v-if="!isDesktop" class="bg-orbs">
        <div class="bg-orb orb-1"></div>
        <div class="bg-orb orb-2"></div>
        <div class="bg-orb orb-3"></div>
      </div>

      <template v-if="$route.name === 'login'">
        <main class="main-content full">
          <router-view />
        </main>
      </template>

      <template v-else>
        <SideNav />
        <!-- Mobile TopBar (hidden on chat page - Chat has its own topbar) -->
        <header v-if="isMobile && route.name !== 'chat'" class="mobile-topbar">
          <span class="mobile-topbar-title">{{ pageTitle }}</span>
          <div class="mobile-topbar-actions">
            <el-dropdown v-if="authStore.isLoggedIn" trigger="click">
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
            <router-link v-else to="/login" class="mobile-user-avatar" style="text-decoration:none;font-size:14px">
              <el-icon :size="18"><User /></el-icon>
            </router-link>
          </div>
        </header>
        <main class="main-content" :class="{ 'is-chat': route.name === 'chat' }">
          <router-view v-slot="{ Component }">
            <transition name="slide-fade" mode="out-in"><component :is="Component" /></transition>
          </router-view>
        </main>
      </template>
    </div>

    <el-dialog
      v-if="localModelVisible"
      :model-value="true"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      width="420px"
      class="local-model-download-dialog"
    >
      <div class="local-model-download-body">
        <div class="local-model-download-title">
          {{ localModelState.state === 'error' ? '本地模型下载失败' : '正在准备本地小模型' }}
        </div>
        <div class="local-model-download-desc">
          {{ localModelState.state === 'error'
            ? '安装完成后可以重试下载，期间仍可使用云端模型平台。'
            : '轻量安装包首次运行会自动下载模型，下载完成后即可离线使用基础问答。' }}
        </div>
        <el-progress
          v-if="localModelState.state !== 'error'"
          :percentage="localModelProgress"
          :stroke-width="8"
          :show-text="true"
          :status="localModelState.state === 'done' ? 'success' : undefined"
        />
        <div class="local-model-download-message">{{ localModelState.message }}</div>
      </div>
      <template #footer>
        <template v-if="localModelState.state === 'error'">
          <el-button @click="dismissLocalModel">稍后使用云端模型</el-button>
          <el-button type="primary" @click="retryLocalModel">重试下载</el-button>
        </template>
        <el-button v-else disabled>正在下载</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { User, SwitchButton } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from './stores/auth';
import SideNav from './components/SideNav.vue';

import { useIsMobile } from './composables/useIsMobile';
import { usePlatform } from './composables/usePlatform';
import { useSidebarState } from './composables/useSidebarState';

const route = useRoute();
const authStore = useAuthStore();
const isMobile = useIsMobile();
const { isDesktop } = usePlatform();
const { collapsed } = useSidebarState();

// Electron 桌面端检测：由主进程通过 preload 注入 window.electronAPI.isElectron
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;

const localModelState = ref({
  state: 'idle',
  receivedBytes: 0,
  totalBytes: 0,
  progress: 0,
  message: '',
});
const localModelVisible = computed(() => {
  return isElectron && (localModelState.value.state === 'downloading' || localModelState.value.state === 'error');
});
const localModelProgress = computed(() => Math.max(0, Math.min(100, Math.round(localModelState.value.progress * 100))));
let offLocalModelState: (() => void) | undefined;

onMounted(async () => {
  const api = (window as any).electronAPI?.localModel;
  if (!api) return;
  offLocalModelState = api.onState((state: any) => {
    if (state) localModelState.value = state;
  });
  const initial = await api.getState();
  if (initial) localModelState.value = initial;
});

onUnmounted(() => {
  offLocalModelState?.();
});

async function retryLocalModel() {
  const api = (window as any).electronAPI?.localModel;
  if (!api) return;
  try {
    await api.start();
  } catch (error: any) {
    ElMessage.warning(error?.message || '启动模型下载失败');
  }
}

function dismissLocalModel() {
  localModelState.value = { state: 'idle', receivedBytes: 0, totalBytes: 0, progress: 0, message: '已跳过本次下载' };
}

const ROUTE_TITLES: Record<string, string> = {
  home: '首页',
  chat: '对话',
  peers: '客户端节点',
  connections: 'IM 连接',
  knowledge: '知识库',
  browser: '浏览器',
  models: '模型平台',
  tools: '工具管理',
  skills: 'Skill 商店',
  distill: 'Skill 蒸馏',
  agents: '智能体',
  mcp: 'MCP 服务',
  settings: '设置',
  login: '登录',
};

const pageTitle = computed(() => {
  const name = typeof route.name === 'string' ? route.name : '';
  return ROUTE_TITLES[name] || 'AI 助手';
});

authStore.loadUser();
</script>

<style>
:root {
  --glass-bg: rgba(255, 255, 255, 0.72);
  --glass-bg-hover: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(15, 23, 42, 0.08);
  --glass-border-strong: rgba(15, 23, 42, 0.12);
  --glass-blur: 16px;
  --glass-saturate: 180%;
  --glass-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  --color-primary: #7C3AED;
  --color-primary-light: #EDE9FE;
  --color-primary-dark: #5B21B6;
  --color-accent: #EC4899;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  /* Element Plus theme — keep aligned with brand purple so el-input/textarea/select focus rings match */
  --el-color-primary: #7C3AED;
  --el-color-primary-light-3: #A78BFA;
  --el-color-primary-light-5: #C4B5FD;
  --el-color-primary-light-7: #DDD6FE;
  --el-color-primary-light-8: #EDE9FE;
  --el-color-primary-light-9: #F5F3FF;
  --el-color-primary-dark-2: #5B21B6;
  --color-bg: #f8fafc;
  --color-text: #1e293b;
  --color-text-secondary: #64748b;
  --gradient-primary: linear-gradient(135deg, #7C3AED, #EC4899);
  --orb-1-color: #7C3AED;
  --orb-2-color: #A78BFA;
  --orb-3-color: #EC4899;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --scrollbar-size: 8px;
  --scrollbar-thumb: rgba(15, 23, 42, 0.18);
  --scrollbar-thumb-hover: rgba(15, 23, 42, 0.32);
  --scrollbar-thumb-active: rgba(15, 23, 42, 0.45);

  /* Responsive breakpoints (min-width values, unitless for calc) */
  --bp-xs: 0;
  --bp-sm: 576;
  --bp-md: 768;
  --bp-lg: 992;
  --bp-xl: 1200;
  --is-mobile: 0;
}

/* Toggle --is-mobile on xs/sm breakpoints (max-width 767px) */
@media (max-width: 767px) {
  :root {
    --is-mobile: 1;
  }
}

[data-theme="dark"] {
  --glass-bg: rgba(24, 26, 36, 0.78);
  --glass-bg-hover: rgba(36, 38, 50, 0.88);
  --glass-border: rgba(255, 255, 255, 0.07);
  --glass-border-strong: rgba(255, 255, 255, 0.11);
  --color-bg: #0f1117;
  --color-text: #e2e8f0;
  --color-text-secondary: #94a3b8;
  --scrollbar-thumb: rgba(255, 255, 255, 0.2);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.36);
  --scrollbar-thumb-active: rgba(255, 255, 255, 0.5);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: clamp(14px, 1vw + 8px, 16px);
  color: var(--color-text);
  background: var(--color-bg);
  overflow: hidden;
}

* {
  transition: background-color 0.4s ease, border-color 0.4s ease, color 0.3s ease;
}

.app-shell { display: flex; flex-direction: column; height: 100%; position: relative; overflow: hidden; }
.app-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* ===== 桌面端专属布局：CSS 变量驱动侧栏宽度联动、固定字号、实色背景、紧凑密度 ===== */
/* web/mobile 因 html,body,#app{height:100%} 仍正确铺满；高度从 100vh/dvh 改为 100% 以兼容桌面端被 flex 父容器包裹 */
.platform-desktop.app-shell {
  --sidebar-w: 220px;            /* 桌面端侧栏展开宽度，由 SideNav 实际宽度对齐 */
  font-size: 14px;                /* 覆盖 body 的 clamp 流体字号，桌面端固定 */
  background: var(--color-bg);    /* 实色背景，确保无玻璃透出 */
}
.platform-desktop.app-shell.nav-collapsed {
  --sidebar-w: 56px;              /* 侧栏折叠时缩窄到图标 dock 宽度 */
}
.platform-desktop .main-content {
  margin-left: var(--sidebar-w);  /* 跟随侧栏折叠状态联动 */
  padding-right: 0;
}
.platform-desktop .page { padding: 20px 24px; }
.platform-desktop .page-title { font-size: 18px; }
.platform-desktop .card-grid {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.platform-desktop .card-grid-sm {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.bg-orbs { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.bg-orb {
  position: absolute; border-radius: 50%; filter: blur(60px);
  opacity: 0.35; animation: float 20s ease-in-out infinite;
}
[data-theme="dark"] .bg-orb { opacity: 0.15; }

.orb-1 { width: 400px; height: 400px; background: var(--orb-1-color); top: -100px; left: -100px; }
.orb-2 { width: 350px; height: 350px; background: var(--orb-2-color); bottom: -80px; right: -80px; animation-delay: -7s; }
.orb-3 { width: 300px; height: 300px; background: var(--orb-3-color); top: 40%; left: 50%; animation-delay: -14s; }

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -30px) scale(1.05); }
  66% { transform: translate(-20px, 20px) scale(0.95); }
}

@media (prefers-reduced-motion: reduce) { .bg-orb { animation: none !important; } }

.main-content { flex: 1; overflow: hidden; position: relative; z-index: 1; margin-left: 52px; padding-right: 52px; display: flex; flex-direction: column; min-height: 0; }
.main-content.full { overflow: visible; margin-left: 0; }
/* 可滚动页面：.page 自管滚动 */
.page { padding: 28px 36px; flex: 1; overflow-y: auto; }

/* Mobile TopBar */
.mobile-topbar {
  display: none;
}

@media (max-width: 767px) {
  .mobile-topbar {
    display: flex;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 48px;
    padding: 0 16px;
    padding-top: env(safe-area-inset-top, 0px);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-filter);
    -webkit-backdrop-filter: var(--glass-filter);
    border-bottom: 1px solid var(--glass-border);
    z-index: 50;
    align-items: center;
    justify-content: space-between;
  }

  .mobile-topbar-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
    flex: 1;
  }

  .mobile-topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(236, 72, 153, 0.15));
    color: var(--color-primary);
    cursor: pointer;
    user-select: none;
  }
}

.slide-fade-enter-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-fade-leave-active { transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-fade-enter-from { opacity: 0; transform: translateY(6px); }
.slide-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* Global Element Plus overrides */
.el-button { font-weight: 500; letter-spacing: 0.01em; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
.el-button:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.el-button:active { transform: translateY(0); }
.el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger) {
  background: rgba(15,23,42,0.04); border-color: transparent;
}
.el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger):hover {
  background: rgba(15,23,42,0.08); border-color: rgba(15,23,42,0.1);
}
[data-theme="dark"] .el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger) {
  background: rgba(255,255,255,0.06);
}
[data-theme="dark"] .el-button:not(.el-button--text):not(.el-button--primary):not(.el-button--success):not(.el-button--warning):not(.el-button--danger):hover {
  background: rgba(255,255,255,0.1);
}

/* Modernize el-button loading spinner: brand-color stroke + dash animation + rounded caps */
.el-button .el-loading-spinner {
  width: 18px; height: 18px;
}
.el-button .el-loading-spinner .circular {
  stroke: currentColor;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 90 150;
  stroke-dashoffset: 0;
  animation: btn-rotate 1s linear infinite, btn-dash 1.4s ease-in-out infinite;
}
@keyframes btn-rotate { to { transform: rotate(360deg); } }
@keyframes btn-dash {
  0%   { stroke-dasharray: 1 150; stroke-dashoffset: 0; }
  50%  { stroke-dasharray: 90 150; stroke-dashoffset: -35; }
  100% { stroke-dasharray: 90 150; stroke-dashoffset: -124; }
}
/* dim the inner mask slightly so the spinner pops */
.el-button.is-loading::before { background-color: var(--el-mask-color); opacity: 0.4; }

.el-button:focus-visible, .el-input__wrapper:focus-within, .el-select .el-input__wrapper:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Cards */
.glass-card {
  background: var(--glass-bg); backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.glass-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

/* Scrollbar — 统一细圆角样式：透明轨道、轻量滑块，hover/active 逐步加深 */
/* Firefox 单独处理：Chromium 一旦设置 scrollbar-width/color 会改用原生滚动条，导致圆角失效 */
@supports (-moz-appearance:none) {
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }
}
::-webkit-scrollbar { width: var(--scrollbar-size); height: var(--scrollbar-size); }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border: none !important;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
::-webkit-scrollbar-thumb:active { background: var(--scrollbar-thumb-active); }
::-webkit-scrollbar-corner { background: transparent; }

/* Skeleton shimmer */
.skeleton-shimmer {
  background: linear-gradient(90deg,
    var(--glass-border) 25%,
    var(--glass-bg-hover) 50%,
    var(--glass-border) 75%
  ) !important;
  background-size: 200% 100% !important;
  animation: shimmer 1.5s infinite !important;
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ===== Global page layout classes ===== */

.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; gap: 16px;
}
.page-title { font-size: 22px; font-weight: 700; }
.page-sub { font-size: 13px; color: var(--color-text-secondary); }

/* Card grids — pages use class="card-grid" / class="card-grid-sm" in template */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}
.card-grid-sm {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

/* ===== Mobile: skeleton + global overrides ===== */
@media (max-width: 767px) {
  .app-shell { flex-direction: column; }
  .main-content {
    margin-left: 0 !important;
    padding: 0 !important;
    /* keep content clear of the fixed top bar (48px) and bottom tab bar (56px) */
    padding-top: calc(48px + env(safe-area-inset-top, 0px)) !important;
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px)) !important;
  }
  /* chat page manages its own safe-area + input spacing */
  .main-content.is-chat {
    padding-top: env(safe-area-inset-top, 0px) !important;
    padding-bottom: 0 !important;
  }
  /* login is full-screen with no chrome */
  .main-content.full {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
  html, body, #app, .app-shell, .main-content { max-width: 100vw; overflow-x: hidden; }

  /* Global layout classes — compact */
  .page { padding: 14px !important; }
  .page-header { flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 14px; }
  .page-title { font-size: 18px; }
  .card-grid, .card-grid-sm { grid-template-columns: 1fr; gap: 12px; }

  /* Dialogs: compact (keep Element Plus centering: el-overlay-dialog is fixed+flex,
     el-dialog must stay absolute so the parent's justify/align-center works) */
  .el-overlay { z-index: 9999 !important; overflow-y: auto !important; padding: 0 !important; }
  .el-overlay-dialog { display: flex !important; justify-content: center !important; align-items: center !important; padding-top: calc(48px + env(safe-area-inset-top, 0px)) !important; padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px)) !important; }
  .el-dialog {
    z-index: 9999 !important;
    position: absolute !important;
    max-width: calc(100vw - 24px) !important;
    margin: 0 !important;
    max-height: calc(100dvh - 48px - env(safe-area-inset-top, 0px) - 56px - env(safe-area-inset-bottom, 0px) - 8px);
    display: flex !important; flex-direction: column !important;
    background: var(--el-bg-color) !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
  }
  .mount-dialog .el-dialog,
  .skill-mount-dialog .el-dialog,
  .snapshot-dialog .el-dialog,
  .agent-edit-dialog .el-dialog {
    width: 92vw !important;
    max-width: 92vw !important;
  }
  .el-dialog__header { background: var(--el-bg-color) !important; border-bottom: 1px solid var(--el-border-color-lighter); }
  .el-dialog__body { flex: 1; overflow-y: auto; padding: 12px 16px; background: var(--el-bg-color) !important; }
  .el-dialog__footer { display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: flex-end; gap: 8px; flex-shrink: 0; padding: 10px 16px 14px; background: var(--el-bg-color) !important; }
  .el-dialog__footer .el-button { flex-shrink: 0; white-space: nowrap; }

  /* Prevent overflow */
  .el-card, .el-form, .el-table { max-width: 100%; overflow-x: auto; }

  /* Forms */
  .el-form-item:not(.el-form-item--small) { flex-direction: column; align-items: flex-start; margin-bottom: 14px; }
  .el-form-item:not(.el-form-item--small) .el-form-item__label { width: 100% !important; text-align: left !important; padding-bottom: 4px; line-height: 1.4; font-size: 13px; }
  .el-form-item:not(.el-form-item--small) .el-form-item__content { width: 100% !important; margin-left: 0 !important; }
  .el-form-item .el-input-number, .el-form-item .el-select { width: 100% !important; }

  /* Toast */
  .el-message { top: 8px !important; left: 50% !important; transform: translateX(-50%) !important; min-width: auto !important; max-width: 90vw !important; }
  .el-select-dropdown { max-height: 50vh !important; }

  /* Finger-friendly controls on touch screens */
  .el-input__wrapper,
  .el-select__wrapper { min-height: 40px; }
  .el-button:not(.el-button--small):not(.el-button--text) { min-height: 40px; }
  .el-radio, .el-checkbox { min-height: 28px; }

  /* Hide decorative orbs on mobile — they bleed through translucent surfaces and look messy */
  .bg-orbs { display: none; }

  /* Solid page background so no orb/glass shows through */
  .page { background: var(--color-bg); }

  /* Solid glass-tabs on mobile (used by Settings) */
  .glass-tabs { background: var(--el-bg-color) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; border: 1px solid var(--el-border-color-lighter); }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .dock-btn { background: rgba(255, 255, 255, 0.95); }
}

/* ===== add-card global ===== */
.add-card, .marketplace-card.add-card {
  border: 1.5px dashed var(--glass-border);
  background: rgba(255,255,255,0.25);
  cursor: pointer; transition: all 0.2s;
}
.add-card:hover, .marketplace-card.add-card:hover {
  border-color: var(--color-primary);
  background: rgba(99,102,241,0.05);
}
.add-card-content {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; padding: 16px 0;
  color: var(--color-text-secondary);
}
.add-card-text { font-size: 14px; }

/* Action buttons: normal text buttons on desktop, mobile turns them into a 48px FAB */
.fab-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
@media (max-width: 767px) {
  .fab-add {
    position: fixed;
    right: 16px;
    bottom: calc(56px + 12px + env(safe-area-inset-bottom, 0px));
    z-index: 80;
    width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 50%;
    font-size: 0;
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.45);
  }
  .fab-add .el-icon {
    font-size: 18px;
    margin: 0;
  }
}

/* ===== Electron 桌面端：VS Code 风格 ===== */
/* 标题栏 32px 高，SideNav 通过 --titlebar-h 变量从标题栏下方开始 */
.is-electron.app-shell {
  --titlebar-h: 32px;
}
/* VS Code 风格：紧凑间距、桌面字体、原生滚动条 */
.is-electron .app-body {
  flex: 1; display: flex; overflow: hidden;
  font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif;
  font-size: 13px; /* 桌面端固定 13px，不用 clamp 流体字号 */
}

/* 紧凑间距：减小 padding/margin */
.is-electron .page { padding: 16px 20px; }
.is-electron .main-content { padding-right: 0; }
.is-electron .page-header { margin-bottom: 16px; }
.is-electron .page-title { font-size: 16px; }
.is-electron .card-grid { gap: 12px; }
.is-electron .card-grid-sm { gap: 8px; }

/* 暗色主题背景（VS Code Catppuccin Mocha 风格） */
.is-electron [data-theme="dark"] .app-shell {
  background: #1e1e2e;
}
.is-electron [data-theme="dark"] .app-body {
  background: #1e1e2e;
}
.is-electron [data-theme="dark"] .main-content {
  background: #1e1e2e;
}

/* 浅色主题背景（VS Code 浅色风格） */
.is-electron :root:not([data-theme="dark"]) .app-shell {
  background: #f3f3f3;
}
.is-electron :root:not([data-theme="dark"]) .app-body {
  background: #f3f3f3;
}

.local-model-download-dialog .el-dialog__body { padding: 18px 20px; }
.local-model-download-body { display: flex; flex-direction: column; gap: 10px; }
.local-model-download-title { font-size: 16px; font-weight: 650; color: var(--color-text); }
.local-model-download-desc { font-size: 13px; line-height: 1.55; color: var(--color-text-secondary); }
.local-model-download-message { min-height: 20px; font-size: 12px; color: var(--color-text-secondary); word-break: break-all; }
</style>

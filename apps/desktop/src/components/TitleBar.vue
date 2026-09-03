<template>
  <div class="title-bar">
    <!-- 拖拽背景层：铺满整条标题栏，按钮等交互元素作为兄弟叠在其上方 -->
    <div class="drag-region"></div>

    <!-- 内容层：pointer-events:none 使非按钮区域点击穿透到拖拽层 -->
    <div class="title-content">
      <!-- 左侧：品牌 logo（朱砂对话气泡 + 思考点，言智 = AI 对话） -->
      <div class="brand">
        <svg class="brand-logo" viewBox="0 0 24 24" role="img" aria-label="言智">
          <path d="M12 2.5C6.8 2.5 2.5 6.3 2.5 11c0 2.8 1.5 5.3 3.8 6.9L5.2 21l4.6-2.2c.7.1 1.4.2 2.2.2 5.2 0 9.5-3.8 9.5-8.5S17.2 2.5 12 2.5z" fill="var(--color-primary)" />
          <circle cx="8.2" cy="11" r="1.5" fill="#fff" />
          <circle cx="12" cy="11" r="1.5" fill="#fff" />
          <circle cx="15.8" cy="11" r="1.5" fill="#fff" />
        </svg>
      </div>

      <!-- 中部：可拖拽留白（flex:1） -->
      <div class="title-spacer"></div>

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
import { ref, onMounted, onUnmounted } from 'vue';
import { Minus, FullScreen, CopyDocument, Close, Moon, Sunny } from '@element-plus/icons-vue';
import { useSettingsStore } from '@yan-zhi/ui';

// Electron 渲染进程通过 contextBridge 注入的 API
const api = (window as any).electronAPI;
const settingsStore = useSettingsStore();

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
  padding: 0 14px;
}

.brand-logo {
  width: 22px;
  height: 22px;
  display: block;
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

<template>
  <div class="title-bar">
    <!-- 左侧：应用图标 + 名称 -->
    <div class="title-bar-left">
      <img class="title-bar-icon" src="../assets/titlebar-logo.png" alt="言智" draggable="false" />
    </div>
    <!-- 中间：可拖拽区域（空白） -->
    <div class="title-bar-drag"></div>
    <!-- 右侧：窗口控制按钮 -->
    <div class="title-bar-controls">
      <button class="title-btn" @click="minimize" title="最小化" aria-label="最小化">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button class="title-btn" @click="toggleMaximize" :title="maximized ? '向下还原' : '最大化'" :aria-label="maximized ? '向下还原' : '最大化'">
        <svg v-if="!maximized" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="1" y="3" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1" />
          <path d="M3 1h8v8" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
      <button class="title-btn title-btn-close" @click="close" title="关闭" aria-label="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

const maximized = ref(false);
const electronAPI = (window as any).electronAPI;

function minimize() {
  electronAPI?.minimize?.();
}
function toggleMaximize() {
  electronAPI?.maximize?.();
}
function close() {
  electronAPI?.close?.();
}

async function syncMaximized() {
  if (typeof electronAPI?.isMaximized === 'function') {
    try {
      maximized.value = await electronAPI.isMaximized();
    } catch {
      /* ignore */
    }
  }
}

let onResize: (() => void) | null = null;

onMounted(() => {
  syncMaximized();
  // 监听窗口大小变化，重新检测最大化状态
  onResize = () => syncMaximized();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  if (onResize) window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  height: 32px;
  background: var(--glass-bg);
  color: var(--color-text-secondary);
  -webkit-app-region: drag; /* 整个标题栏可拖拽 */
  app-region: drag;
  user-select: none;
  flex-shrink: 0;
  border-bottom: 1px solid var(--glass-border);
  position: relative;
  z-index: 200;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  flex-shrink: 0;
}

.title-bar-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

.title-bar-drag {
  flex: 1;
  height: 100%;
}

.title-bar-controls {
  display: flex;
  -webkit-app-region: no-drag; /* 按钮区域不可拖拽 */
  app-region: no-drag;
}

.title-btn {
  width: 46px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
  padding: 0;
}

.title-btn:hover {
  background: var(--glass-bg-hover);
}

.title-btn:focus-visible {
  outline: 1px solid var(--color-primary, #C2410C);
  outline-offset: -2px;
}

.title-btn-close:hover {
  background: #e81123;
  color: #fff;
}
</style>
<template>
  <div class="title-bar">
    <!-- 拖拽背景层：铺满整条标题栏，按钮等交互元素作为兄弟叠在其上方 -->
    <div class="drag-region" data-tauri-drag-region></div>

    <!-- 内容层：pointer-events:none 使非按钮区域点击穿透到拖拽层 -->
    <div class="title-content">
      <!-- 左侧：品牌标识 -->
      <div class="brand">
        <span class="brand-logo">言</span>
        <span class="brand-name">言智</span>
      </div>

      <!-- 中部：可拖拽留白（flex:1） -->
      <div class="title-spacer"></div>

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
import { Minus, FullScreen, CopyDocument, Close } from '@element-plus/icons-vue';
import { getCurrentWindow } from '@tauri-apps/api/window';

// 当前 Tauri 窗口实例；非 Tauri 环境（如浏览器预览）下 getCurrentWindow 会抛错，置 null 使按钮降级为无操作
let win: ReturnType<typeof getCurrentWindow> | null = null;
try {
  win = getCurrentWindow();
} catch {
  win = null;
}

// 是否处于最大化状态
const isMaximized = ref(false);

// onResized 监听器取消函数
let unlisten: (() => void) | null = null;

// 最小化
async function onMinimize() {
  try { await win?.minimize(); } catch {}
}

// 最大化 / 还原切换
async function onToggleMaximize() {
  try { await win?.toggleMaximize(); } catch {}
}

// 关闭窗口
async function onClose() {
  try { await win?.close(); } catch {}
}

onMounted(async () => {
  if (!win) return;
  try {
    // 初始化最大化状态
    isMaximized.value = await win.isMaximized();
    // 监听窗口尺寸变化，同步最大化状态（onResized 返回 unlisten 函数）
    unlisten = await win.onResized(async () => {
      try { isMaximized.value = await win!.isMaximized(); } catch {}
    });
  } catch {}
});

onUnmounted(() => {
  if (unlisten) {
    try { unlisten(); } catch {}
    unlisten = null;
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
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
}

[data-theme="dark"] .title-bar {
  background: #1b1d23;
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

/* 拖拽背景层：绝对定位铺满整条标题栏，置于最底层 */
.drag-region {
  position: absolute;
  inset: 0;
  z-index: 0;
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
  padding: 0 12px;
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, #7C3AED, #EC4899);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.brand-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  letter-spacing: 0.02em;
}

[data-theme="dark"] .brand-name {
  color: #e2e8f0;
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

.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 36px;
  border: none;
  outline: none;
  background: transparent;
  color: #1e293b;
  cursor: pointer;
  pointer-events: auto;
  transition: background-color 0.12s ease, color 0.12s ease;
}

[data-theme="dark"] .win-btn {
  color: #e2e8f0;
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

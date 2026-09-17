<!--
  ChildWindowFrame.vue — 独立窗口 / 应用内页面的统一外壳
  ------------------------------------------------------------
  两种运行形态（自动判定，无需调用方传参）：
    · 'child' —— 真·独立子窗口（桌面端 szwin=1）：渲染窗口控制（最小化/最大化/还原/关闭），
                 提供 -webkit-app-region 拖拽区，由系统负责拖边缩放与边缘吸附。
    · 'main'  —— 在主窗口内访问同一条路由（或 Web/移动端）：**不渲染窗口控制**
                 （浏览器窗口不归页面管、主窗口也不该被页面关掉），改为提供「返回」按钮，
                 否则 bare 路由隐藏了应用顶栏后用户将无路可退。
-->
<template>
  <div class="cwf" :class="`is-${mode}`">
    <!-- 拖拽背景层：仅真子窗口；按钮作为兄弟叠在其上方 -->
    <div v-if="mode === 'child'" class="cwf-drag"></div>

    <header class="cwf-bar">
      <div class="cwf-left">
        <span v-if="icon" class="cwf-icon"><el-icon :size="13"><component :is="icon" /></el-icon></span>
        <span class="cwf-title" :title="title">{{ title }}</span>
        <span v-if="subtitle" class="cwf-sub" :title="subtitle">{{ subtitle }}</span>
      </div>

      <span class="cwf-spacer"></span>

      <!-- 业务动作（如「复制」），由调用方通过插槽提供 -->
      <div class="cwf-actions">
        <slot name="actions" />
      </div>

      <!-- 真子窗口：窗口级控制 -->
      <div v-if="mode === 'child'" class="cwf-win">
        <button class="cwf-win-btn" type="button" title="最小化" @click="onMinimize">
          <el-icon :size="15"><Minus /></el-icon>
        </button>
        <button
          class="cwf-win-btn"
          type="button"
          :title="maximized ? '还原' : '最大化'"
          @click="onMaximize"
        >
          <el-icon :size="13">
            <CopyDocument v-if="maximized" />
            <FullScreen v-else />
          </el-icon>
        </button>
        <button class="cwf-win-btn cwf-win-btn--close" type="button" title="关闭窗口" @click="onClose">
          <el-icon :size="15"><Close /></el-icon>
        </button>
      </div>

      <!-- 应用内形态：只给返回，不做窗口操作（避免"关了主窗口"或假按钮） -->
      <div v-else class="cwf-win">
        <button class="cwf-win-btn" type="button" title="返回" @click="emit('close')">
          <el-icon :size="15"><Back /></el-icon>
        </button>
      </div>
    </header>

    <div class="cwf-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import type { Component } from 'vue';
import { Minus, FullScreen, CopyDocument, Close, Back } from '@element-plus/icons-vue';
import {
  supportsChildWindow, isChildWindowContext, minimizeSelf, toggleSelfMaximize,
  selfMaximized, bindSelfWindowState, closeSelfWindow,
} from '../../utils/childWindow';

defineProps<{
  title: string;
  subtitle?: string;
  icon?: Component | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

/**
 * 形态判定：只有「桌面端 + 确认跑在独立子窗口里（szwin=1）」才是 child。
 * 不能用 supportsChildWindow 单独判断 —— 主窗口同样支持该能力，
 * 那样会在主窗口里渲染出窗口控制按钮，一点关闭就把主窗口关掉（隐藏到托盘）。
 */
const mode = computed<'child' | 'main'>(() =>
  supportsChildWindow && isChildWindowContext() ? 'child' : 'main',
);

// 窗口状态同步：尺寸变化 → 刷新最大化图标（拖边缩放/双击标题栏都会改）
const unbind = bindSelfWindowState();
onBeforeUnmount(() => unbind());

const maximized = computed(() => selfMaximized.value);

function onMinimize(): void { minimizeSelf(); }
function onMaximize(): void { toggleSelfMaximize(); }
async function onClose(): Promise<void> {
  const closed = await closeSelfWindow();
  if (!closed) emit('close');
}

defineExpose({ mode, maximized });
</script>

<style scoped>
.cwf {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--el-bg-color, #fff);
  color: var(--el-text-color-primary, #1e293b);
  overflow: hidden;
}

/* 整窗外圈的圆角由系统 DWM 提供（frame:false + 非 transparent），这里不设圆角 */

/* ===== 标题栏 ===== */
.cwf-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  flex-shrink: 0;
  padding: 0 0 0 12px;
  background: var(--glass-bg, #fafaf9);
  border-bottom: 1px solid var(--glass-border, rgba(15, 23, 42, 0.08));
  z-index: 2;
}

/* 拖拽层：仅真子窗口渲染。放在内容之下，靠 z-index 分层 */
.cwf-drag {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 38px;
  z-index: 1;
  -webkit-app-region: drag;
  app-region: drag;
}

.cwf-left {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 1 auto;
  pointer-events: none;
}
.cwf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  flex-shrink: 0;
  border-radius: 6px;
  color: var(--color-primary, #4f46e5);
  background: color-mix(in srgb, var(--color-primary, #4f46e5) 12%, transparent);
}
.cwf-title {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: "JetBrains Mono", "Consolas", monospace;
}
.cwf-sub {
  font-size: 11.5px;
  color: var(--el-text-color-secondary, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40vw;
}
.cwf-spacer { flex: 1; }

.cwf-actions {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

/* ===== 窗口控制 ===== */
.cwf-win {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.cwf-win-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px; height: 38px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary, #64748b);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.cwf-win-btn:hover { background: rgba(0, 0, 0, 0.06); color: var(--el-text-color-primary, #1e293b); }
.cwf-win-btn:active { background: rgba(0, 0, 0, 0.1); }
.cwf-win-btn--close:hover { background: #e81123; color: #fff; }
[data-theme="dark"] .cwf-win-btn:hover { background: rgba(255, 255, 255, 0.08); }
[data-theme="dark"] .cwf-win-btn--close:hover { background: #e81123; color: #fff; }

/* ===== 内容 ===== */
.cwf-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
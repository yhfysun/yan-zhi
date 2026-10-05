<template>
  <!-- 底部动作面板（spec「移动端弹窗规范」第一档）：操作菜单在移动端统一用本组件，
       替代桌面右键样式的 ctx-menu。抓取条 + 遮罩点击/「关闭」按钮关闭；
       下滑手势简化为「遮罩 + 关闭按钮」两途（触屏 webview 内手势冲突多，轻量实现）。 -->
  <Teleport to="body">
    <transition name="as-fade">
      <div v-if="visible" class="as-mask" @click="emit('close')">
        <div class="as-sheet" role="menu" aria-label="操作面板" @click.stop>
          <div class="as-grabber" aria-hidden="true"></div>
          <div v-if="title" class="as-title">{{ title }}</div>
          <button
            v-for="a in actions"
            :key="a.key"
            type="button"
            class="as-item"
            :class="{ 'is-danger': a.danger, 'is-disabled': a.disabled }"
            :disabled="a.disabled"
            role="menuitem"
            @click="pick(a)"
          >
            <el-icon v-if="a.icon" :size="16"><component :is="a.icon" /></el-icon>
            <span>{{ a.label }}</span>
          </button>
          <button type="button" class="as-item as-cancel" @click="emit('close')">关闭</button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script lang="ts">
import type { Component } from 'vue';

/** 动作项：key 稳定标识（含「move:<spaceId>」这类带参 key）；danger 渲染警示色 */
export interface ActionSheetAction {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  icon?: Component;
}
</script>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  title?: string;
  actions: ActionSheetAction[];
}>();

const emit = defineEmits<{
  (e: 'select', action: ActionSheetAction): void;
  (e: 'close'): void;
}>();

function pick(a: ActionSheetAction) {
  if (a.disabled) return;
  emit('select', a);
}
</script>

<style scoped>
.as-mask {
  position: fixed;
  inset: 0;
  /* 高于全局 dialog 的 9999（App.vue 767px 分支强制值），保证面板压住一切弹层 */
  z-index: 10000;
  background: var(--el-mask-color, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.as-sheet {
  width: 100%;
  max-height: 72vh;
  overflow-y: auto;
  background: var(--el-bg-color, #fff);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: var(--shadow-3);
  padding: 8px 8px calc(10px + env(safe-area-inset-bottom, 0px));
}

/* 抓取条 */
.as-grabber {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: var(--color-border-strong);
  margin: 4px auto 8px;
}

.as-title {
  padding: 2px 12px 8px;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  /* 触控目标 ≥44px：48px 面板项 */
  min-height: 48px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  font-size: 15px;
  font-family: inherit;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-standard);
}
.as-item:active {
  background: var(--color-surface-hover);
}
.as-item.is-danger {
  color: var(--color-danger);
}
.as-item.is-disabled {
  color: var(--color-text-tertiary);
  opacity: 0.5;
  cursor: not-allowed;
}
.as-item.is-disabled:active {
  background: transparent;
}

.as-cancel {
  margin-top: 6px;
  border-top: 1px solid var(--color-border);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--font-size-md);
}

.as-fade-enter-active {
  transition: opacity var(--motion-base) var(--ease-standard);
}
.as-fade-leave-active {
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.as-fade-enter-from,
.as-fade-leave-to {
  opacity: 0;
}
.as-fade-enter-active .as-sheet {
  transition: transform var(--motion-slow) var(--ease-entrance);
}
.as-fade-leave-active .as-sheet {
  transition: transform var(--motion-base) var(--ease-standard);
}
.as-fade-enter-from .as-sheet,
.as-fade-leave-to .as-sheet {
  transform: translateY(100%);
}
</style>

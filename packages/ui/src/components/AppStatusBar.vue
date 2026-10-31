<!--
  AppStatusBar.vue — 应用底部状态栏（2026-10-31）
  桌面应用的标志性元素：模式 / 工作区 / 模型 / 运行状态常驻可见，
  不用回头找入口就知道"我现在在哪、在跑什么"。
  web 与 desktop 共用；移动端不渲染（TabBar 已占底部）。
-->
<template>
  <footer class="app-statusbar" role="status" aria-live="polite">
    <span class="st-item">
      <span class="st-dot" :class="{ busy }"></span>
      {{ modeLabel }}
    </span>
    <span class="st-sep"></span>
    <span class="st-item">工作区 <b>{{ workspaceName }}</b></span>
    <span class="st-right">
      <span v-if="modelLabel" class="st-item">模型 <b>{{ modelLabel }}</b></span>
      <span class="st-item">{{ busy ? '任务运行中' : '空闲' }}</span>
    </span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useChatStore } from '../stores/chat';
import { activeMode, modeDefOf } from '../stores/mode';

const settingsStore = useSettingsStore();
const chatStore = useChatStore();

const modeLabel = computed(() => modeDefOf(activeMode.value).label);

/** 工作区取路径最后一段；未设置时给明确文案，不显示空串 */
const workspaceName = computed(() => {
  const dir = (settingsStore.settings.workspaceDir || '').trim();
  if (!dir) return '未设置';
  const parts = dir.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || dir;
});

/** 当前会话的模型优先，其次设置里的默认模型 */
const modelLabel = computed(() => {
  const conv = chatStore.conversations.find((c) => c.id === chatStore.currentConvId);
  return conv?.modelId || settingsStore.settings.defaultModelId || '';
});

const busy = computed(() => !!chatStore.streaming);
</script>

<style scoped>
.app-statusbar {
  flex: 0 0 26px;
  height: 26px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-tertiary);
  font-size: 11px;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
}
.st-item { display: inline-flex; align-items: center; gap: 5px; }
.st-item b { color: var(--color-text-secondary); font-weight: 500; }
.st-sep { width: 1px; height: 12px; background: var(--color-border); }
.st-right { margin-left: auto; display: inline-flex; align-items: center; gap: 14px; }
.st-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-success);
  flex: 0 0 auto;
}
.st-dot.busy {
  background: var(--color-warning);
  animation: stPulse 1.4s ease-in-out infinite;
}
@keyframes stPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
</style>

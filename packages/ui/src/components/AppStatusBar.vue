<!--
  AppStatusBar.vue — 应用底部状态栏（2026-10-31）
  桌面应用的标志性元素：模式 / 当前上下文 / 模型 / 运行状态常驻可见，
  不用回头找入口就知道"我现在在哪、在跑什么"。
  「当前上下文」随模式换口径（办公=工作区 / 开发=项目 / 店铺=项目 /
  运维=连接 / 安全=授权目标 / 工作流=当前工作流 / 剪辑=项目），见 territory。
  web 与 desktop 共用；移动端不渲染（TabBar 已占底部）。
-->
<template>
  <footer class="app-statusbar" role="status" aria-live="polite">
    <span class="st-item">
      <span class="st-dot" :class="{ busy }"></span>
      {{ modeLabel }}
    </span>
    <template v-if="territory">
      <span class="st-sep"></span>
      <span class="st-item">{{ territory.label }} <b>{{ territory.value }}</b></span>
    </template>
    <span class="st-right">
      <span v-if="modelLabel" class="st-item">模型 <b>{{ modelLabel }}</b></span>
      <span class="st-item">{{ busy ? '任务运行中' : '空闲' }}</span>
    </span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSettingsStore } from '../stores/settings';
import { useChatStore } from '../stores/chat';
import { usePlatformStore } from '../stores/platform';
import { activeMode, modeDefOf } from '../stores/mode';
import { useCodeStore } from '../stores/code';
import { workbenchContextOf } from '../stores/workbenchContext';
import { officePanel } from '../stores/officeWorkbench';

const settingsStore = useSettingsStore();
const chatStore = useChatStore();
const platformStore = usePlatformStore();
const codeStore = useCodeStore();
const route = useRoute();

/** 工作台要同步显示 AI / 人工（人工 = 不调用任何模型），聊天页保持只显示模式名 */
const modeLabel = computed(() => {
  const base = modeDefOf(activeMode.value).label;
  if (activeMode.value === 'office' && route.path.startsWith('/office')) {
    return `${base} · ${officePanel.value === 'manual' ? '人工编辑' : 'AI 协作'}`;
  }
  return base;
});

/** 工作区取路径最后一段；未设置时给明确文案，不显示空串 */
const workspaceName = computed(() => {
  const dir = (settingsStore.settings.workspaceDir || '').trim();
  if (!dir) return '';
  const parts = dir.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || dir;
});

/** 兼容未挂载店铺控制台时的会话标题；正常由 ShopConsole 回填稳定项目上下文。 */
const convTitle = computed(() => {
  const conv = chatStore.conversations.find((c) => c.id === chatStore.currentConvId);
  return (conv?.title || '').trim();
});

/**
 * 第二个状态项 = 「我现在在哪个上下文里干活」。
 * ★ 各模式口径不同（2026-11-02 实报：店铺运营模式下显示「工作区 未设置」答非所问）：
 *   店铺是**项目**（稳定项目，可由多条任务会话组成），开发是**项目目录**，办公才是**工作区**；
 *   运维/安全/工作流/剪辑的当前项在各自工作台内部，由它们回填到 workbenchContext
 *   （连接 / 目标 / 工作流 / 剪辑项目）—— 没挂载过就不知道，整项不渲染，不硬凑。
 */
const territory = computed<{ label: string; value: string } | null>(() => {
  switch (activeMode.value) {
    case 'office':
      return { label: '工作区', value: workspaceName.value || '未设置' };
    case 'dev':
      return { label: '项目', value: codeStore.projectName || '未选择项目' };
    case 'shop':
      return workbenchContextOf('shop')
        || { label: '项目', value: convTitle.value || '未选择项目' };
    default:
      return workbenchContextOf(activeMode.value);
  }
});

/**
 * 当前会话的模型优先，其次设置里的默认模型。
 * ★ 显示**展示名**（alias 优先，其次 modelId），解析不到整项隐藏：
 *   以前直接渲染 modelId，用户看到的是 `e8aa6005-…` 这种内部 id（2026-11-02 实报）。
 */
const modelLabel = computed(() => {
  const conv = chatStore.conversations.find((c) => c.id === chatStore.currentConvId);
  const id = (conv?.modelId || settingsStore.settings.defaultModelId || '').trim();
  if (!id) return '';
  const m = platformStore.resolveModel(id, conv?.platformId);
  return m ? (m.alias || m.modelId || '').trim() : '';
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

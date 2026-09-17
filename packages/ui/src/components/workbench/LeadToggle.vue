<!--
  LeadToggle.vue — 主导方切换按钮（openspec four-mode-workspace 决策 4 / tasks 5e）

  用户拍板 2026-09-16（最终形态）：
  - **一个图标按钮**，不是分段胶囊；点一下就互换主导方（不做「选同一个白点一下」）
  - hover 才浮出当前模式名称，平时只占一个图标的宽度
  - 图标 = 目标形态的图标（点了会切到哪边就显示哪边）：当前 AI → 显示人工侧图标
  - 右下角悬浮（position:absolute; right:16px; bottom:16px），不占布局行
  - 外部 wrapper pointer-events:none，仅按钮本身可点（不挡内容交互）
  - 办公模式不渲染（由父级 v-if 控制）
  - 切换只改 lead（chatPlacement 重排），终端/编辑器/会话全部保活（v-show）
-->
<template>
  <div class="lead-toggle-wrap">
    <button
      type="button"
      class="lead-fab"
      :title="hint"
      :aria-label="hint"
      @click="toggle"
    >
      <el-icon :size="15"><component :is="nextIcon" /></el-icon>
      <span class="lead-fab-tip">{{ nextLabel }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MagicStick, Monitor, Grid } from '@element-plus/icons-vue';
import type { AppMode, LeadMode } from '../../stores/mode';

const props = withDefaults(defineProps<{
  modelValue: LeadMode;
  /** 当前模式：决定措辞（dev=编辑模式 / ops,sec=命令模式） */
  mode: AppMode;
}>(), {});

const emit = defineEmits<{
  (e: 'update:modelValue', v: LeadMode): void;
}>();

/** 人工侧的名称与图标：开发=编辑模式，运维/安全=命令模式 */
const humanLabel = computed(() => (props.mode === 'dev' ? '编辑模式' : '命令模式'));
const humanIcon = computed(() => (props.mode === 'dev' ? Monitor : Grid));

/** 按钮显示的是「点了会切到哪里」：当前 ai → 显示人工侧图标，反之显示 AI 图标 */
const nextLabel = computed(() => (props.modelValue === 'ai' ? humanLabel.value : 'AI 模式'));
const nextIcon = computed(() => (props.modelValue === 'ai' ? humanIcon.value : MagicStick));

/** hover 提示：说清当前状态与点击结果 */
const hint = computed(() =>
  props.modelValue === 'ai'
    ? `当前：AI 模式 → 点击切到${humanLabel.value}`
    : `当前：${humanLabel.value} → 点击切到 AI 模式`,
);

function toggle() {
  emit('update:modelValue', props.modelValue === 'ai' ? 'human' : 'ai');
}
</script>

<style scoped>
/* 外层 wrapper：只定位不拦截事件，按钮本身 pointer-events:auto */
.lead-toggle-wrap {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 30;
  pointer-events: none;
}

/* 单图标圆钮（毛玻璃），hover 才浮出文字 */
.lead-fab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.12));
  border-radius: 50%;
  background: var(--el-bg-color, #fff);
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: auto;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.lead-fab:hover {
  color: var(--color-primary, #4f46e5);
  border-color: color-mix(in srgb, var(--color-primary, #4f46e5) 45%, transparent);
}

/* 名称：默认隐藏，hover 时向上浮出 */
.lead-fab-tip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--glass-border, rgba(15, 23, 42, 0.12));
  background: var(--el-bg-color, #fff);
  color: var(--color-text, #1f2430);
  font-size: 11.5px;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  opacity: 0;
  transform: translateY(3px);
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.lead-fab:hover .lead-fab-tip,
.lead-fab:focus-visible .lead-fab-tip {
  opacity: 1;
  transform: translateY(0);
}
</style>
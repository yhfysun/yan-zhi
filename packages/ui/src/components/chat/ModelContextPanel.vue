<template>
  <div class="ctx-panel">
    <div class="ctx-panel-head">
      <span class="ctx-panel-name">{{ name }}</span>
      <span class="ctx-panel-cur">{{ formatContextWindow(contextWindow) }}</span>
    </div>
    <div class="ctx-panel-label">上下文窗口</div>
    <div class="ctx-panel-presets">
      <button
        v-for="p in CONTEXT_WINDOW_PRESETS"
        :key="p.tokens"
        type="button"
        class="ctx-preset"
        :class="{ 'is-active': p.tokens === contextWindow }"
        @click="pick(p.tokens)"
      >{{ p.label }}</button>
    </div>
    <div class="ctx-panel-custom" @mousedown.stop>
      <el-input
        v-model="customK"
        size="small"
        placeholder="自定义"
        @keyup.enter="applyCustom"
        @blur="applyCustom"
      />
      <span class="ctx-panel-unit">K</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 模型上下文窗口快捷设置面板。
 *
 * 由调用方负责浮层定位与显隐（当前由输入区模型下拉 hover 时挂在 Teleport 浮层里），
 * 本组件只渲染内容并向上抛 `change`，不直接落库 —— 保存统一走 platformStore.updateModel，
 * 与「配置模型平台」里的上下文窗口是同一个值（改一处两处同步）。
 */import { ref, watch } from 'vue';
import { CONTEXT_WINDOW_PRESETS, formatContextWindow, toContextWindowK } from '../../utils/context-window';

const props = defineProps<{
  /** 模型展示名 */
  name: string;
  /** 当前上下文窗口（token） */
  contextWindow: number;
}>();

const emit = defineEmits<{
  (e: 'change', tokens: number): void;
}>();

const customK = ref(String(toContextWindowK(props.contextWindow)));
watch(
  () => props.contextWindow,
  (v) => { customK.value = String(toContextWindowK(v)); },
);

function pick(tokens: number) {
  if (tokens === props.contextWindow) return;
  emit('change', tokens);
}

function applyCustom() {
  const k = Number(String(customK.value).replace(/[^\d]/g, ''));
  if (!k || k < 1) {
    customK.value = String(toContextWindowK(props.contextWindow));
    return;
  }
  const tokens = k * 1024;
  if (tokens === props.contextWindow) {
    customK.value = String(toContextWindowK(props.contextWindow));
    return;
  }
  emit('change', tokens);
}
</script>

<style scoped>
.ctx-panel {
  width: 244px;
  padding: 10px 12px 12px;
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--glass-border);
  background: var(--el-bg-color-overlay, #fff);
  box-shadow: var(--shadow-lg);
}

.ctx-panel-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.ctx-panel-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.ctx-panel-cur {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
}

.ctx-panel-label {
  margin: 8px 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-secondary);
}

.ctx-panel-presets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.ctx-preset {
  height: 26px;
  padding: 0;
  border-radius: 7px;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ctx-preset:hover {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
}
.ctx-preset.is-active {
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.ctx-panel-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.ctx-panel-custom :deep(.el-input) { flex: 1; }
.ctx-panel-unit {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--color-text-secondary);
}
</style>

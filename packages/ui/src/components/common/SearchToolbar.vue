<template>
  <div class="st-bar">
    <div class="st-search">
      <el-icon class="st-icon"><Search /></el-icon>
      <input
        class="st-input"
        :value="query"
        :placeholder="placeholder"
        @input="onInput"
      />
      <el-icon v-if="query" class="st-clear" @click="emit('update:query', '')"><Close /></el-icon>
    </div>
    <div v-if="count !== undefined || $slots.actions" class="st-side">
      <slot name="actions" />
      <el-tag v-if="count !== undefined" size="small" type="info" effect="plain">共 {{ count }} 个</el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search, Close } from '@element-plus/icons-vue';

defineProps<{
  /** 搜索词（v-model:query） */
  query: string;
  /** 占位文案 */
  placeholder?: string;
  /** 右侧计数徽标（列表总数）；缺省不渲染 */
  count?: number;
}>();

const emit = defineEmits<{
  (e: 'update:query', v: string): void;
}>();

function onInput(e: Event) {
  emit('update:query', (e.target as HTMLInputElement).value);
}
</script>

<style scoped>
/* 行内工具栏：左搜索 / 右 actions（筛选下拉、按钮、计数）。flex:1 便于作为页面 flex 子项自适应 */
.st-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1 1 auto;
  min-width: 0;
}
.st-search {
  position: relative;
  flex: 1 1 220px;
  max-width: 480px;
  min-width: 0;
  display: flex;
  align-items: center;
}
.st-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-secondary);
  font-size: 14px;
  pointer-events: none;
}
.st-input {
  width: 100%;
  height: 34px;
  padding: 0 36px 0 34px;
  border: 1px solid var(--glass-border);
  /* 圆角走控件档（原为 17px 胶囊 —— 与相邻的 8px 按钮/下拉不成体系） */
  border-radius: var(--radius-sm);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  color: var(--color-text);
  font-size: var(--font-size-base);
  outline: none;
  transition: border-color 0.15s;
}
.st-input:focus { border-color: var(--color-primary); }
.st-input::placeholder { color: var(--color-text-secondary); }
.st-clear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-secondary);
  font-size: 14px;
  cursor: pointer;
}
.st-clear:hover { color: var(--color-text); }
.st-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-left: auto;
}

@media (max-width: 767px) {
  .st-search { flex: 1 1 100%; max-width: 100%; }
  .st-side { margin-left: 0; }
}
</style>

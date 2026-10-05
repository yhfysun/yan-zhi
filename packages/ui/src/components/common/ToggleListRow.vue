<template>
  <div class="tlr" :class="{ 'is-disabled': rowDisabled }">
    <div class="tlr-main">
      <div class="tlr-head">
        <span class="tlr-title" :title="title">{{ title }}</span>
        <el-tag
          v-for="t in tags"
          :key="t.text"
          size="small"
          :type="t.type || 'info'"
          effect="plain"
        >{{ t.text }}</el-tag>
      </div>
      <div v-if="subtitle" class="tlr-subtitle" :title="subtitle">{{ subtitle }}</div>
      <slot />
    </div>
    <div v-if="enabled !== undefined || $slots.actions" class="tlr-side">
      <el-switch
        v-if="enabled !== undefined"
        :model-value="enabled"
        size="small"
        :loading="loading"
        :disabled="switchDisabled"
        @update:model-value="onEnabledInput"
      />
      <div v-if="$slots.actions" class="tlr-actions"><slot name="actions" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** 行标题 */
  title: string;
  /** 次级说明（单行截断）；更复杂的说明内容用默认插槽 */
  subtitle?: string;
  /** 状态标签组 */
  tags?: { text: string; type?: 'primary' | 'success' | 'warning' | 'info' | 'danger' }[];
  /** 启用开关（v-model:enabled）；缺省不渲染开关 */
  enabled?: boolean;
  /** 开关 loading 态 */
  loading?: boolean;
  /** 仅禁用启用开关（行内容不受影响），用于"至少保留一个启用"类约束 */
  switchDisabled?: boolean;
  /** 整行置灰 */
  rowDisabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:enabled', v: boolean): void;
  (e: 'change', v: boolean): void;
}>();

function onEnabledInput(v: boolean) {
  emit('update:enabled', v);
  emit('change', v);
}
</script>

<style scoped>
/* 列表行：主内容（标题/标签/说明/自定义体） + 右侧启用开关与操作按钮 */
.tlr {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: all 0.18s;
  min-width: 0;
}
.tlr:hover { border-color: var(--glass-border-strong); }
.tlr.is-disabled { opacity: 0.45; }

.tlr-main {
  flex: 1;
  min-width: 0;
}
.tlr-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.tlr-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tlr-subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tlr-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding-top: 2px;
}
.tlr-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>

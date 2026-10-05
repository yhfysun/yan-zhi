<template>
  <div class="es-wrap" :class="{ 'is-compact': compact }">
    <!-- 插画位：大 icon / emoji（compact 模式移除） -->
    <div v-if="!compact" class="es-art" aria-hidden="true">
      <span v-if="isStringIcon" class="es-art-emoji">{{ icon }}</span>
      <el-icon v-else-if="icon" class="es-art-icon" :size="30"><component :is="icon" /></el-icon>
    </div>

    <div class="es-title">{{ title }}</div>
    <div v-if="!compact && description" class="es-desc">{{ description }}</div>

    <el-button
      v-if="actionText"
      type="primary"
      class="es-action"
      :loading="actionLoading"
      @click="emit('action')"
    >
      {{ actionText }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';

const props = defineProps<{
  /** 插画内容：emoji 字符串或图标组件；缺省不渲染插画位 */
  icon?: string | Component;
  /** 标题（必填） */
  title: string;
  /** 次级描述（compact 模式不显示） */
  description?: string;
  /** 主 CTA 文案；缺省不渲染按钮 */
  actionText?: string;
  /** CTA 加载态 */
  actionLoading?: boolean;
  /** 紧凑模式：列表内嵌，只留标题 + 按钮 */
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'action'): void;
}>();

const isStringIcon = computed(() => typeof props.icon === 'string');
</script>

<style scoped>
.es-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 24px;
  gap: 12px;
}

.es-art {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  margin-bottom: 4px;
}

.es-art-emoji {
  font-size: 30px;
  line-height: 1;
}

.es-title {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--color-text);
  line-height: var(--line-height-md);
}

.es-desc {
  font-size: var(--font-size-sm);
  color: var(--el-text-color-secondary);
  line-height: var(--line-height-sm);
  max-width: 360px;
}

/* 主 CTA：胶囊圆角（覆盖 el-button round 的 20px） */
.es-action {
  border-radius: 999px;
  margin-top: 8px;
  padding-left: 22px;
  padding-right: 22px;
}

/* 紧凑模式：列表内嵌，收窄留白 */
.es-wrap.is-compact {
  padding: 20px 16px;
  gap: 10px;
}
</style>

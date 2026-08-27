<template>
  <div
    class="marketplace-card"
    :class="[`is-${variant}`, { 'is-clickable': clickable }]"
    @click="$emit('click')"
  >
    <div class="marketplace-card-main">
      <div class="marketplace-card-icon">
        <slot name="icon">
          <el-icon :size="26"><component :is="icon" /></el-icon>
        </slot>
      </div>
      <div class="marketplace-card-body">
        <div class="marketplace-card-title">
          <slot name="title">{{ title }}</slot>
        </div>
        <div v-if="$slots.description || description" class="marketplace-card-description">
          <slot name="description">{{ description }}</slot>
        </div>
        <div v-if="$slots.meta || meta || tags.length" class="marketplace-card-meta">
          <slot name="meta">
            <el-tag v-for="tag in tags" :key="tag" size="small" type="info" effect="plain">{{ tag }}</el-tag>
          </slot>
        </div>
      </div>
    </div>

    <div v-if="$slots.badge || badge" class="marketplace-card-badge">
      <slot name="badge">{{ badge }}</slot>
    </div>

    <div v-if="$slots.actions" class="marketplace-card-actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

withDefaults(
  defineProps<{
    icon?: Component;
    title?: string;
    description?: string;
    meta?: string;
    badge?: string;
    tags?: string[];
    variant?: 'default' | 'local' | 'remote' | 'add';
    clickable?: boolean;
  }>(),
  {
    icon: undefined,
    title: '',
    description: '',
    meta: '',
    badge: '',
    tags: () => [],
    variant: 'default',
    clickable: true,
  },
);

defineEmits<{ click: [] }>();
</script>

<style scoped>
.marketplace-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}
.marketplace-card.is-clickable {
  cursor: pointer;
}
.marketplace-card.is-clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.06);
  border-color: var(--glass-border-strong);
}
.marketplace-card.is-local {
  border-color: rgba(124, 58, 237, 0.28);
}
.marketplace-card.is-add {
  border-style: dashed;
  background: var(--el-fill-color-light);
}
.marketplace-card.is-add:hover {
  border-color: var(--color-primary);
  background: var(--el-fill-color-blank);
}
.marketplace-card-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1;
}
.marketplace-card-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(124, 58, 237, 0.1);
  color: #7c3aed;
}
.marketplace-card.is-remote .marketplace-card-icon {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
.marketplace-card.is-add .marketplace-card-icon {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}
.marketplace-card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.marketplace-card-title {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.marketplace-card-description {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}
.marketplace-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.marketplace-card-badge {
  position: absolute;
  top: 12px;
  right: 12px;
}
.marketplace-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .marketplace-card {
    padding: 16px;
    gap: 12px;
  }
  .marketplace-card-main {
    align-items: flex-start;
  }
}
</style>

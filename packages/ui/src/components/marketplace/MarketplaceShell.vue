<template>
  <section class="marketplace-shell">
    <header class="marketplace-shell-header">
      <div class="marketplace-shell-heading">
        <slot name="back" />
        <div class="marketplace-shell-text">
          <h2 v-if="title" class="marketplace-shell-title">{{ title }}</h2>
          <p v-if="subtitle" class="marketplace-shell-subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="marketplace-shell-actions">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="loading" class="marketplace-shell-state">
      <el-skeleton animated :rows="3" />
    </div>
    <div v-else-if="error" class="marketplace-shell-state">
      <MarketplaceEmpty :description="error">
        <slot name="error-actions" />
      </MarketplaceEmpty>
    </div>
    <div v-else-if="empty" class="marketplace-shell-state">
      <MarketplaceEmpty :description="emptyDescription">
        <slot name="empty-actions" />
      </MarketplaceEmpty>
    </div>
    <div v-else class="marketplace-shell-content">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import MarketplaceEmpty from './MarketplaceEmpty.vue';

withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    loading?: boolean;
    error?: string;
    empty?: boolean;
    emptyDescription?: string;
  }>(),
  {
    title: '',
    subtitle: '',
    loading: false,
    error: '',
    empty: false,
    emptyDescription: '暂无数据',
  },
);
</script>

<style scoped>
.marketplace-shell {
  width: 100%;
}
.marketplace-shell-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.marketplace-shell-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.marketplace-shell-text {
  min-width: 0;
}
.marketplace-shell-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}
.marketplace-shell-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.marketplace-shell-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.marketplace-shell-state {
  padding: 24px 0;
}

@media (max-width: 767px) {
  .marketplace-shell-header {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .marketplace-shell-heading {
    flex-wrap: wrap;
  }
  .marketplace-shell-actions {
    width: 100%;
  }
}
</style>

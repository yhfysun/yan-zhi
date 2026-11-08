<template>
  <div class="ent-empty">
    <svg class="ent-empty-art" viewBox="0 0 120 92" width="120" height="92" fill="none" aria-hidden="true">
      <ellipse cx="60" cy="80" rx="42" ry="6" fill="var(--color-primary-soft)" />
      <rect x="27" y="12" width="62" height="56" rx="9" fill="var(--color-surface)" stroke="var(--color-border-strong)" stroke-width="2" />
      <path d="M40 31h36M40 43h27M40 55h18" stroke="var(--color-border-strong)" stroke-width="3" stroke-linecap="round" />
      <circle cx="86" cy="60" r="14" fill="var(--color-surface)" stroke="var(--color-primary)" stroke-width="2" />
      <path d="M96 70l9 9" stroke="var(--color-primary)" stroke-width="3" stroke-linecap="round" />
    </svg>
    <b class="ent-empty-title">{{ title }}</b>
    <p class="ent-empty-desc">{{ description }}</p>
    <div v-if="$slots.default" class="ent-empty-action"><slot /></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string }>(), {
  description: '',
});
</script>

<style scoped>
.ent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 36px 16px 40px;
  text-align: center;
}
.ent-empty-art { opacity: .9; margin-bottom: 2px; }
.ent-empty-title { font-size: var(--font-size-md); font-weight: 600; color: var(--color-text); }
.ent-empty-desc { margin: 0; max-width: 360px; font-size: var(--font-size-sm); line-height: 1.6; color: var(--color-text-tertiary); }
.ent-empty-action { margin-top: var(--space-2); }
</style>

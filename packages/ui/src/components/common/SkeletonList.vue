<template>
  <div class="skl-rows" :class="{ 'is-animated': animated }" aria-hidden="true">
    <div
      v-for="(w, i) in widths"
      :key="i"
      class="skl-row"
      :style="{ height: `${rowHeight}px`, width: w }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 骨架条数 */
    rows?: number;
    /** 每条高度（px） */
    rowHeight?: number;
    /** 是否开 shimmer 动画 */
    animated?: boolean;
  }>(),
  { rows: 4, rowHeight: 40, animated: true },
);

/** 宽度从 100% 线性递减到 60%，形成错落节奏 */
const widths = computed(() => {
  const n = Math.max(props.rows, 1);
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return `${Math.round(100 - t * 40)}%`;
  });
});
</script>

<style scoped>
.skl-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.skl-row {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
  /* 次级控件基面 token（皮肤/暗色层会覆盖 --btn-bg） */
  background: var(--btn-bg);
}

/* shimmer 高亮：从文字色派生，不硬编码 hex（亮暗模式自动跟随） */
.skl-row::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-text) 8%, transparent),
    transparent
  );
}

.skl-rows.is-animated .skl-row::after {
  animation: skl-shimmer 1.4s var(--ease-standard) infinite;
}

@keyframes skl-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skl-rows.is-animated .skl-row::after {
    animation: none;
  }
}
</style>

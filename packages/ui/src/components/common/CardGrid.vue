<template>
  <div class="cg" :style="gridVars"><slot /></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 单列最小宽度（auto-fill 依据），窄容器自动减列 */
    minCardWidth?: number;
    /** 网格间距（px） */
    gap?: number;
  }>(),
  { minCardWidth: 320, gap: 12 },
);

const gridVars = computed(() => ({
  '--cg-min': `${props.minCardWidth}px`,
  '--cg-gap': `${props.gap}px`,
}));
</script>

<style scoped>
/* 卡片网格容器：同排卡片等高（align-items:stretch）。
   等高由 GlassCard 内部消化：描述区固定两行占位 + foot 沉底，不会留生硬空白
   （2026-10-04 用户要求：管理页卡片高度必须一致）。 */
.cg {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--cg-min), 1fr));
  gap: var(--cg-gap);
  align-items: stretch;
}

@media (max-width: 767px) {
  .cg { grid-template-columns: 1fr; }
}
</style>

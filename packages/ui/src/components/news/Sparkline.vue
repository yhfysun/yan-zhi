<template>
  <svg
    class="market-sparkline"
    :class="{ compact, up: positive, down: !positive }"
    viewBox="0 0 80 28"
    role="img"
    :aria-label="positive ? '近期走势上涨' : '近期走势下跌'"
    preserveAspectRatio="none"
  >
    <polyline v-if="pointString" :points="pointString" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  points: number[];
  positive: boolean;
  compact?: boolean;
}>(), {
  compact: false,
});

const pointString = computed(() => {
  if (props.points.length < 2) return '';
  const min = Math.min(...props.points);
  const max = Math.max(...props.points);
  const range = max - min || 1;
  return props.points.map((value, index) => {
    const x = (index / (props.points.length - 1)) * 78 + 1;
    const y = 25 - ((value - min) / range) * 22;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
});
</script>

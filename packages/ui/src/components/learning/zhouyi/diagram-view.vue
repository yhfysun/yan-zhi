<script setup lang="ts">
// 周易图形小组件：把 @yan-zhi/shared zhouyiBlockToShapes 输出的形状数组画成内联 SVG。
// ★ 形状协议以 shared 为准（判别联合）：line{x1,y1,x2,y2,color,strokeWidth,dashed} /
//   rect{x,y,w,h,fill,stroke} / circle{cx,cy,r,fill,stroke} / text{x,y,text,color,fontSize,anchor,bold}。
// viewBox 宽固定 680（与 shared 坐标系一致），高按内容自适应。
import { computed } from 'vue';
import type { ZhouyiShape } from '@yan-zhi/shared';

const props = defineProps<{ shapes: ZhouyiShape[] }>();

const height = computed(() => {
  let bottom = 20;
  for (const s of props.shapes) {
    if (s.kind === 'line') bottom = Math.max(bottom, s.y1, s.y2);
    else if (s.kind === 'rect') bottom = Math.max(bottom, s.y + s.h);
    else if (s.kind === 'circle') bottom = Math.max(bottom, s.cy + s.r);
    else if (s.kind === 'text') bottom = Math.max(bottom, s.y + 6);
  }
  return Math.max(64, Math.ceil(bottom) + 16);
});
</script>

<template>
  <svg
    class="zy-diagram-svg"
    :viewBox="`0 0 680 ${height}`"
    role="img"
    aria-label="周易图式"
    preserveAspectRatio="xMidYMid meet"
  >
    <template v-for="(s, i) in shapes" :key="i">
      <line
        v-if="s.kind === 'line'"
        :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2"
        :stroke="s.color || 'currentColor'" :stroke-width="s.strokeWidth ?? 2"
        :stroke-dasharray="s.dashed ? '6 4' : undefined"
        stroke-linecap="round"
      />
      <rect
        v-else-if="s.kind === 'rect'"
        :x="s.x" :y="s.y" :width="s.w" :height="s.h"
        :fill="s.fill || 'none'" :stroke="s.stroke || 'currentColor'" stroke-width="1"
      />
      <circle
        v-else-if="s.kind === 'circle'"
        :cx="s.cx" :cy="s.cy" :r="s.r"
        :fill="s.fill || 'none'" :stroke="s.stroke || 'currentColor'" stroke-width="1.5"
      />
      <text
        v-else-if="s.kind === 'text'"
        :x="s.x" :y="s.y" :fill="s.color || 'currentColor'"
        :font-size="s.fontSize ?? 16"
        :text-anchor="s.anchor || 'middle'"
        :font-weight="s.bold ? 600 : 400"
      >{{ s.text }}</text>
    </template>
  </svg>
</template>

<style scoped>
.zy-diagram-svg { display: block; width: 100%; height: auto; }
</style>

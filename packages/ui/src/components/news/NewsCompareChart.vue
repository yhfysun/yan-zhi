<template>
  <figure class="news-cmp" aria-label="多股对比走势">
    <div ref="boxEl" class="news-kline-box">
      <svg
        v-if="W > 60 && H > 100 && maxLen > 0"
        :width="W"
        :height="H"
        :viewBox="`0 0 ${W} ${H}`"
        class="news-kline-svg"
        role="img"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
      >
        <!-- 横向网格 + 百分比刻度 -->
        <g class="news-kline-grid">
          <line v-for="(y, k) in gridYs" :key="`g${k}`" :x1="PAD_L" :x2="plotRight" :y1="y" :y2="y" />
        </g>
        <g class="news-kline-axis">
          <text
            v-for="(v, k) in gridValues"
            :key="`t${k}`"
            :x="W - 4"
            :y="(gridYs[k] ?? 0) + 3.5"
            class="news-kline-tick"
            text-anchor="end"
          >
            {{ formatPercent(v) }}
          </text>
        </g>

        <!-- 零轴（基准线）：首日收盘 = 0% -->
        <line :x1="PAD_L" :x2="plotRight" :y1="valueY(0)" :y2="valueY(0)" class="news-cmp-zero" />

        <!-- hover 十字线 -->
        <line v-if="hoverIndex >= 0" :x1="hoverX" :x2="hoverX" :y1="0" :y2="H - AXIS_H" class="news-kline-cross" />

        <!-- 各品种归一化走势线 -->
        <polyline
          v-for="line in lines"
          :key="line.code"
          :points="line.points"
          :stroke="line.color"
          class="news-cmp-line"
        />
        <circle
          v-for="dot in hoverDots"
          :key="`dot${dot.code}`"
          :cx="hoverX"
          :cy="dot.y"
          :fill="dot.color"
          class="news-cmp-dot-mark"
        />

        <!-- 日期刻度 -->
        <g class="news-kline-axis">
          <text
            v-for="(marker, k) in dateMarkers"
            :key="`d${k}`"
            :x="marker.x"
            :y="H - 6"
            class="news-kline-tick news-kline-date"
            :text-anchor="marker.anchor"
          >
            {{ marker.label }}
          </text>
        </g>
      </svg>

      <p v-if="!series.length" class="news-quote-empty news-cmp-empty">
        在左侧点选品种加入对比（最多 {{ COMPARE_MAX }} 个）
      </p>

      <!-- hover 明细：各品种当日累计涨跌 -->
      <div v-if="hoverIndex >= 0" class="news-kline-tip" :style="tipStyle" aria-hidden="true">
        <span class="news-kline-tip-date">{{ hoverDate }}</span>
        <span v-for="row in hoverRows" :key="row.code" class="news-cmp-tip-row">
          <i class="news-cmp-dot" :style="{ background: row.color }" />
          {{ row.name }}
          <b :class="row.value >= 0 ? 'up' : 'down'">{{ formatPercent(row.value) }}</b>
        </span>
      </div>
    </div>
    <figcaption class="news-kline-caption">对比 · 以各自区间首日收盘为基准的累计涨跌 %</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { KlineBar } from '@yan-zhi/shared';

interface CompareSeries {
  code: string;
  name: string;
  color: string;
  bars: KlineBar[];
  loading?: boolean;
}

const props = defineProps<{ series: CompareSeries[] }>();

const COMPARE_MAX = 10;

// 与 NewsKline 同一套尺寸方案：ResizeObserver 量容器，1 单位 = 1px
const boxEl = ref<HTMLElement | null>(null);
const W = ref(640);
const H = ref(320);
let observer: ResizeObserver | null = null;

onMounted(() => {
  const el = boxEl.value;
  if (!el || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (!rect) return;
    W.value = Math.max(Math.round(rect.width), 60);
    H.value = Math.max(Math.round(rect.height), 100);
  });
  observer.observe(el);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

const PAD_L = 6;
const PAD_R = 46;
const AXIS_H = 20;
const plotRight = computed(() => W.value - PAD_R);
const plotWidth = computed(() => plotRight.value - PAD_L);
const plotH = computed(() => Math.max(H.value - AXIS_H, 40));

const maxLen = computed(() => props.series.reduce((acc, s) => Math.max(acc, s.bars.length), 0));

// 每条线：以自身首日收盘为基准的累计涨跌 %
const lines = computed(() => {
  const span = valueSpan.value || 1;
  return props.series
    .filter((s) => s.bars.length)
    .map((s) => ({
      code: s.code,
      color: s.color,
      points: s.bars
        .map((bar, k) => {
          const base = s.bars[0]?.close || bar.close;
          const v = base ? ((bar.close - base) / base) * 100 : 0;
          return `${x(k)},${valueY(v, span)}`;
        })
        .join(' '),
    }));
});

const allValues = computed(() => {
  const out: number[] = [];
  for (const s of props.series) {
    const base = s.bars[0]?.close;
    if (!base) continue;
    for (const bar of s.bars) out.push(((bar.close - base) / base) * 100);
  }
  return out;
});

const valueSpan = computed(() => {
  const values = allValues.value;
  if (!values.length) return 0;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  // 上下各留 8% 余量
  return (max - min) / 0.84 || 1;
});

function valueY(v: number, span = valueSpan.value): number {
  // 以 0% 为轴心，上下对称展开
  return plotH.value / 2 - (v / span) * plotH.value;
}

const gridValues = computed(() => {
  const span = valueSpan.value;
  if (!span) return [];
  return [-0.4, -0.2, 0, 0.2, 0.4].map((ratio) => span * ratio);
});

const gridYs = computed(() => gridValues.value.map((v) => valueY(v)));

const slot = computed(() => (maxLen.value ? plotWidth.value / maxLen.value : 0));

function x(index: number): number {
  return PAD_L + (index + 0.5) * slot.value;
}

const dateMarkers = computed(() => {
  const longest = props.series.reduce<CompareSeries | null>((acc, s) => (!acc || s.bars.length > acc.bars.length ? s : acc), null);
  const n = longest?.bars.length ?? 0;
  if (!n) return [];
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const index = Math.round(ratio * (n - 1));
    return {
      x: x(index),
      label: longest!.bars[index]?.date.slice(5) ?? '',
      anchor: ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle',
    };
  });
});

function formatPercent(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

// ── hover
const hoverIndex = ref(-1);

const hoverX = computed(() => (hoverIndex.value >= 0 ? x(hoverIndex.value) : 0));

const hoverDate = computed(() => {
  const longest = props.series.reduce<CompareSeries | null>((acc, s) => (!acc || s.bars.length > acc.bars.length ? s : acc), null);
  return longest?.bars[hoverIndex.value]?.date ?? '';
});

const hoverRows = computed(() => {
  const index = hoverIndex.value;
  if (index < 0) return [];
  return props.series
    .filter((s) => s.bars.length > index)
    .map((s) => {
      const base = s.bars[0]?.close || 1;
      const bar = s.bars[index];
      return {
        code: s.code,
        name: s.name,
        color: s.color,
        value: base ? ((bar.close - base) / base) * 100 : 0,
        y: valueY(base ? ((bar.close - base) / base) * 100 : 0),
      };
    });
});

const hoverDots = computed(() => hoverRows.value.map((row) => ({ code: row.code, y: row.y, color: row.color })));

const tipStyle = computed(() => {
  const flip = hoverX.value > W.value * 0.6;
  return {
    left: flip ? `${Math.max(hoverX.value - 210, 4)}px` : `${hoverX.value + 12}px`,
    top: '8px',
  };
});

function onPointerMove(event: PointerEvent): void {
  const svg = event.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  if (localX < PAD_L || localX > plotRight.value || !slot.value) {
    hoverIndex.value = -1;
    return;
  }
  hoverIndex.value = Math.min(Math.max(Math.floor((localX - PAD_L) / slot.value), 0), maxLen.value - 1);
}

function onPointerLeave(): void {
  hoverIndex.value = -1;
}
</script>

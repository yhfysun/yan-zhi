<template>
  <figure class="news-kline" aria-label="日K线图">
    <svg v-if="bars.length" :viewBox="`0 0 ${W} ${H}`" class="news-kline-svg" role="img" preserveAspectRatio="none">
      <!-- 价格网格 -->
      <g class="news-kline-grid">
        <line v-for="tick in gridTicks" :key="`g${tick}`" x1="0" :x2="W" :y1="priceY(tick)" :y2="priceY(tick)" />
      </g>
      <!-- 价格刻度 -->
      <g class="news-kline-axis">
        <text v-for="tick in gridTicks" :key="`t${tick}`" :x="W" :y="priceY(tick) - 2" class="news-kline-tick">
          {{ formatTick(tick) }}
        </text>
      </g>
      <!-- 日 K 蜡烛 -->
      <g class="news-kline-candles">
        <template v-for="(bar, index) in bars" :key="bar.date">
          <line
            :x1="xCenter(index)"
            :x2="xCenter(index)"
            :y1="priceY(bar.high)"
            :y2="priceY(bar.low)"
            :class="candleClass(bar)"
          />
          <rect
            :x="xLeft(index)"
            :y="priceY(Math.max(bar.open, bar.close))"
            :width="candleWidth"
            :height="Math.max(bodyHeight(bar), 1)"
            :class="candleClass(bar)"
          />
        </template>
      </g>
      <!-- 成交量 -->
      <g class="news-kline-volume">
        <rect
          v-for="(bar, index) in bars"
          :key="`v${bar.date}`"
          :x="xLeft(index)"
          :y="volumeY(bar)"
          :width="candleWidth"
          :height="Math.max(volumeHeight(bar), 1)"
          :class="candleClass(bar)"
        />
      </g>
      <!-- 日期刻度 -->
      <g class="news-kline-axis">
        <text :x="4" :y="H - 2" class="news-kline-tick news-kline-date">{{ bars[0]?.date.slice(5) }}</text>
        <text :x="W / 2" :y="H - 2" class="news-kline-tick news-kline-date" text-anchor="middle">
          {{ bars[Math.floor(bars.length / 2)]?.date.slice(5) }}
        </text>
        <text :x="W - 4" :y="H - 2" class="news-kline-tick news-kline-date" text-anchor="end">
          {{ bars[bars.length - 1]?.date.slice(5) }}
        </text>
      </g>
    </svg>
    <figcaption class="news-kline-caption">日K · 近 {{ bars.length }} 个交易日</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { KlineBar } from '@yan-zhi/shared';

const props = defineProps<{ bars: KlineBar[] }>();

// 画布逻辑尺寸（preserveAspectRatio=none 拉伸自适应容器宽度）
const W = 360;
const H = 230;
const PRICE_AREA = 168; // 上部价格区高度
const VOLUME_AREA = 46; // 中部成交量高度
const AXIS_AREA = 14; // 底部日期高度
const GAP = 1.5; // 蜡烛间距

const candleWidth = computed(() => (bars.value.length ? Math.max((W - GAP * bars.value.length) / bars.value.length, 1) : 0));

const prices = computed(() => props.bars.flatMap((bar) => [bar.high, bar.low]).filter(Number.isFinite));
const maxPrice = computed(() => Math.max(...prices.value, Number.NEGATIVE_INFINITY));
const minPrice = computed(() => Math.min(...prices.value, Number.POSITIVE_INFINITY));
const maxVolume = computed(() => Math.max(...props.bars.map((bar) => bar.volume), 0));

const gridTicks = computed(() => {
  if (!Number.isFinite(maxPrice.value) || !Number.isFinite(minPrice.value) || maxPrice.value === minPrice.value) return [];
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => minPrice.value + (maxPrice.value - minPrice.value) * ratio);
});

const bars = computed(() => props.bars);

function priceY(value: number): number {
  const span = maxPrice.value - minPrice.value;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return ((maxPrice.value - value) / span) * PRICE_AREA;
}

function volumeY(bar: KlineBar): number {
  return PRICE_AREA + (1 - (maxVolume.value ? bar.volume / maxVolume.value : 0)) * VOLUME_AREA;
}

function volumeHeight(bar: KlineBar): number {
  return maxVolume.value ? (bar.volume / maxVolume.value) * VOLUME_AREA : 0;
}

function bodyHeight(bar: KlineBar): number {
  return Math.abs(priceY(bar.open) - priceY(bar.close));
}

function xLeft(index: number): number {
  return GAP + index * (candleWidth.value + GAP);
}

function xCenter(index: number): number {
  return xLeft(index) + candleWidth.value / 2;
}

function candleClass(bar: KlineBar): string {
  // A股配色惯例：收 ≥ 开 红涨，反之绿跌
  return bar.close >= bar.open ? 'up' : 'down';
}

function formatTick(value: number): string {
  const digits = maxPrice.value < 100 ? 2 : maxPrice.value < 10000 ? 1 : 0;
  return value.toFixed(digits);
}
</script>

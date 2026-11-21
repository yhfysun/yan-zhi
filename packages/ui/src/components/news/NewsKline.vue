<template>
  <figure class="news-kline" aria-label="日K线图">
    <div ref="boxEl" class="news-kline-box">
      <svg
        v-if="bars.length && W > 60 && H > 100"
        :width="W"
        :height="H"
        :viewBox="`0 0 ${W} ${H}`"
        class="news-kline-svg"
        role="img"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
      >
        <!-- 价格网格 -->
        <g class="news-kline-grid">
          <line v-for="tick in gridTicks" :key="`g${tick}`" :x1="PAD_L" :x2="plotRight" :y1="priceY(tick)" :y2="priceY(tick)" />
        </g>

        <!-- hover 列高亮 + 十字线 -->
        <g v-if="hoverIndex >= 0" class="news-kline-hover">
          <rect
            :x="xLeft(hoverIndex)"
            :y="0"
            :width="bodyWidth + GAP"
            :height="PRICE_H + VOL_H"
            class="news-kline-hover-col"
          />
          <line :x1="xCenter(hoverIndex)" :x2="xCenter(hoverIndex)" :y1="0" :y2="PRICE_H + VOL_H" class="news-kline-cross" />
          <line
            :x1="PAD_L"
            :x2="plotRight"
            :y1="priceY(hoverBar!.close)"
            :y2="priceY(hoverBar!.close)"
            class="news-kline-cross"
          />
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
              :width="bodyWidth"
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
            :width="bodyWidth"
            :height="Math.max(volumeHeight(bar), 1)"
            :class="candleClass(bar)"
          />
        </g>

        <!-- 价格刻度（右侧，与网格对齐） -->
        <g class="news-kline-axis">
          <text
            v-for="tick in gridTicks"
            :key="`t${tick}`"
            :x="W - 4"
            :y="priceY(tick) + 3.5"
            class="news-kline-tick"
            text-anchor="end"
          >
            {{ formatTick(tick) }}
          </text>
        </g>

        <!-- 日期刻度（底部，等距 5 档） -->
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

      <!-- hover 浮层：OHLC + 涨跌幅 + 成交量 -->
      <div v-if="hoverBar" class="news-kline-tip" :style="tipStyle" aria-hidden="true">
        <span class="news-kline-tip-date">{{ hoverBar.date }}</span>
        <span>开 <b>{{ fmt(hoverBar.open) }}</b></span>
        <span>高 <b>{{ fmt(hoverBar.high) }}</b></span>
        <span>低 <b>{{ fmt(hoverBar.low) }}</b></span>
        <span>收 <b :class="hoverChange >= 0 ? 'up' : 'down'">{{ fmt(hoverBar.close) }}</b></span>
        <span :class="hoverChange >= 0 ? 'up' : 'down'">{{ signedPercent(hoverChange) }}</span>
        <span class="news-kline-tip-vol">量 {{ formatVolume(hoverBar.volume) }}</span>
      </div>
    </div>
    <figcaption class="news-kline-caption">日K · 近 {{ bars.length }} 个交易日 · 悬停查看明细</figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { KlineBar } from '@yan-zhi/shared';

const props = defineProps<{ bars: KlineBar[] }>();

// ── 画布尺寸：ResizeObserver 量容器，1 SVG 单位 = 1px，不再用 viewBox 拉伸（此前
//    360×230 逻辑坐标被 preserveAspectRatio=none 拉到 900px 宽 → 蜡烛变形）。
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

// ── 布局几何
const PAD_L = 6;
const PAD_R = 50; // 右侧价格刻度留白
const AXIS_H = 20; // 底部日期高度
const plotRight = computed(() => W.value - PAD_R);
const plotWidth = computed(() => plotRight.value - PAD_L);
const VOL_H = computed(() => Math.min(Math.max(Math.round(H.value * 0.16), 34), 64));
const PRICE_H = computed(() => Math.max(H.value - AXIS_H - VOL_H.value, 40));

const GAP = 2;
const slot = computed(() => (bars.value.length ? plotWidth.value / bars.value.length : 0));
const bodyWidth = computed(() => Math.min(Math.max(slot.value - GAP, 1), 16));

function xLeft(index: number): number {
  return PAD_L + index * slot.value + GAP / 2;
}

function xCenter(index: number): number {
  return xLeft(index) + bodyWidth.value / 2;
}

const bars = computed(() => props.bars);

// ── 价格标度
const prices = computed(() => props.bars.flatMap((bar) => [bar.high, bar.low]).filter(Number.isFinite));
const maxPrice = computed(() => Math.max(...prices.value, Number.NEGATIVE_INFINITY));
const minPrice = computed(() => Math.min(...prices.value, Number.POSITIVE_INFINITY));
const maxVolume = computed(() => Math.max(...props.bars.map((bar) => bar.volume), 0));

function priceY(value: number): number {
  const span = maxPrice.value - minPrice.value;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return ((maxPrice.value - value) / span) * PRICE_H.value;
}

function volumeY(bar: KlineBar): number {
  return PRICE_H.value + (1 - (maxVolume.value ? bar.volume / maxVolume.value : 0)) * VOL_H.value;
}

function volumeHeight(bar: KlineBar): number {
  return maxVolume.value ? (bar.volume / maxVolume.value) * VOL_H.value : 0;
}

function bodyHeight(bar: KlineBar): number {
  return Math.abs(priceY(bar.open) - priceY(bar.close));
}

function candleClass(bar: KlineBar): string {
  // A股配色惯例：收 ≥ 开 红涨，反之绿跌
  return bar.close >= bar.open ? 'up' : 'down';
}

// ── 刻度
const gridTicks = computed(() => {
  if (!Number.isFinite(maxPrice.value) || !Number.isFinite(minPrice.value) || maxPrice.value === minPrice.value) return [];
  return [0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) => minPrice.value + (maxPrice.value - minPrice.value) * ratio);
});

const dateMarkers = computed(() => {
  const n = bars.value.length;
  if (!n) return [];
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const index = Math.round(ratio * (n - 1));
    return {
      x: xCenter(index),
      label: bars.value[index]?.date.slice(5) ?? '',
      anchor: ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle',
    };
  });
});

function formatTick(value: number): string {
  const digits = maxPrice.value < 100 ? 2 : maxPrice.value < 10000 ? 1 : 0;
  return value.toFixed(digits);
}

function fmt(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return String(Math.round(value));
}

// ── hover：十字线 + OHLC 浮层
const hoverIndex = ref(-1);

const hoverBar = computed(() => (hoverIndex.value >= 0 ? bars.value[hoverIndex.value] ?? null : null));

const hoverChange = computed(() => {
  const bar = hoverBar.value;
  if (!bar) return 0;
  const prev = hoverIndex.value > 0 ? bars.value[hoverIndex.value - 1]?.close : undefined;
  const base = prev ?? bar.open;
  return base ? ((bar.close - base) / base) * 100 : 0;
});

function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

const tipStyle = computed(() => {
  // 浮层跟随 hover 列，靠右时向左翻，避免出界
  const flip = hoverIndex.value > bars.value.length * 0.6;
  const x = flip ? xLeft(hoverIndex.value) - 8 : xLeft(hoverIndex.value) + bodyWidth.value + 8;
  return {
    left: `${flip ? Math.max(x - 190, 4) : x}px`,
    top: '8px',
  };
});

function onPointerMove(event: PointerEvent): void {
  const svg = event.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const x = event.clientX - rect.left;
  if (x < PAD_L || x > plotRight.value) {
    hoverIndex.value = -1;
    return;
  }
  const index = Math.floor((x - PAD_L) / slot.value);
  hoverIndex.value = Math.min(Math.max(index, 0), bars.value.length - 1);
}

function onPointerLeave(): void {
  hoverIndex.value = -1;
}
</script>

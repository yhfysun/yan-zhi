<template>
  <section class="market-pulse" aria-labelledby="market-pulse-title">
    <header class="market-pulse-head">
      <div class="market-heading">
        <span class="market-live-dot" aria-hidden="true"></span>
        <h2 id="market-pulse-title">行情</h2>
      </div>
      <span v-if="market" class="market-updated" :class="{ stale: market.stale }">
        {{ market.stale ? '缓存 · ' : '' }}{{ formatTime(market.updatedAt) }}
      </span>
    </header>

    <div v-if="loading && !market" class="market-skeleton" aria-label="正在加载行情">
      <span v-for="index in 4" :key="index" />
    </div>

    <div v-else-if="error && !market" class="market-error" role="status">
      <WifiOff :size="18" />
      <p>行情暂时不可用</p>
      <button type="button" @click="emit('retry')">重新加载</button>
    </div>

    <template v-else-if="market">
      <div class="market-index-list">
        <div v-for="quote in market.indices" :key="quote.code" class="market-index">
          <span class="market-quote-name">{{ quote.name }}</span>
          <strong>{{ formatPrice(quote.price) }}</strong>
          <span class="market-change" :class="direction(quote.change)">
            {{ signedPercent(quote.changePercent) }}
          </span>
          <Sparkline :points="quote.points" :positive="quote.change >= 0" />
        </div>
      </div>

      <div class="market-watch-head">
        <h3>自选</h3>
        <span>{{ market.source }}</span>
      </div>
      <div class="market-watch-list">
        <div v-for="quote in market.watchlist" :key="quote.code" class="market-watch-row">
          <div class="market-watch-name">
            <strong>{{ quote.name }}</strong>
            <small>{{ quote.code.slice(2) }}</small>
          </div>
          <Sparkline :points="quote.points" :positive="quote.change >= 0" compact />
          <div class="market-watch-price">
            <strong>{{ formatPrice(quote.price) }}</strong>
            <span :class="direction(quote.change)">{{ signedPercent(quote.changePercent) }}</span>
          </div>
        </div>
      </div>
      <p class="market-disclaimer">行情仅作信息参考，不构成投资建议。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { WifiOff } from 'lucide-vue-next';
import type { NewsMarketResult } from '@yan-zhi/shared';
import Sparkline from './Sparkline.vue';

defineProps<{
  market: NewsMarketResult | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (event: 'retry'): void;
}>();

function direction(value: number): 'up' | 'down' | 'flat' {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
}

function formatPrice(value: number): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
</script>

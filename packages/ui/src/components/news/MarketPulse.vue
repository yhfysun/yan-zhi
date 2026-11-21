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
      <button type="button" class="market-open-list" @click="emit('open-list')">全部 ›</button>
    </header>

    <div v-if="loading && !market" class="market-skeleton" aria-label="正在加载行情">
      <span v-for="index in 4" :key="index" />
    </div>

    <div v-else-if="error && !market" class="market-error" role="status">
      <WifiOff :size="18" />
      <p>行情暂时不可用</p>
      <button type="button" @click="emit('retry')">重新加载</button>
    </div>

    <template v-else-if="market && market.groups.length">
      <!-- 分组切换：A股指数 / 热门A股 / 港股 / 贵金属…（面板窄，可横向滚动，桌面支持拖拽） -->
      <div ref="groupTabsEl" class="market-group-tabs" role="tablist" aria-label="行情分组">
        <button
          v-for="group in market.groups"
          :key="group.id"
          type="button"
          role="tab"
          class="market-group-tab"
          :class="{ active: activeGroupId === group.id }"
          :aria-selected="activeGroupId === group.id"
          @click="activeGroupId = group.id"
        >
          {{ group.label }}
        </button>
      </div>

      <div ref="watchListEl" class="market-watch-list">
        <button
          v-for="quote in activeGroup?.quotes || []"
          :key="quote.code"
          type="button"
          class="market-watch-row market-quote-row"
          @click="emit('select', quote.code, quote.name)"
        >
          <div class="market-watch-name">
            <strong>{{ quote.name }}</strong>
            <small>{{ quote.code.replace(/^(sh|sz|hk|c)/, '') }}</small>
          </div>
          <div class="market-watch-price">
            <strong>{{ formatPrice(quote.price) }}</strong>
            <span :class="direction(quote.change)">{{ signedPercent(quote.changePercent) }}</span>
          </div>
        </button>
      </div>
      <p class="market-disclaimer">点按任一品种可查看 K 线详情 · 行情仅作信息参考，不构成投资建议。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { WifiOff } from 'lucide-vue-next';
import type { NewsMarketResult } from '@yan-zhi/shared';
import { useDragScroll } from '../../composables/useDragScroll';

const props = defineProps<{
  market: NewsMarketResult | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (event: 'retry'): void;
  (event: 'select', code: string, name: string): void;
  (event: 'open-list'): void;
}>();

const activeGroupId = ref<string>('');

// 分组页签与品种横条在窄面板里会溢出横向滚动：补齐桌面端鼠标拖拽（触摸原生可滑）
const groupTabsEl = ref<HTMLElement | null>(null);
const watchListEl = ref<HTMLElement | null>(null);
useDragScroll(groupTabsEl);
useDragScroll(watchListEl);

// 默认选中第一个分组；行情数据更新后若当前分组消失则回退到第一个
watch(() => props.market, (market) => {
  if (!market?.groups.length) return;
  if (!market.groups.some((group) => group.id === activeGroupId.value)) {
    activeGroupId.value = market.groups[0].id;
  }
}, { immediate: true });

const activeGroup = computed(() => props.market?.groups.find((group) => group.id === activeGroupId.value));

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

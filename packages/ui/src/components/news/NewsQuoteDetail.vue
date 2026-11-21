<template>
  <section class="news-quote-detail" aria-label="行情详情">
    <header class="news-quote-head">
      <button type="button" class="news-quote-back" :aria-label="view === 'chart' && chartFromList ? '返回列表' : '关闭'" @click="onBack">
        <ArrowLeft :size="20" />
      </button>
      <div class="news-quote-title">
        <strong>{{ view === 'chart' ? (detail?.quote.name || quoteName) : '行情列表' }}</strong>
        <span v-if="view === 'chart'">{{ quoteCode }}</span>
        <span v-else>全市场 · A股 / 港股 / 美股</span>
      </div>
      <button
        v-if="view === 'chart'"
        type="button"
        class="news-quote-refresh"
        :disabled="loading"
        :aria-label="loading ? '正在刷新' : '刷新'"
        @click="emit('retry')"
      >
        <RefreshCw :size="17" :class="{ spinning: loading }" />
      </button>
    </header>

    <!-- ── 列表视图：搜索 + 分市场全量列表 ── -->
    <template v-if="view === 'list'">
      <div class="news-quote-search news-quote-search-top">
        <input
          v-model="searchQuery"
          type="search"
          class="news-quote-search-input"
          placeholder="搜索代码或名称，如 600519 / 茅台 / NVDA"
          aria-label="搜索行情"
          @input="onSearchInput"
        />
        <p v-if="searching" class="news-quote-search-hint">搜索中…</p>
        <p v-else-if="searchError" class="news-quote-search-hint">{{ searchError }}</p>
        <ul v-else-if="searchResults.length" class="news-quote-search-list">
          <li v-for="item in searchResults" :key="item.code">
            <button type="button" class="news-quote-search-item" @click="emit('open-chart', item.code, item.name)">
              <strong>{{ item.name }}</strong>
              <span>{{ item.code }}</span>
              <small>{{ item.market }}</small>
            </button>
          </li>
        </ul>
      </div>

      <div class="news-quote-market-tabs" role="tablist" aria-label="行情市场">
        <button
          v-for="market in LIST_MARKETS"
          :key="market.id"
          type="button"
          role="tab"
          class="market-group-tab"
          :class="{ active: listMarket === market.id }"
          :aria-selected="listMarket === market.id"
          @click="switchListMarket(market.id)"
        >
          {{ market.label }}
        </button>
      </div>

      <div class="news-quote-stocklist">
        <button
          v-for="quote in listItems"
          :key="quote.code"
          type="button"
          class="market-quote-row"
          @click="emit('open-chart', quote.code, quote.name)"
        >
          <div class="market-watch-name">
            <strong>{{ quote.name }}</strong>
            <small>{{ quote.code.replace(/^(sh|sz|hk|us)/, '') }}</small>
          </div>
          <div class="market-watch-price">
            <strong>{{ formatPrice(quote.price) }}</strong>
            <span :class="direction(quote.change)">{{ signedPercent(quote.changePercent) }}</span>
          </div>
        </button>

        <p v-if="listLoading && !listItems.length" class="news-quote-empty">正在加载列表…</p>
        <p v-else-if="listError && !listItems.length" class="news-quote-empty">{{ listError }}</p>
        <p v-else-if="!listItems.length" class="news-quote-empty">暂无数据</p>

        <button
          v-if="listHasMore"
          type="button"
          class="news-quote-more"
          :disabled="listLoading"
          @click="loadListPage(listPn + 1)"
        >
          {{ listLoading ? '加载中…' : '加载更多' }}
        </button>
      </div>

      <p class="news-quote-disclaimer">行情仅作信息参考，不构成投资建议。</p>
    </template>

    <!-- ── K 线视图 ── -->
    <template v-else>
      <div v-if="loading && !detail" class="news-quote-loading" role="status">
        <span class="news-quote-spinner" aria-hidden="true"></span>
        <p>正在加载行情…</p>
      </div>

      <div v-else-if="error && !detail" class="news-quote-error" role="status">
        <WifiOff :size="18" />
        <p>{{ error }}</p>
        <button type="button" @click="emit('retry')">重新加载</button>
      </div>

      <template v-else-if="detail">
        <div class="news-quote-snapshot">
          <strong class="news-quote-price" :class="direction(detail.quote.change)">
            {{ formatPrice(detail.quote.price) }}
          </strong>
          <div class="news-quote-changes">
            <span :class="direction(detail.quote.change)">
              {{ signedChange(detail.quote.change) }}（{{ signedPercent(detail.quote.changePercent) }}）
            </span>
            <span>昨收 {{ formatPrice(detail.quote.previousClose) }}</span>
          </div>
          <span class="news-quote-source">
            {{ detail.source }} · {{ formatTime(detail.quote.updatedAt) }}
          </span>
        </div>

        <NewsKline v-if="detail.kline.length" :bars="detail.kline" />
        <p v-else class="news-quote-empty">暂无 K 线数据，可稍后刷新重试。</p>

        <!-- 页内搜索：任意 A股 / 港股 / 美股 代码或名称 -->
        <div class="news-quote-search">
          <input
            v-model="searchQuery"
            type="search"
            class="news-quote-search-input"
            placeholder="搜索代码或名称，如 600519 / 茅台 / NVDA"
            aria-label="搜索行情"
            @input="onSearchInput"
          />
          <p v-if="searching" class="news-quote-search-hint">搜索中…</p>
          <p v-else-if="searchError" class="news-quote-search-hint">{{ searchError }}</p>
          <ul v-else-if="searchResults.length" class="news-quote-search-list">
            <li v-for="item in searchResults" :key="item.code">
              <button type="button" class="news-quote-search-item" @click="emit('open-chart', item.code, item.name)">
                <strong>{{ item.name }}</strong>
                <span>{{ item.code }}</span>
                <small>{{ item.market }}</small>
              </button>
            </li>
          </ul>
        </div>

        <p class="news-quote-disclaimer">行情仅作信息参考，不构成投资建议。</p>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ArrowLeft, RefreshCw, WifiOff } from 'lucide-vue-next';
import type { MarketQuote, QuoteDetail, QuoteListPage, QuoteSearchResult } from '@yan-zhi/shared';
import { api } from '../../api/client';
import NewsKline from './NewsKline.vue';

const props = defineProps<{
  /** 打开弹层时的初始视图：list = 全市场列表，chart = 直接看某只 K 线。 */
  initialView: 'list' | 'chart';
  quoteCode: string;
  quoteName: string;
  detail: QuoteDetail | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'retry'): void;
  (event: 'open-chart', code: string, name: string): void;
}>();

const view = ref<'list' | 'chart'>(props.initialView);
// 从列表进过 K 线后，返回键/返回按钮先回列表而不是关弹层
let chartFromList = false;

watch(() => props.initialView, (next) => {
  view.value = next;
  if (next === 'list') chartFromList = false;
});

watch(() => props.detail, (detail) => {
  // 新的行情数据到位（无论是重试还是换品种）都落回 K 线视图
  if (detail && props.quoteCode) view.value = 'chart';
});

const LIST_MARKETS = [
  { id: 'cn', label: 'A股' },
  { id: 'hk', label: '港股' },
  { id: 'us', label: '美股' },
] as const;

const listMarket = ref<'cn' | 'hk' | 'us'>('cn');
const listItems = ref<MarketQuote[]>([]);
const listPn = ref(1);
const listHasMore = ref(false);
const listLoading = ref(false);
const listError = ref('');
let listSeq = 0;

const searchQuery = ref('');
const searchResults = ref<QuoteSearchResult[]>([]);
const searching = ref(false);
const searchError = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;

watch(() => props.quoteCode, () => {
  // 换了品种（列表点选/搜索点选/重试）→ 进 K 线视图；若此前在列表，返回时回列表
  if (props.quoteCode) {
    if (view.value === 'list') chartFromList = true;
    view.value = 'chart';
  }
});

async function switchListMarket(market: 'cn' | 'hk' | 'us'): Promise<void> {
  if (listMarket.value === market) return;
  listMarket.value = market;
  listItems.value = [];
  await loadListPage(1);
}

async function loadListPage(pn: number): Promise<void> {
  const seq = ++listSeq;
  listLoading.value = true;
  listError.value = '';
  try {
    const result = await api.get<QuoteListPage>(`/news/quote/list?market=${listMarket.value}&pn=${pn}`);
    if (seq !== listSeq) return;
    const page = 'data' in result ? result.data : null;
    if (!page) return;
    listItems.value = pn === 1 ? page.items : [...listItems.value, ...page.items];
    listPn.value = page.pn;
    listHasMore.value = page.hasMore;
  } catch (error) {
    if (seq !== listSeq) return;
    listError.value = error instanceof Error ? error.message : '股票列表加载失败';
  } finally {
    if (seq === listSeq) listLoading.value = false;
  }
}

function onBack(): void {
  if (view.value === 'chart' && chartFromList) {
    view.value = 'list';
    return;
  }
  emit('close');
}

function onSearchInput(): void {
  if (searchTimer) clearTimeout(searchTimer);
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    searchError.value = '';
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(() => void runSearch(query), 350);
}

async function runSearch(query: string): Promise<void> {
  const seq = ++searchSeq;
  try {
    const result = await api.get<QuoteSearchResult[]>(`/news/quote/search?q=${encodeURIComponent(query)}`);
    if (seq !== searchSeq) return;
    searchResults.value = 'data' in result ? result.data : [];
    searchError.value = '';
  } catch (error) {
    if (seq !== searchSeq) return;
    searchResults.value = [];
    searchError.value = error instanceof Error ? error.message : '搜索失败';
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
}

function direction(value: number): 'up' | 'down' | 'flat' {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
}

function formatPrice(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedChange(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatTime(value: number): string {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// 首次挂载/切到列表视图时加载第一页
watch(view, (next) => {
  if (next === 'list' && !listItems.value.length) void loadListPage(1);
}, { immediate: true });
</script>

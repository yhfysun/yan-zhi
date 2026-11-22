<template>
  <section class="news-quote-detail" :class="{ 'is-wide': wide }">
    <header class="news-quote-head">
      <button
        type="button"
        class="news-quote-back"
        :aria-label="backLabel"
        @click="onBack"
      >
        <ArrowLeft :size="20" />
      </button>
      <div class="news-quote-title">
        <strong>{{ wide ? mainTitle : (view === 'chart' ? mainTitle : '行情列表') }}</strong>
        <span v-if="wide ? !!quoteCode : view === 'chart'">{{ quoteCode }}</span>
        <span v-else>全市场 · A股 / 港股 / 美股</span>
      </div>
      <button
        type="button"
        class="news-quote-cmp-toggle"
        :class="{ active: compareMode }"
        :aria-pressed="compareMode"
        :aria-label="compareMode ? '退出对比模式' : '多股对比'"
        :title="compareMode ? '退出对比模式' : '多股对比'"
        @click="toggleCompareMode"
      >
        <GitCompare :size="17" />
      </button>
      <button
        v-if="!compareMode && (wide ? !!quoteCode : view === 'chart')"
        type="button"
        class="news-quote-refresh"
        :disabled="loading"
        :aria-label="loading ? '正在刷新' : '刷新'"
        @click="emit('retry')"
      >
        <RefreshCw :size="17" :class="{ spinning: loading }" />
      </button>
    </header>

    <div class="news-quote-body">
      <!-- ── 列表栏：搜索 + 分市场全量列表。桌面端常驻左栏；移动端仅列表视图显示 ── -->
      <aside v-show="wide || view === 'list'" class="news-quote-side">
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
              <button
                type="button"
                class="news-quote-search-item"
                :class="{ 'in-compare': compareMode && isComparing(item.code) }"
                @click="onPickStock(item.code, item.name)"
              >
                <strong>{{ item.name }}</strong>
                <span>{{ item.code }}</span>
                <small>{{ item.market }}</small>
              </button>
            </li>
          </ul>
        </div>

        <div ref="marketTabsEl" class="news-quote-market-tabs" role="tablist" aria-label="行情市场">
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
            :class="{ 'in-compare': compareMode && isComparing(quote.code) }"
            @click="onPickStock(quote.code, quote.name)"
          >
            <div class="market-watch-name">
              <strong>{{ quote.name }}</strong>
              <small>{{ quote.code.replace(/^(sh|sz|hk|us|c)/, '') }}</small>
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
      </aside>

      <!-- ── K 线栏：桌面端常驻右栏；移动端仅图表视图显示 ── -->
      <div v-show="wide || view === 'chart'" class="news-quote-main">
        <!-- 多股对比模式：归一化走势叠加 -->
        <template v-if="compareMode">
          <div v-if="compareItems.length" class="news-cmp-strip">
            <span
              v-for="item in compareItems"
              :key="item.code"
              class="news-cmp-chip"
              :class="{ pending: item.loading }"
            >
              <i class="news-cmp-dot" :style="{ background: item.color }" />
              {{ item.name }}{{ item.loading ? '…' : '' }}
              <button type="button" :aria-label="`移除 ${item.name}`" @click="toggleCompare(item.code, item.name)">×</button>
            </span>
            <button type="button" class="news-cmp-clear" @click="clearCompare">清空</button>
          </div>
          <p v-if="compareNotice" class="news-quote-empty">{{ compareNotice }}</p>
          <p v-if="!compareItems.length" class="news-quote-empty news-quote-main-empty">
            {{ wide ? '在左侧列表点选品种加入对比。' : '按「返回列表」点选品种加入对比。' }}
          </p>
          <NewsCompareChart :series="compareItems" />
        </template>

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
          </template>

          <p v-else class="news-quote-empty news-quote-main-empty">从左侧选择品种查看 K 线详情。</p>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeft, GitCompare, RefreshCw, WifiOff } from 'lucide-vue-next';
import type { KlineBar, MarketQuote, QuoteDetail, QuoteListPage, QuoteSearchResult } from '@yan-zhi/shared';
import { api } from '../../api/client';
import { useDragScroll } from '../../composables/useDragScroll';
import NewsCompareChart from './NewsCompareChart.vue';
import NewsKline from './NewsKline.vue';

const props = defineProps<{
  /** 打开弹层时的初始视图：list = 全市场列表，chart = 直接看某只 K 线。 */
  initialView: 'list' | 'chart';
  quoteCode: string;
  quoteName: string;
  detail: QuoteDetail | null;
  loading: boolean;
  error: string;
  /** 桌面宽屏（≥901px）：左右两栏布局，列表常驻，返回键直接关闭弹层。 */
  wide?: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'retry'): void;
  (event: 'open-chart', code: string, name: string): void;
}>();

const view = ref<'list' | 'chart'>(props.initialView);
// 从列表进过 K 线后，返回键/返回按钮先回列表而不是关弹层（移动端专属语义；
// 桌面端列表常驻左栏，返回一律直接关闭）
let chartFromList = false;

const mainTitle = computed(() => props.detail?.quote.name || props.quoteName || '行情列表');
const backLabel = computed(() => {
  if (props.wide) return '关闭';
  return view.value === 'chart' && chartFromList ? '返回列表' : '关闭';
});

// 市场页签横向滚动补齐鼠标拖拽（桌面 Shift+滚轮可用但拖动无效，用户实报）
const marketTabsEl = ref<HTMLElement | null>(null);
useDragScroll(marketTabsEl);

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
  { id: 'crypto', label: '虚拟币' },
] as const;

const listMarket = ref<'cn' | 'hk' | 'us' | 'crypto'>('cn');
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
  // 换了品种（列表点选/搜索点选/重试）→ 移动端进 K 线视图。
  // ★ chartFromList 必须无条件置位：initialView 的 watch 先行把 view 切成 'chart'，
  //   这里若再判 `view.value === 'list'` 就永远轮不到（2026-11-21 用户实报
  //   「返回按钮直接回资讯首页，不是行情列表」的根因就是这条顺序依赖）。
  if (props.quoteCode && !props.wide) {
    chartFromList = true;
    view.value = 'chart';
  }
});

async function switchListMarket(market: 'cn' | 'hk' | 'us' | 'crypto'): Promise<void> {
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
    // 错误信封（HTTP 200 + {error}）不能吞成「暂无数据」——上游行情源挂掉要让用户看见原因
    if ('error' in result) {
      listError.value = result.error || '股票列表加载失败';
      return;
    }
    const page = result.data;
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
  if (!props.wide && view.value === 'chart' && chartFromList) {
    view.value = 'list';
    return;
  }
  emit('close');
}

// ── 多股对比：对比模式下点选列表/搜索品种加入，最多 10 只，走势按首日收盘归一化叠加。
//    不同市场交易日不完全对齐，横轴按各自 K 线序号对齐（近似），v1 口径。
const COMPARE_MAX = 10;
const COMPARE_COLORS = [
  '#1971c2', '#f08c00', '#ae3ec9', '#0ca678', '#e03131',
  '#1098ad', '#d6336c', '#74b816', '#6741d9', '#a87900',
];

interface CompareItem {
  code: string;
  name: string;
  color: string;
  bars: KlineBar[];
  loading: boolean;
}

const compareMode = ref(false);
const compareItems = ref<CompareItem[]>([]);
const compareNotice = ref('');
let compareReqSeq = 0;

function toggleCompareMode(): void {
  compareMode.value = !compareMode.value;
  if (!compareMode.value) clearCompare();
}

function clearCompare(): void {
  compareItems.value = [];
  compareNotice.value = '';
  compareReqSeq += 1;
}

function isComparing(code: string): boolean {
  return compareItems.value.some((item) => item.code === code);
}

async function toggleCompare(code: string, name: string): Promise<void> {
  compareNotice.value = '';
  const existing = compareItems.value.find((item) => item.code === code);
  if (existing) {
    compareItems.value = compareItems.value.filter((item) => item.code !== code);
    return;
  }
  if (compareItems.value.length >= COMPARE_MAX) {
    compareNotice.value = `最多同时对比 ${COMPARE_MAX} 个品种，先移除一个再试。`;
    return;
  }
  const color = COMPARE_COLORS[compareItems.value.length % COMPARE_COLORS.length];
  compareItems.value = [...compareItems.value, { code, name, color, bars: [], loading: true }];
  // ★ 移动端：加入品种后自动切到图表视图 —— 图表栏是 `v-show="wide || view==='chart'"`，
  //   停在列表视图时选完对比什么都看不到（2026-11-21 用户实报「多选后看不了图」）。
  //   chartFromList 置位保证返回键先回列表继续加/移除品种。
  if (!props.wide && view.value === 'list') {
    chartFromList = true;
    view.value = 'chart';
  }
  const seq = ++compareReqSeq;
  try {
    const result = await api.get<QuoteDetail>(`/news/quote?code=${encodeURIComponent(code)}`);
    if (seq !== compareReqSeq) return;
    if ('error' in result) throw new Error(result.error || '行情加载失败');
    compareItems.value = compareItems.value.map((item) =>
      item.code === code ? { ...item, bars: result.data.kline, loading: false } : item,
    );
  } catch (error) {
    if (seq !== compareReqSeq) return;
    compareItems.value = compareItems.value.filter((item) => item.code !== code);
    compareNotice.value = error instanceof Error ? error.message : '该品种走势加载失败';
  }
}

/** 对比模式下点选 = 加入/移除对比；普通模式 = 切换 K 线 */
function onPickStock(code: string, name: string): void {
  if (compareMode.value) {
    void toggleCompare(code, name);
    return;
  }
  emit('open-chart', code, name);
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
    if ('error' in result) {
      searchResults.value = [];
      searchError.value = result.error || '搜索失败';
      return;
    }
    searchResults.value = result.data;
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

// 首次挂载/切到列表视图时加载第一页；桌面端列表常驻，挂载即加载
watch([view, () => props.wide], ([next, wide]) => {
  if ((next === 'list' || wide) && !listItems.value.length) void loadListPage(1);
}, { immediate: true });
</script>

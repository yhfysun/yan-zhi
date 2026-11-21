<template>
  <div class="news-page">
    <h1 class="news-sr-only">资讯中心</h1>

    <nav class="news-category-bar" aria-label="资讯频道">
      <div class="news-category-scroll" role="tablist" aria-label="资讯分类">
        <button
          v-for="category in categories"
          :key="category.key"
          type="button"
          class="news-category"
          :class="{ active: activeCategory === category.key }"
          :aria-selected="activeCategory === category.key"
          role="tab"
          @click="selectCategory(category.key)"
        >
          {{ category.label }}
        </button>
      </div>
      <div class="news-channel-meta">
        <span class="news-channel-date">{{ briefDate }}</span>
        <span class="news-channel-update" :class="{ stale: feed?.stale }">{{ updateLabel }}</span>
        <button
          type="button"
          class="news-channel-refresh"
          :disabled="refreshing"
          :aria-label="refreshing ? '正在刷新资讯' : '刷新资讯'"
          @click="refreshAll"
        >
          <RefreshCw :size="17" :class="{ spinning: refreshing }" />
        </button>
      </div>
    </nav>

    <div class="news-layout">
      <div class="news-feed-panel">
        <NewsFeedList
          :items="feed?.items || []"
          :selected-id="selectedItem?.id || ''"
          :loading="feedLoading"
          :error="feedError"
          :top-mode="activeCategory === 'top'"
          :covers="coverById"
          @select="selectArticle"
          @retry="loadFeed(activeCategory, true)"
        />
      </div>

      <!-- 桌面宽屏：行情工作台内嵌中间栏（替代文章面板），不再用弹窗 -->
      <section v-if="isWideLayout" class="news-detail-panel" aria-label="资讯正文">
        <NewsQuoteDetail
          v-if="activeQuote"
          class="news-quote-embedded"
          :initial-view="quoteInitialView"
          :quote-code="activeQuote.code"
          :quote-name="activeQuote.name"
          :detail="quoteDetail"
          :loading="quoteLoading"
          :error="quoteError"
          :wide="true"
          @close="dismissMobileQuote"
          @retry="openQuote(activeQuote.code, activeQuote.name)"
          @open-chart="openQuote"
        />
        <NewsArticleReader
          v-else
          :item="selectedItem"
          :article="article"
          :loading="articleLoading"
          :error="articleError"
          @close="closeArticle"
          @retry="selectedItem && openArticle(selectedItem, true)"
        />
      </section>

      <aside class="news-market-panel">
        <MarketPulse
          :market="market"
          :loading="marketLoading"
          :error="marketError"
          @retry="loadMarket(true)"
          @select="openQuote"
          @open-list="openQuoteList"
        />
        <NewsSectorPanel
          :snapshot="sector"
          :loading="sectorLoading"
          :error="sectorError"
          @retry="loadSector(true)"
          @select="openQuote"
        />
      </aside>
    </div>

    <Teleport to="body">
      <section
        v-if="!isWideLayout && selectedItem"
        ref="mobileReaderRoot"
        class="news-mobile-reader"
        role="dialog"
        aria-modal="true"
        :aria-label="`阅读：${selectedItem.title}`"
      >
        <NewsArticleReader
          :item="selectedItem"
          :article="article"
          :loading="articleLoading"
          :error="articleError"
          @close="dismissMobileReader"
          @retry="openArticle(selectedItem, true)"
        />
      </section>

      <!-- 行情详情（K 线）：移动端全屏弹层（≤900px）；桌面端已改为内嵌中间栏，不走弹层 -->
      <section
        v-if="activeQuote && !isWideLayout"
        class="news-quote-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="`行情详情：${activeQuote.name}`"
      >
        <NewsQuoteDetail
          :initial-view="quoteInitialView"
          :quote-code="activeQuote.code"
          :quote-name="activeQuote.name"
          :detail="quoteDetail"
          :loading="quoteLoading"
          :error="quoteError"
          :wide="isWideLayout"
          @close="dismissMobileQuote"
          @retry="openQuote(activeQuote.code, activeQuote.name)"
          @open-chart="openQuote"
        />
      </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import type {
  NewsArticle,
  NewsCategory,
  NewsFeedResult,
  NewsItem,
  NewsMarketResult,
  QuoteDetail,
  SectorSnapshot,
} from '@yan-zhi/shared';
import { api } from '../api/client';
import NewsFeedList from '../components/news/NewsFeedList.vue';
import NewsArticleReader from '../components/news/NewsArticleReader.vue';
import MarketPulse from '../components/news/MarketPulse.vue';
import NewsQuoteDetail from '../components/news/NewsQuoteDetail.vue';
import NewsSectorPanel from '../components/news/NewsSectorPanel.vue';

type ApiResult<T> = { data: T } | { error: string };

const categories: Array<{ key: NewsCategory; label: string }> = [
  { key: 'top', label: '推荐' },
  { key: 'domestic', label: '国内' },
  { key: 'world', label: '国际' },
  { key: 'finance', label: '财经' },
  { key: 'society', label: '社会' },
  { key: 'tech', label: '科技' },
  { key: 'game', label: '游戏' },
  { key: 'sports', label: '体育' },
  { key: 'culture', label: '文化' },
  { key: 'edu', label: '教育' },
  { key: 'health', label: '健康' },
  { key: 'chinese', label: '华人' },
];

const activeCategory = ref<NewsCategory>('top');
const feed = ref<NewsFeedResult | null>(null);
const feedLoading = ref(false);
const feedError = ref('');
const selectedItem = ref<NewsItem | null>(null);
const article = ref<NewsArticle | null>(null);
const articleLoading = ref(false);
const articleError = ref('');
const market = ref<NewsMarketResult | null>(null);
const marketLoading = ref(false);
const marketError = ref('');
const sector = ref<SectorSnapshot | null>(null);
const sectorLoading = ref(false);
const sectorError = ref('');
const refreshing = ref(false);
const activeQuote = ref<{ code: string; name: string } | null>(null);
const quoteInitialView = ref<'list' | 'chart'>('list');
const quoteDetail = ref<QuoteDetail | null>(null);
const quoteLoading = ref(false);
const quoteError = ref('');
const feedCache = new Map<NewsCategory, NewsFeedResult>();
const articleCache = new Map<string, NewsArticle>();
const articlePromises = new Map<string, Promise<NewsArticle>>();
const coverById = ref<Record<string, string>>({});
const userSelectedArticle = ref(false);
let articleRequestId = 0;
const media = typeof window !== 'undefined' ? window.matchMedia('(min-width: 901px)') : null;
const isWideLayout = ref(media?.matches ?? true);
const mobileReaderRoot = ref<HTMLElement | null>(null);
let readerHistoryPushed = false;
let quoteRequestId = 0;
/** 行情弹层压入的历史层级：0=无，1=列表/直达K线，2=列表→K线（移动端逐级返回用） */
let quoteHistoryDepth = 0;
/** 原生返回链路手动 back() 消费 K 线层条目时，跳过随之而来的那次 popstate */
let quoteIgnoreNextPop = false;
let shellLock: {
  element: HTMLElement;
  ariaHidden: string | null;
  bodyOverflow: string;
} | null = null;

const briefDate = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
}).format(new Date());

const updateLabel = computed(() => {
  if (!feed.value) return '更新中';
  const failed = feed.value.sources.filter((source) => source.status === 'error').length;
  const time = new Date(feed.value.updatedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return failed ? `${time} · 缓存` : `${time} 更新`;
});

function dataOrThrow<T>(result: ApiResult<T>): T {
  if ('error' in result) throw new Error(result.error);
  return result.data;
}

async function loadFeed(category: NewsCategory, force = false): Promise<void> {
  const cached = feedCache.get(category);
  if (!force && cached) {
    feed.value = cached;
    selectDesktopLead(category, cached.items);
    return;
  }
  feedLoading.value = true;
  feedError.value = '';
  try {
    const result = await api.get<NewsFeedResult>(
      `/news/feed?category=${category}${force ? '&refresh=1' : ''}`,
    );
    const nextFeed = dataOrThrow(result as ApiResult<NewsFeedResult>);
    feedCache.set(category, nextFeed);
    if (activeCategory.value === category) {
      feed.value = nextFeed;
      selectDesktopLead(category, nextFeed.items);
    }
  } catch (error) {
    feedError.value = error instanceof Error ? error.message : '资讯加载失败';
  } finally {
    feedLoading.value = false;
  }
}

async function loadMarket(force = false): Promise<void> {
  marketLoading.value = true;
  marketError.value = '';
  try {
    const result = await api.get<NewsMarketResult>(`/news/market${force ? '?refresh=1' : ''}`);
    market.value = dataOrThrow(result as ApiResult<NewsMarketResult>);
  } catch (error) {
    marketError.value = error instanceof Error ? error.message : '行情加载失败';
  } finally {
    marketLoading.value = false;
  }
}

async function loadSector(force = false): Promise<void> {
  sectorLoading.value = true;
  sectorError.value = '';
  try {
    const result = await api.get<SectorSnapshot>(`/news/sector${force ? '?refresh=1' : ''}`);
    sector.value = dataOrThrow(result as ApiResult<SectorSnapshot>);
  } catch (error) {
    sectorError.value = error instanceof Error ? error.message : '行业板块加载失败';
  } finally {
    sectorLoading.value = false;
  }
}

function selectCategory(category: NewsCategory): void {
  if (activeCategory.value === category) return;
  activeCategory.value = category;
  userSelectedArticle.value = false;
  feed.value = feedCache.get(category) || null;
  closeArticle();
  void loadFeed(category);
}

async function fetchArticle(item: NewsItem, force = false): Promise<NewsArticle> {
  if (!force) {
    const cached = articleCache.get(item.url);
    if (cached) return cached;
    const pending = articlePromises.get(item.url);
    if (pending) return pending;
  }

  const promise = (async () => {
    const result = await api.get<NewsArticle>(
      `/news/article?url=${encodeURIComponent(item.url)}${force ? '&refresh=1' : ''}`,
    );
    const nextArticle = dataOrThrow(result as ApiResult<NewsArticle>);
    articleCache.set(item.url, nextArticle);
    if (nextArticle.coverImage) {
      coverById.value = { ...coverById.value, [item.id]: nextArticle.coverImage };
    }
    return nextArticle;
  })();
  articlePromises.set(item.url, promise);
  try {
    return await promise;
  } finally {
    if (articlePromises.get(item.url) === promise) articlePromises.delete(item.url);
  }
}

async function preloadStoryCovers(items: NewsItem[]): Promise<void> {
  const pending = items
    .slice(0, 3)
    .filter((item) => !coverById.value[item.id]);
  if (!pending.length) return;
  await Promise.allSettled(pending.map((item) => fetchArticle(item)));
}

function coverLead(items: NewsItem[]): NewsItem | null {
  return items.slice(0, 3).find((item) => coverById.value[item.id]) || items[0] || null;
}

function selectArticle(item: NewsItem): void {
  userSelectedArticle.value = true;
  // 桌面宽屏时行情工作台占据中间栏：选了新文章就把行情视图收回去
  if (activeQuote.value) dismissMobileQuote();
  void openArticle(item);
}

function selectDesktopLead(category: NewsCategory, items: NewsItem[]): void {
  void preloadStoryCovers(items).then(() => {
    if (
      !isWideLayout.value
      || userSelectedArticle.value
      || activeCategory.value !== category
    ) return;
    const lead = coverLead(items);
    if (lead && selectedItem.value?.id !== lead.id) void openArticle(lead);
  });
}

async function openArticle(item: NewsItem, force = false): Promise<void> {
  const requestId = ++articleRequestId;
  selectedItem.value = item;
  pushReaderHistory();
  article.value = null;
  articleError.value = '';
  articleLoading.value = true;
  try {
    const nextArticle = await fetchArticle(item, force);
    if (requestId !== articleRequestId || selectedItem.value?.id !== item.id) return;
    article.value = nextArticle;
  } catch (error) {
    if (requestId !== articleRequestId || selectedItem.value?.id !== item.id) return;
    articleError.value = error instanceof Error ? error.message : '正文加载失败';
  } finally {
    if (requestId === articleRequestId) articleLoading.value = false;
  }
}

function closeArticle(): void {
  articleRequestId += 1;
  selectedItem.value = null;
  article.value = null;
  articleError.value = '';
  articleLoading.value = false;
}

function readerHistoryState(): Record<string, unknown> {
  const state = window.history.state;
  return state && typeof state === 'object' ? { ...state } : {};
}

function pushReaderHistory(): void {
  if (isWideLayout.value || readerHistoryPushed || typeof window === 'undefined') return;
  window.history.pushState({ ...readerHistoryState(), yzNewsReader: true }, '', window.location.href);
  readerHistoryPushed = true;
}

function clearReaderHistoryMarker(): void {
  if (!readerHistoryPushed || typeof window === 'undefined') return;
  const { yzNewsReader: _reader, ...state } = readerHistoryState();
  window.history.replaceState(state, '', window.location.href);
  readerHistoryPushed = false;
}

function pushQuoteHistory(): void {
  // 移动端逐级返回：列表一级、K 线一级。已在两级顶时（列表→K线→按钮返回→列表→再点
  // 另一只股票）不再新增条目，用 replaceState 复用当前条目顶掉旧标记，避免死层级堆积。
  if (quoteHistoryDepth >= 2) {
    window.history.replaceState({ ...readerHistoryState(), yzNewsQuote: true }, '', window.location.href);
    return;
  }
  window.history.pushState({ ...readerHistoryState(), yzNewsQuote: true }, '', window.location.href);
  quoteHistoryDepth += 1;
}

function clearQuoteHistoryMarker(): void {
  if (quoteHistoryDepth <= 0 || typeof window === 'undefined') return;
  const { yzNewsQuote: _quote, ...state } = readerHistoryState();
  window.history.replaceState(state, '', window.location.href);
  quoteHistoryDepth = 0;
}

/**
 * 页面内关闭动作先立即收起正文，再消费掉为详情压入的历史条目。
 * 系统右滑不经过 Capacitor 事件时，会直接 pop 这条记录并由 onPopState 收尾。
 */
function dismissMobileReader(): void {
  if (!selectedItem.value || isWideLayout.value) return;
  const consumeHistory = readerHistoryPushed;
  closeArticle();
  if (consumeHistory) {
    readerHistoryPushed = false;
    window.history.back();
  }
}

function onPopState(): void {
  // 原生返回链路手动 back() 消费层级时，伴随的这次 popstate 直接忽略
  if (quoteIgnoreNextPop) {
    quoteIgnoreNextPop = false;
    return;
  }
  // 行情弹层逐级返回：K 线 → 列表 → 关闭（移动端）。popstate 触发时浏览器
  // 已经回退一级，这里只做视图/状态收尾，绝不再 history.back()。
  if (quoteHistoryDepth > 0 && activeQuote.value) {
    if (quoteHistoryDepth >= 2 && quoteInitialView.value === 'chart') {
      quoteHistoryDepth = 1;
      quoteInitialView.value = 'list'; // NewsQuoteDetail 的 watch 会把视图切回列表
      return;
    }
    quoteHistoryDepth = 0;
    closeQuote();
    return;
  }
  if (!readerHistoryPushed || !selectedItem.value || isWideLayout.value) return;
  readerHistoryPushed = false;
  closeArticle();
}

async function openQuote(code: string, name: string): Promise<void> {
  if (!code) return;
  quoteRequestId += 1;
  const requestId = quoteRequestId;
  const alreadyOpen = !!activeQuote.value;
  const cameFromList = quoteInitialView.value === 'list';
  activeQuote.value = { code, name };
  quoteInitialView.value = 'chart';
  if (!alreadyOpen) {
    pushQuoteHistory(); // 直达 K 线：一级（返回直接关）
  } else if (!isWideLayout.value && cameFromList) {
    // 移动端列表 → K 线：多压一级历史，系统返回逐级走（K线→列表→首页）
    pushQuoteHistory();
  }
  quoteDetail.value = null;
  quoteError.value = '';
  quoteLoading.value = true;
  try {
    const result = await api.get<QuoteDetail>(`/news/quote?code=${encodeURIComponent(code)}`);
    if (requestId !== quoteRequestId) return;
    quoteDetail.value = dataOrThrow(result as ApiResult<QuoteDetail>);
  } catch (error) {
    if (requestId !== quoteRequestId) return;
    quoteError.value = error instanceof Error ? error.message : '行情详情加载失败';
  } finally {
    if (requestId === quoteRequestId) quoteLoading.value = false;
  }
}

/** 打开全市场列表视图（不预选品种）。 */
function openQuoteList(): void {
  const alreadyOpen = !!activeQuote.value;
  activeQuote.value = { code: '', name: '行情列表' };
  quoteInitialView.value = 'list';
  quoteRequestId += 1;
  quoteDetail.value = null;
  quoteError.value = '';
  quoteLoading.value = false;
  if (!alreadyOpen) pushQuoteHistory();
}

function closeQuote(): void {
  quoteRequestId += 1;
  activeQuote.value = null;
  quoteDetail.value = null;
  quoteError.value = '';
  quoteLoading.value = false;
}

/** 行情详情的移动端返回：先收起弹层，再按层级消费掉为它压入的历史条目（与资讯正文同套路）。 */
function dismissMobileQuote(): void {
  if (!activeQuote.value) return;
  const consumeHistory = quoteHistoryDepth;
  closeQuote();
  quoteHistoryDepth = 0;
  for (let i = 0; i < consumeHistory; i += 1) window.history.back();
}

async function refreshAll(): Promise<void> {
  refreshing.value = true;
  try {
    await Promise.all([
      loadFeed(activeCategory.value, true),
      loadMarket(true),
      loadSector(true),
    ]);
  } finally {
    refreshing.value = false;
  }
}

function onWideLayoutChange(event: MediaQueryListEvent): void {
  isWideLayout.value = event.matches;
  if (event.matches && feed.value?.items.length && !selectedItem.value) {
    selectDesktopLead(activeCategory.value, feed.value.items);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (activeQuote.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissMobileQuote();
    }
    return;
  }
  if (!selectedItem.value || isWideLayout.value) return;
  if (event.key === 'Escape') {
    dismissMobileReader();
    return;
  }
  if (event.key !== 'Tab' || !mobileReaderRoot.value) return;
  const focusable = [...mobileReaderRoot.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** 行情弹层逐级返回：K 线层先降回列表，列表层才整层关闭。popstate 与 Android 原生返回共用。 */
function backOutOfQuoteLevel(): void {
  if (quoteHistoryDepth >= 2 && quoteInitialView.value === 'chart') {
    quoteHistoryDepth = 1;
    quoteInitialView.value = 'list'; // NewsQuoteDetail 的 watch 会把视图切回列表
    return;
  }
  dismissMobileQuote();
}

/** Android 手势/返回键先询问页面是否有页内层级；行情详情、资讯正文都在这里关闭弹层。 */
function onMobileBack(event: Event): void {
  if (activeQuote.value) {
    event.preventDefault();
    // 与系统返回（popstate）同口径：K 线 → 列表 → 首页，不再整层跳级。
    // 原生返回链路浏览器指针未动：降级后手动 back() 消费掉 K 线层条目。
    if (quoteHistoryDepth >= 2 && quoteInitialView.value === 'chart') {
      quoteHistoryDepth = 1;
      quoteInitialView.value = 'list';
      quoteIgnoreNextPop = true;
      window.history.back();
      return;
    }
    dismissMobileQuote();
    return;
  }
  if (!selectedItem.value || isWideLayout.value) return;
  event.preventDefault();
  dismissMobileReader();
}

function lockApplicationShell(): void {
  if (shellLock || typeof document === 'undefined') return;
  const element = document.querySelector<HTMLElement>('.app-shell');
  if (!element) return;
  shellLock = {
    element,
    ariaHidden: element.getAttribute('aria-hidden'),
    bodyOverflow: document.body.style.overflow,
  };
  element.setAttribute('inert', '');
  element.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = 'hidden';
}

function unlockApplicationShell(): void {
  if (!shellLock) return;
  const { element, ariaHidden, bodyOverflow } = shellLock;
  element.removeAttribute('inert');
  if (ariaHidden === null) element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden', ariaHidden);
  document.body.style.overflow = bodyOverflow;
  shellLock = null;
}

watch([selectedItem, activeQuote, isWideLayout], async ([item, quote, wide]) => {
  if (wide) clearReaderHistoryMarker();
  // shell 锁定只针对移动端全屏弹层（读者/行情）；桌面端行情是内嵌面板，锁了会压坏布局
  if ((item && !wide) || (quote && !wide)) {
    lockApplicationShell();
    await nextTick();
    if (quote && !wide) {
      document.querySelector<HTMLButtonElement>('.news-quote-overlay .news-quote-back')?.focus();
    } else {
      mobileReaderRoot.value?.querySelector<HTMLButtonElement>('.news-reader-back')?.focus();
    }
  } else {
    unlockApplicationShell();
  }
}, { immediate: true });

onMounted(() => {
  media?.addEventListener('change', onWideLayoutChange);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', onPopState);
  document.addEventListener('yz:mobile-back', onMobileBack);
  void Promise.all([loadFeed('top'), loadMarket(), loadSector()]);
});

onUnmounted(() => {
  unlockApplicationShell();
  media?.removeEventListener('change', onWideLayoutChange);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('popstate', onPopState);
  document.removeEventListener('yz:mobile-back', onMobileBack);
  clearReaderHistoryMarker();
  clearQuoteHistoryMarker();
});
</script>

<style src="./news-app.css"></style>

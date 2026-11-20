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

      <section v-if="isWideLayout" class="news-detail-panel" aria-label="资讯正文">
        <NewsArticleReader
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
} from '@yan-zhi/shared';
import { api } from '../api/client';
import NewsFeedList from '../components/news/NewsFeedList.vue';
import NewsArticleReader from '../components/news/NewsArticleReader.vue';
import MarketPulse from '../components/news/MarketPulse.vue';

type ApiResult<T> = { data: T } | { error: string };

const categories: Array<{ key: NewsCategory; label: string }> = [
  { key: 'top', label: '推荐' },
  { key: 'domestic', label: '国内' },
  { key: 'world', label: '国际' },
  { key: 'finance', label: '财经' },
  { key: 'society', label: '社会' },
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
const refreshing = ref(false);
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
  if (!readerHistoryPushed || !selectedItem.value || isWideLayout.value) return;
  readerHistoryPushed = false;
  closeArticle();
}

async function refreshAll(): Promise<void> {
  refreshing.value = true;
  try {
    await Promise.all([
      loadFeed(activeCategory.value, true),
      loadMarket(true),
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

/** Android 手势/返回键先询问页面是否有页内层级；资讯正文必须在这里关闭弹层。 */
function onMobileBack(event: Event): void {
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

watch([selectedItem, isWideLayout], async ([item, wide]) => {
  if (wide) clearReaderHistoryMarker();
  if (item && !wide) {
    lockApplicationShell();
    await nextTick();
    mobileReaderRoot.value?.querySelector<HTMLButtonElement>('.news-reader-back')?.focus();
  } else {
    unlockApplicationShell();
  }
}, { immediate: true });

onMounted(() => {
  media?.addEventListener('change', onWideLayoutChange);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', onPopState);
  document.addEventListener('yz:mobile-back', onMobileBack);
  void Promise.all([loadFeed('top'), loadMarket()]);
});

onUnmounted(() => {
  unlockApplicationShell();
  media?.removeEventListener('change', onWideLayoutChange);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('popstate', onPopState);
  document.removeEventListener('yz:mobile-back', onMobileBack);
  clearReaderHistoryMarker();
});
</script>

<style src="./news-app.css"></style>

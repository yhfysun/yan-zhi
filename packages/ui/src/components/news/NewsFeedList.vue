<template>
  <section class="news-feed-list" aria-labelledby="news-feed-title">
    <header class="news-feed-head">
      <div class="news-feed-title">
        <span class="news-feed-marker" aria-hidden="true"></span>
        <h2 id="news-feed-title">{{ topMode ? '今日重点' : '最新报道' }}</h2>
      </div>
      <span class="news-feed-count">{{ items.length }} 条</span>
    </header>

    <div v-if="loading && !items.length" class="news-feed-skeleton" aria-label="正在加载资讯">
      <span v-for="index in 5" :key="index" />
    </div>

    <div v-else-if="error && !items.length" class="news-empty" role="status">
      <WifiOff :size="22" />
      <strong>资讯暂时没有连上</strong>
      <p>{{ error }}</p>
      <button type="button" @click="emit('retry')">重新加载</button>
    </div>

    <div v-else-if="!items.length" class="news-empty" role="status">
      <Newspaper :size="22" />
      <strong>暂时没有新内容</strong>
      <p>稍后刷新，或换一个分类看看。</p>
    </div>

    <template v-else>
      <button
        v-if="leadItem"
        type="button"
        class="news-feed-story news-lead-story"
        :class="{ selected: selectedId === leadItem.id, 'has-cover': !!covers[leadItem.id] }"
        @click="emit('select', leadItem)"
      >
        <span v-if="covers[leadItem.id]" class="news-lead-media">
          <img
            class="news-lead-cover"
            :src="covers[leadItem.id]"
            :alt="leadItem.title"
            loading="eager"
            @error="hideBrokenImage"
          >
          <span class="news-lead-badge">热点</span>
        </span>
        <span class="news-lead-copy">
          <span class="news-story-meta">
            <span>{{ leadItem.categoryLabel }}</span>
            <time :datetime="new Date(leadItem.publishedAt).toISOString()">{{ formatTime(leadItem.publishedAt) }}</time>
          </span>
          <span class="news-story-title">{{ leadItem.title }}</span>
          <span v-if="leadItem.summary" class="news-story-summary">{{ leadItem.summary }}</span>
          <span class="news-lead-source">{{ leadItem.source }}</span>
        </span>
      </button>

      <button
        v-for="(item, index) in rowItems"
        :key="item.id"
        type="button"
        class="news-feed-story"
        :class="{
          selected: selectedId === item.id,
          'has-cover': !!covers[item.id],
        }"
        @click="emit('select', item)"
      >
        <span class="news-story-copy">
          <span class="news-story-meta">
            <span>{{ item.categoryLabel }}</span>
            <time :datetime="new Date(item.publishedAt).toISOString()">{{ formatTime(item.publishedAt) }}</time>
          </span>
          <span class="news-story-title">{{ item.title }}</span>
          <span v-if="item.summary && index < 2" class="news-story-summary">{{ item.summary }}</span>
          <span class="news-story-source">{{ item.source }}</span>
        </span>
        <span v-if="covers[item.id]" class="news-story-thumb">
          <img
            :src="covers[item.id]"
            :alt="item.title"
            loading="lazy"
            @error="hideBrokenImage"
          >
        </span>
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Newspaper, WifiOff } from 'lucide-vue-next';
import type { NewsItem } from '@yan-zhi/shared';

const props = defineProps<{
  items: NewsItem[];
  selectedId: string;
  loading: boolean;
  error: string;
  topMode: boolean;
  covers: Record<string, string>;
}>();

const emit = defineEmits<{
  (event: 'select', item: NewsItem): void;
  (event: 'retry'): void;
}>();

const leadItem = computed(() => {
  if (!props.topMode) return null;
  const candidates = props.items.slice(0, 3);
  return candidates.find((item) => props.covers[item.id]) || props.items[0] || null;
});
const rowItems = computed(() => (
  leadItem.value
    ? props.items.filter((item) => item.id !== leadItem.value?.id)
    : props.items
));

function formatTime(value: number): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function hideBrokenImage(event: Event): void {
  const image = event.target as HTMLImageElement;
  const container = image.parentElement;
  if (container) container.style.display = 'none';
}
</script>

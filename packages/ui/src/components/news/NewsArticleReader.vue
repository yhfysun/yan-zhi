<template>
  <article v-if="item" class="news-reader" aria-labelledby="news-reader-title">
    <header class="news-reader-toolbar">
      <button type="button" class="news-reader-back" aria-label="返回资讯列表" @click="emit('close')">
        <ArrowLeft :size="19" />
        <span>返回资讯</span>
      </button>
      <span>{{ item.categoryLabel }}</span>
      <span class="news-reader-source">{{ article?.item.source || item.source }}</span>
    </header>

    <div class="news-reader-scroll" tabindex="0" aria-label="资讯正文内容">
      <header class="news-reader-head">
        <span class="news-reader-label">{{ item.categoryLabel }} · {{ formatDateTime(item.publishedAt) }}</span>
        <h2 id="news-reader-title">{{ article?.item.title || item.title }}</h2>
        <p v-if="item.summary" class="news-reader-dek">{{ item.summary }}</p>
        <div class="news-reader-byline">
          <span>{{ article?.item.source || item.source }}</span>
          <span v-if="article?.contentStatus === 'summary'">来源摘要</span>
        </div>
      </header>

      <div v-if="loading" class="news-reader-skeleton" aria-label="正在整理正文">
        <span v-for="index in 7" :key="index" />
      </div>

      <div v-else-if="error" class="news-reader-error" role="status">
        <WifiOff :size="22" />
        <strong>正文暂时没有取到</strong>
        <p>{{ error }}</p>
        <button type="button" @click="emit('retry')">重新整理正文</button>
      </div>

      <template v-else-if="article">
        <img
          v-if="article.coverImage"
          class="news-reader-cover"
          :src="article.coverImage"
          :alt="article.item.title"
          loading="lazy"
          @error="hideBrokenImage"
        >
        <div class="news-reader-body">
          <template v-for="(block, index) in article.blocks" :key="`${block.type}-${index}`">
            <h2 v-if="block.type === 'heading'">{{ block.text }}</h2>
            <p v-else-if="block.type === 'paragraph'">{{ block.text }}</p>
            <figure v-else>
              <img
                :src="block.src"
                :alt="block.alt || article.item.title"
                loading="lazy"
                @error="hideBrokenImage"
              >
              <figcaption v-if="block.alt">{{ block.alt }}</figcaption>
            </figure>
          </template>
        </div>
        <aside class="news-reader-note">{{ article.copyrightNote }}</aside>
      </template>
    </div>
  </article>

  <div v-else class="news-reader-placeholder">
    <Newspaper :size="28" />
    <strong>选择一条资讯开始阅读</strong>
    <p>正文会在应用内整理成适合长读的排版。</p>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Newspaper, WifiOff } from 'lucide-vue-next';
import type { NewsArticle, NewsItem } from '@yan-zhi/shared';

defineProps<{
  item: NewsItem | null;
  article: NewsArticle | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'retry'): void;
}>();

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function hideBrokenImage(event: Event): void {
  const image = event.target as HTMLImageElement;
  const figure = image.closest('figure');
  if (figure) {
    figure.style.display = 'none';
    return;
  }
  image.style.display = 'none';
}
</script>

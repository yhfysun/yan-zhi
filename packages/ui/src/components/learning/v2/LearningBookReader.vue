<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  BookOpen, ChevronLeft, ChevronRight, Languages, List, LoaderCircle, Minus, Moon, NotebookText, Plus, Sun, X,
} from 'lucide-vue-next';
import type { LearningV2ReaderBook } from '@yan-zhi/shared';
import { BUILTIN_BOOK_LOADERS, type BuiltinBookAsset } from '../../../assets/learning-library/book-assets.generated';
import { api } from '../../../api/client';
import type { ImportedBookChapter } from './library-import';
import {
  getImportedBook,
  readReaderProgress,
  saveReaderProgress,
} from './library-storage';

const BrowserPanel = defineAsyncComponent(() => import('../../BrowserPanel.vue'));

const props = defineProps<{ book: LearningV2ReaderBook }>();
const emit = defineEmits<{ close: [] }>();

type ReaderChapter = ImportedBookChapter;
type ReaderTheme = 'paper' | 'night';

const loading = ref(true);
const error = ref('');
const chapters = ref<ReaderChapter[]>([]);
const chapterIndex = ref(0);
const theme = ref<ReaderTheme>('paper');
const fontSize = ref(19);
const chaptersOpen = ref(false);
const notesOpen = ref(false);
const translationOpen = ref(false);
const translationLoading = ref(false);
const translatedParagraphs = ref<string[]>([]);
const translationError = ref('');
const contentRef = ref<HTMLElement | null>(null);
const sourceMeta = ref('');
let restoreScrollRatio = 0;
let bodyOverflow = '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const usesExternalReader = computed(() =>
  props.book.readingMode === 'external' || props.book.readingMode === 'platform',
);
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null);
const progressPercent = computed(() =>
  chapters.value.length ? Math.round(((chapterIndex.value + 1) / chapters.value.length) * 100) : 0,
);
const themeLabel = computed(() => theme.value === 'paper' ? '切换深色阅读' : '切换纸张阅读');
const canTranslate = computed(() => props.book.language === 'en');

function restorePreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('yz.learning.v2.reader.preferences.v1') || '{}') as {
      theme?: ReaderTheme;
      fontSize?: number;
    };
    if (saved.theme === 'paper' || saved.theme === 'night') theme.value = saved.theme;
    if (Number.isFinite(saved.fontSize)) fontSize.value = Math.min(26, Math.max(16, Number(saved.fontSize)));
  } catch {
    // Preferences are optional.
  }
}

function persistPreferences() {
  try {
    localStorage.setItem('yz.learning.v2.reader.preferences.v1', JSON.stringify({
      theme: theme.value,
      fontSize: fontSize.value,
    }));
  } catch {
    // Preferences are optional.
  }
}

function applyAsset(asset: BuiltinBookAsset) {
  chapters.value = asset.chapters;
  sourceMeta.value = `${asset.source} · ${asset.license}`;
}

async function loadBook() {
  loading.value = true;
  error.value = '';
  chapters.value = [];
  chapterIndex.value = 0;
  try {
    if (props.book.readingMode === 'builtin') {
      const loader = props.book.assetKey ? BUILTIN_BOOK_LOADERS[props.book.assetKey] : null;
      if (!loader) throw new Error('这本书还没有可读取的内置正文。');
      const module = await loader();
      applyAsset(module.default);
    } else if (props.book.readingMode === 'import') {
      if (!props.book.importedBookId) throw new Error('本地书籍标识缺失。');
      const record = await getImportedBook(props.book.importedBookId);
      if (!record) throw new Error('本地书籍文件已不存在，请重新导入。');
      chapters.value = record.parsedChapters;
      sourceMeta.value = `本地导入 · ${record.characterCount.toLocaleString()} 字`;
    }
    if (!usesExternalReader.value && !chapters.value.length) throw new Error('正文为空或章节解析失败。');
    const progress = readReaderProgress(props.book.id);
    if (progress) {
      chapterIndex.value = Math.min(Math.max(0, progress.chapterIndex), Math.max(0, chapters.value.length - 1));
      restoreScrollRatio = Math.min(1, Math.max(0, progress.scrollRatio));
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '书籍加载失败。';
  } finally {
    loading.value = false;
    await nextTick();
    restoreScroll();
  }
}

function restoreScroll() {
  if (!contentRef.value) return;
  contentRef.value.scrollTop = restoreScrollRatio * Math.max(0, contentRef.value.scrollHeight - contentRef.value.clientHeight);
  restoreScrollRatio = 0;
}

function selectChapter(index: number) {
  if (index < 0 || index >= chapters.value.length) return;
  chapterIndex.value = index;
  translationOpen.value = false;
  translatedParagraphs.value = [];
  translationError.value = '';
  chaptersOpen.value = false;
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0;
    saveReaderProgress(props.book.id, { chapterIndex: index, scrollRatio: 0 });
  });
}

function translationCacheKey(): string {
  return `yz.learning.v2.reader.translation.v1:${props.book.id}:${chapterIndex.value}`;
}

function restoreTranslationCache(): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(translationCacheKey()) || '[]');
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      translatedParagraphs.value = value;
      return value.length === (currentChapter.value?.paragraphs.length || 0);
    }
  } catch {
    // Cache is optional.
  }
  translatedParagraphs.value = [];
  return false;
}

async function toggleTranslation() {
  if (translationOpen.value) {
    translationOpen.value = false;
    return;
  }
  translationOpen.value = true;
  translationError.value = '';
  if (restoreTranslationCache()) return;
  const paragraphs = currentChapter.value?.paragraphs || [];
  if (!paragraphs.length) return;
  if (paragraphs.length > 30 || paragraphs.join('').length > 16_000) {
    translationError.value = '本章较长，将按段落分批对照的能力还在后续任务中。';
    return;
  }
  translationLoading.value = true;
  try {
    const response = await api.post<{ translations: string[] }>('/learning/library/translate', {
      paragraphs,
    });
    if ('error' in response) throw new Error(response.error);
    const translations = response.data.translations || [];
    if (translations.length !== paragraphs.length) throw new Error('对照译文数量不完整，请重试');
    translatedParagraphs.value = translations;
    try {
      localStorage.setItem(translationCacheKey(), JSON.stringify(translations));
    } catch {
      // Reading remains available without the cache.
    }
  } catch (e) {
    translationError.value = e instanceof Error ? e.message : '中文对照生成失败';
  } finally {
    translationLoading.value = false;
  }
}

function persistScroll() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!contentRef.value) return;
    const range = Math.max(1, contentRef.value.scrollHeight - contentRef.value.clientHeight);
    saveReaderProgress(props.book.id, {
      chapterIndex: chapterIndex.value,
      scrollRatio: contentRef.value.scrollTop / range,
    });
  }, 180);
}

function setTheme(next: ReaderTheme) {
  theme.value = next;
  persistPreferences();
}

function adjustFont(delta: number) {
  fontSize.value = Math.min(26, Math.max(16, fontSize.value + delta));
  persistPreferences();
}

function annotatedParts(text: string): Array<{ text: string; gloss?: string }> {
  const annotations = [...props.book.annotations]
    .filter((annotation) => annotation.term && text.includes(annotation.term))
    .sort((a, b) => b.term.length - a.term.length);
  if (!annotations.length) return [{ text }];
  const terms = annotations.map((annotation) => annotation.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matcher = new RegExp(`(${terms.join('|')})`, 'g');
  return text.split(matcher).filter(Boolean).map((part) => ({
    text: part,
    gloss: annotations.find((annotation) => annotation.term === part)?.gloss,
  }));
}

function closeReader() {
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (notesOpen.value) notesOpen.value = false;
    else if (chaptersOpen.value) chaptersOpen.value = false;
    else closeReader();
    return;
  }
  if (event.key === 'ArrowLeft' && !event.metaKey && !event.ctrlKey) selectChapter(chapterIndex.value - 1);
  if (event.key === 'ArrowRight' && !event.metaKey && !event.ctrlKey) selectChapter(chapterIndex.value + 1);
}

watch(() => props.book.id, () => void loadBook());

onMounted(() => {
  bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  restorePreferences();
  window.addEventListener('keydown', onKeydown);
  void loadBook();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (saveTimer) clearTimeout(saveTimer);
  document.body.style.overflow = bodyOverflow;
});
</script>

<template>
  <section
    class="learning-book-reader"
    :class="[`theme-${theme}`, { 'external-mode': usesExternalReader }]"
    role="dialog"
    aria-modal="true"
    :aria-label="`${book.title}阅读器`"
  >
    <header class="lbr-head">
      <button type="button" class="lbr-back" aria-label="返回图书馆" @click="closeReader">
        <ChevronLeft :size="18" /><span>返回书架</span>
      </button>
      <div class="lbr-title">
        <strong>{{ book.title }}</strong>
        <span>{{ book.author }}<template v-if="currentChapter"> · {{ currentChapter.title }}</template></span>
      </div>
      <div class="lbr-head-actions">
        <template v-if="!usesExternalReader">
          <button type="button" :aria-label="chaptersOpen ? '关闭目录' : '打开目录'" @click="chaptersOpen = !chaptersOpen">
            <List :size="17" />
          </button>
          <button type="button" aria-label="缩小字号" @click="adjustFont(-1)"><Minus :size="17" /></button>
          <button type="button" aria-label="放大字号" @click="adjustFont(1)"><Plus :size="17" /></button>
          <button type="button" :aria-label="themeLabel" @click="setTheme(theme === 'paper' ? 'night' : 'paper')">
            <Moon v-if="theme === 'paper'" :size="17" />
            <Sun v-else :size="17" />
          </button>
          <button type="button" :aria-label="notesOpen ? '关闭注释' : '打开注释'" :aria-pressed="notesOpen" @click="notesOpen = !notesOpen">
            <NotebookText :size="17" /><span>注释</span>
          </button>
          <button
            v-if="canTranslate"
            type="button"
            aria-label="切换简体中文对照"
            :aria-pressed="translationOpen"
            :disabled="translationLoading"
            @click="toggleTranslation"
          >
            <LoaderCircle v-if="translationLoading" class="lbr-spin" :size="17" />
            <Languages v-else :size="17" /><span>中文</span>
          </button>
        </template>
        <button type="button" aria-label="关闭阅读器" @click="closeReader"><X :size="18" /></button>
      </div>
    </header>

    <div v-if="loading" class="lbr-state" aria-live="polite">
      <span class="lbr-loader"></span>
      <b>正在打开《{{ book.title }}》</b>
      <p>正文和阅读进度都在本机处理。</p>
    </div>

    <div v-else-if="error" class="lbr-state lbr-error" role="alert">
      <BookOpen :size="30" />
      <b>这本书暂时打不开</b>
      <p>{{ error }}</p>
      <button type="button" @click="loadBook">重新加载</button>
    </div>

    <BrowserPanel
      v-else-if="usesExternalReader && book.url"
      :scope="`learning-reader:${book.id}`"
      :initial-url="book.url"
      reader-mode
    />

    <div v-else class="lbr-body">
      <aside class="lbr-chapters" :class="{ open: chaptersOpen }" data-reader-chapters>
        <header>
          <span>目录</span>
          <b>{{ chapters.length }} 章</b>
        </header>
        <nav aria-label="章节目录">
          <button
            v-for="(chapter, index) in chapters"
            :key="`${index}-${chapter.title}`"
            type="button"
            :class="{ active: index === chapterIndex }"
            :aria-current="index === chapterIndex ? 'page' : undefined"
            @click="selectChapter(index)"
          >
            <small>{{ String(index + 1).padStart(3, '0') }}</small>
            <span>{{ chapter.title }}</span>
          </button>
        </nav>
      </aside>

      <main ref="contentRef" class="lbr-content" data-reader-content @scroll.passive="persistScroll">
        <article class="lbr-paper" :style="{ '--reader-font-size': `${fontSize}px` }">
          <header>
            <span>{{ progressPercent }}% · {{ sourceMeta }}</span>
            <h1>{{ currentChapter?.title }}</h1>
            <p>{{ book.title }} · {{ book.author }}</p>
          </header>
          <div class="lbr-copy">
            <template v-for="(paragraph, index) in currentChapter?.paragraphs" :key="index">
              <p>
                <template v-for="(part, partIndex) in annotatedParts(paragraph)" :key="partIndex">
                  <abbr v-if="part.gloss" :title="part.gloss" tabindex="0">{{ part.text }}</abbr>
                  <template v-else>{{ part.text }}</template>
                </template>
              </p>
              <p v-if="translationOpen && translatedParagraphs[index]" class="lbr-translation">
                <b>中</b><span>{{ translatedParagraphs[index] }}</span>
              </p>
            </template>
            <p v-if="translationLoading" class="lbr-translation loading" role="status">正在生成简体中文对照…</p>
            <p v-else-if="translationError" class="lbr-translation error" role="alert">{{ translationError }}</p>
          </div>
          <footer>
            <button type="button" :disabled="chapterIndex <= 0" @click="selectChapter(chapterIndex - 1)">
              <ChevronLeft :size="16" />上一章
            </button>
            <span>{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
            <button type="button" :disabled="chapterIndex >= chapters.length - 1" @click="selectChapter(chapterIndex + 1)">
              下一章<ChevronRight :size="16" />
            </button>
          </footer>
        </article>
      </main>

      <aside class="lbr-notes" :class="{ open: notesOpen }" aria-label="阅读注释">
        <header>
          <span>注释与阅读边界</span>
          <button type="button" aria-label="关闭注释" @click="notesOpen = false"><X :size="16" /></button>
        </header>
        <div class="lbr-notes-scroll">
          <p>{{ book.license }}</p>
          <dl>
            <div v-for="annotation in book.annotations" :key="annotation.term">
              <dt>{{ annotation.term }}</dt>
              <dd>{{ annotation.gloss }}</dd>
            </div>
          </dl>
          <small>{{ sourceMeta }}</small>
        </div>
      </aside>
      <button
        v-if="notesOpen"
        type="button"
        class="lbr-notes-mask"
        aria-label="关闭注释"
        @click="notesOpen = false"
      />
    </div>
  </section>
</template>

<style scoped src="./learning-book-reader.css"></style>

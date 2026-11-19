<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  BookOpen, ChevronLeft, ChevronRight, Languages, List, LoaderCircle, NotebookText,
  RotateCcw, SlidersHorizontal, X,
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

type ReaderChapter = ImportedBookChapter & { url?: string };
type ReaderTheme = 'paper' | 'sepia' | 'green' | 'night' | 'lights-off';
type ReaderPageWidth = 'narrow' | 'standard' | 'wide';

const loading = ref(true);
const error = ref('');
const chapters = ref<ReaderChapter[]>([]);
const comicPages = ref<string[]>([]);
const chapterIndex = ref(0);
const theme = ref<ReaderTheme>('paper');
const fontSize = ref(19);
const lineHeight = ref(1.95);
const letterSpacing = ref(0);
const pageWidth = ref<ReaderPageWidth>('standard');
const comicZoom = ref(100);
const settingsOpen = ref(false);
const chaptersOpen = ref(false);
const notesOpen = ref(false);
const translationOpen = ref(false);
const translationLoading = ref(false);
const translatedParagraphs = ref<string[]>([]);
const translationError = ref('');
const contentRef = ref<HTMLElement | null>(null);
const sourceMeta = ref('');
const chapterLoading = ref(false);
const chapterError = ref('');
let restoreScrollRatio = 0;
let bodyOverflow = '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const usesExternalReader = computed(() =>
  props.book.readingMode === 'external' || props.book.readingMode === 'platform',
);
const isComic = computed(() => props.book.contentKind === 'comic');
const currentChapter = computed(() => chapters.value[chapterIndex.value] || null);
const progressPercent = computed(() =>
  isComic.value
    ? comicPages.value.length ? Math.round(((chapterIndex.value + 1) / comicPages.value.length) * 100) : 0
    : chapters.value.length ? Math.round(((chapterIndex.value + 1) / chapters.value.length) * 100) : 0,
);
const totalPages = computed(() => isComic.value ? comicPages.value.length : chapters.value.length);
const currentComicPage = computed(() => comicPages.value[chapterIndex.value] || '');
const canTranslate = computed(() => props.book.language === 'en');
const readerStyle = computed<Record<string, string>>(() => ({
  '--reader-font-size': `${fontSize.value}px`,
  '--reader-line-height': String(lineHeight.value),
  '--reader-letter-spacing': `${letterSpacing.value}px`,
  '--reader-page-width': pageWidth.value === 'narrow' ? '640px' : pageWidth.value === 'wide' ? '900px' : '760px',
  '--comic-zoom': String(comicZoom.value / 100),
}));

const READER_THEMES: Array<{ key: ReaderTheme; label: string; hint: string }> = [
  { key: 'paper', label: '纸张', hint: '明亮纸白' },
  { key: 'sepia', label: '羊皮', hint: '暖色低刺激' },
  { key: 'green', label: '护眼', hint: '低饱和绿色' },
  { key: 'night', label: '夜间', hint: '深色低亮度' },
  { key: 'lights-off', label: '关灯', hint: '近黑阅读' },
];

function restorePreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('yz.learning.v2.reader.preferences.v1') || '{}') as {
      theme?: ReaderTheme;
      fontSize?: number;
      lineHeight?: number;
      letterSpacing?: number;
      pageWidth?: ReaderPageWidth;
      comicZoom?: number;
    };
    if (READER_THEMES.some((item) => item.key === saved.theme)) theme.value = saved.theme as ReaderTheme;
    if (Number.isFinite(saved.fontSize)) fontSize.value = Math.min(26, Math.max(16, Number(saved.fontSize)));
    if (Number.isFinite(saved.lineHeight)) lineHeight.value = Math.min(2.5, Math.max(1.45, Number(saved.lineHeight)));
    if (Number.isFinite(saved.letterSpacing)) letterSpacing.value = Math.min(3, Math.max(0, Number(saved.letterSpacing)));
    if (saved.pageWidth === 'narrow' || saved.pageWidth === 'standard' || saved.pageWidth === 'wide') {
      pageWidth.value = saved.pageWidth;
    }
    if (Number.isFinite(saved.comicZoom)) comicZoom.value = Math.min(180, Math.max(70, Number(saved.comicZoom)));
  } catch {
    // Preferences are optional.
  }
}

function persistPreferences() {
  try {
    localStorage.setItem('yz.learning.v2.reader.preferences.v1', JSON.stringify({
      theme: theme.value,
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      letterSpacing: letterSpacing.value,
      pageWidth: pageWidth.value,
      comicZoom: comicZoom.value,
    }));
  } catch {
    // Preferences are optional.
  }
}

function applyAsset(asset: BuiltinBookAsset) {
  chapters.value = asset.chapters;
  sourceMeta.value = `${asset.source} · ${asset.license}`;
}

async function loadSourceChapter(index: number) {
  const chapter = chapters.value[index];
  if (!props.book.source || !chapter?.url || chapter.paragraphs.length) return;
  chapterLoading.value = true;
  chapterError.value = '';
  try {
    const response = await api.post<{
      title?: string;
      paragraphs: string[];
    }>('/learning/library/source/content', {
      ...(props.book.source.provider
        ? { sourceId: props.book.source.id }
        : { source: props.book.source }),
      book: {
        title: props.book.title,
        author: props.book.author,
        bookUrl: props.book.bookUrl,
        contentUrl: props.book.contentUrl,
        description: '',
      },
      chapterUrl: chapter.url,
    });
    if ('error' in response) throw new Error(response.error);
    const paragraphs = Array.isArray(response.data.paragraphs)
      ? response.data.paragraphs.map((paragraph) => String(paragraph || '').trim()).filter(Boolean)
      : [];
    if (!paragraphs.length) throw new Error('这一章没有提取到可阅读正文。');
    chapters.value = chapters.value.map((item, itemIndex) => itemIndex === index
      ? {
          ...item,
          ...(response.data.title && item.title === props.book.title ? { title: response.data.title } : {}),
          paragraphs,
        }
      : item);
  } catch (e) {
    chapterError.value = e instanceof Error ? e.message : '章节正文加载失败。';
  } finally {
    chapterLoading.value = false;
  }
}

async function loadBook() {
  loading.value = true;
  error.value = '';
  chapters.value = [];
  comicPages.value = [];
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
      if (record.kind === 'comic' && record.comicPages?.length) {
        comicPages.value = record.comicPages;
        sourceMeta.value = `本地漫画 · ${record.comicPages.length} 页`;
      } else {
        chapters.value = record.parsedChapters;
        sourceMeta.value = `本地导入 · ${record.characterCount.toLocaleString()} 字`;
      }
    } else if (props.book.readingMode === 'source') {
      if (!props.book.source || !props.book.bookUrl) throw new Error('书源配置或书籍地址缺失。');
      const response = await api.post<{
        title: string;
        author: string;
        chapters: Array<{ title: string; url: string }>;
      }>('/learning/library/source/book', {
        ...(props.book.source.provider
          ? { sourceId: props.book.source.id }
          : { source: props.book.source }),
        book: {
          title: props.book.title,
          author: props.book.author,
          bookUrl: props.book.bookUrl,
          contentUrl: props.book.contentUrl,
          description: '',
        },
      });
      if ('error' in response) throw new Error(response.error);
      chapters.value = (response.data.chapters || []).map((chapter) => ({
        title: chapter.title,
        url: chapter.url,
        paragraphs: [],
      }));
      sourceMeta.value = `${props.book.source.name} · 应用内正文${/^http:\/\//i.test(props.book.source.url) ? ' · HTTP 不安全' : ''}`;
    }
    if (!usesExternalReader.value && !chapters.value.length && !comicPages.value.length) {
      throw new Error('正文为空或章节解析失败。');
    }
    const progress = readReaderProgress(props.book.id);
    if (progress) {
      const total = comicPages.value.length || chapters.value.length;
      chapterIndex.value = Math.min(Math.max(0, progress.chapterIndex), Math.max(0, total - 1));
      restoreScrollRatio = Math.min(1, Math.max(0, progress.scrollRatio));
    }
    if (props.book.readingMode === 'source' && chapters.value.length) {
      await loadSourceChapter(chapterIndex.value);
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
  chapterError.value = '';
  chaptersOpen.value = false;
  nextTick(() => {
    if (contentRef.value) contentRef.value.scrollTop = 0;
    saveReaderProgress(props.book.id, { chapterIndex: index, scrollRatio: 0 });
  });
  if (props.book.readingMode === 'source') void loadSourceChapter(index);
}

function goComicPage(index: number) {
  if (index < 0 || index >= comicPages.value.length) return;
  chapterIndex.value = index;
  nextTick(() => {
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

function adjustLineHeight(delta: number) {
  lineHeight.value = Math.min(2.5, Math.max(1.45, Math.round((lineHeight.value + delta) * 100) / 100));
  persistPreferences();
}

function adjustLetterSpacing(delta: number) {
  letterSpacing.value = Math.min(3, Math.max(0, Math.round((letterSpacing.value + delta) * 10) / 10));
  persistPreferences();
}

function resetReaderPreferences() {
  theme.value = 'paper';
  fontSize.value = 19;
  lineHeight.value = 1.95;
  letterSpacing.value = 0;
  pageWidth.value = 'standard';
  comicZoom.value = 100;
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
    if (settingsOpen.value) settingsOpen.value = false;
    else if (notesOpen.value) notesOpen.value = false;
    else if (chaptersOpen.value) chaptersOpen.value = false;
    else closeReader();
    return;
  }
  if (event.key === 'ArrowLeft' && !event.metaKey && !event.ctrlKey) {
    if (isComic.value) goComicPage(chapterIndex.value - 1);
    else selectChapter(chapterIndex.value - 1);
  }
  if (event.key === 'ArrowRight' && !event.metaKey && !event.ctrlKey) {
    if (isComic.value) goComicPage(chapterIndex.value + 1);
    else selectChapter(chapterIndex.value + 1);
  }
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
    :style="readerStyle"
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
          <button v-if="!isComic" type="button" :aria-label="chaptersOpen ? '关闭目录' : '打开目录'" @click="chaptersOpen = !chaptersOpen">
            <List :size="17" />
          </button>
          <button type="button" aria-label="阅读设置" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">
            <SlidersHorizontal :size="17" /><span>设置</span>
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

    <div v-else-if="isComic" class="lbr-comic-body">
      <main class="lbr-comic-stage" data-reader-content>
        <img
          v-if="currentComicPage"
          :src="currentComicPage"
          :alt="`${book.title} 第 ${chapterIndex + 1} 页`"
          class="lbr-comic-page"
        />
        <div v-else class="lbr-state">
          <BookOpen :size="30" />
          <b>漫画页面为空</b>
          <p>请重新导入图片并按页码顺序命名。</p>
        </div>
      </main>
      <footer class="lbr-comic-footer">
        <button type="button" :disabled="chapterIndex <= 0" @click="goComicPage(chapterIndex - 1)">
          <ChevronLeft :size="17" />上一页
        </button>
        <span>{{ chapterIndex + 1 }} / {{ comicPages.length }} · {{ progressPercent }}%</span>
        <button type="button" :disabled="chapterIndex >= comicPages.length - 1" @click="goComicPage(chapterIndex + 1)">
          下一页<ChevronRight :size="17" />
        </button>
      </footer>
    </div>

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
        <article class="lbr-paper">
          <header>
            <span>{{ progressPercent }}% · {{ sourceMeta }}</span>
            <h1>{{ currentChapter?.title }}</h1>
            <p>{{ book.title }} · {{ book.author }}</p>
          </header>
          <div class="lbr-copy">
            <div v-if="chapterLoading" class="lbr-chapter-state" role="status">
              <LoaderCircle class="lbr-spin" :size="20" />
              <span>正在加载本章正文…</span>
            </div>
            <div v-else-if="chapterError" class="lbr-chapter-state error" role="alert">
              <b>本章暂时打不开</b>
              <span>{{ chapterError }}</span>
              <button type="button" @click="loadSourceChapter(chapterIndex)">重试本章</button>
            </div>
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
            <button type="button" :disabled="chapterIndex <= 0 || chapterLoading" @click="selectChapter(chapterIndex - 1)">
              <ChevronLeft :size="16" />上一章
            </button>
            <span>{{ chapterIndex + 1 }} / {{ chapters.length }}</span>
            <button type="button" :disabled="chapterIndex >= chapters.length - 1 || chapterLoading" @click="selectChapter(chapterIndex + 1)">
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

    <button
      v-if="settingsOpen"
      type="button"
      class="lbr-settings-mask"
      aria-label="关闭阅读设置"
      @click="settingsOpen = false"
    />
    <aside v-if="settingsOpen" class="lbr-settings" aria-label="阅读设置">
      <header>
        <div><span>阅读设置</span><small>自动保存在本机</small></div>
        <button type="button" aria-label="关闭阅读设置" @click="settingsOpen = false"><X :size="17" /></button>
      </header>
      <div class="lbr-settings-scroll">
        <section>
          <h3>阅读背景</h3>
          <div class="lbr-theme-grid">
            <button
              v-for="item in READER_THEMES"
              :key="item.key"
              type="button"
              :class="{ active: theme === item.key }"
              :aria-pressed="theme === item.key"
              @click="setTheme(item.key)"
            >
              <i :data-reader-theme="item.key"></i>
              <span>{{ item.label }}</span>
              <small>{{ item.hint }}</small>
            </button>
          </div>
        </section>
        <section class="lbr-mode-actions">
          <button type="button" :class="{ active: theme === 'green' }" @click="setTheme('green')">护眼模式</button>
          <button type="button" :class="{ active: theme === 'lights-off' }" @click="setTheme('lights-off')">关灯模式</button>
        </section>
        <template v-if="!isComic">
          <section>
            <div class="lbr-setting-head"><h3>字号</h3><b>{{ fontSize }} px</b></div>
            <input v-model.number="fontSize" type="range" min="16" max="30" step="1" @change="persistPreferences" />
          </section>
          <section>
            <div class="lbr-setting-head"><h3>行距</h3><b>{{ lineHeight.toFixed(2) }}</b></div>
            <input v-model.number="lineHeight" type="range" min="1.45" max="2.5" step="0.05" @change="persistPreferences" />
          </section>
          <section>
            <div class="lbr-setting-head"><h3>字间距</h3><b>{{ letterSpacing.toFixed(1) }} px</b></div>
            <input v-model.number="letterSpacing" type="range" min="0" max="3" step="0.1" @change="persistPreferences" />
          </section>
        </template>
        <section>
          <h3>{{ isComic ? '画面宽度' : '正文页宽' }}</h3>
          <div class="lbr-width-options">
            <button type="button" :class="{ active: pageWidth === 'narrow' }" @click="pageWidth = 'narrow'; persistPreferences()">窄</button>
            <button type="button" :class="{ active: pageWidth === 'standard' }" @click="pageWidth = 'standard'; persistPreferences()">标准</button>
            <button type="button" :class="{ active: pageWidth === 'wide' }" @click="pageWidth = 'wide'; persistPreferences()">宽</button>
          </div>
        </section>
        <section v-if="isComic">
          <div class="lbr-setting-head"><h3>画面缩放</h3><b>{{ comicZoom }}%</b></div>
          <input v-model.number="comicZoom" type="range" min="70" max="180" step="5" @change="persistPreferences" />
        </section>
        <button type="button" class="lbr-settings-reset" @click="resetReaderPreferences">
          <RotateCcw :size="15" />恢复默认阅读设置
        </button>
      </div>
    </aside>
  </section>
</template>

<style scoped src="./learning-book-reader.css"></style>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  BookMarked, BookOpen, Bookmark, BookmarkCheck, Check, ChevronRight, ExternalLink, Library,
  Plus, Search, Trash2, Upload, X,
} from 'lucide-vue-next';
import {
  LEARNING_V2_READING_CATEGORIES,
  LEARNING_V2_READING_COLLECTIONS,
  getLearningV2BookSources,
  getLearningV2ReadingCatalog,
  type LearningV2BookSource,
  type LearningV2LibraryEntry,
  type LearningV2ReadingCategoryKey,
  type LearningV2ReadingCollectionKey,
  type LearningV2ReadingEntry,
  type LearningV2ReaderBook,
} from '@yan-zhi/shared';
import { decodeBookBytes, parseBookText } from './library-import';
import {
  listImportedBooks,
  saveImportedBook,
  type ImportedBookMeta,
} from './library-storage';

const props = defineProps<{
  records: readonly LearningV2LibraryEntry[];
  accent: string;
  tint: string;
}>();

const emit = defineEmits<{
  close: [];
  openBook: [entry: LearningV2LibraryEntry];
  readBook: [book: LearningV2ReaderBook];
}>();

const SHELF_KEY = 'yz.learning.v2.library.shelf.v1';
const SOURCES_KEY = 'yz.learning.v2.library.sources.v1';
const DISABLED_SOURCES_KEY = 'yz.learning.v2.library.disabled-sources.v1';

type LibraryView = 'discover' | 'shelf' | 'sources';
type CategoryFilter = LearningV2ReadingCategoryKey | 'all';
type CollectionFilter = LearningV2ReadingCollectionKey | 'all';

type LibraryCard = {
  id: string;
  title: string;
  author: string;
  category: LearningV2ReadingCategoryKey;
  sourceId: string;
  sourceName: string;
  url?: string;
  license: string;
  description: string;
  learningEntry?: LearningV2LibraryEntry;
  readingEntry?: LearningV2ReadingEntry;
  importedBookId?: string;
  readingMode?: LearningV2ReadingEntry['readingMode'];
  collections?: readonly LearningV2ReadingCollectionKey[];
};

type SourceForm = {
  name: string;
  url: string;
  category: LearningV2ReadingCategoryKey;
  license: string;
};

const activeView = ref<LibraryView>('discover');
const categoryFilter = ref<CategoryFilter>('all');
const collectionFilter = ref<CollectionFilter>('all');
const query = ref('');
const selectedCardId = ref('');
const selectedSourceId = ref('');
const detailOpen = ref(false);
const shelfIds = ref<string[]>([]);
const customSources = ref<LearningV2BookSource[]>([]);
const disabledSourceIds = ref<string[]>([]);
const sourceFormOpen = ref(false);
const sourceError = ref('');
const sourceForm = ref<SourceForm>({
  name: '',
  url: '',
  category: 'web-novel',
  license: '用户自行添加；仅用于打开授权或公版阅读页面',
});
const searchInput = ref<HTMLInputElement | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const importedBooks = ref<ImportedBookMeta[]>([]);
const importing = ref(false);
const importError = ref('');

const builtInSources = getLearningV2BookSources();
const readingEntries = getLearningV2ReadingCatalog();
const allSources = computed(() => [...builtInSources, ...customSources.value]);
const enabledSources = computed(() =>
  allSources.value.filter((source) => !disabledSourceIds.value.includes(source.id)),
);
const cards = computed<LibraryCard[]>(() => {
  const courseCards: LibraryCard[] = props.records.map((entry) => ({
    id: `course:${entry.id}`,
    title: entry.title,
    author: entry.subjectName,
    category: 'course',
    sourceId: `course:${entry.subjectKey}`,
    sourceName: entry.subjectName,
    license: entry.source,
    description: entry.readable ? entry.original : '课程书目登记；原文与版本状态待核验。',
    learningEntry: entry,
    readingMode: 'external',
  }));
  const readingCards: LibraryCard[] = readingEntries.map((entry) => ({
    id: `reading:${entry.id}`,
    title: entry.title,
    author: entry.author,
    category: entry.category,
    sourceId: entry.sourceId,
    sourceName: entry.sourceName,
    url: entry.url,
    license: entry.license,
    description: entry.description,
    readingEntry: entry,
    readingMode: entry.readingMode,
    collections: entry.collections,
  }));
  const importedCards: LibraryCard[] = importedBooks.value.map((book) => ({
    id: `imported:${book.id}`,
    title: book.title,
    author: book.author,
    category: 'web-novel',
    sourceId: 'local-import',
    sourceName: '本地导入',
    license: '用户本地导入；仅保存在当前设备，不上传正文',
    description: `${book.chapters} 章 · ${book.characterCount.toLocaleString()} 字 · 支持继续阅读`,
    importedBookId: book.id,
    readingMode: 'import',
    collections: ['youth', 'adult'],
  }));
  const customCards: LibraryCard[] = customSources.value.map((source) => ({
    id: `custom-source:${source.id}`,
    title: source.name,
    author: '自定义书源',
    category: source.category,
    sourceId: source.id,
    sourceName: source.name,
    url: source.url,
    license: source.license,
    description: source.description,
    readingMode: 'external',
  }));
  const enabledSourceIds = new Set(enabledSources.value.map((source) => source.id));
  return [...importedCards, ...readingCards, ...customCards, ...courseCards]
    .filter((card) =>
      card.category === 'course'
      || card.sourceId === 'local-import'
      || enabledSourceIds.has(card.sourceId),
    );
});
const visibleCards = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return cards.value.filter((card) => {
    if (activeView.value === 'shelf' && !shelfIds.value.includes(card.id)) return false;
    if (categoryFilter.value !== 'all' && card.category !== categoryFilter.value) return false;
    if (collectionFilter.value !== 'all' && !card.collections?.includes(collectionFilter.value)) return false;
    if (!keyword) return true;
    return [card.title, card.author, card.sourceName, card.description, card.license]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
});
const selectedCard = computed(() =>
  visibleCards.value.find((card) => card.id === selectedCardId.value)
  || cards.value.find((card) => card.id === selectedCardId.value)
  || visibleCards.value[0],
);
const selectedSource = computed(() =>
  allSources.value.find((source) => source.id === selectedSourceId.value) || enabledSources.value[0],
);
const shelfCount = computed(() => shelfIds.value.filter((id) => cards.value.some((card) => card.id === id)).length);
const categoryCounts = computed(() => Object.fromEntries(
  LEARNING_V2_READING_CATEGORIES.map((category) => [
    category.key,
    cards.value.filter((card) => card.category === category.key).length,
  ]),
) as Record<LearningV2ReadingCategoryKey, number>);
const collectionCounts = computed(() => Object.fromEntries(
  LEARNING_V2_READING_COLLECTIONS.map((collection) => [
    collection.key,
    cards.value.filter((card) => card.collections?.includes(collection.key)).length,
  ]),
) as Record<LearningV2ReadingCollectionKey, number>);

function categoryLabel(key: LearningV2ReadingCategoryKey): string {
  return LEARNING_V2_READING_CATEGORIES.find((category) => category.key === key)?.label || key;
}

function accessLabel(access: LearningV2BookSource['access']): string {
  if (access === 'authorized-platform') return '官方授权平台';
  if (access === 'library') return '馆藏或借阅';
  return '公版或开放许可';
}

function readArray(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function readCustomSources(): LearningV2BookSource[] {
  try {
    const value = JSON.parse(localStorage.getItem(SOURCES_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((source): source is LearningV2BookSource =>
      !!source
      && typeof source.id === 'string'
      && typeof source.name === 'string'
      && typeof source.url === 'string'
      && typeof source.category === 'string'
      && typeof source.license === 'string',
    );
  } catch {
    return [];
  }
}

function persistPreferences() {
  try {
    localStorage.setItem(SHELF_KEY, JSON.stringify(shelfIds.value));
    localStorage.setItem(SOURCES_KEY, JSON.stringify(customSources.value));
    localStorage.setItem(DISABLED_SOURCES_KEY, JSON.stringify(disabledSourceIds.value));
  } catch { /* local library preferences are optional */ }
}

function restorePreferences() {
  shelfIds.value = readArray(SHELF_KEY);
  disabledSourceIds.value = readArray(DISABLED_SOURCES_KEY);
  customSources.value = readCustomSources();
}

function selectView(view: LibraryView) {
  activeView.value = view;
  sourceFormOpen.value = false;
  sourceError.value = '';
  selectedCardId.value = '';
  detailOpen.value = false;
  if (view === 'discover') collectionFilter.value = 'all';
  if (view === 'sources') selectedSourceId.value = enabledSources.value[0]?.id || '';
}

function selectCard(card: LibraryCard) {
  selectedCardId.value = card.id;
  detailOpen.value = true;
}

function selectSource(source: LearningV2BookSource) {
  selectedSourceId.value = source.id;
  detailOpen.value = true;
}

function toggleShelf(card: LibraryCard) {
  shelfIds.value = shelfIds.value.includes(card.id)
    ? shelfIds.value.filter((id) => id !== card.id)
    : [...shelfIds.value, card.id];
  persistPreferences();
}

function isOnShelf(card: LibraryCard): boolean {
  return shelfIds.value.includes(card.id);
}

function openBook(card: LibraryCard) {
  if (card.learningEntry) {
    emit('openBook', card.learningEntry);
    return;
  }
  if (card.readingEntry) {
    emit('readBook', readerBookFor(card.readingEntry));
    return;
  }
  const imported = importedBooks.value.find((book) => book.id === card.importedBookId);
  if (imported) {
    emit('readBook', {
      id: `imported:${imported.id}`,
      title: imported.title,
      author: imported.author,
      language: 'mixed',
      readingMode: 'import',
      importedBookId: imported.id,
      sourceName: '本地导入',
      license: card.license,
      annotations: [],
      collectionLabels: ['网络小说', '本地书架'],
    });
    return;
  }
  if (card.url) {
    emit('readBook', {
      id: card.id,
      title: card.title,
      author: card.author,
      language: 'zh-Hans',
      readingMode: 'external',
      url: card.url,
      sourceName: card.sourceName,
      license: card.license,
      annotations: [],
      collectionLabels: card.collections?.map(collectionLabel) || [],
    });
  }
}

function readerBookFor(entry: LearningV2ReadingEntry): LearningV2ReaderBook {
  return {
    id: entry.id,
    title: entry.title,
    author: entry.author,
    language: entry.language,
    readingMode: entry.readingMode,
    assetKey: entry.assetKey,
    url: entry.url,
    sourceName: entry.sourceName,
    license: entry.license,
    annotations: entry.annotations,
    collectionLabels: entry.collections.map(collectionLabel),
  };
}

function collectionLabel(key: LearningV2ReadingCollectionKey): string {
  return LEARNING_V2_READING_COLLECTIONS.find((collection) => collection.key === key)?.label || key;
}

function readLabel(card: LibraryCard): string {
  if (card.learningEntry) return card.learningEntry.readable ? '开始研读' : '仅书目';
  if (card.readingMode === 'builtin') return '开始阅读';
  if (card.readingMode === 'import') return '继续阅读';
  if (card.readingMode === 'platform') return '应用内打开';
  return '阅读导读';
}

function chooseImport() {
  importError.value = '';
  importInput.value?.click();
}

async function importLocalBook(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!/\.(txt|md|markdown)$/i.test(file.name)) {
    importError.value = '当前支持导入 TXT、MD 文本；EPUB 阅读器仍在后续任务中。';
    return;
  }
  importing.value = true;
  importError.value = '';
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raw = decodeBookBytes(bytes);
    const parsed = parseBookText(raw, file.name);
    if (!parsed.chapters.length) throw new Error('没有识别到可阅读正文。');
    const saved = await saveImportedBook(parsed, raw);
    const meta: ImportedBookMeta = {
      id: saved.id,
      title: saved.title,
      author: saved.author,
      chapters: saved.chapters,
      characterCount: saved.characterCount,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
    importedBooks.value = [meta, ...importedBooks.value];
    if (!shelfIds.value.includes(`imported:${meta.id}`)) {
      shelfIds.value = [...shelfIds.value, `imported:${meta.id}`];
    }
    activeView.value = 'discover';
    collectionFilter.value = 'all';
    categoryFilter.value = 'web-novel';
    query.value = '';
    const card = cards.value.find((item) => item.importedBookId === meta.id);
    if (card) openBook(card);
  } catch (e) {
    importError.value = e instanceof Error ? e.message : '导入失败，请检查文件内容。';
  } finally {
    importing.value = false;
  }
}

function toggleSource(source: LearningV2BookSource) {
  disabledSourceIds.value = disabledSourceIds.value.includes(source.id)
    ? disabledSourceIds.value.filter((id) => id !== source.id)
    : [...disabledSourceIds.value, source.id];
  persistPreferences();
}

function isSourceEnabled(source: LearningV2BookSource): boolean {
  return !disabledSourceIds.value.includes(source.id);
}

function deleteCustomSource(source: LearningV2BookSource) {
  customSources.value = customSources.value.filter((item) => item.id !== source.id);
  disabledSourceIds.value = disabledSourceIds.value.filter((id) => id !== source.id);
  if (selectedSourceId.value === source.id) selectedSourceId.value = builtInSources[0]?.id || '';
  persistPreferences();
}

function submitCustomSource() {
  sourceError.value = '';
  const name = sourceForm.value.name.trim();
  const license = sourceForm.value.license.trim();
  let url = '';
  try {
    const parsed = new URL(sourceForm.value.url.trim());
    if (parsed.protocol !== 'https:') throw new Error('protocol');
    url = parsed.toString();
  } catch {
    sourceError.value = '书源地址必须是完整的 HTTPS 地址。';
    return;
  }
  if (!name || !license) {
    sourceError.value = '请填写书源名称和许可说明。';
    return;
  }
  const source: LearningV2BookSource = {
    id: `custom-${Date.now()}`,
    name,
    url,
    category: sourceForm.value.category,
    access: sourceForm.value.category === 'web-novel' ? 'authorized-platform' : 'public-domain',
    license,
    description: '用户自行添加的书源。应用只保存地址，不抓取正文、不绕过登录或付费限制。',
  };
  customSources.value = [...customSources.value, source];
  selectedSourceId.value = source.id;
  sourceFormOpen.value = false;
  sourceForm.value = {
    name: '',
    url: '',
    category: 'web-novel',
    license: '用户自行添加；仅用于打开授权或公版阅读页面',
  };
  persistPreferences();
}

watch([shelfIds, customSources, disabledSourceIds], persistPreferences, { deep: true });
onMounted(async () => {
  restorePreferences();
  try {
    importedBooks.value = await listImportedBooks();
  } catch {
    importedBooks.value = [];
  }
  searchInput.value?.focus();
});
</script>

<template>
  <section
    class="ll-library"
    role="dialog"
    aria-modal="true"
    aria-labelledby="learning-library-title"
    :style="{ '--ll-accent': accent, '--ll-tint': tint }"
  >
    <header class="ll-head">
      <div>
        <Library :size="19" />
        <span><b id="learning-library-title">图书馆</b><small>{{ cards.length }} 个可发现条目 · {{ shelfCount }} 本在书架</small></span>
      </div>
      <button type="button" aria-label="关闭图书馆" @click="emit('close')"><X :size="17" /></button>
    </header>

    <div class="ll-body">
      <aside class="ll-nav" aria-label="图书馆分区">
        <nav>
          <button type="button" :class="{ active: activeView === 'discover' }" @click="selectView('discover')">
            <Search :size="15" /><span>发现</span><small>{{ cards.length }}</small>
          </button>
          <button type="button" :class="{ active: activeView === 'shelf' }" @click="selectView('shelf')">
            <Bookmark :size="15" /><span>书架</span><small>{{ shelfCount }}</small>
          </button>
          <button type="button" :class="{ active: activeView === 'sources' }" @click="selectView('sources')">
            <ExternalLink :size="15" /><span>书源</span><small>{{ allSources.length }}</small>
          </button>
        </nav>
        <div v-if="activeView !== 'sources'" class="ll-categories">
          <button type="button" :class="{ active: categoryFilter === 'all' }" @click="categoryFilter = 'all'">
            <span>全部</span><small>{{ cards.length }}</small>
          </button>
          <button
            v-for="category in LEARNING_V2_READING_CATEGORIES"
            :key="category.key"
            type="button"
            :class="{ active: categoryFilter === category.key }"
            @click="categoryFilter = category.key"
          >
            <span>{{ category.label }}</span><small>{{ categoryCounts[category.key] }}</small>
          </button>
        </div>
        <div v-if="activeView !== 'sources'" class="ll-collections">
          <header><span>精选书单</span></header>
          <button
            v-for="collection in LEARNING_V2_READING_COLLECTIONS"
            :key="collection.key"
            type="button"
            :class="{ active: collectionFilter === collection.key }"
            @click="collectionFilter = collectionFilter === collection.key ? 'all' : collection.key"
          >
            <span>{{ collection.label }}</span><small>{{ collectionCounts[collection.key] }}</small>
          </button>
        </div>
        <div v-else class="ll-source-note">
          <b>书源规则</b>
          <p>只登记公版、开放许可或官方授权平台。应用不抓取正文，不绕过登录、付费或地区限制。</p>
        </div>
      </aside>

      <main class="ll-main">
        <template v-if="activeView !== 'sources'">
          <div class="ll-toolbar">
            <label>
              <Search :size="15" />
              <input
                ref="searchInput"
                v-model="query"
                data-library-search
                type="search"
                placeholder="搜索书名、作者、分类、来源或许可"
              />
            </label>
            <span>{{ visibleCards.length }} 条</span>
            <button type="button" class="ll-import" :disabled="importing" @click="chooseImport">
              <Upload :size="15" />{{ importing ? '正在导入' : '导入本地小说' }}
            </button>
            <input
              ref="importInput"
              data-import-book-input
              class="ll-import-input"
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              @change="importLocalBook"
            />
          </div>
          <p v-if="importError" class="ll-import-error" role="alert">{{ importError }}</p>
          <div v-if="visibleCards.length" class="ll-card-grid">
            <article
              v-for="card in visibleCards"
              :key="card.id"
              class="ll-book-card"
              :class="{ selected: selectedCard?.id === card.id }"
            >
              <button type="button" class="ll-book-main" @click="selectCard(card)">
                <span class="ll-book-cover" :data-category="card.category" aria-hidden="true">
                  <BookMarked :size="20" />
                  <small>{{ categoryLabel(card.category) }}</small>
                </span>
                <span class="ll-book-copy">
                  <span class="ll-book-kind">{{ card.sourceName }}</span>
                  <b>{{ card.title }}</b>
                  <small>{{ card.author }}</small>
                  <p>{{ card.description }}</p>
                </span>
              </button>
              <span class="ll-book-foot">
                <span>{{ isOnShelf(card) ? '已在书架' : card.readingMode === 'builtin' ? '离线全文' : '应用内阅读' }}</span>
                <button type="button" data-read-book :disabled="!!card.learningEntry && !card.learningEntry.readable" @click="openBook(card)">
                  {{ readLabel(card) }}<ChevronRight :size="14" />
                </button>
              </span>
            </article>
          </div>
          <div v-else class="ll-empty">
            <BookOpen :size="28" />
            <b>{{ activeView === 'shelf' ? '书架还没有这本书' : '没有匹配的书目' }}</b>
            <p>{{ activeView === 'shelf' ? '在“发现”里选择书目，再加入书架。' : '换一个关键词或分类试试。' }}</p>
          </div>
        </template>

        <template v-else>
          <header class="ll-source-head">
            <div><span>来源管理</span><h2>书源</h2></div>
            <button type="button" @click="sourceFormOpen = !sourceFormOpen"><Plus :size="15" />添加书源</button>
          </header>
          <form v-if="sourceFormOpen" class="ll-source-form" @submit.prevent="submitCustomSource">
            <label><span>名称</span><input v-model="sourceForm.name" placeholder="例如：我的授权书库" /></label>
            <label><span>HTTPS 地址</span><input v-model="sourceForm.url" type="url" placeholder="https://..." /></label>
            <label>
              <span>分类</span>
              <select v-model="sourceForm.category">
                <option v-for="category in LEARNING_V2_READING_CATEGORIES.filter((item) => item.key !== 'course')" :key="category.key" :value="category.key">{{ category.label }}</option>
              </select>
            </label>
            <label class="wide"><span>许可说明</span><input v-model="sourceForm.license" placeholder="公版、开放许可或官方授权依据" /></label>
            <p v-if="sourceError" class="ll-source-error">{{ sourceError }}</p>
            <div>
              <button type="button" @click="sourceFormOpen = false">取消</button>
              <button type="submit">保存书源</button>
            </div>
          </form>
          <div class="ll-source-list">
            <button
              v-for="source in allSources"
              :key="source.id"
              type="button"
              :class="{ selected: selectedSource?.id === source.id, disabled: !isSourceEnabled(source) }"
              @click="selectSource(source)"
            >
              <i><Check v-if="isSourceEnabled(source)" :size="12" /></i>
              <span><b>{{ source.name }}</b><small>{{ categoryLabel(source.category) }} · {{ accessLabel(source.access) }}</small></span>
              <em>{{ customSources.some((item) => item.id === source.id) ? '自定义' : '内置' }}</em>
            </button>
          </div>
        </template>
      </main>

      <button
        v-if="detailOpen"
        class="ll-detail-mask"
        type="button"
        aria-label="关闭详情"
        @click="detailOpen = false"
      />
      <aside class="ll-detail" :class="{ 'mobile-open': detailOpen }" aria-live="polite">
        <button class="ll-detail-close" type="button" aria-label="关闭详情" @click="detailOpen = false"><X :size="16" /></button>
        <template v-if="activeView !== 'sources' && selectedCard">
          <span>{{ categoryLabel(selectedCard.category) }}</span>
          <h2>{{ selectedCard.title }}</h2>
          <p class="ll-detail-author">{{ selectedCard.author }} · {{ selectedCard.sourceName }}</p>
          <p>{{ selectedCard.description }}</p>
          <dl>
            <div><dt>许可与阅读边界</dt><dd>{{ selectedCard.license }}</dd></div>
            <div v-if="selectedCard.learningEntry"><dt>原文状态</dt><dd>{{ selectedCard.learningEntry.readable ? '应用内课程原文可读' : '仅书目登记，原文待接入' }}</dd></div>
          </dl>
          <div class="ll-detail-actions">
            <button type="button" @click="toggleShelf(selectedCard)">
              <BookmarkCheck v-if="isOnShelf(selectedCard)" :size="15" />
              <Bookmark v-else :size="15" />
              {{ isOnShelf(selectedCard) ? '移出书架' : '加入书架' }}
            </button>
            <button type="button" @click="openBook(selectedCard)">
              <BookOpen v-if="selectedCard.learningEntry" :size="15" />
              <BookMarked v-else :size="15" />
              {{ readLabel(selectedCard) }}
            </button>
          </div>
          <small v-if="!selectedCard.learningEntry">阅读在应用内完成；来源、账号和许可边界会显示在阅读器顶栏。</small>
        </template>

        <template v-else-if="activeView === 'sources' && selectedSource">
          <span>{{ accessLabel(selectedSource.access) }}</span>
          <h2>{{ selectedSource.name }}</h2>
          <p>{{ selectedSource.description }}</p>
          <dl>
            <div><dt>地址</dt><dd>{{ selectedSource.url }}</dd></div>
            <div><dt>许可说明</dt><dd>{{ selectedSource.license }}</dd></div>
            <div><dt>状态</dt><dd>{{ isSourceEnabled(selectedSource) ? '已启用' : '已停用' }}</dd></div>
          </dl>
          <div class="ll-detail-actions">
            <button type="button" @click="toggleSource(selectedSource)">{{ isSourceEnabled(selectedSource) ? '停用书源' : '启用书源' }}</button>
            <a :href="selectedSource.url" target="_blank" rel="noopener noreferrer"><ExternalLink :size="15" />打开站点</a>
          </div>
          <button
            v-if="customSources.some((source) => source.id === selectedSource?.id)"
            class="ll-delete-source"
            type="button"
            @click="deleteCustomSource(selectedSource)"
          ><Trash2 :size="14" />删除自定义书源</button>
        </template>
      </aside>
    </div>
  </section>
</template>

<style scoped src="./learning-library.css"></style>

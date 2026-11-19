<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  BookMarked, BookOpen, Bookmark, BookmarkCheck, Check, ChevronRight, ExternalLink, Library,
  LayoutGrid, List, LoaderCircle, Plus, Search, Trash2, TrendingUp, Upload, X,
} from 'lucide-vue-next';
import {
  LEARNING_V2_READING_CATEGORIES,
  LEARNING_V2_READING_COLLECTIONS,
  getLearningV2BookSources,
  getLearningV2ReadingCatalog,
  type LearningV2BookSource,
  type LearningV2BookSourceProvider,
  type LearningV2BookSourceRule,
  type LearningV2LibraryEntry,
  type LearningV2ReadingCategoryKey,
  type LearningV2ReadingCollectionKey,
  type LearningV2ReadingEntry,
  type LearningV2ReaderBook,
} from '@yan-zhi/shared';
import { api } from '../../../api/client';
import { decodeBookBytes, parseBookText } from './library-import';
import {
  listImportedBooks,
  saveImportedComic,
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
const FOLDERS_KEY = 'yz.learning.v2.library.folders.v1';
const BOOK_FOLDERS_KEY = 'yz.learning.v2.library.book-folders.v1';
const BOOK_VIEW_KEY = 'yz.learning.v2.library.book-view.v1';
const SOURCE_BOOKS_KEY = 'yz.learning.v2.library.source-books.v1';

type LibraryView = 'discover' | 'shelf' | 'sources';
type CategoryFilter = LearningV2ReadingCategoryKey | 'all';
type CollectionFilter = LearningV2ReadingCollectionKey | 'all';
type BookViewMode = 'card' | 'list';

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
  contentKind?: 'text' | 'comic';
  collections?: readonly LearningV2ReadingCollectionKey[];
  source?: LearningV2BookSource;
  sourceBook?: SourceBook;
};

type SourceForm = {
  name: string;
  url: string;
  category: LearningV2ReadingCategoryKey;
  license: string;
  json: string;
};

type SourceImportSummary = {
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ index: number; name: string; reason: string }>;
};

type SourceBook = {
  title: string;
  author: string;
  bookUrl: string;
  contentUrl?: string;
  coverUrl?: string;
  description: string;
  kind?: string;
  wordCount?: string;
  lastChapter?: string;
};

type ShelfFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
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
const folders = ref<ShelfFolder[]>([]);
const bookFolders = ref<Record<string, string>>({});
const currentFolderId = ref<string | null>(null);
const folderCreatorOpen = ref(false);
const newFolderName = ref('');
const folderError = ref('');
const bookViewMode = ref<BookViewMode>('card');
const sourceFormOpen = ref(false);
const sourceError = ref('');
const sourceImportSummary = ref<SourceImportSummary | null>(null);
const sourceJsonFileName = ref('');
const sourceJsonInput = ref<HTMLInputElement | null>(null);
const sourceForm = ref<SourceForm>({
  name: '',
  url: '',
  category: 'web-novel',
  license: '用户自行添加；仅用于打开授权或公版阅读页面',
  json: '',
});
const searchInput = ref<HTMLInputElement | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const importedBooks = ref<ImportedBookMeta[]>([]);
const importing = ref(false);
const importError = ref('');
const sourceQuery = ref('');
const sourceSearching = ref(false);
const sourceSearchError = ref('');
const sourceResults = ref<LibraryCard[]>([]);
const sourcePage = ref(1);
const sourceHasMore = ref(false);
const remoteSourceBooks = ref<Array<SourceBook & { id: string; sourceId: string }>>([]);

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
    readingMode: readableSourceForEntry(entry) ? 'source' : entry.readingMode,
    collections: entry.collections,
  }));
  const importedCards: LibraryCard[] = importedBooks.value.map((book) => ({
    id: `imported:${book.id}`,
    title: book.title,
    author: book.author,
    category: book.kind === 'comic' ? 'comics' : 'web-novel',
    sourceId: 'local-import',
    sourceName: '本地导入',
    license: '用户本地导入；仅保存在当前设备，不上传正文',
    description: book.kind === 'comic'
      ? `${book.pageCount || book.chapters} 页漫画 · 本地离线阅读`
      : `${book.chapters} 章 · ${book.characterCount.toLocaleString()} 字 · 支持继续阅读`,
    importedBookId: book.id,
    readingMode: 'import',
    contentKind: book.kind,
    collections: ['youth', 'adult'],
  }));
  const sourceCards: LibraryCard[] = remoteSourceBooks.value.flatMap((book) => {
    const source = allSources.value.find((item) => item.id === book.sourceId);
    return source ? [sourceCard(source, book, `source-book:${book.id}`)] : [];
  });
  const customCards: LibraryCard[] = customSources.value
    .filter((source) => !isSourceSearchable(source))
    .map((source) => ({
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
  return [...importedCards, ...sourceCards, ...readingCards, ...customCards, ...courseCards]
    .filter((card) =>
      card.category === 'course'
      || card.sourceId === 'local-import'
      || enabledSourceIds.has(card.sourceId),
    );
});
const visibleCards = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return cards.value.filter((card) => {
    if (activeView.value === 'shelf') {
      if (!shelfIds.value.includes(card.id)) return false;
      if ((bookFolders.value[card.id] || null) !== currentFolderId.value) return false;
    }
    if (categoryFilter.value !== 'all' && card.category !== categoryFilter.value) return false;
    if (collectionFilter.value !== 'all' && !card.collections?.includes(collectionFilter.value)) return false;
    if (!keyword) return true;
    return [card.title, card.author, card.sourceName, card.description, card.license]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
});
const showDiscoveryDashboard = computed(() => (
  activeView.value === 'discover'
  && categoryFilter.value === 'all'
  && collectionFilter.value === 'all'
  && !query.value.trim()
));
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
const childFolders = computed(() =>
  folders.value
    .filter((folder) => folder.parentId === currentFolderId.value)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
);
const folderPath = computed(() => {
  const path: ShelfFolder[] = [];
  let id = currentFolderId.value;
  const guard = new Set<string>();
  while (id && !guard.has(id)) {
    guard.add(id);
    const folder = folders.value.find((item) => item.id === id);
    if (!folder) break;
    path.unshift(folder);
    id = folder.parentId;
  }
  return path;
});

function categoryLabel(key: LearningV2ReadingCategoryKey): string {
  return LEARNING_V2_READING_CATEGORIES.find((category) => category.key === key)?.label || key;
}

function isSourceSearchable(source: LearningV2BookSource): boolean {
  return !!source.provider || !!source.rule;
}

function sourceProviderLabel(provider?: LearningV2BookSourceProvider): string {
  if (provider === 'gutendex') return 'Project Gutenberg';
  if (provider === 'mediawiki') return '开放百科';
  return '规则书源';
}

function isInsecureSource(source: LearningV2BookSource): boolean {
  return source.insecure === true || /^http:\/\//i.test(source.url);
}

function sourceConnectionLabel(source: LearningV2BookSource): string {
  return isInsecureSource(source) ? 'HTTP 不安全' : accessLabel(source.access);
}

function sourceBookHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sourceCard(source: LearningV2BookSource, book: SourceBook, id?: string): LibraryCard {
  return {
    id: id || `source-book:${source.id}:${sourceBookHash(book.bookUrl)}`,
    title: book.title,
    author: book.author,
    category: source.category,
    sourceId: source.id,
    sourceName: source.name,
    url: book.bookUrl,
    license: source.license,
    description: book.description || `${source.name} 书目`,
    readingMode: 'source',
    source,
    sourceBook: book,
  };
}

function readableSourceForEntry(entry: LearningV2ReadingEntry): LearningV2BookSource | undefined {
  if (entry.readingMode !== 'external') return undefined;
  const source = allSources.value.find((item) => item.id === entry.sourceId);
  if (!source?.provider) return undefined;
  try {
    const url = new URL(entry.url);
    if (source.provider === 'gutendex') {
      return /gutenberg\.org$/i.test(url.hostname) && /^\/ebooks\/\d+\/?$/.test(url.pathname)
        ? source
        : undefined;
    }
    if (source.provider === 'mediawiki') {
      const sourceHost = new URL(source.url).hostname;
      return url.hostname === sourceHost && /^\/wiki\/[^/?#]+/.test(url.pathname) ? source : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function coverTone(index: number): number {
  return index % 6;
}

function accessLabel(access: LearningV2BookSource['access']): string {
  if (access === 'authorized-platform') return '官方授权平台';
  if (access === 'library') return '馆藏或借阅';
  return '公版或开放许可';
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
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

function readRemoteSourceBooks(): Array<SourceBook & { id: string; sourceId: string }> {
  try {
    const value = JSON.parse(localStorage.getItem(SOURCE_BOOKS_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((book): book is SourceBook & { id: string; sourceId: string } =>
      !!book
      && typeof book.id === 'string'
      && typeof book.sourceId === 'string'
      && typeof book.title === 'string'
      && typeof book.author === 'string'
      && typeof book.bookUrl === 'string'
      && typeof book.description === 'string',
    );
  } catch {
    return [];
  }
}

function readObject(key: string): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

function readFolders(): ShelfFolder[] {
  try {
    const value = JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((folder): folder is ShelfFolder =>
      !!folder
      && typeof folder.id === 'string'
      && typeof folder.name === 'string'
      && (typeof folder.parentId === 'string' || folder.parentId === null)
      && Number.isFinite(folder.createdAt),
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
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders.value));
    localStorage.setItem(BOOK_FOLDERS_KEY, JSON.stringify(bookFolders.value));
    localStorage.setItem(BOOK_VIEW_KEY, bookViewMode.value);
    localStorage.setItem(SOURCE_BOOKS_KEY, JSON.stringify(remoteSourceBooks.value));
  } catch { /* local library preferences are optional */ }
}

function restorePreferences() {
  shelfIds.value = readArray(SHELF_KEY);
  disabledSourceIds.value = readArray(DISABLED_SOURCES_KEY);
  customSources.value = readCustomSources();
  folders.value = readFolders();
  bookFolders.value = readObject(BOOK_FOLDERS_KEY);
  remoteSourceBooks.value = readRemoteSourceBooks();
  try {
    const savedView = localStorage.getItem(BOOK_VIEW_KEY);
    if (savedView === 'card' || savedView === 'list') bookViewMode.value = savedView;
  } catch {
    // Display preference is optional.
  }
}

function selectView(view: LibraryView) {
  activeView.value = view;
  sourceFormOpen.value = false;
  sourceError.value = '';
  selectedCardId.value = '';
  detailOpen.value = false;
  folderCreatorOpen.value = false;
  folderError.value = '';
  if (view === 'discover') collectionFilter.value = 'all';
  if (view === 'shelf' && currentFolderId.value && !folders.value.some((folder) => folder.id === currentFolderId.value)) {
    currentFolderId.value = null;
  }
  if (view === 'sources') selectedSourceId.value = enabledSources.value[0]?.id || '';
}

function selectCard(card: LibraryCard) {
  selectedCardId.value = card.id;
  detailOpen.value = true;
}

function selectSource(source: LearningV2BookSource) {
  selectedSourceId.value = source.id;
  sourceQuery.value = '';
  sourceResults.value = [];
  sourceSearchError.value = '';
  sourceHasMore.value = false;
  sourcePage.value = 1;
  detailOpen.value = true;
}

async function searchSelectedSource() {
  const source = selectedSource.value;
  const keyword = sourceQuery.value.trim();
  sourceSearchError.value = '';
  if (!source) return;
  if (!isSourceSearchable(source)) {
    sourceSearchError.value = '这个书源只提供官方入口，请到官方站点登录或搜索。';
    return;
  }
  if (!keyword) {
    sourceSearchError.value = '请输入书名或作者。';
    return;
  }
  sourceSearching.value = true;
  try {
    const response = await api.post<{
      items: SourceBook[];
      page: number;
      hasMore: boolean;
    }>('/learning/library/source/search', {
      ...(source.provider ? { sourceId: source.id } : { source }),
      query: keyword,
      page: 1,
    });
    if ('error' in response) throw new Error(response.error);
    const items = Array.isArray(response.data.items) ? response.data.items : [];
    sourceResults.value = items.map((book) => sourceCard(source, book));
    sourcePage.value = Number(response.data.page) || 1;
    sourceHasMore.value = response.data.hasMore === true;
    if (!items.length) sourceSearchError.value = '没有找到匹配的书目，换个关键词试试。';
  } catch (error) {
    sourceResults.value = [];
    sourceHasMore.value = false;
    sourceSearchError.value = error instanceof Error ? error.message : '书源搜索失败。';
  } finally {
    sourceSearching.value = false;
  }
}

function addSourceBookToShelf(card: LibraryCard) {
  if (!card.sourceBook) return;
  const id = card.id.replace(/^source-book:/, '');
  remoteSourceBooks.value = [
    { id, sourceId: card.sourceId, ...card.sourceBook },
    ...remoteSourceBooks.value.filter((book) => book.id !== id),
  ];
  if (!shelfIds.value.includes(card.id)) shelfIds.value = [...shelfIds.value, card.id];
  persistPreferences();
}

function toggleShelf(card: LibraryCard) {
  shelfIds.value = shelfIds.value.includes(card.id)
    ? shelfIds.value.filter((id) => id !== card.id)
    : [...shelfIds.value, card.id];
  if (shelfIds.value.includes(card.id) && currentFolderId.value) {
    bookFolders.value = { ...bookFolders.value, [card.id]: currentFolderId.value };
  }
  if (!shelfIds.value.includes(card.id)) {
    const next = { ...bookFolders.value };
    delete next[card.id];
    bookFolders.value = next;
  }
  persistPreferences();
}

function isOnShelf(card: LibraryCard): boolean {
  return shelfIds.value.includes(card.id);
}

function folderBookCount(folderId: string): number {
  return shelfIds.value.filter((id) => bookFolders.value[id] === folderId).length;
}

function folderLabel(folder: ShelfFolder): string {
  const labels: string[] = [folder.name];
  let parentId = folder.parentId;
  const guard = new Set<string>();
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId);
    const parent = folders.value.find((item) => item.id === parentId);
    if (!parent) break;
    labels.unshift(parent.name);
    parentId = parent.parentId;
  }
  return labels.join(' / ');
}

function openFolder(folder: ShelfFolder) {
  currentFolderId.value = folder.id;
  selectedCardId.value = '';
  query.value = '';
  detailOpen.value = false;
}

function goFolder(folderId: string | null) {
  currentFolderId.value = folderId;
  selectedCardId.value = '';
  detailOpen.value = false;
}

function createFolder() {
  folderError.value = '';
  const name = newFolderName.value.trim();
  if (!name) {
    folderError.value = '请输入目录名称。';
    return;
  }
  const sibling = folders.value.some(
    (folder) => folder.parentId === currentFolderId.value && folder.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (sibling) {
    folderError.value = '当前目录下已有同名目录。';
    return;
  }
  const folder: ShelfFolder = {
    id: `shelf-folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    parentId: currentFolderId.value,
    createdAt: Date.now(),
  };
  folders.value = [...folders.value, folder];
  newFolderName.value = '';
  folderCreatorOpen.value = false;
  persistPreferences();
}

function deleteFolder(folder: ShelfFolder) {
  const parentId = folder.parentId;
  folders.value = folders.value
    .filter((item) => item.id !== folder.id)
    .map((item) => item.parentId === folder.id ? { ...item, parentId } : item);
  const nextAssignments = { ...bookFolders.value };
  for (const bookId of Object.keys(nextAssignments)) {
    if (nextAssignments[bookId] === folder.id) {
      if (parentId) nextAssignments[bookId] = parentId;
      else delete nextAssignments[bookId];
    }
  }
  bookFolders.value = nextAssignments;
  if (currentFolderId.value === folder.id) currentFolderId.value = parentId;
  persistPreferences();
}

function moveBook(card: LibraryCard, folderId: string) {
  const next = { ...bookFolders.value };
  if (folderId) next[card.id] = folderId;
  else delete next[card.id];
  bookFolders.value = next;
  persistPreferences();
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
      contentKind: imported.kind,
      importedBookId: imported.id,
      sourceName: '本地导入',
      license: card.license,
      annotations: [],
      collectionLabels: ['网络小说', '本地书架'],
    });
    return;
  }
  if (card.source && card.sourceBook) {
    emit('readBook', {
      id: card.id,
      title: card.sourceBook.title,
      author: card.sourceBook.author,
      language: 'zh-Hans',
      readingMode: 'source',
      sourceId: card.source.id,
      source: card.source,
      bookUrl: card.sourceBook.bookUrl,
      contentUrl: card.sourceBook.contentUrl,
      sourceName: card.sourceName,
      license: card.license,
      annotations: [],
      collectionLabels: [categoryLabel(card.category), card.sourceName],
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
  const source = readableSourceForEntry(entry);
  return {
    id: entry.id,
    title: entry.title,
    author: entry.author,
    language: entry.language,
    readingMode: source ? 'source' : entry.readingMode,
      contentKind: entry.category === 'comics' ? 'comic' : 'text',
    assetKey: entry.assetKey,
    url: entry.url,
    ...(source ? {
      sourceId: source.id,
      source,
      bookUrl: entry.url,
    } : {}),
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
  if (card.readingMode === 'source') return '应用内阅读';
  if (card.readingMode === 'platform') return '应用内打开';
  return '阅读导读';
}

function chooseImport() {
  importError.value = '';
  importInput.value?.click();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

async function importLocalBook(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  importing.value = true;
  importError.value = '';
  try {
    const imageFiles = files
      .filter((file) => file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(file.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    if (imageFiles.length) {
      const pages = await Promise.all(imageFiles.map(readFileAsDataUrl));
      const comicTitle = imageFiles[0].name
        .replace(/\.[^.]+$/, '')
        .replace(/[-_ ]?\d+$/, '')
        .trim() || '本地漫画';
      const saved = await saveImportedComic(comicTitle, pages);
      const meta: ImportedBookMeta = {
        id: saved.id,
        title: saved.title,
        author: saved.author,
        kind: 'comic',
        chapters: saved.chapters,
        characterCount: 0,
        pageCount: pages.length,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
      importedBooks.value = [meta, ...importedBooks.value];
      if (!shelfIds.value.includes(`imported:${meta.id}`)) {
        shelfIds.value = [...shelfIds.value, `imported:${meta.id}`];
      }
      activeView.value = 'discover';
      categoryFilter.value = 'comics';
      query.value = '';
      const card = cards.value.find((item) => item.importedBookId === meta.id);
      if (card) openBook(card);
      return;
    }
    const file = files[0];
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      importError.value = '当前支持 TXT、MD 文本和 JPG/PNG/WebP 图片漫画。';
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raw = decodeBookBytes(bytes);
    const parsed = parseBookText(raw, file.name);
    if (!parsed.chapters.length) throw new Error('没有识别到可阅读正文。');
    const saved = await saveImportedBook(parsed, raw);
    const meta: ImportedBookMeta = {
      id: saved.id,
      title: saved.title,
      author: saved.author,
      kind: 'text',
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
  remoteSourceBooks.value = remoteSourceBooks.value.filter((book) => book.sourceId !== source.id);
  shelfIds.value = shelfIds.value.filter((id) => !id.startsWith(`source-book:${source.id}:`));
  if (selectedSourceId.value === source.id) selectedSourceId.value = builtInSources[0]?.id || '';
  sourceResults.value = [];
  persistPreferences();
}

function chooseSourceJsonFile() {
  sourceJsonInput.value?.click();
}

async function importSourceJsonFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  sourceError.value = '';
  if (file.size > 8 * 1024 * 1024) {
    sourceError.value = '书源文件不能超过 8 MB。';
    return;
  }
  try {
    sourceForm.value.json = await file.text();
    sourceJsonFileName.value = file.name;
  } catch {
    sourceError.value = '书源文件读取失败。';
  }
}

async function submitCustomSource() {
  sourceError.value = '';
  sourceImportSummary.value = null;
  const name = sourceForm.value.name.trim();
  const license = sourceForm.value.license.trim();
  const sourceJson = sourceForm.value.json.trim();
  let url = '';
  try {
    if (sourceForm.value.url.trim()) {
      const parsed = new URL(sourceForm.value.url.trim());
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol');
      url = parsed.toString();
    }
  } catch {
    sourceError.value = '书源地址必须是完整的 HTTP 或 HTTPS 地址。';
    return;
  }
  if (!license) {
    sourceError.value = '请填写许可说明。';
    return;
  }
  if (!sourceJson && !url) {
    sourceError.value = '请填写书源地址，或粘贴标准书源 JSON。';
    return;
  }
  const shouldImportJson = !!sourceJson || /\.(json|txt)(?:$|[?#])/i.test(url);
  if (shouldImportJson) {
    try {
      const response = await api.post<{
        sources: Array<{
          name: string;
          url: string;
          group?: string;
          rule: LearningV2BookSourceRule;
        }>;
        total?: number;
        imported?: number;
        skipped?: number;
        errors?: Array<{ index: number; name: string; reason: string }>;
      }>('/learning/library/sources/import', sourceJson ? { json: sourceJson } : { url });
      if ('error' in response) throw new Error(response.error);
      const imported = Array.isArray(response.data.sources) ? response.data.sources : [];
      if (!imported.length) throw new Error('书源文件里没有可用规则。');
      const nextSources = imported.map((item, index): LearningV2BookSource => ({
        id: `custom-${Date.now()}-${index}`,
        name: item.name || name || `自定义书源 ${index + 1}`,
        url: item.url,
        category: sourceForm.value.category,
        access: sourceForm.value.category === 'web-novel' ? 'authorized-platform' : 'public-domain',
        license,
        description: `${item.group || '标准规则书源'} · 支持应用内搜索、目录与正文阅读`,
        rule: item.rule,
        insecure: /^http:\/\//i.test(item.url),
      }));
      const importedCount = Number(response.data.imported);
      const skippedCount = Number(response.data.skipped);
      sourceImportSummary.value = {
        total: Number(response.data.total) || imported.length + (Number.isFinite(skippedCount) ? skippedCount : 0),
        imported: Number.isFinite(importedCount) ? importedCount : imported.length,
        skipped: Number.isFinite(skippedCount) ? skippedCount : 0,
        errors: Array.isArray(response.data.errors) ? response.data.errors : [],
      };
      customSources.value = [...customSources.value, ...nextSources];
      selectedSourceId.value = nextSources[0].id;
      detailOpen.value = true;
      sourceFormOpen.value = false;
      sourceJsonFileName.value = '';
      sourceForm.value = {
        name: '',
        url: '',
        category: 'web-novel',
        license: '用户自行添加；仅用于授权、公版或开放许可内容',
        json: '',
      };
      persistPreferences();
      return;
    } catch (error) {
      sourceError.value = error instanceof Error ? error.message : '书源导入失败。';
      return;
    }
  }
  const source: LearningV2BookSource = {
    id: `custom-${Date.now()}`,
    name: name || sourceHost(url),
    url,
    category: sourceForm.value.category,
    access: sourceForm.value.category === 'web-novel' ? 'authorized-platform' : 'public-domain',
    license,
    description: '用户自行添加的站点入口。若站点提供标准书源 JSON，可导入后在本应用内搜索和阅读。',
    insecure: /^http:\/\//i.test(url),
  };
  customSources.value = [...customSources.value, source];
  selectedSourceId.value = source.id;
  detailOpen.value = true;
  sourceFormOpen.value = false;
  sourceJsonFileName.value = '';
  sourceForm.value = {
    name: '',
    url: '',
    category: 'web-novel',
    license: '用户自行添加；仅用于打开授权或公版阅读页面',
    json: '',
  };
  persistPreferences();
}

watch(
  [shelfIds, customSources, disabledSourceIds, folders, bookFolders, bookViewMode, remoteSourceBooks],
  persistPreferences,
  { deep: true },
);
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
          <p>支持标准书源 JSON 与公版/开放接口。应用只读取可公开访问的搜索、目录和正文，不绕过登录、付费或地区限制。</p>
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
            <div class="ll-view-toggle" role="group" aria-label="书本显示方式">
              <button
                type="button"
                :class="{ active: bookViewMode === 'card' }"
                :aria-pressed="bookViewMode === 'card'"
                aria-label="卡片模式"
                title="卡片模式"
                @click="bookViewMode = 'card'"
              ><LayoutGrid :size="16" /></button>
              <button
                type="button"
                :class="{ active: bookViewMode === 'list' }"
                :aria-pressed="bookViewMode === 'list'"
                aria-label="列表模式"
                title="列表模式"
                @click="bookViewMode = 'list'"
              ><List :size="16" /></button>
            </div>
            <button type="button" class="ll-import" :disabled="importing" @click="chooseImport">
              <Upload :size="15" /><span class="ll-import-label">{{ importing ? '正在导入' : '导入书/漫画' }}</span>
            </button>
            <input
              ref="importInput"
              data-import-book-input
              class="ll-import-input"
              type="file"
              accept=".txt,.md,.markdown,.jpg,.jpeg,.png,.webp,.gif,.avif,text/plain,text/markdown,image/*"
              multiple
              @change="importLocalBook"
            />
          </div>
          <p v-if="importError" class="ll-import-error" role="alert">{{ importError }}</p>
          <section v-if="showDiscoveryDashboard" class="ll-discovery-dashboard" aria-label="今日阅读概览">
            <article class="ll-weekly-card">
              <header>
                <span><TrendingUp :size="14" />本周阅读</span>
                <small>{{ shelfCount }} 本在书架</small>
              </header>
              <b>{{ visibleCards[0]?.title || '从推荐书目开始' }}</b>
              <div class="ll-week-days" aria-label="本周阅读记录">
                <i v-for="day in 7" :key="day" :class="{ active: day <= Math.min(7, Math.max(1, shelfCount)) }">
                  {{ '一二三四五六日'[day - 1] }}
                </i>
              </div>
              <button type="button" :disabled="!visibleCards[0]" @click="visibleCards[0] && selectCard(visibleCards[0])">
                继续阅读<ChevronRight :size="13" />
              </button>
            </article>

            <section class="ll-continue-strip">
              <header>
                <div><span>继续阅读</span><small>最近可读与推荐书目</small></div>
                <button type="button" @click="selectView('shelf')">查看书架</button>
              </header>
              <div class="ll-continue-rail">
                <button
                  v-for="(card, index) in visibleCards.slice(0, 6)"
                  :key="`continue-${card.id}`"
                  type="button"
                  @click="selectCard(card)"
                >
                  <span class="ll-feature-cover" :data-category="card.category" :data-tone="coverTone(index)">
                    <strong>{{ card.title }}</strong>
                  </span>
                  <b>{{ card.title }}</b>
                  <small>{{ card.author }}</small>
                </button>
              </div>
            </section>
          </section>

          <section v-if="showDiscoveryDashboard" class="ll-rank-panel" aria-label="推荐榜">
            <header>
              <div><span>推荐榜</span><b>正在被阅读的经典与新知</b></div>
              <small>按馆藏热度与课程关联整理</small>
            </header>
            <div class="ll-rank-grid">
              <button
                v-for="(card, index) in visibleCards.slice(0, 8)"
                :key="`rank-${card.id}`"
                type="button"
                @click="selectCard(card)"
              >
                <em>{{ index + 1 }}</em>
                <span class="ll-rank-cover" :data-category="card.category" :data-tone="coverTone(index)">
                  {{ card.title.slice(0, 1) }}
                </span>
                <span><b>{{ card.title }}</b><small>{{ categoryLabel(card.category) }} · {{ card.sourceName }}</small></span>
                <ChevronRight :size="14" />
              </button>
            </div>
          </section>

          <div v-if="activeView === 'shelf'" class="ll-shelf-tools">
            <nav class="ll-folder-path" aria-label="书架目录">
              <button type="button" :class="{ active: currentFolderId === null }" @click="goFolder(null)">书架</button>
              <template v-for="folder in folderPath" :key="folder.id">
                <ChevronRight :size="13" />
                <button type="button" :class="{ active: currentFolderId === folder.id }" @click="goFolder(folder.id)">{{ folder.name }}</button>
              </template>
            </nav>
            <button type="button" class="ll-create-folder" @click="folderCreatorOpen = !folderCreatorOpen">
              <Plus :size="15" />新建目录
            </button>
          </div>
          <form v-if="activeView === 'shelf' && folderCreatorOpen" class="ll-folder-form" @submit.prevent="createFolder">
            <label><span>目录名称</span><input v-model="newFolderName" autofocus placeholder="例如：中国古典小说" /></label>
            <button type="submit">创建</button>
            <button type="button" @click="folderCreatorOpen = false">取消</button>
            <p v-if="folderError">{{ folderError }}</p>
          </form>
          <div v-if="activeView === 'shelf' && childFolders.length" class="ll-folder-grid">
            <article v-for="folder in childFolders" :key="folder.id" class="ll-folder-card">
              <button type="button" class="ll-folder-open" @click="openFolder(folder)">
                <span><BookMarked :size="21" /></span>
                <strong>{{ folder.name }}</strong>
                <small>{{ folderBookCount(folder.id) }} 本书</small>
              </button>
              <button type="button" class="ll-folder-delete" :aria-label="`删除目录 ${folder.name}`" title="删除目录" @click="deleteFolder(folder)">
                <Trash2 :size="14" />
              </button>
            </article>
          </div>
          <div v-if="visibleCards.length" class="ll-all-books-head">
            <div><span>全部馆藏</span><small>{{ visibleCards.length }} 条</small></div>
          </div>
          <div v-if="visibleCards.length" class="ll-card-grid" :class="`view-${bookViewMode}`">
            <article
              v-for="(card, index) in visibleCards"
              :key="card.id"
              class="ll-book-card"
              :class="{ selected: selectedCard?.id === card.id }"
            >
              <button type="button" class="ll-book-main" @click="selectCard(card)">
                <span class="ll-book-cover" :data-category="card.category" :data-tone="coverTone(index)" aria-hidden="true">
                  <BookMarked :size="20" />
                  <strong class="ll-book-cover-title">{{ card.title }}</strong>
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
            <b>{{ activeView === 'shelf' ? (currentFolderId ? '这个目录还没有书' : '书架还没有这本书') : '没有匹配的书目' }}</b>
            <p>{{ activeView === 'shelf' ? (currentFolderId ? '在“发现”里打开书本详情，再把书移动到这个目录。' : '在“发现”里选择书目，再加入书架。') : '换一个关键词或分类试试。' }}</p>
          </div>
        </template>

        <template v-else>
          <header class="ll-source-head">
            <div><span>来源管理</span><h2>书源</h2></div>
            <button type="button" @click="sourceFormOpen = !sourceFormOpen"><Plus :size="15" />导入书源</button>
          </header>
          <div v-if="sourceImportSummary" class="ll-source-import-result" data-source-import-summary role="status">
            <b>已导入 {{ sourceImportSummary.imported }} 条，跳过 {{ sourceImportSummary.skipped }} 条</b>
            <small>共 {{ sourceImportSummary.total }} 条；跳过项不会影响其他书源。</small>
            <ul v-if="sourceImportSummary.errors.length">
              <li v-for="error in sourceImportSummary.errors.slice(0, 4)" :key="`${error.index}-${error.name}`">
                第 {{ error.index }} 条「{{ error.name }}」：{{ error.reason }}
              </li>
            </ul>
          </div>
          <form v-if="sourceFormOpen" class="ll-source-form" @submit.prevent="submitCustomSource">
            <label><span>名称</span><input v-model="sourceForm.name" placeholder="例如：我的授权书库" /></label>
            <label><span>HTTP / HTTPS 地址</span><input v-model="sourceForm.url" type="url" placeholder="https://... 或 http://..." /></label>
            <label>
              <span>分类</span>
              <select v-model="sourceForm.category">
                <option v-for="category in LEARNING_V2_READING_CATEGORIES.filter((item) => item.key !== 'course')" :key="category.key" :value="category.key">{{ category.label }}</option>
              </select>
            </label>
            <label class="wide"><span>许可说明</span><input v-model="sourceForm.license" placeholder="公版、开放许可或官方授权依据" /></label>
            <label class="wide">
              <span>书源 JSON（可选）</span>
              <textarea v-model="sourceForm.json" rows="5" placeholder="粘贴 JSON 内容，支持单个对象或数组；也可直接选择 .json / .txt 文件"></textarea>
            </label>
            <label class="wide ll-source-file-field">
              <span>本地文件</span>
              <button type="button" @click="chooseSourceJsonFile"><Upload :size="14" />选择 JSON 文件</button>
              <input
                ref="sourceJsonInput"
                data-source-json-file
                type="file"
                accept=".json,.txt,application/json,text/plain"
                @change="importSourceJsonFile"
              />
              <small v-if="sourceJsonFileName">{{ sourceJsonFileName }}</small>
            </label>
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
              <span>
                <b>{{ source.name }}</b>
                <small>
                  {{ categoryLabel(source.category) }} ·
                  {{ isSourceSearchable(source)
                    ? `可搜索阅读${isInsecureSource(source) ? ' · HTTP 不安全' : ''}`
                    : sourceConnectionLabel(source) }}
                </small>
              </span>
              <em>{{ customSources.some((item) => item.id === source.id) ? '自定义' : isSourceSearchable(source) ? '可读' : '入口' }}</em>
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
          <label v-if="isOnShelf(selectedCard)" class="ll-move-book">
            <span>所在目录</span>
            <select :value="bookFolders[selectedCard.id] || ''" @change="moveBook(selectedCard, ($event.target as HTMLSelectElement).value)">
              <option value="">书架根目录</option>
              <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folderLabel(folder) }}</option>
            </select>
          </label>
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
          <header class="ll-source-detail-head">
            <span class="ll-source-kicker">{{ isInsecureSource(selectedSource) ? 'HTTP 不安全' : accessLabel(selectedSource.access) }}</span>
            <h2>{{ selectedSource.name }}</h2>
            <p>{{ selectedSource.description }}</p>
            <div class="ll-source-badges">
              <span>{{ categoryLabel(selectedSource.category) }}</span>
              <span>{{ isSourceSearchable(selectedSource) ? sourceProviderLabel(selectedSource.provider) : '官方入口' }}</span>
              <span v-if="isInsecureSource(selectedSource)" class="is-warning">HTTP 不安全</span>
              <span :class="{ 'is-off': !isSourceEnabled(selectedSource) }">
                {{ isSourceEnabled(selectedSource) ? '已启用' : '已停用' }}
              </span>
              <span>{{ customSources.some((source) => source.id === selectedSource?.id) ? '自定义' : '内置' }}</span>
            </div>
          </header>
          <form v-if="isSourceSearchable(selectedSource)" class="ll-source-search" @submit.prevent="searchSelectedSource">
            <label>
              <Search :size="15" />
              <input
                v-model="sourceQuery"
                data-source-search
                type="search"
                placeholder="搜索这个书源里的书名或作者"
              />
            </label>
            <button type="submit" data-source-search-submit :disabled="sourceSearching">
              <LoaderCircle v-if="sourceSearching" class="ll-spin" :size="15" />
              <Search v-else :size="15" />
              {{ sourceSearching ? '搜索中' : '搜索' }}
            </button>
          </form>
          <p v-if="sourceSearchError" class="ll-source-search-error" role="alert">{{ sourceSearchError }}</p>
          <section v-if="sourceResults.length" class="ll-source-results" aria-label="书源搜索结果">
            <article v-for="(card, index) in sourceResults" :key="card.id" class="ll-source-result">
              <span class="ll-source-result-cover" :data-tone="coverTone(index)" aria-hidden="true">
                {{ card.title.slice(0, 1) }}
              </span>
              <div>
                <b>{{ card.title }}</b>
                <small>{{ card.author }}</small>
                <p>{{ card.description }}</p>
              </div>
              <footer>
                <button type="button" data-source-shelf @click="addSourceBookToShelf(card)">
                  <BookmarkCheck v-if="shelfIds.includes(card.id)" :size="14" />
                  <Bookmark v-else :size="14" />
                  {{ shelfIds.includes(card.id) ? '已在书架' : '加入书架' }}
                </button>
                <button type="button" data-source-read @click="openBook(card)">
                  <BookOpen :size="14" />阅读
                </button>
              </footer>
            </article>
          </section>
          <section class="ll-source-detail-section">
            <h3>阅读与授权</h3>
            <p>{{ selectedSource.license }}</p>
          </section>
          <section class="ll-source-detail-section">
            <h3>站点地址</h3>
            <div class="ll-source-domain"><ExternalLink :size="14" /><b>{{ sourceHost(selectedSource.url) }}</b></div>
            <code>{{ selectedSource.url }}</code>
          </section>
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

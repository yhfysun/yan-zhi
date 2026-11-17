import type { ImportedBookChapter, ParsedImportedBook } from './library-import';

const DB_NAME = 'yz-learning-library';
const DB_VERSION = 1;
const BOOK_STORE = 'imported-books';
const PROGRESS_KEY = 'yz.learning.v2.reader.progress.v1';

export type ImportedBookMeta = {
  id: string;
  title: string;
  author: string;
  chapters: number;
  characterCount: number;
  createdAt: number;
  updatedAt: number;
};

export type ImportedBookRecord = ImportedBookMeta & {
  text: string;
  parsedChapters: ImportedBookChapter[];
};

export type ReaderProgress = {
  chapterIndex: number;
  scrollRatio: number;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持本地书库存储'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        const store = db.createObjectStore(BOOK_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本地书库'));
  });
  return dbPromise;
}

function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, mode);
    const request = action(tx.objectStore(BOOK_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地书库操作失败'));
  }));
}

function idForBook(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `import-${crypto.randomUUID()}`;
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveImportedBook(
  parsed: ParsedImportedBook,
  rawText: string,
  author = '本地导入',
): Promise<ImportedBookRecord> {
  const now = Date.now();
  const record: ImportedBookRecord = {
    id: idForBook(),
    title: parsed.title,
    author,
    chapters: parsed.chapters.length,
    characterCount: parsed.characterCount,
    createdAt: now,
    updatedAt: now,
    text: rawText,
    parsedChapters: parsed.chapters,
  };
  await transact('readwrite', (store) => store.put(record));
  return record;
}

export async function getImportedBook(id: string): Promise<ImportedBookRecord | null> {
  return (await transact('readonly', (store) => store.get(id))) || null;
}

export async function listImportedBooks(): Promise<ImportedBookMeta[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const values = await transact<ImportedBookRecord[]>('readonly', (store) => store.getAll() as IDBRequest<ImportedBookRecord[]>);
    return values
      .map(({ text: _text, parsedChapters: _chapters, ...meta }) => meta)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function deleteImportedBook(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id));
}

export function readReaderProgress(bookId: string): ReaderProgress | null {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, ReaderProgress>;
    return all[bookId] || null;
  } catch {
    return null;
  }
}

export function saveReaderProgress(bookId: string, progress: Omit<ReaderProgress, 'updatedAt'>): void {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, ReaderProgress>;
    all[bookId] = { ...progress, updatedAt: Date.now() };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Reading remains available when storage is unavailable.
  }
}

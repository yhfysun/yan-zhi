import type { LearningSubjectContentPack } from '@yan-zhi/shared';

const DB_NAME = 'yz-learning-content';
const DB_VERSION = 1;
const STORE = 'subject-packs';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'subject.key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function listStoredLearningContentPacks(): Promise<LearningSubjectContentPack[]> {
  const database = await openDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(STORE, 'readonly');
    const rows = await requestResult(transaction.objectStore(STORE).getAll());
    return rows as LearningSubjectContentPack[];
  } catch {
    return [];
  } finally {
    database.close();
  }
}

export async function saveStoredLearningContentPack(
  pack: LearningSubjectContentPack,
): Promise<void> {
  const database = await openDatabase();
  if (!database) throw new Error('当前环境不支持本地内容包存储');
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    await requestResult(transaction.objectStore(STORE).put(pack));
  } finally {
    database.close();
  }
}

export async function removeStoredLearningContentPack(subjectKey: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE, 'readwrite');
    await requestResult(transaction.objectStore(STORE).delete(subjectKey));
  } finally {
    database.close();
  }
}

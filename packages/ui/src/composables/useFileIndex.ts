// 文件索引 composable（懒加载、非实时）
// 首次搜索某项目时拉取全量文件清单（/workspace/tree recursive 分页），缓存到内存，
// 供文件名即时搜索与范围建议使用；不监听文件系统，需刷新时显式调用 refresh()。
import { ref, watch, type Ref } from 'vue';
import { api } from '../api/client';

export interface IndexEntry {
  name: string;
  relPath: string;
  isDir: boolean;
  size: number;
}

const TREE_PAGE = 5000;
const INDEX_FILE_CAP = 40000; // 索引文件数上限，超大项目只索引前 N 个

export function useFileIndex(dir: Ref<string>) {
  const ready = ref(false);
  const loading = ref(false);
  const error = ref('');
  /** 仅缓存文件（非目录），relPath 相对项目根 */
  const files = ref<IndexEntry[]>([]);
  const totalFiles = ref(0);
  const truncated = ref(false);
  /** 索引构建时间（ms 时间戳），用于 UI 提示「索引于 xx 建立」 */
  const builtAt = ref(0);

  function reset() {
    ready.value = false;
    loading.value = false;
    error.value = '';
    files.value = [];
    totalFiles.value = 0;
    truncated.value = false;
    builtAt.value = 0;
  }

  async function build() {
    const root = dir.value;
    if (!root) {
      reset();
      return;
    }
    if (loading.value) return;
    loading.value = true;
    error.value = '';
    const collected: IndexEntry[] = [];
    let offset = 0;
    let hasMore = true;
    let capped = false;
    try {
      while (hasMore && collected.length < INDEX_FILE_CAP) {
        const r = await api.get<{ entries: IndexEntry[]; hasMore: boolean }>(
          `/workspace/tree?dir=${encodeURIComponent(root)}&recursive=1&offset=${offset}&limit=${TREE_PAGE}`,
        );
        if ('error' in r) {
          error.value = r.error;
          break;
        }
        const page = r.data.entries || [];
        for (const e of page) if (!e.isDir) collected.push(e);
        hasMore = !!r.data.hasMore;
        offset += page.length;
        if (hasMore && page.length === 0) hasMore = false;
        if (collected.length >= INDEX_FILE_CAP) { capped = true; break; }
      }
      if (!error.value) {
        files.value = collected;
        totalFiles.value = collected.length;
        truncated.value = capped || hasMore;
        ready.value = true;
        builtAt.value = Date.now();
      }
    } catch (e: any) {
      error.value = e?.message || '索引构建失败';
    } finally {
      loading.value = false;
    }
  }

  /** 复用已构建索引；未构建则懒加载 */
  async function ensure() {
    if (ready.value || loading.value) return;
    await build();
  }

  function refresh() {
    reset();
    return build();
  }

  /** 文件名匹配（不区分大小写子串；q 为空返回空） */
  function filenameMatch(q: string, limit = 500): IndexEntry[] {
    const term = q.trim().toLowerCase();
    if (!term || !ready.value) return [];
    const out: IndexEntry[] = [];
    for (const f of files.value) {
      if (f.name.toLowerCase().includes(term)) {
        out.push(f);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  watch(
    dir,
    () => reset(),
    { immediate: true },
  );

  return {
    ready, loading, error, files, totalFiles, truncated, builtAt,
    build, ensure, refresh, filenameMatch,
  };
}

// Git store（前端调用 /api/git）
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';

export interface GitFileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  gitStatus?: string;
  size?: number;
}

export interface GitNumstatEntry {
  path: string;
  added: number;
  deleted: number;
}

export interface GitAheadBehind {
  ahead: number;
  behind: number;
}

/** status 接口返回的单个文件条目（simple-git 结构） */
export interface GitStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

/** 分支切换结果（后端 /git/checkout 返回） */
export interface GitCheckoutResult {
  ok: boolean;
  conflicts: string[];
  dirty: string[];
  stashed: boolean;
  message: string;
}

export const useGitStore = defineStore('git', () => {
  const supported = ref(false);
  const status = ref<Record<string, unknown> | null>(null);
  const fileTree = ref<GitFileNode[]>([]);
  const branches = ref<string[]>([]);
  const log = ref<Record<string, unknown> | null>(null);

  async function checkCapability(): Promise<void> {
    const res = await api.get<{ supported: boolean }>('/git/capability');
    supported.value = 'data' in res ? res.data.supported : false;
  }

  async function fetchStatus(repo: string): Promise<void> {
    const res = await api.get<Record<string, unknown>>(`/git/status?repo=${encodeURIComponent(repo)}`);
    if ('data' in res) status.value = res.data;
  }

  /** 只读当前仓库状态（不写全局 status，避免多仓库并发串数据） */
  async function fetchStatusRaw(repo: string): Promise<{ branch: string; files: GitStatusFile[] }> {
    const res = await api.get<Record<string, unknown>>(`/git/status?repo=${encodeURIComponent(repo)}`);
    if (!('data' in res)) throw new Error(('error' in res && res.error) || '读取仓库状态失败');
    const d = (res.data || {}) as { current?: string; files?: GitStatusFile[] };
    return {
      branch: d.current || '',
      files: Array.isArray(d.files) ? d.files : [],
    };
  }

  async function fetchFileTree(repo: string, subPath = ''): Promise<void> {
    const res = await api.get<GitFileNode[]>(
      `/git/fileTree?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(subPath)}`,
    );
    if ('data' in res) fileTree.value = res.data;
  }

  async function fetchBranches(repo: string): Promise<void> {
    const res = await api.get<string[]>(`/git/branches?repo=${encodeURIComponent(repo)}`);
    if ('data' in res) branches.value = res.data;
  }

  async function fetchLog(repo: string): Promise<void> {
    const res = await api.get<Record<string, unknown>>(`/git/log?repo=${encodeURIComponent(repo)}&n=30`);
    if ('data' in res) log.value = res.data;
  }

  async function readFile(repo: string, filePath: string): Promise<string> {
    const res = await api.get<string>(
      `/git/readFile?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}`,
    );
    return 'data' in res ? res.data : '';
  }

  async function diff(repo: string, opts: { file?: string; staged?: boolean } = {}): Promise<string> {
    const res = await api.get<string>(
      `/git/diff?repo=${encodeURIComponent(repo)}&file=${encodeURIComponent(opts.file || '')}&staged=${opts.staged ? '1' : '0'}`,
    );
    return 'data' in res ? res.data : '';
  }

  async function show(repo: string, filePath: string, ref = 'HEAD'): Promise<string> {
    const res = await api.get<string>(
      `/git/show?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(ref)}`,
    );
    return 'data' in res ? res.data : '';
  }

  async function add(repo: string, files: string[]) {
    return api.post('/git/add', { repo, files });
  }
  async function commit(repo: string, message: string, files?: string[]) {
    return api.post('/git/commit', { repo, message, files });
  }
  /** 追加到上次提交（--amend） */
  async function commitAmend(repo: string, message?: string) {
    return api.post('/git/commitAmend', { repo, message });
  }
  async function pull(repo: string, branch?: string) {
    return api.post('/git/pull', { repo, branch });
  }
  async function push(repo: string, branch?: string) {
    return api.post('/git/push', { repo, branch });
  }
  /**
   * 切换分支。strategy：check=只预检不切换 / normal=直接切 / smart=储藏后切换再恢复 / force=丢弃冲突改动
   */
  async function checkout(repo: string, branch: string, strategy: 'check' | 'normal' | 'smart' | 'force' = 'normal') {
    return api.post<GitCheckoutResult>('/git/checkout', { repo, branch, strategy });
  }

  /** 冲突（未合并）文件清单 */
  async function conflicts(repo: string): Promise<string[]> {
    const res = await api.get<string[]>(`/git/conflicts?repo=${encodeURIComponent(repo)}`);
    return 'data' in res ? res.data || [] : [];
  }

  /** 冲突文件三版本：base(:1) / ours(:2) / theirs(:3) */
  async function conflictVersions(repo: string, filePath: string): Promise<{ base: string; ours: string; theirs: string }> {
    const res = await api.get<{ base: string; ours: string; theirs: string }>(
      `/git/conflictVersions?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(filePath)}`,
    );
    return 'data' in res ? res.data : { base: '', ours: '', theirs: '' };
  }

  /** 标记冲突已解决（git add） */
  async function resolveConflict(repo: string, file: string) {
    return api.post('/git/resolve', { repo, file });
  }

  /** 写入手动合并结果并标记已解决 */
  async function resolveContent(repo: string, file: string, content: string) {
    return api.post('/git/resolveContent', { repo, file, content });
  }
  async function restore(repo: string, files: string[]) {
    return api.post('/git/restore', { repo, files });
  }

  async function fetchNumstat(repo: string): Promise<GitNumstatEntry[]> {
    const res = await api.get<GitNumstatEntry[]>(`/git/numstat?repo=${encodeURIComponent(repo)}`);
    return 'data' in res ? res.data : [];
  }

  async function fetchAheadBehind(repo: string, branch?: string): Promise<GitAheadBehind> {
    const q = branch ? `&branch=${encodeURIComponent(branch)}` : '';
    const res = await api.get<GitAheadBehind>(`/git/aheadBehind?repo=${encodeURIComponent(repo)}${q}`);
    return 'data' in res ? res.data : { ahead: 0, behind: 0 };
  }

  async function fetchTree(repo: string): Promise<Array<{ path: string; type: 'file' }>> {
    const res = await api.get<Array<{ path: string; type: 'file' }>>(`/git/lsTree?repo=${encodeURIComponent(repo)}`);
    return 'data' in res ? res.data : [];
  }

  async function stageFiles(repo: string, files: string[]) {
    return api.post('/git/add', { repo, files });
  }

  async function unstageFiles(repo: string, files: string[]) {
    return api.post('/git/unstage', { repo, files });
  }

  async function createBranch(repo: string, name: string) {
    return api.post('/git/createBranch', { repo, name });
  }

  /** 合并分支；冲突时 ok=false 并返回冲突清单 */
  async function mergeBranch(repo: string, branch: string) {
    return api.post<{ ok: boolean; conflicts: string[]; message: string }>('/git/merge', { repo, branch });
  }

  async function abortMerge(repo: string) {
    return api.post('/git/abortMerge', { repo });
  }

  // ===== fetch / stash / tag / blame / revert / reset / cherry-pick / rebase =====
  async function fetch(repo: string, remote?: string, branch?: string) {
    return api.post('/git/fetch', { repo, remote, branch });
  }
  async function stashSave(repo: string, message?: string) {
    return api.post('/git/stashSave', { repo, message });
  }
  async function stashList(repo: string): Promise<string[]> {
    const res = await api.get<string[]>(`/git/stashList?repo=${encodeURIComponent(repo)}`);
    return 'data' in res ? res.data : [];
  }
  async function stashPop(repo: string, index = 0) {
    return api.post('/git/stashPop', { repo, index });
  }
  async function stashApply(repo: string, index = 0) {
    return api.post('/git/stashApply', { repo, index });
  }
  async function stashDrop(repo: string, index = 0) {
    return api.post('/git/stashDrop', { repo, index });
  }
  async function tagCreate(repo: string, name: string, message?: string, ref?: string) {
    return api.post('/git/tagCreate', { repo, name, message, ref });
  }
  async function tagList(repo: string): Promise<string[]> {
    const res = await api.get<string[]>(`/git/tagList?repo=${encodeURIComponent(repo)}`);
    return 'data' in res ? res.data : [];
  }
  async function tagDelete(repo: string, name: string) {
    return api.post('/git/tagDelete', { repo, name });
  }
  async function blame(repo: string, file: string) {
    const res = await api.get<Array<{ hash: string; author: string; line: number; content: string }>>(
      `/git/blame?repo=${encodeURIComponent(repo)}&file=${encodeURIComponent(file)}`,
    );
    return 'data' in res ? res.data : [];
  }
  async function revert(repo: string, commit: string) {
    return api.post('/git/revert', { repo, commit });
  }
  async function reset(repo: string, mode: 'soft' | 'mixed' | 'hard', target: string) {
    return api.post('/git/reset', { repo, mode, target });
  }
  async function cherryPick(repo: string, commit: string) {
    return api.post('/git/cherryPick', { repo, commit });
  }
  async function rebase(repo: string, branch: string) {
    return api.post('/git/rebase', { repo, branch });
  }
  async function rebaseAbort(repo: string) {
    return api.post('/git/rebaseAbort', { repo });
  }
  async function remoteBranches(repo: string): Promise<string[]> {
    const res = await api.get<string[]>(`/git/remoteBranches?repo=${encodeURIComponent(repo)}`);
    return 'data' in res ? res.data : [];
  }
  async function deleteBranch(repo: string, name: string) {
    return api.post('/git/deleteBranch', { repo, name });
  }
  async function renameBranch(repo: string, oldName: string, newName: string) {
    return api.post('/git/renameBranch', { repo, oldName, newName });
  }
  async function diffTree(repo: string, commit: string): Promise<Array<{ status: string; path: string }>> {
    const res = await api.get<Array<{ status: string; path: string }>>(
      `/git/diffTree?repo=${encodeURIComponent(repo)}&commit=${encodeURIComponent(commit)}`,
    );
    return 'data' in res ? res.data : [];
  }
  async function commitDiff(repo: string, commit: string, file?: string): Promise<string> {
    const q = file ? `&file=${encodeURIComponent(file)}` : '';
    const res = await api.get<string>(
      `/git/commitDiff?repo=${encodeURIComponent(repo)}&commit=${encodeURIComponent(commit)}${q}`,
    );
    return 'data' in res ? res.data : '';
  }
  async function graph(repo: string, n = 50): Promise<Array<{
    hash: string; parents: string[]; refs: string[]; subject: string;
    authorName: string; authorEmail: string; date: string;
  }>> {
    const res = await api.get<Array<{
      hash: string; parents: string[]; refs: string[]; subject: string;
      authorName: string; authorEmail: string; date: string;
    }>>(`/git/graph?repo=${encodeURIComponent(repo)}&n=${n}`);
    return 'data' in res ? res.data : [];
  }
  // ===== 面板缓存（后端落在仓库内 .yan-zhi/git-cache.json，随仓库走）=====
  async function readRepoCache(repo: string): Promise<Record<string, unknown> | null> {
    const res = await api.get<Record<string, unknown> | null>(
      `/git/cache?repo=${encodeURIComponent(repo)}`,
    );
    if (!('data' in res)) return null;
    const c = res.data as Record<string, unknown> | null;
    return c && typeof c === 'object' ? c : null;
  }

  async function writeRepoCache(repo: string, data: Record<string, unknown>, ui?: Record<string, unknown>) {
    return api.post('/git/cache', { repo, data, ui: ui || {} });
  }

  async function clearRepoCache(repo: string) {
    return api.delete(`/git/cache?repo=${encodeURIComponent(repo)}`);
  }

  async function discoverAll(dir: string): Promise<Array<{ path: string; branch: string; ahead: number; behind: number }>> {
    const res = await api.get<Array<{ path: string; branch: string; ahead: number; behind: number }>>(
      `/git/discoverAll?dir=${encodeURIComponent(dir)}`,
    );
    return 'data' in res ? res.data : [];
  }
  async function batchPull(repos: string[]) {
    return api.post('/git/batchPull', { repos });
  }
  async function batchPush(repos: string[]) {
    return api.post('/git/batchPush', { repos });
  }
  async function batchCheckout(repos: string[], branch: string) {
    return api.post('/git/batchCheckout', { repos, branch });
  }

  return {
    supported,
    status,
    fileTree,
    branches,
    log,
    checkCapability,
    fetchStatus,
    fetchStatusRaw,
    fetchFileTree,
    fetchBranches,
    fetchLog,
    readFile,
    diff,
    show,
    add,
    commit,
    commitAmend,
    pull,
    push,
    checkout,
    conflicts,
    conflictVersions,
    resolveConflict,
    resolveContent,
    restore,
    fetchNumstat,
    fetchAheadBehind,
    fetchTree,
    stageFiles,
    unstageFiles,
    createBranch,
    mergeBranch,
    abortMerge,
    fetch,
    stashSave,
    stashList,
    stashPop,
    stashApply,
    stashDrop,
    tagCreate,
    tagList,
    tagDelete,
    blame,
    revert,
    reset,
    cherryPick,
    rebase,
    rebaseAbort,
    remoteBranches,
    deleteBranch,
    renameBranch,
    diffTree,
    commitDiff,
    graph,
    discoverAll,
    readRepoCache,
    writeRepoCache,
    clearRepoCache,
    batchPull,
    batchPush,
    batchCheckout,
  };
});
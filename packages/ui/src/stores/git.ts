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
  async function pull(repo: string, branch?: string) {
    return api.post('/git/pull', { repo, branch });
  }
  async function push(repo: string, branch?: string) {
    return api.post('/git/push', { repo, branch });
  }
  async function checkout(repo: string, branch: string) {
    return api.post('/git/checkout', { repo, branch });
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

  return {
    supported,
    status,
    fileTree,
    branches,
    log,
    checkCapability,
    fetchStatus,
    fetchFileTree,
    fetchBranches,
    fetchLog,
    readFile,
    diff,
    show,
    add,
    commit,
    pull,
    push,
    checkout,
    restore,
    fetchNumstat,
    fetchAheadBehind,
    fetchTree,
    stageFiles,
    unstageFiles,
    createBranch,
  };
});
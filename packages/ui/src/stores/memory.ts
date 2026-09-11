// 记忆管理 store —— 封装记忆的列表/更新/删除/新增（camelCase）
// 后端契约：
//   GET    /memory/list?dimension=profile|agent|session|daily&agentId=&keyword=&page=&pageSize=
//          → { data: rows, total, page, pageSize }
//   PATCH  /memory/:id  body { content?, tags?, metadata? } → { data: row }
//   DELETE /memory/:id  → { data: { id, deleted: true } }
//   POST   /memory/create body { content, type, agentId?, tags?, metadata? } → { data: row }
// 维度映射（方案A）：
//   profile（用户个人画像）→ type=agent 且 agent_id 为空
//   agent（智能体记忆）    → type=agent 且 agent_id 非空
//   session（会话记忆）    → type=session
//   daily（每日记忆）      → type=daily
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, API_BASE } from '../api/client';

export type MemoryDimension = 'profile' | 'agent' | 'session' | 'daily' | 'space';

export interface SpaceMemoryInfo {
  spaceId: string;
  spaceName: string;
  path: string;
  content: string;
  exists: boolean;
}

export interface MemoryRow {
  id: string;
  user_id?: string;
  agent_id?: string | null;
  content: string;
  tags_json?: string | null;
  metadata_json?: string | null;
  created_at?: string | number;
  last_used_at?: string | number | null;
  type: string;
}

export interface MemoryListResult {
  rows: MemoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemoryCreateBody {
  content: string;
  type: string;
  agentId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemoryUpdatePatch {
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function readToken(): string | null {
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

/** 直接 fetch 拿完整 JSON：list 接口顶层带 total/page/pageSize，api 客户端会解包 data 丢失分页信息，故单独处理。 */
async function fetchJsonRaw(path: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = readToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { headers });
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

export const useMemoryStore = defineStore('memory', () => {
  const rows = ref<MemoryRow[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const page = ref(1);
  const pageSize = ref(20);
  const dimension = ref<MemoryDimension>('profile');
  const agentId = ref<string>('');
  const keyword = ref<string>('');

  /** 拉取记忆列表。传入的参数会同步到 store 状态，未传的保留当前值。 */
  async function loadMemories(opts?: {
    dimension?: MemoryDimension;
    agentId?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<MemoryListResult> {
    if (opts?.dimension !== undefined) dimension.value = opts.dimension;
    if (opts?.agentId !== undefined) agentId.value = opts.agentId;
    if (opts?.keyword !== undefined) keyword.value = opts.keyword;
    if (opts?.page !== undefined) page.value = opts.page;
    if (opts?.pageSize !== undefined) pageSize.value = opts.pageSize;

    loading.value = true;
    try {
      const params = new URLSearchParams();
      params.set('dimension', dimension.value);
      if (agentId.value) params.set('agentId', agentId.value);
      if (keyword.value.trim()) params.set('keyword', keyword.value.trim());
      params.set('page', String(page.value));
      params.set('pageSize', String(pageSize.value));
      const json = await fetchJsonRaw(`/memory/list?${params.toString()}`);
      if (json?.error) throw new Error(json.error);
      // 兼容两种返回形态：{ data: rows, total } 或 { data: { items, total } }
      const raw = json?.data;
      const listRows: MemoryRow[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
      rows.value = listRows;
      total.value = Number(json?.total ?? raw?.total ?? 0);
      return { rows: rows.value, total: total.value, page: page.value, pageSize: pageSize.value };
    } finally {
      loading.value = false;
    }
  }

  /** 更新单条记忆（content/tags/metadata 任意子集）。 */
  async function updateMemory(id: string, patch: MemoryUpdatePatch): Promise<MemoryRow> {
    const r = await api.patch<MemoryRow>(`/memory/${id}`, patch);
    if ('error' in r) throw new Error(r.error);
    return r.data;
  }

  /** 删除单条记忆。 */
  async function deleteMemory(id: string): Promise<void> {
    const r = await api.delete<{ id: string; deleted: boolean }>(`/memory/${id}`);
    if ('error' in r) throw new Error(r.error);
  }

  /** 手动新增记忆。type/agentId 由调用方按维度映射决定。 */
  async function createMemory(body: MemoryCreateBody): Promise<MemoryRow> {
    const r = await api.post<MemoryRow>('/memory/create', body);
    if ('error' in r) throw new Error(r.error);
    return r.data;
  }

  // ── 空间记忆文件（MEMORY.md，跨会话、该空间下所有智能体共享） ──

  /** 读取空间记忆文件 */
  async function getSpaceMemory(spaceId: string): Promise<SpaceMemoryInfo> {
    const r = await api.get<any>(`/spaces/${spaceId}/memory`);
    if ('error' in r) throw new Error(r.error);
    return (r as any).data;
  }

  /** 保存空间记忆文件（整体覆盖写） */
  async function saveSpaceMemory(spaceId: string, content: string): Promise<void> {
    const r = await api.put<any>(`/spaces/${spaceId}/memory`, { content });
    if ('error' in r) throw new Error(r.error);
  }

  // ── 记忆整理（Dreaming） ──

  const dreamLog = ref<any[]>([]);
  const dreamTotal = ref(0);
  const dreamRunning = ref(false);
  const dreamConfig = ref<{ enabled: boolean; hour: number }>({ enabled: true, hour: 2.5 });

  /** 手动触发一次记忆整理（去重/矛盾清理/过期淘汰/短期→长期提拔）。 */
  async function runDreaming(): Promise<any> {
    dreamRunning.value = true;
    try {
      const r = await api.post<any>('/memory/dream-run', {});
      if ('error' in r) throw new Error((r as any).error);
      return (r as any).data;
    } finally {
      dreamRunning.value = false;
    }
  }

  /** 拉取整理历史（时间线展示）。 */
  async function loadDreamLog(page = 1, pageSize = 10): Promise<void> {
    const json = await fetchJsonRaw(`/memory/dream-log?page=${page}&pageSize=${pageSize}`);
    if (json?.error) throw new Error(json.error);
    dreamLog.value = json?.data || [];
    dreamTotal.value = Number(json?.total ?? 0);
  }

  /** 拉取整理配置。 */
  async function loadDreamConfig(): Promise<void> {
    const json = await fetchJsonRaw('/memory/dream-config');
    if (json?.error) throw new Error(json.error);
    if (json?.data) dreamConfig.value = json.data;
  }

  /** 更新整理配置（enabled/hour）。 */
  async function updateDreamConfig(patch: { enabled?: boolean; hour?: number }): Promise<void> {
    const r = await api.patch<{ enabled: boolean; hour: number }>('/memory/dream-config', patch);
    if ('error' in r) throw new Error(r.error);
    dreamConfig.value = (r as any).data;
  }

  return {
    rows,
    total,
    loading,
    page,
    pageSize,
    dimension,
    agentId,
    keyword,
    loadMemories,
    updateMemory,
    deleteMemory,
    createMemory,
    getSpaceMemory,
    saveSpaceMemory,
    dreamLog,
    dreamTotal,
    dreamRunning,
    dreamConfig,
    runDreaming,
    loadDreamLog,
    loadDreamConfig,
    updateDreamConfig,
  };
});
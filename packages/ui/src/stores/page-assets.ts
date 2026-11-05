import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  PageAssetHealth,
  PageAssetScope,
  PageAssetSpec,
  PageAssetStatus,
} from '@yan-zhi/shared';
import { api } from '../api/client';

export interface PageAssetSummary {
  id: string;
  title: string;
  platform: string;
  scope: PageAssetScope;
  status: PageAssetStatus;
  version: number;
  capabilities: string[];
  operationIds: string[];
  draftVersion?: number | null;
  hasDraft?: boolean;
  source: 'builtin' | 'user';
  health: PageAssetHealth;
  updatedAt: number;
}

export interface PageAssetDetail extends PageAssetSpec {
  draft?: {
    version: number;
    baseVersion: number;
    contractHash: string;
    spec: PageAssetSpec;
    createdAt: number;
    updatedAt: number;
  } | null;
  ownerUserId?: string | null;
  source: 'builtin' | 'user';
  createdAt: number;
  updatedAt: number;
}

export interface PageAssetVersionView {
  version: number;
  contractHash: string;
  changeSummary?: string | null;
  createdBy?: string | null;
  createdAt: number;
}

export interface PageAssetFilters {
  query?: string;
  platform?: string;
  capability?: string;
  status?: PageAssetStatus | '';
  page?: number;
  pageSize?: number;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  return String(value || '未知错误');
}

function summaryOf(detail: PageAssetDetail): PageAssetSummary {
  return {
    id: detail.id,
    title: detail.title,
    platform: detail.platform,
    scope: detail.scope,
    status: detail.status,
    version: detail.version,
    capabilities: detail.capabilities || [],
    operationIds: (detail.operations || []).map((operation) => operation.id),
    draftVersion: detail.draft?.version ?? null,
    hasDraft: !!detail.draft,
    source: detail.source,
    health: detail.health || {},
    updatedAt: detail.updatedAt,
  };
}

export const usePageAssetsStore = defineStore('page-assets', () => {
  const items = ref<PageAssetSummary[]>([]);
  const selected = ref<PageAssetDetail | null>(null);
  const versions = ref<PageAssetVersionView[]>([]);
  const loading = ref(false);
  const detailLoading = ref(false);
  const saving = ref(false);
  const error = ref('');
  const filters = ref<PageAssetFilters>({
    query: '',
    platform: '',
    capability: '',
    status: '',
    page: 1,
    pageSize: 100,
  });

  const activeCount = computed(() => items.value.filter((item) => item.status === 'active').length);
  const draftCount = computed(
    () => items.value.filter((item) => item.hasDraft || item.status === 'draft').length,
  );
  const userAssets = computed(() => items.value.filter((item) => item.source === 'user'));

  function mergeSummary(detail: PageAssetDetail): void {
    const next = summaryOf(detail);
    const index = items.value.findIndex((item) => item.id === next.id);
    if (index >= 0) items.value[index] = next;
    else items.value.unshift(next);
  }

  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const query = new URLSearchParams({
        includeDrafts: 'true',
        page: String(filters.value.page || 1),
        pageSize: String(filters.value.pageSize || 100),
      });
      for (const key of ['query', 'platform', 'capability', 'status'] as const) {
        const value = String(filters.value[key] || '').trim();
        if (value) query.set(key, value);
      }
      const result: any = await api.get(`/page-assets?${query.toString()}`);
      if (result?.error) {
        error.value = String(result.error);
        return;
      }
      items.value = Array.isArray(result?.data) ? result.data : [];
    } catch (cause) {
      error.value = `页面资产加载失败：${errorMessage(cause)}`;
    } finally {
      loading.value = false;
    }
  }

  async function select(id: string): Promise<void> {
    detailLoading.value = true;
    error.value = '';
    try {
      const [detailRaw, historyRaw] = await Promise.all([
        api.get(`/page-assets/${encodeURIComponent(id)}`),
        api.get(`/page-assets/${encodeURIComponent(id)}/versions`),
      ]);
      const detail = detailRaw as { data?: PageAssetDetail; error?: string };
      const history = historyRaw as { data?: PageAssetVersionView[]; error?: string };
      if (detail?.error) {
        error.value = String(detail.error);
        return;
      }
      const nextSelected = detail.data || null;
      selected.value = nextSelected;
      versions.value = Array.isArray(history.data) ? history.data : [];
      if (nextSelected) mergeSummary(nextSelected);
    } catch (cause) {
      error.value = `页面资产详情加载失败：${errorMessage(cause)}`;
    } finally {
      detailLoading.value = false;
    }
  }

  function clearSelection(): void {
    selected.value = null;
    versions.value = [];
  }

  async function saveDraft(
    spec: PageAssetSpec,
    opts: { expectedVersion?: number; changeSummary?: string } = {},
  ): Promise<PageAssetDetail> {
    saving.value = true;
    error.value = '';
    try {
      const result: any = await api.post('/page-assets/drafts', {
        spec,
        ...(opts.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
        ...(opts.changeSummary ? { changeSummary: opts.changeSummary } : {}),
      });
      if (result?.error) throw new Error(String(result.error));
      const nextSelected = result.data as PageAssetDetail;
      selected.value = nextSelected;
      mergeSummary(nextSelected);
      return nextSelected;
    } catch (cause) {
      error.value = `保存草稿失败：${errorMessage(cause)}`;
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function updateDraft(
    id: string,
    spec: PageAssetSpec,
    expectedVersion: number,
    changeSummary?: string,
  ): Promise<PageAssetDetail> {
    saving.value = true;
    error.value = '';
    try {
      const result: any = await api.patch(`/page-assets/${encodeURIComponent(id)}/draft`, {
        spec,
        expectedVersion,
        ...(changeSummary ? { changeSummary } : {}),
      });
      if (result?.error) throw new Error(String(result.error));
      const nextSelected = result.data as PageAssetDetail;
      selected.value = nextSelected;
      mergeSummary(nextSelected);
      return nextSelected;
    } catch (cause) {
      error.value = `更新草稿失败：${errorMessage(cause)}`;
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function validate(id: string): Promise<{ ok: boolean; errors: string[]; contractHash: string; version: number }> {
    const result: any = await api.post(`/page-assets/${encodeURIComponent(id)}/validate`, {});
    if (result?.error) throw new Error(String(result.error));
    return result.data;
  }

  async function activate(id: string, expectedVersion: number, changeSummary?: string): Promise<void> {
    saving.value = true;
    error.value = '';
    try {
      const result: any = await api.post(`/page-assets/${encodeURIComponent(id)}/activate`, {
        expectedVersion,
        ...(changeSummary ? { changeSummary } : {}),
      });
      if (result?.error) throw new Error(String(result.error));
      await select(id);
    } catch (cause) {
      error.value = `激活资产失败：${errorMessage(cause)}`;
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function archive(id: string): Promise<void> {
    const result: any = await api.post(`/page-assets/${encodeURIComponent(id)}/archive`, {});
    if (result?.error) throw new Error(String(result.error));
    await select(id);
  }

  async function rollback(id: string, targetVersion: number): Promise<void> {
    const result: any = await api.post(`/page-assets/${encodeURIComponent(id)}/rollback`, { targetVersion });
    if (result?.error) throw new Error(String(result.error));
    await select(id);
  }

  async function probe(id: string, operationId: string, params: Record<string, unknown>, url?: string) {
    const result: any = await api.post(`/page-assets/${encodeURIComponent(id)}/probe`, {
      operationId,
      params,
      ...(url ? { url } : {}),
    });
    if (result?.error) throw new Error(String(result.error));
    return result.data;
  }

  return {
    items,
    selected,
    versions,
    loading,
    detailLoading,
    saving,
    error,
    filters,
    activeCount,
    draftCount,
    userAssets,
    load,
    select,
    clearSelection,
    saveDraft,
    updateDraft,
    validate,
    activate,
    archive,
    rollback,
    probe,
  };
});

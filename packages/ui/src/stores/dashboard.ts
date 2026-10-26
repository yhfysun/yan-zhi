// 看板 store：列表 + 当前看板 + widget 增删改重排。
// 服务端按登录用户隔离，这里只做请求与状态收敛，不缓存行数据（widget 打开时活取数）。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type { Dashboard, DashboardWidget } from '@yan-zhi/shared';

type DashSummary = Dashboard & { widgetCount: number };

export const useDashboardStore = defineStore('dashboard', () => {
  const list = ref<DashSummary[]>([]);
  const current = ref<Dashboard | null>(null);
  const loading = ref(false);
  const error = ref('');

  function fail(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    error.value = msg;
    return msg;
  }

  async function loadList(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const r = await api.get<DashSummary[]>('/dashboards');
      if ('error' in r) { error.value = String(r.error); return; }
      list.value = r.data || [];
    } catch (e) { fail(e); } finally { loading.value = false; }
  }

  async function open(id: string): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const r = await api.get<Dashboard>(`/dashboards/${id}`);
      if ('error' in r) { error.value = String(r.error); return; }
      current.value = r.data;
    } catch (e) { fail(e); } finally { loading.value = false; }
  }

  async function create(title: string, description?: string): Promise<Dashboard | null> {
    try {
      const r = await api.post<Dashboard>('/dashboards', { title, description });
      if ('error' in r) { error.value = String(r.error); return null; }
      await loadList();
      current.value = r.data;
      return r.data;
    } catch (e) { fail(e); return null; }
  }

  async function rename(id: string, title: string): Promise<void> {
    const r = await api.patch<Dashboard>(`/dashboards/${id}`, { title });
    if ('error' in r) { error.value = String(r.error); return; }
    if (current.value?.id === id) current.value = r.data;
    await loadList();
  }

  async function remove(id: string): Promise<void> {
    const r = await api.delete(`/dashboards/${id}`);
    if ('error' in r) { error.value = String(r.error); return; }
    if (current.value?.id === id) current.value = null;
    await loadList();
  }

  /** 新增或更新 widget（按 widget.id 幂等）；返回更新后的看板 */
  async function saveWidget(dashboardId: string, widget: DashboardWidget): Promise<Dashboard | null> {
    const r = await api.post<Dashboard>(`/dashboards/${dashboardId}/widgets`, { widget });
    if ('error' in r) { error.value = String(r.error); return null; }
    if (current.value?.id === dashboardId) current.value = r.data;
    return r.data;
  }

  async function removeWidget(dashboardId: string, widgetId: string): Promise<void> {
    const r = await api.delete<Dashboard>(`/dashboards/${dashboardId}/widgets/${widgetId}`);
    if ('error' in r) { error.value = String(r.error); return; }
    if (current.value?.id === dashboardId) current.value = r.data;
  }

  async function reorder(dashboardId: string, ids: string[]): Promise<void> {
    const r = await api.post<Dashboard>(`/dashboards/${dashboardId}/widgets/reorder`, { ids });
    if ('error' in r) { error.value = String(r.error); return; }
    if (current.value?.id === dashboardId) current.value = r.data;
  }

  return {
    list, current, loading, error,
    loadList, open, create, rename, remove, saveWidget, removeWidget, reorder,
  };
});

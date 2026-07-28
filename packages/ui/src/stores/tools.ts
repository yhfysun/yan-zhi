/** 工具商城 store — 统一管理自定义工具 + 远程商城 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from './auth';

export interface CustomToolItem {
  id: string; name: string; description?: string;
  inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown>;
  runtime: string; entry: string; code: string;
  dependencies?: string[]; timeout: number;
  enabled: boolean; source: 'local' | 'remote';
  remoteSourceId?: string; isPublic: boolean;
  createdAt: number; updatedAt: number;
}

export interface RemoteMarketplaceSource {
  id: string; name: string; type: string;
  base_url: string; auth_type: string;
  enabled: boolean; created_at: number;
}

function rowToTool(r: any): CustomToolItem {
  return {
    id: r.id, name: r.name, description: r.description,
    inputSchema: r.input_schema_json ? JSON.parse(String(r.input_schema_json)) : {},
    outputSchema: r.output_schema_json ? JSON.parse(String(r.output_schema_json)) : undefined,
    runtime: r.runtime || 'node', entry: r.entry, code: r.code,
    dependencies: r.dependencies_json ? JSON.parse(String(r.dependencies_json)) : undefined,
    timeout: r.timeout || 30000, enabled: !!r.enabled,
    source: r.source || 'local', remoteSourceId: r.remote_source_id,
    isPublic: !!r.is_public, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export const useToolsStore = defineStore('tools', () => {
  const customTools = ref<CustomToolItem[]>([]);
  const remoteSources = ref<RemoteMarketplaceSource[]>([]);
  const remoteItems = ref<Record<string, any[]>>({});
  const loading = ref(false);
  const marketplaceEnabled = ref(false);
  const marketplaceAuth = ref<{ authType: string; token?: string }>({ authType: 'none' });

  const on = () => !!useAuthStore().isLoggedIn;

  const builtinTools = [
    { name: 'file_read', description: '读取文件内容，支持指定路径和行数范围' },
    { name: 'file_write', description: '写入内容到指定文件路径' },
    { name: 'web_search', description: '联网搜索，获取实时信息' },
  ];

  async function loadCustomTools() {
    if (!on()) return;
    loading.value = true;
    try {
      const r = await api.get<any[]>('/tools');
      customTools.value = (r.data as any[] || []).map(rowToTool);
    } finally { loading.value = false; }
  }

  async function createTool(data: {
    name: string; description?: string; inputSchema: Record<string, unknown>;
    entry: string; code: string; runtime?: string; timeout?: number; isPublic?: boolean;
  }) {
    const r = await api.post<any>('/tools', data);
    const tool = rowToTool(r.data);
    customTools.value.unshift(tool);
    return tool;
  }

  async function updateTool(id: string, patch: Record<string, unknown>) {
    await api.patch(`/tools/${id}`, patch);
    await loadCustomTools();
  }

  async function deleteTool(id: string) {
    await api.delete(`/tools/${id}`);
    customTools.value = customTools.value.filter(t => t.id !== id);
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await api.patch(`/tools/${id}`, { enabled });
    const t = customTools.value.find(x => x.id === id);
    if (t) t.enabled = enabled;
  }

  async function togglePublic(id: string, isPublic: boolean) {
    await api.patch(`/tools/${id}`, { isPublic });
    const t = customTools.value.find(x => x.id === id);
    if (t) t.isPublic = isPublic;
  }

  async function loadRemoteSources() {
    if (!on()) return;
    const r = await api.get<any[]>('/tool-marketplace');
    remoteSources.value = (r.data as any[]) || [];
  }

  async function addRemoteSource(data: { name: string; baseUrl: string; authType?: string; authConfig?: any }) {
    const r = await api.post<any>('/tool-marketplace', data);
    await loadRemoteSources();
    return r.data;
  }

  async function deleteRemoteSource(id: string) {
    await api.delete(`/tool-marketplace/${id}`);
    await loadRemoteSources();
  }

  async function testRemoteSource(id: string): Promise<{ ok: boolean; error?: string; info?: any }> {
    const r = await api.post<any>(`/tool-marketplace/${id}/test`);
    return r as any;
  }

  async function fetchRemoteItems(sourceId: string, page = 1, pageSize = 20) {
    const r = await api.get<any>(`/tool-marketplace/${sourceId}/tools?page=${page}&pageSize=${pageSize}`);
    if (r && r.data) remoteItems.value[sourceId] = r.data.items || [];
  }

  async function installFromMarket(sourceId: string, toolId: string) {
    const r = await api.post<any>(`/tool-marketplace/${sourceId}/install`, { toolId });
    await loadCustomTools();
    return rowToTool(r.data);
  }

  async function setMarketplaceEnabled(enabled: boolean) {
    marketplaceEnabled.value = enabled;
    await api.patch('/marketplace/config', { enabled });
  }

  async function loadMarketplaceConfig() {
    try {
      const r = await api.get<any>('/marketplace/config');
      if ('data' in r && r.data) {
        marketplaceEnabled.value = !!r.data.enabled;
        marketplaceAuth.value = r.data.auth || { authType: 'none' };
      }
    } catch {}
  }

  return {
    builtinTools, customTools, remoteSources, remoteItems, loading,
    marketplaceEnabled, marketplaceAuth,
    loadCustomTools, createTool, updateTool, deleteTool, toggleEnabled, togglePublic,
    loadRemoteSources, addRemoteSource, deleteRemoteSource, testRemoteSource,
    fetchRemoteItems, installFromMarket,
    setMarketplaceEnabled, loadMarketplaceConfig,
  };
});

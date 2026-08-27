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
  const marketplacePort = ref(3001);

  const on = () => !!useAuthStore().isLoggedIn;

  const builtinTools = [
    { name: 'file_read', description: '读取文件内容，支持指定路径和行数范围' },
    { name: 'file_write', description: '写入内容到指定文件路径' },
    { name: 'web_search', description: '联网搜索，获取实时信息' },
    { name: 'cmd_exec', description: '执行系统命令，支持 cmd/python/java/git 等' },
    { name: 'ask_user', description: '向用户反问澄清问题并等待回答（弹出对话框）' },
    { name: 'confirm_user', description: '多页确认向导，逐页收集用户选择、文字回答和补充说明' },
    { name: 'task_plan', description: '创建任务计划，在对话区展示进度清单' },
    { name: 'task_step', description: '更新任务步骤状态（待办/进行中/完成/失败）' },
    { name: 'configure_model_platform', description: '弹出模型平台/模型配置表单，等待用户填写后创建平台与模型' },
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
    // apiFetch 把成功响应包进 { data: ... }；失败用 { error }。这里统一解包，调用方拿到的就是后端实际负载
    if (r && 'error' in r) return { ok: false, error: (r as any).error };
    const payload = (r as any).data ?? r;
    return payload as { ok: boolean; error?: string; info?: any };
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

  /**
   * 保存商城服务端配置到服务端。
   * enabled/auth/port 均可选；未传的字段保持当前 store 值。
   * 返回 { persisted: 'server'|'local', error? }：服务端成功为 'server'，失败回退本地缓存为 'local'。
   */
  async function setMarketplaceConfig(opts: {
    enabled?: boolean;
    auth?: { authType?: string; token?: string };
    port?: number;
  }): Promise<{ persisted: 'server' | 'local'; error?: string }> {
    if (opts.enabled !== undefined) marketplaceEnabled.value = opts.enabled;
    if (opts.auth) {
      marketplaceAuth.value = {
        authType: opts.auth.authType !== undefined ? opts.auth.authType : marketplaceAuth.value.authType,
        token: opts.auth.token !== undefined ? opts.auth.token : marketplaceAuth.value.token,
      };
    }
    if (opts.port !== undefined) marketplacePort.value = opts.port;
    // 本地缓存（服务端不可用时回退）
    const cached = { enabled: marketplaceEnabled.value, auth: marketplaceAuth.value, port: marketplacePort.value };
    localStorage.setItem('marketplace_config_v1', JSON.stringify(cached));
    // 同步到服务端
    const body: any = {};
    if (opts.enabled !== undefined) body.enabled = opts.enabled;
    if (opts.auth) body.auth = marketplaceAuth.value;
    if (opts.port !== undefined) body.port = opts.port;
    const r = await api.patch<any>('/marketplace/config', body);
    if (r && 'error' in r) {
      return { persisted: 'local', error: (r as any).error };
    }
    return { persisted: 'server' };
  }

  /** 兼容旧调用：仅切换 enabled */
  async function setMarketplaceEnabled(enabled: boolean) {
    return setMarketplaceConfig({ enabled });
  }

  async function loadMarketplaceConfig() {
    let cfg: any = null;
    const r = await api.get<any>('/marketplace/config');
    cfg = r && r.data ? r.data : null;
    if (cfg && typeof cfg === 'object') {
      marketplaceEnabled.value = !!cfg.enabled;
      if (cfg.auth) marketplaceAuth.value = cfg.auth;
      if (cfg.port) marketplacePort.value = cfg.port;
    } else {
      const raw = localStorage.getItem('marketplace_config_v1');
      if (raw) {
        try {
          const local = JSON.parse(raw);
          marketplaceEnabled.value = !!local.enabled;
          if (local.auth) marketplaceAuth.value = local.auth;
          if (local.port) marketplacePort.value = local.port;
        } catch {}
      }
    }
  }

  return {
    builtinTools, customTools, remoteSources, remoteItems, loading,
    marketplaceEnabled, marketplaceAuth, marketplacePort,
    loadCustomTools, createTool, updateTool, deleteTool, toggleEnabled, togglePublic,
    loadRemoteSources, addRemoteSource, deleteRemoteSource, testRemoteSource,
    fetchRemoteItems, installFromMarket,
    setMarketplaceConfig, setMarketplaceEnabled, loadMarketplaceConfig,
  };
});

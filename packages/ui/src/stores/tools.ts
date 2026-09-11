/** 工具商城 store — 统一管理自定义工具 + 远程商城 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from './auth';

export interface CustomToolItem {
  id: string; name: string; description?: string; category?: string;
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

/** 内置工具条目（含完整入参/出参 Schema） */
export interface BuiltinToolItem {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** 内置工具分类配置（有序，前缀/名称匹配，未命中归入"其他"） */
const BUILTIN_TOOL_CATEGORIES: { key: string; label: string; prefixes?: string[]; names?: string[] }[] = [
  { key: 'file', label: '文件读写', prefixes: ['file_'] },
  { key: 'browser', label: '浏览器自动化', prefixes: ['browser_'] },
  { key: 'subagent', label: '子智能体', names: ['call_agent', 'list_sub_agents'] },
  { key: 'cmd', label: '命令执行', names: ['cmd_exec'] },
  { key: 'code', label: '代码工具', names: ['code_search', 'code_outline', 'js_exec', 'python_exec'] },
  { key: 'doc', label: '文档生成', names: ['doyz'] },
  { key: 'network', label: '网络安全', names: ['port_scan', 'lan_scan', 'http_request', 'tcp_send', 'udp_send', 'dns_lookup', 'security'] },
  { key: 'interact', label: '用户交互', names: ['ask_user', 'confirm_user'] },
  { key: 'task', label: '任务规划', names: ['task_plan', 'task_step'] },
  { key: 'data', label: '数据查询（本体/SQL）', prefixes: ['api_ontology_', 'api_data_', 'api_datasource_'] },
  { key: 'image', label: '图像分析', names: ['image_analyze'] },
  { key: 'config', label: '模型配置', names: ['configure_model_platform', 'list_models'] },
];

function rowToTool(r: any): CustomToolItem {
  return {
    id: r.id, name: r.name, description: r.description, category: r.category,
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
  const builtinTools = ref<BuiltinToolItem[]>([]);

  /** 内置工具按分类分组（供 UI 折叠渲染） */
  const builtinToolGroups = computed(() => {
    const groups: { key: string; label: string; tools: BuiltinToolItem[] }[] = [];
    const used = new Set<string>();
    for (const cat of BUILTIN_TOOL_CATEGORIES) {
      const tools = builtinTools.value.filter((t) => {
        if (used.has(t.name)) return false;
        if (cat.names?.includes(t.name)) return true;
        if (cat.prefixes?.some((p) => t.name.startsWith(p))) return true;
        return false;
      });
      tools.forEach((t) => used.add(t.name));
      if (tools.length > 0) groups.push({ key: cat.key, label: cat.label, tools });
    }
    const others = builtinTools.value.filter((t) => !used.has(t.name));
    if (others.length > 0) groups.push({ key: 'other', label: '其他', tools: others });
    return groups;
  });
  const remoteSources = ref<RemoteMarketplaceSource[]>([]);
  const remoteItems = ref<Record<string, any[]>>({});
  const loading = ref(false);
  const marketplaceEnabled = ref(false);
  const marketplaceAuth = ref<{ authType: string; token?: string }>({ authType: 'none' });
  const marketplacePort = ref(3001);

  const on = () => useAuthStore().useServerApi;

  async function loadBuiltinTools() {
    try {
      const r = await api.get<any[]>('/tools/builtin');
      builtinTools.value = ((r as any).data as any[]) || [];
    } catch {
      builtinTools.value = [];
    }
  }

  async function loadCustomTools() {
    if (!on()) return;
    loading.value = true;
    try {
      const r = await api.get<any[]>('/tools');
      customTools.value = ((r as any).data as any[] || []).map(rowToTool);
    } finally { loading.value = false; }
  }

  async function createTool(data: {
    name: string; description?: string; category?: string; inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    entry: string; code: string; runtime?: string; timeout?: number; isPublic?: boolean;
  }) {
    const r = await api.post<any>('/tools', data);
    const tool = rowToTool((r as any).data);
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

  /** 试运行自定义工具（服务端 node:vm 沙箱执行）。失败抛出后端 error 信息。 */
  async function executeTool(id: string, args: Record<string, unknown>): Promise<unknown> {
    const r = await api.post<any>(`/tools/${id}/execute`, { args });
    if (r && 'error' in r) throw new Error((r as any).error);
    return (r as any).data;
  }

  /** 试运行内置工具（服务端按 name 执行 ToolRegistry / api 执行器）。失败抛出后端 error 信息。 */
  async function executeBuiltinTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const r = await api.post<any>('/tools/builtin/execute', { name, args });
    if (r && 'error' in r) throw new Error((r as any).error);
    return (r as any).data;
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
    remoteSources.value = ((r as any).data as any[]) || [];
  }

  async function addRemoteSource(data: { name: string; baseUrl: string; authType?: string; authConfig?: any }) {
    const r = await api.post<any>('/tool-marketplace', data);
    await loadRemoteSources();
    return (r as any).data;
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
    const rd = (r as any).data;
    if (rd) remoteItems.value[sourceId] = rd.items || [];
  }

  async function installFromMarket(sourceId: string, toolId: string) {
    const r = await api.post<any>(`/tool-marketplace/${sourceId}/install`, { toolId });
    await loadCustomTools();
    return rowToTool((r as any).data);
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
    cfg = (r as any)?.data ?? null;
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
    builtinTools, builtinToolGroups, customTools, remoteSources, remoteItems, loading,
    marketplaceEnabled, marketplaceAuth, marketplacePort,
    loadBuiltinTools, loadCustomTools, createTool, updateTool, deleteTool, toggleEnabled, togglePublic, executeTool, executeBuiltinTool,
    loadRemoteSources, addRemoteSource, deleteRemoteSource, testRemoteSource,
    fetchRemoteItems, installFromMarket,
    setMarketplaceConfig, setMarketplaceEnabled, loadMarketplaceConfig,
  };
});

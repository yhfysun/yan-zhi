// 插件 store（前端聚合激活插件贡献的扩展点，供各消费方读取）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';
import type {
  PluginManifest,
  PluginState,
  PluginSource,
  ThemePalette,
  LayoutDef,
  SidebarItem,
  RouteConfig,
  SettingsTab,
  ChatEnhancerDef,
} from '@yan-zhi/core';

/** 前端视角的插件信息（不含内部 disposables） */
export interface PluginInfo {
  manifest: PluginManifest;
  state: PluginState;
  error?: string;
  config: Record<string, unknown>;
  source: PluginSource;
}

export const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<PluginInfo[]>([]);
  const loaded = ref(false);

  /** 仅聚合已启用插件 */
  const enabledPlugins = computed(() => plugins.value.filter((p) => p.state === 'enabled'));

  /** 贡献的主题调色板（附 pluginId：皮肤壁纸/预览图按 /api/plugin-assets/:pluginId/ 寻址） */
  const themes = computed<Array<ThemePalette & { pluginId: string }>>(() =>
    enabledPlugins.value.flatMap((p) =>
      (p.manifest.contributes?.themes || []).map((t) => ({ ...t, pluginId: p.manifest.id })),
    ),
  );
  /** 贡献的布局 */
  const layouts = computed<LayoutDef[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.layouts || []),
  );
  /** 贡献的侧栏入口（按 order 排序） */
  const sidebar = computed<SidebarItem[]>(() =>
    enabledPlugins.value
      .flatMap((p) => p.manifest.contributes?.sidebar || [])
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
  );
  /** 贡献的前端路由 */
  const routes = computed<RouteConfig[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.routes || []),
  );
  /** 贡献的设置面板 */
  const settingsTabs = computed<SettingsTab[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.settingsTabs || []),
  );
  /** 贡献的对话增强器 */
  const chatEnhancers = computed<ChatEnhancerDef[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.chatEnhancers || []),
  );
  /** 贡献的工具元数据（声明式，执行体在后端） */
  const toolDecls = computed(() =>
    enabledPlugins.value.flatMap((p) =>
      (p.manifest.contributes?.tools || []).map((t) => ({ pluginId: p.manifest.id, tool: t })),
    ),
  );

  /** 是否支持安装第三方插件（仅桌面端） */
  const canInstall = computed(() => {
    if (typeof window === 'undefined') return false;
    return !!(window as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;
  });

  async function refresh(): Promise<string | undefined> {
    const res = await api.get<PluginInfo[]>('/plugins');
    if ('error' in res) return res.error;
    plugins.value = res.data;
    loaded.value = true;
    return undefined;
  }

  async function enable(id: string): Promise<string | undefined> {
    const res = await api.post(`/plugins/${id}/enable`);
    if ('error' in res) return res.error;
    await refresh();
    return undefined;
  }

  async function disable(id: string): Promise<string | undefined> {
    const res = await api.post(`/plugins/${id}/disable`);
    if ('error' in res) return res.error;
    await refresh();
    return undefined;
  }

  async function setConfig(id: string, config: Record<string, unknown>): Promise<string | undefined> {
    const res = await api.put(`/plugins/${id}/config`, config);
    if ('error' in res) return res.error;
    await refresh();
    return undefined;
  }

  async function uninstall(id: string): Promise<string | undefined> {
    const res = await api.delete(`/plugins/${id}`);
    if ('error' in res) return res.error;
    await refresh();
    return undefined;
  }

  return {
    plugins,
    loaded,
    canInstall,
    themes,
    layouts,
    sidebar,
    routes,
    settingsTabs,
    chatEnhancers,
    toolDecls,
    enabledPlugins,
    refresh,
    enable,
    disable,
    setConfig,
    uninstall,
  };
});
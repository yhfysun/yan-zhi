// 插件 store（前端聚合激活插件贡献的扩展点，供各消费方读取）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';
import { waitForBackend } from '../api/backend-ready';
import { resolvePluginFrontendEntry } from '../plugin-runtime';
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
  CommandDef,
  PlaybookDef,
} from '@yan-zhi/core';

/** 前端视角的插件信息（不含内部 disposables） */
export interface PluginInfo {
  manifest: PluginManifest;
  state: PluginState;
  error?: string;
  config: Record<string, unknown>;
  source: PluginSource;
}

/** 模式运行时化（P3）：插件贡献的模式元数据（contributes.mode + 来源 pluginId） */
export interface PluginModeDef {
  pluginId: string;
  key: string;
  label: string;
  desc?: string;
  icon?: string;
  route: string;
  entry?: string;
  desktopOnly?: boolean;
  fallbackAgent?: string;
  chatPlacement?: 'center' | 'side';
}

export const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<PluginInfo[]>([]);
  const loaded = ref(false);

  /** 模式运行时化（P3）：enabled 插件 contributes.mode 聚合（服务端随 /api/plugins 下发） */
  const modeDefs = ref<PluginModeDef[]>([]);

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
  /** 贡献的前端路由（P4：附 pluginId + 插件前端入口，供运行时 bundle 装载） */
  const routes = computed<Array<RouteConfig & { pluginId?: string; frontendEntry?: string }>>(() =>
    enabledPlugins.value.flatMap((p) =>
      (p.manifest.contributes?.routes || []).map((r) => ({
        ...r,
        pluginId: p.manifest.id,
        frontendEntry: resolvePluginFrontendEntry(p.manifest),
      })),
    ),
  );
  /** 贡献的设置面板 */
  const settingsTabs = computed<SettingsTab[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.settingsTabs || []),
  );
  /** 贡献的对话增强器 */
  const chatEnhancers = computed<ChatEnhancerDef[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.chatEnhancers || []),
  );
  /**
   * 贡献的命令（命令中枢，2026-10-16）—— 前端命令总线的数据源之一（另一个是内置命令与页面指令）。
   * ★ 只聚合**已启用**插件（与其它贡献点同口径）：停用的插件不该还能被 `/` 命令唤起。
   */
  const commands = computed<CommandDef[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.commands || []),
  );
  /** 贡献的剧本（命令中枢的 `@名字` 召唤；执行仍走各自命令的通道） */
  const playbooks = computed<PlaybookDef[]>(() =>
    enabledPlugins.value.flatMap((p) => p.manifest.contributes?.playbooks || []),
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
    // ★★★ 2026-10-12 补：等后端就绪再拉插件列表。
    //
    //   症状（用户实报）：dev 冷启动时 console 报
    //     `GET http://127.0.0.1:3001/api/plugins net::ERR_CONNECTION_REFUSED at plugin.ts:75`
    //   实况：本函数由 `ModeSwitcher.vue` 的 onMounted 直接调用（**启动关键路径**），
    //   而后端（tsx 冷编译）启动耗时可能 > 主进程的 30s 健康检查上限，被"强制创建窗口"。
    //   ⇒ 前端挂载时后端还没监听 ⇒ 本请求必然被拒 ⇒ 插件列表静默为空
    //     （`plugins.value` 拿不到数据，且 `loaded` 不会被置位，后续也不会自动重试）。
    //
    //   ★ 项目的统一口径是"启动期首个请求前先 await waitForBackend()"
    //     （见 api/backend-ready.ts 顶部注释；auth.ts / license.ts / useChat.ts /
    //      Agents.vue / Models.vue 都已遵守）—— **本函数此前漏了**，是唯一缺口。
    //   ★ 幂等且有记忆（backend-ready.ts 顶部：就绪后立即返回、零额外延迟），
    //     所以放在这里对"运行期再刷新"没有任何代价，可安全地每次调用。
    await waitForBackend();
    const res = await api.get<PluginInfo[]>('/plugins');
    if ('error' in res) return res.error;
    plugins.value = res.data;
    // ★ 模式运行时化（P3）：快照随带的 modeDefs（enabled 插件 contributes.mode 聚合）。
    //   消费方见 mode.ts 的 pluginModeMeta —— 模式元数据/fallbackAgent 的单一真相源。
    const raw = (res as unknown as { modeDefs?: unknown }).modeDefs;
    if (Array.isArray(raw)) modeDefs.value = raw as PluginModeDef[];
    loaded.value = true;
    return undefined;
  }

  async function enable(id: string): Promise<string | undefined> {
    const res = await api.post(`/plugins/${id}/enable`);
    if ('error' in res) return res.error;
    await refresh();
    return undefined;
  }

  /** 插件被禁用/卸载时收掉它的桌面/悬浮窗口（Web 端无 electronAPI，静默跳过） */
  function closePluginWindows(id: string): void {
    try {
      const el = (window as unknown as {
        electronAPI?: { pluginWindow?: { closeAll?: (pluginId: string) => Promise<unknown> } };
      }).electronAPI;
      void el?.pluginWindow?.closeAll?.(id);
    } catch {
      /* 忽略：浏览器环境 */
    }
  }

  async function disable(id: string): Promise<string | undefined> {
    const res = await api.post(`/plugins/${id}/disable`);
    if ('error' in res) return res.error;
    closePluginWindows(id);
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
    closePluginWindows(id);
    await refresh();
    return undefined;
  }

  return {
    plugins,
    loaded,
    modeDefs,
    canInstall,
    themes,
    layouts,
    sidebar,
    routes,
    settingsTabs,
    chatEnhancers,
    commands,
    playbooks,
    toolDecls,
    enabledPlugins,
    refresh,
    enable,
    disable,
    setConfig,
    uninstall,
  };
});
// 扩展点注册表
import type { BuiltInTool } from '../tool/types';
import type {
  Disposable,
  ThemePalette,
  LayoutDef,
  SidebarItem,
  RouteConfig,
  SettingsTab,
  ChatEnhancerDef,
  PluginContributes,
} from './types';

interface RegistryEntry<T> {
  pluginId: string;
  item: T;
}

type PluginTool = BuiltInTool & { __pluginId: string };
export type { PluginTool };

/** 聚合所有已激活插件贡献的扩展点 */
export class ExtensionRegistry {
  /** 工具（后端执行体） */
  readonly tools = new Map<string, PluginTool>();
  /** 后端路由挂载函数 */
  backendRoutes: Array<{ pluginId: string; setup: (app: unknown) => void }> = [];
  /** 主题调色板（前端） */
  themes: RegistryEntry<ThemePalette>[] = [];
  /** 布局（前端） */
  layouts: RegistryEntry<LayoutDef>[] = [];
  /** 侧栏入口（前端） */
  sidebar: RegistryEntry<SidebarItem>[] = [];
  /** 前端路由（前端） */
  routes: RegistryEntry<RouteConfig>[] = [];
  /** 设置面板（前端） */
  settingsTabs: RegistryEntry<SettingsTab>[] = [];
  /** 对话增强器（前端） */
  chatEnhancers: RegistryEntry<ChatEnhancerDef>[] = [];

  /** 注册工具（后端执行体） */
  registerTool(pluginId: string, tool: BuiltInTool): Disposable {
    const entry: PluginTool = { ...tool, __pluginId: pluginId };
    this.tools.set(tool.name, entry);
    return {
      dispose: () => {
        const cur = this.tools.get(tool.name);
        if (cur?.__pluginId === pluginId) this.tools.delete(tool.name);
      },
    };
  }

  /** 注册后端路由挂载函数 */
  registerBackendRoute(pluginId: string, setup: (app: unknown) => void): Disposable {
    const entry = { pluginId, setup };
    this.backendRoutes.push(entry);
    return {
      dispose: () => {
        const i = this.backendRoutes.indexOf(entry);
        if (i >= 0) this.backendRoutes.splice(i, 1);
      },
    };
  }

  /** 批量加入声明式前端扩展点（来自 manifest.contributes） */
  addContributes(pluginId: string, c: PluginContributes): Disposable {
    (c.themes || []).forEach((t) => this.themes.push({ pluginId, item: t }));
    (c.layouts || []).forEach((t) => this.layouts.push({ pluginId, item: t }));
    (c.sidebar || []).forEach((t) => this.sidebar.push({ pluginId, item: t }));
    (c.routes || []).forEach((t) => this.routes.push({ pluginId, item: t }));
    (c.settingsTabs || []).forEach((t) => this.settingsTabs.push({ pluginId, item: t }));
    (c.chatEnhancers || []).forEach((t) => this.chatEnhancers.push({ pluginId, item: t }));
    return { dispose: () => this.removeByPlugin(pluginId) };
  }

  /** 移除某插件的所有贡献 */
  removeByPlugin(pluginId: string): void {
    for (const [name, t] of this.tools) {
      if (t.__pluginId === pluginId) this.tools.delete(name);
    }
    this.backendRoutes = this.backendRoutes.filter((r) => r.pluginId !== pluginId);
    this.themes = this.themes.filter((e) => e.pluginId !== pluginId);
    this.layouts = this.layouts.filter((e) => e.pluginId !== pluginId);
    this.sidebar = this.sidebar.filter((e) => e.pluginId !== pluginId);
    this.routes = this.routes.filter((e) => e.pluginId !== pluginId);
    this.settingsTabs = this.settingsTabs.filter((e) => e.pluginId !== pluginId);
    this.chatEnhancers = this.chatEnhancers.filter((e) => e.pluginId !== pluginId);
  }

  /** 返回所有插件工具（含 pluginId，供后端同步到 ToolRegistry） */
  getTools(): Array<{ pluginId: string; tool: BuiltInTool }> {
    return Array.from(this.tools.values()).map(({ __pluginId, ...tool }) => ({ pluginId: __pluginId, tool }));
  }

  /** 聚合快照（供 HTTP 返回前端 usePluginStore） */
  snapshot() {
    return {
      tools: Array.from(this.tools.values()).map((e) => ({
        pluginId: e.__pluginId,
        name: e.name,
        description: e.description,
        inputSchema: e.inputSchema,
        outputSchema: e.outputSchema,
      })),
      backendRoutes: this.backendRoutes.map((r) => r.pluginId),
      themes: this.themes,
      layouts: this.layouts,
      sidebar: this.sidebar,
      routes: this.routes,
      settingsTabs: this.settingsTabs,
      chatEnhancers: this.chatEnhancers,
    };
  }
}
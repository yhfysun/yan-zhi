// 插件系统类型定义
import type { BuiltInTool } from '../tool/types';
import type { PlatformAdapter } from '../platform/types';

/** 一次性资源句柄 */
export interface Disposable {
  dispose(): void;
}

/** 插件权限声明 */
export type PluginPermission = 'fs' | 'shell' | 'git' | 'db' | 'network' | 'clipboard';

/** 插件状态 */
export type PluginState = 'installed' | 'enabled' | 'disabled' | 'error';

/** 插件来源 */
export type PluginSource = 'builtin' | 'installed';

/** 主题调色板（与 settings store 的 ThemePalette 结构一致，可由插件贡献） */
export interface ThemePalette {
  id: string;
  name: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  gradient: string;
  orb1: string;
  orb2: string;
  orb3: string;
  dark?: Partial<{
    primary: string;
    primaryLight: string;
    primaryDark: string;
    accent: string;
    background: string;
  }>;
}

/** 布局定义（component 为前端组件路径，由 usePluginStore 解析） */
export interface LayoutDef {
  id: string;
  name: string;
  component: string;
  icon?: string;
}

/** 侧栏入口 */
export interface SidebarItem {
  id: string;
  icon: string;
  route: string;
  label: string;
  order?: number;
  badge?: string | number;
  /** 显隐条件：'desktop' | 'mobile' | 'web' | 'all' */
  when?: string;
}

/** 前端路由配置（component 为组件路径） */
export interface RouteConfig {
  path: string;
  name: string;
  component: string;
  meta?: Record<string, unknown>;
}

/** 设置面板（component 为组件路径） */
export interface SettingsTab {
  id: string;
  label: string;
  icon?: string;
  component: string;
}

/** 对话增强器（module 为前端模块路径） */
export interface ChatEnhancerDef {
  id: string;
  module: string;
}

/** contributes 声明（清单中的扩展点贡献） */
export interface PluginContributes {
  tools?: string[];
  themes?: ThemePalette[];
  layouts?: LayoutDef[];
  sidebar?: SidebarItem[];
  routes?: RouteConfig[];
  settingsTabs?: SettingsTab[];
  chatEnhancers?: ChatEnhancerDef[];
  backendRoutes?: string[];
}

/** 插件清单 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  minAppVersion?: string;
  main?: string;
  ui?: string;
  permissions?: PluginPermission[];
  contributes?: PluginContributes;
  /** 配置 schema（JSON Schema） */
  config?: Record<string, unknown>;
}

/** 插件存储接口 */
export interface PluginStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** 插件上下文（激活时注入，插件唯一 API 入口） */
export interface PluginContext {
  id: string;
  log: (...args: unknown[]) => void;
  adapter: PlatformAdapter;
  config: Record<string, unknown>;
  registerTool(def: BuiltInTool): Disposable;
  registerBackendRoute(setup: (app: unknown) => void): Disposable;
  storage: PluginStorage;
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (...args: unknown[]) => void): Disposable;
}

/** 插件入口模块 */
export interface PluginModule {
  activate(ctx: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}

/** 插件运行实例（内部） */
export interface Plugin {
  manifest: PluginManifest;
  state: PluginState;
  error?: string;
  config: Record<string, unknown>;
  source: PluginSource;
  disposables: Disposable[];
}
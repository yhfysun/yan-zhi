// 插件系统类型定义
import type { BuiltInTool } from '../tool/types';
import type { PlatformAdapter } from '../platform/types';

/** 一次性资源句柄 */
export interface Disposable {
  dispose(): void;
}

/** 插件权限声明 */
export type PluginPermission = 'fs' | 'shell' | 'git' | 'db' | 'network' | 'clipboard' | 'desktop-input' | 'remote-shell';

/** 插件状态 */
export type PluginState = 'installed' | 'enabled' | 'disabled' | 'error';

/** 插件来源 */
export type PluginSource = 'builtin' | 'installed';

/**
 * 主题/皮肤调色板（与 settings store 的 ThemePalette 结构一致，可由插件贡献）。
 * kind='palette'（缺省）为纯配色方案；kind='skin' 为带壁纸的完整皮肤，
 * 壁纸/预览图为插件包内相对路径，运行时经 /api/plugin-assets/:pluginId/<path> 提供静态服务。
 */
export interface ThemePalette {
  id: string;
  name: string;
  /** 主题类型：palette=纯调色板（默认）；skin=带壁纸皮肤 */
  kind?: 'palette' | 'skin';
  /** 皮肤库分类（如 动漫/风景/美图/简约），仅 kind='skin' 时有意义的展示字段 */
  category?: string;
  /** 皮肤预览图（插件包内相对路径），皮肤库卡片展示用 */
  preview?: string;
  /** 壁纸（按深浅色各一张，可只配 light 则两种模式共用） */
  wallpaper?: {
    light: string;
    dark?: string;
    /** 壁纸上的遮罩强度 0~1（保证文字可读），默认 0.35 */
    mask?: number;
    /** 背景模糊半径 px（毛玻璃壁纸），默认 0 不模糊 */
    blur?: number;
  };
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
  /**
   * 皮肤表面定制（按钮/弹窗/边框/圆角/玻璃面板），kind='skin' 时生效。
   * 全部可选，缺省回落默认玻璃质感；深浅色模式可分别指定。
   */
  surface?: {
    /** 浅色模式玻璃面板底色 tint（弹窗/侧栏/预览窗/卡片毛玻璃），默认 #ffffff */
    glass?: string;
    /** 深色模式玻璃面板底色 tint，默认 #1d1d1c */
    glassDark?: string;
    /** 浅色模式玻璃不透明度 0~1（越大越实），默认 0.86 */
    glassAlpha?: number;
    /** 深色模式玻璃不透明度，默认 0.78 */
    glassAlphaDark?: number;
    /** 浅色模式表面边框色（弹窗/抽屉/预览窗/应用边缘描边） */
    border?: string;
    /** 深色模式表面边框色 */
    borderDark?: string;
    /** 全局表面圆角 px（弹窗/卡片/预览窗/菜单），默认 12 */
    radius?: number;
    /** 按钮圆角 px（el-button），默认 6 */
    buttonRadius?: number;
    /** 实心主按钮文字色（缺省按主色对比度自动：浅主色→墨字，深主色→白字） */
    buttonText?: string;
    /** 玻璃模糊半径 px（面板/弹窗 backdrop-filter），默认 18 */
    glassBlur?: number;
    /** 弹窗遮罩色（el-overlay 背景），默认透明 */
    overlayColor?: string;
    /** 弹窗遮罩模糊半径 px，默认 4 */
    overlayBlur?: number;
    /** 弹窗边框装饰图案（CSS border-image-source 或 URL），默认 none */
    borderPattern?: string;
    /** 弹窗边框装饰切片（border-image-slice），默认 0 */
    borderPatternSlice?: number;
    /** 弹窗标题栏背景图案（URL 或 CSS background-image），默认 none */
    titlebarPattern?: string;
    /** 弹窗/卡片阴影（CSS box-shadow），默认使用 --overlay-shadow */
    shadow?: string;
    /** 实心主按钮渐变背景（CSS background-image），缺省=纯色 primary */
    buttonGradient?: string;
    /** 输入框圆角 px（el-input/el-select/el-textarea），缺省=buttonRadius */
    inputRadius?: number;
    /** 卡片圆角 px（el-card/glass-card），缺省=radius */
    cardRadius?: number;
    /** 标签/徽标圆角 px（el-tag），缺省=buttonRadius */
    tagRadius?: number;
    /** 自定义滚动条 thumb 色（覆盖默认主色低 alpha），缺省=主色 20% */
    scrollbarThumb?: string;
    /**
     * 自定义滚动条 thumb 图案（CSS background-image 完整值，如 linear-gradient(...)）。
     * 用于实现「棍类武器风格」金箍棒/狼牙棒/蟠龙棍 等差异化的金属质感 +
     * 两端装饰带。缺省 = 金箍棒默认（金色金属光泽 + 两端深色环）。
     * 注意：仅 8px 细滚动条上的纹理，复杂图样不可用，建议 1~2 段 linear-gradient 即可。
     */
    scrollbarPattern?: string;
    /** 自定义分割线色（el-divider / border-bottom 分隔），缺省=glass-border */
    dividerColor?: string;
    /** 分类标签背景图案（CSS background-image 或 URL），跟主背景图呼应，缺省=透明 */
    catTagPattern?: string;
    /** 任务列表背景图（URL），缺省=无 */
    taskListPattern?: string;
    /** 输入框背景图（URL），缺省=无 */
    inputPattern?: string;
    /** 按钮背景图（URL，叠加在 buttonGradient 之上），缺省=无 */
    buttonPattern?: string;
    /** 弹窗背景图（URL），缺省=无 */
    dialogPattern?: string;
    /** 菜单底图（应用菜单/下拉菜单/右键菜单） */
    menuPattern?: string;
    /** 菜单底图暗色变体（暗色主题优先于 menuPattern） */
    menuPatternDark?: string;
    /** 代码模式底图（区别于壁纸的独立背景图） */
    codePattern?: string;
    /** 内置浏览器外壳底图（tab 栏/工具栏） */
    browserPattern?: string;
    /** 浏览器外壳底图暗色变体（暗色主题优先于 browserPattern） */
    browserPatternDark?: string;
    /** 输入框边框色（EP 输入框与自定义输入容器共用） */
    inputBorder?: string;

    /** ===== 部件图贴合方式 ===== */
    /**
     * 部件图（taskList/input/button/dialog/menu/code/browser）的贴合方式，默认 cover。
     * 小尺寸纹理图（如 240×96 的按钮图、320×72 的输入框图）用 cover 会被大幅放大变糊，
     * 应改用 repeat / repeat-x 平铺。
     */
    patternFit?: 'cover' | 'contain' | 'repeat' | 'repeat-x';
    /**
     * 暗色主题下部件图的压暗强度 0~1，默认 0.35。
     * 越大越暗、文字对比越好；越小图案越清晰。改成主色系深色纱罩（不再用纯黑），保留皮肤色相。
     */
    patternScrim?: number;

    /** ===== 配色兜底（可选；未配置时由 primary 自动派生） ===== */
    /** 正文色，缺省=由主色派生 */
    text?: string;
    /** 次级文字色 */
    textSecondary?: string;
    /** 三级文字色（占位符/辅助说明） */
    textTertiary?: string;
    /** 主色上的文字色（实心主按钮/选中项），缺省按对比度自动 */
    onPrimary?: string;
    /** 面板/侧栏/顶栏底色 */
    surfaceColor?: string;
    /** 卡片/弹窗/下拉等抬高一层表面的底色 */
    surfaceRaisedColor?: string;
    /** 输入框/代码区等凹陷一层表面的底色 */
    surfaceSunkenColor?: string;
    /** 悬停底色 */
    surfaceHoverColor?: string;
    /** 选中底色 */
    surfaceActiveColor?: string;
    /** 输入框底色，缺省=surfaceSunkenColor */
    inputBg?: string;
    /** 列表底色，缺省=surfaceColor */
    listBg?: string;
    /** 下拉/菜单底色，缺省=surfaceRaisedColor */
    dropdownBg?: string;
    /** 弹窗底色，缺省=surfaceRaisedColor */
    dialogBgColor?: string;
    /** 弹窗遮罩色，缺省由主色派生的半透明深色 */
    overlayTint?: string;
    /** 壁纸遮罩色 · 浅色主题，缺省由皮肤 surface 派生暖白纱 */
    wallpaperOverlayTint?: string;
    /** 壁纸遮罩色 · 深色主题，缺省由皮肤 surface 派生深色纱（保留皮肤色相） */
    wallpaperOverlayTintDark?: string;
  };
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
  /**
   * 「更多」菜单落位（仅桌面 TitleBar 的更多下拉消费）：
   * 'capability' | 'data' | 'connection' 并入同名既有分组；
   * 其它值（如 'ops'）作为新分组出现，组名取 moreGroupLabel。
   * 缺省 'nav'：渲染到侧栏「插件」分组（历史行为）。
   */
  moreGroup?: string;
  /** 新分组（moreGroup 非 'nav'/'capability'/'data'/'connection'）的显示名 */
  moreGroupLabel?: string;
  /** 「更多」菜单项的灰字说明 */
  desc?: string;
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
  /** 插件分类：'功能' | '皮肤' | '操作' 或自定义类别名；缺省时前端按 contributes/permissions 推导 */
  category?: string;
  /** 插件类型：'application'=通用功能插件（侧栏菜单展示），'code'=代码模式专用插件（代码模式"更多"入口展示）。缺省='application' */
  kind?: 'application' | 'code';
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
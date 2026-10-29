// 插件系统类型定义
import type { BuiltInTool } from '../tool/types';
import type { PlatformAdapter } from '../platform/types';

/** 一次性资源句柄 */
export interface Disposable {
  dispose(): void;
}

/** 插件权限声明 */
export type PluginPermission = 'fs' | 'shell' | 'git' | 'db' | 'network' | 'clipboard' | 'desktop-input' | 'desktop-shell' | 'llm' | 'data-contracts' | 'remote-shell' | 'shop-write';

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
    /**
     * 全局圆角基准 px —— **全站唯一的圆角旋钮**。
     * 视为「覆盖层档」基准（默认 14），其余三档由它按固定比例派生：
     * 微件 6 / 控件 8 / 容器 12 / 覆盖层 14。皮肤只能整体放大或收紧圆角，
     * 不能单独改某一类控件的圆角（那会导致按钮/卡片/弹窗各走各的）。
     */
    radius?: number;
    /**
     * @deprecated 逐项圆角已废止，配置无效（仅登记，不再下发变量）。
     * 圆角请统一用 `radius`。
     */
    buttonRadius?: number;
    /** 实心主按钮文字色（缺省按主色对比度自动：浅主色→墨字，深主色→白字） */
    buttonText?: string;
    /** 玻璃模糊半径 px（面板/弹窗 backdrop-filter），默认 18 */
    glassBlur?: number;
    /** 弹窗遮罩色（el-overlay 背景），默认透明 */
    overlayColor?: string;
    /** 弹窗遮罩模糊半径 px，默认 14 */
    overlayBlur?: number;
    /** 弹窗表面（底图）磨砂半径 px，默认 8；0 = 不磨砂 */
    dialogBlur?: number;
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
    /** @deprecated 逐项圆角已废止（输入框恒为控件档）；请用 `radius` */
    inputRadius?: number;
    /** @deprecated 逐项圆角已废止（卡片恒为容器档）；请用 `radius` */
    cardRadius?: number;
    /** @deprecated 逐项圆角已废止（标签恒为微件档）；请用 `radius` */
    tagRadius?: number;
    /** 自定义滚动条 thumb 色（覆盖默认主色低 alpha），缺省=主色 20% */
    scrollbarThumb?: string;
    /**
     * 滚动条「棍身」贴图（**竖版**，CSS background-image 完整值）。
     * 2026-09-13 第四版定稿 —— **材质剖面模型**：
     *   滚动条不是「一个物件」（前三版画顶箍/中身/底箍，全被否），而是「一段材质」。
     *   一个无缝循环节拍 = [金箍带 6px][乌铁段 18px]，沿轴 repeat 平铺。
     *   于是**无论 thumb 多长**（thumb 长度=视口/内容比，不确定）都是连续棍身。
     *
     * ⚠️ 竖版 / 横版必须**分素材**（下列 6 个字段一一对应）：
     *   · 竖版 body 沿 Y 平铺 → 瓷砖内沿 X 做金属渐变（暗-亮-暗）
     *   · 横版 body 沿 X 平铺 → 瓷砖内沿 Y 做金属渐变
     *   若拿竖版 body 去 repeat-x（早期错法），平铺轴 X 上存在暗边
     *   → 每片瓷砖接缝处出现黑缝，碎成「一串小方块」（用户已截图反馈）。
     *
     * 实现要点：
     *  · 必须 `url("data:image/svg+xml;base64,...")`（base64），未编码的 `;utf8,` 会静默失效。
     *  · 一律写在**独立的 background-image 长属性**里，不要塞进 `background:` 简写。
     *  · 6 个字段建议**一起给**；缺省时回落 skin.css 内置默认（同样是 6 层变量）。
     */
    scrollbarVBody?: string;
    /** 竖条起点端头（金箍收口，6px），缺省=内置默认 */
    scrollbarVCap?: string;
    /** 竖条终点端头（金箍收口镜像，6px），缺省=内置默认 */
    scrollbarVCapFlip?: string;
    /** 滚动条棍身贴图（**横版**，沿 X 无缝平铺），缺省=内置默认 */
    scrollbarHBody?: string;
    /** 横条左侧端头（6px），缺省=内置默认 */
    scrollbarHCap?: string;
    /** 横条右侧端头（6px），缺省=内置默认 */
    scrollbarHCapFlip?: string;
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
    /**
     * 卡片变体底图（多张，按顺序对应 --skin-card-1..N-pattern）。
     * 用途：同一类卡片（会话行 / 空间条目 / 任务行 / 玻璃卡片 / 消息卡片）
     * 需要"多套样式 + 随机分配"，避免整列卡片长得一模一样。
     * CSS 侧按 nth-child 循环取图 —— 稳定可复现（不依赖 JS 记状态），观感即"随机"。
     * 内置皮肤由 scripts/build-skin-parts.mjs 从壁纸 4 个不同区域取景生成
     * card-1-bg.webp ~ card-4-bg.webp；缺省时回落 taskListPattern / 无图。
     */
    cardPatterns?: string[];
    /** 卡片变体底图暗色变体（暗色主题优先；缺省按 <name>-dark.webp 约定推导） */
    cardPatternsDark?: string[];
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

/**
 * 模式贡献（mode-pluginization）：模式插件用它声明一个应用模式。
 * 服务端聚合进 /api/plugins 快照的 modeDefs（放行 = 物理在包 ∩ 用户启用 ∩ 授权档）；
 * 前端运行时合并进 mode store 并动态注册路由，替代构建期硬编码的模式清单。
 */
export interface ModeContribution {
  /** 模式键（kebab-case），与会话 conversation.mode 列取值一致，如 'clip' */
  key: string;
  label: string;
  desc?: string;
  icon?: string;
  /** 模式路由，如 '/clip' */
  route: string;
  /**
   * 模式工作台前端入口（插件包内相对路径，如 'frontend/index.mjs'）。
   * 与 ui.entry 指向同一 bundle 时可不重复填（装载器先取 mode.entry 再回落 ui.entry）。
   */
  entry?: string;
  /** 移动端无桌面环境：true 时 MOBILE_MODE 跳过注册、前端移动端隐藏 */
  desktopOnly?: boolean;
  /** 切到该模式时无会话可恢复的兜底智能体（App.vue 硬编码的替代） */
  fallbackAgent?: string;
  /** 对话区形态：center=对话居中（缺省），side=侧挂 */
  chatPlacement?: 'center' | 'side';
}

/** 插件前端 bundle 声明（plugin 包内路径，运行时经 yz://plugin/<id>/ 装载） */
export interface PluginUiContribution {
  /** 前端 bundle 入口（如 'frontend/index.mjs'） */
  entry?: string;
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

/**
 * 剧本（**命令的序列**，2026-10-16）—— `@信息收集` 这类"一键跑一串"的东西。
 *
 * ★ 为什么是"命令序列"而不是另造一套流程引擎：本仓已经有工作流引擎（`workflow/engine`）
 *   与 SOP 步骤（`task_type.steps_json`），再发明第三种多步模型必然互相漂移。
 *   剧本在这里的定义**只有一个**：一串**已存在的命令**按顺序跑，复用命令中枢的解析与执行通道
 *   （含各自的护栏与审计）。它自己不做任何执行。
 * ★ `confirmEach`：每一步都先问（方案里 `@完整评估`「全流程，需人工确认每一步」就是这么标的）。
 */
export interface PlaybookDef {
  /** 唯一 id（kebab-case），如 'recon-basic' */
  id: string;
  /** 召唤名（`@信息收集` 里的「信息收集」） */
  name: string;
  desc?: string;
  /**
   * 步骤 = 命令行片段数组，**与手敲的 `/命令 参数` 同语法**（可含 `${target}` 等占位符）。
   * ★ 用命令行字符串而不是结构化对象：剧本作者写的就是他要敲的那一行，
   *   否则"剧本里写的"与"手敲的"两套语义迟早分叉。
   */
  steps: string[];
  /** 面板分组（缺省按 SEC 之类的域分组） */
  group?: string;
  /** 限定模式（'sec'）；不填 = 全局 */
  mode?: string;
  /** 标了就每一步都先确认（高危剧本） */
  confirmEach?: boolean;
}

/** 命令定义（**命令中枢**，2026-10-16）。
 *
 * ★ 为什么要有这个扩展点：命令此前**写死在前端**（`ChatInputArea.vue` 的 `/agent`、`/model` …），
 *   每加一个能力就要改那个数组 ⇒「界面随能力增长」。声明式收口后：各能力在
 *   `contributes.commands` 里声明，前端只负责"列出 + 搜索 + 触发"
 *   （见 `packages/ui/src/stores/commands.ts` 的命令总线）。
 *
 * ★ 与**页面指令**（`browser_page_command` 表）的关系（两边方案文档都写死的一条）：
 *   页面指令**不是另一套概念**，而是 `kind:'page'` 的命令 + 页面作用域字段
 *   （`pageKind` / `matchHost` / `matchUrl`）。差别只有一处：页面指令是**持久化数据**
 *   （用户可增删改），本类型是**声明式**的（随代码发布）—— 前者由适配器映射成后者统一进总线，
 *   映射点只有一处（`packages/ui/src/utils/commandBridge.ts`）。
 *   ⇒ 所以**不要求两边字段逐名相同**：硬把 `description→desc`、`kind` 语义合并要动
 *   19 个文件 + 表迁移 + 已上线的导入/导出协议（代价约 10 倍），方案文档明确不建议。
 */
export interface CommandDef {
  /** 命令名（不带 `/`），如 'portscan' / '总结本页' */
  name: string;
  /** 别名（输入 `/ps` 等价于 `/portscan`） */
  aliases?: string[];
  /** 一行说明（命令面板与 `/help` 用） */
  desc: string;
  /** 用法串，如 '/portscan <target> [-p spec]' */
  usage?: string;
  /** 面板分组（'SYS' / 'PAGE' / 'SCAN' …）；同一分组的命令在面板里折叠在一起 */
  group: string;
  /** 限定模式（'sec' 等）；不填 = 全局可用 */
  mode?: string;
  /** 展示用风险级（'P'被动 / 'A'主动 / 'I'侵入 / 'S'模拟）。**只管展示，执行仍由 guard 决定** */
  danger?: string;
  /**
   * 执行前是否必须**人工二次确认**（确认后命令层会给工具补 `confirmed: true`）。
   * ★ 与 `danger` 分开：`danger` 是**风险标签**（必须与护栏的 `TOOL_RISK` 逐条一致），
   *   `confirm` 是**交互闸门**。两者常常同时成立但不总是一致 ——
   *   例如靶场部署/停止的风险级是 active，可它的 schema 要求 `confirmed: true`；
   *   只在 `danger` 上做文章就会把"主动"误标成"侵入"，或者让用户收到一句
   *   看不懂的"必须为 true 才真正部署"。
   */
  confirm?: boolean;
  /**
   * 执行分流：
   * · 'tool'    —— 走后端插件工具（`tool` 指向工具名，端点 `/plugin/<pluginId>/run`）
   * · 'builtin-tool' —— 走**通用内置工具**（`tool` 指向 ToolRegistry 里的工具名，
   *   端点 `/api/tools/builtin/execute`）。★ 只允许**只读**工具走这条路：
   *   清单由服务端 `/api/tools/builtin/commands` 按 `readonly` 过滤后下发。
   * · 'ui'      —— 前端动作（`run` 指向动作 id）
   * · 'builtin' —— 内置命令（前端已实现）
   * · 'page'    —— **页面指令**：页面作用域，执行走浏览器面板那条通道
   *   （`pageKind='task'` → 发进会话；`pageKind='script'` → 在页面上跑脚本）
   */
  kind: 'tool' | 'ui' | 'builtin' | 'page' | 'builtin-tool';
  /** kind='tool'：映射到的插件工具名 */
  tool?: string;
  /**
   * kind='tool'：该命令由**哪个插件**提供 —— 执行时据此定端点（`/plugin/<pluginId>/run`）。
   * ★ 这不是新造的执行面：安全控制台本来就走 `POST /plugin/sec-lab/run`，
   *   命令只是它的另一个调用者（同一套护栏、同一份审计）。
   */
  pluginId?: string;
  /**
   * 位置参数的名字，**按顺序**对应命令行的位置参数。
   * 例：`params: ['target','ports']` ⇒ `/portscan 10.0.0.1 80,443` → `{target:'10.0.0.1', ports:'80,443'}`。
   * ★ 为什么用有序数组而不是方案里的 `args?: JsonSchema`：现在只需要"位置参数往哪个字段塞"，
   *   而 JSON Schema 要写 18 遍（且会与工具自己的 schema 漂移）。等真要做
   *   参数补全/校验时再升级成 schema，届时只用改这一个字段的消费方。
   * ★ 没列进 `params` 的字段一律由**长选项**给（`--banner` / `--ports=80,443`）。
   */
  params?: string[];
  /** kind='ui'：前端动作 id（如 'open-tab:findings'） */
  run?: string;
  /** kind='page' 专用：指令的原始形态（自然语言任务 / 页面脚本） */
  pageKind?: 'task' | 'script';
  /** kind='page' 专用：站点匹配（`*` 全局 / `域名` / `*.域名` 通配） */
  matchHost?: string;
  /** kind='page' 专用：URL 正则（**优先于** matchHost） */
  matchUrl?: string;
  /** kind='page' 专用：持久化主键（编辑 / 删除 / 统计要回查那一行） */
  pageCommandId?: string;
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
  /** 命令中枢：声明式命令（前端命令面板与 `/` 菜单据此列出） */
  commands?: CommandDef[];
  /** 命令中枢：剧本（`@名字` 召唤的命令序列） */
  playbooks?: PlaybookDef[];
  /** 模式贡献：模式插件声明应用模式（运行时合并进模式清单与路由） */
  mode?: ModeContribution;
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
  /** 宿主兼容版本（semver range，如 '^0.1'）；.yzp 安装时与宿主版本比对，不兼容拒绝安装 */
  engine?: string;
  main?: string;
  /**
   * 前端声明。旧形态为 string（无消费者，保留兼容）；
   * 插件包形态为对象：entry 指向插件包内前端 bundle，运行时经 yz://plugin/<id>/ 动态装载。
   */
  ui?: string | PluginUiContribution;
  permissions?: PluginPermission[];
  contributes?: PluginContributes;
  /**
   * 插件自有 SQL 表白名单（表名）。沙箱 db 只放行对这些表的 CRUD + plugin_storage KV，
   * 未声明的表一律拒绝 —— 插件不允许摸主库其它 60 张表。
   */
  ownedTables?: string[];
  /** 配置 schema（JSON Schema） */
  config?: Record<string, unknown>;
}

/** 插件存储接口 */
export interface PluginStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * 插件 WebSocket 连接。结构性类型 —— core 不依赖 ws，服务端把真实的 ws 实例按这个形状传进来。
 * 只暴露插件真正需要的那几项，避免插件摸到服务端 socket。
 */
export interface PluginWebSocket {
  /** 1 = OPEN（对应 ws 的 WebSocket.OPEN） */
  readonly readyState: number;
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  /**
   * 发协议级 ping 帧。浏览器**自动回 pong**，客户端无需任何代码 ——
   * 用来在网络被硬断（拔网线 / 休眠）时兜底回收会话，因为那种情况下 'close' 未必及时到达。
   */
  ping(): void;
  on(event: 'message', cb: (data: Buffer, isBinary: boolean) => void): void;
  on(event: 'pong', cb: () => void): void;
  on(event: 'close', cb: (code: number, reason: Buffer) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
}

/** WebSocket 握手请求里插件用得上的部分 */
export interface PluginWsRequest {
  /** 原始 URL（含 query），如 /api/plugin/ops-shell/term/ws?connectionId=xxx */
  url: string;
  headers: Record<string, string | string[] | undefined>;
}

/** 插件上下文（激活时注入，插件唯一 API 入口） */
export interface PluginContext {
  id: string;
  log: (...args: unknown[]) => void;
  adapter: PlatformAdapter;
  config: Record<string, unknown>;
  registerTool(def: BuiltInTool): Disposable;
  registerBackendRoute(setup: (app: unknown) => void): Disposable;
  /**
   * 注册 WebSocket 端点。mountPath 相对于 `/api/plugin/<pluginId>`，如 `/term/ws`。
   *
   * ★ 升级请求不走 Express 中间件链 —— 所以挂在 `/api` 上的授权门禁（requireLicense）
   *   由**服务端分发层**统一补做，插件不必也不能自己实现。
   */
  registerWebSocket(
    mountPath: string,
    onConnection: (ws: PluginWebSocket, req: PluginWsRequest) => void,
  ): Disposable;
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
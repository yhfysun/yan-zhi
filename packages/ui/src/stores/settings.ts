// 设置 store（持久化到 keyring 的特殊命名空间）
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';
import { API_BASE } from '../api/client';
import { usePluginStore } from './plugin';
import { BUILTIN_SKIN_SERIES, isBuiltinSkinId, builtinSeriesFor, builtinSeriesPalette } from '../styles/skinSeries';

export type ThemeName = string;
export const BUILTIN_THEME_NAMES = ['cinnabar', 'ink', 'indigo', 'pine', 'clay'] as const;

/** 皮肤表面定制（与 @yan-zhi/core ThemePalette['surface'] 结构一致，此处局部声明避免循环依赖） */
type SkinSurface = {
  glass?: string;
  glassDark?: string;
  glassAlpha?: number;
  glassAlphaDark?: number;
  border?: string;
  borderDark?: string;
  radius?: number;
  buttonRadius?: number;
  buttonText?: string;
  glassBlur?: number;
  overlayColor?: string;
  overlayBlur?: number;
  borderPattern?: string;
  borderPatternSlice?: number;
  titlebarPattern?: string;
  shadow?: string;
  buttonGradient?: string;
  inputRadius?: number;
  cardRadius?: number;
  tagRadius?: number;
  scrollbarThumb?: string;
  dividerColor?: string;
  catTagPattern?: string;
  taskListPattern?: string;
  inputPattern?: string;
  buttonPattern?: string;
  dialogPattern?: string;
  /** 菜单底图（应用菜单/下拉菜单/右键菜单） */
  menuPattern?: string;
  /** 菜单底图暗色变体（p.dark 深底，暗色主题优先于 menuPattern） */
  menuPatternDark?: string;
  /** 代码模式底图（区别于壁纸的独立背景图） */
  codePattern?: string;
  /** 内置浏览器外壳底图（tab 栏/工具栏） */
  browserPattern?: string;
  /** 浏览器外壳底图暗色变体（暗色主题优先于 browserPattern） */
  browserPatternDark?: string;
  /** 输入框边框色（EP 输入框与自定义输入容器共用） */
  inputBorder?: string;
  /** 部件图贴合方式：cover=铺满（大图）/ repeat=平铺（小纹理）/ repeat-x=横向平铺 */
  patternFit?: 'cover' | 'contain' | 'repeat' | 'repeat-x';
  /** 暗色下部件图压暗强度 0~1（默认 0.35；越大越暗越保文字对比，越小图案越清晰） */
  patternScrim?: number;
  /** ===== 配色兜底（可选；未填则按 primary 派生，见 deriveSkinTokens） ===== */
  /** 正文色 */
  text?: string;
  /** 次级文字色 */
  textSecondary?: string;
  /** 三级文字色（占位符/辅助说明） */
  textTertiary?: string;
  /** 主色上的文字色 */
  onPrimary?: string;
  /** 面板/侧栏/顶栏底色（对应 CSS --skin-surface） */
  surfaceColor?: string;
  /** 卡片/弹窗/下拉等"抬高一层"的底色 */
  surfaceRaisedColor?: string;
  /** 输入框/代码区等"凹陷一层"的底色 */
  surfaceSunkenColor?: string;
  /** 悬停底色 */
  surfaceHoverColor?: string;
  /** 选中底色 */
  surfaceActiveColor?: string;
  /** 输入框底色（缺省=surfaceSunkenColor） */
  inputBg?: string;
  /** 列表底色（缺省=surfaceColor） */
  listBg?: string;
  /** 下拉/菜单底色（缺省=surfaceRaisedColor） */
  dropdownBg?: string;
  /** 弹窗底色（缺省=surfaceRaisedColor） */
  dialogBgColor?: string;
  /** 弹窗遮罩色（缺省由派生给出半透明深色） */
  overlayTint?: string;
  /** 壁纸遮罩色 · 浅色主题（缺省由皮肤 surface 派生暖白纱） */
  wallpaperOverlayTint?: string;
  /** 壁纸遮罩色 · 深色主题（缺省由皮肤 surface 派生深色纱，保留皮肤色相） */
  wallpaperOverlayTintDark?: string;
};

/** ===== 颜色工具：hex 解析 / 混色 / WCAG 对比度 ===== */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return '#' + [m(r1, r2), m(g1, g2), m(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** hex → rgba(...) 字符串 */
function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 皮肤配色派生（兜底链第二层）
 * ------------------------------------------------------------------
 * 作用：皮肤未显式配置某个颜色时，从它的 primary 自动派生出一套完整配色。
 * 这是"暗色系灰蒙蒙"的根治手段 —— 改造前所有未配置的兜底都是硬编码中性灰
 * （#1d1d1c / #f5f1ea），27 套皮肤里 23 套没配 glassDark，于是暗色下千篇一律的灰。
 * 派生后每套皮肤即使一个字段都不填，也保留自己的色相。
 *
 * 层级关系（暗色为例）：surfaceRaised > surface > base > surfaceSunken
 * 亮色则反过来：surfaceRaised 最白，surfaceSunken 最暗。
 */
function deriveSkinTokens(primary: string, dark: boolean) {
  const p = primary || '#C2410C';
  const base = dark ? '#0E0F12' : '#FBFBFB';
  const ink = dark ? '#FFFFFF' : '#141414';

  // ===== 文本层：正文带一点主色相，次级逐级向底色靠 =====
  const text = mixHex(ink, p, 0.08);
  const textSecondary = dark ? mixHex(text, base, 0.28) : mixHex(text, '#FFFFFF', 0.32);
  // 三级文字（占位符）需保证 ≥3:1；浅色下混白 0.5 实测只有 2.74，降到 0.4
  const textTertiary = dark ? mixHex(text, base, 0.45) : mixHex(text, '#FFFFFF', 0.4);
  const textDisabled = dark ? mixHex(text, base, 0.6) : mixHex(text, '#FFFFFF', 0.55);
  const onPrimary = contrastRatio(p, '#FFFFFF') >= 4.5 ? '#FFFFFF' : (dark ? '#F2F0EA' : '#141414');

  // ===== 容器三级：raised（弹窗/下拉/卡片） > surface（面板） > sunken（输入框/代码区） =====
  const surface = dark ? mixHex(base, p, 0.07) : mixHex(base, p, 0.06);
  const surfaceRaised = dark ? mixHex(base, p, 0.13) : mixHex('#FFFFFF', p, 0.025);
  const surfaceSunken = dark ? mixHex(base, '#000000', 0.3) : mixHex('#F1F0EE', p, 0.05);
  const surfaceHover = dark ? mixHex(surfaceRaised, p, 0.12) : mixHex(surfaceRaised, p, 0.1);
  const surfaceActive = dark ? mixHex(p, surfaceRaised, 0.68) : mixHex(p, '#FFFFFF', 0.8);
  const overlayTint = hexToRgba(mixHex(base, p, 0.12), dark ? 0.6 : 0.24);

  // ===== 控件层：由容器三级派生，保证同皮肤内层级一致 =====
  return {
    text, textSecondary, textTertiary, textDisabled, onPrimary,
    surface, surfaceRaised, surfaceSunken, surfaceHover, surfaceActive, overlayTint,
    inputBg: surfaceSunken,
    inputBorder: mixHex(p, surfaceSunken, 0.55),
    inputText: text,
    inputPlaceholder: textTertiary,
    listBg: surface,
    listItemHover: surfaceHover,
    listItemActive: surfaceActive,
    listItemText: text,
    listDivider: mixHex(p, surface, 0.18),
    dropdownBg: surfaceRaised,
    dropdownItemHover: surfaceHover,
    dropdownItemActive: surfaceActive,
    dropdownBorder: mixHex(p, surfaceRaised, 0.5),
    dropdownText: text,
    dialogBg: surfaceRaised,
    dialogBorder: mixHex(p, surfaceRaised, 0.45),
    dialogTitleBg: mixHex(p, surfaceRaised, 0.16),
    dialogTitleText: text,
    dialogText: textSecondary,
    buttonBg: surfaceRaised,
    buttonBgHover: surfaceHover,
  };
}

export interface AppSettings {
  /** 主题色 id（cinnabar/ink/indigo/pine/clay 或插件贡献的 palette） */
  palette: ThemeName;
  /** 皮肤 id（空=无皮肤/纯调色板；非空=插件贡献的 kind='skin' 主题） */
  skin: ThemeName;
  darkMode: boolean;
  defaultPlatformId: string;
  defaultModelId: string;
  keepRecent: number;
  maxContextTokens: number;
  enableCompression: boolean;
  workspaceDir: string;
  /** 工作目录最近使用记录（目录选择器 chip 快捷入口，新选择的目录提到最前，最多 5 个） */
  recentWorkspaceDirs: string[];
  appGuide: string;
  /** 记忆抽取模型配置：空则默认本地小模型 */
  memoryExtractPlatformId: string;
  memoryExtractModelId: string;
  /** 当前布局 id；'default' 为内置布局，其它值由插件 contributes.layouts 提供 */
  layout: string;
}

/**
 * 内置应用说明书——按「功能/按钮/工具」拆成独立文档。
 * 每一条 = 知识库里一个独立文档节点（再切成若干分片），图谱里每个功能都能单独看到。
 * APP_GUIDE_DOCS 是结构化源；DEFAULT_APP_GUIDE 是它们的拼接（供 buildSystemPrompt 命中「怎么用」时整段注入）。
 */
export const APP_GUIDE_DOCS: Array<{ name: string; content: string }> = [
  {
    name: '应用简介',
    content: `# 关于本应用（Yan-zhi 智能助手）
这是一个跨端 AI 智能助手，帮助处理聊天、知识、记忆、文件、浏览器、多智能体等任务。
- 桌面端：基于 Electron；网页端：PWA；移动端：Capacitor。
- 登录后可用云端大模型；离线（不登录）时也可用大部分功能。
- 数据分层：对话/配置/本地文件本地存储；知识/记忆等共享数据落在内置服务端（guest/登录统一，知识库支持公开/私有）。`,
  },
  {
    name: '左侧会话栏与聊天',
    content: `## 左侧会话栏与聊天
- 左侧是会话列表：可新建 / 切换 / 删除会话，每个会话独立上下文。
- 顶部可切换「会话 / 智能体」视角。
- 底部输入框输入问题，回车或点发送与 AI 对话；对话中可上传文件给 AI 参考。
- 会话记忆：当前会话内的连续性由「会话记忆」承载，不串到其它会话。`,
  },
  {
    name: '模型平台与模型选择',
    content: `## 模型平台与模型选择
- 顶部有「平台 / 模型」下拉：选择要使用的模型平台和具体模型。
- 在「设置」→「模型平台」里可新增平台（OpenAI / Anthropic 兼容网关、Ollama 等），配置 API 地址与密钥。
- 本地模型由本机 **Ollama** 提供：先确保本机已安装并运行 Ollama（默认 http://127.0.0.1:11434），在「模型平台」新增一个 Ollama 平台指向它；再到「本地模型市场」按需拉取模型（如 qwen2.5:1.5b、qwen3:4b、nomic-embed-text 向量模型等）。
- 离线（未登录）时可用本机 Ollama 本地模型；未配置 Ollama 则需配置外部模型平台。
- 记忆抽取等后台任务用「记忆抽取模型」，默认本机 Ollama 小模型，可单独配置更强模型。`,
  },
  {
    name: '右侧预览面板',
    content: `## 右侧预览面板
- 右侧是预览区，可显示「文件预览」或「内置浏览器」。
- 文件预览：点击文件即用内置预览查看（文本/图片/PDF 等）。
- 浏览器模式：输入网址或点快捷入口（默认百度）打开网页；桌面端用 Electron 原生浏览器渲染，无需额外下载组件。
- 预览标签页显示真实的文件名/网站名，方便区分。`,
  },
  {
    name: '工作目录',
    content: `## 工作目录（重要）
- 在输入框上方可点「工作目录」按钮选择目录。
- 选定后，该目录作为 AI 执行命令（cmd_exec）、列目录（api_workspace_list_dir）、搜文件（api_workspace_search_files）的「默认根目录」。
- 对话开始会把该目录写进 system prompt（"当前工作目录：xxx"），让 AI 知道该在哪读写文件、跑命令。
- 如果 AI 说找不到文件 / 命令执行失败，先确认工作目录是否正确。`,
  },
  {
    name: '文件管理',
    content: `## 文件管理
- 聊天中产生的文件按三类分类管理：已上传 / 中间文件 / 已交付。
  - 已上传：你手动发给 AI 的文件。
  - 中间文件：AI 处理过程中的临时产物。
  - 已交付：AI 完成的最终成果文件。
- 在输入框附近或预览面板可打开「文件管理」弹窗，分类查看 / 打开 / 删除文件。`,
  },
  {
    name: '知识库',
    content: `## 知识库（核心）
- 可在「知识库」页创建库，支持「公开（public，所有人可见）/ 私有（private，仅自己）」两种共享级别。
  - 未登录（访客）创建的库固定为公开共享；登录用户可自选，并可用「发布」把私有库设为公开。
- 给库「添加文档」：可粘贴正文、填本地路径，或直接「选择文件」上传（文本类自动读取）。
- 应用会自动把文档切块（分片），并（内置 embedding 模型可用时）向量化 → 支持语义检索（换说法也能命中）；无向量时自动降级关键词检索。
- 库内可用「关系图谱」查看 库→文档→分片 的网状结构，点分片看全文；也可切「分片列表」。
- 知识查询：让 AI 调「知识库检索」工具（api_kb_search），不指定库时跨所有可见库做多跳检索，返回关联片段。
- 对话时，应用会把与问题相关的知识片段自动注入提示词，帮助回答「这个功能怎么用」。
- 内置「应用使用说明」就是一个公开知识库，本页内容即来自它。`,
  },
  {
    name: '记忆系统',
    content: `## 记忆系统
- 应用自动沉淀三层记忆：
  - 每日记忆：按自然天聚合当天的重要进展/事项，第二天自动注入保持连续性。
  - 会话记忆：当前会话专属的上下文结论，不串到其它会话。
  - 智能体记忆：跨会话的长期用户偏好/背景。
- 对话进行中（到一定轮数）自动用「记忆抽取模型」抽取并落库；下次对话前自动检索注入。
- 记忆抽取模型可在「设置」里切换（默认本机 Ollama 小模型）。`,
  },
  {
    name: '内置浏览器与 Chromium',
    content: `## 内置浏览器与 Chromium
- 桌面端预览面板打开网页 → 用 Electron 自带的浏览器（BrowserView），无需额外下载 Chromium。
- 智能体（对话里）让浏览器「打开网页」（browser_navigate）时，会在你屏幕上的预览面板同步打开并显示，和手动打开的共用同一个浏览器。
- 服务端另有无头浏览器（Playwright）用于网页自动化抓取等；那份 Chromium 需单独安装（npx playwright install chromium），与桌面内置浏览器是两套、互不影响。
- 联网查询统一由子智能体 pageAgent（真实浏览器搜索引擎）完成。`,
  },
  {
    name: '多智能体与子智能体',
    content: `## 多智能体与子智能体
- 可创建 / 选择不同人格与能力的智能体（Agent），每个可配置独立的 systemPrompt 和行为。
- 智能体能调用内置工具（命令执行、读写文件、打开网页、知识库检索等）。
- 智能体之间可委派：主智能体可调「子智能体」（call_agent）并行完成子任务。
- 「智能体画布」支持可视化编排节点工作流（拖拽连线）。`,
  },
  {
    name: '定时任务',
    content: `## 定时任务
- 在「定时任务」页可创建周期性自动任务：到时间后，应用用指定的智能体/模型自动就某个 prompt 发起一次对话，结果落在绑定的会话里。
- 调度方式二选一：间隔（每 N 分钟，intervalMinutes）或 Cron（5 字段分钟粒度，如 "30 9 * * *" 表示每天 09:30，cronExpr）。
- 每个任务可绑定：对话（conversationId）、智能体（agentId）、模型平台与模型（platformId/modelId）、空间（spaceId）；不绑定则用默认。
- 典型用法：配合「浏览器自动化」做每日签到/领积分、每日资讯汇总、定时抓取——创建后按时自动跑，无需人工干预。
- 任务可随时启用/停用、编辑、删除；列表显示下次执行时间。`,
  },
  {
    name: 'MCP 工具服务',
    content: `## MCP 工具服务
- 在「MCP」页可添加 / 配置 MCP 服务（stdio / sse / http），连接外部工具服务提供者。
- 可单独启用/停用某服务的工具、给工具设置别名、查看工具列表。
- 内置还提供管理类工具（get_api_tools / list_platforms 等）供 AI 调用。
- 编辑 MCP 服务的连接信息（名称/命令/URL/鉴权等）后保存即生效。`,
  },
  {
    name: '设置',
    content: `## 设置
- 「设置」页可配置：
  - 外观：主题 / 深色模式。
  - 默认平台与默认模型。
  - 记忆抽取模型（平台 + 模型，留空则默认本地小模型）。
  - 上下文保留条数 / 最大上下文 tokens / 是否启用上下文压缩。
  - 工作目录。
- 设置持久化保存，重启后保留。`,
  },
  {
    name: '常见问题排查',
    content: `## 常见问题排查
- AI 要执行命令、读写文件、打开网页：这是它正常的工具调用能力，不是异常。
- AI 答非所问：检查知识库里是否已放入相关内容，或工作目录是否设置正确。
- 浏览器打不开网页：桌面端确认用的是内置浏览器（无需下载）；若走服务端抓取/搜索，需已安装 Playwright Chromium。
- 命令执行失败：先确认「工作目录」是否正确。
- 模型不可用：检查「设置 → 模型平台」是否配置了可用平台；离线时用本机 Ollama 本地模型（需先安装运行 Ollama 并拉取模型）。
- 知识库检索不到：确认库是公开还是私有、以及提问措辞（语义检索比关键词更宽松）。`,
  },
];

/** 拼接所有功能文档，供「命中怎么用/如何使用时整段注入进 system prompt」使用。 */
export const DEFAULT_APP_GUIDE = APP_GUIDE_DOCS.map((d) => d.content).join('\n\n---\n\n');

const DEFAULT_SETTINGS: AppSettings = {
  palette: 'cinnabar',
  skin: '',
  darkMode: true,
  defaultPlatformId: '',
  defaultModelId: '',
  keepRecent: 6,
  maxContextTokens: 8000,
  enableCompression: true,
  workspaceDir: '',
  recentWorkspaceDirs: [],
  appGuide: DEFAULT_APP_GUIDE,
  memoryExtractPlatformId: '',
  memoryExtractModelId: '',
  layout: 'default',
};

interface ThemePalette {
  /** palette=纯调色板（默认）；skin=带壁纸皮肤 */
  kind?: 'palette' | 'skin';
  category?: string;
  preview?: string;
  wallpaper?: {
    light: string;
    dark?: string;
    mask?: number;
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
  surface?: {
    glass?: string;
    glassDark?: string;
    glassAlpha?: number;
    glassAlphaDark?: number;
    border?: string;
    borderDark?: string;
    radius?: number;
    buttonRadius?: number;
    buttonText?: string;
    glassBlur?: number;
    overlayColor?: string;
    overlayBlur?: number;
    borderPattern?: string;
    borderPatternSlice?: number;
    titlebarPattern?: string;
    shadow?: string;
    catTagPattern?: string;
    taskListPattern?: string;
    inputPattern?: string;
    buttonPattern?: string;
    dialogPattern?: string;
    menuPattern?: string;
    codePattern?: string;
    browserPattern?: string;
    inputBorder?: string;
  };
}

/** 插件包内资源 → /api/plugin-assets/:pluginId/<path> 静态地址（API_BASE 已含 /api 前缀） */
function pluginAssetUrl(pluginId: string, rel: string): string {
  const clean = rel.replace(/^\.?\//, '');
  return `${API_BASE}/plugin-assets/${pluginId}/${clean}`;
}

const THEMES: Record<ThemeName, ThemePalette> = {
  cinnabar: {
    primary: '#C2410C',
    primaryLight: '#FBEBDD',
    primaryDark: '#7C2D12',
    accent: '#B45309',
    gradient: 'linear-gradient(135deg, #C2410C, #B45309)',
    orb1: '#C2410C',
    orb2: '#D97706',
    orb3: '#B45309',
  },
  ink: {
    primary: '#57534E',
    primaryLight: '#EDEAE5',
    primaryDark: '#292524',
    accent: '#78716C',
    gradient: 'linear-gradient(135deg, #57534E, #292524)',
    orb1: '#57534E',
    orb2: '#78716C',
    orb3: '#44403C',
  },
  indigo: {
    primary: '#2C4A6E',
    primaryLight: '#E2E9F0',
    primaryDark: '#1B3150',
    accent: '#3B82A8',
    gradient: 'linear-gradient(135deg, #2C4A6E, #3B82A8)',
    orb1: '#2C4A6E',
    orb2: '#3B82A8',
    orb3: '#5B8CB8',
  },
  pine: {
    primary: '#2F6B4F',
    primaryLight: '#E1EDE6',
    primaryDark: '#1D4A36',
    accent: '#4A8571',
    gradient: 'linear-gradient(135deg, #2F6B4F, #4A8571)',
    orb1: '#2F6B4F',
    orb2: '#4A8571',
    orb3: '#5FA184',
  },
  clay: {
    primary: '#B05A45',
    primaryLight: '#F3E2DC',
    primaryDark: '#7E3B2A',
    accent: '#C07A5C',
    gradient: 'linear-gradient(135deg, #B05A45, #C07A5C)',
    orb1: '#B05A45',
    orb2: '#C07A5C',
    orb3: '#C98A72',
  },
};

const STORAGE_KEY = 'settings:app';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);

  async function load() {
    const adapter = getPlatformAdapter();
    const raw = await adapter.keyring.get(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // 迁移旧 `theme` 字段 → `palette` + `skin`（正交拆分前 theme 同时承载两者）
        if (parsed.theme !== undefined && parsed.palette === undefined && parsed.skin === undefined) {
          if ((BUILTIN_THEME_NAMES as readonly string[]).includes(parsed.theme)) {
            parsed.palette = parsed.theme;
            parsed.skin = '';
          } else {
            parsed.skin = parsed.theme;
            parsed.palette = 'cinnabar';
          }
          delete parsed.theme;
        }
        settings.value = { ...DEFAULT_SETTINGS, ...parsed };
      } catch {}
    }
    loaded.value = true;
    applyPalette(settings.value.palette);
    applySkin(settings.value.skin);
    applyDarkMode(settings.value.darkMode);
  }

  async function save() {
    const adapter = getPlatformAdapter();
    await adapter.keyring.set(STORAGE_KEY, JSON.stringify(settings.value));
  }

  async function update(patch: Partial<AppSettings>) {
    // 选皮肤时自动切到皮肤自带配色，保证色板与系列图案一致。
    // 缺陷修复：此前只有内置系列同步 palette，插件皮肤（27 套）自带的 primary/accent/gradient 全是死数据
    // → 选了图片皮肤界面主色不变，暗色下所有皮肤看起来都是同一片灰。
    if (patch.skin !== undefined) {
      // 显式传了 palette 时不覆盖（保留"手动选主题色覆盖皮肤配色"的能力）
      if (patch.palette === undefined) {
        const pal = isBuiltinSkinId(patch.skin)
          ? builtinSeriesPalette(patch.skin)
          : (patch.skin || '');
        if (pal) patch = { ...patch, palette: pal };
        // 取消皮肤时，若当前 palette 仍指向某套皮肤自带的配色则回落默认主题色
        else if (isSkinThemeId(settings.value.palette)) patch = { ...patch, palette: 'cinnabar' };
      }
    }
    settings.value = { ...settings.value, ...patch };
    if (patch.palette !== undefined) applyPalette(patch.palette);
    if (patch.skin !== undefined) applySkin(patch.skin);
    if (patch.darkMode !== undefined) {
      applyDarkMode(patch.darkMode);
      // 深浅切换后需重应用 palette（EP 色族按模式重算）和 skin（壁纸分深浅色）
      applyPalette(settings.value.palette);
      applySkin(settings.value.skin);
    }
    await save();
  }

  /** 当前 palette 的实心按钮主色（applySkin 计算 --skin-btn-text 时需要） */
  let currentBtnPrimary = '#C2410C';

  /** 当前皮肤自带的主色（配色派生链的输入，见 deriveSkinTokens） */
  let currentSkinPrimary = '#C2410C';

  /**
   * palette id 是否指向某套皮肤自带的配色（插件 kind='skin' 主题）。
   * 取消皮肤时用于判断是否需要回落默认主题色，避免残留上一套皮肤的主色。
   */
  function isSkinThemeId(id: string): boolean {
    if (!id || isBuiltinSkinId(id)) return false;
    try {
      return usePluginStore().themes.some((t) => t.id === id && t.kind === 'skin');
    } catch {
      return false;
    }
  }

  /** 应用主题色（palette）：设置主色/强调色/渐变/球色 + EP 主色族 */
  function applyPalette(palette: ThemeName) {
    let p: ThemePalette | undefined = THEMES[palette as keyof typeof THEMES];
    if (!p) {
      try {
        // 皮肤 id 本身也是合法 palette（选皮肤时已同步），此处不再排除 kind='skin'
        const found = usePluginStore().themes.find((t) => t.id === palette);
        if (found) {
          p = found as unknown as ThemePalette;
        }
      } catch {
        /* plugin store 未就绪 */
      }
    }
    if (!p) return;
    const root = document.documentElement.style;
    const dark = settings.value.darkMode;
    const bg = dark ? '#141414' : '#ffffff';

    // ===== 主色：按对比度选可读变体 =====
    const btnPrimary = contrastRatio(p.primary, '#ffffff') >= 4.5 ? p.primary : (p.primaryDark || p.primary);
    currentBtnPrimary = btnPrimary;
    const textPrimary = dark
      ? (contrastRatio(p.primary, bg) >= 4.5 ? p.primary : mixHex(p.primary, '#ffffff', 0.35))
      : btnPrimary;
    root.setProperty('--color-primary', textPrimary);
    root.setProperty('--color-primary-light', p.primaryLight);
    root.setProperty('--color-primary-dark', p.primaryDark);
    root.setProperty('--color-accent', p.accent);
    root.setProperty('--gradient-primary', p.gradient);
    root.setProperty('--orb-1-color', p.orb1);
    root.setProperty('--orb-2-color', p.orb2);
    root.setProperty('--orb-3-color', p.orb3);
    root.setProperty('--el-color-primary', btnPrimary);
    root.setProperty('--el-color-primary-light-3', mixHex(btnPrimary, bg, 0.3));
    root.setProperty('--el-color-primary-light-5', mixHex(btnPrimary, bg, 0.5));
    root.setProperty('--el-color-primary-light-7', mixHex(btnPrimary, bg, 0.7));
    root.setProperty('--el-color-primary-light-8', mixHex(btnPrimary, bg, 0.8));
    root.setProperty('--el-color-primary-light-9', mixHex(btnPrimary, bg, 0.9));
    root.setProperty('--el-color-primary-dark-2', mixHex(btnPrimary, '#000000', 0.2));
  }

  /** 应用皮肤（skin）：设置壁纸/表面定制/玻璃化开关；skin 为空则清除皮肤模式 */
  function applySkin(skin: ThemeName) {
    const root = document.documentElement.style;
    const el = document.documentElement;
    const dark = settings.value.darkMode;

    if (!skin) {
      el.removeAttribute('data-skin');
      for (const v of SKIN_CSS_VARS) root.removeProperty(v);
      return;
    }

    // ===== 内置系列皮肤：不依赖插件，定义见 styles/skinSeries.ts =====
    if (isBuiltinSkinId(skin)) {
      const series = builtinSeriesFor(skin);
      if (series) {
        const wp = series.wallpaper;
        // 内置系列自带同色主题色，取它作为配色派生输入
        currentSkinPrimary = THEMES[series.palette as keyof typeof THEMES]?.primary ?? currentBtnPrimary;
        root.setProperty('--app-wallpaper', `url("${dark ? wp.dark : wp.light}")`);
        root.setProperty('--skin-mask', String(wp.mask));
        root.setProperty('--skin-blur', `${wp.blur}px`);
        el.setAttribute('data-skin', 'on');
        applySurface(series.surface as unknown as SkinSurface, null);
        return;
      }
      // 系列定义缺失（理论上不会发生）→ 回落无皮肤
      el.removeAttribute('data-skin');
      for (const v of SKIN_CSS_VARS) root.removeProperty(v);
      return;
    }

    // ===== 插件贡献的皮肤 =====
    let p: ThemePalette | undefined;
    let pluginId = '';
    try {
      const found = usePluginStore().themes.find((t) => t.id === skin && t.kind === 'skin');
      if (found) {
        pluginId = found.pluginId;
        p = found as unknown as ThemePalette;
      }
    } catch {
      /* plugin store 未就绪 */
    }
    if (!p || !p.wallpaper || !pluginId) {
      el.removeAttribute('data-skin');
      for (const v of SKIN_CSS_VARS) root.removeProperty(v);
      return;
    }

    // P0-4：壁纸遮罩/模糊默认下调（原 0.45 / 12px），保证壁纸细节可辨；
    // 文字可读性改由 surfaceSunken / surfaceRaised 的不透明度分级保证，而不是把壁纸糊掉
    const file = dark ? (p.wallpaper.dark || p.wallpaper.light) : p.wallpaper.light;
    currentSkinPrimary = p.primary || currentBtnPrimary;
    root.setProperty('--app-wallpaper', `url("${pluginAssetUrl(pluginId, file)}")`);
    root.setProperty('--skin-mask', String(p.wallpaper.mask ?? 0.26));
    // 2026-09-13 用户反馈「图片皮肤都看不清」—— 壁纸遮罩 backdrop-filter blur 是元凶之一
    // （与玻璃面板 blur 叠加把壁纸糊掉）。默认 5→0，只保留 0.26 mask 的暗色叠加，
    // 不再模糊壁纸本身；如需保留磨砂效果可在 surface.wallpaperBlur 指定（>0）。
    root.setProperty('--skin-blur', `${p.wallpaper.blur ?? 0}px`);
    el.setAttribute('data-skin', 'on');
    applySurface((p as { surface?: SkinSurface }).surface ?? {}, pluginId);
  }

  /** 皮肤模式涉及的全部 CSS 变量（清除皮肤时统一移除） */
  const SKIN_CSS_VARS = [
    '--app-wallpaper', '--skin-mask', '--skin-blur',
    '--skin-overlay-tint', '--skin-overlay-tint-light',
    '--skin-glass-tint', '--skin-glass-alpha', '--skin-glass-alpha-hover',
    '--skin-glass-border', '--skin-radius', '--skin-btn-radius', '--skin-btn-text',
    '--skin-glass-blur', '--skin-overlay-color', '--skin-overlay-blur',
    '--skin-border-pattern', '--skin-border-pattern-slice', '--skin-titlebar-pattern',
    '--skin-shadow', '--skin-btn-gradient', '--skin-input-radius', '--skin-card-radius',
    '--skin-tag-radius', '--skin-scrollbar-thumb', '--skin-divider-color',
    '--skin-cat-tag-pattern', '--skin-task-list-pattern', '--skin-input-pattern',
    '--skin-btn-pattern', '--skin-dialog-pattern',
    '--skin-menu-pattern', '--skin-code-pattern', '--skin-browser-pattern',
    '--skin-input-border',
    // ===== 配色兜底链（P0-2 新增）：文本 / 容器三级 / 控件层 =====
    '--skin-text', '--skin-text-secondary', '--skin-text-tertiary', '--skin-on-primary',
    '--skin-surface', '--skin-surface-raised', '--skin-surface-sunken',
    '--skin-surface-hover', '--skin-surface-active',
    '--skin-input-bg', '--skin-input-text', '--skin-input-placeholder',
    '--skin-list-bg', '--skin-list-hover', '--skin-list-active', '--skin-list-divider',
    '--skin-dropdown-bg', '--skin-dropdown-hover', '--skin-dropdown-active', '--skin-dropdown-border',
    '--skin-dialog-bg', '--skin-dialog-border', '--skin-dialog-title-bg',
    '--skin-btn-bg-color', '--skin-btn-bg-hover',
    // ===== 部件图贴合方式（P0-2） =====
    '--skin-pattern-size', '--skin-pattern-repeat',
  ];

  /**
   * 下发表面定制（内置系列与插件皮肤共用）：
   * 玻璃底色/透明度/边框/圆角/图案纹理/滚动条等。
   * 图案值的两种来源必须区分对待（历史坑，见下 asset()）：
   *   · 插件皮肤 surface 里填的是**包内文件名**（如 'dialog-bg.webp'）→ 需包装成 url(资源地址)
   *   · 内置系列 surface 里填的是**完整 CSS 值**（data URI / linear-gradient / repeating-linear-gradient）
   *     → 原样使用，绝不能再包一层 url()
   */
  function applySurface(sf: SkinSurface, pluginId: string | null) {
    const root = document.documentElement.style;
    const dark = settings.value.darkMode;
    /**
     * 图案值 → 可直接写进 background-image 的 CSS 值。
     * 判据：只有「看起来像包内相对路径的文件名」才包装 url()。
     * 历史坑（本轮复修）：原实现只按 pluginId 分支，插件皮肤填的**文件名**被包装成
     *   url("/api/plugin-assets/<id>/dialog-bg.webp")  —— 但那是服务器 URL，不是 CSS 值；
     *   前端再包一层 url() 后得到 `url("url("...")")`，引号提前闭合 → 整条 background-image 失效，
     *   导致菜单/代码模式/浏览器外壳/列表/输入框/按钮/弹窗的真图背景**全部不显示**。
     *   更早一版是在皮肤定义里写完整 CSS 值，引出的正是同一条注释警告的 bug；两版都没堵住根因：
     *   根因是「分辨不清文件名 vs CSS 值」，而不是「值写在哪一侧」。
     * 现在：文件名 → url(资源地址)；其余（data: / url( / 含 '(' 的函数式值 / 含空白的多值）→ 原样透传。
     */
    const asset = (v: string) => {
      if (!pluginId) return v;
      const s = v.trim();
      const looksLikeFile =
        !/^(data:|https?:|url\()/i.test(s) &&
        !s.includes('(') &&
        !/\s/.test(s);
      return looksLikeFile ? `url("${pluginAssetUrl(pluginId, s)}")` : s;
    };

    // ===== 配色兜底链：皮肤显式值 → 由 primary 自动派生 → 主题基线 =====
    // 关键改动（P0-2）：所有兜底不再用硬编码中性灰，改从皮肤主色派生，
    // 27 套皮肤即使一个字段都不填，暗色下也各有各的色相，不再千篇一律的灰。
    const dv = deriveSkinTokens(currentSkinPrimary, dark);

    const tint = dark
      ? (sf.glassDark ?? sf.surfaceColor ?? dv.surface)
      : (sf.glass ?? sf.surfaceColor ?? dv.surface);
    // 暗色下大面板不透明度从 0.70 降到 0.50，让壁纸透出来（2026-09-13 用户反馈
    // 「预览背景皮肤也没有 / 最主要的背景图片都没了」：原本 0.82+blur18 几乎把右侧
    // 预览面板糊成纯深色块，看不到壁纸）；
    // 输入框/弹窗等需要可读性的面走 surfaceSunken / surfaceRaised 的实心派生色，不受此值影响
    const alpha = dark ? (sf.glassAlphaDark ?? 0.5) : (sf.glassAlpha ?? 0.78);
    const border = dark ? (sf.borderDark ?? sf.border) : sf.border;
    root.setProperty('--skin-glass-tint', tint);
    root.setProperty('--skin-glass-alpha', String(alpha));
    root.setProperty('--skin-glass-alpha-hover', String(Math.min(alpha + 0.07, 1)));
    if (border) root.setProperty('--skin-glass-border', border);
    else root.removeProperty('--skin-glass-border');

    // ===== 文本层：皮肤模式下 --color-text* 由皮肤配色接管 =====
    root.setProperty('--skin-text', sf.text ?? dv.text);
    root.setProperty('--skin-text-secondary', sf.textSecondary ?? dv.textSecondary);
    root.setProperty('--skin-text-tertiary', sf.textTertiary ?? dv.textTertiary);
    root.setProperty('--skin-on-primary', sf.onPrimary ?? dv.onPrimary);

    // ===== 容器三级 + 控件层 =====
    root.setProperty('--skin-surface', sf.surfaceColor ?? dv.surface);
    root.setProperty('--skin-surface-raised', sf.surfaceRaisedColor ?? dv.surfaceRaised);
    root.setProperty('--skin-surface-sunken', sf.surfaceSunkenColor ?? dv.surfaceSunken);
    root.setProperty('--skin-surface-hover', sf.surfaceHoverColor ?? dv.surfaceHover);
    root.setProperty('--skin-surface-active', sf.surfaceActiveColor ?? dv.surfaceActive);
    root.setProperty('--skin-input-bg', sf.inputBg ?? dv.inputBg);
    root.setProperty('--skin-input-border', sf.inputBorder ?? dv.inputBorder);
    root.setProperty('--skin-input-text', dv.inputText);
    root.setProperty('--skin-input-placeholder', dv.inputPlaceholder);
    root.setProperty('--skin-list-bg', sf.listBg ?? dv.listBg);
    root.setProperty('--skin-list-hover', dv.listItemHover);
    root.setProperty('--skin-list-active', dv.listItemActive);
    root.setProperty('--skin-list-divider', dv.listDivider);
    root.setProperty('--skin-dropdown-bg', sf.dropdownBg ?? dv.dropdownBg);
    root.setProperty('--skin-dropdown-hover', dv.dropdownItemHover);
    root.setProperty('--skin-dropdown-active', dv.dropdownItemActive);
    root.setProperty('--skin-dropdown-border', dv.dropdownBorder);
    root.setProperty('--skin-dialog-bg', sf.dialogBgColor ?? dv.dialogBg);
    root.setProperty('--skin-dialog-border', dv.dialogBorder);
    root.setProperty('--skin-dialog-title-bg', dv.dialogTitleBg);
    root.setProperty('--skin-btn-bg-color', dv.buttonBg);
    root.setProperty('--skin-btn-bg-hover', dv.buttonBgHover);
    root.setProperty('--skin-radius', `${sf.radius ?? 12}px`);
    root.setProperty('--skin-btn-radius', `${sf.buttonRadius ?? 6}px`);
    const autoBtnText = contrastRatio(currentBtnPrimary, '#ffffff') >= 4.5 ? '#ffffff' : (dark ? '#F2F0EA' : '#141414');
    root.setProperty('--skin-btn-text', sf.buttonText ?? sf.onPrimary ?? autoBtnText);
    // 2026-09-13 用户反馈「图片皮肤都看不清」—— 玻璃面板 backdrop-filter blur 是元凶之二
    // （与壁纸遮罩 blur 叠加把壁纸+纹理都糊掉）。默认 8→0，玻璃只剩半透明底色+饱和度，
    // 不再模糊壁纸/纹理；如需保留磨砂效果可在 surface.glassBlur 指定（>0）。
    root.setProperty('--skin-glass-blur', `${sf.glassBlur ?? 0}px`);
    // ===== 壁纸遮罩色（2026-09-13 修「灰蒙蒙」）=====
    // 原实现遮罩色写死在 CSS 里（#0f172a 深蓝灰），任何皮肤都被同一层冷灰纱糊掉，
    // 暖色/霓虹系壁纸全部洗成灰蓝。这里下发「带皮肤色相」的遮罩色：
    //   暗色 → 皮肤 surface 往黑里压一点（保留主色相的深色纱）
    //   浅色 → 皮肤 surface 往白里提（暖白纱）
    // CSS 侧 var() 回落保证未下发时不崩。
    const overlayTintDark = mixHex(dv.surface, '#000000', 0.25);
    const overlayTintLight = mixHex(dv.surface, '#FFFFFF', 0.55);
    root.setProperty('--skin-overlay-tint', sf.wallpaperOverlayTintDark ?? overlayTintDark);
    root.setProperty('--skin-overlay-tint-light', sf.wallpaperOverlayTint ?? overlayTintLight);

    // 弹窗遮罩：未配置时改用派生色（带皮肤色相的半透明），不再 transparent
    root.setProperty('--skin-overlay-color', sf.overlayColor || sf.overlayTint || dv.overlayTint);
    root.setProperty('--skin-overlay-blur', `${sf.overlayBlur ?? 4}px`);
    if (sf.borderPattern) {
      root.setProperty('--skin-border-pattern', asset(sf.borderPattern));
      root.setProperty('--skin-border-pattern-slice', String(sf.borderPatternSlice ?? 0));
    } else {
      root.removeProperty('--skin-border-pattern');
      root.removeProperty('--skin-border-pattern-slice');
    }
    // ===== 部位图案统一下发（暗色叠纱罩） =====
    // 【2026-09-13 二修「灰蒙蒙」，这是真正的元凶】
    // 铺垫：皮肤包里的部件图（task-list-bg / input-bg / button-bg / dialog-bg）
    // 都是**为浅色主题生成的浅色图**——实测 27 套皮肤的这批图平均亮度在 230~248
    // （接近纯白，例如 skin-cyber-neon/task-list-bg.webp≈rgb(221,223,224)）。
    // 而暗色主题下它们被原样铺到侧栏/输入框/按钮上，于是：
    //   浅色图(亮度240) × (1-0.35) + 深纱(亮度10) × 0.35 ≈ 亮度 160 → 一片灰白；
    //   叠加亮白文字 rgb(239,250,254) 后对比度只有 2.43:1 → 白底白字，即用户看到的「灰蒙蒙」。
    //   这也是为什么改 --glass-bg / --el-* 变量都不起作用：背景是**图片**，不是底色。
    // 修复：暗色下把纱罩强度提到 0.78 —— 白图被压到亮度≈56（深色底），
    //   对比度≈10.8:1，图仍保留 22% 的纹理起伏，不再糊成一片，也保住了皮肤的图案感。
    //   浅色主题不需要纱罩（浅图本来就配浅底），维持空串。
    //   skin 可经 surface.patternScrim 覆盖；真要保留更亮的图，把它调到 0.6~0.7。
    const scrimBase = mixHex('#0A0A0C', currentSkinPrimary, 0.12);
    const scrimA = hexToRgba(scrimBase, sf.patternScrim ?? 0.78);
    const scrim = dark ? `linear-gradient(${scrimA}, ${scrimA})` : '';
    // 部件图贴合方式：小图（按钮/输入框/列表底图）必须平铺 tile，而非 cover 拉伸铺满。
    // 历史默认 cover 会把 480x270 之类的小纹理拉伸到整个侧栏/弹窗宽度（300~600px），
    // 强行放大 1.5~2 倍造成肉眼可见的糊化、细节丢失。
    // 改为默认 repeat（自然尺寸平铺）；皮肤可经 surface.patternFit 指定 cover / contain / repeat-x。
    const fit = sf.patternFit ?? 'repeat';
    root.setProperty('--skin-pattern-size', fit === 'cover' || fit === 'contain' ? fit : 'auto');
    root.setProperty('--skin-pattern-repeat', fit === 'cover' || fit === 'contain' ? 'no-repeat' : fit);
    const themedPattern = (light?: string, darkVariant?: string) => {
      const base = dark ? (darkVariant ?? light) : light;
      if (!base) return undefined;
      const img = asset(base);
      return scrim ? `${scrim}, ${img}` : img;
    };
    const setPattern = (name: string, value?: string) => {
      if (value) root.setProperty(name, value);
      else root.removeProperty(name);
    };
    setPattern('--skin-titlebar-pattern', themedPattern(sf.titlebarPattern));
    if (sf.shadow) root.setProperty('--skin-shadow', sf.shadow);
    else root.removeProperty('--skin-shadow');
    if (sf.buttonGradient) root.setProperty('--skin-btn-gradient', sf.buttonGradient);
    else root.removeProperty('--skin-btn-gradient');
    root.setProperty('--skin-input-radius', `${sf.inputRadius ?? sf.buttonRadius ?? 6}px`);
    root.setProperty('--skin-card-radius', `${sf.cardRadius ?? sf.radius ?? 12}px`);
    root.setProperty('--skin-tag-radius', `${sf.tagRadius ?? sf.buttonRadius ?? 6}px`);
    if (sf.scrollbarThumb) root.setProperty('--skin-scrollbar-thumb', sf.scrollbarThumb);
    else root.removeProperty('--skin-scrollbar-thumb');
    if (sf.dividerColor) root.setProperty('--skin-divider-color', sf.dividerColor);
    else root.removeProperty('--skin-divider-color');
    setPattern('--skin-cat-tag-pattern', themedPattern(sf.catTagPattern));
    setPattern('--skin-task-list-pattern', themedPattern(sf.taskListPattern));
    setPattern('--skin-input-pattern', themedPattern(sf.inputPattern));
    setPattern('--skin-btn-pattern', themedPattern(sf.buttonPattern));
    setPattern('--skin-dialog-pattern', themedPattern(sf.dialogPattern));
    // ===== 菜单 / 代码模式 / 浏览器外壳底图 =====
    setPattern('--skin-menu-pattern', themedPattern(sf.menuPattern, sf.menuPatternDark));
    setPattern('--skin-code-pattern', themedPattern(sf.codePattern));
    setPattern('--skin-browser-pattern', themedPattern(sf.browserPattern, sf.browserPatternDark));
    // 输入框边框色（EP 输入框 + 自定义输入容器共用）—— 已在上方配色兜底块与派生色一并下发，此处不再重复
  }

  function applyDarkMode(dark: boolean) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  return { settings, loaded, load, save, update, applyPalette, applySkin, applyDarkMode, THEMES };
});

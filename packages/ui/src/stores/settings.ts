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
  /** 弹窗表面（底图）磨砂半径 px，默认 8 */
  dialogBlur?: number;
  borderPattern?: string;
  borderPatternSlice?: number;
  titlebarPattern?: string;
  shadow?: string;
  buttonGradient?: string;
  inputRadius?: number;
  cardRadius?: number;
  tagRadius?: number;
  scrollbarThumb?: string;
  /**
   * 滚动条「棍身」贴图（**竖版**，CSS background-image 完整值）。
   * 缺省 = skin.css 内置**金箍棒材质剖面**（无缝循环：[金箍带 6px][乌铁段 18px]，沿轴平铺）。
   * ⚠️ 竖版 / 横版**必须分素材**（6 个字段一一对应）：
   *   竖版 body 沿 Y 平铺（沿 X 做金属渐变）；横版 body 沿 X 平铺（沿 Y 做金属渐变）。
   *   拿竖版去 repeat-x 会在接缝处留黑缝 → 横条碎成「一串小方块」（已踩坑）。
   */
  scrollbarVBody?: string;
  /** 竖条起点端头（金箍收口，6px） */
  scrollbarVCap?: string;
  /** 竖条终点端头（镜像，6px） */
  scrollbarVCapFlip?: string;
  /** 棍身贴图（**横版**，沿 X 无缝平铺） */
  scrollbarHBody?: string;
  /** 横条左侧端头（6px） */
  scrollbarHCap?: string;
  /** 横条右侧端头（6px） */
  scrollbarHCapFlip?: string;
  dividerColor?: string;
  catTagPattern?: string;
  taskListPattern?: string;
  inputPattern?: string;
  buttonPattern?: string;
  dialogPattern?: string;
  /**
   * 卡片变体底图（多张，按序号对应 --skin-card-N-pattern）。
   * 同一类卡片需要"多套样式 + 随机分配"时配置（会话行/空间条目/任务行/玻璃卡片）。
   * CSS 侧按 nth-child 循环取图 —— 稳定可复现，观感即"随机"。
   */
  cardPatterns?: string[];
  /** 卡片变体底图暗色变体（暗色主题优先；缺省按 <name>-dark.webp 命名约定推导） */
  cardPatternsDark?: string[];
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
  /** 暗色下部件图压暗强度 0~1（默认 0.80；越大越暗越保文字对比，越小图案越清晰） */
  patternScrim?: number;
  /**
   * 部件图整体不透明度 0~1（默认 0.9）。
   * 与 patternScrim 分工：scrim 决定"压多暗"（保文字对比），本项决定"露多少"（保图案感）。
   * 想更清晰地看到纹理 → 调小本项（如 0.55），此时纱罩比例等效加深，文字对比不丢。
   */
  patternOpacity?: number;
  /**
   * 部件图是否为**深色图**（默认 false = 浅色图）。
   * 决定面板上文字取深色还是浅色 —— 文字色必须与实际"图片底色"相反才可读。
   * 内置皮肤包的 task-list-bg/input-bg 都是浅色图（亮度 ~226），故默认 false；
   * 皮肤若自带深色系部件图，必须置 true，否则会被判成"浅底"而配深色文字 → 深底深字。
   */
  patternIsDark?: boolean;
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
  /** 深色下三栏面板（左会话栏 / 中对话列 / 右预览栏）的玻璃不透明度，0~1，缺省 0.42 */
  panelAlphaDark?: number;
  /** 深色下输入条 / 工具条等"小面板"的玻璃不透明度，0~1，缺省 0.30 */
  panelAlphaSmallDark?: number;
  /** 浅色下三栏面板的玻璃不透明度，缺省 0.72（比大面玻璃更轻，避免整屏发闷） */
  panelAlphaLight?: number;
  /** 浅色下小面板的玻璃不透明度，缺省 0.62 */
  panelAlphaSmallLight?: number;
};

/**
 * ===== 皮肤自定义属性注册表（skin.css 是**唯一的默认值真相源**）=====
 * 历史坑（2026-09-13 第三轮，"一直灰蒙蒙"的最后一层根因）：
 * skin.css 里是这么写的 ——
 *     --glass-bg: color-mix(in srgb, var(--skin-glass-tint, #f5f1ea) calc(var(--skin-glass-alpha, 0.97) * 100%), transparent);
 * 内层 var() 的**回落值写死 0.97**，它只在 `--skin-glass-alpha` **完全未定义**时才生效。
 * 而 applySkin 每次都会把它设成 0.42~0.62 —— 于是 skin.css 里那串 0.97 / 0.62 / 0.30
 * 永远只是"看起来像默认值"的死注释，真实不透明度**永远由 JS 决定**。
 * 后果：想通过改 CSS 把面板调透，怎么改都没反应；用户只能在 JS 里改，改了又忘，
 * 三栏与输入条就长期停在 0.62/0.5 → 半透白/半透黑糊在壁纸上 = 观感"灰蒙蒙"。
 *
 * 现方案：三个部分的不透明度各占一个变量，CSS 里的回落值就是**真实默认值**，
 * JS 只在「皮肤显式配置」或「需要按深浅模式换算」时下发覆盖：
 *   · --skin-glass-alpha           通用玻璃（弹窗/抽屉/卡片等标准表面）
 *   · --skin-glass-alpha-panel     三栏面板（左栏 / 中列 / 右栏）
 *   · --skin-glass-alpha-panel-sm  小面板（输入条 / 工具条）
 * 配色/圆角等元素级变量同理：只下发皮肤真的配了的那些，不再做"全量兜底 echo"。
 *
 * 之所以需要这张注册表：SSR/HMR/皮肤切换会重复 applySkin，若不主动清理，
 * 上一套皮肤下发的旧值会残留到下一套（表现为"换了皮肤观感没变"）。
 * ① 每次 applySurface 开头清掉本表（旧值不残留）；
 * ② 清掉后 --glass-bg 等派生 token 回归 CSS 默认值（不会悬空引用）；
 * ③ clearSkin（关闭皮肤）也清这张表。
 */
const SKIN_ELEMENT_VARS = [
  '--skin-glass-alpha', '--skin-glass-alpha-hover',
  '--skin-glass-alpha-panel', '--skin-glass-alpha-panel-sm',
  '--skin-glass-blur', '--skin-glass-border', '--skin-btn-text',
  '--skin-radius', '--skin-btn-radius', '--skin-input-radius',
  '--skin-card-radius', '--skin-tag-radius',
  '--skin-scrollbar-thumb', '--skin-scrollbar-thumb-pattern',
  '--skin-scrollbar-thumb-color', '--skin-scrollbar-thumb-size',
  '--skin-scrollbar-thumb-repeat', '--skin-scrollbar-thumb-pos',
  // 金箍棒材质剖面（2026-09-13 第四版）：6 个素材变量 + 3+3 个层配置变量。
  // ⚠️ 素材与层配置必须一起清理 —— 只清一半会让下一套皮肤继承上一套的
  //    size/repeat（层数不匹配时整条 background 被浏览器丢弃）。
  '--skin-scrollbar-v-body', '--skin-scrollbar-v-cap', '--skin-scrollbar-v-capflip',
  '--skin-scrollbar-v-pattern', '--skin-scrollbar-v-size',
  '--skin-scrollbar-v-repeat', '--skin-scrollbar-v-pos',
  '--skin-scrollbar-h-body', '--skin-scrollbar-h-cap', '--skin-scrollbar-h-capflip',
  '--skin-scrollbar-h-pattern', '--skin-scrollbar-h-size',
  '--skin-scrollbar-h-repeat', '--skin-scrollbar-h-pos',
  '--skin-divider-color',
  '--skin-titlebar-pattern', '--skin-overlay-color', '--skin-overlay-blur',
  '--skin-dialog-blur',
  '--skin-border-pattern', '--skin-border-pattern-slice',
  '--skin-shadow', '--skin-btn-gradient',
  '--skin-cat-tag-pattern', '--skin-task-list-pattern', '--skin-input-pattern',
  '--skin-btn-pattern', '--skin-dialog-pattern',
  '--skin-card-1-pattern', '--skin-card-2-pattern', '--skin-card-3-pattern',
  '--skin-card-4-pattern', '--skin-card-5-pattern', '--skin-card-6-pattern',
  '--skin-card-count',
  '--skin-menu-pattern', '--skin-code-pattern', '--skin-browser-pattern',
  '--skin-pattern-size', '--skin-pattern-repeat',
] as const;

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

/** 相对亮度别名（语义化：用于判断"底色偏亮还是偏暗"以决定文字取深/取浅） */
const relativeLuminance = luminance;

/**
 * 若颜色偏暗则往白色方向提亮到目标亮度附近（用于浅色主题下的玻璃底色兜底）。
 * 皮肤作者常把 glass 也写成深色（如玻璃色 #0E1626），浅色主题直接拿来用会得到
 * "深底 + 派生出的近黑文字" → 不可读。这里把过深的底色拉回浅色区间。
 * 已经是浅色的原样返回，不做二次漂白。
 */
function lightenIfDark(hex: string, targetLum: number): string {
  if (relativeLuminance(hex) >= 0.62) return hex;
  let out = hex;
  for (let i = 1; i <= 6; i += 1) {
    out = mixHex(hex, '#FFFFFF', i / 6);
    if (relativeLuminance(out) >= targetLum) break;
  }
  return out;
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
  enableCompression: boolean;
  workspaceDir: string;
  /** 工作目录最近使用记录（目录选择器 chip 快捷入口，新选择的目录提到最前，最多 5 个） */
  recentWorkspaceDirs: string[];
  appGuide: string;
  /** 记忆抽取模型配置：空则跟随全局默认模型（通常是 agens 视觉模型），不可用时才回退本地小模型 */
  memoryExtractPlatformId: string;
  memoryExtractModelId: string;
  /** 知识库图谱抽取模型：空则跟随全局默认模型，再不可用才回退本地 Ollama */
  graphExtractPlatformId: string;
  graphExtractModelId: string;
  /** 当前布局 id；'default' 为内置布局，其它值由插件 contributes.layouts 提供 */
  layout: string;
  /**
   * 桌面端截图全局快捷键（Electron accelerator 串，如 'Control+Alt+A'）。
   * 空串 = 用户禁用。仅桌面端生效；web / 移动端忽略此字段。
   * 注意：真正注册在主进程，这里存的是"用户想要的值"，启动时由设置页/输入框同步给主进程。
   */
  screenshotAccelerator: string;
  /**
   * 截图时是否隐藏本应用窗口（对齐微信截图默认隐藏）。
   * 想截自己界面里的内容时关掉它；仅桌面端生效。
   */
  screenshotHideApp: boolean;
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
- **按智能体挂载知识库**：在智能体编辑页「高级配置 → 知识库」勾选若干库后，该智能体的知识库检索范围即收敛到这些库（不挂载则跨全部可见库检索），便于多库场景下按需隔离。默认智能体已挂载内置「应用使用说明」。
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
  enableCompression: true,
  workspaceDir: '',
  recentWorkspaceDirs: [],
  appGuide: DEFAULT_APP_GUIDE,
  memoryExtractPlatformId: '',
  memoryExtractModelId: '',
  graphExtractPlatformId: '',
  graphExtractModelId: '',
  layout: 'default',
  screenshotAccelerator: 'Control+Alt+A',
  screenshotHideApp: true,
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
    /** 弹窗表面（底图）磨砂半径 px，默认 8 */
    dialogBlur?: number;
    borderPattern?: string;
    borderPatternSlice?: number;
    titlebarPattern?: string;
    shadow?: string;
    catTagPattern?: string;
    taskListPattern?: string;
    inputPattern?: string;
    buttonPattern?: string;
    dialogPattern?: string;
    cardPatterns?: string[];
    cardPatternsDark?: string[];
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
        // 双保险：系列皮肤激活时重应用主色族（palette 可能因启动时序未成功应用，
        // 导致 --color-primary 停留在默认色；applyPalette 不反调 applySkin，无递归）
        applyPalette(settings.value.palette);
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
    // 双保险：此处能查到皮肤主题 = plugin store 已就绪，重应用 palette 必然成功。
    // 修复启动时序坑：load() 先于 pluginStore.refresh() 执行时 applyPalette(皮肤id) 查不到主题
    // 直接 return，主色族停在默认朱砂——壁纸生效而主色不跟，观感"皮肤没生效/灰蒙蒙"。
    applyPalette(settings.value.palette);
    root.setProperty('--app-wallpaper', `url("${pluginAssetUrl(pluginId, file)}")`);
    root.setProperty('--skin-mask', String(p.wallpaper.mask ?? 0.26));
    // 2026-09-13 用户反馈「图片皮肤都看不清」—— 壁纸遮罩 backdrop-filter blur 是元凶之一
    // （与玻璃面板 blur 叠加把壁纸糊掉）。默认 5→0，只保留 0.26 mask 的暗色叠加，
    // 不再模糊壁纸本身；如需保留磨砂效果可在 surface.wallpaperBlur 指定（>0）。
    root.setProperty('--skin-blur', `${p.wallpaper.blur ?? 0}px`);
    el.setAttribute('data-skin', 'on');
    applySurface((p as { surface?: SkinSurface }).surface ?? {}, pluginId);
  }

  /** 皮肤模式涉及的全部 CSS 变量（清除皮肤时统一移除；与 SKIN_ELEMENT_VARS 合并去重） */
  const SKIN_CSS_VARS = Array.from(new Set([
    '--app-wallpaper', '--skin-mask', '--skin-blur',
    '--skin-overlay-tint', '--skin-overlay-tint-light',
    '--skin-glass-tint',
    // ===== 配色兜底链（P0-2）：文本 / 容器三级 / 控件层 =====
    '--skin-text', '--skin-text-secondary', '--skin-text-tertiary', '--skin-on-primary',
    '--skin-surface', '--skin-surface-raised', '--skin-surface-sunken',
    '--skin-surface-hover', '--skin-surface-active',
    '--skin-input-bg', '--skin-input-text', '--skin-input-placeholder',
    '--skin-list-bg', '--skin-list-hover', '--skin-list-active', '--skin-list-divider',
    '--skin-dropdown-bg', '--skin-dropdown-hover', '--skin-dropdown-active', '--skin-dropdown-border',
    '--skin-dialog-bg', '--skin-dialog-border', '--skin-dialog-title-bg',
    '--skin-btn-bg-color', '--skin-btn-bg-hover',
    '--skin-input-border',
    // ===== 玻璃不透明度 / 模糊 / 边框（与 96 行注册表共用）=====
    '--skin-glass-alpha', '--skin-glass-alpha-hover',
    '--skin-glass-alpha-panel', '--skin-glass-alpha-panel-sm',
    '--skin-glass-blur', '--skin-glass-border',
    ...SKIN_ELEMENT_VARS,
  ]));

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
    // 元素级变量先清空：重复 applySkin（切皮肤 / 切深浅 / HMR）时，
    // 上一套皮肤未在本次重新下发的值不会残留（残留 = "换了皮肤观感没变"）。
    for (const v of SKIN_ELEMENT_VARS) root.removeProperty(v);
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

    // ===== 浅色模式玻璃底自动提亮（2026-09-13 修「亮色系黑底黑字」）=====
    // 皮肤 manifest 里的 glass / glassDark 是成对写的，但绝大多数皮肤作者把
    // glass 也写成深色（如赛博宵 glass:'#0E1626'、glassDark:'#0A101C'，两个都深）。
    // 浅色主题下直接用 sf.glass → 面板底色是深蓝，而文字层走 deriveSkinTokens(dark=false)
    // 派生出的近黑正文 → **深底近黑字**，对比度 1.0x 肉眼等于看不见（用户反馈"亮色系还有黑底黑字"）。
    // 修复：浅色模式下若解析出的玻璃色亮度 < 0.62（明显偏深），往白里提亮到 0.9 附近，
    // 保证浅色主题下玻璃永远是浅底；同时把文字层按"实际底色明暗"重新选向，
    // 避免"深底 + 深字"或"浅底 + 浅字"任一侧翻车。
    const glassRaw = dark
      ? (sf.glassDark ?? sf.surfaceColor ?? dv.surface)
      : (sf.glass ?? sf.surfaceColor ?? dv.surface);
    const tint = dark ? glassRaw : lightenIfDark(glassRaw, 0.9);
    /**
     * 文字取深/取浅的判据 —— 按「**实际渲染出来的表面**」而非玻璃底色。
     *
     * 【2026-09-13 第二轮修正：部件图现在有暗色变体了】
     * 上一版把"有部件图 ⇒ 表面是浅色"写死成 patternLum = 0.78（因为那时只有浅色图）。
     * 现在部件图由 scripts/build-skin-parts.mjs 生成，**跟随主题取同名 -dark 变体**：
     *   浅色主题 → task-list-bg.webp（原图裁切，亮度中等偏高）
     *   暗色主题 → task-list-bg-dark.webp（压暗 0.62 后派生，亮度低）
     * 因此判据必须跟着当前主题走，否则暗色下会拿暗色图配浅色文字里"再配一次浅色"，
     * 或反过来判成深底去提浅字。简单可靠的做法：
     *   · 暗色主题 + 部件图 → 图是暗色变体 ⇒ 表面偏深 ⇒ 用浅色文字
     *   · 浅色主题 + 部件图 → 图是原图裁切 ⇒ 表面偏浅 ⇒ 用深色文字
     *   · 无部件图 → 回到玻璃色亮度判据（行为与改造前一致）
     * 皮肤仍可用 surface.patternIsDark 显式覆盖（如自带深色部件图）。
     */
    const hasParts = !!(sf.taskListPattern || sf.inputPattern || sf.buttonPattern || sf.dialogPattern);
    const patternLum = sf.patternIsDark === true ? 0.12 : (dark ? 0.22 : 0.62);
    const surfaceIsLight = hasParts
      ? patternLum >= 0.5
      : relativeLuminance(tint) >= 0.62;
    const tintIsLight = surfaceIsLight;
    const pickText = (explicit: string | undefined, fallbackLight: string, fallbackDark: string) => {
      if (!explicit) return tintIsLight ? fallbackLight : fallbackDark;
      const l = relativeLuminance(explicit);
      // 底色浅而文字也浅 → 换深字；底色深而文字也深 → 换浅字
      if (tintIsLight && l > 0.62) return fallbackLight;
      if (!tintIsLight && l < 0.35) return fallbackDark;
      return explicit;
    };
    // 暗色下大面板不透明度从 0.70 降到 0.42，让壁纸透出来（2026-09-13 用户反馈
    // 「预览背景皮肤也没有 / 最主要的背景图片都没了」：原本 0.82+blur18 几乎把右侧
    // 预览面板糊成纯深色块，看不到壁纸）。
    // 浅色下同理：皮肤 manifest 的 glassAlpha 多为 0.78~0.86（几乎全实），
    // 壁纸被面板整块盖住 → 观感"灰蒙蒙 / 皮肤没生效"。上限收到 0.72 让壁纸透出来。
    //
    // ⚠️ 只有皮肤**显式配置**了 glassAlpha/glassAlphaDark 才下发。
    //    未配置时不下发 → skin.css 的回落值（.42/.30/.72/.62）成为真实默认值。
    //    这就是"改 CSS 就能调透明度"的前提，替代此前"JS 全量兜底 echo"的做法。
    const alphaRaw = dark ? sf.glassAlphaDark : sf.glassAlpha;
    const alpha = alphaRaw === undefined
      ? undefined
      : (dark ? alphaRaw : Math.min(alphaRaw, 0.72));
    const border = dark ? (sf.borderDark ?? sf.border) : sf.border;
    root.setProperty('--skin-glass-tint', tint);
    if (alpha !== undefined) {
      root.setProperty('--skin-glass-alpha', String(alpha));
      root.setProperty('--skin-glass-alpha-hover', String(Math.min(alpha + 0.07, 1)));
    }
    if (border) root.setProperty('--skin-glass-border', border);

    // ===== 三栏面板 / 小面板的玻璃不透明度（2026-09-13 第三轮修「一直灰蒙蒙」）=====
    // 三部分是不同观感诉求，不能再共用一个 alpha：
    //   · 三栏面板（左栏/中列/右栏）体量大 → 更透（暗 .42 / 浅 .72），让壁纸主导观感
    //   · 小面板（输入条/工具条/吸顶条）压在壁纸纹理上 → 更实（暗 .30 / 浅 .62）保文字可读
    //     （.30 反直觉地更实：它不在 backdrop-filter 元素的嵌套采样链里，
    //      底部输入条那层 blur 是按 0.30 混合进下方玻璃的，值越小越暗 → 文字越清楚）
    // 皮肤可用 panelAlphaDark / panelAlphaSmallDark 覆盖。
    if (dark) {
      if (sf.panelAlphaDark !== undefined) root.setProperty('--skin-glass-alpha-panel', String(sf.panelAlphaDark));
      if (sf.panelAlphaSmallDark !== undefined) root.setProperty('--skin-glass-alpha-panel-sm', String(sf.panelAlphaSmallDark));
    } else {
      if (sf.panelAlphaLight !== undefined) root.setProperty('--skin-glass-alpha-panel', String(sf.panelAlphaLight));
      if (sf.panelAlphaSmallLight !== undefined) root.setProperty('--skin-glass-alpha-panel-sm', String(sf.panelAlphaSmallLight));
    }

    // ===== 文本层：皮肤模式下 --color-text* 由皮肤配色接管 =====
    // 关键：用 pickText 兜底 —— 底色被提亮（或皮肤本身给了同向的深浅冲突色）时，
    // 文本强制翻到与底色相反的一侧，杜绝"深底深字 / 浅底浅字"两类不可读。
    const dvTextLight = deriveSkinTokens(currentSkinPrimary, false);
    const dvTextDark = deriveSkinTokens(currentSkinPrimary, true);
    root.setProperty('--skin-text', pickText(sf.text, dvTextLight.text, dvTextDark.text));
    root.setProperty('--skin-text-secondary', pickText(sf.textSecondary, dvTextLight.textSecondary, dvTextDark.textSecondary));
    root.setProperty('--skin-text-tertiary', pickText(sf.textTertiary, dvTextLight.textTertiary, dvTextDark.textTertiary));
    root.setProperty('--skin-on-primary', sf.onPrimary ?? dv.onPrimary);

    // ===== 容器三级 + 控件层 =====
    // 浅色主题保护（同 tint）：皮肤若给了深色容器色（大量皮肤作者只按暗色配一遍），
    // 直接落到浅色主题会得到深底浅字/深底深字。这里在浅色模式下统一做提亮兜底。
    const sh = (v: string) => (dark ? v : lightenIfDark(v, 0.9));
    root.setProperty('--skin-surface', sh(sf.surfaceColor ?? dv.surface));
    root.setProperty('--skin-surface-raised', sh(sf.surfaceRaisedColor ?? dv.surfaceRaised));
    root.setProperty('--skin-surface-sunken', sh(sf.surfaceSunkenColor ?? dv.surfaceSunken));
    root.setProperty('--skin-surface-hover', sh(sf.surfaceHoverColor ?? dv.surfaceHover));
    root.setProperty('--skin-surface-active', sh(sf.surfaceActiveColor ?? dv.surfaceActive));
    root.setProperty('--skin-input-bg', sh(sf.inputBg ?? dv.inputBg));
    root.setProperty('--skin-input-border', sf.inputBorder ?? dv.inputBorder);
    root.setProperty('--skin-input-text', tintIsLight ? dvTextLight.inputText : dvTextDark.inputText);
    root.setProperty('--skin-input-placeholder', tintIsLight ? dvTextLight.inputPlaceholder : dvTextDark.inputPlaceholder);
    root.setProperty('--skin-list-bg', sh(sf.listBg ?? dv.listBg));
    root.setProperty('--skin-list-hover', sh(dv.listItemHover));
    root.setProperty('--skin-list-active', sh(dv.listItemActive));
    root.setProperty('--skin-list-divider', dv.listDivider);
    root.setProperty('--skin-dropdown-bg', sh(sf.dropdownBg ?? dv.dropdownBg));
    root.setProperty('--skin-dropdown-hover', sh(dv.dropdownItemHover));
    root.setProperty('--skin-dropdown-active', sh(dv.dropdownItemActive));
    root.setProperty('--skin-dropdown-border', dv.dropdownBorder);
    root.setProperty('--skin-dialog-bg', sh(sf.dialogBgColor ?? dv.dialogBg));
    root.setProperty('--skin-dialog-border', dv.dialogBorder);
    root.setProperty('--skin-dialog-title-bg', sh(dv.dialogTitleBg));
    root.setProperty('--skin-btn-bg-color', sh(dv.buttonBg));
    root.setProperty('--skin-btn-bg-hover', sh(dv.buttonBgHover));
    // 圆角：仅皮肤显式配置时下发（未配置 → 走 skin.css 默认值 12/6/6/12/6）
    if (sf.radius !== undefined) root.setProperty('--skin-radius', `${sf.radius}px`);
    if (sf.buttonRadius !== undefined) root.setProperty('--skin-btn-radius', `${sf.buttonRadius}px`);
    const autoBtnText = contrastRatio(currentBtnPrimary, '#ffffff') >= 4.5 ? '#ffffff' : (dark ? '#F2F0EA' : '#141414');
    const btnText = sf.buttonText ?? sf.onPrimary;
    if (btnText) root.setProperty('--skin-btn-text', btnText);
    else if (sf.buttonRadius !== undefined || sf.radius !== undefined) root.setProperty('--skin-btn-text', autoBtnText);
    // 2026-09-13 用户反馈「图片皮肤都看不清」—— 玻璃面板 backdrop-filter blur 是元凶之二
    // （与壁纸遮罩 blur 叠加把壁纸+纹理都糊掉）。默认 0（skin.css 回落值），玻璃只剩
    // 半透明底色，不再模糊壁纸/纹理；如需磨砂效果可在 surface.glassBlur 指定（>0）。
    if (sf.glassBlur !== undefined) root.setProperty('--skin-glass-blur', `${sf.glassBlur}px`);
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

    // 弹窗遮罩：未配置时用派生色（带皮肤色相的半透明）—— 派生本身已含透明度，
    // 故与圆角/图案不同，这里恒下发（CSS 回落的 #0f172a 是无关皮肤色相的冷蓝灰）。
    root.setProperty('--skin-overlay-color', sf.overlayColor || sf.overlayTint || dv.overlayTint);
    if (sf.overlayBlur !== undefined) root.setProperty('--skin-overlay-blur', `${sf.overlayBlur}px`);
    // 弹窗表面磨砂（skin.css 的 .el-dialog::before 消费），默认 8px 走 CSS 回落
    if (sf.dialogBlur !== undefined) root.setProperty('--skin-dialog-blur', `${sf.dialogBlur}px`);
    if (sf.borderPattern) {
      root.setProperty('--skin-border-pattern', asset(sf.borderPattern));
      root.setProperty('--skin-border-pattern-slice', String(sf.borderPatternSlice ?? 0));
    }
    // ===== 部位图案统一下发 =====
    // 【2026-09-13 三修「灰蒙蒙」。前两轮都没修对，根因记在这里】
    // 铺垫：皮肤包里的部件图（task-list-bg / input-bg / button-bg / dialog-bg）
    // 都是**为浅色主题生成的浅色图** —— 实测 27 套皮肤这批图平均亮度 230~248
    // （接近纯白，如 skin-cyber-neon/task-list-bg.webp ≈ rgb(221,223,224)）。
    // 而暗色主题下它们被原样铺到侧栏/输入框/按钮上，于是：
    //   浅色图(亮度240) × (1-a) + 深纱(亮度16) × a = 合成亮度
    // 前两轮分别把 a 设成 0.70 / 0.80 并观察"好像暗了"，但没算合成值：
    //   a=0.70 → 83（中灰）   ← 用户看到的"灰蒙蒙"本体
    //   a=0.80 → 61           ← 仍明显偏灰
    //   a=0.95 → 27           ← 才真正像深色面板，但纹理只剩 5%，图案等于消失
    // 即：「暗色玻璃面板」与「浅色部件图纹理」在数学上互斥，不能既要又要。
    // 这也解释了为什么改 --glass-bg / --el-* / 玻璃 alpha 全都"没反应" ——
    // 灰来自**图片层**，不是底色层，调底色当然无效。
    //
    // 纱罩彻底取消（2026-09-13 最终定稿）。
    // 用户原话："不要玻璃，能清晰显示图片就好了，我一直都是这个要求啊" ——
    // 前几轮在"纱罩该多强"上反复试探（0.35 / 0.70 / 0.78 / 0.80 / 0.12）全是错方向：
    // 只要**给部件图叠任何一层纱罩**，图就被洗淡，用户要的是原图清晰显示。
    // 因此这里恒为 '' —— 图案值就是纯图，不带任何附加层。
    // 文字可读性让皮肤自己通过选图的明暗来保证，不再由 CSS 兜底压暗。
    const scrim: string = '';
    // 部件图贴合方式：**默认 cover + 居中，不挤压**（2026-09-13 用户明确要求
    // 「图片不要挤压......就是一张大图居中，把容器覆盖掉」）。
    // cover = 保持宽高比、按容器裁切，是"一张大图居中覆盖"的标准做法；
    // 对比另外两种：fill/100% 会拉伸变形（挤压），repeat 会变成平铺马赛克。
    // 历史坑：早期默认 cover 时部件图是 480×270 小纹理，被拉到 600px 宽显糊 →
    // 曾改为 repeat；现在部件图已改用大图（延展底），cover 才是正确贴合方式。
    // 皮肤可经 surface.patternFit 覆盖（contain / repeat / repeat-x）。
    if (sf.patternFit !== undefined) {
      const fit = sf.patternFit;
      root.setProperty('--skin-pattern-size', fit === 'repeat' || fit === 'repeat-x' ? 'auto' : fit);
      root.setProperty('--skin-pattern-repeat', fit === 'repeat' || fit === 'repeat-x' ? fit : 'no-repeat');
    }
    /**
     * 部件图取值（light / dark 双变体）。
     *
     * 【2026-09-13 用户反馈"输入框和侧栏很亮很白，只能模糊看到图片"的最终修复】
     * 根因有二，缺一不可：
     *   ① 旧的部件图本身是「整张壁纸 + 重白化」的产物（实测亮度 226+，几乎全白）
     *      → 铺上去就是一片白，用户说"只能模糊看到图片"。已改由
     *      scripts/build-skin-parts.mjs 从壁纸**裁切局部取景**重生成，画面清晰。
     *   ② 即便图有内容，**暗色主题下铺浅色图**依然不对：深色应用 + 浅色图 = 刺眼一块亮板。
     *      → 部件图现在跟壁纸一样有暗色变体（<name>-dark.webp），由构建脚本一并产出。
     *
     * 命名约定（与壁纸 wallpaper.webp / wallpaper-dark.webp 一致）：
     *   浅色取 <name>.webp；暗色取 <name>-dark.webp（存在就用，缺失回落浅色图）。
     * 皮肤若显式给了 darkVariant（如 menuPatternDark）优先用它。
     */
    const themedPattern = (light?: string, darkVariant?: string) => {
      if (!light && !darkVariant) return undefined;
      let base: string | undefined;
      if (dark) {
        base = darkVariant
          ?? (light && /\.webp$/i.test(light) ? light.replace(/\.webp$/i, '-dark.webp') : light);
      } else {
        base = light;
      }
      if (!base) return undefined;
      const img = asset(base);
      // 部件图整体不透明度：CSS 里以 linear-gradient(rgba(clr, a)) 形式铺在最上层，
      // scrim 在下面负责"压暗"。两者独立 —— scrim 管对比度，本项管图案清晰度。
      const op = sf.patternOpacity;
      const veil = op === undefined ? '' : `linear-gradient(${hexToRgba('#000000', 1 - op)}, ${hexToRgba('#000000', 1 - op)}), `;
      const layers = scrim ? `${scrim}, ${img}` : img;
      return `${veil}${layers}`;
    };
    const setPattern = (name: string, value?: string) => {
      if (value) root.setProperty(name, value);
      else root.removeProperty(name);
    };
    setPattern('--skin-titlebar-pattern', themedPattern(sf.titlebarPattern));
    // 圆角：仅皮肤显式配置时下发（尊重皮肤作者意图；未配置 → skin.css 默认值）
    if (sf.inputRadius !== undefined || sf.buttonRadius !== undefined) {
      root.setProperty('--skin-input-radius', `${sf.inputRadius ?? sf.buttonRadius ?? 6}px`);
    }
    if (sf.cardRadius !== undefined || sf.radius !== undefined) {
      root.setProperty('--skin-card-radius', `${sf.cardRadius ?? sf.radius ?? 12}px`);
    }
    if (sf.tagRadius !== undefined || sf.buttonRadius !== undefined) {
      root.setProperty('--skin-tag-radius', `${sf.tagRadius ?? sf.buttonRadius ?? 6}px`);
    }
    if (sf.scrollbarThumb) root.setProperty('--skin-scrollbar-thumb', sf.scrollbarThumb);
    // 滚动条「金箍棒材质」下发（2026-09-13 第四版）：
    // 6 个变量一一对应 skin.css 的 --skin-scrollbar-{v,h}-{body,cap,capflip}。
    // ⚠️ 竖版 / 横版必须分开给：横条若复用竖版 body，repeat-x 时接缝处会留黑缝，
    //    横条碎成「一串小方块」（用户已截图反馈）。皮肤的 manifest 里两者都要配。
    if (sf.scrollbarVBody) root.setProperty('--skin-scrollbar-v-body', sf.scrollbarVBody);
    if (sf.scrollbarVCap) root.setProperty('--skin-scrollbar-v-cap', sf.scrollbarVCap);
    if (sf.scrollbarVCapFlip) root.setProperty('--skin-scrollbar-v-capflip', sf.scrollbarVCapFlip);
    if (sf.scrollbarHBody) root.setProperty('--skin-scrollbar-h-body', sf.scrollbarHBody);
    if (sf.scrollbarHCap) root.setProperty('--skin-scrollbar-h-cap', sf.scrollbarHCap);
    if (sf.scrollbarHCapFlip) root.setProperty('--skin-scrollbar-h-capflip', sf.scrollbarHCapFlip);
    if (sf.dividerColor) root.setProperty('--skin-divider-color', sf.dividerColor);
    setPattern('--skin-cat-tag-pattern', themedPattern(sf.catTagPattern));
    setPattern('--skin-task-list-pattern', themedPattern(sf.taskListPattern));
    setPattern('--skin-input-pattern', themedPattern(sf.inputPattern));
    setPattern('--skin-btn-pattern', themedPattern(sf.buttonPattern));
    setPattern('--skin-dialog-pattern', themedPattern(sf.dialogPattern));
    // ===== 卡片变体底图（多套样式 + 随机分配）=====
    // 【2026-09-13 用户反馈："卡片样式可以设置多点啊，然后随机多好。。。"】
    // 内置皮肤由 build-skin-parts.mjs 从壁纸 4 个不同区域取景生成 card-1~4-bg.webp，
    // 这里逐张下发为 --skin-card-N-pattern；skin.css 按 nth-child 循环取用，
    // 同一列卡片自然错开成多套外观（且稳定可复现，不用 JS 记随机状态）。
    // 未配置 cardPatterns 的插件皮肤：回落单张（taskListPattern）→ 观感与改造前一致。
    const cardList = dark
      ? (sf.cardPatternsDark ?? sf.cardPatterns)
      : sf.cardPatterns;
    if (cardList && cardList.length) {
      cardList.forEach((v, i) => {
        setPattern(`--skin-card-${i + 1}-pattern`, themedPattern(v));
      });
      root.setProperty('--skin-card-count', String(Math.min(cardList.length, 6)));
    }
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

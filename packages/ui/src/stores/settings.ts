// 设置 store（持久化到 keyring 的特殊命名空间）
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';

export type ThemeName = 'ocean' | 'forest' | 'sunset' | 'aurora' | 'rose';

export interface AppSettings {
  theme: ThemeName;
  darkMode: boolean;
  defaultPlatformId: string;
  defaultModelId: string;
  keepRecent: number;
  maxContextTokens: number;
  enableCompression: boolean;
  workspaceDir: string;
  /** 应用使用指南（内置默认，用户可在设置里自定义覆盖）；命中用户问题关键字时注入提示词 */
  appGuide: string;
  /** 记忆抽取模型配置：空则默认本地小模型 */
  memoryExtractPlatformId: string;
  memoryExtractModelId: string;
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
- 顶部有「平台 / 模型」下拉：选择要使用的模型平台和具体模型（含内置本地小模型）。
- 在「设置」→「模型平台」里可新增平台（OpenAI / Anthropic 兼容网关），配置 API 地址与密钥。
- 离线（未登录）时默认用内置本地小模型（完整版安装包内置；轻量版需配置外部模型）。
- 记忆抽取等后台任务用「记忆抽取模型」，默认本地小模型，可单独配置更强模型。`,
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
- 记忆抽取模型可在「设置」里切换（默认内置本地小模型）。`,
  },
  {
    name: '内置浏览器与 Chromium',
    content: `## 内置浏览器与 Chromium
- 桌面端预览面板打开网页 → 用 Electron 自带的浏览器（BrowserView），无需额外下载 Chromium。
- 智能体（对话里）让浏览器「打开网页」（browser_navigate）时，会在你屏幕上的预览面板同步打开并显示，和手动打开的共用同一个浏览器。
- 服务端另有无头浏览器（Playwright）用于网页自动化抓取等；那份 Chromium 需单独安装（npx playwright install chromium），与桌面内置浏览器是两套、互不影响。
- 内置的「web_search 搜索」也走服务端无头浏览器，直接返回搜索页文本。`,
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
- 模型不可用：检查「设置 → 模型平台」是否配置了可用平台；离线时用本地小模型（完整版内置）。
- 知识库检索不到：确认库是公开还是私有、以及提问措辞（语义检索比关键词更宽松）。`,
  },
];

/** 拼接所有功能文档，供「命中怎么用/如何使用时整段注入进 system prompt」使用。 */
export const DEFAULT_APP_GUIDE = APP_GUIDE_DOCS.map((d) => d.content).join('\n\n---\n\n');

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'aurora',
  darkMode: true,
  defaultPlatformId: '',
  defaultModelId: '',
  keepRecent: 6,
  maxContextTokens: 8000,
  enableCompression: true,
  workspaceDir: '',
  appGuide: DEFAULT_APP_GUIDE,
  memoryExtractPlatformId: '',
  memoryExtractModelId: '',
};

interface ThemePalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  gradient: string;
  orb1: string;
  orb2: string;
  orb3: string;
}

const THEMES: Record<ThemeName, ThemePalette> = {
  ocean: {
    primary: '#3B82F6',
    primaryLight: '#DBEAFE',
    primaryDark: '#1D4ED8',
    accent: '#6366F1',
    gradient: 'linear-gradient(135deg, #3B82F6, #6366F1)',
    orb1: '#3B82F6',
    orb2: '#60A5FA',
    orb3: '#93C5FD',
  },
  forest: {
    primary: '#10B981',
    primaryLight: '#D1FAE5',
    primaryDark: '#047857',
    accent: '#34D399',
    gradient: 'linear-gradient(135deg, #10B981, #34D399)',
    orb1: '#10B981',
    orb2: '#34D399',
    orb3: '#6EE7B7',
  },
  sunset: {
    primary: '#F59E0B',
    primaryLight: '#FEF3C7',
    primaryDark: '#B45309',
    accent: '#F97316',
    gradient: 'linear-gradient(135deg, #F59E0B, #F97316)',
    orb1: '#F59E0B',
    orb2: '#FBBF24',
    orb3: '#FDE68A',
  },
  aurora: {
    primary: '#7C3AED',
    primaryLight: '#EDE9FE',
    primaryDark: '#5B21B6',
    accent: '#EC4899',
    gradient: 'linear-gradient(135deg, #7C3AED, #EC4899)',
    orb1: '#7C3AED',
    orb2: '#A78BFA',
    orb3: '#EC4899',
  },
  rose: {
    primary: '#EC4899',
    primaryLight: '#FCE7F3',
    primaryDark: '#BE185D',
    accent: '#F472B6',
    gradient: 'linear-gradient(135deg, #EC4899, #F472B6)',
    orb1: '#EC4899',
    orb2: '#F472B6',
    orb3: '#FBCFE8',
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
        settings.value = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      } catch {}
    }
    loaded.value = true;
    applyTheme(settings.value.theme);
    applyDarkMode(settings.value.darkMode);
  }

  async function save() {
    const adapter = getPlatformAdapter();
    await adapter.keyring.set(STORAGE_KEY, JSON.stringify(settings.value));
  }

  async function update(patch: Partial<AppSettings>) {
    settings.value = { ...settings.value, ...patch };
    if (patch.theme !== undefined) applyTheme(patch.theme);
    if (patch.darkMode !== undefined) applyDarkMode(patch.darkMode);
    await save();
  }

  function applyTheme(theme: ThemeName) {
    const p = THEMES[theme];
    const root = document.documentElement.style;
    root.setProperty('--color-primary', p.primary);
    root.setProperty('--color-primary-light', p.primaryLight);
    root.setProperty('--color-primary-dark', p.primaryDark);
    root.setProperty('--color-accent', p.accent);
    root.setProperty('--gradient-primary', p.gradient);
    root.setProperty('--orb-1-color', p.orb1);
    root.setProperty('--orb-2-color', p.orb2);
    root.setProperty('--orb-3-color', p.orb3);
  }

  function applyDarkMode(dark: boolean) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  return { settings, loaded, load, save, update, THEMES };
});

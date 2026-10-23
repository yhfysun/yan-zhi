// 智能体头像的「选择结果」解析（纯函数，可单测）。
//
// 语义（2026-10-23 用户拍板）：
//   · 用户选过头像 → 用所选（图标 key 或 `img:` 图片 key）
//   · 内置智能体没选过 → 用内置 id 对应的预设图标（"内置的也要有 id"）
//   · 用户自建且没选过 → 显示名称首字（不做按名称猜图标的自动判定）
import {
  User, ApplicationMenu, CodeComputer, DataDisplay, Server, Shield, Search,
  GraphicDesign, VideoTwo, FileText, Experiment, Headset, ShoppingBag, Shop,
  Connection, Rocket, Brain, Wallet, ChartLine, School, MedicineBottle,
  MusicRhythm, Picture, Local, MagicWand, Code, FileCode, DatabaseNetwork,
  ApplicationOne, GraphicStitching, Translation, Videocamera, BookOne,
} from '@icon-park/vue-next';
import type { Component } from 'vue';

export interface AgentIconOption {
  /** 存入 agent.avatar 的稳定键（以后改名不影响已选图标） */
  key: string;
  label: string;
  icon: Component;
}

/**
 * 图片头像在 agent.avatar 里的前缀（如 `img:animal-01`）。
 * 图标键不带前缀，因此同一个 avatar 字段可同时承载两类值，且历史 NULL/URL 脏值一律不走本前缀。
 */
export const AVATAR_KEY_PREFIX = 'img:';

/**
 * 内置图标库：用户在「编辑智能体 → 头像」里可直选。
 *
 * ★ 刻意避开底部 TabBar 的语义（对话/模型/我的/更多）：
 *   智能体图标会与 TabBar 同屏出现，同形同义会造成识别混淆。
 */
export const AGENT_ICON_LIBRARY: AgentIconOption[] = [
  { key: 'general', label: '通用', icon: User },
  { key: 'office', label: '办公', icon: ApplicationMenu },
  { key: 'code', label: '代码', icon: CodeComputer },
  { key: 'data', label: '数据', icon: DataDisplay },
  { key: 'ops', label: '运维', icon: Server },
  { key: 'security', label: '安全', icon: Shield },
  { key: 'search', label: '检索', icon: Search },
  { key: 'design', label: '设计', icon: GraphicDesign },
  { key: 'video', label: '视频', icon: VideoTwo },
  { key: 'doc', label: '文档', icon: FileText },
  { key: 'research', label: '研究', icon: Experiment },
  { key: 'service', label: '客服', icon: Headset },
  { key: 'shop', label: '电商', icon: ShoppingBag },
  { key: 'workflow', label: '流程', icon: Connection },
  { key: 'launch', label: '发布', icon: Rocket },
  { key: 'ai', label: '智能', icon: Brain },
  { key: 'finance', label: '财务', icon: Wallet },
  { key: 'chart', label: '图表', icon: ChartLine },
  { key: 'edu', label: '教育', icon: School },
  { key: 'health', label: '医疗', icon: MedicineBottle },
  { key: 'audio', label: '音频', icon: MusicRhythm },
  { key: 'photo', label: '图像', icon: Picture },
  { key: 'local', label: '本地', icon: Local },
  { key: 'creative', label: '创意', icon: MagicWand },
];

const AGENT_ICON_BY_KEY = new Map(AGENT_ICON_LIBRARY.map((o) => [o.key, o.icon]));

/** avatar 里存的值是否为合法图标键（用于区分「用户显式选过」与「历史脏值」） */
export function isKnownAgentIconKey(key?: string | null): boolean {
  return !!key && AGENT_ICON_BY_KEY.has(key);
}

/**
 * 内置智能体 id → 预设图标。
 * ★ 与 apps/server 的 seed id 对齐；新增内置智能体时在这里补一行，
 *   否则它会回落到「名称首字」而不是预设图标。
 */
export const AGENT_ICON_BY_ID: Record<string, Component> = {
  // 日常办公 / 通用
  a_default_assistant: ApplicationMenu,
  // 浏览器操作（pageAgent）
  a_builtin_page_agent: Search,
  // 数据查询分析
  a_builtin_data_agent: DataDisplay,
  // 运维
  a_builtin_ops_agent: Server,
  // 安全
  a_builtin_sec_agent: Shield,
  // 代码类
  a_builtin_code_agent: CodeComputer,
  a_builtin_java_agent: Code,
  a_builtin_code_explorer: FileCode,
  a_builtin_backend_dev: DatabaseNetwork,
  a_builtin_frontend_dev: ApplicationOne,
  // 设计类
  a_builtin_design_agent: GraphicDesign,
  a_builtin_ui_designer: GraphicStitching,
  // 短剧 / 剪辑
  a_builtin_storyboard_agent: VideoTwo,
  a_builtin_clip_agent: VideoTwo,
  // 发布 / CI-CD
  a_builtin_cicd_agent: Rocket,
  a_builtin_publish_agent: Rocket,
  // 多语翻译
  a_builtin_translate_agent: Translation,
  // 小微生意经营
  a_builtin_business_agent: Shop,
  // 抖音运营（图文带货 + 引流）
  a_builtin_douyin_agent: Videocamera,
  // 小说 / 小说推文 / 脚本 / 有声小说 / 配音（任务模式）
  a_builtin_novel_agent: BookOne,
  a_builtin_novel_tuiwen_agent: BookOne,
  a_builtin_script_agent: FileText,
  a_builtin_audiobook_agent: Headset,
  a_builtin_dubbing_agent: MusicRhythm,
};

/** 图标键 → 图标组件；非图标键返回 undefined */
export function resolveAgentIconKey(key?: string | null): Component | undefined {
  return key ? AGENT_ICON_BY_KEY.get(key) : undefined;
}

/**
 * 解析助手的预设图标：
 * 用户显式选择（avatar 图标键）→ 内置 id 预设 → undefined（调用方回落到名称首字）。
 * 图片头像（`img:`）由 utils/agentAvatarImages.ts 先行处理，这里不参与。
 */
export function resolveAgentIcon(id?: string | null, avatar?: string | null): Component | undefined {
  const picked = avatar ? AGENT_ICON_BY_KEY.get(avatar) : undefined;
  if (picked) return picked;
  return id ? AGENT_ICON_BY_ID[id] : undefined;
}

/** 名称首字（按码点切，兼容 emoji 名）：未选头像且无内置图标时的占位 */
export function agentInitial(name?: string | null, count = 1): string {
  return Array.from((name || '?').trim() || '?').slice(0, count).join('');
}

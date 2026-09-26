// 智能体图标解析（纯函数，可单测）
//
// 背景：agent 表虽有 avatar 列，但内置助手 seed 从未赋过值（全部 NULL），
// 所以「+」菜单的助手二级列表只能降级渲染「名称首字」色块（日/数/运/代…），
// 而同一个菜单里技能 / MCP / 模式等都是真图标 —— 视觉上明显不统一。
//
// 方案（用户拍板）：按用途给内置助手配语义图标；用户自建助手用通用图标兜底。
// 纯前端映射，不动数据库、不改 seed、不需要迁移。
import {
  Monitor, DataAnalysis, Platform, Lock, VideoCamera, Brush, Search, Box,
  User, SetUp, Files, Reading, Cpu, Promotion, ChatDotRound, Suitcase,
  Notebook, Shop,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';

/**
 * 内置助手 id → 图标。
 * ★ 这里只放「语义明确」的用途图标；未登记的一律走 fallback（不猜）。
 */
export const AGENT_ICON_BY_ID: Record<string, Component> = {
  // 日常办公 / 通用助手
  a_default_assistant: Suitcase,
  // 浏览器操作（pageAgent）
  a_builtin_page_agent: Search,
  // 数据查询分析
  a_builtin_data_agent: DataAnalysis,
  // 运维
  a_builtin_ops_agent: Platform,
  // 安全
  a_builtin_sec_agent: Lock,
  // 代码类
  a_builtin_code_agent: Monitor,
  a_builtin_java_agent: Cpu,
  a_builtin_code_explorer: Reading,
  a_builtin_backend_dev: Files,
  a_builtin_frontend_dev: Monitor,
  // 设计类
  a_builtin_design_agent: Brush,
  a_builtin_ui_designer: Brush,
  // 短剧
  a_builtin_storyboard_agent: VideoCamera,
  // 发布 / CI-CD
  a_builtin_cicd_agent: Promotion,
  // 多语翻译
  a_builtin_translate_agent: Notebook,
  // 小微生意经营
  a_builtin_business_agent: Shop,
};

/**
 * 名称关键词 → 图标（覆盖用户自建助手，按用途语义匹配）。
 * 顺序即优先级：先匹配到的胜出（更具体的词放前面）。
 *
 * ★ 刻意**不收录**「助手 / 助理」这类万能词：几乎所有自建助手都叫「XX助手」，
 *   收进来会把「代码编写助手」当成办公类（实测踩过），
 *   也会让本该走兜底的「小明的助手」被误判。只认真正的用途词。
 */
const AGENT_ICON_BY_KEYWORD: Array<[RegExp, Component]> = [
  [/短剧|分镜|导演|剧本/, VideoCamera],
  // 翻译（放在「写作/文档」之前：翻译助手的活是译，不是写）。
  // 用词覆盖实际起名习惯：翻译 / 中英互译 / 多语言 / 本地化 / 笔译口译 / 译员。
  [/翻译|多语|本地化|互译|中英|英译|笔译|口译|译员|translate|i18n/i, Notebook],
  // 小微生意经营 —— 必须排在「设计/数据」之前：
  // 「门店经营分析」「生意数据复盘」这类名字里都含「分析/数据」，
  // 排在后面会被通用词抢走（实测踩过）。这里认的都是高度专指的词。
  [/生意|开店|经营|创业|盈亏/, Shop],
  [/设计|创意|视觉|海报|ui|美工/i, Brush],
  [/数据|分析|报表|统计|bi\b/i, DataAnalysis],
  [/运维|服务器|docker|部署|sre/i, Platform],
  [/安全|审计|渗透|漏洞|\bsec\b/i, Lock],
  [/浏览器|爬虫|检索|联网|搜索/, Search],
  [/测试|单测|\bqa\b/i, Reading],
  [/代码|开发|编程|程序|前端|后端|java|python|重构|审查/i, Monitor],
  [/流程|工作流|编排|流水线/, SetUp],
  [/文档|写作|word|ppt|excel|办公|公文|邮件|会议|纪要|周报|汇报|表格/i, Suitcase],
];

/** 兜底图标：无法判定用途时的通用「智能体」图标。
 *
 * ★★ 必须**与底部 TabBar 的四个图标互不重叠**，否则"没登记用途的助手"会与常驻导航撞脸：
 *   - TabBar 是：ChatDotRound / Cpu / **UserFilled（实心）** / Setting（见 SideNav.mobilePrimaryItems）
 *   - agent 表 avatar 列内置 seed 全为 NULL → 大量助手会落到这个兜底图标
 *   ⇒ 兜底取**线框 `User`**：与 TabBar 的**实心 `UserFilled`** 形状不同（一个 circle+path、
 *     一个实心 path），用户能一眼区分；语义仍是"通用智能体"。
 *   ★ 这个配对关系是易错点：TabBar 从线框改实心时，兜底必须同时从实心改回线框
 *     （曾一度两边都是实心 → 又开始撞脸）。由
 *     `composables/mobileIconUniqueness.test.ts` 双向守门。 */
export const AGENT_FALLBACK_ICON: Component = User;

/**
 * 解析助手图标。
 * 判定顺序：内置 id 精确匹配 → 名称关键词 → 兜底。
 *
 * @param id   助手 id（可空）
 * @param name 助手名称（可空）
 */
export function resolveAgentIcon(id?: string | null, name?: string | null): Component {
  if (id && AGENT_ICON_BY_ID[id]) return AGENT_ICON_BY_ID[id];
  const n = (name || '').trim();
  if (n) {
    for (const [re, ic] of AGENT_ICON_BY_KEYWORD) {
      if (re.test(n)) return ic;
    }
  }
  return AGENT_FALLBACK_ICON;
}

/**
 * 是否应该给该助手显示图标。
 * 约定：只要拿得到名称就显示图标（首字块退化为图标）；
 * 名称为空时返回 false，交由调用方继续渲染「?」占位。
 */
export function shouldUseAgentIcon(id?: string | null, name?: string | null): boolean {
  if (id && AGENT_ICON_BY_ID[id]) return true;
  return !!(name || '').trim();
}

/** 名称首字（保留原逻辑，供无图标场景使用） */
export function agentInitial(name?: string | null, count = 1): string {
  return (name || '?').slice(0, count);
}
// 页面内对话「历史」的纯逻辑（P3-5，2026-10-16）：会话行 → 展示行、搜索/本站过滤、蒸馏消息映射。
//
// ★ 为什么又抽一个纯模块（与本仓一贯判据一致："断言存在 ≠ 断言生效"）：
//   "列表里显示哪一行、搜索匹配什么、本站过滤怎么算、空消息要不要进蒸馏" 都是**行为**，
//   写在 .vue 里就只能靠静态断言（本仓组件测试是纯文本契约，跑不了 DOM）。
//   与 utils/pageCommand.ts（匹配引擎）、utils/pageContext.ts（上下文装配）同一分工。

import { parseSourceMeta } from '@yan-zhi/core';
import { hostOf } from './pageContext';
import type { PageChatMessage } from '../stores/page-chat-state';

/** 历史列表的一行 */
export interface PageChatSession {
  id: string;
  title: string;
  /** 建会话时所处的页面地址（老数据没有来源信息时为空串） */
  url: string;
  /** 站点（列表展示 + 「只看本站」过滤用） */
  host: string;
  /** 归属空间：'page' = /browser 独立页；'' = 老数据没记 */
  scope: string;
  createdAt: number;
  updatedAt: number;
}

/** 毫秒时间戳 → 列表里那行小字（同一年不显示年份，省宽度） */
export function formatSessionTime(ts: number, now = Date.now()): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameYear ? `${md} ${hm}` : `${d.getFullYear()}年${md}`;
}

/**
 * 会话行（服务端 `SELECT *` 的蛇形字段）→ 展示行。
 * ★ 站点优先取落库时记下的 `source_meta_json.host`：那是**建会话当时**的站点。
 *   标题里的 `浏览器 · host` 不算数 —— 用户改名或 LLM 自动标题都会把它覆盖掉。
 */
export function toSession(row: any): PageChatSession {
  const meta = parseSourceMeta(row?.source_meta_json);
  const url = String(meta.url || '');
  return {
    id: String(row?.id || ''),
    title: String(row?.title || '未命名页面对话'),
    url,
    host: String(meta.host || hostOf(url) || ''),
    scope: String(meta.scope || ''),
    createdAt: Number(row?.created_at || 0),
    updatedAt: Number(row?.updated_at || row?.created_at || 0),
  };
}

/** 会话行数组 → 展示行（丢掉没有 id 的坏行，别让一个空 id 把列表点崩） */
export function toSessions(rows: unknown): PageChatSession[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(toSession).filter((s) => !!s.id);
}

/**
 * 列表过滤：`q` 同时匹配标题与站点（用户记得的往往是"那个淘宝的会话"）。
 * `onlyHost` 非空 ⇒ 只看该站点（面板里"只看本站"用当前页的 host）。
 */
export function filterSessions(
  sessions: PageChatSession[],
  q = '',
  onlyHost = '',
): PageChatSession[] {
  const kw = q.trim().toLowerCase();
  return sessions.filter((s) => {
    if (onlyHost && s.host !== onlyHost) return false;
    if (!kw) return true;
    return s.title.toLowerCase().includes(kw) || s.host.toLowerCase().includes(kw);
  });
}

/**
 * 面板消息 → 蒸馏用的 `{role, content}`。
 * ★ 只留**真正的对话**：本地面板提示（error 气泡：已停止 / 漂移告警 / 脚本结果）不是模型的产出，
 *   喂给蒸馏会把"⚠️ 执行期间新增了 1 个标签页"这类运维噪声学成技能步骤。
 * ★ 空白消息丢掉（蒸馏提示词里一条空消息会变成一行空内容）。
 */
export function distillMessagesOf(messages: PageChatMessage[]): Array<{ role: string; content: string }> {
  return (messages || [])
    .filter((m) => !m.error && String(m.content || '').trim())
    .map((m) => ({ role: m.role, content: String(m.content).trim() }));
}

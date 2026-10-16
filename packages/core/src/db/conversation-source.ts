// 会话**来源标记**（2026-10-16）：回答"这条会话是谁开的"的**唯一出口**。
//
// ★ 为什么要有这一列，而不是靠 `agent_id` / 标题前缀反推：
//   页面内对话在 preview 空间**复用主会话**（智能体是用户自己的），在 page 空间才自建
//   （`a_builtin_page_agent`）。靠智能体认来源 ⇒ 同一个功能在两个空间给出两个答案，
//   "这会话哪来的"就没有稳定判据了（见 docs/浏览器-页面内对话与页面指令-方案-20261016.md §4.6：
//   会话归属由**面板所在空间**决定，不由智能体决定）。
//   靠标题前缀（`浏览器 · host`）更糟：用户改名即失效。
//
// ★ 为什么是列而不是新表：来源是会话的**属性**（1:1、随会话一起删），
//   单独建表就要在 hardDeleteRow 的清理清单里再加一项 —— 那个清单漏项已经出过两次事故
//   （见 services/conversation-lifecycle.ts 的注释）。
//
// 取值是**白名单**（非法值一律落 NULL = 普通会话）：
//   NULL / ''       = 普通会话（用户从对话页新建，或存量会话）
//   'browser-page'  = 浏览器页面对话（page 空间每 tab 一个；也可能是历史会话被打开续聊）
// 加新来源时**只改这里**：服务端写入口与列表过滤都从这里取，免得两边各写一份字面量。

/** 浏览器页面对话 */
export const CONV_SOURCE_BROWSER_PAGE = 'browser-page';

/** 合法来源白名单。扩展时**必须**同时想清楚：主列表要不要过滤它、谁来管理它。 */
export const CONVERSATION_SOURCES: readonly string[] = [CONV_SOURCE_BROWSER_PAGE];

/**
 * 规范化写入值：白名单外一律 null（**不抛错**）。
 * 宁可把来源丢掉（退化成本次改动之前的行为），也不要让一次前端笔误 500 掉建会话 ——
 * 建会话失败会连带整条页面内对话不可用。
 */
export function normalizeConversationSource(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return CONVERSATION_SOURCES.includes(s) ? s : null;
}

/**
 * 列表查询的 source 过滤片段；返回 null = 不过滤。
 *
 * ★ 白名单外的值**按不过滤处理**（与 `mode` 的既有口径一致：前端传错值时不该让用户看到空列表）。
 *   代价是"字典拼错 ⇒ 历史弹窗里混进普通会话"，比"看起来一条都没有"更容易被发现和纠正。
 */
export function sourceFilterClause(q: unknown): string | null {
  const s = normalizeConversationSource(q);
  return s ? `source = '${s}'` : null;
}

/**
 * **反向**过滤：排除某个来源（主会话列表默认把页面对话收起来，只留「页面」徽标入口）。
 *
 * ★★★ 必须显式处理 NULL：`source <> 'browser-page'` 对普通会话（source IS NULL）求值为 NULL，
 *   SQL 里 NULL 不成立 ⇒ **所有普通会话也被一起藏掉**，用户看到的是"我的会话全没了"。
 *   （已用 `apps/server/test/conversation-source.test.ts` 钉住这个语义。）
 * ★ `sourceFilterClause` 与 `excludeSourceClause` 同时传同一个来源时结果为空集 ——
 *   两个参数本来就是互斥用法（一个给历史弹窗，一个给主列表），不做额外兼容。
 */
export function excludeSourceClause(q: unknown): string | null {
  const s = normalizeConversationSource(q);
  return s ? `(source IS NULL OR source <> '${s}')` : null;
}

/** 来源附加信息的体积上限：它只是一条线索（URL/站点），不是消息正文 */
export const CONV_SOURCE_META_MAX = 4096;

/** 单个字段（URL / host）的长度上限 */
export const CONV_SOURCE_META_FIELD_MAX = 2048;

/** 来源附加信息（历史列表要显示"哪一个站点/哪一页"） */
export interface ConversationSourceMeta {
  /** 建会话时所在页面的地址 */
  url?: string;
  /** 该地址的 host（列表里做"只看本站"过滤用；不存的话每行都要现解析） */
  host?: string;
  /** 归属空间：'page' = /browser 独立页；'preview' = 对话右栏 */
  scope?: string;
}

/**
 * 规范化来源附加信息 → 待落库的 JSON 字符串（null = 无）。
 * ★ 超长字段**整条丢掉**，不做截断：截一半的 URL 显示在历史列表里，
 *   看起来像"这页就是这个地址"，比没有地址更容易让人误判（宁可少一条线索，不要一条错的）。
 */
export function normalizeSourceMeta(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const src = v as Record<string, unknown>;
  const meta: ConversationSourceMeta = {};
  for (const k of ['url', 'host', 'scope'] as const) {
    const val = src[k];
    if (typeof val === 'string' && val && val.length <= CONV_SOURCE_META_FIELD_MAX) meta[k] = val;
  }
  if (!Object.keys(meta).length) return null;
  const json = JSON.stringify(meta);
  return json.length > CONV_SOURCE_META_MAX ? null : json;
}

/** 读来源附加信息。任何解析失败一律返回空对象 —— 它只影响列表上的一行小字，不值得抛错。 */
export function parseSourceMeta(json: unknown): ConversationSourceMeta {
  if (typeof json !== 'string' || !json) return {};
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ConversationSourceMeta = {};
    for (const k of ['url', 'host', 'scope'] as const) {
      const val = (parsed as Record<string, unknown>)[k];
      // 与写入侧同一条长度上限：手工改过库的超长值也不该灌进列表渲染
      if (typeof val === 'string' && val && val.length <= CONV_SOURCE_META_FIELD_MAX) out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

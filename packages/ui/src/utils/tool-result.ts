// 工具结果解析 —— 纯函数（2026-10-11 从 useChat 抽出，为卡顿修复提供可测单元）。
//
// 背景：`ChatMessageList.vue` 模板里 `getToolResult(tc.id)` / `isToolError(tc.id)` 是
//   **方法调用**（Vue 不缓存模板函数调用），每次重渲都重新执行。原实现每次：
//     `store.currentMessages.find(...)`（O(n) 全表扫描）+ `JSON.parse(content)`。
//   流式期间 50ms 一帧 → 整列表重渲 → 数百次 find + 数千次 JSON.parse ⇒ 主线程占死。
//
// 修法（见 useChat 的 `toolResultIndex` computed）：一次遍历建 `callId -> {content,isError}` 索引。
//   本模块把这些**解析规则**抽成纯函数 —— 索引建立与旧实现共用同一套规则，
//   保证「行为完全一致」可被单测钉死，也避免两处平行实现漂移。

/** 工具消息被解析后的展示形态（与旧 `getToolResult` / `isToolError` 语义一一对应） */
export interface ToolResultEntry {
  /** 展示用文本；`null` 表示"还没有结果"（模板据此显示 running 态） */
  content: string | null;
  /** 是否错误结果 */
  isError: boolean;
}

/**
 * 解析一条工具消息的 raw content（JSON 字符串）→ 展示形态。
 *
 * ★ 规则必须与旧 `getToolResult` 的 try/catch 分支**逐条一致**：
 *   1. 空 content            → `{ content: null, isError: false }`
 *   2. 非法 JSON（parse 抛） → `{ content: raw, isError: false }`（原样返回）
 *   3. `parsed.isError` 真   → `{ content: JSON.stringify(parsed, null, 2), isError: true }`
 *   4. `parsed.content` 有 text 块 → `{ content: 各 text 以 \n 连接, isError: false }`
 *      4b. content 是字符串       → `{ content: 原字符串, isError: false }`
 *          （★ 2026-10-21 白屏根修：库里有 tool 消息形如 `{"content":"纯文本"}` —— content
 *           不是数组。旧代码 `"xxx".length` 为真走 `.filter` 直接抛 TypeError，
 *           `toolResultIndex` computed 首次求值即抛 ⇒ `.value` 恒为 undefined ⇒
 *           `isToolResultDone` 报 "reading 'has'" ⇒ 渲染树整棵挂掉 = 白屏。
 *           字符串场景直接把原文当展示文本，非数组对象才落到 stringify。）
 *      4c. 有 content 但无 text 块 → `{ content: JSON.stringify(parsed, null, 2), isError: false }`
 *   5. `parsed` 是字符串     → `{ content: parsed, isError: false }`
 *   6. 其它对象              → `{ content: JSON.stringify(parsed, null, 2), isError: false }`
 */
export function parseToolResultContent(raw: string | null | undefined): ToolResultEntry {
  if (!raw) return { content: null, isError: false };

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 非 JSON：原样返回（旧实现 catch 分支 `return toolMsgContent`）
    return { content: raw, isError: false };
  }

  const isError = !!parsed?.isError;
  if (isError) return { content: JSON.stringify(parsed, null, 2), isError: true };

  if (typeof parsed?.content === 'string') {
    // 4b：历史脏数据形态 `{"content":"纯文本"}`（实测库里有），字符串本身就是展示文本
    return { content: parsed.content, isError: false };
  }
  if (Array.isArray(parsed?.content) && parsed.content.length) {
    const texts = parsed.content
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c?.text)
      .join('\n');
    if (texts) return { content: texts, isError: false };
    // 有 content 块但无文本 → 回退整个 JSON 串（旧实现 `if (texts) return texts;` 落到尾部 stringify）
    return { content: JSON.stringify(parsed, null, 2), isError: false };
  }

  if (typeof parsed === 'string') return { content: parsed, isError: false };
  return { content: JSON.stringify(parsed, null, 2), isError: false };
}

/** 从一组工具消息构建 `callId -> ToolResultEntry` 索引（同 id 保留首个，与 find() 一致） */
export function buildToolResultIndex(
  messages: ReadonlyArray<{ role?: string; toolCallId?: string; content?: string | null }>,
): Map<string, ToolResultEntry> {
  const idx = new Map<string, ToolResultEntry>();
  for (const msg of messages) {
    if (msg.role !== 'tool' || !msg.toolCallId) continue;
    if (idx.has(msg.toolCallId)) continue; // 取第一个（与 Array.find 语义一致）
    idx.set(msg.toolCallId, parseToolResultContentCached(msg.content));
  }
  return idx;
}

// ★★★ 解析结果缓存（2026-10-11，Task #9）：
//   `toolResultIndex` computed 每帧（流式 flush）重建，每帧对**全部历史**工具消息重新
//   JSON.parse —— 实测会话 189 条 tool 消息 ≈ 84KB/帧 × 20 帧/s ≈ 1.7MB/s 纯无效解析。
//   工具消息 content 一旦落库**不再变** → 以 raw 串为键缓存解析结果：
//   首帧后全部命中，每帧重建只剩 Map 赋值（微秒级）。
//   ★ 键是 raw 串本身（值比较），无会话概念 → 跨会话同文本命中也是正确结果（解析是纯函数）。
//   ★ 封顶防泄漏：超上限整体清空，下一帧冷重建一次性回填（成本有界）。
const PARSE_CACHE_MAX = 4096;
const parseCache = new Map<string, ToolResultEntry>();

export function parseToolResultContentCached(raw: string | null | undefined): ToolResultEntry {
  if (!raw) return { content: null, isError: false };
  const hit = parseCache.get(raw);
  if (hit) return hit;
  const entry = parseToolResultContent(raw);
  if (parseCache.size >= PARSE_CACHE_MAX) parseCache.clear();
  parseCache.set(raw, entry);
  return entry;
}

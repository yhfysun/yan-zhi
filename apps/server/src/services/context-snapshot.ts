/**
 * 提示词快照（「查看提示词」的数据源）—— 构建与回填的**唯一定义处**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么要有这个模块（2026-10-02）
 *
 * 此前每一步都把「本轮实际发送的完整 messages」原样 JSON 存进
 * `message.system_prompt_snapshot`，而 messages 是**逐步累积的全量历史**
 * → 单条快照 O(n)、整会话 Σ = **O(n²)**。实测（生产库只读扫描）：
 *   · 快照总 226MB / 1186 条，平均 195KB、最大 546KB；
 *   · 最大那条的组成：messages **73.5%**（1154 条）、tools 4.6%、systemPrompt 4.2%；
 *   · 单会话 deed2862：1156 条消息 → 快照合计 **174.9MB**（会话本体只有几 MB）。
 *
 * ★ 处置（B1-lite，最小风险）：
 *   ① 快照里 **messages 只存 id 引用**（含少量合成消息内联），不再存正文；
 *   ② 读取时由**服务端回填**成旧的完整结构 → **前端 `formatSnapshot` 零改动**；
 *   ③ 每会话只保留最近 N 条快照（调试用的东西，没人回看第 3 步）。
 *   ⇒ 单条 546KB → ~85KB（−84%）；再叠加保留策略，单会话上限从 175MB 收到 ~17MB。
 *
 * ★ 为什么不改前端：改前端 = 更高的回归风险，而这里**服务端回填能完全保持
 *   返回结构不变**。判据与「路径类入参必须有唯一解析出口」同源 ——
 *   把「读什么、怎么拼」收敛到一处，调用方不必知道存储形态变了。
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { db } from '../db.js';

/**
 * 合成消息 id 清单 —— **从 core 再导出**，不再本地各写一份。
 *
 * ★★★ 2026-10-03 收敛：本文件与 core `compress/window.ts` 曾各写一份（内容恰好相同），
 *   属"同一语义两处各写一份"的经典漂移源（本项目已多次吃亏）。
 *   ⇒ 强制从 core 取，新增合成 id 只改 core 一处，写侧（快照）与读侧（前缀比对）自动同步。
 */
export { SYNTHETIC_MESSAGE_IDS, isSyntheticMessageId } from '@yan-zhi/core';
import { SYNTHETIC_MESSAGE_IDS as _SYNTHETIC_IDS } from '@yan-zhi/core';

/** 快照格式版本：1 = 旧（messages 存正文）；2 = 新（messages 只存 id 引用） */
export const SNAPSHOT_VERSION = 2;

/**
 * 每条会话保留的快照条数上限（超出则删最旧的）。
 *
 * ★ 取值依据：快照是**纯调试产物**（只有「查看提示词」读它，模型与业务逻辑都不读）。
 *   200 步 ≈ 一次长任务的完整可回溯范围，而其体积上限 ≈ 200 × 85KB ≈ 17MB/会话。
 *   ★ 与「不删除原文」不冲突：删的只是快照（派生物），`message` 表一字未动。
 */
export const SNAPSHOT_KEEP_PER_CONV = 200;

/**
 * 合成消息 id —— 这些消息**不落库**，必须内联进快照，否则回填时找不到正文。
 * ★ 定义已收敛到 core（顶部再导出），此处仅保留本地别名指向同一份，避免再写第二份。
 */
const SYNTHETIC_MESSAGE_IDS = _SYNTHETIC_IDS;

/** 快照里的一条消息引用：要么是 DB 里的 id，要么是内联的合成消息 */
type SnapshotMsgRef =
  | { id: string }
  | { role: string; content: string; toolCalls?: any };

/**
 * 构建快照要存的 `messages` 字段（**写侧唯一出口**）。
 *
 * 规则：落库消息 → 只留 `{id}`；合成消息（sys / summary）→ 内联 `{role, content}`。
 * 顺序原样保留（回填依赖顺序）。
 */
export function toSnapshotMessages(llmMessages: Array<{ id?: string; role: string; content?: any; toolCalls?: any }>): SnapshotMsgRef[] {
  return llmMessages.map((m) => {
    const id = String(m.id || '');
    if (id && !SYNTHETIC_MESSAGE_IDS.has(id)) return { id };
    return { role: m.role, content: typeof m.content === 'string' ? m.content : '', toolCalls: m.toolCalls };
  });
}

/**
 * 回填快照：把 `messages` 里的 id 引用换回正文（**读侧唯一出口**）。
 *
 * ★ 返回结构与旧格式**完全一致**（role / content / toolCalls），故前端无需改动。
 * ★ 正文按写侧同一规则截断（>4000 字符截到 3997 + '...'），避免"看提示词"时被
 *   单条超长工具输出撑爆页面 —— 与旧实现的展示行为保持一致。
 * ★ 已被删除的消息 → 占位说明，而不是静默少一条（静默少一条会让人误判
 *   "当时没发这条"，与"读了不用"同族的信息失真）。
 */
export function hydrateSnapshot(snapshotJson: string | null | undefined): string | null {
  if (!snapshotJson) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    return snapshotJson; // 旧格式/非 JSON：原样返回（前端 tryParseSnapshot 会兜底）
  }
  if (!parsed || typeof parsed !== 'object') return snapshotJson;

  const refs: any[] = Array.isArray(parsed.messages) ? parsed.messages : [];
  // v1（messages 里已是正文）或没有 messages → 直接返回原串，零开销
  const needsHydration = refs.some((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.role === undefined);
  if (!needsHydration) return snapshotJson;

  const ids = refs.filter((r) => r && typeof r.id === 'string' && r.role === undefined).map((r) => r.id as string);
  const byId = new Map<string, { role: string; content: string; toolCalls: any }>();
  // 分批查（SQLite 变量上限 999，稳妥取 500）
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    if (!slice.length) continue;
    const ph = slice.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT id, role, content, tool_calls_json FROM message WHERE id IN (${ph})`)
      .all(...slice) as any[];
    for (const row of rows) {
      let toolCalls: any;
      if (row.tool_calls_json) {
        try { toolCalls = JSON.parse(row.tool_calls_json); } catch {}
      }
      byId.set(row.id, { role: row.role, content: row.content || '', toolCalls });
    }
  }

  const truncate = (s: string) => (s.length > 4000 ? s.slice(0, 3997) + '...' : s);
  parsed.messages = refs.map((r) => {
    if (!r || typeof r !== 'object') return r;
    if (typeof r.id === 'string' && r.role === undefined) {
      const hit = byId.get(r.id);
      if (!hit) return { role: 'system', content: `[原文已删除或不可见: ${r.id}]` };
      return { role: hit.role, content: truncate(hit.content), toolCalls: hit.toolCalls };
    }
    return { role: r.role, content: truncate(String(r.content || '')), toolCalls: r.toolCalls };
  });
  try {
    return JSON.stringify(parsed);
  } catch {
    return snapshotJson;
  }
}

/**
 * 每会话只保留最近 N 条快照（删最旧的派生物）。
 *
 * ★ 只动 `system_prompt_snapshot` 字段，**不删 message 行** —— 这也是"非破坏性"
 *   （对齐 Roo Code 的截断只打标记、不删原文）。快照没了只是"看不了当步提示词"，
 *   消息历史、LLM 行为、前端渲染全部不受影响。
 */
export function pruneOldSnapshots(conversationId: string, keep = SNAPSHOT_KEEP_PER_CONV): number {
  const info = db
    .prepare(
      `UPDATE message SET system_prompt_snapshot = NULL
       WHERE conversation_id = ?
         AND system_prompt_snapshot IS NOT NULL
         AND id NOT IN (
           SELECT id FROM message
           WHERE conversation_id = ? AND system_prompt_snapshot IS NOT NULL
           ORDER BY created_at DESC LIMIT ?
         )`,
    )
    .run(conversationId, conversationId, keep) as any;
  return info?.changes ?? 0;
}
import { TOKEN_DEAD_PLATFORM_IDS_SQL } from './token-pool.js';

// 会话标题自动生成（2026-10-11）—— 首个任务 completed 时由 LLM 概括对话内容生成短标题。
//
// ★ 为什么挂服务端而不是前端：模型选择、chatViaRow（统一出口）、CAS 写库都在服务端；
//   前端只负责收 conversation:title 事件刷新列表（无需刷新页面、无需轮询）。
//
// ★ 防覆盖体系（三道闸）：
//   ① title_source 判据：只有 'auto'（前端新建未生成过）才生成；'llm'（已生成过）、
//      'user'（用户手动改名）、NULL（存量会话，行为不变）一律跳过 —— 避免老会话标题突变。
//   ② CAS 条件写库：UPDATE ... WHERE id=? AND title_source='auto' —— 生成期间用户若改名
//      （PATCH 强制置 'user'），WHERE 不命中即丢弃，天然防竞态。
//   ③ 内存防抖 Set：同会话并发完成只放行第一个（防多次任务快速完成时重复调用 LLM）。
//
// ★ 失败语义：LLM 调用失败 / 超时 / 返回空 → 静默保留原标题，title_source 仍 'auto'
//   → 下次任务完成自动重试，无需额外交互或状态。
//
// ★ 依赖方向：只 import db / llm-call / logger，**不 import llm-task-manager**
//   （后者 import 本模块 —— 回推事件用下面的回调注入，避免循环依赖）。

import { db } from '../db.js';
import { chatViaRow, type PlatformModelRow } from './llm-call.js';
import { createLogger } from './logger.js';

const logger = createLogger('conversation-title');

/** 素材与调用参数（小而快：单条消息截 300 字、总量截 2000 字，标题再截 32 字兜底） */
const MAX_MESSAGES = 6;
const MAX_MSG_CHARS = 300;
const MAX_PROMPT_CHARS = 2000;
const MAX_TITLE_CHARS = 32;
const CALL_TIMEOUT_MS = 20_000;

/** 顶层注入的事件回推回调（由 llm-task-manager 启动时安装；未安装时静默跳过） */
let notifyTitleChanged: ((conversationId: string, title: string) => void) | null = null;

/** 由 llm-task-manager 在启动时安装（避免本模块反向 import 造成循环依赖） */
export function setTitleChangeNotifier(fn: (conversationId: string, title: string) => void): void {
  notifyTitleChanged = fn;
}

/** 该会话是否允许 LLM 生成标题（唯一判据：title_source === 'auto'） */
export function shouldGenerateTitle(conversationId: string): boolean {
  try {
    const row = db.prepare('SELECT title_source FROM conversation WHERE id = ?').get(conversationId) as any;
    return row?.title_source === 'auto';
  } catch {
    return false;
  }
}

/** 从消息行收集生成素材：user/assistant 正文，单条截断、总量截断 */
export function collectTitleMaterial(rows: Array<{ role: string; content: string | null }>): string {
  const parts: string[] = [];
  let total = 0;
  for (const r of rows) {
    if (parts.length >= MAX_MESSAGES) break;
    const text = (r.content || '').trim();
    if (!text || r.role !== 'user' && r.role !== 'assistant') continue;
    const clipped = text.slice(0, MAX_MSG_CHARS);
    if (total + clipped.length > MAX_PROMPT_CHARS) break;
    parts.push(`${r.role}: ${clipped}`);
    total += clipped.length;
  }
  return parts.join('\n');
}

/** 清洗模型输出：去引号/换行/前后缀词、trim、截断；无有效内容返回 null */
export function sanitizeTitle(raw: string): string | null {
  let s = String(raw || '').trim();
  // 常见污染：模型包引号、带 "标题：" / "Title:" 前缀、多行输出
  s = s.replace(/^["'「『]|["'」』]$/g, '').trim();
  s = s.replace(/^(标题|Title)\s*[:：]\s*/i, '').trim();
  s = s.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  if (!s) return null;
  return s.slice(0, MAX_TITLE_CHARS);
}

/** 生成用的模型行：优先任务自带模型（正在用的必然可用），查不到回退用户默认模型 */
function loadModelRow(userId: string, platformId?: string, modelId?: string): PlatformModelRow | null {
  if (platformId && modelId) {
    const row = db.prepare(
      `SELECT m.id, m.model_id, p.id AS pid, p.api_url, p.api_key_enc, p.protocol, p.headers_json
       FROM model m JOIN platform p ON p.id = m.platform_id
       WHERE m.id = ? AND m.platform_id = ? AND m.user_id = ?`,
    ).get(modelId, platformId, userId) as PlatformModelRow | undefined;
    if (row) return row;
  }
  // 回退：与 memory-dreaming.findDefaultModel 同口径（可见模型 + 启用平台，默认优先）；
  // Token 池全停用的平台整平台剔除（候选面过滤，选了必失败不如不选）
  return (
    db.prepare(
      `SELECT m.id, m.model_id, p.id AS pid, p.api_url, p.api_key_enc, p.protocol, p.headers_json
       FROM model m JOIN platform p ON p.id = m.platform_id
       WHERE m.user_id = ? AND m.enabled = 1 AND m.type = 'llm' AND m.visible = 1 AND p.llm_enabled = 1
         AND p.id NOT IN (${TOKEN_DEAD_PLATFORM_IDS_SQL})
       ORDER BY CASE
         WHEN m.is_default = 1 AND p.is_builtin = 0 THEN 0
         WHEN m.is_default = 1 THEN 1
         ELSE 2
       END, m.created_at ASC
       LIMIT 1`,
    ).get(userId) as PlatformModelRow | undefined
  ) || null;
}

/** 内存防抖：同会话并发 completed 只放行第一个 */
const generating = new Set<string>();

/**
 * 首个任务完成时尝试生成标题（fire-and-forget，绝不抛错 —— 标题是锦上添花）。
 * 判据不满足 / 无素材 / 无模型 / LLM 失败 / CAS 不命中 → 全部静默返回。
 */
export async function generateTitleFor(conversationId: string, userId: string,
  taskModel?: { platformId?: string; modelId?: string }): Promise<void> {
  try {
    if (!shouldGenerateTitle(conversationId)) return;
    if (generating.has(conversationId)) return;
    generating.add(conversationId);
    try {
      // 素材：会话全部消息里取前几条（ASC，用户首轮意图 + 模型首轮回应最有代表性）
      const rows = db.prepare(
        'SELECT role, content FROM message WHERE conversation_id = ? ORDER BY created_at ASC, id ASC',
      ).all(conversationId) as Array<{ role: string; content: string | null }>;
      const material = collectTitleMaterial(rows);
      if (!material) return;

      const model = loadModelRow(userId, taskModel?.platformId, taskModel?.modelId);
      if (!model) return;

      const { content } = await chatViaRow(model, [
        { role: 'system', content: '你是会话标题生成器。根据对话内容生成一个不超过16个字的中文标题，概括用户要做的事。只输出标题本身，不要任何解释、引号或标点结尾。' },
        { role: 'user', content: material.slice(0, MAX_PROMPT_CHARS) },
      ], {
        maxTokens: model.protocol === 'anthropic' ? 64 : undefined,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });

      const title = sanitizeTitle(content);
      if (!title) return;

      // ★ CAS 写库：只有仍是 'auto' 才落（生成期间用户改名 → 'user' → 不命中即丢弃）
      const r = db.prepare(
        `UPDATE conversation SET title = ?, title_source = 'llm', updated_at = ? WHERE id = ? AND title_source = 'auto'`,
      ).run(title, Date.now(), conversationId);
      if (r.changes > 0) {
        logger.info(`[title] 会话 ${conversationId} 标题已生成: ${title}`);
        try { notifyTitleChanged?.(conversationId, title); } catch { /* 回推失败不影响 */ }
      }
    } finally {
      generating.delete(conversationId);
    }
  } catch (e: any) {
    // 静默：标题生成是尽力而为，失败保留原标题（title_source 仍 auto，下次任务完成重试）
    logger.info(`[title] 会话 ${conversationId} 标题生成跳过: ${e?.message || e}`);
  }
}

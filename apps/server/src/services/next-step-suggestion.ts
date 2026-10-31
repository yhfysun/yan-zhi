import { db } from '../db.js';
import { chatViaRow } from './llm-call.js';
import { loadModelRow } from './model-row.js';
import { createLogger } from './logger.js';

const logger = createLogger('next-step-suggestion');

// 输入框「下一步建议」（2026-10-31）—— 会话空闲时预测用户下一句，前端显示为 ghost 文本，
// Tab 填入输入框、Enter 发送（对齐 Claude Code 的输入框预测）。
//
// ★ 与 conversation-title 同构：素材从 DB 取、模型走 chatViaRow、失败静默、绝不抛给路由。
// ★ 成本控制三道闸：
//   ① 指纹缓存：同一「最后一条消息 id」只真正调一次 LLM（TTL 5 分钟）；
//   ② 并发去重：同会话 in-flight 复用同一个 Promise；
//   ③ 前端只在「流式结束且输入框为空」时请求（见 ChatInputArea 的 maybePrefetch）。
// ★ 不做跨会话推荐：建议必须紧扣当前对话（任务编号 / 文件 / 待办），泛泛的句子没有价值。

/** 素材窗口：最近 24 条原始消息里取 8 条有效正文，单条 400 字、总量 2500 字 */
const MAX_RAW_ROWS = 24;
const MAX_MESSAGES = 8;
const MAX_MSG_CHARS = 400;
const MAX_PROMPT_CHARS = 2500;
const MAX_SUGGESTION_CHARS = 30;
const CALL_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 200;

interface CacheEntry {
  /** 生成时最后一条消息 id —— 新消息到达即失效，保证建议永远基于最新上下文 */
  fingerprint: string;
  text: string | null;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

/** 只保留 user/assistant 的正文行：工具调用轮的 assistant 常为空 content，带不进去上下文 */
export function collectSuggestionMaterial(rows: Array<{ role: string; content: string | null }>): string {
  const parts: string[] = [];
  let total = 0;
  // 从尾部往前取：最新几轮才决定「下一步」；再 reverse 成时间顺序喂给模型
  for (let i = rows.length - 1; i >= 0 && parts.length < MAX_MESSAGES; i -= 1) {
    const r = rows[i];
    const text = (r.content || '').trim();
    if (!text || (r.role !== 'user' && r.role !== 'assistant')) continue;
    const clipped = text.slice(0, MAX_MSG_CHARS);
    if (total + clipped.length > MAX_PROMPT_CHARS) break;
    parts.push(`${r.role === 'user' ? '用户' : '助手'}: ${clipped}`);
    total += clipped.length;
  }
  return parts.reverse().join('\n');
}

/** 清洗模型输出：去引号/前缀/多行/结尾标点；「无」与空串一律视为没有建议 */
export function sanitizeSuggestion(raw: string): string | null {
  let s = String(raw || '').trim();
  s = s.replace(/^["'「『“”]|["'」』“”]$/g, '').trim();
  s = s.replace(/^(建议|下一步|下一步建议|Next)\s*[:：]\s*/i, '').trim();
  s = s.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  s = s.replace(/[。；;，,]+$/, '').trim();
  if (!s || /^(无|none|n\/a|null)$/i.test(s)) return null;
  return s.slice(0, MAX_SUGGESTION_CHARS);
}

function readLatestRows(conversationId: string): Array<{ id: string; role: string; content: string | null }> {
  return db.prepare(
    `SELECT id, role, content FROM message WHERE conversation_id = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).all(conversationId, MAX_RAW_ROWS) as Array<{ id: string; role: string; content: string | null }>;
}

function putCache(conversationId: string, entry: CacheEntry): void {
  cache.delete(conversationId);
  cache.set(conversationId, entry);
  // Map 迭代按插入序：超限时删最早的一批，避免长期运行常驻内存
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const SYSTEM_PROMPT = [
  '你是聊天输入框的「下一步建议」生成器。阅读对话最后的内容，预测用户接下来最可能想输入的一句话。',
  '要求：',
  '1. 用用户口吻的祈使句或问句，不超过 20 个汉字；',
  '2. 必须紧扣对话最后在说的事情（任务名、编号、文件、待办、未完成的步骤），不要泛泛而谈；',
  '3. 只输出这一句话，不要引号、不要解释、不要「建议：」之类的前缀、不要结尾句号；',
  '4. 若对话已自然结束且无事可做，只输出「无」。',
].join('\n');

export interface NextStepResult {
  suggestion: string | null;
  /** 是否命中缓存（前端只用于调试/观测，不参与展示逻辑） */
  cached: boolean;
}

async function generate(rows: Array<{ id: string; role: string; content: string | null }>, userId: string,
  opts?: { platformId?: string; modelId?: string }): Promise<string | null> {
  const material = collectSuggestionMaterial(rows);
  if (!material) return null;

  const model = loadModelRow(userId, opts?.platformId, opts?.modelId);
  if (!model) return null;

  const { content } = await chatViaRow(model, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: material.slice(0, MAX_PROMPT_CHARS) },
  ], {
    maxTokens: 64,
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  return sanitizeSuggestion(content);
}

/**
 * 取当前会话的下一步建议（fire-and-forget 的反面：路由等待结果，但任何异常都收敛为 null）。
 * 判据不满足 / 无素材 / 无模型 / LLM 失败 → 一律返回空建议，绝不抛错。
 */
export async function suggestNextFor(conversationId: string, userId: string,
  opts?: { platformId?: string; modelId?: string }): Promise<NextStepResult> {
  try {
    const latest = readLatestRows(conversationId);
    if (!latest.length) return { suggestion: null, cached: false };
    const fingerprint = latest[0].id;

    const hit = cache.get(conversationId);
    if (hit && hit.fingerprint === fingerprint && Date.now() - hit.at < CACHE_TTL_MS) {
      return { suggestion: hit.text, cached: true };
    }

    const running = inflight.get(conversationId);
    if (running) return { suggestion: await running, cached: false };

    const job = (async () => {
      const text = await generate(latest, userId, opts);
      putCache(conversationId, { fingerprint, text, at: Date.now() });
      return text;
    })();
    inflight.set(conversationId, job);
    try {
      return { suggestion: await job, cached: false };
    } finally {
      inflight.delete(conversationId);
    }
  } catch (e: any) {
    logger.info(`[suggest] 会话 ${conversationId} 下一步建议跳过: ${e?.message || e}`);
    return { suggestion: null, cached: false };
  }
}

/** 测试用：清空缓存与在途表 */
export function __resetSuggestCache(): void {
  cache.clear();
  inflight.clear();
}

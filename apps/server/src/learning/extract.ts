// 学习模式 · 错误本自动抽取（§3.3 错误本 / §2.4 语法归因）。
//
// 挂点：recordTaskProgress（任务收尾唯一出口，与记忆蒸馏 maybeDistillStaleMemory 同位）——
// 教学智能体的会话正常完成时，fire-and-forget 抽取本轮纠错表达入错误本（最多 3 条）。
// fail-safe：任何失败只 warn，绝不影响任务收尾。
import { db } from '../db.js';
import { loadModelRow } from '../services/model-row.js';
import { chatViaRow } from '../services/llm-call.js';
import { addError } from './service.js';
import { LEARNING_AGENT_ID } from '../builtin-learning-agents.js';

export type ParsedCorrection = { wrong: string; right: string; reason?: string; grammarPoint?: string };

/** 宽松解析模型回复里的纠错数组（容忍代码块围栏/前后废话）；非法项静默丢弃 */
export function parseCorrections(raw: string): ParsedCorrection[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    const out: ParsedCorrection[] = [];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const wrong = String(o.wrong || '').trim();
      const right = String(o.right || '').trim();
      if (!wrong || !right || wrong === right) continue;
      out.push({
        wrong, right,
        reason: String(o.reason || '').trim() || undefined,
        grammarPoint: String(o.grammarPoint || o.grammar_point || '').trim() || undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 教学会话收尾时抽取纠错入错误本。取会话最近 8 条消息（够覆盖最后一轮教学），
 * LLM 只输出 JSON 数组；失败静默（fire-and-forget）。
 */
export async function extractLearningErrorsFromTask(task: {
  agentId?: string | null; userId: string; conversationId: string;
}, summary: string): Promise<void> {
  if (task.agentId !== LEARNING_AGENT_ID || !task.userId || !task.conversationId) return;
  try {
    const model = loadModelRow(task.userId);
    if (!model) return;
    const rows = db.prepare(
      "SELECT role, content FROM message WHERE conversation_id = ? AND role IN ('user','assistant') ORDER BY created_at DESC, id DESC LIMIT 8",
    ).all(task.conversationId) as Array<{ role: string; content: string | null }>;
    const dialogue = rows.reverse()
      .map((r) => `${r.role === 'user' ? '用户' : '陪练'}：${String(r.content || '').slice(0, 500)}`)
      .join('\n').slice(-4000);
    if (!dialogue.trim()) return;
    const { content } = await chatViaRow(model, [
      { role: 'system', content: '你是英语教学记录员。只输出 JSON 数组，不要解释、不要代码块。' },
      { role: 'user', content: `下面是一段英语陪练对话（可能含任务摘要）。从中找出**陪练纠正过的**用户英语错误（说错的句子/用词），最多 3 条；没有就输出 []。
每项格式：{"wrong":"用户原句","right":"正确说法","reason":"一句原因（中文）","grammarPoint":"语法点 id（如 g_present_perfect，不确定给空字符串）"}

任务摘要：${summary.slice(0, 200)}

对话：
${dialogue}` },
    ], { maxTokens: 800, signal: AbortSignal.timeout(60_000) });
    const corrections = parseCorrections(content).slice(0, 3);
    for (const c of corrections) {
      addError(task.userId, { wrong: c.wrong, right: c.right, reason: c.reason, grammarPoint: c.grammarPoint, sourceConv: task.conversationId });
    }
  } catch { /* 抽取失败不影响收尾（fire-and-forget） */ }
}

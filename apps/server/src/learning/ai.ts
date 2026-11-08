// 学习模式 · LLM 辅助（AI 收词 / 点词释义）。一次性调用：loadModelRow + chatViaRow，
// 失败如实抛错（前端展示指引），不静默吞——「调用了 ≠ 成功」。
import { db } from '../db.js';
import { loadModelRow } from '../services/model-row.js';
import { chatViaRow } from '../services/llm-call.js';
import type { BuiltinWordEntry } from './data/wordbooks.js';

function pickModel(userId: string) {
  const model = loadModelRow(userId);
  if (!model) throw new Error('没有可用的 LLM（请先在「模型平台」配置并启用一个对话模型）');
  return model;
}

/** 宽松取 JSON：从模型回复里抓第一个 JSON 数组（容忍 ```json 围栏与前后废话）。导出供单测钉行为 */
export function extractJsonArray(raw: string): unknown[] | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 粘贴导入 AI 收词：从英文文章/词列表抽词并补齐音标/中文释义/例句（方案 §2.3-词书来源三档） */
export async function aiExtractWords(userId: string, text: string): Promise<BuiltinWordEntry[]> {
  const model = pickModel(userId);
  const prompt = `从下面的英文文本中挑出值得学习的词汇（生词、高频考试词、地道表达），8~20 个。
只输出 JSON 数组，不要任何解释或代码块。每项格式：
{"word":"英文单词或短语","phonetic":"音标（查不到给空字符串）","gloss":"中文释义（词性+意思，简洁）","example":"一个含该词的英文例句"}

英文文本：
${text.slice(0, 6000)}`;
  const { content } = await chatViaRow(model, [
    { role: 'system', content: '你是英语词汇编辑。严格按用户要求只输出 JSON 数组，不要输出任何其他文字、不要包代码块。' },
    { role: 'user', content: prompt },
  ], { maxTokens: 2000, signal: AbortSignal.timeout(120_000) });
  const arr = extractJsonArray(content);
  if (!arr) throw new Error('AI 返回格式异常，请重试或改用手动录入（单词 | 释义）');
  const out: BuiltinWordEntry[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Record<string, unknown>;
    const word = String(w.word || '').trim();
    const gloss = String(w.gloss || '').trim();
    if (!word || !gloss) continue;
    out.push({ word, gloss, phonetic: String(w.phonetic || '').trim() || undefined, example: String(w.example || '').trim() || undefined });
  }
  if (!out.length) throw new Error('AI 没有抽出有效词条，请换一段文本或手动录入');
  return out;
}

/** 阅读页点词查询：音标/释义/例句（查不到或无 LLM 时抛错，前端降级为手动录入） */
export async function aiLookupWord(userId: string, word: string): Promise<BuiltinWordEntry> {
  const model = pickModel(userId);
  const { content } = await chatViaRow(model, [
    { role: 'system', content: '你是英语词典。只输出一个 JSON 对象，不要解释、不要代码块。' },
    { role: 'user', content: `给出单词「${word.trim()}」的查询结果，格式：{"word":"...","phonetic":"音标","gloss":"中文释义（词性+意思）","example":"一个简短英文例句"}` },
  ], { maxTokens: 300, signal: AbortSignal.timeout(60_000) });
  const text = content.trim().replace(/^```(?:json)?|```$/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      const w = String(obj.word || word).trim();
      const gloss = String(obj.gloss || '').trim();
      if (w && gloss) {
        return { word: w, gloss, phonetic: String(obj.phonetic || '').trim() || undefined, example: String(obj.example || '').trim() || undefined };
      }
    } catch { /* 落到下面抛错 */ }
  }
  throw new Error('词典查询失败，请稍后重试或手动填写释义');
}

/** 会话结束后抽取错误本（P1 预留接口：给任务完成钩子调用；本期先只提供服务函数） */
export function collectDb(userId: string) {
  return db.prepare('SELECT COUNT(*) AS c FROM learning_error WHERE user_id = ?').get(userId) as { c: number };
}

// 记忆服务 —— 记忆子系统的单一事实来源：检索/注入/写入/压缩前抢救。
// 参考 OpenClaw（pre-compaction flush、标识符保全）与 Harness（recency×relevancy 检索、token 预算）设计。
// 分层：工作记忆=会话消息；短期记忆=daily/session；长期记忆=agent/profile + Dreaming 提拔。
import type { Message, Platform, Model } from '@yan-zhi/shared';
import { estimateTokens } from '@yan-zhi/shared';
import { LlmClient } from '@yan-zhi/core';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { embedText } from './ollama-embed.js';

// ── 向量工具 ──

export function bytesToVec(b: Uint8Array | Buffer | null): number[] | null {
  if (!b) return null;
  try { return Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)); } catch { return null; }
}
export function vecToBytes(v: number[] | null): Buffer | null {
  if (!v || !v.length) return null;
  return Buffer.from(new Float32Array(v).buffer);
}
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * 解析抽取类 LLM 的 JSON 输出，兼容三种形态：
 * - JSON 数组（prompt 期望的形态）；
 * - {"items":[...]} 包装对象；
 * - 单对象 {"type":"session","content":"..."} / {"id":"...","action":"promote",...}——
 *   部分模型在 response_format=json_object 模式下会返回单个对象而非数组
 *   （此前只认数组，单对象被静默丢弃，导致抽取结果恒为 0 条）。
 * 解析失败时再尝试从文本中截取 [...] / {...} 片段。
 */
export function parseExtractedItems(text: string): any[] {
  const t = String(text || '').trim();
  if (!t) return [];
  const fromObject = (obj: any): any[] | null => {
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj?.items)) return obj.items;
    if (obj && typeof obj === 'object'
      && (typeof obj.content === 'string' || (obj.id && typeof obj.action === 'string'))) return [obj];
    return null;
  };
  try {
    const arr = fromObject(JSON.parse(t));
    if (arr) return arr;
  } catch { /* 尝试从文本截取 */ }
  const m = t.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) return arr;
    } catch { /* 忽略 */ }
  }
  const om = t.match(/\{[\s\S]*\}/);
  if (om) {
    try {
      const arr = fromObject(JSON.parse(om[0]));
      if (arr) return arr;
    } catch { /* 忽略 */ }
  }
  return [];
}

// ── 注入配置（app_config，仿 ollama-embed.ts 模式） ──

export interface MemoryInjectionConfig {
  enabled: boolean;
  tokenBudget: number;
  topK: number;
  weights: { rel: number; rec: number; type: number };
  taus: { session: number; daily: number; agent: number; profile: number };
}

const DEFAULT_INJECTION_CONFIG: MemoryInjectionConfig = {
  enabled: true,
  tokenBudget: 600,
  topK: 12,
  weights: { rel: 0.55, rec: 0.30, type: 0.15 },
  taus: { session: 3, daily: 5, agent: 30, profile: 30 },
};

/** 向量检索的最小相关性：余弦低于此值视为主题无关，不注入 */
const MIN_REL = 0.25;

export function getInjectionConfig(): MemoryInjectionConfig {
  try {
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('memory_injection_config') as any;
    if (!row?.value) return { ...DEFAULT_INJECTION_CONFIG };
    const parsed = JSON.parse(row.value);
    return {
      ...DEFAULT_INJECTION_CONFIG,
      ...parsed,
      weights: { ...DEFAULT_INJECTION_CONFIG.weights, ...(parsed.weights || {}) },
      taus: { ...DEFAULT_INJECTION_CONFIG.taus, ...(parsed.taus || {}) },
    };
  } catch { return { ...DEFAULT_INJECTION_CONFIG }; }
}

export function setInjectionConfig(cfg: Partial<MemoryInjectionConfig>): MemoryInjectionConfig {
  const merged = getInjectionConfig();
  const next: MemoryInjectionConfig = {
    ...merged,
    ...cfg,
    weights: { ...merged.weights, ...(cfg.weights || {}) },
    taus: { ...merged.taus, ...(cfg.taus || {}) },
  };
  db.prepare('INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)')
    .run('memory_injection_config', JSON.stringify(next), Date.now());
  return next;
}

// ── embedding 进程内缓存（避免每次检索全表扫描 + 每行反序列化） ──

interface CachedMemItem {
  id: string; type: string; agentId: string | null; content: string;
  vec: number[] | null; createdAt: number; lastUsedAt: number; useCount: number;
  metadata: any;
}
const embCache = new Map<string, { items: CachedMemItem[]; loadedAt: number }>();

export function bumpMemoryCache(userId: string): void {
  embCache.delete(userId);
}

function loadCachedItems(userId: string): CachedMemItem[] {
  const hit = embCache.get(userId);
  if (hit) return hit.items;
  const rows = db.prepare(
    `SELECT id, agent_id, content, embedding, metadata_json, created_at, last_used_at, type,
            COALESCE(use_count, 0) AS use_count
     FROM memory WHERE user_id = ?`,
  ).all(userId) as any[];
  const items: CachedMemItem[] = rows.map((r) => ({
    id: r.id,
    // 归一化：DB 中 profile = type='agent' 且 agent_id 为空（routes/list 的维度映射约定）
    type: (r.type || 'agent') === 'agent' && !r.agent_id ? 'profile' : (r.type || 'agent'),
    agentId: r.agent_id || null,
    content: r.content || '',
    vec: bytesToVec(r.embedding),
    createdAt: r.created_at || 0,
    lastUsedAt: r.last_used_at || 0,
    useCount: r.use_count || 0,
    metadata: (() => { try { return JSON.parse(r.metadata_json || '{}'); } catch { return {}; } })(),
  }));
  embCache.set(userId, { items, loadedAt: Date.now() });
  return items;
}

// ── 检索：recency × relevancy × type 加权 + 去重 + token 预算 ──

/** 简易分词：CJK 二元组 + 拉丁词（供 LIKE 降级与词面叠加分） */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const latin = text.toLowerCase().match(/[a-z0-9_\-]{2,}/g) || [];
  tokens.push(...latin);
  const cjk = text.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seg of cjk) {
    for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
  }
  return [...new Set(tokens)];
}

function typeBaseScore(type: string): number {
  return type === 'profile' ? 1.0 : type === 'agent' ? 0.9 : type === 'daily' ? 0.6 : 0.5;
}

export interface RetrievedMemory {
  id: string; type: string; agentId: string | null; content: string;
  score: number; rel: number; rec: number; typeBase: number;
  createdAt: number; lastUsedAt: number;
}

export interface RetrieveOptions {
  tokenBudget?: number;
  topK?: number;
  conversationId?: string;
  /** 返回分项得分（调试端点用）；注入路径只需 content */
  withScores?: boolean;
}

/**
 * 检索与 query 相关的记忆：
 * 候选 = profile 全局 + 当前 agent 的 agent 记忆 + daily/session 全局；
 * session 优先当前会话，非本会话的 session 降权（typeBase × 0.5）。
 */
export async function retrieveRelevantMemories(
  userId: string,
  agentId: string | null,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedMemory[]> {
  const cfg = getInjectionConfig();
  if (!cfg.enabled) return [];
  const q = String(query || '').trim();
  if (!q) return [];
  const topK = Math.min(opts.topK ?? cfg.topK, 30);
  const budget = opts.tokenBudget ?? cfg.tokenBudget;
  const now = Date.now();

  const all = loadCachedItems(userId);
  // 候选过滤：profile（type=agent 且 agent_id 为空）全局可见；agent 记忆按归属；daily/session 全局
  const candidates = all.filter((m) => {
    if (m.type === 'daily' || m.type === 'session') return true;
    if (m.type === 'profile') return true;
    if (m.type === 'agent') return agentId ? (m.agentId === agentId || m.agentId === null) : m.agentId === null;
    return false;
  });
  if (!candidates.length) return [];

  const qTokens = tokenize(q);
  const qVec = await embedText(q).catch(() => null);

  const scored: RetrievedMemory[] = candidates.map((m): RetrievedMemory | null => {
    // relevancy
    let rel: number;
    if (qVec && m.vec) {
      rel = Math.max(0, Math.min(1, cosine(qVec, m.vec)));
    } else {
      // 降级：词面命中率
      const hits = qTokens.filter((t) => m.content.toLowerCase().includes(t)).length;
      rel = 0.3 + 0.4 * (qTokens.length ? hits / qTokens.length : 0);
    }
    // 相关性下限：向量余弦过低 = 主题无关；降级模式下词面零命中 = 无关。
    // 不过滤会让完全无关的查询也注入 top-K 噪声记忆。
    if (qVec && m.vec) {
      if (rel < MIN_REL) return null;
    } else {
      const hits = qTokens.filter((t) => m.content.toLowerCase().includes(t)).length;
      if (hits === 0) return null;
    }
    // 词面叠加分（弱信号，最多 +0.1，帮助向量模型区分同义条目）
    const hits = qTokens.filter((t) => m.content.toLowerCase().includes(t)).length;
    if (qTokens.length && hits > 0) rel = Math.min(1, rel + 0.1 * Math.min(hits / qTokens.length, 1));

    // recency
    const tau = (cfg.taus as any)[m.type] ?? 30;
    const ageDays = Math.max(0, (now - Math.max(m.lastUsedAt, m.createdAt)) / 86_400_000);
    const rec = Math.exp(-ageDays / tau);

    // type base + session 会话降权
    let tb = typeBaseScore(m.type);
    if (m.type === 'session' && opts.conversationId && m.metadata?.conversationId !== opts.conversationId) {
      tb *= 0.5;
    }

    const score = cfg.weights.rel * rel + cfg.weights.rec * rec + cfg.weights.type * tb;
    return {
      id: m.id, type: m.type, agentId: m.agentId, content: m.content,
      score, rel, rec, typeBase: tb,
      createdAt: m.createdAt, lastUsedAt: m.lastUsedAt,
    };
  }).filter((x): x is RetrievedMemory => x !== null);

  scored.sort((a, b) => b.score - a.score);

  // 去重：两两余弦 > 0.92 保留分高者；再按 content 精确去重
  const picked: RetrievedMemory[] = [];
  const pickedVecs: number[][] = [];
  const seenContent = new Set<string>();
  const vecById = new Map(all.map((m) => [m.id, m.vec]));
  for (const item of scored) {
    if (picked.length >= topK) break;
    const key = item.content.trim();
    if (seenContent.has(key)) continue;
    const v = vecById.get(item.id);
    if (v && pickedVecs.some((pv) => cosine(v, pv) > 0.92)) continue;
    seenContent.add(key);
    if (v) pickedVecs.push(v);
    picked.push(item);
  }

  // token 预算裁剪（含格式行开销），profile/agent 软配额 60%
  const longTermQuota = Math.floor(budget * 0.6);
  let longTermUsed = 0;
  let used = estimateTokens('## 相关记忆\n');
  const result: RetrievedMemory[] = [];
  for (const item of picked) {
    const lineTokens = estimateTokens(formatOne(item));
    if (used + lineTokens > budget) continue;
    if (item.type === 'profile' || item.type === 'agent') {
      if (longTermUsed + lineTokens > longTermQuota) continue;
      longTermUsed += lineTokens;
    }
    used += lineTokens;
    result.push(item);
  }
  return result;
}

function typeLabel(type: string): string {
  return type === 'profile' ? '画像' : type === 'agent' ? '长期' : type === 'daily' ? '每日' : '会话';
}

function formatOne(item: RetrievedMemory): string {
  const agentTag = item.type === 'agent' && item.agentId ? `|${item.agentId.slice(0, 8)}` : '';
  const dateTag = item.type === 'daily' && item.createdAt
    ? `|${new Date(item.createdAt).toISOString().slice(0, 10)}` : '';
  return `[${typeLabel(item.type)}${agentTag}${dateTag}] ${item.content}`;
}

/** 生成注入 system prompt 的紧凑记忆段 */
export function formatMemoryContext(items: RetrievedMemory[]): string {
  if (!items.length) return '';
  return '## 相关记忆（系统自动检索的历史信息，仅供参考；若与用户当前说法冲突，以用户为准）\n'
    + items.map((m) => formatOne(m)).join('\n');
}

/** 命中反馈：刷新 last_used_at、use_count+1（recency 闭环） */
export function bumpMemoryUsage(ids: string[]): void {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  try {
    db.prepare(`UPDATE memory SET last_used_at = ?, use_count = COALESCE(use_count, 0) + 1 WHERE id IN (${placeholders})`)
      .run(Date.now(), ...ids);
    // 缓存中的条目数未变，不整体失效；只刷 useCount/lastUsedAt 不影响排序正确性（下次加载自然刷新）
  } catch {}
}

// ── 统一写入：去重 / 冲突标记 / daily 按天合并 / session 带会话 ──

export interface MemoryWriteItem {
  type: 'profile' | 'agent' | 'session' | 'daily';
  content: string;
  tags?: string[];
  metadata?: Record<string, any>;
  /** 与既有记忆语义冲突时，被取代的旧记忆 id（LLM 抽取标注） */
  conflictsWith?: string;
}

export interface WriteResult {
  created: number; updated: number; superseded: number; merged: number;
}

const DEDUP_THRESHOLD = 0.92;

/**
 * 统一写入记忆。规则：
 * - daily：按自然天 + agent 归属合并（当天已有则追加）；
 * - 其余类型：与同 user 同 type 既有记忆余弦 > 0.92 → 更新原行（视为同一事实的复述）；
 * - conflictsWith 非空 → 新行写入 + 旧行 metadata 打 superseded_by 标记；
 * - session 统一带 metadata.conversationId。
 */
export async function writeMemoryItems(
  userId: string,
  agentId: string | null,
  items: MemoryWriteItem[],
  _source?: string,
): Promise<WriteResult> {
  const result: WriteResult = { created: 0, updated: 0, superseded: 0, merged: 0 };
  const ts = Date.now();
  const date = new Date().toISOString().slice(0, 10);

  for (const item of items) {
    const content = String(item.content || '').trim();
    if (!content) continue;
    const type = (['profile', 'agent', 'session', 'daily'] as const).includes(item.type) ? item.type : 'agent';

    // daily：按天 + agent 归属合并（尊重调用方指定的日期，缺省今天）
    if (type === 'daily') {
      const day = String((item.metadata as any)?.date || date);
      const existing = db.prepare(
        `SELECT * FROM memory WHERE user_id = ? AND type = 'daily'
         AND (? IS NULL OR agent_id IS NULL OR agent_id = ?) AND metadata_json LIKE ?
         ORDER BY last_used_at DESC LIMIT 1`,
      ).all(userId, agentId, agentId, `%"date":"${day}"%`)[0] as any;
      const meta = { ...(item.metadata || {}), date: day };
      if (existing) {
        const mergedContent = existing.content.endsWith('\n')
          ? existing.content + content : existing.content + '\n' + content;
        const emb = vecToBytes(await embedText(mergedContent).catch(() => null));
        db.prepare('UPDATE memory SET content = ?, embedding = ?, last_used_at = ? WHERE id = ?')
          .run(mergedContent, emb, ts, existing.id);
        result.merged++;
        continue;
      }
      insertMemory(userId, agentId, content, item.tags, meta, type);
      result.created++;
      continue;
    }

    // 语义去重：与同 user 同 type 既有记忆比余弦（profile 落库为 'agent'+空 agent_id）
    const emb = await embedText(content).catch(() => null);
    const storeType = type === 'profile' ? 'agent' : type;
    if (emb) {
      const sameType = db.prepare(
        type === 'profile'
          ? `SELECT * FROM memory WHERE user_id = ? AND type = 'agent' AND agent_id IS NULL AND embedding IS NOT NULL`
          : `SELECT * FROM memory WHERE user_id = ? AND type = ? AND embedding IS NOT NULL`,
      ).all(...(type === 'profile' ? [userId] : [userId, storeType])) as any[];
      let dup: any = null;
      let best = DEDUP_THRESHOLD;
      for (const row of sameType) {
        const v = bytesToVec(row.embedding);
        if (!v) continue;
        const sim = cosine(emb, v);
        if (sim > best) { best = sim; dup = row; }
      }
      if (dup) {
        // 同一事实的复述：更新原行（保留更长/更新的表述）
        const newContent = content.length >= (dup.content || '').length ? content : dup.content;
        const newEmb = newContent === content ? vecToBytes(emb) : dup.embedding;
        db.prepare('UPDATE memory SET content = ?, embedding = ?, last_used_at = ?, use_count = COALESCE(use_count,0)+1 WHERE id = ?')
          .run(newContent, newEmb, ts, dup.id);
        result.updated++;
        continue;
      }
    }

    // 冲突标记：旧行打 superseded_by。
    // conflictsWith 可能是记忆 id，也可能是 LLM 描述的"被推翻的旧结论内容"——先按 id 查，查不到按内容/语义定位。
    if (item.conflictsWith) {
      try {
        let old = db.prepare('SELECT id, metadata_json FROM memory WHERE id = ? AND user_id = ?').get(item.conflictsWith, userId) as any;
        if (!old) {
          // 按内容定位：词面 LIKE 优先，其次 embedding 余弦最接近的
          const byLike = db.prepare(
            `SELECT id, metadata_json FROM memory WHERE user_id = ? AND content LIKE ? ORDER BY last_used_at DESC LIMIT 1`,
          ).get(userId, `%${String(item.conflictsWith).slice(0, 60)}%`) as any;
          if (byLike) {
            old = byLike;
          } else if (emb) {
            const rows = db.prepare(
              `SELECT id, metadata_json, embedding FROM memory WHERE user_id = ? AND embedding IS NOT NULL`,
            ).all(userId) as any[];
            let best = 0.75;
            for (const row of rows) {
              const v = bytesToVec(row.embedding);
              if (!v) continue;
              const sim = cosine(emb, v);
              if (sim > best) { best = sim; old = row; }
            }
          }
        }
        if (old) {
          const oldMeta = (() => { try { return JSON.parse(old.metadata_json || '{}'); } catch { return {}; } })();
          const newId = insertMemory(userId, agentId, content, item.tags, { ...(item.metadata || {}), supersedes: old.id }, type, emb);
          db.prepare('UPDATE memory SET metadata_json = ? WHERE id = ?')
            .run(JSON.stringify({ ...oldMeta, superseded_by: newId, superseded_at: ts }), old.id);
          result.created++;
          result.superseded++;
          bumpMemoryCache(userId);
          continue;
        }
      } catch { /* conflictsWith 非法时按普通写入 */ }
    }

    insertMemory(userId, agentId, content, item.tags, item.metadata, type, emb);
    result.created++;
  }

  if (result.created || result.updated || result.merged) bumpMemoryCache(userId);
  return result;
}

function insertMemory(
  userId: string, agentId: string | null, content: string,
  tags: string[] | undefined, metadata: Record<string, any> | undefined,
  type: string, emb?: number[] | null,
): string {
  const id = 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const embBytes = emb !== undefined ? vecToBytes(emb) : null;
  // 存储归一化：profile 落库为 type='agent' 且 agent_id 为空
  const storeType = type === 'profile' ? 'agent' : type;
  const storeAgentId = type === 'profile' ? null : agentId;
  const meta = { ...(metadata || {}) };
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
  if (type === 'daily' && !meta.date) meta.date = new Date().toISOString().slice(0, 10);
  db.prepare(
    `INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, embedding, created_at, last_used_at, type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, storeAgentId, content, tagsJson, JSON.stringify(meta), embBytes, Date.now(), Date.now(), storeType);
  return id;
}

// ── 压缩前记忆抢救（pre-compaction flush，参考 OpenClaw） ──

export interface FlushParams {
  userId: string;
  conversationId: string;
  agentId?: string | null;
  platform: Platform;
  model: Model;
}

/**
 * 压缩前抢救：把即将被摘要吞掉的细节（关键数据/路径/ID/决定/用户纠正）写入记忆。
 * 静默执行：不插会话消息、不发聊天事件，失败仅打日志。
 */
export async function flushMemoriesBeforeCompression(params: FlushParams, toCompress: Message[]): Promise<void> {
  try {
    const msgs = toCompress.filter((m) => m.content || m.toolCalls?.length);
    if (msgs.length < 2) return;
    const transcript = msgs.slice(-20).map((m) => {
      const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
      return `【${role}】\n${m.content || (m.toolCalls?.length ? '(调用工具)' : '')}`;
    }).join('\n\n---\n\n');

    // 当天 daily 现有内容（让 LLM 避免重复）
    const date = new Date().toISOString().slice(0, 10);
    const existingDaily = db.prepare(
      `SELECT content FROM memory WHERE user_id = ? AND type = 'daily' AND metadata_json LIKE ? ORDER BY last_used_at DESC LIMIT 1`,
    ).all(params.userId, `%"date":"${date}"%`)[0] as any;

    const client = new LlmClient(params.platform, params.model);
    const resp = await client.chat([
      {
        id: 'sys', conversationId: '', role: 'system', createdAt: 0,
        content: '你是记忆归档助手。以下对话片段即将被压缩丢失。请提取其中「尚未记录在现有记忆里」且后续步骤可能需要的信息（关键数据、文件路径、ID、命令、决定、用户纠正/偏好），输出 JSON 数组，每项形如 {"type":"daily|session","content":"一句话事实，标识符原样保留"}。相对日期（如"昨天"）转为绝对日期。没有值得抢救的返回 []。只输出 JSON，不要解释。',
      },
      {
        id: 'usr', conversationId: '', role: 'user', createdAt: 0,
        content: (existingDaily ? `## 当天已记录（不要重复）\n${existingDaily.content}\n\n` : '')
          + `## 即将压缩的对话\n${transcript}`,
      },
    ], { temperature: 0.2, maxTokens: 800, responseFormat: { type: 'json_object' } as any });

    const text = resp.delta?.content || '';
    const items = parseExtractedItems(text);
    if (!items.length && text.trim()) {
      console.log('[memory] 压缩前抢救: 模型输出无法解析为条目, 前120字:', text.slice(0, 120));
    }

    const writeItems: MemoryWriteItem[] = items
      .filter((x) => x?.content && typeof x.content === 'string')
      .map((x) => ({
        type: x.type === 'daily' ? 'daily' : 'session',
        content: String(x.content),
        metadata: x.type === 'session' ? { conversationId: params.conversationId, flush: true } : { flush: true },
      }));
    if (writeItems.length) {
      const r = await writeMemoryItems(params.userId, params.agentId ?? null, writeItems, 'flush');
      console.log(`[memory] 压缩前抢救: +${r.created} 新增 / ${r.merged} 合并到当日`);
    }
  } catch (e: any) {
    console.error('[memory] 压缩前抢救失败:', e?.message || e);
  }
}

// 记忆整理（Dreaming）—— 参考 OpenClaw "做梦" 机制的后台记忆整理服务。
// 三阶段：light 扫描（无 LLM 圈候选）→ REM 回顾（LLM 打分定动作）→ deep 落盘（promote/merge/discard/keep）。
// 防误删：discard 仅限明确规则（use_count=0 且超 30 天）或 LLM 给出 reason；单次删除上限 50。
// 调度仿 scheduled-tasks.ts：5min 轮询 + ticking 防重叠 + 启动补跑；按配置的每日时刻触发。
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { embedText } from './ollama-embed.js';
import { vecToBytes, bumpMemoryCache, parseExtractedItems } from './memory-service.js';
import { buildAnthropicBody } from './anthropic-body.js';

const TICK_MS = 5 * 60_000;
const MAX_CANDIDATES = 200;
const MAX_DELETES_PER_RUN = 50;
const REM_BATCH_SIZE = 30;

// ── 配置（app_config）──

export interface DreamingConfig {
  enabled: boolean;
  /** 每日触发时刻（小时，0-23，支持小数如 2.5 = 02:30） */
  hour: number;
  /** 每用户上次整理时间（记忆无变化则跳过） */
  users: Record<string, number>;
}

const DEFAULT_CONFIG: DreamingConfig = { enabled: true, hour: 2.5, users: {} };

export function getDreamingConfig(): DreamingConfig {
  try {
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('memory_dreaming_config') as any;
    if (!row?.value) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(row.value);
    return {
      enabled: parsed.enabled !== false,
      hour: typeof parsed.hour === 'number' ? parsed.hour : DEFAULT_CONFIG.hour,
      users: parsed.users || {},
    };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function setDreamingConfig(patch: Partial<Pick<DreamingConfig, 'enabled' | 'hour'>>): DreamingConfig {
  const cfg = getDreamingConfig();
  const next: DreamingConfig = {
    enabled: patch.enabled !== undefined ? patch.enabled : cfg.enabled,
    hour: patch.hour !== undefined ? Math.max(0, Math.min(23, patch.hour)) : cfg.hour,
    users: cfg.users,
  };
  db.prepare('INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)')
    .run('memory_dreaming_config', JSON.stringify(next), Date.now());
  refreshDreamingScheduler();
  return next;
}

// ── 模型选择与非流式调用（仿 scheduled-tasks.ts）──

function findDefaultModel(userId: string): any | null {
  return (
    db.prepare(
      `SELECT m.id, m.model_id, p.api_url, p.api_key_enc, p.protocol, p.headers_json
       FROM model m JOIN platform p ON p.id = m.platform_id
       WHERE m.user_id = ? AND m.enabled = 1 AND m.type = 'llm'
       ORDER BY CASE
         WHEN m.is_default = 1 AND p.is_builtin = 0 THEN 0
         WHEN m.is_default = 1 THEN 1
         ELSE 2
       END, m.created_at ASC
       LIMIT 1`,
    ).get(userId) || null
  );
}

async function callModel(model: any, messages: Array<{ role: string; content: string }>): Promise<string> {
  const baseUrl = String(model.api_url || '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('平台未配置 API URL');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let url: string;
  let body: any;
  if (model.protocol === 'anthropic') {
    url = `${baseUrl}/v1/messages`;
    headers['x-api-key'] = model.api_key_enc || '';
    headers['anthropic-version'] = '2023-06-01';
    body = buildAnthropicBody(messages, model.model_id, 2048);
  } else {
    url = `${baseUrl}/v1/chat/completions`;
    if (model.api_key_enc) headers['Authorization'] = `Bearer ${model.api_key_enc}`;
    body = { model: model.model_id, messages, stream: false };
  }
  try {
    const extra = model.headers_json ? JSON.parse(model.headers_json) : {};
    Object.assign(headers, extra || {});
  } catch { /* ignore */ }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM 请求失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data: any = await res.json();
  if (model.protocol === 'anthropic') {
    return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('\n');
  }
  return data.choices?.[0]?.message?.content || '';
}

// ── light 扫描：无 LLM 圈候选 ──

interface CandidateRow {
  id: string; type: string; agent_id: string | null; content: string;
  metadata_json: string; use_count: number; created_at: number; last_used_at: number;
}

function scanCandidates(userId: string): CandidateRow[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  // session/daily：超 24h 且未消化（digested != 1）
  const shortTerm = db.prepare(
    `SELECT id, type, agent_id, content, metadata_json, COALESCE(use_count,0) AS use_count, created_at, last_used_at
     FROM memory
     WHERE user_id = ? AND type IN ('session','daily') AND created_at < ?
       AND (metadata_json IS NULL OR metadata_json NOT LIKE '%"digested":1%')
     ORDER BY last_used_at DESC`,
  ).all(userId, now - dayMs) as CandidateRow[];
  // agent/profile：从未使用且超 30 天（淘汰候选）
  const stale = db.prepare(
    `SELECT id, type, agent_id, content, metadata_json, COALESCE(use_count,0) AS use_count, created_at, last_used_at
     FROM memory
     WHERE user_id = ? AND type = 'agent' AND COALESCE(use_count,0) = 0 AND created_at < ?
       AND (metadata_json IS NULL OR metadata_json NOT LIKE '%"digested":1%')
     ORDER BY last_used_at DESC`,
  ).all(userId, now - 30 * dayMs) as CandidateRow[];
  return [...shortTerm, ...stale].slice(0, MAX_CANDIDATES);
}

// ── REM 回顾：LLM 打分定动作 ──

const REM_PROMPT = [
  '你是记忆整理助手（做梦回顾阶段）。对下面每条编号记忆逐一判断，按这些维度打分：价值频率（同类信息是否反复出现）、与用户/智能体主题的相关度、时间新鲜度、跨天重复、矛盾（同主题新旧条目冲突时以更新的为准，除非内容明确纠正）。',
  '可选动作：',
  '- promote：daily/session 中稳定有价值的信息 → 升为长期记忆（agent），相对日期（如"昨天"）转为绝对日期',
  '- merge：语义重复的条目 → 合并为一条，输出合并后内容与涉及 id 列表',
  '- discard：过期/失效引用/一次性信息/与更新条目矛盾',
  '- keep：保留原样',
  '输出 JSON 数组，每项形如 {"id":"记忆id","action":"promote|merge|discard|keep","content":"promote/merge 后的新内容","mergeWith":["其他id"],"reason":"一句话理由"}。所有条目都要给出动作。只输出 JSON。',
].join('\n');

async function remReview(model: any, rows: CandidateRow[]): Promise<any[]> {
  const listing = rows.map((r) => {
    const meta = (() => { try { return JSON.parse(r.metadata_json || '{}'); } catch { return {}; } })();
    const extra = meta.date ? `（日期:${meta.date}）` : meta.conversationId ? '（会话记忆）' : '';
    return `- id=${r.id} 类型=${r.type}${extra}：${r.content}`;
  }).join('\n');
  const text = await callModel(model, [
    { role: 'system', content: REM_PROMPT },
    { role: 'user', content: `## 待整理记忆\n${listing}` },
  ]);
  // 兼容数组 / {items:[...]} / 单对象（部分模型 json 模式下返回单个对象而非数组）
  const items = parseExtractedItems(text);
  if (!items.length && text.trim()) {
    console.log('[memory-dreaming] REM 输出无法解析, 前120字:', text.slice(0, 120));
  }
  return items;
}

// ── deep 落盘 ──

export interface DreamStats {
  scanned: number; promoted: number; merged: number; discarded: number; kept: number;
  errors: string[];
}

function parseMeta(json: string): any {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}

async function applyActions(userId: string, rows: CandidateRow[], actions: any[], dreamRunId: string): Promise<DreamStats> {
  const stats: DreamStats = { scanned: rows.length, promoted: 0, merged: 0, discarded: 0, kept: 0, errors: [] };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const handled = new Set<string>();
  let deletes = 0;

  const deleteMem = (id: string) => {
    if (deletes >= MAX_DELETES_PER_RUN) return false;
    db.prepare('DELETE FROM memory WHERE id = ? AND user_id = ?').run(id, userId);
    deletes++;
    return true;
  };

  // merge 组：按 mergeWith 聚合，一次处理一组
  const mergeGroups: Map<string, string[]> = new Map();
  for (const a of actions) {
    if (a?.action === 'merge' && Array.isArray(a.mergeWith)) {
      const ids = [String(a.id), ...a.mergeWith.map(String)].filter((id) => byId.has(id));
      if (ids.length > 1) {
        const key = [...ids].sort().join('|');
        if (!mergeGroups.has(key)) mergeGroups.set(key, ids);
      }
    }
  }

  for (const a of actions) {
    if (!a?.id || !byId.has(String(a.id))) continue;
    const id = String(a.id);
    const row = byId.get(id)!;
    const action = String(a.action || 'keep');
    try {
      if (action === 'promote') {
        const content = String(a.content || row.content).trim();
        if (!content || handled.has(id)) continue;
        const meta = { ...parseMeta(row.metadata_json), promoted_from: [id], dream_run_id: dreamRunId };
        const emb = await embedText(content).catch(() => null);
        db.prepare(
          `INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, embedding, created_at, last_used_at, type)
           VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'agent')`,
        ).run('mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          userId, row.agent_id, content, JSON.stringify(meta), vecToBytes(emb), Date.now(), Date.now());
        deleteMem(id);
        stats.promoted++;
        handled.add(id);
      } else if (action === 'merge') {
        const key = [...new Set([id, ...(Array.isArray(a.mergeWith) ? a.mergeWith.map(String) : [])])].filter((x) => byId.has(x)).sort().join('|');
        const group = mergeGroups.get(key) || [id];
        if (group.some((x) => handled.has(x))) continue;
        const members = group.map((gid) => byId.get(gid)!).filter(Boolean);
        if (members.length < 2) continue;
        const keeper = members.reduce((oldest, r) => (r.created_at < oldest.created_at ? r : oldest), members[0]);
        const content = String(a.content || members.map((m) => m.content).join('\n')).trim();
        const emb = await embedText(content).catch(() => null);
        const keeperMeta = { ...parseMeta(keeper.metadata_json), dream_run_id: dreamRunId, merged_from: members.map((m) => m.id).filter((x) => x !== keeper.id) };
        db.prepare('UPDATE memory SET content = ?, embedding = ?, metadata_json = ?, last_used_at = ? WHERE id = ?')
          .run(content, vecToBytes(emb), JSON.stringify(keeperMeta), Date.now(), keeper.id);
        for (const m of members) {
          if (m.id !== keeper.id && deleteMem(m.id)) { /* deleted */ }
          handled.add(m.id);
        }
        stats.merged++;
      } else if (action === 'discard') {
        // 防误删：淘汰候选（use_count=0 且超 30 天）或带 reason 的可删；其余降级为 keep
        const isStale = row.use_count === 0 && (Date.now() - row.created_at) > 30 * 86_400_000;
        if ((isStale || a.reason) && !handled.has(id) && deleteMem(id)) {
          stats.discarded++;
        } else {
          markDigested(id, row, dreamRunId);
          stats.kept++;
        }
        handled.add(id);
      } else {
        // keep：打 digested 标记，下轮扫描跳过
        if (!handled.has(id)) {
          markDigested(id, row, dreamRunId);
          stats.kept++;
          handled.add(id);
        }
      }
    } catch (e: any) {
      stats.errors.push(`${id}: ${e?.message || e}`);
    }
  }

  // 未被 LLM 处理到的候选也打 digested（避免每轮重复送审）
  for (const r of rows) {
    if (!handled.has(r.id)) {
      try { markDigested(r.id, r, dreamRunId); } catch { /* ignore */ }
      stats.kept++;
    }
  }
  return stats;
}

function markDigested(id: string, row: CandidateRow, dreamRunId: string): void {
  const meta = { ...parseMeta(row.metadata_json), digested: 1, dream_run_id: dreamRunId };
  db.prepare('UPDATE memory SET metadata_json = ? WHERE id = ?').run(JSON.stringify(meta), id);
}

// ── 单用户整理 ──

export async function runDreamingForUser(userId: string, trigger: 'scheduled' | 'manual'): Promise<DreamStats & { logId: string; skipped?: string }> {
  const dreamRunId = randomUUID();
  const startedAt = Date.now();
  const empty: DreamStats = { scanned: 0, promoted: 0, merged: 0, discarded: 0, kept: 0, errors: [] };

  // 无新记忆则跳过（上次整理后无写入/更新）
  const cfg = getDreamingConfig();
  const lastRun = cfg.users[userId] || 0;
  if (trigger === 'scheduled') {
    const latest = (db.prepare(
      'SELECT MAX(COALESCE(last_used_at, created_at)) AS m FROM memory WHERE user_id = ?',
    ).get(userId) as any)?.m || 0;
    if (latest <= lastRun) {
      return { ...empty, logId: '', skipped: '无新记忆' };
    }
  }

  const model = findDefaultModel(userId);
  if (!model) {
    const logId = insertDreamLog(userId, startedAt, Date.now(), trigger, empty, '未找到可用模型');
    return { ...empty, logId, skipped: '未找到可用模型' };
  }

  try {
    const candidates = scanCandidates(userId);
    let stats: DreamStats = { ...empty, scanned: candidates.length };
    if (candidates.length) {
      // REM 分批送审
      const allActions: any[] = [];
      for (let i = 0; i < candidates.length; i += REM_BATCH_SIZE) {
        const batch = candidates.slice(i, i + REM_BATCH_SIZE);
        try {
          allActions.push(...await remReview(model, batch));
        } catch (e: any) {
          stats.errors.push(`REM 批次失败: ${e?.message || e}`);
        }
      }
      stats = await applyActions(userId, candidates, allActions, dreamRunId);
      bumpMemoryCache(userId);
    }
    const logId = insertDreamLog(userId, startedAt, Date.now(), trigger, stats);
    // 更新用户级 lastRun
    const cfg2 = getDreamingConfig();
    cfg2.users[userId] = Date.now();
    db.prepare('INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)')
      .run('memory_dreaming_config', JSON.stringify(cfg2), Date.now());
    return { ...stats, logId };
  } catch (e: any) {
    const logId = insertDreamLog(userId, startedAt, Date.now(), trigger, empty, e?.message || String(e));
    return { ...empty, logId, errors: [e?.message || String(e)] };
  }
}

function insertDreamLog(userId: string, startedAt: number, finishedAt: number, trigger: string, stats: DreamStats, error?: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO memory_dream_log (id, user_id, started_at, finished_at, trigger, stats_json, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, startedAt, finishedAt, trigger, JSON.stringify(stats), error || null);
  return id;
}

// ── 调度器（仿 scheduled-tasks.ts：5min 轮询 + 防重叠 + 启动补跑） ──

let timer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const cfg = getDreamingConfig();
    if (!cfg.enabled) return;
    const now = new Date();
    const nowHours = now.getHours() + now.getMinutes() / 60;
    // 已过今日配置时刻才触发；补跑逻辑：lastRun 日期不是今天就允许触发（覆盖停机错过的情况）
    if (nowHours < cfg.hour) return;
    const today = new Date().toISOString().slice(0, 10);
    const users = db.prepare('SELECT DISTINCT user_id FROM memory WHERE user_id IS NOT NULL').all() as any[];
    for (const u of users) {
      const lastRunAt = cfg.users[u.user_id] || 0;
      if (lastRunAt && new Date(lastRunAt).toISOString().slice(0, 10) === today) continue;
      try {
        const r = await runDreamingForUser(u.user_id, 'scheduled');
        if (!r.skipped && r.scanned) {
          console.log(`[memory-dreaming] 用户 ${u.user_id} 整理完成: 扫描${r.scanned} 提升${r.promoted} 合并${r.merged} 淘汰${r.discarded} 保留${r.kept}`);
        }
      } catch (e) {
        console.error(`[memory-dreaming] 用户 ${u.user_id} 整理失败:`, e instanceof Error ? e.message : e);
      }
    }
  } finally {
    ticking = false;
  }
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  startupTimer = setTimeout(() => { tick().catch(() => {}); }, 30_000);
  console.log('[memory-dreaming] 记忆整理调度器已启动（每 5 分钟轮询）');
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
}

export function refreshDreamingScheduler(): void {
  const cfg = getDreamingConfig();
  if (cfg.enabled) startTimer();
  else stopTimer();
}

export function startMemoryDreamingScheduler(): void {
  refreshDreamingScheduler();
}

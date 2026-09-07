import { db } from '../db.js';

const FAIL_WINDOW_MS = 10 * 60 * 1000;

export const MAX_RETRY = 3;

export interface PickedToken {
  id: string;
  apiKey: string;
  label?: string;
  failCount: number;
}

function effectiveFail(row: { fail_count: number; last_fail_at: number | null }): number {
  if (!row.last_fail_at) return 0;
  if (Date.now() - row.last_fail_at > FAIL_WINDOW_MS) return 0;
  return row.fail_count;
}

export function pickToken(platformId: string, excludeIds: string[] = []): PickedToken | null {
  const rows = db
    .prepare('SELECT id, api_key, label, fail_count, last_fail_at, created_at FROM platform_api_key WHERE platform_id = ? AND enabled = 1')
    .all(platformId) as any[];
  if (rows.length === 0) return null;
  const exclude = new Set(excludeIds);
  const candidates = rows
    .filter((r) => !exclude.has(r.id))
    .map((r) => ({ ...r, eff: effectiveFail(r) }));
  if (candidates.length === 0) return null;
  // 加权随机选择：失败只降低被选中的权重，永不把 Token 排除出池子
  // （权重 1/(1+失败次数)：0 次失败 = 1.0，1 次 = 0.5，2 次 = 0.33，3 次 = 0.25…，
  //   超出失败窗口的失败不计入）。手动停用（enabled=0）是唯一的排除手段。
  // excludeIds 仅用于同一次请求内的换 Key 重试，不影响后续请求的选择。
  const weights = candidates.map((c) => 1 / (1 + c.eff));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  let top = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) { top = candidates[i]; break; }
  }
  return { id: top.id, apiKey: top.api_key, label: top.label, failCount: top.eff };
}

export function getActiveApiKey(platformId: string): string | null {
  const t = pickToken(platformId);
  return t?.apiKey || null;
}

export function getAvailableTokenCount(platformId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) as n FROM platform_api_key WHERE platform_id = ? AND enabled = 1')
    .get(platformId) as any;
  return row?.n || 0;
}

export function recordSuccess(tokenId: string): void {
  try {
    const row = db.prepare('SELECT last_fail_at FROM platform_api_key WHERE id = ?').get(tokenId) as any;
    if (row?.last_fail_at && Date.now() - row.last_fail_at > FAIL_WINDOW_MS) {
      db.prepare('UPDATE platform_api_key SET fail_count = 0 WHERE id = ?').run(tokenId);
    }
  } catch {}
}

export function recordFailure(tokenId: string): void {
  try {
    db.prepare('UPDATE platform_api_key SET fail_count = fail_count + 1, last_fail_at = ? WHERE id = ?').run(Date.now(), tokenId);
  } catch {}
}

export function resetFailCount(tokenId: string): void {
  try {
    db.prepare('UPDATE platform_api_key SET fail_count = 0, last_fail_at = NULL WHERE id = ?').run(tokenId);
  } catch {}
}

export async function pauseIfNeeded(platform: { pause_min_ms?: number; pause_max_ms?: number }): Promise<void> {
  const min = platform.pause_min_ms || 0;
  const max = platform.pause_max_ms || 0;
  if (max <= 0) return;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const delay = lo + Math.floor(Math.random() * (hi - lo + 1));
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
}

export function listApiKeys(platformId: string): any[] {
  return db
    .prepare('SELECT id, platform_id, api_key, label, fail_count, last_fail_at, enabled, created_at FROM platform_api_key WHERE platform_id = ? ORDER BY created_at ASC')
    .all(platformId) as any[];
}

export function addApiKey(platformId: string, userId: string, apiKey: string, label?: string): any {
  const { v4: uuid } = require('uuid');
  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO platform_api_key (id, platform_id, user_id, api_key, label, fail_count, enabled, created_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?)',
  ).run(id, platformId, userId, apiKey, label || null, now);
  return db.prepare('SELECT * FROM platform_api_key WHERE id = ?').get(id);
}

export function updateApiKey(tokenId: string, patch: { apiKey?: string; label?: string; enabled?: boolean }): void {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.apiKey !== undefined) { sets.push('api_key = ?'); vals.push(patch.apiKey); }
  if (patch.label !== undefined) { sets.push('label = ?'); vals.push(patch.label); }
  if (patch.enabled !== undefined) { sets.push('enabled = ?'); vals.push(patch.enabled ? 1 : 0); }
  if (sets.length === 0) return;
  vals.push(tokenId);
  db.prepare(`UPDATE platform_api_key SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteApiKey(tokenId: string): void {
  db.prepare('DELETE FROM platform_api_key WHERE id = ?').run(tokenId);
}

export function shouldRetryStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}
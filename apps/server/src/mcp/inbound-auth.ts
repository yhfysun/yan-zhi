import crypto from 'node:crypto';
import { db } from '../db.js';

/** 入站访问凭证解析结果：外部 MCP 客户端以 userId 身份操作 */
export interface ResolvedAccess {
  keyId: string;
  userId: string;
  name: string;
}

/** 明文 key → SHA-256 哈希（库内只存哈希，明文仅创建时返回一次） */
export function hashAccessKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * 从 Authorization: Bearer <key> 解析并校验入站访问凭证。
 * 校验：格式、哈希命中、未过期；命中则 best-effort 更新 last_used_at。
 * 任意一项失败返回 null（调用方据此返回 401）。
 */
export function resolveAccessKey(authHeader?: string | null): ResolvedAccess | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return null;
  const key = m[1].trim();
  if (!key) return null;
  const row = db.prepare('SELECT * FROM mcp_access_key WHERE key_hash = ?').get(hashAccessKey(key)) as any;
  if (!row) return null;
  if (row.expires_at && row.expires_at < Date.now()) return null;
  try {
    db.prepare('UPDATE mcp_access_key SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
  } catch { /* best-effort */ }
  return { keyId: row.id, userId: row.user_id, name: row.name };
}

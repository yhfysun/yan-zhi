import { db } from '../db.js';
import { TOKEN_DEAD_PLATFORM_IDS_SQL } from './token-pool.js';
import type { PlatformModelRow } from './llm-call.js';

// 「按 (userId, platformId?, modelId?) 取一行可调用模型」的唯一实现（2026-10-31）。
//
// ★ 为什么抽出来：conversation-title 与 next-step-suggestion 都需要「优先用会话当前模型，
//   查不到回退用户默认模型」这套口径。两处各写一份必然漂移（本项目已多次踩过平行实现）。
// ★ 依赖方向：只 import db / token-pool，不 import 任何服务 —— 保持叶子模块，随处可引。

/**
 * 取模型行：优先调用方显式给的 platform+model（正在用的必然可用），
 * 否则回退用户默认模型（可见 + 启用平台 + Token 池全停用的平台整平台剔除）。
 */
export function loadModelRow(userId: string, platformId?: string, modelId?: string): PlatformModelRow | null {
  if (platformId && modelId) {
    const row = db.prepare(
      `SELECT m.id, m.model_id, p.id AS pid, p.api_url, p.api_key_enc, p.protocol, p.headers_json
       FROM model m JOIN platform p ON p.id = m.platform_id
       WHERE m.id = ? AND m.platform_id = ? AND m.user_id = ?`,
    ).get(modelId, platformId, userId) as PlatformModelRow | undefined;
    if (row) return row;
  }
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

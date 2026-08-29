import { db } from '../db.js';

/**
 * agnes 线上平台内置初始化。
 *
 * 设计要点：
 * - 确定性 id（agnes-${userId}），重复调用幂等，不会产生重复记录。
 * - is_builtin = 0：保留为普通平台，用户仍可在 UI 里拉取/编辑/删除模型与改 key，
 *   避免 platforms 路由对内置平台的写保护（403）挡住后续管理。
 * - 仅在平台不存在时首次写入；已存在则完全不覆盖，以用户后续编辑为准
 *   （符合“以数据库为准、不要经常校验”的诉求）。
 * - api_key 明文存 api_key_enc，与现有本地平台 key 存储方式一致。
 *   优先读环境变量 AGNES_API_KEY，未设置则用内置默认 key。
 */

export const AGNES_PLATFORM_NAME = 'agnes';
export const AGNES_API_URL = 'https://apihub.agnes-ai.com';
const AGNES_DEFAULT_API_KEY = 'sk-0yfc4XY6D9ZHiyyQ6HD0AIDA3fAg1F5lkvW5WsowO8gxSkXh';

function agnesApiKey(): string {
  return process.env.AGNES_API_KEY || AGNES_DEFAULT_API_KEY;
}

interface AgnesModelSeed {
  modelId: string;
  alias: string;
  type: 'llm' | 'image' | 'video';
  contextWindow: number;
  isDefault?: boolean;
}

// 来自 GET https://apihub.agnes-ai.com/v1/models 的真实列表（2026-08 拉取）。
// 类型按 inferModelType 同款规则推断：含 image → image，含 video → video，其余默认 llm。
// agnes-2.5-pro 标记为全局默认对话模型。
const AGNES_MODELS: AgnesModelSeed[] = [
  { modelId: 'agnes-2.5-pro', alias: 'agnes 2.5 Pro', type: 'llm', contextWindow: 32768, isDefault: true },
  { modelId: 'agnes-2.5-pro-alpha', alias: 'agnes 2.5 Pro Alpha', type: 'llm', contextWindow: 32768 },
  { modelId: 'agnes-2.5-pro-beta', alias: 'agnes 2.5 Pro Beta', type: 'llm', contextWindow: 32768 },
  { modelId: 'agnes-2.5-flash', alias: 'agnes 2.5 Flash', type: 'llm', contextWindow: 32768 },
  { modelId: 'agnes-2.0-flash', alias: 'agnes 2.0 Flash', type: 'llm', contextWindow: 32768 },
  { modelId: 'agnes-image-2.1-flash', alias: 'agnes Image 2.1 Flash', type: 'image', contextWindow: 8192 },
  { modelId: 'agnes-image-2.0-flash', alias: 'agnes Image 2.0 Flash', type: 'image', contextWindow: 8192 },
  { modelId: 'agnes-video-2.5', alias: 'agnes Video 2.5', type: 'video', contextWindow: 8192 },
  { modelId: 'agnes-video-2.5-flash', alias: 'agnes Video 2.5 Flash', type: 'video', contextWindow: 8192 },
  { modelId: 'agnes-video-v2.0', alias: 'agnes Video v2.0', type: 'video', contextWindow: 8192 },
];

/**
 * 为指定用户惰性初始化 agnes 平台及其模型。
 * 平台已存在时直接返回，绝不覆盖用户后续的任何修改。
 */
export function ensureAgnesPlatform(userId: string): { platformId: string; created: boolean } {
  const platformId = `agnes-${userId}`;
  const existing = db.prepare('SELECT id FROM platform WHERE id = ?').get(platformId);
  if (existing) {
    return { platformId, created: false };
  }

  const now = Date.now();
  const insertPlatform = db.prepare(
    `INSERT INTO platform
      (id, user_id, name, protocol, api_url, api_key_enc, headers_json, status, is_builtin, created_at)
     VALUES (?, ?, ?, 'openai', ?, ?, '{}', 1, 0, ?)`,
  );
  const insertModel = db.prepare(
    `INSERT INTO model
      (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, enabled, is_default, is_builtin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '{}', 1, ?, 0, ?)`,
  );

  db.transaction(() => {
    insertPlatform.run(platformId, userId, AGNES_PLATFORM_NAME, AGNES_API_URL, agnesApiKey(), now);
    for (const m of AGNES_MODELS) {
      insertModel.run(
        `${platformId}-${m.modelId}`,
        platformId,
        userId,
        m.modelId,
        m.alias,
        m.type,
        m.contextWindow,
        m.isDefault ? 1 : 0,
        now,
      );
    }
    // 确保全局唯一默认：清掉该用户其他平台模型的 is_default，只保留 agnes-2.5-pro
    db.prepare('UPDATE model SET is_default = 0 WHERE user_id = ? AND platform_id != ?').run(userId, platformId);
  })();

  return { platformId, created: true };
}

/**
 * 启动时为所有已有用户初始化 agnes 平台。
 * 仅做首次 seed，已存在的用户记录不会被改动。
 */
export function syncAgnesPlatformForAllUsers(): { seeded: string[]; skipped: string[] } {
  const users = db.prepare('SELECT id FROM user').all() as { id: string }[];
  const seeded: string[] = [];
  const skipped: string[] = [];
  for (const u of users) {
    const r = ensureAgnesPlatform(u.id);
    if (r.created) seeded.push(u.id);
    else skipped.push(u.id);
  }
  return { seeded, skipped };
}
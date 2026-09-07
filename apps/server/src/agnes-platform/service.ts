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
 * - 多 Token 池：内置多个 Key 灌入 platform_api_key 表（幂等，INSERT OR IGNORE），
 *   llm-proxy 会轮询使用、失败自动切换；用户后续在 UI 添加/删除的 Key 不受影响。
 */

export const AGNES_PLATFORM_NAME = 'agnes';
export const AGNES_API_URL = 'https://apihub.agnes-ai.com';
const AGNES_API_KEYS: { key: string; label: string }[] = [
  { key: 'sk-S1CZPrMVMv86pfXnfDdPGc6v5aMJ6wFSoFMK23Elfi6dEIYi', label: '内置Key 1' },
  { key: 'sk-0yfc4XY6D9ZHiyyQ6HD0AIDA3fAg1F5lkvW5WsowO8gxSkXh', label: '内置Key 2' },
  { key: 'sk-XTYLJg5yU6prpDUTdGHrKAdXKo3x1OqUNzAr9yaGphpXABNm', label: '内置Key 3' },
  { key: 'sk-dTsaxioWEZ8IMK0ad7c1XcJp12LNLusxXC2TtLBm6B3tR0jz', label: '内置Key 4' },
  { key: 'sk-ZpImTabKX8CHK9CU4TdDfEgsHRB1mwliQQtJfzqfuihrLZHe', label: '内置Key 5' },
];
const AGNES_DEFAULT_API_KEY = AGNES_API_KEYS[0].key;

function agnesApiKey(): string {
  return process.env.AGNES_API_KEY || AGNES_DEFAULT_API_KEY;
}

/**
 * 幂等地把内置 Key 灌入指定 agnes 平台的 Token 池。
 * 确定性 id（agnes-key-N-${platformId}），重复调用安全，不会覆盖已有记录。
 */
function ensureAgnesApiKeys(platformId: string, userId: string): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO platform_api_key
       (id, platform_id, user_id, api_key, label, fail_count, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
  );
  const now = Date.now();
  AGNES_API_KEYS.forEach((k, i) => {
    insert.run(`agnes-key-${i + 1}-${platformId}`, platformId, userId, k.key, k.label, now);
  });
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
// agnes-2.5-flash 标记为全局默认对话模型。
const AGNES_MODELS: AgnesModelSeed[] = [
  { modelId: 'agnes-2.5-pro', alias: 'agnes 2.5 Pro', type: 'llm', contextWindow: 32768 },
  { modelId: 'agnes-2.5-pro-alpha', alias: 'agnes 2.5 Pro Alpha', type: 'llm', contextWindow: 32768 },
  { modelId: 'agnes-2.5-pro-beta', alias: 'agnes 2.5 Pro Beta', type: 'llm', contextWindow: 32768 },
  { modelId: 'agnes-2.5-flash', alias: 'agnes 2.5 Flash', type: 'llm', contextWindow: 32768, isDefault: true },
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
    ensureAgnesApiKeys(platformId, userId);
    return { platformId, created: false };
  }
  // 去重：同一 api_url 已存在平台（历史随机 id 或用户手动添加的 agnes 平台）时不再新建，
  // 避免列表里出现两条指向同一 apihub.agnes-ai.com 的重复条目。
  const dupByUrl = db.prepare('SELECT id FROM platform WHERE user_id = ? AND api_url = ? LIMIT 1').get(userId, AGNES_API_URL) as { id: string } | undefined;
  if (dupByUrl) {
    ensureAgnesApiKeys(dupByUrl.id, userId);
    return { platformId: dupByUrl.id, created: false };
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
    // 确保全局唯一默认：清掉该用户其他平台模型的 is_default，只保留 agnes-2.5-flash
    db.prepare('UPDATE model SET is_default = 0 WHERE user_id = ? AND platform_id != ?').run(userId, platformId);
    // 内置多 Token 灌入 Token 池
    ensureAgnesApiKeys(platformId, userId);
  })();

  return { platformId, created: true };
}

/**
 * 一次性去重：修复历史上「随机 id 的 agnes 平台」与「确定性 id agnes-${userId}」并存的重复。
 * 优先保留确定性 id；否则保留最早创建的那条，其余删除并把引用（会话/智能体/定时任务）重指到保留项。
 * 幂等，重复调用安全。
 */
export function dedupeAgnesPlatforms(userId: string): { kept: string | null; removed: string[] } {
  const canonicalId = `agnes-${userId}`;
  const rows = db.prepare(
    'SELECT id FROM platform WHERE user_id = ? AND api_url = ? ORDER BY (id = ?) DESC, created_at ASC',
  ).all(userId, AGNES_API_URL, canonicalId) as { id: string }[];
  if (rows.length <= 1) return { kept: rows[0]?.id ?? null, removed: [] };

  const kept = rows[0].id;
  const removed = rows.slice(1).map((r) => r.id);
  const repointConv = db.prepare('UPDATE conversation SET platform_id = ? WHERE platform_id = ?');
  const repointAgent = db.prepare('UPDATE agent SET platform_id = ? WHERE platform_id = ?');
  const repointTask = db.prepare('UPDATE scheduled_task SET platform_id = ? WHERE platform_id = ?');
  const delModel = db.prepare('DELETE FROM model WHERE platform_id = ?');
  const delPlatform = db.prepare('DELETE FROM platform WHERE id = ?');

  db.transaction(() => {
    for (const id of removed) {
      repointConv.run(kept, id);
      repointAgent.run(kept, id);
      repointTask.run(kept, id);
      delModel.run(id);
      delPlatform.run(id);
    }
  })();
  return { kept, removed };
}

/**
 * 迁移已有用户：当用户的全局默认模型仍是 agnes 平台的 pro 系模型（pro / pro-alpha / pro-beta）时，
 * 把默认切到同平台的 agnes-2.5-flash（清除该 agnes 平台内其他模型的 is_default）。
 * 仅当「默认模型恰好是 agnes 平台的 pro 系模型」时触发；用户手动选了其他平台/模型则不动。
 * 幂等，重复调用安全。
 */
export function migrateAgnesDefaultToFlash(userId: string): boolean {
  const rows = db.prepare(
    `SELECT m.id AS row_id, m.platform_id, m.model_id
       FROM model m JOIN platform p ON p.id = m.platform_id
      WHERE m.user_id = ? AND m.is_default = 1 AND p.api_url = ?`,
  ).all(userId, AGNES_API_URL) as { row_id: string; platform_id: string; model_id: string }[];

  const proDefault = rows.find((r) => r.model_id.startsWith('agnes-2.5-pro'));
  if (!proDefault) return false;

  const flash = db.prepare(
    'SELECT id FROM model WHERE user_id = ? AND platform_id = ? AND model_id = ? LIMIT 1',
  ).get(userId, proDefault.platform_id, 'agnes-2.5-flash') as { id: string } | undefined;
  if (!flash) return false;

  db.transaction(() => {
    db.prepare('UPDATE model SET is_default = 0 WHERE user_id = ? AND platform_id = ?').run(userId, proDefault.platform_id);
    db.prepare('UPDATE model SET is_default = 1 WHERE id = ?').run(flash.id);
  })();

  return true;
}

/**
 * 启动时为所有已有用户初始化 agnes 平台。
 * 先做一次性去重（修复历史重复记录），再做首次 seed；已存在的用户记录不会被改动，
 * 但会把仍以 agnes pro 为默认的旧数据迁移到 agnes flash。
 */
export function syncAgnesPlatformForAllUsers(): { seeded: string[]; skipped: string[]; migrated: string[] } {
  const users = db.prepare('SELECT id FROM user').all() as { id: string }[];
  const seeded: string[] = [];
  const skipped: string[] = [];
  const migrated: string[] = [];
  for (const u of users) {
    dedupeAgnesPlatforms(u.id);
    const r = ensureAgnesPlatform(u.id);
    if (r.created) seeded.push(u.id);
    else {
      skipped.push(u.id);
      if (migrateAgnesDefaultToFlash(u.id)) migrated.push(u.id);
    }
  }
  return { seeded, skipped, migrated };
}

import { db } from '../db.js';
import { DEFAULT_CONTEXT_WINDOW } from '../constants.js';

// 常量本体在 constants.ts（零依赖模块），这里 re-export 保持既有引用路径可用
export { DEFAULT_CONTEXT_WINDOW };

/**
 * agnes 线上平台内置初始化（平台正确名称：agnes，与接口域名 apihub.agnes-ai.com 一致；
 * 2026-09-14 曾误改成 agens，2026-09-15 改回，并附启动自愈迁移纠正已写错的显示名/别名）。
 *
 * 设计要点：
 * - 确定性 id（agens-${userId}），重复调用幂等，不会产生重复记录。
 * - is_builtin = 0：保留为普通平台，用户仍可在 UI 里拉取/编辑/删除模型与改 key，
 *   避免 platforms 路由对内置平台的写保护（403）挡住后续管理。
 * - 仅在平台不存在时首次写入；已存在则完全不覆盖用户改过的字段（上下文/别名/能力），
 *   只补齐「接口新增但本地缺失」的模型（如 agnes-3.0-flash）、按模型名补齐媒体能力
 *   （agnes-image-* → image、agnes-video-* → video）与默认模型切换。
 * - api_key 明文存 api_key_enc，与现有本地平台 key 存储方式一致。
 *   优先读环境变量 AGENS_API_KEY（兼容旧 AGNES_API_KEY），未设置则用内置默认 key。
 * - 多 Token 池：内置多个 Key 灌入 platform_api_key 表（幂等，INSERT OR IGNORE），
 *   llm-proxy 会轮询使用、失败自动切换；用户后续在 UI 添加/删除的 Key 不受影响。
 */

export const AGENS_PLATFORM_NAME = 'agnes';
export const AGENS_API_URL = 'https://apihub.agnes-ai.com';
/** 全局默认对话模型（agnes 平台，2026-09 接口最新列表） */
export const AGENS_DEFAULT_MODEL_ID = 'agnes-3.0-flash';

const AGENS_API_KEYS: { key: string; label: string }[] = [
  { key: 'sk-S1CZPrMVMv86pfXnfDdPGc6v5aMJ6wFSoFMK23Elfi6dEIYi', label: '内置Key 1' },
  { key: 'sk-0yfc4XY6D9ZHiyyQ6HD0AIDA3fAg1F5lkvW5WsowO8gxSkXh', label: '内置Key 2' },
  { key: 'sk-XTYLJg5yU6prpDUTdGHrKAdXKo3x1OqUNzAr9yaGphpXABNm', label: '内置Key 3' },
  { key: 'sk-dTsaxioWEZ8IMK0ad7c1XcJp12LNLusxXC2TtLBm6B3tR0jz', label: '内置Key 4' },
  { key: 'sk-ZpImTabKX8CHK9CU4TdDfEgsHRB1mwliQQtJfzqfuihrLZHe', label: '内置Key 5' },
];
const AGENS_DEFAULT_API_KEY = AGENS_API_KEYS[0].key;

function agensApiKey(): string {
  return process.env.AGENS_API_KEY || process.env.AGNES_API_KEY || AGENS_DEFAULT_API_KEY;
}

/**
 * 幂等地把内置 Key 灌入指定 agens 平台的 Token 池。
 * 确定性 id（agens-key-N-${platformId}），重复调用安全，不会覆盖已有记录。
 * 历史库里可能残留旧前缀 agnes-key-N-...，这里顺带清理，避免同 key 重复占用池位。
 */
function ensureAgensApiKeys(platformId: string, userId: string): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO platform_api_key
       (id, platform_id, user_id, api_key, label, fail_count, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
  );
  const now = Date.now();
  AGENS_API_KEYS.forEach((k, i) => {
    insert.run(`agens-key-${i + 1}-${platformId}`, platformId, userId, k.key, k.label, now);
  });
}

interface AgensModelSeed {
  modelId: string;
  alias: string;
  type: 'llm' | 'image' | 'video';
  contextWindow?: number;
  capabilities?: string[];
  isDefault?: boolean;
}

/**
 * 按模型名推断能力（大小写不敏感）：名字含 image → 图片生成；含 video → 视频生成。
 * 平台目录接口不返回 capabilities，但 agnes 媒体模型的命名规律稳定
 * （agnes-image-*、agnes-video-*，含大小写混写如 AGNES-Image-*），
 * 因此以名称为准自动带上，免去在 UI 里逐个手勾。
 * 注意：llm 模型名里不含 image/video，因此不会因此被判定为「不支持工具调用」
 * （llm-task-manager 的 supportsTools 判定：能力非空且不含 function_call 时裁掉工具）。
 */
export function inferCapabilitiesFromModelId(modelId: string): string[] {
  const id = String(modelId || '').toLowerCase();
  const caps: string[] = [];
  if (id.includes('image')) caps.push('image');
  if (id.includes('video')) caps.push('video');
  return caps;
}

/** seed / 补齐时的能力口径：seed 里显式声明优先，否则按模型名推断 */
function capabilitiesForModel(m: AgensModelSeed): string[] {
  return m.capabilities?.length ? m.capabilities : inferCapabilitiesFromModelId(m.modelId);
}

function parseCaps(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// 来自 GET https://apihub.agnes-ai.com/v1/models 的真实列表（2026-09-14 拉取，共 12 个）。
// 注意：接口不返回 context_window / capabilities，这两个值是我们侧的默认值，
// 已存在的模型行不会被本文件的迁移覆盖（「以数据库为准」）。
const AGENS_MODELS: AgensModelSeed[] = [
  { modelId: 'agnes-3.0-flash', alias: 'agnes 3.0 Flash', type: 'llm', isDefault: true },
  { modelId: 'agnes-2.5-pro', alias: 'agnes 2.5 Pro', type: 'llm' },
  { modelId: 'agnes-2.5-pro-alpha', alias: 'agnes 2.5 Pro Alpha', type: 'llm' },
  { modelId: 'agnes-2.5-pro-beta', alias: 'agnes 2.5 Pro Beta', type: 'llm' },
  { modelId: 'agnes-2.5-flash', alias: 'agnes 2.5 Flash', type: 'llm' },
  { modelId: 'agnes-2.0-flash', alias: 'agnes 2.0 Flash', type: 'llm' },
  { modelId: 'agnes-image-2.5-flash', alias: 'agnes Image 2.5 Flash', type: 'image' },
  { modelId: 'agnes-image-2.1-flash', alias: 'agnes Image 2.1 Flash', type: 'image' },
  { modelId: 'agnes-image-2.0-flash', alias: 'agnes Image 2.0 Flash', type: 'image' },
  { modelId: 'agnes-video-2.5', alias: 'agnes Video 2.5', type: 'video' },
  { modelId: 'agnes-video-2.5-flash', alias: 'agnes Video 2.5 Flash', type: 'video' },
  { modelId: 'agnes-video-v2.0', alias: 'agnes Video v2.0', type: 'video' },
];

/** 历史库里平台 id 曾是 agnes-${userId}（拼写错误），升级后统一为 agens-${userId}。 */
function legacyPlatformId(userId: string): string {
  return `agnes-${userId}`;
}

/**
 * 把历史写错的平台 id（agnes-${userId}）改成 agens-${userId}，并同步所有引用该 id 的表。
 * 幂等；目标 id 已存在或源 id 不存在时什么都不做。
 */
export function renameLegacyAgensPlatformId(userId: string): boolean {
  const from = legacyPlatformId(userId);
  const to = `agens-${userId}`;
  const src = db.prepare('SELECT id FROM platform WHERE id = ?').get(from) as { id: string } | undefined;
  if (!src) return false;
  const dst = db.prepare('SELECT id FROM platform WHERE id = ?').get(to) as { id: string } | undefined;
  if (dst) return false;

  db.transaction(() => {
    // 改名过程中子表会先指向新 ID、父行后改，中间态会撞 model.platform_id 外键。
    // 延迟外键校验到 COMMIT（与 routes/platforms.ts 的本地平台迁移同一手法）
    db.pragma('defer_foreign_keys = ON');
    db.prepare('UPDATE platform SET id = ? WHERE id = ?').run(to, from);
    // 子表没有 ON UPDATE CASCADE，必须手工同步
    db.prepare('UPDATE model SET platform_id = ? WHERE platform_id = ?').run(to, from);
    db.prepare('UPDATE platform_api_key SET platform_id = ? WHERE platform_id = ?').run(to, from);
    db.prepare('UPDATE agent SET platform_id = ? WHERE platform_id = ?').run(to, from);
    db.prepare('UPDATE conversation SET platform_id = ? WHERE platform_id = ?').run(to, from);
    db.prepare('UPDATE scheduled_task SET platform_id = ? WHERE platform_id = ?').run(to, from);
    // 顺带纠正历史写错的平台显示名（id 是内部标识保持 agens- 前缀，仅名称回正为 agnes）
    db.prepare("UPDATE platform SET name = ? WHERE id = ? AND name = 'agens'").run(AGENS_PLATFORM_NAME, to);
  })();
  return true;
}

/**
 * 已存在的 agnes 平台：补齐接口新增但本地缺失的模型（INSERT OR IGNORE，不覆盖已有行），
 * 并做启动自愈：平台显示名 'agens' → 'agnes'、别名前缀 'agens ' → 'agnes '、
 * 媒体模型能力按名称补齐（model_id 含 image/video 的行自动带上对应能力，只增不减）
 * （2026-09-14 误改名 agens 的回滚迁移，仅动显示层，不动平台 id）。
 */
export function syncAgensModelCatalog(userId: string, platformId: string): { added: string[]; capsFilled: string[] } {
  const added: string[] = [];
  const capsFilled: string[] = [];
  const insertModel = db.prepare(
    `INSERT OR IGNORE INTO model
      (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, enabled, is_default, is_builtin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, 0, 0, ?)`,
  );
  const fixName = db.prepare("UPDATE platform SET name = 'agnes' WHERE id = ? AND name = 'agens'");
  const fixAlias = db.prepare("UPDATE model SET alias = REPLACE(alias, 'agens ', 'agnes ') WHERE platform_id = ? AND alias LIKE 'agens %' AND is_builtin = 0");
  const fillAlias = db.prepare("UPDATE model SET alias = ? WHERE platform_id = ? AND model_id = ? AND (alias IS NULL OR alias = '') AND is_builtin = 0");
  const updateCaps = db.prepare('UPDATE model SET capabilities_json = ? WHERE id = ?');
  const now = Date.now();
  db.transaction(() => {
    for (const m of AGENS_MODELS) {
      const exists = db
        .prepare('SELECT id, capabilities_json FROM model WHERE platform_id = ? AND model_id = ? LIMIT 1')
        .get(platformId, m.modelId) as { id: string; capabilities_json: string | null } | undefined;
      if (exists) {
        // 拉取远程模型进来的行别名可能为空（卡片只显示 model_id），按目录补一个
        fillAlias.run(m.alias, platformId, m.modelId);
        // 能力按名称补齐：只加不减，用户手动勾上的其它能力不受影响
        const want = capabilitiesForModel(m);
        const cur = parseCaps(exists.capabilities_json);
        const merged = Array.from(new Set([...cur, ...want]));
        if (merged.length > cur.length) {
          updateCaps.run(JSON.stringify(merged), exists.id);
          capsFilled.push(m.modelId);
        }
        continue;
      }
      insertModel.run(
        `${platformId}-${m.modelId}`,
        platformId,
        userId,
        m.modelId,
        m.alias,
        m.type,
        m.contextWindow || DEFAULT_CONTEXT_WINDOW,
        JSON.stringify(capabilitiesForModel(m)),
        now,
      );
      added.push(m.modelId);
    }
    fixName.run(platformId);
    fixAlias.run(platformId);
  })();
  return { added, capsFilled };
}

/**
 * 为指定用户惰性初始化 agens 平台及其模型。
 * 平台已存在时直接返回，绝不覆盖用户后续的任何修改。
 */
export function ensureAgensPlatform(userId: string): { platformId: string; created: boolean } {
  const platformId = `agens-${userId}`;
  const existing = db.prepare('SELECT id FROM platform WHERE id = ?').get(platformId);
  if (existing) {
    ensureAgensApiKeys(platformId, userId);
    return { platformId, created: false };
  }
  // 去重：同一 api_url 已存在平台（历史随机 id 或用户手动添加的 agens 平台）时不再新建，
  // 避免列表里出现两条指向同一 apihub.agnes-ai.com 的重复条目。
  const dupByUrl = db.prepare('SELECT id FROM platform WHERE user_id = ? AND api_url = ? LIMIT 1').get(userId, AGENS_API_URL) as { id: string } | undefined;
  if (dupByUrl) {
    ensureAgensApiKeys(dupByUrl.id, userId);
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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, 0, ?)`,
  );

  db.transaction(() => {
    insertPlatform.run(platformId, userId, AGENS_PLATFORM_NAME, AGENS_API_URL, agensApiKey(), now);
    for (const m of AGENS_MODELS) {
      insertModel.run(
        `${platformId}-${m.modelId}`,
        platformId,
        userId,
        m.modelId,
        m.alias,
        m.type,
        m.contextWindow || DEFAULT_CONTEXT_WINDOW,
        JSON.stringify(capabilitiesForModel(m)),
        m.isDefault ? 1 : 0,
        now,
      );
    }
    // 确保全局唯一默认：清掉该用户其他平台模型的 is_default，只保留 agens 默认模型
    db.prepare('UPDATE model SET is_default = 0 WHERE user_id = ? AND platform_id != ?').run(userId, platformId);
    // 内置多 Token 灌入 Token 池
    ensureAgensApiKeys(platformId, userId);
  })();

  return { platformId, created: true };
}

/**
 * 一次性去重：修复历史上「随机 id 的 agens 平台」与「确定性 id agens-${userId}」并存的重复。
 * 优先保留确定性 id；否则保留最早创建的那条，其余删除并把引用（会话/智能体/定时任务）重指到保留项。
 * 幂等，重复调用安全。
 */
export function dedupeAgensPlatforms(userId: string): { kept: string | null; removed: string[] } {
  const canonicalId = `agens-${userId}`;
  const rows = db.prepare(
    'SELECT id FROM platform WHERE user_id = ? AND api_url = ? ORDER BY (id = ?) DESC, created_at ASC',
  ).all(userId, AGENS_API_URL, canonicalId) as { id: string }[];
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
 * 迁移已有用户：当用户的全局默认模型仍指向 agens 平台的旧模型时，
 * 把默认切到同平台的 AGENS_DEFAULT_MODEL_ID（清除该平台内其他模型的 is_default）。
 * 仅当「默认模型恰好是 agens 平台的模型」时触发；用户手动选了其他平台/模型则不动。
 * 幂等，重复调用安全。
 */
export function migrateAgensDefaultModel(userId: string): boolean {
  const rows = db.prepare(
    `SELECT m.id AS row_id, m.platform_id, m.model_id
       FROM model m JOIN platform p ON p.id = m.platform_id
      WHERE m.user_id = ? AND m.is_default = 1 AND p.api_url = ?`,
  ).all(userId, AGENS_API_URL) as { row_id: string; platform_id: string; model_id: string }[];

  if (rows.length === 0) return false;
  // 已经是默认且唯一 → 无需处理；存在多个 is_default（历史脏数据）时仍需收敛成唯一
  if (rows.length === 1 && rows[0].model_id === AGENS_DEFAULT_MODEL_ID) return false;

  const target = db.prepare(
    'SELECT id FROM model WHERE user_id = ? AND platform_id = ? AND model_id = ? LIMIT 1',
  ).get(userId, rows[0].platform_id, AGENS_DEFAULT_MODEL_ID) as { id: string } | undefined;
  if (!target) return false;

  db.transaction(() => {
    db.prepare('UPDATE model SET is_default = 0 WHERE user_id = ? AND platform_id = ?').run(userId, rows[0].platform_id);
    db.prepare('UPDATE model SET is_default = 1 WHERE id = ?').run(target.id);
  })();

  return true;
}

/** api_url 指向本机的平台（Ollama / LM Studio 等）——它们的窗口受本地硬件与模型本身限制，不参与默认档迁移 */
const LOCAL_PLATFORM_URL_LIKE = ['%127.0.0.1%', '%localhost%', '%0.0.0.0%', '%[::1]%'];

/**
 * 一次性把「小于 1M」的模型上下文窗口统一提到 1M（默认档）。
 * - 已经是 1M 及以上档位的保留不动（用户手动调大的值不被回退）
 * - 本机平台（Ollama 等）跳过：本地小模型真实窗口只有 32K/64K，强行抬到 1M 会让
 *   上下文压缩不触发而直接超限报错
 * - 通过 app_config 打标记（v2），只执行一次，重启不会反复覆盖用户后续的小窗口设置
 */
export function bumpModelContextWindowToDefault(): number {
  const markerKey = 'model_ctx_default_1m_v2';
  const done = db.prepare('SELECT value FROM app_config WHERE key = ?').get(markerKey) as { value: string } | undefined;
  if (done) return 0;
  const notLocal = LOCAL_PLATFORM_URL_LIKE.map(() => 'api_url LIKE ?').join(' OR ');
  const changed = db
    .prepare(
      `UPDATE model SET context_window = ?
        WHERE (context_window IS NULL OR context_window < ?)
          AND platform_id NOT IN (SELECT id FROM platform WHERE ${notLocal})`,
    )
    .run(DEFAULT_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW, ...LOCAL_PLATFORM_URL_LIKE).changes;
  db.prepare(
    'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run(markerKey, String(changed), Date.now());
  return changed;
}

/**
 * 启动时为所有已有用户初始化 agens 平台。
 * 顺序：纠正历史 id 拼写 → 一次性去重 → 首次 seed 或补齐新模型 → 默认模型迁移。
 */
export function syncAgensPlatformForAllUsers(): {
  seeded: string[];
  skipped: string[];
  migrated: string[];
  renamed: string[];
  addedModels: string[];
  capsFilled: string[];
} {
  const users = db.prepare('SELECT id FROM user').all() as { id: string }[];
  const seeded: string[] = [];
  const skipped: string[] = [];
  const migrated: string[] = [];
  const renamed: string[] = [];
  const addedModels: string[] = [];
  const capsFilled: string[] = [];
  for (const u of users) {
    if (renameLegacyAgensPlatformId(u.id)) renamed.push(u.id);
    dedupeAgensPlatforms(u.id);
    const r = ensureAgensPlatform(u.id);
    if (r.created) {
      seeded.push(u.id);
    } else {
      skipped.push(u.id);
      const s = syncAgensModelCatalog(u.id, r.platformId);
      if (s.added.length) addedModels.push(...s.added);
      if (s.capsFilled.length) capsFilled.push(...s.capsFilled);
      if (migrateAgensDefaultModel(u.id)) migrated.push(u.id);
    }
  }
  return { seeded, skipped, migrated, renamed, addedModels, capsFilled };
}

// 模型标识解析 —— 统一「一个模型两个标识」的口径。
//
// 背景（真实故障）：model 表有**两个标识**——
//   主键 `id`      ：`agens-guest-agnes-3.0-flash`（库内唯一键）
//   API 名 `model_id`：`agnes-3.0-flash`（传给上游服务的名字）
// 契约上节点/会话存的应是主键（画布 el-option 的 value、会话发任务的 model.id 都是主键），
// 但历史上内置工作流的 seed 回填与运行台下拉写的是 `model_id`，于是运行时
// `WHERE id = ?` 查不到 → 抛「模型不存在: agnes-3.0-flash」，而画布上明明选着这个模型。
// 更难发现的是：预检只收 `model_id` 集合，恰好命中脏值 → **放行**，于是错误推迟到
// 跑到那个节点才爆（用户等了半天）。
//
// 处理原则：
//   1) 先按主键查（正确路径，零成本）；
//   2) 查不到再按 `model_id` 兜一次（存量兼容），命中时打 warn 便于定位未迁移数据；
//   3) **不做模糊/前缀匹配** —— 同名模型可能存在于多个平台，模糊匹配会把 A 平台的
//      模型悄悄用到 B 平台上（错得更隐蔽）。带 platformId 时限定平台，不带则要求唯一。
//
// 三处必须同口径：运行时解析（本模块）、预检集合（routes/workflow.ts）、seed 回填
// （builtin-workflow-agents.ts）。任何一处单独改都会让「预检放行 → 运行报错」重现。
import type { YzSqliteDb } from './sqlite-driver.js';
import { aclExistsSql } from '../services/resource-acl.js';
import type { Model } from '@yan-zhi/shared';
import { createLogger } from './logger.js';
const logger = createLogger('model-resolve');

/** 池化查询：status 与行结构保持与 workflow-runner 既有实现一致 */
export interface ModelRowLike {
  id: string;
  platform_id: string;
  model_id: string;
  alias: string | null;
  type: string | null;
  context_window: number | null;
  capabilities_json: string | null;
}

/** ACL 是 2026-11-01 新表；旧迷你库/迁移前数据库没有它时，共享兜底不能整体失效。 */
function hasAclSchema(db: YzSqliteDb): boolean {
  try {
    const required = ['resource_acl', 'user_role', 'org_role', 'user_org'];
    const rows = db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${required.map(() => '?').join(',')})`,
    ).all(...required) as Array<{ name: string }>;
    const have = new Set(rows.map((r) => r.name));
    return required.every((name) => have.has(name));
  } catch {
    return false;
  }
}

/**
 * 按标识解析模型行。
 *
 * @param db         better-sqlite3 句柄
 * @param modelId    节点/会话里存的标识（主键优先，兼容 API 名）
 * @param userId     归属用户（多用户隔离，必须带）
 * @param platformId 可选。给了就限定平台，避免同名模型跨平台误命中。
 * @returns 原始行；未命中返回 undefined
 */
export function findModelRow(
  db: YzSqliteDb,
  modelId: string,
  userId: string,
  platformId?: string,
): ModelRowLike | undefined {
  if (!modelId) return undefined;

  // 1) 主键（正确路径）
  const byId = db
    .prepare('SELECT * FROM model WHERE id = ? AND user_id = ?')
    .get(modelId, userId) as ModelRowLike | undefined;
  if (byId) return byId;

  // 2) 存量兼容：API 名 model_id
  const byName = platformId
    ? (db
        .prepare('SELECT * FROM model WHERE model_id = ? AND platform_id = ? AND user_id = ?')
        .get(modelId, platformId, userId) as ModelRowLike | undefined)
    : (db
        .prepare('SELECT * FROM model WHERE model_id = ? AND user_id = ?')
        .get(modelId, userId) as ModelRowLike | undefined);
  if (byName) {
    // 命中回退说明库里还有未迁移的裸名；不改数据（只读路径），只提示
    logger.warn(
      `[model-resolve] 模型标识回退命中（存量裸名，建议规范为主键）：${modelId} → ${byName.id}`,
    );
  }
  if (byName) return byName;

  // 3) 共享兜底（2026-11-01 RBAC）：共享平台（is_public=1）的模型 + 单模型共享（model.is_public=1）
  //    对全部用户可见可用 —— 用户自己的模型优先（上面 1/2 步已查），查不到才落共享。
  //    带平台约束时限定该平台；不带时在共享面内解析（同名取第一个）。
  //    ★ try/catch：迷你库（测试内存库）可能没有 platform 表 —— 共享兜底是"锦上添花"，
  //      绝不能让它把 1/2 步已经能正常完成的解析炸掉。
  try {
    const sharedCond = platformId ? 'AND platform_id = ?' : '';
    const sharedArgs: any[] = platformId ? [modelId, platformId] : [modelId];
    // ACL 定向授权（2026-11-01）：EXISTS 参数按 SQL 中 ? 顺序追加在末尾（sharedArgs 之后）
    // 旧库可能尚无 ACL 三张关联表；此时只跳过 ACL 条件，仍保留 is_public 共享兜底。
    const aclAvailable = hasAclSchema(db);
    const aclCond = aclAvailable ? ` OR ${aclExistsSql('model', 'model.id')}` : '';
    const aclArgs = aclAvailable ? [userId, userId, userId] : [];
    const bySharedId = db
      .prepare(`SELECT * FROM model WHERE id = ? ${sharedCond} AND (platform_id IN (SELECT id FROM platform WHERE is_public = 1) OR is_public = 1${aclCond})`)
      .get(...sharedArgs, ...aclArgs) as ModelRowLike | undefined;
    if (bySharedId) return bySharedId;
    const bySharedName = db
      .prepare(`SELECT * FROM model WHERE model_id = ? ${sharedCond} AND (platform_id IN (SELECT id FROM platform WHERE is_public = 1) OR is_public = 1${aclCond})`)
      .get(...sharedArgs, ...aclArgs) as ModelRowLike | undefined;
    if (bySharedName) return bySharedName;
  } catch { /* platform 表不存在（迷你库/极老库）→ 跳过共享兜底 */ }
  return undefined;
}

/** 行 → 领域模型（字段映射与 workflow-runner / llm-task-manager 保持一致） */
export function rowToModel(row: ModelRowLike, defaultContextWindow: number): Model {
  return {
    id: row.id,
    platformId: row.platform_id,
    modelId: row.model_id,
    alias: row.alias ?? undefined,
    type: row.type || 'llm',
    contextWindow: row.context_window || defaultContextWindow,
    capabilities: (() => {
      try {
        return JSON.parse(row.capabilities_json || '[]');
      } catch {
        return [];
      }
    })(),
  } as unknown as Model;
}

/**
 * 把「模型标识」规范成主键。
 *
 * 供 seed 回填与任何需要写库的场景使用：**写库必须写主键**，
 * 写 API 名会让上面那条回退路径长期被依赖，脏数据越积越多。
 * 已是主键时原样返回；未命中返回 null（调用方自行决定是否回填默认模型）。
 */
export function normalizeModelId(
  db: YzSqliteDb,
  modelId: string,
  platformId?: string,
): string | null {
  if (!modelId) return null;
  const byId = db.prepare('SELECT id FROM model WHERE id = ?').get(modelId) as { id: string } | undefined;
  if (byId) return byId.id;
  const byName = platformId
    ? (db.prepare('SELECT id FROM model WHERE model_id = ? AND platform_id = ?').get(modelId, platformId) as { id: string } | undefined)
    : (db.prepare('SELECT id FROM model WHERE model_id = ?').get(modelId) as { id: string } | undefined);
  return byName?.id ?? null;
}

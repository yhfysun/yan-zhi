// 模型候选池解析 —— 三层配置的唯一读取出口（model-candidate-pools，2026-10-12）。
//
// 背景（为什么要有这个模块）：
//   1) 模型太多：单平台可挂几百个模型，聊天下拉 / list_models 全是平铺长清单，
//      用户和模型（动态选型）都要在长列表里淘，容易选到差模型。
//   2) 长任务限流：会话 ReAct 主任务只在启动时构造一次 LlmClient，整个任务
//      （默认 500 步）打同一个模型，上游 429/5xx 时只有 token 级换 Key 重试，
//      没有模型级故障转移 —— 长任务跑几十分钟撞限流只能整体失败。
//
// 设计：
//   四槽位（slot）× 三层配置，每槽位一个**有序多选**候选池（数组顺序 = 优先级，[0] 首选）：
//     L1 智能体     agent.model_pools_json（单个智能体专属）
//     L2 智能体平台 app_config key='agent_platform_model_pools'
//                   ★ 不是「模型平台」——「模型平台」在项目里指 /models 页（百炼/agnes 这类
//                     **大模型供应商**），而这一层要的是**所有智能体**的默认池，
//                     跨供应商选模型，所以归在「智能体平台」（/agents 页）。
//     L3 全局       app_config key='model_pools'
//     L4 自动兜底   autoPool：全部生效模型按类型筛（三层全空/全失效时），
//                   排序 is_default DESC, created_at DESC（与既有默认模型挑选口径一致）。
//   回退按 **槽位粒度**：智能体只配了 llm 没配 vision，则 vision 落到智能体平台 → 全局 → 兜底。
//
// ★ 为什么 L2 不再是「模型平台」：池的语义是「这个智能体该用哪些模型」，
//   而一个智能体的模型往往跨多个供应商（jl 对话 + agnes 生图）。以供应商为层，
//   等于逼用户把跨供应商的选型拆到多个地方配；以「智能体平台」为层才是用户心智里的
//   「我所有智能体的默认选型」。L2 因此**不限平台**（跨供应商可选）。
//
// ★ 同一语义只有一处实现：前端不自行实现回退顺序（P1 起走 GET /api/model-pools），
//   后端所有消费点（会话 failover / 媒体生成 / list_models / 子智能体）一律调 resolvePool。
//   槽位匹配判据 matchesSlot 同时是 list_models CATEGORY_MAP 的口径来源（P2 收敛）。
//
// 数据结构（三层同构 JSON）：
//   { "llm": ["<model.id 主键>", ...], "vision": [], "image": [], "video": [] }
//   只存 model 主键 id，不存 API 名 model_id（双标识的坑见 model-resolve.ts 头注）。
import type { YzSqliteDb } from './sqlite-driver.js';
import { createLogger } from './logger.js';
import { rowToModel } from './model-resolve.js';
import { DEFAULT_CONTEXT_WINDOW } from '../constants.js';
import { matchesModelSlot } from '@yan-zhi/shared';

const logger = createLogger('model-pools');

/** 槽位：llm=对话 / vision=视觉理解 / image=生图 / video=生视频 */
export type Slot = 'llm' | 'vision' | 'image' | 'video';
export const SLOTS: Slot[] = ['llm', 'vision', 'image', 'video'];

/** 槽位匹配：判据唯一实现在 @yan-zhi/shared（前端选择器共用），这里 re-export 保持既有引用名 */
export const matchesSlot = matchesModelSlot;

export type ModelPools = Partial<Record<Slot, string[]>>;

/** 解析结果条目：模型 + 所属平台 + 命中来源层（诊断与 list_models 打标用） */
export interface PoolEntry {
  source: 'agent' | 'agentPlatform' | 'global' | 'auto';
  platformId: string;
  platformName: string;
  model: ReturnType<typeof rowToModel>;
}

// ===== 纯函数（不碰 DB，可独立单测） =====
// 注：matchesSlot 已上收 @yan-zhi/shared（见文件头 re-export），此处不再重复实现。

/** 宽容反序列化：损坏/缺字段 → {}（商城远程 agent 快照可能带任意旧格式，绝不抛错） */
export function parsePoolsJson(raw: string | null | undefined): ModelPools {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: ModelPools = {};
    for (const slot of SLOTS) {
      const arr = (v as Record<string, unknown>)[slot];
      if (Array.isArray(arr)) out[slot] = sanitizeIds(arr);
    }
    return out;
  } catch {
    return {};
  }
}

/** 字符串化 + 去重保序（同一模型配两次只留首个；非字符串项丢弃） */
export function sanitizeIds(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// ===== DB 读取 =====

/** 生成模型行（联查平台名，带生效过滤：enabled + visible + platform.llm_enabled） */
interface EffectiveModelRow {
  id: string;
  platform_id: string;
  model_id: string;
  alias: string | null;
  type: string | null;
  context_window: number | null;
  capabilities_json: string | null;
  description: string | null;
  is_default: number | null;
  created_at: number;
  platform_name: string;
}

function loadEffectiveModels(db: YzSqliteDb, userId: string): EffectiveModelRow[] {
  return db
    .prepare(
      `SELECT m.id, m.platform_id, m.model_id, m.alias, m.type, m.context_window,
              m.capabilities_json, m.description, m.is_default, m.created_at, p.name AS platform_name
         FROM model m JOIN platform p ON p.id = m.platform_id
        WHERE m.user_id = ? AND m.enabled = 1 AND m.visible = 1 AND p.llm_enabled = 1`,
    )
    .all(userId) as EffectiveModelRow[];
}

function capsOf(row: EffectiveModelRow): string[] {
  try {
    const v = JSON.parse(row.capabilities_json || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** 把池 id 序列映射成 PoolEntry（保持池内顺序；失效/错槽位/不存在的 id 静默剔除并打 warn） */
function mapPoolIds(
  db: YzSqliteDb,
  userId: string,
  ids: string[],
  slot: Slot,
  source: PoolEntry['source'],
): PoolEntry[] {
  if (ids.length === 0) return [];
  const all = loadEffectiveModels(db, userId);
  const byId = new Map(all.map((r) => [r.id, r]));
  const dropped: string[] = [];
  const entries: PoolEntry[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    // 失效项（停用/隐藏/平台关闭）视为不存在 —— 不报错（用户可能先配池后临时停用），
    // 但必须留痕，否则「配了却不生效」无从排查
    if (!row || !matchesSlot(row.type, capsOf(row), slot)) {
      dropped.push(id);
      continue;
    }
    entries.push({
      source,
      platformId: row.platform_id,
      platformName: row.platform_name || '',
      model: rowToModel(row, DEFAULT_CONTEXT_WINDOW),
    });
  }
  if (dropped.length) {
    logger.warn(`[model-pools] ${source} 层 ${slot} 池有 ${dropped.length} 个失效/错槽位条目被剔除: ${dropped.join(', ')}`);
  }
  return entries;
}

function readAgentPools(db: YzSqliteDb, agentId: string, userId: string): ModelPools {
  const row = db
    .prepare('SELECT model_pools_json FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)')
    .get(agentId, userId) as { model_pools_json: string | null } | undefined;
  return parsePoolsJson(row?.model_pools_json);
}

/**
 * L2 智能体平台层：app_config key='agent_platform_model_pools'（应用级单例）。
 *
 * ★ 不是「模型平台」（platform 表）：那一层的语义是"这个供应商下的模型"，
 *   而本层是"**所有智能体**的默认候选池"，跨供应商可选（见文件头设计说明）。
 *   存储用 app_config 而非 platform 表，正是因为它不隶属于任何单个供应商。
 * ★ 与 L3 全局层一样是应用级（不分用户）—— 桌面单用户场景，多用户后续再分。
 */
export function readAgentPlatformPools(db: YzSqliteDb): ModelPools {
  const row = db.prepare("SELECT value FROM app_config WHERE key = 'agent_platform_model_pools'").get() as
    | { value: string | null }
    | undefined;
  return parsePoolsJson(row?.value);
}

/** 全局层：app_config key='model_pools'（应用级，不分用户 —— 桌面单用户场景，多用户后续再分） */
export function readGlobalPools(db: YzSqliteDb): ModelPools {
  const row = db.prepare("SELECT value FROM app_config WHERE key = 'model_pools'").get() as
    | { value: string | null }
    | undefined;
  return parsePoolsJson(row?.value);
}

// ===== 解析主入口 =====

export interface ResolvePoolOpts {
  userId: string;
  /** 智能体上下文（有值才查 L1）；agent 行不存在时跳过该层 */
  agentId?: string | null;
}

/**
 * 解析某槽位的生效候选池（有序，[0] 首选）。
 *
 * 回退顺序：agent → agentPlatform（智能体平台）→ global → autoPool。
 * 每层「池数组为空或清洗后为空」都继续往下走（失效项不阻断回退）。
 *
 * ★ 不再需要 platformId：L2 是「智能体平台」层的**应用级单例**，
 *   与模型供应商无关（旧实现拿 agent 绑定的 platform_id 去查 platform 表，
 *   语义是"这个供应商下的默认池"，与"所有智能体的默认池"不是一回事）。
 */
export function resolvePool(db: YzSqliteDb, opts: ResolvePoolOpts, slot: Slot): PoolEntry[] {
  const { userId, agentId } = opts;

  // L1 智能体：跨平台选（用户在智能体配置里从全部可见模型里挑）
  if (agentId) {
    const entries = mapPoolIds(db, userId, readAgentPools(db, agentId, userId)[slot] || [], slot, 'agent');
    if (entries.length) return entries;
  }

  // L2 智能体平台：所有智能体的默认池，跨平台可选（不再限定单个供应商）
  const apEntries = mapPoolIds(db, userId, readAgentPlatformPools(db)[slot] || [], slot, 'agentPlatform');
  if (apEntries.length) return apEntries;

  // L3 全局
  const globalEntries = mapPoolIds(db, userId, readGlobalPools(db)[slot] || [], slot, 'global');
  if (globalEntries.length) return globalEntries;

  // L4 自动兜底：全部生效模型按槽位筛，is_default 优先（等价「现状无池」行为，零配置可用）
  const rows = loadEffectiveModels(db, userId).filter((r) => matchesSlot(r.type, capsOf(r), slot));
  rows.sort((a, b) => (b.is_default || 0) - (a.is_default || 0) || (b.created_at || 0) - (a.created_at || 0));
  return rows.map((r) => ({
    source: 'auto' as const,
    platformId: r.platform_id,
    platformName: r.platform_name || '',
    model: rowToModel(r, DEFAULT_CONTEXT_WINDOW),
  }));
}

/** 首选模型（resolvePool[0] 的便捷封装；空池返回 null，调用方自行兜底报错） */
export function resolveFirstModel(db: YzSqliteDb, opts: ResolvePoolOpts, slot: Slot): PoolEntry | null {
  return resolvePool(db, opts, slot)[0] || null;
}

/**
 * 故障转移链：当前模型排在**最前**，其后接池中其余候选。
 *
 * 为什么当前模型一定在首位：任务已经用它跑了若干轮，上下文（缓存前缀、工具协议）都按它
 * 建立；只有它**真的失败**才应该换。若当前模型不在池里（用户手动选了池外模型），
 * 整池作为后备队列（不做任何"纠正用户选择"的越界行为）。
 */
export function resolveFailoverChain(
  db: YzSqliteDb,
  opts: ResolvePoolOpts,
  currentModelId: string,
  slot: Slot,
): PoolEntry[] {
  const pool = resolvePool(db, opts, slot);
  if (!currentModelId) return pool;
  const head = pool.filter((e) => e.model.id === currentModelId);
  const rest = pool.filter((e) => e.model.id !== currentModelId);
  return head.length ? [...head, ...rest] : pool;
}

// ===== 写入校验（保存三层池时共用；解析层的宽容只留给**读**，写必须挡住错配） =====

export interface ValidatePoolsResult {
  ok: boolean;
  error?: string;
  pools?: ModelPools;
}

/**
 * 校验并规范化一次池写入（PUT 三层共用）。
 * 规则：
 *   - 结构：值必须是对象，每个槽位是字符串数组（非法槽位字段忽略、非法项剔除）
 *   - 归属：每个 model 主键必须存在且属于该用户
 *   - 槽位：matchesSlot 不匹配 → 明确报错（读路径剔除失效项是宽容，写路径必须挡住错配，
 *     否则用户配错槽位要到运行时才发现 —— 错误越晚爆越难查）
 *   - 允许引用跨平台模型：三层都是跨供应商选型（L1 智能体专属 / L2 智能体平台默认 /
 *     L3 全局默认），没有任何一层按供应商限定 —— 这是需求内行为，写路径不额外限定，
 *     配置宽松、读取严格，职责分离
 */
export function validateModelPools(db: YzSqliteDb, userId: string, raw: unknown): ValidatePoolsResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'modelPools 必须是对象（键为 llm/vision/image/video）' };
  }
  const src = raw as Record<string, unknown>;
  const pools: ModelPools = {};
  for (const slot of SLOTS) {
    const arr = src[slot];
    if (arr === undefined || arr === null) continue;
    if (!Array.isArray(arr)) return { ok: false, error: `槽位 ${slot} 的值必须是数组` };
    pools[slot] = sanitizeIds(arr);
  }
  const modelById = new Map(
    (db.prepare('SELECT id, type, capabilities_json, alias, model_id FROM model WHERE user_id = ?').all(userId) as any[])
      .map((r) => [r.id, r]),
  );
  for (const slot of SLOTS) {
    for (const id of pools[slot] || []) {
      const row = modelById.get(id);
      if (!row) return { ok: false, error: `模型不存在或不属于当前用户: ${id}` };
      let caps: string[] = [];
      try { const v = JSON.parse(row.capabilities_json || '[]'); if (Array.isArray(v)) caps = v; } catch { /* 坏能力按空处理 */ }
      if (!matchesSlot(row.type, caps, slot)) {
        // ★ 报错必须说明**真正缺什么**：slot 判定是「type 或 capabilities」二者其一
        //   （如 vision 槽要 `type=llm 且 caps 含 vision`）。只报「类型是 llm」会让用户
        //   困惑（agnes 3.0 Flash 明明是 llm，却进不了 vision 池 —— 缺的是 vision 能力）。
        const label = row.alias || row.model_id || id;
        const typeLabel = row.type || 'llm';
        const capStr = caps.length ? caps.join('、') : '无';
        const need: Record<Slot, string> = {
          llm: '类型为 llm 且不具备图片/视频生成能力',
          vision: '类型为 llm 且「能力」里勾选了视觉',
          image: '类型为 image，或「能力」里勾选了图片生成',
          video: '类型为 video，或「能力」里勾选了视频生成',
        };
        return {
          ok: false,
          error: `模型「${label}」不能加入 ${slot} 候选池：需要 ${need[slot]}；该模型当前 类型=${typeLabel}、能力=${capStr}`,
        };
      }
    }
  }
  return { ok: true, pools };
}

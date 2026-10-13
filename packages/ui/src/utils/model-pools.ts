// 模型候选池的前端公共口径（model-candidate-pools P4 收口）。
//
// ★ 为什么单独一个文件：各视图（设置 / 模型平台 / 平台详情 / 智能体编辑）都要
//   「按槽位列出可选模型」，之前各写一份 → 口径漂移（Settings 少了 llmEnabled 过滤、
//   AgentEditDialog 少了 visible 过滤）。这里收口为唯一实现。
//
// ★ 为什么不能用 platformStore.models 作为数据源：store.loadModels(pid) 会**整体替换**
//   共享缓存为单平台清单（设置页切平台、平台详情页进详情都会触发）→ 候选池下拉变空。
//   候选池要跨所有平台选模型，所以由 useModelPoolStore 维护一份独立的全量清单。
import { matchesModelSlot } from '@yan-zhi/shared';
import type { ModelPoolSlot } from '@yan-zhi/shared';
import type { Model, Platform } from '@yan-zhi/shared';

/** 槽位顺序固定：llm → vision → image → video */
export const POOL_SLOTS: ModelPoolSlot[] = ['llm', 'vision', 'image', 'video'];

/**
 * 槽位短名（收口唯一实现，四个视图共用）。
 *
 * ★ 必须短：「智能体编辑」弹窗的 `label-width` 只有 80px，
 *   写成「LLM 候选 / 视觉候选 / 生视频候选」会把 label 压成两行（实测截图），
 *   且 placeholder 里再拼一次「候选」会得到「视觉候选 候选」的重复文案。
 *   ⇒ 槽位名不带「候选」后缀，语义交给 placeholder 与分区标题表达。
 */
export const POOL_LABELS: Record<ModelPoolSlot, string> = {
  llm: 'LLM', vision: '视觉', image: '生图', video: '生视频',
};

/** 生效模型口径（与后端 services/model-pools.ts loadEffectiveModels 一致）：
 *  模型 enabled 且 visible，且所属平台 llm_enabled !== false。 */
export function isEffectiveModel(m: Model, platformLlmEnabled: (pid: string) => boolean): boolean {
  if (!m.enabled) return false;
  if (m.visible !== undefined && m.visible !== null && !m.visible) return false;
  return platformLlmEnabled(m.platformId);
}

export interface PoolModelGroup {
  platformId: string;
  platformName: string;
  models: Model[];
}

/**
 * 按槽位分组列出可选模型。
 * @param models 全量模型（modelPoolStore.allModels）
 * @param platforms 全量平台（platformStore.platforms）
 * @param slot 槽位
 * @param platformId 传了则只列该平台的模型（平台级候选池）；不传则跨所有平台（全局级）
 */
export function groupModelsForSlot(
  models: Model[],
  platforms: Platform[],
  slot: ModelPoolSlot,
  platformId?: string,
): PoolModelGroup[] {
  const llmEnabledMap = new Map<string, boolean>(platforms.map((p) => [p.id, p.llmEnabled !== false]));
  const nameMap = new Map<string, string>(platforms.map((p) => [p.id, p.name]));
  const hit = models.filter((m) => {
    if (platformId && m.platformId !== platformId) return false;
    if (!isEffectiveModel(m, (pid) => llmEnabledMap.get(pid) !== false)) return false;
    return matchesModelSlot(m.type, m.capabilities, slot);
  });
  const byPlatform = new Map<string, Model[]>();
  for (const m of hit) {
    const arr = byPlatform.get(m.platformId);
    if (arr) arr.push(m);
    else byPlatform.set(m.platformId, [m]);
  }
  return [...byPlatform.entries()]
    .map(([pid, ms]) => ({ platformId: pid, platformName: nameMap.get(pid) || pid, models: ms }))
    .filter((g) => g.models.length > 0);
}

/** 平铺版本（平台级候选池下拉用，只有一个平台时不需要分组） */
export function flatModelsForSlot(
  models: Model[],
  platforms: Platform[],
  slot: ModelPoolSlot,
  platformId: string,
): Model[] {
  return groupModelsForSlot(models, platforms, slot, platformId).flatMap((g) => g.models);
}

/**
 * 取候选池的模型源：优先用独立全量清单；万一它没拉到（后端未就绪 / 请求失败）
 * 则回退 platformStore.models，至少不让下拉全空。
 */
export function poolModelsOf(
  pool: { allModels: Model[]; modelsLoaded: boolean },
  fallback: Model[],
): Model[] {
  return pool.modelsLoaded ? pool.allModels : fallback;
}

/** 空池（llm/vision/image/video 全为空数组） */
export function emptyPools(): Record<ModelPoolSlot, string[]> {
  return { llm: [], vision: [], image: [], video: [] };
}

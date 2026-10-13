// 模型候选池 store（model-candidate-pools P1）。
//
// 职责：三层池（agent / agentPlatform / global）的读写与缓存。
// ★ 回退顺序（agent → agentPlatform → global → autoPool）**不在前端实现** ——
//   前端只展示与保存；生效池一律读 GET /api/model-pools 的 effective 字段
//   （后端 services/model-pools.ts 是唯一解析出口，前端自己算必然漂移）。
//
// ★ 第二层是「**智能体平台**」（对所有智能体生效的默认池，跨供应商可选），
//   **不是**「模型平台」——后者指 /models 页里百炼/agnes 这类大模型供应商。
//   所以这一层在 store 里是**单例**（agentPlatformPools 一个对象），不是按 platformId 的字典。
//
// ★★★ 2026-10-13 冲突合并说明（远端 0161d7e × 本地在途改动）：
//   远端版带回了一套 per-platform 池（platformPools / loadPlatform / savePlatform /
//   platformPoolOf）。但**同一个提交的后端里没有对应路由** ——
//   GET /api/model-pools 只认 agentId（routes/model-pools.ts:49-72），
//   PUT 只有 /global、/agent-platform、/agents/:aid，**没有** /model-pools/platforms/:pid；
//   且远端版 load() 里把 platformPools 显式清成 `{}` 从不填充 ⇒ 那套是**对不上后端的
//   死代码**（loadPlatform/savePlatform 调下去只会 404，platformPoolOf 恒返回空池）。
//   本地在途版按真实后端口径实现了 agentPlatformPools，并有守门测试禁止那三个名字回潮
//   （utils/model-pools.test.ts：「仍残留 savePlatform / loadPlatform / platformPoolOf」）。
//   ⇒ 择优结论：**保留本地的 agentPlatformPools / saveAgentPlatform**，
//     **保留远端这轮的真新增 effectivePools / effectiveVision**（被 stores/chat.ts 的
//     vision 降级链消费），**丢弃 per-platform 那套死代码**。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type { Model, ModelPools } from '@yan-zhi/shared';
import { rowToModel } from './platform';

const EMPTY_POOLS: ModelPools = { llm: [], vision: [], image: [], video: [] };

/** 生效池条目（GET /api/model-pools 的 effective[slot] 最小面，2026-10-13） */
export interface EffectivePoolEntry {
  modelId: string;      // model 主键 id（非 API 名）
  platformId: string;
  platformName?: string;
  alias?: string;
  modelApiId?: string;
  source?: string;
}

function normalize(p: unknown): ModelPools {
  const v = (p && typeof p === 'object' && !Array.isArray(p) ? p : {}) as Record<string, unknown>;
  const out: ModelPools = {};
  for (const slot of ['llm', 'vision', 'image', 'video'] as const) {
    const arr = v[slot];
    out[slot] = Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  }
  return out;
}

export const useModelPoolStore = defineStore('modelPool', () => {
  /** L1 之外的全局默认池（应用级单例） */
  const globalPools = ref<ModelPools>({ ...EMPTY_POOLS });
  /** L2 智能体平台默认池（所有智能体的默认选型，跨供应商；应用级单例） */
  const agentPlatformPools = ref<ModelPools>({ ...EMPTY_POOLS });
  /** 生效池（后端解析的有序候选，load() 时随 GET /api/model-pools 一并返回） */
  const effectivePools = ref<Record<string, EffectivePoolEntry[]> | null>(null);
  const loaded = ref(false);

  /**
   * ★ 候选池专用的**全量**模型清单（跨所有平台）。
   *
   * 为什么不能直接用 platformStore.models：store.loadModels(pid) 会整体替换共享缓存
   * 为单平台清单（设置页切默认平台、平台详情页进详情都会触发）→ 候选池下拉变空。
   * 这里自己拉一份 /platforms/all-models，与 platformStore 互不影响。
   */
  const allModels = ref<Model[]>([]);
  const modelsLoaded = ref(false);

  async function ensureModels(): Promise<void> {
    if (modelsLoaded.value) return;
    const r = await api.get<any>('/platforms/all-models');
    if ('error' in r || !Array.isArray(r.data)) return;
    allModels.value = (r.data as any[]).map(rowToModel);
    modelsLoaded.value = true;
  }

  /** 读全局层 + 智能体平台层 + 生效池（一次 GET 全取回） */
  async function load(): Promise<void> {
    const r = await api.get<any>('/model-pools');
    if ('error' in r || !r.data) return;
    globalPools.value = normalize(r.data.global);
    agentPlatformPools.value = normalize(r.data.agentPlatform);
    // ★ 生效池（远端这轮的新增）：后端已按 agent→agentPlatform→global→autoPool 解析出
    //   **有序**生效候选（effective[slot][0] 为首选）。存下来供 stores/chat.ts 的
    //   vision 降级链直接按池顺序取候选 —— 与后端唯一解析出口同口径，不再漂移。
    const eff = (r.data.effective && typeof r.data.effective === 'object') ? r.data.effective : null;
    if (eff) {
      const rec: Record<string, EffectivePoolEntry[]> = {};
      for (const slot of ['llm', 'vision', 'image', 'video'] as const) {
        const arr = eff[slot];
        rec[slot] = Array.isArray(arr)
          ? arr.filter((x: any) => x && typeof x === 'object' && typeof x.modelId === 'string' && typeof x.platformId === 'string')
          : [];
      }
      effectivePools.value = rec;
    }
    loaded.value = true;
  }

  async function saveGlobal(pools: ModelPools): Promise<string | null> {
    const r = await api.put<any>('/model-pools/global', { modelPools: pools });
    if (r && 'error' in r) return (r as any).error || '保存失败';
    globalPools.value = normalize((r as any).data);
    return null;
  }

  async function saveAgentPlatform(pools: ModelPools): Promise<string | null> {
    const r = await api.put<any>('/model-pools/agent-platform', { modelPools: pools });
    if (r && 'error' in r) return (r as any).error || '保存失败';
    agentPlatformPools.value = normalize((r as any).data);
    return null;
  }

  /**
   * 生效 vision 候选（有序，[0] 首选；来自远端这轮）。
   * 池未加载/为空时返回 []，调用方自行回退旧链路（capabilities 显标模型）。
   * ★ 消费方需要 Model/Platform 对象：modelId+platformId 可在 allModels(ensureModels)
   *   与 platformStore.platforms 里解析。
   */
  function effectiveVision(): EffectivePoolEntry[] {
    return effectivePools.value?.vision || [];
  }

  return {
    globalPools, agentPlatformPools, effectivePools, loaded, allModels, modelsLoaded,
    load, saveGlobal, saveAgentPlatform, ensureModels,
    effectiveVision,
  };
});
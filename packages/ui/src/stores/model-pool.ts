// 模型候选池 store（model-candidate-pools P1）。
//
// 职责：三层池（global / platform / agent）的读写与缓存。
// ★ 回退顺序（agent → platform → global → autoPool）**不在前端实现** ——
//   前端只展示与保存；生效池一律读 GET /api/model-pools 的 effective 字段
//   （后端 services/model-pools.ts 是唯一解析出口，前端自己算必然漂移）。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type { Model, ModelPools } from '@yan-zhi/shared';
import { rowToModel } from './platform';

const EMPTY_POOLS: ModelPools = { llm: [], vision: [], image: [], video: [] };

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
  /** 全局默认池 */
  const globalPools = ref<ModelPools>({ ...EMPTY_POOLS });
  /** 各平台池（platformId → pools） */
  const platformPools = ref<Record<string, ModelPools>>({});
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

  async function load(): Promise<void> {
    const r = await api.get<any>('/model-pools');
    if ('error' in r || !r.data) return;
    globalPools.value = normalize(r.data.global);
    platformPools.value = {};
    loaded.value = true;
  }

  async function loadPlatform(pid: string): Promise<ModelPools> {
    const r = await api.get<any>(`/model-pools?platformId=${encodeURIComponent(pid)}`);
    if ('error' in r || !r.data) return { ...EMPTY_POOLS };
    const pools = normalize(r.data.platform || EMPTY_POOLS);
    platformPools.value = { ...platformPools.value, [pid]: pools };
    return pools;
  }

  async function saveGlobal(pools: ModelPools): Promise<string | null> {
    const r = await api.put<any>('/model-pools/global', { modelPools: pools });
    if (r && 'error' in r) return (r as any).error || '保存失败';
    globalPools.value = normalize((r as any).data);
    return null;
  }

  async function savePlatform(pid: string, pools: ModelPools): Promise<string | null> {
    const r = await api.put<any>(`/model-pools/platforms/${pid}`, { modelPools: pools });
    if (r && 'error' in r) return (r as any).error || '保存失败';
    platformPools.value = { ...platformPools.value, [pid]: normalize((r as any).data) };
    return null;
  }

  function platformPoolOf(pid: string): ModelPools {
    return platformPools.value[pid] || { ...EMPTY_POOLS };
  }

  return {
    globalPools, platformPools, loaded, allModels, modelsLoaded,
    load, loadPlatform, saveGlobal, savePlatform, platformPoolOf, ensureModels,
  };
});

// 模型候选池 store（model-candidate-pools P1）。
//
// 职责：三层池（global / platform / agent）的读写与缓存。
// ★ 回退顺序（agent → platform → global → autoPool）**不在前端实现** ——
//   前端只展示与保存；生效池一律读 GET /api/model-pools 的 effective 字段
//   （后端 services/model-pools.ts 是唯一解析出口，前端自己算必然漂移）。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type { ModelPools } from '@yan-zhi/shared';

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

  return { globalPools, platformPools, loaded, load, loadPlatform, saveGlobal, savePlatform, platformPoolOf };
});

// 「存为草稿」的落库真实性守门（2026-10-15，P2-12 补强）
// ★ 钉住的缺陷：distill store 的 persistTask 是刻意 fail-safe 的（失败不抛、主流程继续），
//   于是「没存上」会被上游一律当成「已存为草稿」——弹窗报成功，用户下次进页面
//   （loadTasks 从服务端重建列表）草稿凭空消失，全程零提示。
//   实测触发面不小：服务端不可达时 api 客户端返回的是 `{ error, status: 0 }` **错误信封而不是抛错**，
//   连调用方的 catch 都进不去——所以判据必须同时覆盖「错误信封」和「真抛错」两条路。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// ---- 轻量桩：只关心 saveMdAsDraft 的落库判定，不拉真实依赖链（同 skill.test.ts 的做法）----
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@yan-zhi/core', () => ({
  getPlatformAdapter: () => ({ keyring: { get: async () => null, set: async () => undefined } }),
  LlmClient: class { async chat() { return { delta: { content: '' } }; } },
}));
vi.mock('./skill', () => ({ useSkillStore: () => ({ createCustom: vi.fn() }) }));
vi.mock('./platform', () => ({ usePlatformStore: () => ({ platforms: [], resolveModel: () => null }) }));
vi.mock('./settings', () => ({ useSettingsStore: () => ({ settings: {} }) }));

import { api } from '../api/client';

/** useDistillStore 是 setup store，必须先激活 pinia 实例（否则 store 初始化即抛）。 */
async function freshStore() {
  vi.resetModules();
  setActivePinia(createPinia());
  const mod = await import('./distill');
  return mod.useDistillStore();
}

describe('distill store · 「存为草稿」落库才算成功', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('服务端回 id → 返回服务端 id，任务标记为已持久化', async () => {
    (api.post as any).mockResolvedValue({ data: { id: 'srv_draft_1' } });
    const store = await freshStore();

    const id = await store.saveMdAsDraft('---\nname: demo\n---\n正文', '演示技能');

    expect(id).toBe('srv_draft_1');
    expect(store.tasks.length).toBe(1);
    expect(store.tasks[0].persisted).toBe(true);
    expect(store.tasks[0].title).toBe('演示技能');
    expect(store.tasks[0].status).toBe('draft');
  });

  it('★ 服务端不可达（错误信封而非抛错）→ 抛错，且不留幻影草稿', async () => {
    (api.post as any).mockResolvedValue({ error: 'NETWORK_UNREACHABLE', status: 0 });
    const store = await freshStore();

    await expect(store.saveMdAsDraft('# 技能')).rejects.toThrow(/未保存成功/);
    expect(store.tasks.length, '幻影草稿必须清掉，否则列表里挂一条刷新就没的条目').toBe(0);
  });

  it('★ 服务端 5xx 真抛错 → 同样抛错且不留幻影草稿', async () => {
    (api.post as any).mockRejectedValue(new Error('HTTP 500'));
    const store = await freshStore();

    await expect(store.saveMdAsDraft('# 技能')).rejects.toThrow(/未保存成功/);
    expect(store.tasks.length).toBe(0);
  });
});

// 场景（模式）配置 store —— 运行时权威 = 后端 scene_config 表。
//
// 背景：场景原先写死在 config/scenes.ts，新增「模式」必须改前端代码。2026-10-12 起：
//   - 后端建 scene_config 表（内置种子 builtin-scene-defs.ts + /api/scene-configs CRUD）；
//   - 本 store 启动时拉取后端列表，映射成 SceneDef[]（icon 字符串 → Component）；
//   - 用户/应用 POST /api/scene-configs 即可动态新增「模式」行
//     （绑任意 agentId + 场景提示词 + skill 关键词 + 欢迎卡示例），前端刷新后立即可见。
//
// 兜底：初始值 = scenes.ts 的内置默认（首屏/离线立即可见，不会白屏）；
//       拉取失败时**保留现值不清空**（与 agent store 的 loadAgents 同纪律，
//       瞬态网络错误把场景洗成 [] 会直接让欢迎卡消失）。
import { defineStore } from 'pinia';
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { SCENES, type SceneDef, type SceneKey } from '../config/scenes';
import { resolveSceneIcon } from '../config/sceneIcon';
import { api } from '../api/client';

/** 自建「模式」行的创建入参 */
export interface SceneCreateInput {
  key: string;
  name: string;
  agentId?: string;
  icon?: string;
  color?: string;
  description?: string;
  prompt?: string;
  skillKeywords?: string[];
  examples?: string[];
  isMode?: boolean;
  sortOrder?: number;
}

/**
 * store 的显式返回类型。
 * ★ 为什么必须注解（TS2742）：基座 tsconfig 开了 declaration:true，setup store 的推断类型
 *   要过声明导出的「可命名性」检查——SceneDef.icon 是 vue 的 Component，深链路经
 *   .pnpm/@vue+shared 不可移植 → 推断失败。显式注解后声明只引用本接口，不再推断。
 */
export interface SceneConfigStoreApi {
  scenes: Ref<SceneDef[]>;
  loaded: Ref<boolean>;
  welcomeScenes: ComputedRef<SceneDef[]>;
  sceneByKey: (key: string) => SceneDef | null;
  loadScenes: () => Promise<void>;
  createScene: (data: SceneCreateInput) => Promise<string>;
  updateScene: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteScene: (id: string) => Promise<void>;
  resetScene: (id: string) => Promise<void>;
}

/** 后端 scene_config 行 → 前端 SceneDef（icon 字符串转 Component） */
function rowToSceneDef(r: any): SceneDef {
  const parseArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v !== 'string') return [];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };
  return {
    key: String(r.key || ''),
    label: String(r.name || ''),
    icon: resolveSceneIcon(r.icon),
    color: String(r.color || '#3b82f6'),
    desc: String(r.description || ''),
    examples: parseArr(r.examples_json),
    agentId: String(r.agent_id || ''),
    prompt: String(r.prompt || ''),
    skillKeywords: parseArr(r.skill_keywords_json),
    isMode: !!r.is_mode,
  };
}

export const useSceneConfigStore = defineStore('sceneConfig', (): SceneConfigStoreApi => {
  /** 当前场景列表（SceneDef 形态）。初始 = scenes.ts 内置兜底，loadScenes 成功后替换。 */
  const scenes = ref<SceneDef[]>([...SCENES]);
  const loaded = ref(false);
  let loadInflight: Promise<void> | null = null;

  /** 按 key 查场景（找不到返回 null；动态新增的 key 同样可查） */
  function sceneByKey(key: string): SceneDef | null {
    if (!key) return null;
    return scenes.value.find((s) => s.key === key) || null;
  }

  /** 欢迎卡子集：排除模式场景（isMode），与后端 scene_config.is_mode 同口径 */
  const welcomeScenes = computed(() => scenes.value.filter((s) => !s.isMode));

  async function loadScenes(): Promise<void> {
    if (loadInflight) return loadInflight;
    loadInflight = (async () => {
      try {
        const r = await api.get<any[]>('/scene-configs');
        if ('error' in r || !('data' in r)) return; // 失败保留现值（不清空）
        const rows: any[] = Array.isArray(r.data) ? r.data : [];
        if (rows.length === 0) return; // 空列表不替换（后端 seed 异常时至少保留内置兜底）
        scenes.value = rows.map(rowToSceneDef);
        loaded.value = true;
      } finally {
        loadInflight = null;
      }
    })();
    return loadInflight;
  }

  // ── 以下 CRUD 供「模式管理」类 UI / 应用脚本使用（UI 入口另行建设） ──

  async function createScene(data: SceneCreateInput): Promise<string> {
    const r = await api.post<any>('/scene-configs', data);
    if ('error' in r) throw new Error((r as any).error || '创建失败');
    await loadScenes();
    return String((r.data as any)?.id || '');
  }

  async function updateScene(id: string, patch: Record<string, unknown>): Promise<void> {
    const r = await api.patch<any>(`/scene-configs/${id}`, patch);
    if ('error' in r) throw new Error((r as any).error || '更新失败');
    await loadScenes();
  }

  async function deleteScene(id: string): Promise<void> {
    const r = await api.delete(`/scene-configs/${id}`);
    if ('error' in r) throw new Error((r as any).error || '删除失败');
    await loadScenes();
  }

  async function resetScene(id: string): Promise<void> {
    const r = await api.post<any>(`/scene-configs/${id}/reset`);
    if ('error' in r) throw new Error((r as any).error || '恢复默认失败');
    await loadScenes();
  }

  return {
    scenes,
    loaded,
    welcomeScenes,
    sceneByKey,
    loadScenes,
    createScene,
    updateScene,
    deleteScene,
    resetScene,
  };
});

/** 兼容旧引用的类型再导出（SceneKey 仍表示内置键集合；动态 key 用 string） */
export type { SceneDef, SceneKey };

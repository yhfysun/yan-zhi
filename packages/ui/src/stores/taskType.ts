// 任务类型配置 store —— 运行时权威 = 后端 task_type 表。
//
// 背景：任务类型原先写死在 shared 的 TASK_TYPES，新增/改 SOP 必须改代码 + 发版 + 重新打包。
// 2026-10-14 起：
//   - 后端建 task_type 表（内置种子 = shared 的 TASK_TYPES re-export + /api/task-types CRUD）；
//   - 本 store 启动时拉取后端列表，映射成 TaskTypeSpec[]；
//   - **用户 / 应用 / 大模型** POST /api/task-types 即可动态新建任务类型
//     （绑任意 agentId + skill 挂载 + SOP 步骤 + 父任务），前端刷新后立即可见，不必发版。
//
// 兜底：初始值 = shared 的 TASK_TYPES（首屏/离线立即可见，不会白屏）；
//       拉取失败时**保留现值不清空**（与 sceneConfig 同纪律：瞬态网络错误把类型洗成 []
//       会让目录的任务类型下拉空掉，表现为"我配的类型没了"）。
import { defineStore } from 'pinia';
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { TASK_TYPES, taskTypeFromRow, type TaskTypeSpec } from '@yan-zhi/shared';
import { api } from '../api/client';

/** 自建类型的创建入参（与后端 routes/task-types.ts 的 POST 入参一致） */
export interface TaskTypeCreateInput {
  key: string;
  label: string;
  summary?: string;
  guide?: string;
  agentId?: string;
  skillIds?: string[];
  parentKey?: string;
  steps?: TaskTypeSpec['steps'];
  sortOrder?: number;
}

/**
 * store 的显式返回类型。
 * ★ 为什么必须注解（TS2742）：基座 tsconfig 开了 declaration:true，setup store 的推断类型
 *   要过"可命名性"检查 —— 含 vue Component 的类型链路经 .pnpm/@vue+shared 不可移植。
 *   本 store 不返回 Component（与 sceneConfig 不同），但显式注解同样能防推断走偏。
 */
export interface TaskTypeStoreApi {
  taskTypes: Ref<TaskTypeSpec[]>;
  loaded: Ref<boolean>;
  rootTaskTypes: ComputedRef<TaskTypeSpec[]>;
  childrenOf: (key: string) => TaskTypeSpec[];
  isParent: (key: string) => boolean;
  byKey: (key: string | null | undefined) => TaskTypeSpec | null;
  loadTaskTypes: () => Promise<void>;
  createTaskType: (data: TaskTypeCreateInput) => Promise<string>;
  deleteTaskType: (id: string) => Promise<void>;
}

export const useTaskTypeStore = defineStore('taskType', (): TaskTypeStoreApi => {
  // 初始值 = 内置默认（首屏立即可用），拉取成功后被库行整体替换
  const taskTypes = ref<TaskTypeSpec[]>([...TASK_TYPES]);
  const loaded = ref(false);

  async function loadTaskTypes() {
    try {
      const r: any = await api.get('/task-types');
      const rows = Array.isArray(r?.data) ? r.data : (Array.isArray(r?.data?.data) ? r.data.data : []);
      if (!rows.length) return;                       // 空响应不清空（防止瞬态失败洗掉内置）
      const specs = rows.map((row: any) => taskTypeFromRow(row)).filter((t: TaskTypeSpec) => !!t.id);
      // 库里缺的内置 key 补齐（种子还没跑/被删），保证下拉与提示词口径一致
      for (const t of TASK_TYPES) {
        if (!specs.some((s: TaskTypeSpec) => s.id === t.id)) specs.push(t);
      }
      taskTypes.value = specs;
      loaded.value = true;
    } catch { /* 拉取失败保留内置默认，不阻断界面 */ }
  }

  function byKey(key: string | null | undefined): TaskTypeSpec | null {
    if (!key) return null;
    return taskTypes.value.find((t) => t.id === key) || TASK_TYPES.find((t) => t.id === key) || null;
  }

  return {
    taskTypes,
    loaded,
    rootTaskTypes: computed(() => taskTypes.value.filter((t) => !t.parentId)),
    // id=parent（独立「父任务」类型）→ 全部具体类型都可选；业务父类型 → 只返回注册的子线
    childrenOf: (key: string) => {
      if (key === 'parent') {
        return taskTypes.value.filter((t) => t.id !== 'parent' && !t.parentId && !taskTypes.value.some((c) => c.parentId === t.id));
      }
      return taskTypes.value.filter((t) => t.parentId === key);
    },
    isParent: (key: string) => key === 'parent' || taskTypes.value.some((t) => t.parentId === key),
    byKey,
    loadTaskTypes,
    async createTaskType(data: TaskTypeCreateInput): Promise<string> {
      const r: any = await api.post('/task-types', data);
      await loadTaskTypes();
      return String(r?.data?.id || r?.data?.data?.id || `tt_${data.key}`);
    },
    async deleteTaskType(id: string): Promise<void> {
      await api.delete(`/task-types/${encodeURIComponent(id)}`);
      await loadTaskTypes();
    },
  };
});

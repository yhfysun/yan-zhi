// 定时任务 store —— 对话定时任务管理（服务器模式走 API，本地模式走 adapter.db）
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getPlatformAdapter } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useAuthStore } from './auth';

/** 对话定时任务 */
export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  cronExpr?: string | null;
  intervalMinutes?: number | null;
  conversationId?: string | null;
  /** 绑定的智能体：决定任务发起会话的智能体上下文 */
  agentId?: string | null;
  /** 绑定的模型平台：与 modelId 共同决定调用哪个模型 */
  platformId?: string | null;
  /** 绑定的模型：覆盖智能体默认模型 */
  modelId?: string | null;
  /** 绑定的空间：任务发起会话归属的空间 */
  spaceId?: string | null;
  /** 任务类型：chat=对话式（ReAct 循环）；workflow=工作流 */
  taskType?: 'chat' | 'workflow';
  /** 工作流智能体 id（仅 workflow 类型；用于界面展示名称） */
  workflowAgentId?: string | null;
  /** 工作流定义 bundle（仅 workflow 类型；随任务存后端，前端关闭也能跑） */
  workflowBundle?: { agent: any; subAgents?: Record<string, any> } | null;
  /** 工作流输入（仅 workflow 类型） */
  workflowInputs?: Record<string, unknown> | null;
  enabled: boolean;
  lastRunAt?: number | null;
  nextRunAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface ScheduledTaskInput {
  name: string;
  prompt: string;
  intervalMinutes?: number | null;
  cronExpr?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  platformId?: string | null;
  modelId?: string | null;
  spaceId?: string | null;
  taskType?: 'chat' | 'workflow';
  workflowAgentId?: string | null;
  workflowBundle?: { agent: any; subAgents?: Record<string, any> } | null;
  workflowInputs?: Record<string, unknown> | null;
  enabled?: boolean;
}

function rowToTask(r: any): ScheduledTask {
  return {
    id: r.id,
    name: r.name,
    prompt: r.prompt ?? '',
    cronExpr: r.cron_expr ?? r.cronExpr ?? null,
    intervalMinutes: r.interval_minutes ?? r.intervalMinutes ?? null,
    conversationId: r.conversation_id ?? r.conversationId ?? null,
    agentId: r.agent_id ?? r.agentId ?? null,
    platformId: r.platform_id ?? r.platformId ?? null,
    modelId: r.model_id ?? r.modelId ?? null,
    spaceId: r.space_id ?? r.spaceId ?? null,
    taskType: (r.task_type ?? r.taskType ?? 'chat') as 'chat' | 'workflow',
    workflowAgentId: r.workflow_agent_id ?? r.workflowAgentId ?? null,
    workflowBundle: r.workflow_bundle_json ? (typeof r.workflow_bundle_json === 'string' ? JSON.parse(r.workflow_bundle_json) : r.workflow_bundle_json) : r.workflowBundle ?? null,
    workflowInputs: r.workflow_inputs_json ? (typeof r.workflow_inputs_json === 'string' ? JSON.parse(r.workflow_inputs_json) : r.workflow_inputs_json) : r.workflowInputs ?? null,
    enabled: !!(r.enabled ?? 1),
    lastRunAt: r.last_run_at ?? r.lastRunAt ?? null,
    nextRunAt: r.next_run_at ?? r.nextRunAt ?? null,
    createdAt: r.created_at ?? r.createdAt,
    updatedAt: r.updated_at ?? r.updatedAt,
  };
}

export const useScheduledTaskStore = defineStore('scheduledTask', () => {
  const tasks = ref<ScheduledTask[]>([]);
  const loading = ref(false);
  /** 定时任务弹窗显隐（顶栏按钮触发） */
  const dialogVisible = ref(false);

  const isServerMode = () => useAuthStore().useServerApi;

  async function loadTasks() {
    loading.value = true;
    try {
      if (isServerMode()) {
        const r = await api.get<any[]>('/scheduled-tasks');
        if ('data' in r) {
          tasks.value = (r.data as any[]).map(rowToTask);
        }
      } else {
        const adapter = getPlatformAdapter();
        const rows = await adapter.db.query<any>('SELECT * FROM scheduled_task ORDER BY created_at DESC');
        tasks.value = rows.map(rowToTask);
      }
    } finally {
      loading.value = false;
    }
  }

  async function createTask(input: ScheduledTaskInput): Promise<ScheduledTask> {
    if (isServerMode()) {
      const r = await api.post<any>('/scheduled-tasks', input);
      if ('data' in r) {
        const task = rowToTask(r.data);
        tasks.value.unshift(task);
        return task;
      }
      throw new Error((r as { error?: string }).error || '创建定时任务失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('st_');
    const now = Date.now();
    const enabled = input.enabled !== false;
    const taskType = input.taskType === 'workflow' ? 'workflow' : 'chat';
    await adapter.db.exec(
      'INSERT INTO scheduled_task (id, name, prompt, cron_expr, interval_minutes, conversation_id, agent_id, platform_id, model_id, space_id, task_type, workflow_bundle_json, workflow_inputs_json, workflow_agent_id, enabled, last_run_at, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, input.name, input.prompt || null, input.cronExpr || null, input.intervalMinutes || null,
        input.conversationId || null, input.agentId || null, input.platformId || null, input.modelId || null, input.spaceId || null,
        taskType,
        taskType === 'workflow' ? JSON.stringify(input.workflowBundle || null) : null,
        taskType === 'workflow' ? JSON.stringify(input.workflowInputs || {}) : null,
        taskType === 'workflow' ? input.workflowAgentId || null : null,
        enabled ? 1 : 0, null,
        enabled && input.intervalMinutes ? now + input.intervalMinutes * 60000 : null, now, now],
    );
    await loadTasks();
    return tasks.value.find((t) => t.id === id) || rowToTask({ id, ...input });
  }

  async function updateTask(id: string, patch: Partial<ScheduledTaskInput>) {
    if (isServerMode()) {
      const r = await api.patch(`/scheduled-tasks/${id}`, patch);
      if ('error' in r) throw new Error((r as { error?: string }).error || '更新定时任务失败');
    } else {
      const adapter = getPlatformAdapter();
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name); }
      if (patch.prompt !== undefined) { sets.push('prompt = ?'); params.push(patch.prompt || null); }
      if (patch.cronExpr !== undefined) { sets.push('cron_expr = ?'); params.push(patch.cronExpr || null); }
      if (patch.intervalMinutes !== undefined) { sets.push('interval_minutes = ?'); params.push(patch.intervalMinutes || null); }
      if (patch.conversationId !== undefined) { sets.push('conversation_id = ?'); params.push(patch.conversationId || null); }
      if (patch.agentId !== undefined) { sets.push('agent_id = ?'); params.push(patch.agentId || null); }
      if (patch.platformId !== undefined) { sets.push('platform_id = ?'); params.push(patch.platformId || null); }
      if (patch.modelId !== undefined) { sets.push('model_id = ?'); params.push(patch.modelId || null); }
      if (patch.spaceId !== undefined) { sets.push('space_id = ?'); params.push(patch.spaceId || null); }
      if (patch.taskType !== undefined) { sets.push('task_type = ?'); params.push(patch.taskType === 'workflow' ? 'workflow' : 'chat'); }
      if (patch.workflowAgentId !== undefined) { sets.push('workflow_agent_id = ?'); params.push(patch.workflowAgentId || null); }
      if (patch.workflowBundle !== undefined) { sets.push('workflow_bundle_json = ?'); params.push(patch.workflowBundle ? JSON.stringify(patch.workflowBundle) : null); }
      if (patch.workflowInputs !== undefined) { sets.push('workflow_inputs_json = ?'); params.push(patch.workflowInputs ? JSON.stringify(patch.workflowInputs) : null); }
      if (patch.enabled !== undefined) { sets.push('enabled = ?'); params.push(patch.enabled ? 1 : 0); }
      if (sets.length === 0) return;
      sets.push('updated_at = ?'); params.push(Date.now());
      params.push(id);
      await adapter.db.exec(`UPDATE scheduled_task SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    await loadTasks();
  }

  /** 删除任务（不影响已产生的会话） */
  async function deleteTask(id: string) {
    if (isServerMode()) {
      await api.delete(`/scheduled-tasks/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM scheduled_task WHERE id = ?', [id]);
    }
    await loadTasks();
  }

  /** 立即运行一次（服务端执行；本地模式无调度器，返回错误提示） */
  async function runTask(id: string): Promise<{ ok: boolean; error?: string; conversationId?: string }> {
    if (!isServerMode()) {
      return { ok: false, error: '本地模式不支持运行定时任务，请登录后使用' };
    }
    const r = await api.post<any>(`/scheduled-tasks/${id}/run`);
    if ('data' in r) {
      await loadTasks();
      return { ok: true, conversationId: (r.data as any).conversationId };
    }
    return { ok: false, error: (r as { error?: string }).error || '任务执行失败' };
  }

  return {
    tasks, loading, dialogVisible,
    loadTasks, createTask, updateTask, deleteTask, runTask,
  };
});

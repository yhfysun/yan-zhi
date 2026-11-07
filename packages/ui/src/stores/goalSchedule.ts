import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { GoalSchedule, GoalScheduleRun } from '@yan-zhi/shared';
import { api } from '../api/client';

export interface GoalScheduleInput {
  name: string;
  conversationId: string;
  templateId?: string | null;
  goalId?: string | null;
  objective?: string;
  agentId?: string | null;
  platformId: string;
  modelId: string;
  spaceId?: string | null;
  intervalMinutes?: number | null;
  cronExpr?: string | null;
  enabled?: boolean;
}

export interface GoalSchedulePatch {
  name?: string;
  agentId?: string | null;
  platformId?: string;
  modelId?: string;
  intervalMinutes?: number | null;
  cronExpr?: string | null;
  enabled?: boolean;
}

export interface GoalScheduleMaterializeResult {
  created: boolean;
  run: GoalScheduleRun;
  goal: {
    id: string;
    conversationId: string;
  } | null;
  goalId: string | null;
}

function errorMessage(result: any, fallback: string): string {
  return String(result?.error || fallback);
}

export const useGoalScheduleStore = defineStore('goalSchedule', () => {
  const schedules = ref<GoalSchedule[]>([]);
  const loading = ref(false);

  function upsert(schedule: GoalSchedule): void {
    schedules.value = [schedule, ...schedules.value.filter((item) => item.id !== schedule.id)];
  }

  async function loadSchedules(): Promise<GoalSchedule[]> {
    loading.value = true;
    try {
      const result: any = await api.get<any>('/llm/goal-schedules');
      if (result?.error) throw new Error(errorMessage(result, '加载目标计划失败'));
      const list = (result?.data ?? result) as GoalSchedule[];
      schedules.value = Array.isArray(list) ? list : [];
      return schedules.value;
    } finally {
      loading.value = false;
    }
  }

  async function createSchedule(input: GoalScheduleInput): Promise<GoalSchedule> {
    const result: any = await api.post<any>('/llm/goal-schedules', input);
    if (result?.error) throw new Error(errorMessage(result, '创建目标计划失败'));
    const schedule = (result?.data ?? result) as GoalSchedule;
    if (!schedule?.id) throw new Error('创建目标计划失败');
    upsert(schedule);
    return schedule;
  }

  async function updateSchedule(id: string, patch: GoalSchedulePatch): Promise<GoalSchedule> {
    const result: any = await api.patch<any>(`/llm/goal-schedules/${encodeURIComponent(id)}`, patch);
    if (result?.error) throw new Error(errorMessage(result, '更新目标计划失败'));
    const schedule = (result?.data ?? result) as GoalSchedule;
    if (!schedule?.id) throw new Error('更新目标计划失败');
    upsert(schedule);
    return schedule;
  }

  async function deleteSchedule(id: string): Promise<void> {
    const result: any = await api.delete<any>(`/llm/goal-schedules/${encodeURIComponent(id)}`);
    if (result?.error) throw new Error(errorMessage(result, '删除目标计划失败'));
    schedules.value = schedules.value.filter((item) => item.id !== id);
  }

  async function runSchedule(id: string): Promise<GoalScheduleMaterializeResult> {
    const result: any = await api.post<any>(`/llm/goal-schedules/${encodeURIComponent(id)}/run`);
    if (result?.error) throw new Error(errorMessage(result, '运行目标计划失败'));
    await loadSchedules();
    return (result?.data ?? result) as GoalScheduleMaterializeResult;
  }

  async function loadRuns(id: string, limit = 100): Promise<GoalScheduleRun[]> {
    const result: any = await api.get<any>(`/llm/goal-schedules/${encodeURIComponent(id)}/runs?limit=${limit}`);
    if (result?.error) throw new Error(errorMessage(result, '加载目标计划记录失败'));
    const list = (result?.data ?? result) as GoalScheduleRun[];
    return Array.isArray(list) ? list : [];
  }

  return {
    schedules,
    loading,
    loadSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runSchedule,
    loadRuns,
  };
});

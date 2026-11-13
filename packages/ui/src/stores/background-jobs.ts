import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../api/client';

export interface BackgroundJobView {
  jobId: string;
  kind: 'browser_download' | 'python_process' | 'command_process' | 'package_build' | string;
  status: string;
  wakePolicy: 'resume' | 'notify' | 'silent' | string;
  title: string;
  progress?: number | null;
  bytesDone?: number;
  bytesTotal?: number | null;
  speedBps?: number | null;
  etaMs?: number | null;
  etaAt?: number | null;
  artifactPaths?: string[];
  error?: string | null;
  controlCapabilities?: { pause?: boolean; resume?: boolean; cancel?: boolean };
  createdAt?: number;
  updatedAt?: number;
  terminalAt?: number | null;
  terminalVersion?: number;
}

export function upsertJobList(list: BackgroundJobView[], job: BackgroundJobView): BackgroundJobView[] {
  if (!job?.jobId) return list;
  const next = [...list];
  const index = next.findIndex(item => item.jobId === job.jobId);
  if (index >= 0) next[index] = { ...next[index], ...job };
  else next.push(job);
  next.sort((a, b) => {
    if ((a.terminalAt || 0) > 0 && !(b.terminalAt || 0)) return 1;
    if ((b.terminalAt || 0) > 0 && !(a.terminalAt || 0)) return -1;
    return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
  });
  return next.slice(0, 30);
}

export const useBackgroundJobsStore = defineStore('backgroundJobs', () => {
  const jobsByConv = ref<Record<string, BackgroundJobView[]>>({});
  const loadingByConv = ref<Record<string, boolean>>({});
  const controllingJobId = ref('');

  const currentJobs = (conversationId: string) => computed(() => jobsByConv.value[conversationId] || []);

  function upsert(conversationId: string, job: BackgroundJobView): void {
    if (!conversationId || !job?.jobId) return;
    jobsByConv.value[conversationId] = upsertJobList(jobsByConv.value[conversationId] || [], job);
  }

  async function load(conversationId: string): Promise<void> {
    if (!conversationId || loadingByConv.value[conversationId]) return;
    loadingByConv.value[conversationId] = true;
    try {
      const result: any = await api.get<any>(`/background-jobs?conversationId=${encodeURIComponent(conversationId)}&limit=30`);
      if (result?.error) return;
      const rows = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
      let merged = jobsByConv.value[conversationId] || [];
      for (const row of rows) merged = upsertJobList(merged, row);
      jobsByConv.value[conversationId] = merged;
    } catch {
      // The card is an enhancement; task execution and wake-up must not depend on this fetch.
    } finally {
      loadingByConv.value[conversationId] = false;
    }
  }

  async function control(jobId: string, operation: 'pause' | 'resume' | 'cancel'): Promise<{ ok: boolean; error?: string }> {
    if (!jobId || controllingJobId.value) return { ok: false, error: '有另一个控制操作正在进行' };
    controllingJobId.value = jobId;
    try {
      const result: any = await api.post<any>(`/background-jobs/${encodeURIComponent(jobId)}/control`, { operation });
      if (result?.error) return { ok: false, error: String(result.error) };
      const data = result?.data || result || {};
      const job = data.job || result?.job;
      if (job) {
        const convId = String(job.conversationId || '');
        if (convId) upsert(convId, job);
      }
      return { ok: data.ok !== false, error: data.error ? String(data.error) : undefined };
    } catch (error: any) {
      return { ok: false, error: String(error?.message || error) };
    } finally {
      controllingJobId.value = '';
    }
  }

  async function wake(jobId: string): Promise<{ ok: boolean; error?: string }> {
    if (!jobId || controllingJobId.value) return { ok: false, error: '有另一个任务操作正在进行' };
    controllingJobId.value = jobId;
    try {
      const result: any = await api.post<any>(`/background-jobs/${encodeURIComponent(jobId)}/wake`, {});
      if (result?.error) return { ok: false, error: String(result.error) };
      const data = result?.data || result || {};
      const job = data.job;
      if (job) {
        const convId = String(job.conversationId || '');
        if (convId) upsert(convId, job);
      }
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: String(error?.message || error) };
    } finally {
      controllingJobId.value = '';
    }
  }

  function dropConversation(conversationId: string): void {
    if (!conversationId) return;
    delete jobsByConv.value[conversationId];
    delete loadingByConv.value[conversationId];
  }

  return {
    jobsByConv,
    loadingByConv,
    controllingJobId,
    currentJobs,
    upsert,
    load,
    control,
    wake,
    dropConversation,
  };
});

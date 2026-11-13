import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  AutomationRunRecord,
  AutomationScriptDraft,
  AutomationScriptRecord,
} from '@yan-zhi/shared';
import { api } from '../api/client';

export function scriptRecordToDraft(record: AutomationScriptRecord): AutomationScriptDraft {
  return {
    schemaVersion: 1,
    name: record.name,
    ...(record.description ? { description: record.description } : {}),
    kind: record.kind,
    params: record.params.map((param) => ({ ...param })),
    steps: record.steps.map((step) => ({ ...step })),
    ...(record.tags ? { tags: [...record.tags] } : {}),
  };
}

export const useAutomationStore = defineStore('automation', () => {
  const scripts = ref<AutomationScriptRecord[]>([]);
  const runs = ref<AutomationRunRecord[]>([]);
  const current = ref<AutomationScriptRecord | null>(null);
  const activeRun = ref<AutomationRunRecord | null>(null);
  const loading = ref(false);
  const error = ref('');

  const publishedCount = computed(() => scripts.value.filter((script) => script.publishedVersion).length);
  const draftCount = computed(() => scripts.value.filter((script) => !script.publishedVersion || script.status === 'draft').length);

  function mergeScript(record: AutomationScriptRecord): AutomationScriptRecord {
    const index = scripts.value.findIndex((item) => item.id === record.id);
    if (index >= 0) scripts.value.splice(index, 1, record);
    else scripts.value.unshift(record);
    current.value = record;
    return record;
  }

  async function loadScripts(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const response = await api.get<AutomationScriptRecord[]>('/automation/scripts');
      if ('error' in response) {
        error.value = response.error;
        return;
      }
      scripts.value = Array.isArray(response.data) ? response.data : [];
    } finally {
      loading.value = false;
    }
  }

  async function getScript(id: string, version?: number): Promise<AutomationScriptRecord | null> {
    const suffix = version ? `?version=${version}` : '';
    const response = await api.get<AutomationScriptRecord>(`/automation/scripts/${encodeURIComponent(id)}${suffix}`);
    if ('error' in response) {
      error.value = response.error;
      return null;
    }
    current.value = response.data;
    return response.data;
  }

  async function createScript(draft: AutomationScriptDraft): Promise<AutomationScriptRecord> {
    const response = await api.post<AutomationScriptRecord>('/automation/scripts', draft);
    if ('error' in response) throw new Error(response.error);
    return mergeScript(response.data);
  }

  async function saveScript(id: string, draft: AutomationScriptDraft): Promise<AutomationScriptRecord> {
    const response = await api.patch<AutomationScriptRecord>(`/automation/scripts/${encodeURIComponent(id)}`, draft);
    if ('error' in response) throw new Error(response.error);
    return mergeScript(response.data);
  }

  async function publishScript(id: string): Promise<AutomationScriptRecord> {
    const response = await api.post<AutomationScriptRecord>(`/automation/scripts/${encodeURIComponent(id)}/publish`);
    if ('error' in response) throw new Error(response.error);
    return mergeScript(response.data);
  }

  async function deleteScript(id: string): Promise<void> {
    const response = await api.delete(`/automation/scripts/${encodeURIComponent(id)}`);
    if ('error' in response) throw new Error(response.error);
    scripts.value = scripts.value.filter((script) => script.id !== id);
    if (current.value?.id === id) current.value = null;
  }

  async function startRecording(url: string): Promise<{ id: string; status: string; events: unknown[] }> {
    const response = await api.post<any>('/automation/recordings', { url });
    if ('error' in response) throw new Error(response.error);
    return response.data;
  }

  async function drainRecording(id: string): Promise<{ id: string; status: string; events: unknown[] }> {
    const response = await api.post<any>(`/automation/recordings/${encodeURIComponent(id)}/drain`);
    if ('error' in response) throw new Error(response.error);
    return response.data;
  }

  async function stopRecording(id: string): Promise<AutomationScriptDraft> {
    const response = await api.post<any>(`/automation/recordings/${encodeURIComponent(id)}/stop`);
    if ('error' in response) throw new Error(response.error);
    if (!response.data?.draft) throw new Error('录制没有生成可用脚本');
    return response.data.draft as AutomationScriptDraft;
  }

  async function cancelRecording(id: string): Promise<void> {
    const response = await api.post(`/automation/recordings/${encodeURIComponent(id)}/cancel`);
    if ('error' in response) throw new Error(response.error);
  }

  async function startRun(
    id: string,
    input: Record<string, unknown>,
    options: { test?: boolean } = {},
  ): Promise<AutomationRunRecord> {
    const response = await api.post<AutomationRunRecord>(
      `/automation/scripts/${encodeURIComponent(id)}/runs`,
      { input, test: options.test === true },
    );
    if ('error' in response) throw new Error(response.error);
    activeRun.value = response.data;
    runs.value.unshift(response.data);
    return response.data;
  }

  async function refreshRun(runId: string): Promise<AutomationRunRecord | null> {
    const response = await api.get<AutomationRunRecord>(`/automation/runs/${encodeURIComponent(runId)}`);
    if ('error' in response) return null;
    activeRun.value = response.data;
    const index = runs.value.findIndex((run) => run.id === response.data.id);
    if (index >= 0) runs.value.splice(index, 1, response.data);
    else runs.value.unshift(response.data);
    return response.data;
  }

  async function loadRuns(scriptId?: string): Promise<void> {
    const query = scriptId ? `?scriptId=${encodeURIComponent(scriptId)}` : '';
    const response = await api.get<AutomationRunRecord[]>(`/automation/runs${query}`);
    if ('error' in response) return;
    runs.value = Array.isArray(response.data) ? response.data : [];
  }

  async function cancelRun(runId: string): Promise<void> {
    const response = await api.post(`/automation/runs/${encodeURIComponent(runId)}/cancel`);
    if ('error' in response) throw new Error(response.error);
  }

  return {
    scripts,
    runs,
    current,
    activeRun,
    loading,
    error,
    publishedCount,
    draftCount,
    loadScripts,
    getScript,
    createScript,
    saveScript,
    publishScript,
    deleteScript,
    startRecording,
    drainRecording,
    stopRecording,
    cancelRecording,
    startRun,
    refreshRun,
    loadRuns,
    cancelRun,
    scriptRecordToDraft,
  };
});

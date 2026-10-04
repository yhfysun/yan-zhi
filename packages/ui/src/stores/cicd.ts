// CICD 流水线 store（前端）
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, buildRequestHeaders } from '../api/client';
import { consumeSseStream } from '../utils/sse';
import type {
  CicdPipeline,
  CicdRun,
  PipelineTemplate,
  ProjectDetectResult,
  ProgressEvent,
  DeployTarget,
} from '@yan-zhi/shared';

export const useCicdStore = defineStore('cicd', () => {
  const pipelines = ref<CicdPipeline[]>([]);
  const runs = ref<CicdRun[]>([]);
  const templates = ref<Record<string, PipelineTemplate>>({});
  const connections = ref<Array<{ id: string; name: string; host: string; type: string; tag?: string }>>([]);
  const loaded = ref(false);

  const currentRun = ref<CicdRun | null>(null);
  const runLogs = ref<Array<{ stepId: string; stepName: string; log: string; status: string }>>([]);
  const runStepStatus = ref<Record<string, string>>({});

  async function refresh(): Promise<string | undefined> {
    const res = await api.get<CicdPipeline[]>('/plugin/cicd-pipeline/pipelines');
    if ('error' in res) return res.error;
    pipelines.value = res.data;
    loaded.value = true;
    return undefined;
  }

  async function refreshTemplates(): Promise<void> {
    const res = await api.get<Record<string, PipelineTemplate>>('/plugin/cicd-pipeline/templates');
    if ('error' in res) return;
    templates.value = res.data;
  }

  async function refreshConnections(): Promise<void> {
    const res = await api.get<Array<{ id: string; name: string; host: string; type: string; tag?: string }>>(
      '/plugin/cicd-pipeline/connections',
    );
    if ('error' in res) return;
    connections.value = res.data;
  }

  async function refreshRuns(pipelineId?: string): Promise<void> {
    const url = pipelineId
      ? `/plugin/cicd-pipeline/runs?pipelineId=${encodeURIComponent(pipelineId)}`
      : '/plugin/cicd-pipeline/runs';
    const res = await api.get<CicdRun[]>(url);
    if ('error' in res) return;
    runs.value = res.data;
  }

  async function createPipeline(data: Partial<CicdPipeline> & { name: string; projectDir: string }): Promise<CicdPipeline | string> {
    const res = await api.post<CicdPipeline>('/plugin/cicd-pipeline/pipelines', data);
    if ('error' in res) return res.error;
    await refresh();
    return res.data;
  }

  async function updatePipeline(id: string, data: Partial<CicdPipeline>): Promise<string | undefined> {
    const res = await api.put<CicdPipeline>(`/plugin/cicd-pipeline/pipelines/${id}`, data);
    if ('error' in res) return res.error;
    await refresh();
    return undefined;
  }

  async function deletePipeline(id: string): Promise<string | undefined> {
    const res = await api.delete(`/plugin/cicd-pipeline/pipelines/${id}`);
    if ('error' in res) return res.error;
    await refresh();
    return undefined;
  }

  async function detectProject(dir: string): Promise<ProjectDetectResult | string> {
    const res = await api.get<ProjectDetectResult>(`/plugin/cicd-pipeline/detect?dir=${encodeURIComponent(dir)}`);
    if ('error' in res) return res.error;
    return res.data;
  }

  /** 执行流水线（SSE 实时进度） */
  async function runPipeline(
    pipelineId: string,
    targetId?: string,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<CicdRun | string> {
    runLogs.value = [];
    runStepStatus.value = {};
    currentRun.value = null;

    return new Promise((resolve) => {
      const base = (import.meta as { env: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '/api';
      const url = `${base}/plugin/cicd-pipeline/pipelines/${pipelineId}/run`;
      const token = localStorage.getItem('token') || '';

      // EventSource 不支持 POST body，改用 fetch + ReadableStream
      fetch(url, {
        method: 'POST',
        headers: buildRequestHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }),
        body: JSON.stringify({ targetId }),
      }).then(async (resp) => {
        if (!resp.body) { resolve('无法获取流'); return; }
        // SSE 解码统一走 utils/sse（P5 收口）
        await consumeSseStream(resp.body, (payload) => {
          {
            let event: unknown;
            try { event = JSON.parse(payload); } catch { return; }
            const ev = event as ProgressEvent | { type: 'complete'; run: CicdRun };
            if (ev.type === 'complete') {
              currentRun.value = (ev as { run: CicdRun }).run;
              resolve((ev as { run: CicdRun }).run);
            } else {
              const evt = ev as ProgressEvent;
              if (evt.type === 'step-start' && evt.stepId) {
                runStepStatus.value[evt.stepId] = 'running';
              } else if (evt.type === 'step-finish' && evt.stepId) {
                runStepStatus.value[evt.stepId] = evt.status || 'success';
              } else if (evt.type === 'step-log' && evt.stepId) {
                const existing = runLogs.value.find((l) => l.stepId === evt.stepId);
                if (existing) {
                  existing.log += (evt.log || '') + '\n';
                } else {
                  runLogs.value.push({
                    stepId: evt.stepId,
                    stepName: evt.stepName || '',
                    log: (evt.log || '') + '\n',
                    status: 'running',
                  });
                }
              }
              onProgress?.(evt);
            }
          }
        });
        if (!currentRun.value) resolve('执行未完成');
      }).catch((e) => resolve((e as Error).message));
    });
  }

  return {
    pipelines,
    runs,
    templates,
    connections,
    loaded,
    currentRun,
    runLogs,
    runStepStatus,
    refresh,
    refreshTemplates,
    refreshConnections,
    refreshRuns,
    createPipeline,
    updatePipeline,
    deletePipeline,
    detectProject,
    runPipeline,
  };
});
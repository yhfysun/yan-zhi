// 工作流运行台数据层（第五模式 wf）
//
// 只负责「运行」这件事：可运行工作流清单、启动运行、SSE 订阅节点级进度、历史列表。
// 不碰会话与智能体编辑（那些在 stores/agent.ts / chat.ts）。
//
// 与 AgentCanvas 里 runAgent 的区别：那个是 1s 轮询 + 阻塞等待（编辑页里试跑），
// 这里是运行台：订阅 SSE 拿节点级事件，页面关掉也不影响后端执行。
import { ref } from 'vue';
import { api, API_BASE } from '../api/client';

export type WorkflowFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface WorkflowFieldDef {
  key: string;
  label: string;
  type: WorkflowFieldType;
  required: boolean;
  description?: string;
  options?: string[];
  default?: unknown;
}

/** 可覆盖字段的元数据（control 决定渲染成下拉还是输入框） */
export interface OverridableFieldMeta {
  key: string;
  label: string;
  control: 'model' | 'platform' | 'number' | 'string' | 'boolean';
  /** 画布上的当前值（"不覆盖就用这个"） */
  current?: unknown;
}

/** 节点「运行时可覆盖」参数（默认白名单 + 画布显式声明） */
export interface OverridableNodeDef {
  nodeId: string;
  nodeType: string;
  label: string;
  fields: OverridableFieldMeta[];
}

/** 工作流里的轻量节点（调试时选「运行到哪个节点」） */
export interface WorkflowNodeLite {
  id: string;
  type: string;
  label: string;
}

/** 调试快照：某节点的输出 */
export interface DebugSnapshot {
  nodeId: string;
  output: unknown;
}

export interface WorkflowAgentItem {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  nodes: WorkflowNodeLite[];
  fields: WorkflowFieldDef[];
  overrides: OverridableNodeDef[];
  lastRun: { id: string; status: string; createdAt: number } | null;
}

export interface WorkflowRunItem {
  id: string;
  agentId: string;
  agentName: string;
  status: string;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
  inputs?: Record<string, unknown> | null;
}

export interface WorkflowRunEvent {
  type:
    | 'run:started'
    | 'node:start'
    | 'node:ok'
    | 'node:error'
    | 'run:completed'
    | 'run:failed'
    | 'run:aborted'
    | 'run:paused';
  seq?: number;
  nodeId?: string;
  nodeType?: string;
  msg?: string;
  result?: Record<string, unknown>;
}

function unwrap<T>(r: unknown): T | null {
  if (!r) return null;
  if (typeof r === 'object' && 'data' in (r as Record<string, unknown>)) {
    return ((r as { data?: T }).data ?? null) as T | null;
  }
  return r as T;
}

const agents = ref<WorkflowAgentItem[]>([]);
const agentsLoading = ref(false);
const runs = ref<WorkflowRunItem[]>([]);
const runsLoading = ref(false);

async function loadAgents(): Promise<void> {
  agentsLoading.value = true;
  try {
    const r = await api.get<WorkflowAgentItem[]>('/workflow/agents');
    agents.value = unwrap<WorkflowAgentItem[]>(r) || [];
  } catch {
    agents.value = [];
  } finally {
    agentsLoading.value = false;
  }
}

async function loadRuns(): Promise<void> {
  runsLoading.value = true;
  try {
    const r = await api.get<WorkflowRunItem[]>('/workflow/runs?limit=50');
    runs.value = unwrap<WorkflowRunItem[]>(r) || [];
  } catch {
    runs.value = [];
  } finally {
    runsLoading.value = false;
  }
}

/** 运行前预检结果项（与后端 services/workflow-preflight.ts 对应） */
export interface PreflightIssue {
  blocking: boolean;
  nodeId?: string;
  code: string;
  msg: string;
}

async function preflight(
  agentId: string,
  inputs: Record<string, unknown>,
): Promise<{ issues: PreflightIssue[]; canStart: boolean }> {
  const r = await api.post<any>('/workflow/preflight', { agentId, inputs });
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error);
  return unwrap<any>(r) || { issues: [], canStart: true };
}

async function startRun(
  agentId: string,
  inputs: Record<string, unknown>,
  nodeOverrides?: Record<string, Record<string, unknown>>,
  force = false,
  conversationId?: string,
): Promise<{ runId: string; warnings: PreflightIssue[] }> {
  const r = await api.post<any>('/workflow/run', { agentId, inputs, nodeOverrides, force, conversationId });
  if (r && typeof r === 'object' && 'error' in r) {
    // 预检未通过：后端把问题清单放在 data.issues 里（apiFetch 现在会把 data 带出来）。
    // 只显示 error 的话用户看到的是一句笼统的「运行前检查未通过」，不知道该改什么。
    const err = new Error((r as { error: string }).error || '启动失败') as Error & { issues?: PreflightIssue[]; status?: number };
    const d = (r as { details?: { issues?: PreflightIssue[] } }).details;
    if (d?.issues?.length) err.issues = d.issues;
    err.status = (r as { status?: number }).status;
    throw err;
  }
  const d = unwrap<{ runId: string; warnings?: PreflightIssue[] }>(r);
  if (!d?.runId) throw new Error('未获取到 runId');
  return { runId: d.runId, warnings: d.warnings || [] };
}

async function fetchRun(runId: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await api.get<Record<string, unknown>>(`/workflow/runs/${runId}`);
    return unwrap<Record<string, unknown>>(r);
  } catch {
    return null;
  }
}

async function cancelRun(runId: string): Promise<void> {
  await api.post(`/workflow/runs/${runId}/cancel`, {});
}

/** 调试：跑到指定节点后暂停，返回到断点为止的节点输出快照 */
async function debugRunTo(
  agentId: string,
  inputs: Record<string, unknown>,
  stopAtNodeId: string,
  nodeOverrides?: Record<string, Record<string, unknown>>,
): Promise<{ runId: string; snapshots: DebugSnapshot[]; status: string }> {
  const r = await api.post<any>('/workflow/debug/run-to', { agentId, inputs, stopAtNodeId, nodeOverrides });
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error);
  return unwrap<any>(r) || { runId: '', snapshots: [], status: 'unknown' };
}

/** 调试：只跑一个节点（用现有快照，不重跑上游） */
async function debugRunNode(
  runId: string,
  nodeId: string,
  variableOverrides?: Record<string, unknown>,
): Promise<{ output: unknown; snapshots: DebugSnapshot[] }> {
  const r = await api.post<any>('/workflow/debug/node', { runId, nodeId, variableOverrides });
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error);
  return unwrap<any>(r) || { output: null, snapshots: [] };
}

/** 调试：从某节点继续跑下游 */
async function debugContinue(
  runId: string,
  fromNodeId: string,
  variableOverrides?: Record<string, unknown>,
): Promise<{ snapshots: DebugSnapshot[]; status: string }> {
  const r = await api.post<any>('/workflow/debug/continue', { runId, fromNodeId, variableOverrides });
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error);
  return unwrap<any>(r) || { snapshots: [], status: 'unknown' };
}

/**
 * 订阅运行事件（SSE）。返回关闭函数，组件卸载时必须调。
 * since 用于断线续传（传最后收到的 seq）。
 * 注意：本地模式 authMiddleware 恒 guest，EventSource 不需要带 token。
 */
function subscribeRun(runId: string, since: number, onEvent: (e: WorkflowRunEvent) => void): () => void {
  const es = new EventSource(`${API_BASE}/workflow/runs/${runId}/stream?since=${since}`);
  es.onmessage = (ev: MessageEvent) => {
    let data: any = null;
    try { data = JSON.parse(ev.data); } catch { return; }
    // connected 只是握手（带当前 seq 与状态），不作为事件推进 UI
    if (!data || data.type === 'connected') return;
    onEvent(data as WorkflowRunEvent);
  };
  return () => es.close();
}

const store = defineWorkflowStore();

/** 与项目其它 store 同风格：调用一次拿到同一个单例对象 */
export function useWorkflowStore() {
  return store;
}

function defineWorkflowStore() {
  return {
    agents,
    agentsLoading,
    runs,
    runsLoading,
    loadAgents,
    loadRuns,
    startRun,
    preflight,
    cancelRun,
    fetchRun,
    subscribeRun,
    debugRunTo,
    debugRunNode,
    debugContinue,
  };
}

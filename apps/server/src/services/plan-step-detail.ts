// 计划步骤运行详情 —— 按步骤时间窗聚合该步产生的工具调用。
//
// ★ 为什么在服务端做（2026-10-23 用户拍板「所有工具接口都是服务端的」）：
//   前端手里只有当前窗口内的消息（分页会丢早期步骤），而步骤可能横跨数小时、多次重连。
//   时间窗查询走 idx_message_conv(conversation_id, created_at) 索引，代价可控。
//
// ★ 时间窗的唯一来源是 task-plan-file 写入的 step.startedAt / finishedAt：
//   存量计划没有时间戳 → timingAvailable=false，返回空调用列表，**不猜**。
import { db } from '../db.js';
import { loadPlanJson, type TaskPlanStep } from './task-plan-file.js';

const WAIT_THRESHOLD_MS = 10 * 60 * 1000;
const RESULT_PREVIEW_LEN = 200;
const MAX_MESSAGES = 5000;
const MAX_TOOL_CALLS = 200;

export interface PlanStepToolCall {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;
  isError: boolean;
  resultPreview: string;
  resultLength: number;
  /** 子智能体发起的调用（parent_tool_call_id 非空时带名字） */
  subAgentName?: string;
}

export interface PlanStepDetail {
  index: number;
  title: string;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number;
  activeMs: number;
  timingAvailable: boolean;
  /** 该步耗时 ≥10 分钟且期间没有任何工具调用 → 大概率在等用户/等外部 */
  containsWait: boolean;
  toolCallCount: number;
  toolCalls: PlanStepToolCall[];
  truncated: boolean;
}

export type PlanStepDetailResult =
  | { ok: true; detail: PlanStepDetail }
  | { ok: false; code: 400 | 404; error: string };

interface MessageRow {
  id: string;
  role: string;
  content?: string | null;
  tool_calls_json?: string | null;
  tool_call_id?: string | null;
  created_at: number;
  parent_tool_call_id?: string | null;
  sub_agent_name?: string | null;
}

function isToolError(content: string): boolean {
  try {
    return !!JSON.parse(content)?.isError;
  } catch {
    return false;
  }
}

function preview(content: string): string {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  return text.length > RESULT_PREVIEW_LEN ? text.slice(0, RESULT_PREVIEW_LEN) + '…' : text;
}

function parseToolCalls(json: string | null | undefined): any[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 聚合时间窗内的工具调用（导出供单测直接喂行数据） */
export function aggregateToolCalls(
  rows: MessageRow[],
  windowEnd: number,
): { toolCalls: PlanStepToolCall[]; truncated: boolean } {
  const results = new Map<string, { at: number; content: string }>();
  for (const row of rows) {
    if (row.role === 'tool' && row.tool_call_id) {
      results.set(row.tool_call_id, { at: row.created_at, content: String(row.content || '') });
    }
  }
  const out: PlanStepToolCall[] = [];
  for (const row of rows) {
    if (row.role !== 'assistant') continue;
    for (const tc of parseToolCalls(row.tool_calls_json)) {
      const id = String(tc?.id || '');
      if (!id) continue;
      const res = results.get(id);
      const endedAt = res ? res.at : null;
      const end = endedAt ?? windowEnd;
      out.push({
        id,
        name: String(tc?.function?.name || tc?.name || '工具'),
        startedAt: row.created_at,
        endedAt,
        durationMs: Math.max(0, end - row.created_at),
        isError: res ? isToolError(res.content) : false,
        resultPreview: res ? preview(res.content) : '',
        resultLength: res ? res.content.length : 0,
        ...(row.parent_tool_call_id && row.sub_agent_name ? { subAgentName: row.sub_agent_name } : {}),
      });
    }
  }
  out.sort((a, b) => a.startedAt - b.startedAt);
  const truncated = out.length > MAX_TOOL_CALLS;
  return { toolCalls: truncated ? out.slice(0, MAX_TOOL_CALLS) : out, truncated };
}

/**
 * 构造某步的运行详情。
 * @param index 从 1 起的步骤下标（与 task_step 的 index 同口径）
 */
export function buildPlanStepDetail(conversationId: string, index: number): PlanStepDetailResult {
  if (!Number.isFinite(index) || index < 1) {
    return { ok: false, code: 400, error: '步骤下标非法（从 1 开始）' };
  }
  const plan = loadPlanJson(conversationId);
  if (!plan || !plan.steps?.length) {
    return { ok: false, code: 404, error: '当前会话没有任务计划' };
  }
  const step: TaskPlanStep | undefined = plan.steps[index - 1];
  if (!step) {
    return { ok: false, code: 404, error: `步骤下标超出范围（1-${plan.steps.length}）` };
  }

  const startedAt = Number(step.startedAt) || 0;
  const finishedAt = Number(step.finishedAt) || 0;
  const activeMs = Number(step.activeMs) || 0;
  if (!startedAt) {
    return {
      ok: true,
      detail: {
        index,
        title: String(step.title || `步骤 ${index}`),
        status: String(step.status || 'pending'),
        startedAt: null,
        finishedAt: null,
        durationMs: 0,
        activeMs,
        timingAvailable: false,
        containsWait: false,
        toolCallCount: 0,
        toolCalls: [],
        truncated: false,
      },
    };
  }

  const windowEnd = finishedAt > startedAt ? finishedAt : Date.now();
  const rows = db.prepare(
    `SELECT id, role, content, tool_calls_json, tool_call_id, created_at,
            parent_tool_call_id, sub_agent_name
       FROM message
      WHERE conversation_id = ? AND created_at >= ? AND created_at <= ?
        AND role IN ('assistant', 'tool')
      ORDER BY created_at ASC, id ASC
      LIMIT ?`,
  ).all(conversationId, startedAt, windowEnd, MAX_MESSAGES) as MessageRow[];

  const { toolCalls, truncated } = aggregateToolCalls(rows, windowEnd);
  // 返工累计 + 本次时间窗（运行中步骤的 finishedAt 为空 → 用 now 作窗口末尾）
  const currentMs = startedAt && windowEnd > startedAt ? windowEnd - startedAt : 0;
  const durationMs = activeMs + currentMs;

  return {
    ok: true,
    detail: {
      index,
      title: String(step.title || `步骤 ${index}`),
      status: String(step.status || 'pending'),
      startedAt,
      finishedAt: finishedAt || null,
      durationMs,
      activeMs,
      timingAvailable: true,
      containsWait: durationMs >= WAIT_THRESHOLD_MS && toolCalls.length === 0,
      toolCallCount: toolCalls.length,
      toolCalls,
      truncated: truncated || rows.length >= MAX_MESSAGES,
    },
  };
}

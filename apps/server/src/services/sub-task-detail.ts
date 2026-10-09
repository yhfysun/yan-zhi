/**
 * 子任务执行详情（2026-10-09）。
 *
 * ★ 需求来源：pageAgent 曾把「找不存在的置顶入口」硬试到 500 步上限，编排者（父智能体/
 *   用户）只能看到最终总结，中间怎么试的完全不可见 → 无法分析失败原因。于是要求：
 *   ① 每次委派返回一个子任务 ID；② 提供工具按 ID 查执行详情。
 *
 * ★ 子任务 ID 就是 message 表的 parent_tool_call_id：
 *   一次 call_agent / spawn_subagent 委派 = 一个 parent_tool_call_id，子智能体运行期
 *   落库的每条消息（user/assistant/tool）都已带该字段 —— 零迁移、天然按时间有序。
 *   回执由 runSubAgent 在结果末尾追加（见 llm-task-manager.ts），本模块只管查询与排版。
 *
 * 排版原则：给大模型看的失败分析材料，不是给人看的 UI ——
 *   每步一行摘要（工具名 + 参数首行 + 结果首行），截断而非省略，保住"它试了什么、
 *   为什么失败"的链路；总长封顶，防止 500 步任务把父上下文撑爆。
 */
import { db } from '../db.js';

export interface SubTaskTraceRow {
  id: string;
  role: string;
  content: string | null;
  toolCallsJson: string | null;
  toolCallId: string | null;
  subAgentName: string | null;
  createdAt: number;
}

/** 按 runId（= parent_tool_call_id）捞子任务全部消息，时间升序 */
export function loadSubTaskTrace(runId: string): SubTaskTraceRow[] {
  if (!runId) return [];
  const rows = db.prepare(
    'SELECT id, role, content, tool_calls_json, tool_call_id, sub_agent_name, created_at FROM message WHERE parent_tool_call_id = ? ORDER BY created_at, id',
  ).all(runId) as any[];
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content ?? null,
    toolCallsJson: r.tool_calls_json ?? null,
    toolCallId: r.tool_call_id ?? null,
    subAgentName: r.sub_agent_name ?? null,
    createdAt: r.created_at,
  }));
}

function trunc(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/** 工具调用参数摘要：取 JSON 首个字段值或整串截断 */
function argsSummary(argsRaw: unknown): string {
  if (argsRaw == null) return '';
  if (typeof argsRaw === 'string') return trunc(argsRaw, 120);
  try {
    const o = typeof argsRaw === 'object' ? argsRaw as Record<string, unknown> : { v: argsRaw };
    const first = Object.entries(o)[0];
    const s = first ? `${first[0]}=${typeof first[1] === 'string' ? first[1] : JSON.stringify(first[1])}` : JSON.stringify(o);
    return trunc(s, 120);
  } catch { return trunc(String(argsRaw), 120); }
}

/**
 * 把子任务消息流排版成给大模型看的执行轨迹。
 * @param rows       loadSubTaskTrace 的结果（时间升序）
 * @param maxSteps   最多保留最近多少个"步"（一步 = 一条 assistant 工具调用 + 其结果）
 * @param totalCap   输出总长上限（超出截头留尾——最近的行为对失败分析最有价值）
 */
export function formatSubTaskTrace(rows: SubTaskTraceRow[], maxSteps = 40, totalCap = 14000): string {
  if (rows.length === 0) return '';
  const subName = rows.find((r) => r.subAgentName)?.subAgentName || '(未知子智能体)';
  const lines: string[] = [];
  let stepNo = 0;

  for (const r of rows) {
    if (r.role === 'user') {
      lines.push(`[任务指令] ${trunc(r.content || '', 500)}`);
      continue;
    }
    if (r.role === 'assistant') {
      // 工具调用（可能一条消息多个）
      const calls = (() => { try { return r.toolCallsJson ? JSON.parse(r.toolCallsJson) : []; } catch { return []; } })();
      if (Array.isArray(calls) && calls.length > 0) {
        for (const c of calls) {
          stepNo++;
          const fn = c?.function?.name || c?.name || '?';
          const rawArgs = c?.function?.arguments ?? c?.arguments;
          lines.push(`#${stepNo} [调用] ${fn}(${argsSummary(rawArgs)})`);
        }
      }
      // 有效文本回复（空占位跳过）
      if (r.content && r.content.trim()) {
        lines.push(`[${r.role}] ${trunc(r.content, 600)}`);
      }
      continue;
    }
    if (r.role === 'tool') {
      // 归到最近一条调用行下
      const prev = lines.length > 0 ? lines[lines.length - 1] : '';
      if (prev.startsWith('#') && prev.includes('[调用]')) {
        lines[lines.length - 1] = `${prev} → ${trunc(r.content || '(空)', 300)}`;
      } else {
        lines.push(`[tool结果] ${trunc(r.content || '(空)', 300)}`);
      }
    }
  }

  // 只保留最近 maxSteps 个步骤行（调用行 + 其被合并的结果），前缀行保留
  const prefix: string[] = [];
  const steps: string[] = [];
  for (const l of lines) {
    if (l.startsWith('[任务指令]')) prefix.push(l);
    else steps.push(l);
  }
  let kept = steps.length > maxSteps * 2 ? steps.slice(-maxSteps * 2) : steps;
  if (kept.length < steps.length) kept = ['…(前段步骤已截断，仅保留最近部分)…', ...kept];

  let out = `子智能体「${subName}」执行轨迹（共 ${stepNo} 步）：\n${[...prefix, ...kept].join('\n')}`;
  if (out.length > totalCap) out = '…(前段过长截断)…\n' + out.slice(-totalCap);
  return out;
}

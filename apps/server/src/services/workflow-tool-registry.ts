// 工作流工具注册 —— 把每个工作流型智能体注册成一个 `wf_<agentId>` 工具。
//
// 为什么要注册成工具，而不是只靠 call_agent 委派：
//   call_agent 的入参是自由文本/对象，模型要自己猜工作流需要哪些字段；猜错不报错，
//   只会跑出一份看起来正常、实则无意义的产出（最难查的那类失败）。
//   注册成工具后，参数 schema 直接来自 input 节点，模型被强约束按字段名传参。
//
// ★ 两个硬约束（踩过的坑）：
//   1) `ToolRegistry`（packages/core/src/tool/registry.ts:5）是**进程级单例**，`register` 重名直接 throw。
//      所以命名必须稳定唯一（`wf_<agentId>`），且同步逻辑必须幂等（先 unregister 再 register）。
//   2) `llm-task-manager` 拼工具清单时有 `if (!registry.has(name)) continue;`
//      —— 未注册的 tool id 会被**静默丢弃**，表现为「挂载了但模型看不见」。
//
// 注册 ≠ 暴露：全部注册进 registry 不占模型上下文；真正发给模型的只有会话 builtin_tool_ids 里
// 挂载的那几个（见 llm-task-manager 的清单拼装）。所以可以放心全量注册。
import type { BuiltInTool } from '@yan-zhi/core';
import { getToolRegistry } from '@yan-zhi/core';
import { db } from '../db.js';
import { buildWorkflowInputFieldDefs } from './workflow-delegate.js';

/** 工具名前缀（会话挂载、后端分发、权限放行三处共用） */
export const WF_TOOL_PREFIX = 'wf_';

/** 单会话最多挂载多少个工作流工具：太多会让模型难以选择，且白占上下文 */
export const MAX_WF_TOOLS_PER_CONVERSATION = 8;

export function isWorkflowToolName(name: string): boolean {
  return typeof name === 'string' && name.startsWith(WF_TOOL_PREFIX);
}

export function workflowAgentIdOfTool(toolName: string): string {
  return isWorkflowToolName(toolName) ? toolName.slice(WF_TOOL_PREFIX.length) : '';
}

/** 把字段定义转成 OpenAI function 的 parameters（JSON Schema） */
function schemaOf(fields: ReturnType<typeof buildWorkflowInputFieldDefs>): Record<string, unknown> {
  if (fields.length === 0) {
    return { type: 'object', properties: {}, additionalProperties: true };
  }
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    const p: Record<string, unknown> = {
      type: f.type === 'array' ? 'array' : f.type === 'object' ? 'object' : f.type,
      description: f.description || f.label || f.key,
    };
    if (f.type === 'array') p.items = { type: 'string' };
    if (f.options?.length) p.enum = f.options;
    if (f.default !== undefined) p.default = f.default;
    properties[f.key] = p;
    if (f.required) required.push(f.key);
  }
  return { type: 'object', properties, required };
}

function buildTool(row: { id: string; name: string; description: string | null; inputs_schema_json: string | null; workflow_json: string | null }): BuiltInTool {
  const fields = buildWorkflowInputFieldDefs(row);
  const fieldNote = fields.length
    ? `入参：${fields.map((f) => `${f.key}(${f.type}${f.required ? ',必填' : ',可选'})`).join('、')}`
    : '该工作流未声明入参';
  return {
    name: `${WF_TOOL_PREFIX}${row.id}`,
    description: `运行工作流「${row.name}」。${row.description || ''}\n${fieldNote}。多入参时必须传 JSON 对象，键名与上表一致；执行是异步的，返回后会给运行 id 与最终结果。`,
    inputSchema: schemaOf(fields),
    // 真实执行在后端分发（llm-task-manager 里按前缀拦截 → startWorkflowRun），
    // 与 call_agent / list_sub_agents 同一模式：这里的 execute 只是占位，正常不会走到。
    async execute() {
      return { content: [{ type: 'text' as const, text: '工作流工具由后端直接执行（占位 handler 不应被调用）' }] };
    },
  };
}

export interface SyncResult {
  registered: string[];
  removed: string[];
}

/**
 * 同步工作流工具：为所有 `type='workflow'` 的智能体注册 `wf_<id>`，并注销已删除的。
 *
 * 幂等：已存在的先 unregister 再 register（因为 register 重名会 throw）。
 * 失败不抛：注册失败只应导致「某个工作流在 AI 模式下不可用」，不能拖垮整个 server 启动。
 */
export function syncWorkflowTools(): SyncResult {
  const registered: string[] = [];
  const removed: string[] = [];
  try {
    const registry = getToolRegistry();
    const rows = db
      .prepare("SELECT id, name, description, inputs_schema_json, workflow_json FROM agent WHERE type = 'workflow'")
      .all() as any[];
    const want = new Set(rows.map((r) => `${WF_TOOL_PREFIX}${r.id}`));

    // 1) 注销已不存在的工作流工具（智能体被删/改成 harness）
    for (const name of registry.names().filter((n) => isWorkflowToolName(n))) {
      if (want.has(name)) continue;
      try { registry.unregister(name); removed.push(name); } catch { /* 注销失败不影响后续 */ }
    }

    // 2) 注册/刷新（幂等：先删后加，规避「重名即 throw」）
    for (const r of rows) {
      const name = `${WF_TOOL_PREFIX}${r.id}`;
      try {
        if (registry.has(name)) registry.unregister(name);
        registry.register(buildTool(r));
        registered.push(name);
      } catch (e: any) {
        console.error(`[workflow-tools] 注册 ${name} 失败:`, e?.message || e);
      }
    }
  } catch (e: any) {
    console.error('[workflow-tools] 同步失败:', e?.message || e);
  }
  return { registered, removed };
}
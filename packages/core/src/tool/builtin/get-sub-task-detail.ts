// get_sub_task_detail 内置工具 —— 查询子智能体一次委派任务（call_agent / spawn_subagent）的执行详情
// 注意：实际执行逻辑由 server 的 executeTool 拦截处理（查 message 表 parent_tool_call_id），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class GetSubTaskDetailTool implements BuiltInTool {
  name = 'get_sub_task_detail';
  description = '查询一次子智能体委派任务（call_agent / spawn_subagent）的执行详情：每步工具调用（名称/参数/结果摘要）与关键回复，用于分析子任务为什么失败/半途而废。runId 从 call_agent 结果末尾的「子任务ID」获取。只读，无副作用。';
  inputSchema = {
    type: 'object',
    properties: {
      runId: { type: 'string', description: '子任务 ID（call_agent 返回结果末尾标注的「子任务ID」，形如 tc_xxx）。' },
      maxSteps: { type: 'number', description: '可选：最多返回最近多少步（默认 40，过大截断）。' },
    },
    required: ['runId'],
  };

  async execute(): Promise<McpCallResult> {
    // 实际执行由 server executeTool 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: 'get_sub_task_detail intercepted by dispatch loop.' }],
    };
  }
}

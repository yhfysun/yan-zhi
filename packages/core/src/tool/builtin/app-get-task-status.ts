// app_get_task_status 内置工具 —— 查询 app_create_task 派发的顶层任务执行状态
// 注意：实际执行逻辑由 server 的 executeTool 拦截处理（查 conversation + llm_task 表），
// 此类仅提供 schema 注册。纯读操作，readonly 会话可用。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class AppGetTaskStatusTool implements BuiltInTool {
  name = 'app_get_task_status';
  description =
    '查询应用内某个顶层任务（包括用 app_create_task 创建的）的执行状态：运行中/已完成/失败/已中止、' +
    '执行步数、最近产出摘要线索。用于派发任务后的跟进与收口汇报。';
  inputSchema = {
    type: 'object',
    properties: {
      conversationId: {
        type: 'string',
        description: '任务所属会话 ID（app_create_task 返回结果里有）。缺省时查询**当前**会话的任务。',
      },
    },
    required: [],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: 'app_get_task_status intercepted by server.' }],
    };
  }
}

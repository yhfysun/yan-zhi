// call_agent 内置工具 —— 委派任务给子智能体执行
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（需访问 agent store + LLM runner），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class CallAgentTool implements BuiltInTool {
  name = 'call_agent';
  description = 'Delegate a sub-task to a specified sub-agent. The sub-agent will run with its own system prompt and mounted tools, then return the result. Use this to leverage specialized agents (e.g. pageAgent for browser automation).';
  inputSchema = {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'The ID of the sub-agent to invoke. Must be one of the mounted subAgentIds.',
      },
      input: {
        type: 'string',
        description: 'The task description / input to pass to the sub-agent.',
      },
    },
    required: ['agentId', 'input'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由 chat.ts dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: `call_agent intercepted by dispatch loop. agentId=${args.agentId}` }],
    };
  }
}

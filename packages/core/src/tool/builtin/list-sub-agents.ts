// list_sub_agents 内置工具 —— 列出当前智能体可调用的子智能体（id/名称/描述）
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（需访问 agent store + merged mounts），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ListSubAgentsTool implements BuiltInTool {
  name = 'list_sub_agents';
  description = '列出当前智能体可调用的全部子智能体，返回每个子智能体的 id、name 与 description。建议在调用 call_agent 前先调用此工具，确认可用的 agentId。';
  inputSchema = {
    type: 'object',
    properties: {},
    required: [],
  };

  async execute(): Promise<McpCallResult> {
    // 实际执行由 chat.ts dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: 'list_sub_agents intercepted by dispatch loop.' }],
    };
  }
}
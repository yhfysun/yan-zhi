// app_create_task 内置工具 —— 让模型像用户手动发起一样创建一个顶层任务
// （出现在前端任务列表、独立执行、SSE 可订阅）。
// 注意：实际执行逻辑由 server 的 executeTool 拦截处理（建 conversation + createTask，
// 链路与定时任务 runScheduledTask 同源），此类仅提供 schema 注册。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class AppCreateTaskTool implements BuiltInTool {
  name = 'app_create_task';
  description =
    '在应用里创建一个新的顶层任务（像用户在任务列表手动新建一样），并立即在后台开始执行。' +
    '新任务会出现在用户的任务列表中，拥有独立的会话、智能体与工具面，执行过程可实时查看。' +
    '适合把一个可独立交付的子目标（如"生成一段演示视频""整理一份调研报告"）派发为独立任务，' +
    '与本任务并行推进；需要委派"已有智能体跑一段话"的简单场景请改用 call_agent。';
  inputSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '任务标题（显示在任务列表，简短概括目标，如"演示视频：一键出片流程"）。',
      },
      instruction: {
        type: 'string',
        description: '交给新任务的完整指令（目标、要求、交付物形态、验收标准）。新任务看不到本任务的上下文，指令必须自包含。',
      },
      agentId: {
        type: 'string',
        description: 'Optional. 执行该任务的智能体 ID（先用 list_sub_agents 查可用智能体）。缺省时继承当前任务的智能体（无则用默认智能体）。',
      },
      spaceId: {
        type: 'string',
        description: 'Optional. 任务归属的空间 ID。缺省时归属当前任务所在空间。',
      },
    },
    required: ['title', 'instruction'],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: 'app_create_task intercepted by server.' }],
    };
  }
}

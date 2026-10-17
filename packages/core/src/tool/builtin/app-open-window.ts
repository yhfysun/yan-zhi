// app_open_window 内置工具 —— 让模型请求主窗口弹出某任务的独立执行窗口
// 注意：实际执行逻辑由 server 的 executeTool 拦截处理（校验归属 + 发 app:open_window
// 任务事件，主窗口 SSE 处理器收到后开子窗口），此类仅提供 schema 注册。纯展示动作，只读。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class AppOpenWindowTool implements BuiltInTool {
  name = 'app_open_window';
  description =
    '在主窗口弹出某个任务的「独立执行窗口」（一个干净的 OS 窗口，实时展示该任务的执行进度与消息流）。' +
    '典型用途：把刚用 app_create_task 派发的任务弹到独立窗口给用户看，或为录屏演示准备一块干净的舞台。' +
    '需要主窗口在线（本工具由主窗口响应弹出）。';
  inputSchema = {
    type: 'object',
    properties: {
      conversationId: {
        type: 'string',
        description: '要弹出窗口的任务会话 ID（app_create_task 回执里有）。缺省时弹出**当前**任务的窗口。',
      },
    },
    required: [],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: 'app_open_window intercepted by server.' }],
    };
  }
}

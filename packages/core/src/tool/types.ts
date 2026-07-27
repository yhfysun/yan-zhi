// 内置工具类型定义
import type { McpCallResult } from '../mcp/client';

/** 工具定义元数据（JSON Schema 参数描述） */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** 内置工具 = 定义 + 执行逻辑 */
export interface BuiltInTool extends ToolDefinition {
  execute(args: Record<string, unknown>): Promise<McpCallResult>;
}

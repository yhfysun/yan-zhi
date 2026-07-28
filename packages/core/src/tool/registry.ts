// 内置工具注册中心
import type { BuiltInTool, ToolDefinition } from './types';
import type { McpCallResult } from '../mcp/client';

export class ToolRegistry {
  private tools = new Map<string, BuiltInTool>();

  register(tool: BuiltInTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): BuiltInTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool not found: ${name}` }],
        isError: true,
      };
    }
    return tool.execute(args);
  }

  /** 导出为 OpenAI function calling 的 tools 数组 */
  toOpenAITools(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return Array.from(this.tools.values()).map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  /** 从数据库加载自定义工具并注册 */
  loadCustomTools(tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown>; code: string; entry: string; timeout: number }>): void {
    for (const t of tools) {
      if (this.tools.has(t.name)) continue;
      this.tools.set(t.name, {
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          const { runInSandbox } = await import('./sandbox');
          return runInSandbox(t.code, t.entry, args, { timeout: t.timeout });
        },
      });
    }
  }
}

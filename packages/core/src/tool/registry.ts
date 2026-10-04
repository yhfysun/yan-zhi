// 内置工具注册中心
import type { BuiltInTool, ToolDefinition, ToolContext } from './types';
import type { McpCallResult } from '../mcp/client';
import { toolError } from './result';

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
    return Array.from(this.tools.values()).map(({ name, description, inputSchema, outputSchema }) => ({
      name,
      description,
      inputSchema,
      outputSchema,
    }));
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: string, args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return toolError(`Tool not found: ${name}`);
    }
    // ★ ctx 由执行器注入（会话上下文 + 产物路径解析），模型看不到也传不了。
    //   老工具签名是 execute(args)，多传一个参数对它们是安全的（JS 忽略多余实参）。
    return tool.execute(args, ctx);
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

  /** 从数据库加载自定义工具并注册（与内置工具重名时自动追加后缀改名，不再静默跳过） */
  loadCustomTools(tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown>; code: string; entry: string; timeout: number; runtime?: string }>): void {
    for (const t of tools) {
      let name = t.name;
      while (this.tools.has(name)) {
        name = name + '_custom';
      }
      this.tools.set(name, {
        name,
        description: t.description || '',
        inputSchema: t.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          // ★ 走 runCustomToolRow（含依赖按需安装，依赖准备器由 server 注入；
          //   未注入时退化为无依赖安装 = 改造前行为）。
          const { runCustomToolRow } = await import('./sandbox');
          return runCustomToolRow(t, args);
        },
      });
    }
  }
}

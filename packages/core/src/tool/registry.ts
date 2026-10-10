// 内置工具注册中心
import type { BuiltInTool, ToolDefinition, ToolContext } from './types';
import type { McpCallResult } from '../mcp/client';
import { toolError } from './result';
import { capToolOutput } from './builtin/output-cap';

/**
 * ★★★ 统一输出闸（2026-10-10）：把工具返回里给模型看的 `text` 收到上限内。
 *
 * ★ 为什么收口在 registry 而不是逐工具调：
 *   `capToolOutput` 早就有，但**逐工具手动调**——`browser/index.ts` 一处都没调，
 *   于是 `get_dom` 默认能吐 45 万字符（≈18 万 token）。逐处补必然漏。
 * ★ 只处理 `content` 里的 `text`：
 *   · `isError` 原样保留（错误信息本身要完整可读，且通常很短）；
 *   · `_meta` 不动（工具间透传的元数据，结构必须完整，截断会破坏下游解析）。
 */
function capResultText(result: McpCallResult): McpCallResult {
  try {
    if (!result || !Array.isArray(result.content)) return result;
    // 错误结果不裁：错误信息是排障依据，且通常远小于上限
    if (result.isError) return result;
    let changed = false;
    const content = result.content.map((item) => {
      const text = (item as { text?: string })?.text;
      if (typeof text !== 'string' || text.length <= MAX_TOOL_TEXT_CHARS) return item;
      changed = true;
      return { ...item, text: capToolOutput(text, MAX_TOOL_TEXT_CHARS) };
    });
    return changed ? { ...result, content } : result;
  } catch {
    // fail-open：截断是保护措施，绝不能因此让工具调用失败
    return result;
  }
}

/** 单条工具输出给模型看的上限（与 `capToolOutput` 默认同量级；此处显式声明便于观测与测试） */
export const MAX_TOOL_TEXT_CHARS = 64 * 1024;

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
    const result = await tool.execute(args, ctx);
    // ★★★ 统一输出闸（2026-10-10）：**一处覆盖全部工具**，不再依赖"每个工具记得自己调 capToolOutput"。
    //
    // ★ 为什么必须收口到这里（实测）：
    //   `capToolOutput` 早已存在（`builtin/output-cap.ts`，64KB），但它是**逐工具手动调用**的 ——
    //   `cmd-exec` / `code-diagnostics` / `doyz` / `novel-tuiwen` 各调各的，而
    //   `tool/builtin/browser/index.ts` **一处都没调**（grep = 0）。
    //   后果（量化实测）：`browser_get_dom` 默认 `maxNodes=1000`，其
    //   `JSON.stringify(dom, null, 2)` 在典型列表页产出约 **45 万字符 ≈ 18 万 token** ——
    //   **一次调用就能吃爆上下文**。同类风险还有 `network_log` / `extract_list` / `get_tabs` 等 10+ 处。
    //   ⇒ 逐处补必然漏（本项目一贯判据）；收口到**唯一执行出口**才能保证"以后新增工具也不会漏"。
    //
    // ★ 只裁 `text`（模型真正看到的字段），不动 `_meta`（工具间透传的元数据，结构必须完整）。
    return capResultText(result);
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
        // ★ P0-1（2026-10-07）：strict 模式**声明式**透传 —— 工具显式声明 strict=true 才带上。
        //   为什么不默认开：OpenAI strict 要求 additionalProperties:false 且所有字段进 required，
        //   现有内置 schema 多不满足（默认开会让合规端点直接 400）。
        //   端点不支持 strict 时由 chatStream 的 400 重试剥离 tools 兜底。
        ...(((t as any).strict === true) ? { strict: true } : {}),
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

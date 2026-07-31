// get_api_tools 内置工具 — 按模块渐进式暴露 API 接口
import type { BuiltInTool } from '../types';
import { initApiToolRegistry } from './api-tools';

let _initDone = false;

function ensureInit() {
  if (!_initDone) { initApiToolRegistry(); _initDone = true; }
}

export class GetApiToolsTool implements BuiltInTool {
  name = 'get_api_tools';
  description = '按模块查询项目 REST API 接口工具列表。传入模块名返回对应接口的 name/description/inputSchema，LLM 获取后可按需调用。传 "list" 或不传返回所有可用模块名。';
  inputSchema = {
    type: 'object',
    properties: {
      module: { type: 'string', description: '模块名: agent, conversation, message, platform, mcp, skill, tool, marketplace, workspace, memory。传 "list" 列出所有' },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>) {
    ensureInit();
    const { getApiToolRegistry, API_MODULES } = require('./api-tools');
    const registry = getApiToolRegistry();
    const module = args.module as string | undefined;

    if (!module || module === 'list') {
      const modules = API_MODULES.map((m: string) => {
        const tools = registry.get(m as any) || [];
        return { module: m, toolCount: tools.length, sample: tools[0]?.name || null };
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ modules, hint: `调用 get_api_tools({ module: "<模块名>" }) 获取具体接口定义。可用: ${API_MODULES.join(', ')}` }) }],
        isError: false,
      };
    }

    const tools = registry.get(module as any);
    if (!tools) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `未知模块 "${module}"`, available: API_MODULES }) }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ module, tools }) }],
      isError: false,
    };
  }
}

// get_api_tools 内置工具 — 按模块渐进式暴露 API 接口
import type { BuiltInTool } from '../types';
import { toolError, toolOk } from '../result';
import { initApiToolRegistry, getApiToolRegistry, API_MODULES } from './api-tools';

let _initDone = false;

function ensureInit() {
  if (!_initDone) { initApiToolRegistry(); _initDone = true; }
}

export class GetApiToolsTool implements BuiltInTool {
  name = 'get_api_tools';
  description = '按模块查询项目 REST API 接口工具列表。传入模块名返回对应接口的 name/description/inputSchema，LLM 获取后可按需调用。传 "list" 或不传返回所有可用模块名。★ 这是"发现工具"的总入口：当你要做一件事却发现手头没有对应工具时（例如"造一个自定义工具""装一个技能""改智能体挂载"），先用它查有哪些接口可用，再按返回的 schema 调用。';
  inputSchema = {
    type: 'object',
    properties: {
      module: { type: 'string', description: `模块名。可用模块：${API_MODULES.join(', ')}。传 "list" 或省略则列出全部模块及各自的接口数量` },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>) {
    ensureInit();
    const registry = getApiToolRegistry();
    const module = args.module as string | undefined;

    if (!module || module === 'list') {
      const modules = API_MODULES.map((m: string) => {
        const tools = registry.get(m as any) || [];
        return { module: m, toolCount: tools.length, sample: tools[0]?.name || null };
      });
      return toolOk(JSON.stringify({ modules, hint: `调用 get_api_tools({ module: "<模块名>" }) 获取具体接口定义。可用: ${API_MODULES.join(', ')}` }));
    }

    const tools = registry.get(module as any);
    if (!tools) {
      return toolError(JSON.stringify({ error: `未知模块 "${module}"`, available: API_MODULES }));
    }

    return toolOk(JSON.stringify({ module, tools }));
  }
}

export { FileReadTool } from './file-read';
export { FileWriteTool } from './file-write';
export { WebSearchTool, FetchSearchBackend, DuckDuckGoSearchBackend, ServerSearchBackend } from './web-search';
export type { SearchBackend, SearchResult, FetchSearchConfig } from './web-search';
export { CmdExecTool } from './cmd-exec';
export { PythonExecTool } from './python-exec';
export { BrowserToolClasses, BROWSER_TOOL_NAMES } from './browser';
export { CallAgentTool } from './call-agent';
export { ListSubAgentsTool } from './list-sub-agents';
export { AskUserTool } from './ask-user';
export { ConfirmUserTool } from './confirm-user';
export { TaskPlanTool, TaskStepTool } from './task-plan';
export { ConfigureModelPlatformTool } from './configure-model-platform';
export { ImageAnalyzeTool } from './image-analyze';
export { CompareProductsTool } from './compare-products';

import type { SearchBackend } from './web-search';
import { FileReadTool } from './file-read';
import { FileWriteTool } from './file-write';
import { WebSearchTool } from './web-search';
import { CmdExecTool } from './cmd-exec';
import { PythonExecTool } from './python-exec';
import { BrowserToolClasses } from './browser';
import { CallAgentTool } from './call-agent';
import { ListSubAgentsTool } from './list-sub-agents';
import { AskUserTool } from './ask-user';
import { ConfirmUserTool } from './confirm-user';
import { TaskPlanTool, TaskStepTool } from './task-plan';
import { ConfigureModelPlatformTool } from './configure-model-platform';
import { ImageAnalyzeTool } from './image-analyze';
import { CompareProductsTool } from './compare-products';
import type { ToolRegistry } from '../registry';

/** 注册所有内置工具到 registry，可选配置 web_search 后端 */
export function registerBuiltInTools(registry: ToolRegistry, searchBackend?: SearchBackend): void {
  registry.register(new FileReadTool());
  registry.register(new FileWriteTool());
  const searchTool = new WebSearchTool();
  if (searchBackend) {
    searchTool.setBackend(searchBackend);
  }
  registry.register(searchTool);
  registry.register(new CmdExecTool());
  registry.register(new PythonExecTool());
  // 浏览器自动化工具集（E3）
  for (const ToolClass of BrowserToolClasses) {
    registry.register(new ToolClass());
  }
  // 子智能体委派工具（E7）
  registry.register(new CallAgentTool());
  // 子智能体列表查询工具（E7b）—— 让 LLM 动态发现可用子智能体及其 ID
  registry.register(new ListSubAgentsTool());
  // 交互式工具（E12）：反问弹窗 + 任务规划进度（实际执行由 UI 层 dispatchToolCall 拦截）
  registry.register(new AskUserTool());
  registry.register(new ConfirmUserTool());
  registry.register(new TaskPlanTool());
  registry.register(new TaskStepTool());
  registry.register(new ConfigureModelPlatformTool());
  registry.register(new ImageAnalyzeTool());
  // 跨平台比价引擎（C10）—— pageAgent 多平台购物对比汇总
  registry.register(new CompareProductsTool());
}

/** 注册管理工具函数到 registry */
export async function registerManagementTools(registry: ToolRegistry, getDb: () => any): Promise<void> {
  const mod = await import('./management');
  mod.registerManagementTools(registry, getDb);
}

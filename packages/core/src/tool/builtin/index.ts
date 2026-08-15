export { FileReadTool } from './file-read';
export { FileWriteTool } from './file-write';
export { WebSearchTool, FetchSearchBackend } from './web-search';
export type { SearchBackend, SearchResult, FetchSearchConfig } from './web-search';
export { CmdExecTool } from './cmd-exec';
export { BrowserToolClasses, BROWSER_TOOL_NAMES } from './browser';
export { CallAgentTool } from './call-agent';
export { AskUserTool } from './ask-user';
export { TaskPlanTool, TaskStepTool } from './task-plan';

import type { SearchBackend } from './web-search';
import { FileReadTool } from './file-read';
import { FileWriteTool } from './file-write';
import { WebSearchTool } from './web-search';
import { CmdExecTool } from './cmd-exec';
import { BrowserToolClasses } from './browser';
import { CallAgentTool } from './call-agent';
import { AskUserTool } from './ask-user';
import { TaskPlanTool, TaskStepTool } from './task-plan';
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
  // 浏览器自动化工具集（E3）
  for (const ToolClass of BrowserToolClasses) {
    registry.register(new ToolClass());
  }
  // 子智能体委派工具（E7）
  registry.register(new CallAgentTool());
  // 交互式工具（E12）：反问弹窗 + 任务规划进度（实际执行由 UI 层 dispatchToolCall 拦截）
  registry.register(new AskUserTool());
  registry.register(new TaskPlanTool());
  registry.register(new TaskStepTool());
}

/** 注册管理工具函数到 registry */
export async function registerManagementTools(registry: ToolRegistry, getDb: () => any): Promise<void> {
  const mod = await import('./management');
  mod.registerManagementTools(registry, getDb);
}

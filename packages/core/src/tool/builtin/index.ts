export { FileReadTool } from './file-read';
export { FileWriteTool } from './file-write';
export { WebSearchTool, FetchSearchBackend } from './web-search';
export type { SearchBackend, SearchResult, FetchSearchConfig } from './web-search';
export { CmdExecTool } from './cmd-exec';

import type { SearchBackend } from './web-search';
import { FileReadTool } from './file-read';
import { FileWriteTool } from './file-write';
import { WebSearchTool } from './web-search';
import { CmdExecTool } from './cmd-exec';
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
}

/** 注册管理工具函数到 registry */
export async function registerManagementTools(registry: ToolRegistry, getDb: () => any): Promise<void> {
  const mod = await import('./management');
  mod.registerManagementTools(registry, getDb);
}

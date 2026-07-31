import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerWorkspaceTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('workspace', [
    { name: 'api_workspace_list_dir', description: '列出目录内容', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'api_workspace_search_files', description: '搜索文件（glob匹配）', inputSchema: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
  ]);
}

import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerMemoryTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('memory', [
    { name: 'api_memory_search', description: '搜索记忆库', inputSchema: { type: 'object', properties: { query: { type: 'string' }, agentId: { type: 'string' }, topK: { type: 'number' } }, required: ['query'] } },
    { name: 'api_memory_list', description: '列出记忆条目', inputSchema: { type: 'object', properties: { agentId: { type: 'string' }, limit: { type: 'number' } }, required: [] } },
    { name: 'api_memory_create', description: '创建记忆', inputSchema: { type: 'object', properties: { content: { type: 'string' }, agentId: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['content'] } },
    { name: 'api_memory_delete', description: '删除记忆', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ]);
}

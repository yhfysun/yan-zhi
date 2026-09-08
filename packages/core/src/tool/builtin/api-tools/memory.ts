import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerMemoryTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('memory', [
    { name: 'api_memory_search', description: '按语义检索用户的记忆库（个人画像、长期偏好、历史结论等）。当用户问到与自身相关的信息、或需要上下文连续性时使用', inputSchema: { type: 'object', properties: { query: { type: 'string' }, agentId: { type: 'string' }, topK: { type: 'number' } }, required: ['query'] } },
    { name: 'api_memory_list', description: '列出用户最近的记忆条目（可按智能体过滤）', inputSchema: { type: 'object', properties: { agentId: { type: 'string' }, limit: { type: 'number' } }, required: [] } },
    { name: 'api_memory_create', description: '把值得长期记住的用户事实/偏好/重要结论写入记忆库（一句话一条，简洁明确）', inputSchema: { type: 'object', properties: { content: { type: 'string' }, agentId: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['content'] } },
    { name: 'api_memory_delete', description: '删除一条过时或错误的记忆', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ]);
}

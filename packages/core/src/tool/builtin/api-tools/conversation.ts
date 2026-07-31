import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerConversationTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('conversation', [
    { name: 'api_conversation_list', description: '列出所有会话', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_conversation_get', description: '获取指定会话详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_conversation_create', description: '创建新会话', inputSchema: { type: 'object', properties: { title: { type: 'string' }, agentId: { type: 'string' }, modelId: { type: 'string' } }, required: ['title'] } },
    { name: 'api_conversation_update', description: '更新会话', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, pinned: { type: 'boolean' } }, required: ['id'] } },
    { name: 'api_conversation_delete', description: '删除会话及其消息', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ]);
}

import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerMessageTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('message', [
    { name: 'api_message_list', description: '获取会话的所有消息', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' } }, required: ['conversationId'] } },
    { name: 'api_message_send', description: '发送消息并获取AI回复', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' }, content: { type: 'string' } }, required: ['conversationId', 'content'] } },
    { name: 'api_message_delete', description: '删除消息', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  ]);
}

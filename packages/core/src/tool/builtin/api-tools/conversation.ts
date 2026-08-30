import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerConversationTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('conversation', [
    { name: 'api_conversation_list', description: '列出所有会话', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_conversation_get', description: '获取指定会话详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_conversation_create', description: '创建新会话', inputSchema: { type: 'object', properties: { title: { type: 'string' }, agentId: { type: 'string' }, modelId: { type: 'string' } }, required: ['title'] } },
    { name: 'api_conversation_update', description: '更新会话', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, pinned: { type: 'boolean' } }, required: ['id'] } },
    { name: 'api_conversation_delete', description: '删除会话及其消息', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_conversation_file_list', description: '列出会话的文件记录（upload/intermediate/deliverable 三类）', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' } }, required: ['conversationId'] } },
    {
      name: 'api_conversation_file_add',
      description: '把磁盘上已存在的文件登记为会话文件（只写元数据，不搬运字节；产出交付物后用它挂到会话上）',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          name: { type: 'string', description: '文件名' },
          path: { type: 'string', description: '磁盘绝对路径' },
          category: { type: 'string', enum: ['upload', 'intermediate', 'deliverable'], description: '默认 intermediate' },
          mimeType: { type: 'string' },
          size: { type: 'number' },
          source: { type: 'string', description: '来源标记，默认 agent' },
          messageId: { type: 'string' },
        },
        required: ['conversationId', 'name', 'path'],
      },
    },
    {
      name: 'api_conversation_file_update',
      description: '修改会话文件记录（改分类 / 重命名 / 改路径）',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          fileId: { type: 'string' },
          name: { type: 'string' },
          path: { type: 'string' },
          category: { type: 'string', enum: ['upload', 'intermediate', 'deliverable'] },
        },
        required: ['conversationId', 'fileId'],
      },
    },
    { name: 'api_conversation_file_delete', description: '删除会话文件记录（只删记录，物理文件需自行处理）', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' }, fileId: { type: 'string' } }, required: ['conversationId', 'fileId'] } },
  ]);
}

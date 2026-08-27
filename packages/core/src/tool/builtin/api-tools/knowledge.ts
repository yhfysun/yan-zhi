import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerKnowledgeTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('knowledge', [
    {
      name: 'api_kb_list',
      description: '列出所有知识库',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_kb_create',
      description: '创建知识库',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'api_kb_update',
      description: '更新知识库名称或描述',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_kb_delete',
      description: '删除知识库及其文档',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'api_kb_document_add',
      description: '向知识库添加文档并自动切分文本块',
      inputSchema: {
        type: 'object',
        properties: {
          baseId: { type: 'string' },
          name: { type: 'string' },
          content: { type: 'string' },
          sourcePath: { type: 'string' },
        },
        required: ['baseId', 'name'],
      },
    },
    {
      name: 'api_kb_document_list',
      description: '列出知识库中的文档',
      inputSchema: {
        type: 'object',
        properties: { baseId: { type: 'string' } },
        required: ['baseId'],
      },
    },
    {
      name: 'api_kb_document_delete',
      description: '删除知识库文档',
      inputSchema: {
        type: 'object',
        properties: { docId: { type: 'string' } },
        required: ['docId'],
      },
    },
    {
      name: 'api_kb_search',
      description: '在知识库中检索相关文本块（当前为关键词匹配）',
      inputSchema: {
        type: 'object',
        properties: {
          baseId: { type: 'string' },
          query: { type: 'string' },
          topK: { type: 'number' },
        },
        required: ['baseId', 'query'],
      },
    },
  ]);
}


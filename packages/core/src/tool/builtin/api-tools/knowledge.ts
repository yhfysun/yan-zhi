import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerKnowledgeTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('knowledge', [
    {
      name: 'api_kb_list',
      description: '列出所有「挂载」的知识库（含内置「应用使用说明」默认挂载，字段 builtin/defaultMounted=true）。返回每库的 id/name/description/visibility，供检索时作为 baseId 引用',
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
      description: '在知识库中检索文本块，按知识库分组返回（{ 库id: [切片...] }）。可传 baseIds（数组）指定一个或多个库（含内置库id builtin-app-guide）；不传则查所有挂载库。对每个库做实体导向多跳查询：问题匹配实体→取其切片→沿实体关系取最多 hops 级关联实体的切片',
      inputSchema: {
        type: 'object',
        properties: {
          baseIds: { type: 'array', items: { type: 'string' }, description: '可选。要查询的知识库 id 集合（来自 api_kb_list）；不传=所有挂载库' },
          query: { type: 'string', description: '检索问题或关键词' },
          hops: { type: 'number', description: '实体关联级数 1..3，默认 3' },
          topK: { type: 'number', description: '每个实体取回的切片数量上限，默认 3' },
        },
        required: ['query'],
      },
    },
  ]);
}


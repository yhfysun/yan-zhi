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
    {
      name: 'api_kb_search_all',
      description: '跨所有知识库（不限挂载范围）检索切片。默认 RRF 混合检索：关键词匹配与向量语义两路召回后融合排序（条目带 rrfScore，mode=hybrid）；向量不可用时自动降级为纯关键词（mode=keyword）',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          topK: { type: 'number', description: '返回条数上限，默认 5' },
        },
        required: ['query'],
      },
    },
    {
      name: 'api_kb_multi_hop',
      description: '跨库多跳检索：一次查询在多库间做关联跳转，返回切片列表',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          topK: { type: 'number', description: '每跳取回条数，默认 3' },
          hops: { type: 'number', description: '跳转级数，默认 2' },
        },
        required: ['query'],
      },
    },
    {
      name: 'api_kb_entity_search',
      description: '实体导向多跳检索：先用问题匹配实体，再沿实体关系 BFS 扩展 hops 级，返回关联切片',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          hops: { type: 'number', description: '实体关联级数，默认 3' },
          topK: { type: 'number', description: '每个实体取回切片数，默认 3' },
        },
        required: ['query'],
      },
    },
    {
      name: 'api_kb_chunks',
      description: '列出知识库的切片（分块）列表，可按文档过滤。用于查看某篇文档被切成了哪些块',
      inputSchema: {
        type: 'object',
        properties: {
          baseId: { type: 'string' },
          docId: { type: 'string', description: '可选，只列该文档的切片' },
        },
        required: ['baseId'],
      },
    },
    {
      name: 'api_kb_graph',
      description: '获取知识库的结构图谱（节点=知识库/文档/切片，边=归属关系）。用于了解一个库的文档与切片组织情况',
      inputSchema: { type: 'object', properties: { baseId: { type: 'string' } }, required: ['baseId'] },
    },
    {
      name: 'api_kb_entity_graph',
      description: '获取知识库的实体关系图谱（节点=实体，边=关系，实体带来源切片）。用于查看已抽取的实体与它们之间的关系',
      inputSchema: { type: 'object', properties: { baseId: { type: 'string' } }, required: ['baseId'] },
    },
    {
      name: 'api_kb_embedding_model',
      description: '查看当前 Embedding 配置：可选的 embedding 平台与模型列表，以及当前选中的平台+模型（只读）',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_kb_revectorize_status',
      description: '查询重新向量化任务的进度（只读）。用于确认重算是否完成',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_kb_builtin_guide_reset',
      description: '把内置的「应用使用说明」知识库重置为当前版本的默认文档并重新切分向量化。当应用功能更新、内置说明已过时，用它让内置知识库同步到最新；重置会丢弃对该库的手工改动',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ]);
}


// 数据查询类 API 工具（P4.1）——智能体通道：
// api_datasource_list / api_ontology_search / api_ontology_list / api_data_query / api_data_paginate
// 执行端在 server（services/data-query.ts），这里只声明可被挂载的工具契约。
import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

const INTENT_DESC =
  '查询意图 DSL：{ dimensions?: string[]（维度名，分组/展示用）, measures?: { name: string, agg?: "sum"|"count"|"count_distinct"|"avg"|"min"|"max" }[], ' +
  'timeDimension?: { name: string, grain?: "year"|"quarter"|"month"|"week"|"day"|"hour"|"minute" }, ' +
  'filters?: string[]（本体过滤器名，或带比较符的裸 SQL 条件）, orderBy?: { name: string, dir?: "asc"|"desc" }[], limit?: number }';

export function registerDataTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('data', [
    {
      name: 'api_datasource_list',
      description:
        '列出可用数据源（id/名称/类型/库名/只读标记/内置标记）。不传数据源 id 时默认使用内置「言智项目库」（项目自身数据库，只读）。取数前先确认用哪个数据源',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_ontology_search',
      description:
        '按自然语言问题检索最相关的「已发布本体」（语义层入口）。返回命中本体的 code/名称/字段（维度·时间维度·度量·过滤器·默认选择列）与语义摘要。' +
        '**取数前必须先调用它**，拿到本体 code 再交给 api_data_query',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '用户的自然语言问题（如「最近 7 天各智能体的对话数」）' },
          datasourceId: { type: 'string', description: '限定数据源 id，不传则不限' },
          limit: { type: 'number', description: '返回命中本体数量，默认 5，上限 10' },
        },
        required: ['question'],
      },
    },
    {
      name: 'api_ontology_list',
      description: '按数据源/关键字列出已发布本体（不打分，用于浏览候选）。字段与 api_ontology_search 一致',
      inputSchema: {
        type: 'object',
        properties: {
          datasourceId: { type: 'string', description: '限定数据源 id' },
          keyword: { type: 'string', description: '按 code/名称/描述/域过滤' },
          limit: { type: 'number', description: '返回数量，默认 20，上限 100' },
        },
        required: [],
      },
    },
    {
      name: 'api_data_query',
      description:
        '只读取数：优先传 ontology（本体 id 或 code）+ intent 走语义层编译（字段受本体约束，幻觉字段名会直接报错）；' +
        '没有合适本体时才用 sql 兜底（单条只读 SELECT，DDL/写语句会被只读护栏拦截）。返回 { columns, rows, rowCount, truncated, latencyMs, sql }',
      inputSchema: {
        type: 'object',
        properties: {
          ontology: { type: 'string', description: '本体 id 或 code（来自 api_ontology_search，推荐）' },
          intent: { type: 'object', description: INTENT_DESC },
          sql: { type: 'string', description: '兜底只读 SQL（单条 SELECT）；给了 ontology 时忽略' },
          datasourceId: { type: 'string', description: '数据源 id，缺省用内置项目库' },
          limit: { type: 'number', description: '最大返回行数，默认 100，上限 1000' },
        },
        required: [],
      },
    },
    {
      name: 'api_data_paginate',
      description:
        '对上一次查询翻页：把 ontology+intent 或 sql 作为子查询，外层套 LIMIT/OFFSET。返回 { columns, rows, rowCount, offset, limit, sql }。' +
        '单页上限 200 行，不要一次拉全表',
      inputSchema: {
        type: 'object',
        properties: {
          ontology: { type: 'string', description: '本体 id 或 code' },
          intent: { type: 'object', description: INTENT_DESC },
          sql: { type: 'string', description: '兜底只读 SQL（单条 SELECT）；给了 ontology 时忽略' },
          datasourceId: { type: 'string', description: '数据源 id，缺省用内置项目库' },
          offset: { type: 'number', description: '偏移量，默认 0' },
          limit: { type: 'number', description: '每页行数，默认 50，上限 200' },
        },
        required: [],
      },
    },
  ]);
}

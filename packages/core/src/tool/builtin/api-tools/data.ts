// 数据查询类 API 工具（P4.1/P4.2）——智能体通道：
// 数据源：api_datasource_list
// 本体上下文：api_ontology_search（问题召回）/ api_ontology_overview（集合总览）/
//            api_ontology_brief（单体简略）/ api_ontology_detail（懒加载详情）/ api_ontology_values（属性值/枚举采样）
// 取数：api_data_query / api_data_paginate
// 执行端在 server（services/data-query.ts），这里只声明可被挂载的工具契约。
import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

const INTENT_DESC =
  '查询意图 DSL：{ dimensions?: string[]（维度名，分组/展示用）, measures?: { name: string, agg?: "sum"|"count"|"count_distinct"|"avg"|"min"|"max" }[], ' +
  'timeDimension?: { name: string, grain?: "year"|"quarter"|"month"|"week"|"day"|"hour"|"minute" }, ' +
  'selections?: string[]（本体选择列名，展开为其字段列表）, ' +
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
        '按自然语言问题检索最相关的「已发布本体」（语义层入口）。返回命中本体的 code/名称/字段（维度·时间维度·度量·过滤器·选择列）与语义摘要。' +
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
        '没有合适本体时才用 sql 兜底（单条只读 SELECT，DDL/写语句会被只读护栏拦截）。' +
        '**ontology 与 sql 必须给其一，空参调用无意义**。返回 { columns, rows, rowCount, truncated, latencyMs, sql }',
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
    {
      name: 'api_ontology_overview',
      description:
        '本体集合总览：列出全部已发布本体的 code/名称/业务描述/所属域，以及各自所属数据源的 id/名称/类型和字段计数。' +
        '回答数据问题前的**第一站**：先从这里选定要查哪个本体（数据源信息已内联，一般无需再调 api_datasource_list）',
      inputSchema: {
        type: 'object',
        properties: {
          datasourceId: { type: 'string', description: '限定数据源 id，不传则列全部数据源的本体' },
        },
        required: [],
      },
    },
    {
      name: 'api_ontology_brief',
      description:
        '单个本体简略信息：本体 code/名称/描述/同义词 + 所属数据源（id/名称/类型/只读）+ ' +
        '维度名清单/时间维度名清单/度量名清单 + 过滤器（名/描述/是否默认）+ 选择列契约 + 关联关系与行级策略。' +
        '不含 SQL 表达式——需要表达式细节时用 api_ontology_detail 懒加载',
      inputSchema: {
        type: 'object',
        properties: {
          ontology: { type: 'string', description: '本体 id 或 code（来自 api_ontology_overview / api_ontology_search）' },
        },
        required: ['ontology'],
      },
    },
    {
      name: 'api_ontology_detail',
      description:
        '本体详情懒加载：按 include 选择性返回字段/过滤器/选择列的**完整定义**——' +
        '维度/度量的 SQL 表达式（expr）与描述、度量的聚合方式、时间维度的支持粒度、过滤器的 WHERE 条件全文、选择列的关键词、行级策略。' +
        '写 api_data_query 的 intent 前拿不准字段口径/表达式时调用；默认返回字段与过滤器，关联与实体默认不返回',
      inputSchema: {
        type: 'object',
        properties: {
          ontology: { type: 'string', description: '本体 id 或 code' },
          include: {
            type: 'object',
            description:
              '选择要加载的部分：{ dimensions?: bool, timeDimensions?: bool, measures?: bool, filters?: bool, selections?: bool, relations?: bool, entities?: bool }，缺省全 true（relations/entities 除外）',
          },
        },
        required: ['ontology'],
      },
    },
    {
      name: 'api_ontology_values',
      description:
        '属性值/枚举召回：对本体某字段采样取值（优先返回已缓存的样本值，否则对该列实时 DISTINCT 采样，上限 100）。' +
        '**填过滤器的值、判断字段是枚举、理解字段内容前先调用它**。attr 传过滤器名时返回过滤器的条件定义全文',
      inputSchema: {
        type: 'object',
        properties: {
          ontology: { type: 'string', description: '本体 id 或 code' },
          attr: { type: 'string', description: '字段名（维度/时间维度/度量）或过滤器名' },
          limit: { type: 'number', description: '采样条数，默认 20，上限 100' },
        },
        required: ['ontology', 'attr'],
      },
    },
  ]);
}

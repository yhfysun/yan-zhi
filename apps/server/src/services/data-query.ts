// 数据查询服务（P4.1）：智能体取数通道的唯一收敛点。
// 只读取数两条路：① 本体语义层（ontology + 查询意图 DSL，推荐）② 兜底只读 SQL（走 sql-guard 护栏）。
// 消费方：mcp/api-tool-executor.ts 的 api_datasource_list / api_ontology_search / api_ontology_list /
//        api_data_query / api_data_paginate。
import { db } from '../db.js';
import { getConnector, type DataSourceRow } from './connector.js';
import { ensureProjectDataSource, listDataSources } from './datasource.js';
import { ensureBuiltinOntologiesSync, listOntologies, queryOntologyByRef, type OntologyInfo } from './ontology.js';
import type { QueryIntent } from './ontology-compiler.js';
import { buildOntologyDigest, recallConfigFromEnv, scoreKeywords } from './ontology-recall.js';
import { paginate, type DialectType } from './dialect.js';
import { guardSqlConsole } from './sql-guard.js';

/** 内置项目库数据源 id（datasource.ts 用确定性 id，多用户就绪） */
export function projectDataSourceId(userId: string): string {
  ensureProjectDataSource(userId);
  return `ds_project_${userId}`;
}

function dialectOf(row: DataSourceRow): DialectType {
  return (row.type === 'project' ? 'sqlite' : row.type) as DialectType;
}

function loadDataSource(userId: string, id?: string): DataSourceRow {
  const dsId = (id || '').trim() || projectDataSourceId(userId);
  const row = db
    .prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?')
    .get(dsId, userId) as DataSourceRow | undefined;
  if (!row) throw new Error(`数据源不存在: ${dsId}（先用 api_datasource_list 查可用数据源）`);
  return row;
}

/** 数据源清单（裁掉连接串/密码等敏感字段，只留智能体选源所需信息） */
export function listSourcesForAgent(userId: string) {
  return listDataSources(userId).map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    database: d.database,
    readonly: d.readonly,
    builtin: d.builtin,
    tableCount: d.tableCount,
    status: d.status,
  }));
}

/** 本体清单（裁字段：只留选本体 + 拼意图所需的字段名） */
function briefOntology(o: OntologyInfo) {
  return {
    id: o.id,
    code: o.code,
    name: o.name,
    description: o.description || '',
    domain: o.domain || '',
    datasourceId: o.datasourceId,
    status: o.status,
    version: o.version,
    builtin: o.builtin,
    dimensions: o.dimensions.map((d) => d.name),
    timeDimensions: o.timeDimensions.map((d) => d.name),
    measures: o.measures.map((m) => m.name),
    filters: o.filters.map((f) => f.name),
    defaultFields: o.selections.filter((s) => s.isDefault).map((s) => s.name),
  };
}

export interface OntologyListOptions {
  datasourceId?: string;
  keyword?: string;
  limit?: number;
}

/** 本体列表：默认只给已发布本体（草稿对智能体不可见）。先等内置项目库本体生成完毕，避免首轮扑空 */
export async function listOntologiesForAgent(userId: string, opts: OntologyListOptions = {}) {
  await ensureBuiltinOntologiesSync(userId);
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 20), 1), 100);
  const all = listOntologies(userId, {
    ...(opts.datasourceId ? { datasourceId: opts.datasourceId } : {}),
    ...(opts.keyword ? { keyword: opts.keyword } : {}),
  });
  const published = all.filter((o) => o.status === 'published');
  return {
    total: published.length,
    ontologies: published.slice(0, limit).map(briefOntology),
  };
}

/** 检索召回用的关键词：code/名称/同义词/域/描述 + 字段名，覆盖「用户说业务词」的命中场景 */
function searchKeywordsOf(o: OntologyInfo): string[] {
  return [
    o.code,
    o.name,
    ...(o.synonyms || []),
    o.domain || '',
    ...o.dimensions.map((d) => d.name),
    ...o.timeDimensions.map((d) => d.name),
    ...o.measures.map((m) => m.name),
  ].filter(Boolean);
}

/**
 * 语义检索本体（RAG 选本体）：
 * - question 为空 → 返回前 N 个已发布本体（供智能体浏览）
 * - 否则按关键词规则打分（整段相等 1.0 / 子串 0.8），≥ 阈值才命中，按分降序截 topN
 * - 附带当次召回组装出的语义摘要（可直接喂 LLM，含默认/命中的选择列与过滤器）
 */
export async function searchOntologiesForAgent(
  userId: string,
  question: string,
  opts: { datasourceId?: string; limit?: number } = {},
) {
  await ensureBuiltinOntologiesSync(userId);
  const cfg = recallConfigFromEnv();
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 5), 1), 10);
  const all = listOntologies(userId, opts.datasourceId ? { datasourceId: opts.datasourceId } : undefined);
  const published = all.filter((o) => o.status === 'published');
  const q = (question || '').trim();

  let hits: Array<{ ont: OntologyInfo; score: number }> = [];
  if (!q) {
    hits = published.slice(0, limit).map((ont) => ({ ont, score: 0 }));
  } else {
    for (const ont of published) {
      const score = Math.max(
        scoreKeywords(searchKeywordsOf(ont), q),
        // 描述/过滤器名做弱匹配（0.5 兜底，低于阈值不入选，避免噪声）
        scoreKeywords([ont.description || '', ...ont.filters.map((f) => f.name)], q) * 0.7,
      );
      if (score >= cfg.threshold) hits.push({ ont, score });
    }
    hits.sort((a, b) => b.score - a.score);
    hits = hits.slice(0, limit);
  }

  const picked = hits.map((h) => h.ont);
  return {
    question: q,
    total: published.length,
    hits: hits.map((h) => ({ ...briefOntology(h.ont), score: Number(h.score.toFixed(2)) })),
    digest: buildOntologyDigest(picked, q, cfg),
  };
}

/**
 * 缺省意图：调用方没给任何选择列时，用本体的默认选择列（本体级契约）拼意图。
 * 优先取其中的维度/时间维度列 —— 默认语义是「明细预览」，不要把聚合度量混进来导致莫名 GROUP BY；
 * 纯度量本体才退化为聚合，最后兜底取前几个维度。
 */
function defaultIntentOf(o: OntologyInfo, limit: number): QueryIntent {
  const dimNames = new Set([...o.dimensions.map((d) => d.name), ...o.timeDimensions.map((d) => d.name)]);
  const measureNames = new Set(o.measures.map((m) => m.name));
  const defaults = o.selections.filter((s) => s.isDefault).map((s) => s.name);
  const fields = defaults.length
    ? defaults
    : [...o.dimensions.map((d) => d.name), ...o.measures.map((m) => m.name)].slice(0, 8);

  const dims = fields.filter((f) => dimNames.has(f));
  if (dims.length) return { dimensions: dims, limit };

  const meas = fields.filter((f) => measureNames.has(f));
  if (meas.length) return { measures: meas.map((name) => ({ name })), limit };

  return { dimensions: o.dimensions.slice(0, 8).map((d) => d.name), limit };
}

/** 调用方是否显式指定了选择列：指定了就不套默认列，避免维度被默认列稀释 */
function hasSelectors(intent?: QueryIntent): boolean {
  return !!(intent?.dimensions?.length || intent?.measures?.length || intent?.timeDimension);
}

/** 合并意图：显式给的优先，缺选择列时补默认选择列 */
function mergeIntent(target: OntologyInfo | undefined, given: QueryIntent | undefined, limit: number): QueryIntent {
  const base = !hasSelectors(given) && target ? defaultIntentOf(target, limit) : {};
  return { ...base, ...(given || {}), limit };
}

/** 取数前先保证内置项目库本体已生成（幂等 + 5s 节流），返回全部本体（含草稿，供 id/code 定位） */
async function listOntologiesOf(userId: string): Promise<OntologyInfo[]> {
  await ensureBuiltinOntologiesSync(userId);
  return listOntologies(userId);
}

const MAX_QUERY_ROWS = 1000;
const MAX_PAGE_ROWS = 200;
const DEFAULT_QUERY_TIMEOUT = 15_000;

/** 兜底 SQL 模式：单条语句 + 只读护栏（DDL/写语句一律拦） */
function guardSingleSelect(sql: string): string {
  const text = (sql || '').trim().replace(/;\s*$/, '');
  if (!text) throw new Error('sql 不能为空');
  const guard = guardSqlConsole(text, false);
  if (guard.blocked.length) {
    throw new Error(`SQL 被只读护栏拦截：${guard.blocked[0]?.reason || '只允许只读查询'}`);
  }
  const first = guard.statements[0];
  if (!first) throw new Error('未解析出可执行的 SQL 语句');
  if (guard.statements.length > 1) {
    throw new Error('一次只能执行一条 SQL（多语句请逐条调用）');
  }
  return first.text;
}

export interface DataQueryInput {
  datasourceId?: string;
  /** 本体 id 或 code（推荐）：走语义层编译，字段受本体约束 */
  ontology?: string;
  /** 查询意图 DSL；不给 ontology 时忽略 */
  intent?: QueryIntent;
  /** 兜底只读 SQL；给 ontology 时忽略 */
  sql?: string;
  limit?: number;
}

/**
 * 取数主入口：
 * - ontology 模式：编译意图 → 只读执行（字段/过滤器引用不存在时由编译器报错，拦 LLM 幻觉）
 * - sql 模式：只读取数兜底，先过只读护栏
 */
export async function queryDataForAgent(userId: string, input: DataQueryInput) {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 100), 1), MAX_QUERY_ROWS);
  if (input.ontology) {
    const all = await listOntologiesOf(userId);
    const target = all.find((o) => o.id === input.ontology || o.code === input.ontology);
    return queryOntologyByRef(userId, input.ontology, mergeIntent(target, input.intent, limit), limit, DEFAULT_QUERY_TIMEOUT);
  }
  if (!input.sql?.trim()) {
    throw new Error('必须提供 ontology（本体 id/code）或 sql（只读 SQL）之一');
  }
  const ds = loadDataSource(userId, input.datasourceId);
  const text = guardSingleSelect(input.sql);
  const result = await getConnector(ds).query(text, {
    maxRows: limit,
    timeoutMs: DEFAULT_QUERY_TIMEOUT,
  });
  return {
    ...result,
    mode: 'sql' as const,
    datasourceId: ds.id,
    sql: text,
    warnings: [] as string[],
  };
}

export interface DataPaginateInput {
  datasourceId?: string;
  ontology?: string;
  intent?: QueryIntent;
  sql?: string;
  offset?: number;
  limit?: number;
}

/**
 * 翻页：把上一次的查询（本体意图或 SQL）作为子查询，外层套方言化 LIMIT/OFFSET。
 * 这样本体模式与 SQL 模式共用一套翻页语义，且不改动原查询的过滤/分组逻辑。
 */
export async function paginateDataForAgent(userId: string, input: DataPaginateInput) {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), MAX_PAGE_ROWS);
  const offset = Math.max(Math.floor(input.offset ?? 0), 0);

  if (input.ontology) {
    const all = await listOntologiesOf(userId);
    const target = all.find((o) => o.id === input.ontology || o.code === input.ontology);
    const intent: QueryIntent = {
      ...(input.intent || (target ? defaultIntentOf(target, offset + limit) : {})),
      limit: offset + limit,
    };
    const base = await queryOntologyByRef(userId, input.ontology, intent, offset + limit, DEFAULT_QUERY_TIMEOUT);
    const ds = loadDataSource(userId, base.datasourceId);
    const sql = `SELECT * FROM (${base.sql}) _dq_page ${paginate(dialectOf(ds), { offset, limit })}`;
    const result = await getConnector(ds).query(sql, { maxRows: limit, timeoutMs: DEFAULT_QUERY_TIMEOUT });
    return {
      ...result,
      mode: 'ontology' as const,
      ontology: base.ontology,
      datasourceId: ds.id,
      sql,
      offset,
      limit,
      warnings: base.warnings,
    };
  }

  if (!input.sql?.trim()) {
    throw new Error('必须提供 ontology（本体 id/code）或 sql（只读 SQL）之一');
  }
  const ds = loadDataSource(userId, input.datasourceId);
  const text = guardSingleSelect(input.sql);
  const sql = `SELECT * FROM (${text}) _dq_page ${paginate(dialectOf(ds), { offset, limit })}`;
  const result = await getConnector(ds).query(sql, { maxRows: limit, timeoutMs: DEFAULT_QUERY_TIMEOUT });
  return {
    ...result,
    mode: 'sql' as const,
    datasourceId: ds.id,
    sql,
    offset,
    limit,
    warnings: [] as string[],
  };
}

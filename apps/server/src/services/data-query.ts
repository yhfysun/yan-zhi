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
import { paginate, quoteIdent, type DialectType } from './dialect.js';
import { guardSqlConsole } from './sql-guard.js';
import { getStdAttribute } from './std-attribute.js';

/** 内置项目库数据源 id（datasource.ts 用确定性 id，多用户就绪） */
export function projectDataSourceId(userId: string): string {
  ensureProjectDataSource(userId);
  return `ds_project_${userId}`;
}

function dialectOf(row: DataSourceRow): DialectType {
  return (row.type === 'project' ? 'sqlite' : row.type) as DialectType;
}

/**
 * 挂载范围过滤（P4.3）：allowed = 智能体挂载的本体 id 集合。
 * - undefined / 空数组 → 不限（可见全部已发布本体，向后兼容）
 * - 非空 → 只保留挂载内的本体（未挂载的对该智能体不存在）
 */
function filterAllowed(list: OntologyInfo[], allowed?: string[]): OntologyInfo[] {
  if (!allowed || allowed.length === 0) return list;
  const set = new Set(allowed);
  return list.filter((o) => set.has(o.id));
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
    selections: o.selections.map((s) => s.name),
  };
}

export interface OntologyListOptions {
  datasourceId?: string;
  keyword?: string;
  limit?: number;
  /** 智能体挂载的本体 id 集合；空/未设置 = 不限 */
  allowed?: string[];
}

/** 本体列表：默认只给已发布本体（草稿对智能体不可见）。先等内置项目库本体生成完毕，避免首轮扑空 */
export async function listOntologiesForAgent(userId: string, opts: OntologyListOptions = {}) {
  await ensureBuiltinOntologiesSync(userId);
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 20), 1), 100);
  const all = listOntologies(userId, {
    ...(opts.datasourceId ? { datasourceId: opts.datasourceId } : {}),
    ...(opts.keyword ? { keyword: opts.keyword } : {}),
  });
  const published = filterAllowed(all, opts.allowed).filter((o) => o.status === 'published');
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
  opts: { datasourceId?: string; limit?: number; allowed?: string[] } = {},
) {
  await ensureBuiltinOntologiesSync(userId);
  // 空 question 直接报错：早先「返回前 N 个」的兜底会让模型养成空参调用习惯，
  // 拿到一大坨无关本体后反而误判"没有可用本体"。
  if (!(question || '').trim()) {
    throw new Error(
      'question 为必填：请用自然语言描述要查什么（如「最近 7 天各智能体的对话数」）。不确定有哪些本体时改用 api_ontology_overview 浏览。',
    );
  }
  const cfg = recallConfigFromEnv();
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 5), 1), 10);
  const all = listOntologies(userId, opts.datasourceId ? { datasourceId: opts.datasourceId } : undefined);
  const published = filterAllowed(all, opts.allowed).filter((o) => o.status === 'published');
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
 * 缺省意图：调用方没给任何选择列时，取前几个维度/度量兜底（默认语义是「明细预览」）。
 * 纯度量本体退化为聚合，最后兜底取前几个维度。
 */
function defaultIntentOf(o: OntologyInfo, limit: number): QueryIntent {
  const dims = [...o.dimensions.map((d) => d.name), ...o.timeDimensions.map((d) => d.name)];
  if (dims.length) return { dimensions: dims.slice(0, 8), limit };
  if (o.measures.length) return { measures: o.measures.slice(0, 5).map((m) => ({ name: m.name, agg: m.agg })), limit };
  return { dimensions: [], limit };
}

/** 调用方是否显式指定了选择列：指定了就不套默认列，避免维度被默认列稀释 */
function hasSelectors(intent?: QueryIntent): boolean {
  return !!(intent?.dimensions?.length || intent?.measures?.length || intent?.selections?.length || intent?.timeDimension);
}

/** 合并意图：显式给的优先，缺选择列时补默认列；并把 intent.selections（选择列名）展开为具体字段并入 dimensions/measures */
function mergeIntent(target: OntologyInfo | undefined, given: QueryIntent | undefined, limit: number): QueryIntent {
  const base = !hasSelectors(given) && target ? defaultIntentOf(target, limit) : {};
  const intent: QueryIntent = { ...base, ...(given || {}), limit };
  if (target && intent.selections?.length) {
    const dimNames = new Set([...target.dimensions.map((d) => d.name), ...target.timeDimensions.map((d) => d.name)]);
    const measureNames = new Set(target.measures.map((m) => m.name));
    const dims = new Set(intent.dimensions || []);
    const meas = new Set((intent.measures || []).map((m) => m.name));
    for (const selName of intent.selections) {
      const sel = target.selections.find((s) => s.name === selName);
      if (!sel) throw new Error(`选择列「${selName}」不存在（可用: ${target.selections.map((s) => s.name).join(', ') || '无'}）`);
      for (const f of sel.fields || []) {
        if (measureNames.has(f)) meas.add(f);
        else if (dimNames.has(f)) dims.add(f);
      }
    }
    intent.dimensions = [...dims];
    intent.measures = [...meas].map((name) => {
      const existing = intent.measures?.find((m) => m.name === name);
      return existing || { name, agg: 'sum' as const };
    });
  }
  return intent;
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
  /** 智能体挂载的本体 id 集合；空/未设置 = 不限 */
  allowed?: string[];
}

/**
 * 取数主入口：
 * - ontology 模式：编译意图 → 只读执行（字段/过滤器引用不存在时由编译器报错，拦 LLM 幻觉）
 * - sql 模式：只读取数兜底，先过只读护栏
 */
export async function queryDataForAgent(userId: string, input: DataQueryInput) {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 100), 1), MAX_QUERY_ROWS);
  if (input.ontology) {
    const all = filterAllowed(await listOntologiesOf(userId), input.allowed);
    const target = all.find((o) => o.id === input.ontology || o.code === input.ontology);
    if (!target) throw new Error(await ontologyNotFoundMsg(userId, input.ontology, input.allowed));
    return queryOntologyByRef(userId, target.id, mergeIntent(target, input.intent, limit), limit, DEFAULT_QUERY_TIMEOUT);
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

// ===== 本体上下文工具链（P4.2）：集合总览 → 单体简略 → 懒加载详情 → 属性值/枚举采样 =====
// 让 LLM 拿到「选哪个本体 → 字段叫什么 → 过滤器怎么填」的完整决策链。

/** 按 id 或 code 定位已发布本体（多条同 code 时优先 published），找不到给出可用清单提示；受挂载范围约束 */
async function resolveOntologyInfo(userId: string, ref: string, allowed?: string[]): Promise<OntologyInfo> {
  await ensureBuiltinOntologiesSync(userId);
  const all = listOntologies(userId);
  const visible = filterAllowed(all, allowed);
  const hits = visible.filter((o) => o.id === (ref || '').trim() || o.code === (ref || '').trim());
  if (!hits.length) {
    const existsUnallowed = all.some((o) => o.id === (ref || '').trim() || o.code === (ref || '').trim());
    if (existsUnallowed) {
      throw new Error(`本体「${ref}」未挂载到当前智能体（请在智能体编辑的本体挂载中添加，或从已挂载本体中选择）`);
    }
    const available = visible.filter((o) => o.status === 'published').map((o) => o.code).slice(0, 30);
    throw new Error(`本体不存在: ${ref}（可用: ${available.join(', ') || '无'}，先用 api_ontology_overview 浏览）`);
  }
  return hits.find((o) => o.status === 'published') || hits[0];
}

/** 本体集合总览：全部已发布本体的 code/name/描述 + 所属数据源（id/名称/类型），LLM 的全局选型入口 */
export async function overviewOntologiesForAgent(
  userId: string,
  opts: { datasourceId?: string; allowed?: string[] } = {},
) {
  await ensureBuiltinOntologiesSync(userId);
  const sources = listSourcesForAgent(userId);
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const all = filterAllowed(
    listOntologies(userId, opts.datasourceId ? { datasourceId: opts.datasourceId } : undefined),
    opts.allowed,
  ).filter((o) => o.status === 'published');
  // 返回体控制体积（几十个本体 × 长描述会让弱模型读完抓不住重点，甚至误判"没有可用本体"）：
  // 描述截断、去掉纯计数，直接给可用字段名（模型拿它就能一步取数），并附下一步指引。
  return {
    // 注意字段名：不能叫 total——实测弱模型会把「本体个数」当成业务数据总数回答给用户。
    ontologyCount: all.length,
    note: '本返回是「本体（语义视图）清单」：ontologyCount 是本体个数，不是任何业务数据的数量。' +
      '查业务数据有多少条，用 api_data_query 对对应本体查 row_count。',
    next: '选定 code 后直接取数：api_data_query { ontology: "<code>", intent: { measures: [{ name: "row_count" }] } }' +
      '（row_count = 行数；查"有多少/多少条"都用它）。要看全部字段名再调 api_ontology_brief。',
    ontologies: all.map((o) => ({
      code: o.code,
      name: o.name,
      description: (o.description || '').slice(0, 50),
      ...(o.domain ? { domain: o.domain } : {}),
      datasource: { id: o.datasourceId, name: srcById.get(o.datasourceId)?.name || '' },
      dimensions: o.dimensions.slice(0, 5).map((d) => d.name),
      measures: o.measures.slice(0, 6).map((m) => m.name),
    })),
  };
}

/** 单本体简略：本体基本信息 + 所属数据源 + 字段名清单/过滤器名/选择列契约（不含表达式，详情走懒加载） */
export async function briefOntologyForAgent(userId: string, ref: string, allowed?: string[]) {
  const o = await resolveOntologyInfo(userId, ref, allowed);
  const ds = db
    .prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?')
    .get(o.datasourceId, userId) as DataSourceRow | undefined;
  return {
    code: o.code,
    name: o.name,
    description: o.description || '',
    domain: o.domain || '',
    synonyms: o.synonyms,
    status: o.status,
    version: o.version,
    datasource: {
      id: o.datasourceId,
      name: ds?.name || '',
      type: ds?.type || '',
      readonly: !!(ds as unknown as { readonly?: number } | undefined)?.readonly,
    },
    dimensions: o.dimensions.map((d) => d.name),
    timeDimensions: o.timeDimensions.map((d) => d.name),
    measures: o.measures.map((m) => m.name),
    filters: o.filters.map((f) => ({ name: f.name, description: f.description || '', isDefault: !!f.isDefault })),
    selections: o.selections.map((s) => ({ name: s.name, description: s.description || '', keywords: s.keywords || [], fields: s.fields || [] })),
    relations: o.relations.map((r) => `${r.source}.${r.sourceAttr} ${r.type} ${r.target}.${r.targetAttr}`),
    policies: o.policies,
    hint: '字段/过滤器的 SQL 表达式与业务口径用 api_ontology_detail 懒加载；过滤器要填的值用 api_ontology_values 采样',
  };
}

export interface OntologyDetailInclude {
  dimensions?: boolean;
  timeDimensions?: boolean;
  measures?: boolean;
  filters?: boolean;
  selections?: boolean;
  relations?: boolean;
  entities?: boolean;
}

/** 本体详情懒加载：按 include 选择性返回字段/过滤器/选择列的完整定义（expr/聚合/粒度/描述/样本值） */
export async function detailOntologyForAgent(
  userId: string, ref: string, include?: OntologyDetailInclude, allowed?: string[],
) {
  const o = await resolveOntologyInfo(userId, ref, allowed);
  const inc = {
    dimensions: true, timeDimensions: true, measures: true, filters: true,
    selections: true, relations: false, entities: false,
    ...(include || {}),
  };
  const out: Record<string, unknown> = {
    code: o.code,
    name: o.name,
    description: o.description || '',
    domain: o.domain || '',
    synonyms: o.synonyms,
    datasourceId: o.datasourceId,
    status: o.status,
  };
  if (inc.dimensions) out.dimensions = o.dimensions.map((d) => ({ name: d.name, expr: d.expr, refAttr: d.refAttr || '', description: d.description || '', sampleValues: d.sampleValues || [] }));
  if (inc.timeDimensions) out.timeDimensions = o.timeDimensions.map((d) => ({ name: d.name, expr: d.expr, granularities: d.granularities || [], description: d.description || '' }));
  if (inc.measures) out.measures = o.measures.map((m) => ({ name: m.name, expr: m.expr, agg: m.agg, additive: m.additive || '', refAttr: (m as { refAttr?: string }).refAttr || '', description: m.description || '' }));
  if (inc.filters) out.filters = o.filters.map((f) => ({ name: f.name, expr: f.expr, description: f.description || '', keywords: f.keywords || [], isDefault: !!f.isDefault }));
  if (inc.selections) out.selections = o.selections;
  if (inc.relations) out.relations = o.relations;
  if (inc.entities) out.entities = o.entities;
  return out;
}

/**
 * 属性值/枚举召回：让 LLM 知道过滤器该填什么值、字段里都有什么。
 * 取值优先级：① 本体字段已缓存的 sampleValues ② 对 source_sql 该列实时 DISTINCT 采样。
 * attr 传过滤器名时返回过滤器定义（过滤器是条件不是列，无需取值）。
 */
export async function ontologyValuesForAgent(userId: string, ref: string, attr: string, limit = 20, allowed?: string[]) {
  const o = await resolveOntologyInfo(userId, ref, allowed);
  const want = (attr || '').trim();
  if (!want) throw new Error('attr（字段名或过滤器名）不能为空');

  // 过滤器名：直接给定义，提示无需采样
  const filter = o.filters.find((f) => f.name === want);
  if (filter) {
    return {
      ontology: o.code,
      attr: want,
      kind: 'filter' as const,
      filter: { name: filter.name, expr: filter.expr, description: filter.description || '', keywords: filter.keywords || [] },
      hint: '这是过滤器（WHERE 条件）不是取值列；若要看它的取值分布，请传该条件引用的列名',
    };
  }

  const dim = o.dimensions.find((d) => d.name === want);
  const time = o.timeDimensions.find((d) => d.name === want);
  const measure = o.measures.find((m) => m.name === want);
  const field = dim || time || measure;
  if (!field) {
    const available = [...o.dimensions.map((d) => d.name), ...o.timeDimensions.map((d) => d.name), ...o.measures.map((m) => m.name), ...o.filters.map((f) => f.name)];
    throw new Error(`字段「${want}」不存在（可用: ${available.join(', ') || '无'}）`);
  }

  // ① 字段挂载的标准属性（refAttr）→ 树结构：属性节点的子节点 value 即枚举取值（兼容旧 enum_json）
  const refAttr = (dim as { refAttr?: string } | undefined)?.refAttr
    || (measure as { refAttr?: string } | undefined)?.refAttr || '';
  if (refAttr) {
    const std = getStdAttribute(userId, refAttr);
    if (std) {
      const childValues = std.children.map((c) => c.value).filter(Boolean);
      const values = childValues.length ? childValues : std.enums;
      if (values.length) {
        return {
          ontology: o.code,
          attr: want,
          kind: 'values' as const,
          source: childValues.length ? 'std_attribute' : 'std_attribute_enum',
          stdAttribute: { key: std.key, name: std.name, dataType: std.dataType, unit: std.unit, description: std.description },
          values: values.slice(0, Math.min(limit, 100)),
          truncated: values.length > limit,
        };
      }
    }
  }

  // ② 已缓存样本值（AI 富化/手动补的口径）
  const cached = (dim as { sampleValues?: string[] } | undefined)?.sampleValues || [];
  if (cached.length) {
    return { ontology: o.code, attr: want, kind: 'sample' as const, source: 'cached', values: cached.slice(0, Math.min(limit, 100)), truncated: cached.length > limit };
  }

  // ③ 实时 DISTINCT 采样：expr 在保存时已校验为 source_sql 输出别名的单列引用，quote 安全
  const row = db
    .prepare('SELECT source_sql FROM ontology WHERE id = ?')
    .get(o.id) as { source_sql: string } | undefined;
  if (!row?.source_sql) throw new Error('本体物理 SQL 缺失，无法采样');
  const ds = loadDataSource(userId, o.datasourceId);
  const dialect = dialectOf(ds);
  const maxRows = Math.min(Math.max(Math.floor(limit), 1), 100);
  const sql = `SELECT DISTINCT ${quoteIdent(dialect, (field as { expr: string }).expr)} AS _v FROM (${row.source_sql}) _ont ORDER BY 1 ${paginate(dialect, { limit: maxRows })}`;
  const result = await getConnector(ds).query(sql, { maxRows, timeoutMs: DEFAULT_QUERY_TIMEOUT });
  return {
    ontology: o.code,
    attr: want,
    kind: 'values' as const,
    source: 'sampled',
    values: result.rows.map((r) => r._v),
    rowCount: result.rowCount,
    truncated: result.truncated,
    latencyMs: result.latencyMs,
  };
}

export interface DataPaginateInput {
  datasourceId?: string;
  ontology?: string;
  intent?: QueryIntent;
  sql?: string;
  offset?: number;
  limit?: number;
  /** 智能体挂载的本体 id 集合；空/未设置 = 不限 */
  allowed?: string[];
}

/** 本体定位失败的统一报错文案：区分「不存在」与「存在但未挂载」 */
async function ontologyNotFoundMsg(userId: string, ref: string, allowed?: string[]): Promise<string> {
  const all = await listOntologiesOf(userId);
  if (all.some((o) => o.id === ref || o.code === ref)) {
    return `本体「${ref}」未挂载到当前智能体（请在智能体编辑的「本体」挂载页添加后再查询）`;
  }
  return `本体不存在: ${ref}（先用 api_ontology_overview 浏览可用本体）`;
}

/**
 * 翻页：把上一次的查询（本体意图或 SQL）作为子查询，外层套方言化 LIMIT/OFFSET。
 * 这样本体模式与 SQL 模式共用一套翻页语义，且不改动原查询的过滤/分组逻辑。
 */
export async function paginateDataForAgent(userId: string, input: DataPaginateInput) {
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 50), 1), MAX_PAGE_ROWS);
  const offset = Math.max(Math.floor(input.offset ?? 0), 0);

  if (input.ontology) {
    const all = filterAllowed(await listOntologiesOf(userId), input.allowed);
    const target = all.find((o) => o.id === input.ontology || o.code === input.ontology);
    if (!target) throw new Error(await ontologyNotFoundMsg(userId, input.ontology, input.allowed));
    const intent = mergeIntent(target, input.intent, offset + limit);
    const base = await queryOntologyByRef(userId, target.id, intent, offset + limit, DEFAULT_QUERY_TIMEOUT);
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

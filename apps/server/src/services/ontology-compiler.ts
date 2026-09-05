// 本体查询编译引擎 v1（P3.3 的第一阶段）：
// 单本体查询 DSL → 受限只读 SQL。维度/度量/时间粒度/过滤器/排序/分页，
// 全部走 dialect.ts 方言适配（mysql|postgres|dm|oracle|sqlite）。
// 跨本体关系 JOIN（Steiner 最小连接子树 + 扇出拒绝）是 P3.3 后续，本层只处理单本体。
import { dateTrunc, paginate, quoteIdent, type DialectType, type TimeGrain } from './dialect.js';

// ===== 本体规格（与 services/ontology.ts 的存储段一一对应） =====

export interface OntologyEntity {
  name: string;
  type: 'primary' | 'foreign';
  expr: string;
}

export interface OntologyDimension {
  name: string;
  expr: string; // 引用 source_sql 输出列别名
  description?: string;
  refAttr?: string;
  sampleValues?: string[];
}

export interface OntologyTimeDimension {
  name: string;
  expr: string;
  description?: string;
  granularities?: TimeGrain[];
}

export interface OntologyMeasure {
  name: string;
  expr: string;
  agg: 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max';
  additive?: 'additive' | 'non_additive' | 'semi_additive';
  description?: string;
}

export interface OntologySpec {
  sourceSql: string;
  aliases: string[];
  dimensions: OntologyDimension[];
  timeDimensions: OntologyTimeDimension[];
  measures: OntologyMeasure[];
}

// ===== 查询意图（LLM 或前端产出的 DSL） =====

export interface QueryIntent {
  dimensions?: string[];
  timeDimension?: { name: string; grain?: TimeGrain };
  measures?: { name: string; agg?: string }[];
  filters?: string[];
  orderBy?: { name: string; dir?: 'asc' | 'desc' }[];
  limit?: number;
}

export interface CompileResult {
  sql: string;
  selectItems: string[];
  warnings: string[];
}

const AGGS = new Set(['sum', 'count', 'count_distinct', 'avg', 'min', 'max']);
const GRAINS = new Set(['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute']);

function aggExpr(agg: string, expr: string): string {
  switch (agg) {
    case 'count':
      return `COUNT(*)`;
    case 'count_distinct':
      return `COUNT(DISTINCT ${expr})`;
    default:
      return `${agg.toUpperCase()}(${expr})`;
  }
}

/** 输出列名：本体字段名作为列别名（全部双引号化，Oracle 侧后续按需大写化） */
function outCol(name: string): string {
  return quoteIdent('sqlite', name).replace(/`/g, '"'); // 统一双引号别名，方言间最大公约
}

/**
 * 编译单本体查询。
 * 结构：SELECT <维度/时间桶/聚合度量> FROM (source_sql) _ont [WHERE filters] [GROUP BY 非聚合项] [ORDER BY] [LIMIT]
 * 意图引用的字段必须在 spec 中存在（LLM 幻觉字段在这里拦下），expr 已在保存时校验过别名合法性。
 */
export function compileOntologyQuery(dialect: DialectType, spec: OntologySpec, intent: QueryIntent): CompileResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const dimByName = new Map(spec.dimensions.map((d) => [d.name, d]));
  const timeByName = new Map(spec.timeDimensions.map((d) => [d.name, d]));
  const measureByName = new Map(spec.measures.map((m) => [m.name, m]));

  // ── 解析选择器 ──
  const selectItems: string[] = [];
  const groupByItems: string[] = [];

  for (const name of intent.dimensions || []) {
    const d = dimByName.get(name);
    if (!d) {
      errors.push(`维度「${name}」不存在，可用：${spec.dimensions.map((x) => x.name).join(', ') || '无'}`);
      continue;
    }
    selectItems.push(`${d.expr} AS ${outCol(d.name)}`);
    groupByItems.push(d.expr);
  }

  if (intent.timeDimension) {
    const t = timeByName.get(intent.timeDimension.name);
    if (!t) {
      errors.push(`时间维度「${intent.timeDimension.name}」不存在，可用：${spec.timeDimensions.map((x) => x.name).join(', ') || '无'}`);
    } else {
      const grain = intent.timeDimension.grain || 'day';
      if (!GRAINS.has(grain)) errors.push(`时间粒度「${grain}」不支持`);
      else {
        const bucket = dateTrunc(dialect, t.expr, grain);
        selectItems.push(`${bucket} AS ${outCol(t.name)}`);
        groupByItems.push(bucket);
      }
    }
  }

  const measureIntents = intent.measures?.length
    ? intent.measures
    : spec.measures.length
      ? [{ name: spec.measures[0].name }]
      : [];

  for (const m of measureIntents) {
    const def = measureByName.get(m.name);
    if (!def) {
      errors.push(`度量「${m.name}」不存在，可用：${spec.measures.map((x) => x.name).join(', ') || '无'}`);
      continue;
    }
    let agg = (m.agg || def.agg).toLowerCase();
    if (!AGGS.has(agg)) {
      errors.push(`聚合「${agg}」不支持，可选 ${[...AGGS].join('/')}`);
      continue;
    }
    if (agg === 'count' && def.expr && def.expr !== '*') {
      warnings.push(`度量「${def.name}」意图为 count，按其定义 ${def.agg} 执行`);
      agg = def.agg;
    }
    if (def.additive === 'non_additive' && m.agg && m.agg !== def.agg) {
      warnings.push(`度量「${def.name}」为不可加度量，忽略改写聚合的请求，按定义 ${def.agg} 执行`);
      agg = def.agg;
    }
    selectItems.push(`${aggExpr(agg, def.expr)} AS ${outCol(def.name)}`);
  }

  if (!selectItems.length) {
    throw Object.assign(new Error(errors.join('；') || '查询意图为空：至少需要一个维度、时间维度或度量'), {
      compileErrors: errors,
    });
  }

  // ── 组装 SQL ──
  const lines: string[] = ['SELECT'];
  lines.push(selectItems.map((s) => `  ${s}`).join(',\n'));
  lines.push(`FROM (${spec.sourceSql}) _ont`);

  if (intent.filters?.length) {
    lines.push(`WHERE ${intent.filters.join('\n  AND ')}`);
  }
  if (groupByItems.length) {
    lines.push(`GROUP BY ${groupByItems.join(', ')}`);
  }
  if (intent.orderBy?.length) {
    const known = new Set([
      ...(intent.dimensions || []),
      intent.timeDimension?.name,
      ...measureIntents.map((m) => m.name),
    ]);
    const parts: string[] = [];
    for (const o of intent.orderBy) {
      if (!known.has(o.name)) {
        warnings.push(`排序字段「${o.name}」不在输出列中，忽略`);
        continue;
      }
      parts.push(`${outCol(o.name)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`);
    }
    if (parts.length) lines.push(`ORDER BY ${parts.join(', ')}`);
  }

  const limit = Math.max(1, Math.min(intent.limit ?? 200, 1000));
  lines.push(paginate(dialect, { limit }));

  if (errors.length) {
    throw Object.assign(new Error(errors.join('；')), { compileErrors: errors });
  }

  return { sql: lines.join('\n'), selectItems, warnings };
}

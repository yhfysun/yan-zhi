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

/**
 * 选择列（本体级查询契约，不是属性定义）：
 * - name 引用本体的维度/度量/时间维度名
 * - isDefault：默认选择列——不召回，无条件拼进本体摘要；
 *   用户提问未指定查询哪些列时，编译器就用这批列兜底 SELECT
 * - keywords：非默认选择列按问题与命中词召回
 */
export interface OntologySelection {
  name: string;              // 引用本体属性名（维度/度量/时间维度）
  keywords?: string[];
  isDefault?: boolean;
  description?: string;
}

/** 查询过滤器：命中才注入 WHERE（区别于行级策略 policies 的强制注入） */
export interface OntologyFilter {
  name: string;            // 过滤器名，如「近30天」
  expr: string;            // SQL 条件，如 created_at >= DATE('now','-30 day')
  keywords?: string[];     // 召回命中词
  isDefault?: boolean;     // 默认过滤器：直接拼进本体 YAML
  description?: string;
}

/** 跨本体关联关系（v1 单跳；N:N 经中间表展开两跳） */
export interface OntologyRelation {
  source: string;            // 自身本体 code（拥有该关联的一方），与 target 构成有向边 source → target
  type: '1:1' | '1:N' | 'N:1' | 'N:N';
  target: string;            // 对方本体 code
  sourceAttr: string;        // 自身本体侧连接列（source_sql 输出别名）
  targetAttr: string;        // 对方侧连接列
  via?: {                    // 仅 N:N：中间表
    table: string;           // 中间物理表名
    sourceColumn: string;    // 中间表指向本体的外键列
    targetColumn: string;    // 中间表指向对方的外键列
  };
  description?: string;
}

export interface OntologySpec {
  sourceSql: string;
  aliases: string[];
  dimensions: OntologyDimension[];
  timeDimensions: OntologyTimeDimension[];
  measures: OntologyMeasure[];
  filters: OntologyFilter[];
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

/** 跨本体查询意图：root + join 指定要带上的对方本体（必须存在已声明的关联关系） */
export interface JoinIntent extends QueryIntent {
  root: string;
  join?: string[];
}

export interface OntologySpecWithCode extends OntologySpec {
  code: string;
  relations: OntologyRelation[];
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

// ===== 过滤器解析 =====

/** 单个 token（无空白、无 SQL 运算符）——视为过滤器名引用而非裸条件 */
const BARE_NAME_RE = /^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5-]*$/;

/**
 * 把 intent.filters 解析为 WHERE 条件片段：
 * - 元素等于某个 spec.filters 的 name（或 `@name`）→ 展开该过滤器 expr
 * - 裸单词（无空白无运算符）但查不到 → 报错（拦 LLM 幻觉/笔误）
 * - 其余按裸 SQL 条件原样放行（试跑/高级用法），外层加括号
 */
export function resolveIntentFilters(
  specs: { code: string; filters: OntologyFilter[] }[],
  intentFilters: string[] | undefined,
  warnings: string[],
  errors: string[],
): string[] {
  const out: string[] = [];
  for (const raw of intentFilters || []) {
    const t = (raw || '').trim();
    if (!t) continue;
    const wanted = t.startsWith('@') ? t.slice(1) : t;
    const hits = specs
      .map((s) => ({ code: s.code, filter: s.filters.find((f) => f.name === wanted) }))
      .filter((h) => h.filter);
    if (hits.length === 1) {
      out.push(`(${hits[0].filter!.expr})`);
      continue;
    }
    if (hits.length > 1) {
      errors.push(`过滤器「${wanted}」在多个本体中重名（${hits.map((h) => h.code).join('/')}），请先重命名再引用`);
      continue;
    }
    if (t.startsWith('@') || BARE_NAME_RE.test(t)) {
      const available = specs.flatMap((s) => s.filters.map((f) => f.name));
      errors.push(`过滤器「${wanted}」不存在，可用：${available.join(', ') || '无'}`);
      continue;
    }
    out.push(`(${t})`); // 裸 SQL 条件
  }
  return out;
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

  const resolvedFilters = resolveIntentFilters(
    [{ code: '_ont', filters: spec.filters }], intent.filters, warnings, errors,
  );
  if (resolvedFilters.length) {
    lines.push(`WHERE ${resolvedFilters.join('\n  AND ')}`);
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

// ===== 跨本体编译（v1：单跳，N:N 经中间表展开两跳；多跳/循环/多路径扇出拒绝） =====

/** 从 ref 中拆命名空间：'agent.name' → ['agent','name']；裸名 → [undefined, ref] */
function splitRef(ref: string): [string | undefined, string] {
  const i = ref.indexOf('.');
  return i === -1 ? [undefined, ref] : [ref.slice(0, i), ref.slice(i + 1)];
}

export function compileOntologyJoinQuery(
  dialect: DialectType,
  specs: OntologySpecWithCode[],
  intent: JoinIntent,
): CompileResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const byCode = new Map(specs.map((s) => [s.code, s]));
  const root = byCode.get(intent.root);
  if (!root) {
    throw Object.assign(new Error(`根本体「${intent.root}」不存在或未发布`), { compileErrors: [`根本体「${intent.root}」不存在或未发布`] });
  }

  // ── 关系解析：root 与每个 join 目标之间必须有且只有一条已声明关系 ──
  const joins: { code: string; rel: OntologyRelation; declaredOnRoot: boolean }[] = [];
  const seen = new Set<string>();
  for (const code of intent.join || []) {
    if (code === intent.root) continue;
    if (!byCode.has(code)) { errors.push(`待关联本体「${code}」不存在或未发布`); continue; }
    if (seen.has(code)) { errors.push(`本体「${code}」在 join 中重复出现`); continue; }
    seen.add(code);
    const onRoot = root.relations.filter((r) => r.source === intent.root && r.target === code);
    const onTarget = byCode.get(code)!.relations.filter((r) => r.source === code && r.target === intent.root);
    if (onRoot.length + onTarget.length === 0) {
      errors.push(`本体「${intent.root}」与「${code}」之间没有已声明的关联关系`);
      continue;
    }
    if (onRoot.length + onTarget.length > 1) {
      errors.push(`本体「${intent.root}」与「${code}」之间声明了多条关联（路径歧义），v1 拒绝编译`);
      continue;
    }
    joins.push({ code, rel: onRoot[0] || onTarget[0], declaredOnRoot: onRoot.length > 0 });
  }
  if (errors.length) {
    throw Object.assign(new Error(errors.join('；')), { compileErrors: errors });
  }

  const involved = [root, ...joins.map((j) => byCode.get(j.code)!)];

  /** 字段引用解析：支持 'code.name' 与裸 'name'（裸名须在全部参与本体中唯一） */
  function resolveRef(ref: string): { expr: string } | null {
    const [ns, name] = splitRef(ref);
    const scopes = ns ? involved.filter((s) => s.code === ns) : involved;
    if (ns && !scopes.length) { errors.push(`引用「${ref}」的本体「${ns}」不在本次查询中`); return null; }
    let expr: string | null = null;
    for (const s of scopes) {
      const hit =
        s.dimensions.find((d) => d.name === name) ||
        s.measures.find((m) => m.name === name) ||
        s.timeDimensions.find((t) => t.name === name);
      if (hit) {
        if (expr && expr !== hit.expr) { errors.push(`字段「${ref}」在多个本体中重名，请用 code.name 消歧`); return null; }
        expr = hit.expr;
      }
    }
    if (!expr) errors.push(`字段「${ref}」不存在（维度/度量/时间维度中均未找到）`);
    return expr ? { expr } : null;
  }

  const selectItems: string[] = [];
  const groupByItems: string[] = [];
  const outputRefs = new Set<string>();

  for (const ref of intent.dimensions || []) {
    const hit = resolveRef(ref);
    if (!hit) continue;
    selectItems.push(`${hit.expr} AS ${outCol(ref)}`);
    groupByItems.push(hit.expr);
    outputRefs.add(ref);
  }

  if (intent.timeDimension) {
    const hit = resolveRef(intent.timeDimension.name);
    const [ns, name] = splitRef(intent.timeDimension.name);
    const scope = (ns ? involved.filter((s) => s.code === ns) : involved)
      .map((s) => s.timeDimensions.find((t) => t.name === name))
      .find(Boolean);
    if (!hit || !scope) {
      errors.push(`时间维度「${intent.timeDimension.name}」不存在`);
    } else {
      const grain = intent.timeDimension.grain || 'day';
      if (!GRAINS.has(grain)) errors.push(`时间粒度「${grain}」不支持`);
      else {
        const bucket = dateTrunc(dialect, hit.expr, grain);
        selectItems.push(`${bucket} AS ${outCol(intent.timeDimension.name)}`);
        groupByItems.push(bucket);
        outputRefs.add(intent.timeDimension.name);
      }
    }
  }

  const measureIntents = intent.measures?.length
    ? intent.measures
    : root.measures.length
      ? [{ name: root.measures[0].name }]
      : [];

  for (const m of measureIntents) {
    const [ns, name] = splitRef(m.name);
    const scopes = ns ? involved.filter((s) => s.code === ns) : involved;
    let def: OntologyMeasure | undefined;
    for (const s of scopes) {
      const hit = s.measures.find((x) => x.name === name);
      if (hit) {
        if (def && def.expr !== hit.expr) { errors.push(`度量「${m.name}」在多个本体中重名，请用 code.name 消歧`); def = undefined; break; }
        def = hit;
      }
    }
    if (!def) { errors.push(`度量「${m.name}」不存在，可用：${involved.flatMap((s) => s.measures.map((x) => x.name)).join(', ') || '无'}`); continue; }
    let agg = (m.agg || def.agg).toLowerCase();
    if (!AGGS.has(agg)) { errors.push(`聚合「${agg}」不支持，可选 ${[...AGGS].join('/')}`); continue; }
    if (agg === 'count' && def.expr && def.expr !== '*') { warnings.push(`度量「${def.name}」意图为 count，按其定义 ${def.agg} 执行`); agg = def.agg; }
    if (def.additive === 'non_additive' && m.agg && m.agg !== def.agg) { warnings.push(`度量「${def.name}」为不可加度量，忽略改写聚合的请求，按定义 ${def.agg} 执行`); agg = def.agg; }
    selectItems.push(`${aggExpr(agg, def.expr)} AS ${outCol(m.name)}`);
    outputRefs.add(m.name);
  }

  if (!selectItems.length) {
    throw Object.assign(new Error(errors.join('；') || '查询意图为空：至少需要一个维度、时间维度或度量'), { compileErrors: errors });
  }

  // ── FROM + JOIN 链 ──
  const q = (id: string) => quoteIdent('sqlite', id).replace(/`/g, '"');
  const lines: string[] = ['SELECT'];
  lines.push(selectItems.map((s) => `  ${s}`).join(',\n'));
  lines.push(`FROM (${root.sourceSql}) _ont`);
  joins.forEach((j, i) => {
    const tAlias = `t_${j.code}`;
    const src = j.declaredOnRoot ? j.rel.sourceAttr : j.rel.targetAttr;
    const dst = j.declaredOnRoot ? j.rel.targetAttr : j.rel.sourceAttr;
    if (j.rel.type === 'N:N') {
      if (!j.rel.via) { errors.push(`关联「${intent.root}→${j.code}」为 N:N 但缺少中间表 via 定义`); return; }
      const vAlias = `_via_${i}`;
      lines.push(`INNER JOIN ${q(j.rel.via.table)} ${vAlias}`);
      lines.push(`  ON ${vAlias}.${q(j.rel.via.sourceColumn)} = _ont.${q(src)}`);
      lines.push(`INNER JOIN (${byCode.get(j.code)!.sourceSql}) ${tAlias}`);
      lines.push(`  ON ${vAlias}.${q(j.rel.via.targetColumn)} = ${tAlias}.${q(dst)}`);
    } else {
      lines.push(`INNER JOIN (${byCode.get(j.code)!.sourceSql}) ${tAlias}`);
      lines.push(`  ON _ont.${q(src)} = ${tAlias}.${q(dst)}`);
    }
  });

  const resolvedFilters = resolveIntentFilters(
    involved.map((s) => ({ code: s.code, filters: s.filters })), intent.filters, warnings, errors,
  );
  if (resolvedFilters.length) lines.push(`WHERE ${resolvedFilters.join('\n  AND ')}`);
  if (groupByItems.length) lines.push(`GROUP BY ${groupByItems.join(', ')}`);

  if (intent.orderBy?.length) {
    const parts: string[] = [];
    for (const o of intent.orderBy) {
      if (!outputRefs.has(o.name)) { warnings.push(`排序字段「${o.name}」不在输出列中，忽略`); continue; }
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

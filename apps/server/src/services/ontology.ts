// 本体管理服务（P3.2~3.5）：
// CRUD（保存走 ontology-validator 别名校验）+ YAML 导入导出 + 编译/试跑/发布 +
// 内置项目库自动本体（每表一个，builtin=1，AI 富化在 P3.5 补描述/同义词）。
import { v4 as uuid } from 'uuid';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { db } from '../db.js';
import { getConnector, type DataSourceRow } from './connector.js';
import { validateOntology, checkSourceSqlAliases } from './ontology-validator.js';
import { buildTableOntologySpec, type TableSchemaLite } from './ontology-table-gen.js';
import {
  compileOntologyQuery,
  compileOntologyJoinQuery,
  type OntologySpec,
  type OntologySpecWithCode,
  type JoinIntent,
  type QueryIntent,
  type OntologyDimension,
  type OntologyTimeDimension,
  type OntologyMeasure,
  type OntologyFilter,
  type OntologyRelation,
  type OntologySelection,
} from './ontology-compiler.js';
import type { DialectType } from './dialect.js';
import { buildOntologyDigest, recallConfigFromEnv } from './ontology-recall.js';
import { ensureAppGroup, APP_GROUP_NAME } from './ontology-group.js';
import { BUILTIN_TABLE_DOCS, COMMON_FIELD_DOCS } from './ontology-docs.js';

// ===== 类型 =====

interface OntologyRow {
  id: string;
  user_id: string;
  datasource_id: string;
  code: string;
  name: string;
  domain: string | null;
  description: string | null;
  synonyms_json: string | null;
  source_sql: string;
  entities_json: string | null;
  time_dimensions_json: string | null;
  dimensions_json: string | null;
  measures_json: string | null;
  filters_json: string | null;
  relations_json: string | null;
  selections_json: string | null;
  policies_json: string | null;
  group_id: string | null;
  status: string;
  version: number;
  builtin: number;
  enriched_by: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

export interface OntologyEntity { name: string; type: 'primary' | 'foreign'; expr: string }

export interface OntologyInfo {
  id: string;
  datasourceId: string;
  code: string;
  name: string;
  domain: string | null;
  description: string | null;
  synonyms: string[];
  sourceSql: string;
  entities: OntologyEntity[];
  timeDimensions: OntologyTimeDimension[];
  dimensions: OntologyDimension[];
  measures: OntologyMeasure[];
  filters: OntologyFilter[];
  relations: OntologyRelation[];
  selections: OntologySelection[];
  policies: string[];
  /** 所属本体包（多级分类树）；null = 未分类 */
  groupId: string | null;
  status: string;
  version: number;
  builtin: boolean;
  enrichedBy: string | null;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

interface SaveInput {
  datasourceId: string;
  code: string;
  name: string;
  domain?: string;
  description?: string;
  synonyms?: string[];
  sourceSql: string;
  entities?: OntologyEntity[];
  timeDimensions?: OntologyTimeDimension[];
  dimensions?: OntologyDimension[];
  measures?: OntologyMeasure[];
  filters?: OntologyFilter[];
  relations?: OntologyRelation[];
  selections?: OntologySelection[];
  policies?: string[];
  /** 所属本体包（多级分类树）；缺省 = 未分类 */
  groupId?: string;
  /** 内置本体标记：项目库自动生成的本体传 true（不可删、code/数据源/物理 SQL 不可改）；用户自建留空。 */
  builtin?: boolean;
}

function parseJsonList<T>(s: string | null | undefined, fallback: T[] = []): T[] {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function toInfo(row: OntologyRow): OntologyInfo {
  return {
    id: row.id,
    datasourceId: row.datasource_id,
    code: row.code,
    name: row.name,
    domain: row.domain,
    description: row.description,
    synonyms: parseJsonList<string>(row.synonyms_json),
    sourceSql: row.source_sql,
    entities: parseJsonList<OntologyEntity>(row.entities_json),
    timeDimensions: parseJsonList<OntologyTimeDimension>(row.time_dimensions_json),
    dimensions: parseJsonList<OntologyDimension>(row.dimensions_json),
    measures: parseJsonList<OntologyMeasure>(row.measures_json),
    filters: parseJsonList<OntologyFilter>(row.filters_json),
    relations: parseJsonList<OntologyRelation>(row.relations_json),
    selections: (() => {
      // 旧结构兼容：早期选择列是 {name=字段名, isDefault}。若全部条目均无 fields（纯旧数据），
      // 合并为单个「全部字段」组；混合/新结构仅补 fields=[name]。
      const raw = parseJsonList<OntologySelection>(row.selections_json);
      const legacy = raw.filter((s) => !s.fields?.length);
      if (legacy.length && legacy.length === raw.length) {
        const all = legacy.map((s) => s.name).filter(Boolean);
        return all.length ? [{ name: '全部字段', fields: all }] : [];
      }
      return raw.map((s) => ({ ...s, fields: s.fields?.length ? s.fields : [s.name].filter(Boolean) }));
    })(),
    policies: parseJsonList<string>(row.policies_json),
    groupId: row.group_id ?? null,
    status: row.status,
    version: row.version,
    builtin: !!row.builtin,
    enrichedBy: row.enriched_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function getRow(userId: string, id: string): OntologyRow | undefined {
  return db.prepare('SELECT * FROM ontology WHERE id = ? AND user_id = ?').get(id, userId) as OntologyRow | undefined;
}

/** 保存前的语义校验：别名完整性 + 维度/度量/实体/过滤器 expr 引用别名集合（addendum H2） */
function validateSave(input: SaveInput): void {
  if (!input.code?.trim()) throw new Error('本体 code 不能为空');
  if (!/^[a-z][a-z0-9_]*$/.test(input.code.trim())) {
    throw new Error('本体 code 只能用小写字母/数字/下划线，且以字母开头');
  }
  if (!input.name?.trim()) throw new Error('本体名称不能为空');
  if (!input.sourceSql?.trim()) throw new Error('物理来源 SQL 不能为空');

  // 选择列（命名查询列组）：name 必填，fields 每个都必须引用本体的维度/度量/时间维度
  const fieldNames = new Set<string>([
    ...(input.dimensions || []).map((d) => d.name),
    ...(input.timeDimensions || []).map((d) => d.name),
    ...(input.measures || []).map((m) => m.name),
  ]);
  for (const s of input.selections || []) {
    if (!s.name?.trim()) throw new Error('选择列 name 不能为空');
    const fields = (s.fields || []).filter(Boolean);
    if (!fields.length) throw new Error(`选择列「${s.name}」至少要包含一个字段`);
    for (const f of fields) {
      if (!fieldNames.has(f)) {
        throw new Error(`选择列「${s.name}」的字段「${f}」不是本体的维度/度量/时间维度（可用：${[...fieldNames].join(', ') || '无'}）`);
      }
    }
  }
  // 关联关系：source 必须是自身本体 code（构成有向边 source → target）
  for (const r of input.relations || []) {
    if (!r.source?.trim()) throw new Error('关联关系 source（自身本体 code）不能为空');
    if (r.source.trim() !== input.code.trim()) {
      throw new Error(`关联关系 source「${r.source}」必须等于本体自身 code「${input.code}」`);
    }
  }

  const exprs = [
    ...(input.dimensions || []).map((d) => d.expr),
    ...(input.timeDimensions || []).map((d) => d.expr),
    ...(input.measures || []).filter((m) => m.expr && m.expr !== '*').map((m) => m.expr),
    ...(input.entities || []).map((e) => e.expr),
    ...(input.relations || []).map((r) => r.sourceAttr), // 关联的本体侧连接列必须是输出别名
    ...(input.policies || []),
  ];
  const errors = validateOntology({
    sourceSql: input.sourceSql,
    selectorExprs: exprs,
    filterExprs: (input.filters || []).map((f) => f.expr), // 过滤器条件同样只许引用输出别名
  });
  if (!errors.ok) {
    const first = errors.errors[0];
    throw Object.assign(new Error(`${first.message}${first.location ? `（${first.location}）` : ''}`), {
      validationErrors: errors.errors,
    });
  }
}

// ===== CRUD =====

export function listOntologies(userId: string, opts?: { datasourceId?: string; keyword?: string }): OntologyInfo[] {
  ensureBuiltinOntologies(userId);
  const rows = db
    .prepare('SELECT * FROM ontology WHERE user_id = ? ORDER BY builtin DESC, code ASC')
    .all(userId) as OntologyRow[];
  let list = rows.map(toInfo);
  if (opts?.datasourceId) list = list.filter((o) => o.datasourceId === opts.datasourceId);
  if (opts?.keyword?.trim()) {
    const k = opts.keyword.trim().toLowerCase();
    list = list.filter((o) =>
      [o.code, o.name, o.description, o.domain].some((s) => (s || '').toLowerCase().includes(k)),
    );
  }
  return list;
}

export function createOntology(userId: string, input: SaveInput): OntologyInfo {
  validateSave(input);
  const id = `ont_${uuid().slice(0, 12)}`;
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO ontology
         (id, user_id, datasource_id, code, name, domain, description, synonyms_json, source_sql,
          entities_json, time_dimensions_json, dimensions_json, measures_json, filters_json, relations_json, selections_json, policies_json,
          group_id, status, version, builtin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)`,
    ).run(
      id, userId, input.datasourceId, input.code.trim(), input.name.trim(),
      input.domain?.trim() || null, input.description?.trim() || null,
      JSON.stringify(input.synonyms || []), input.sourceSql.trim(),
      JSON.stringify(input.entities || []), JSON.stringify(input.timeDimensions || []),
      JSON.stringify(input.dimensions || []), JSON.stringify(input.measures || []),
      JSON.stringify(input.filters || []), JSON.stringify(input.relations || []), JSON.stringify(input.selections || []), JSON.stringify(input.policies || []),
      input.groupId?.trim() || null,
      input.builtin ? 1 : 0,
      now, now,
    );
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) {
      throw new Error(`本体 code 已存在: ${input.code.trim()}`);
    }
    throw e;
  }
  return toInfo(getRow(userId, id)!);
}

export function updateOntology(userId: string, id: string, input: SaveInput): OntologyInfo {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体不存在');
  if (row.builtin) {
    // 内置本体允许补充语义（富化），但 code/数据源/物理 SQL 不可改
    validateSave({ ...input, datasourceId: row.datasource_id, code: row.code, sourceSql: row.source_sql });
    db.prepare(
      `UPDATE ontology SET name=?, domain=?, description=?, synonyms_json=?,
         time_dimensions_json=?, dimensions_json=?, measures_json=?, filters_json=?, selections_json=?, policies_json=?, group_id=?, status='draft', updated_at=?
       WHERE id=? AND user_id=?`,
    ).run(
      input.name?.trim() || row.name, input.domain?.trim() || row.domain,
      input.description?.trim() || row.description, JSON.stringify(input.synonyms || parseJsonList(row.synonyms_json)),
      JSON.stringify(input.timeDimensions || parseJsonList(row.time_dimensions_json)),
      JSON.stringify(input.dimensions || parseJsonList(row.dimensions_json)),
      JSON.stringify(input.measures || parseJsonList(row.measures_json)),
      JSON.stringify(input.filters || parseJsonList(row.filters_json)),
      JSON.stringify(input.selections || parseJsonList<OntologySelection>(row.selections_json)),
      JSON.stringify(input.policies || parseJsonList(row.policies_json)),
      input.groupId?.trim() || (row.group_id ?? null),
      Date.now(), id, userId,
    );
    return toInfo(getRow(userId, id)!);
  }
  validateSave(input);
  db.prepare(
    `UPDATE ontology SET datasource_id=?, code=?, name=?, domain=?, description=?, synonyms_json=?,
       source_sql=?, entities_json=?, time_dimensions_json=?, dimensions_json=?, measures_json=?,
       filters_json=?, relations_json=?, selections_json=?, policies_json=?, group_id=?, status='draft', updated_at=?
     WHERE id=? AND user_id=?`,
  ).run(
    input.datasourceId, input.code.trim(), input.name.trim(),
    input.domain?.trim() || null, input.description?.trim() || null,
    JSON.stringify(input.synonyms || []), input.sourceSql.trim(),
    JSON.stringify(input.entities || []), JSON.stringify(input.timeDimensions || []),
    JSON.stringify(input.dimensions || []), JSON.stringify(input.measures || []),
    JSON.stringify(input.filters || []), JSON.stringify(input.relations || []), JSON.stringify(input.selections || []), JSON.stringify(input.policies || []),
    input.groupId?.trim() || null,
    Date.now(), id, userId,
  );
  return toInfo(getRow(userId, id)!);
}

/** 移动本体到指定包（拖拽归组用）；groupId 为 null = 移入「未分类」 */
export function moveOntologyToGroup(userId: string, id: string, groupId: string | null): void {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体不存在');
  if (groupId) {
    const grp = db.prepare('SELECT id FROM ontology_group WHERE id = ? AND user_id = ?').get(groupId, userId);
    if (!grp) throw new Error('目标本体包不存在');
  }
  db.prepare('UPDATE ontology SET group_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    groupId ?? null, Date.now(), id, userId,
  );
}

export function deleteOntology(userId: string, id: string): void {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体不存在');
  if (row.builtin) throw new Error('内置本体不可删除（可编辑语义后发布）');
  db.prepare('DELETE FROM ontology WHERE id = ? AND user_id = ?').run(id, userId);
  // 同步清理智能体挂载中的悬挂引用（ontology_ids 含已删除本体的置为未挂载）
  try {
    const agents = db.prepare("SELECT id, ontology_ids FROM agent WHERE ontology_ids IS NOT NULL AND ontology_ids != '[]'").all() as Array<{ id: string; ontology_ids: string }>;
    for (const a of agents) {
      try {
        const ids = JSON.parse(a.ontology_ids) as string[];
        if (Array.isArray(ids) && ids.includes(id)) {
          db.prepare('UPDATE agent SET ontology_ids = ? WHERE id = ?').run(JSON.stringify(ids.filter((x) => x !== id)), a.id);
        }
      } catch { /* 单条解析失败忽略 */ }
    }
  } catch { /* agent 表无 ontology_ids 列时忽略 */ }
}

/** 发布：草稿对智能体不可见，发布即改取数口径（version 持久递增） */
export function publishOntology(userId: string, id: string): OntologyInfo {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体不存在');
  const now = Date.now();
  db.prepare("UPDATE ontology SET status='published', version=version+1, published_at=?, updated_at=? WHERE id=? AND user_id=?").run(
    now, now, id, userId,
  );
  return toInfo(getRow(userId, id)!);
}

// ===== 编译 / 预览 / 试跑 =====

function getSpec(row: OntologyRow): OntologySpec {
  return {
    sourceSql: row.source_sql,
    aliases: checkSourceSqlAliases(row.source_sql).ok
      ? checkSourceSqlAliases(row.source_sql).aliases
      : [],
    dimensions: parseJsonList<OntologyDimension>(row.dimensions_json),
    timeDimensions: parseJsonList<OntologyTimeDimension>(row.time_dimensions_json),
    measures: parseJsonList<OntologyMeasure>(row.measures_json),
    filters: parseJsonList<OntologyFilter>(row.filters_json),
  };
}

function getDialectOf(ds: DataSourceRow): DialectType {
  return (ds.type === 'project' ? 'sqlite' : ds.type) as DialectType;
}

function loadWithDatasource(userId: string, id: string): { row: OntologyRow; ds: DataSourceRow } {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体不存在');
  const ds = db.prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?').get(row.datasource_id, userId) as
    | DataSourceRow
    | undefined;
  if (!ds) throw new Error('本体挂载的数据源不存在');
  return { row, ds };
}

/** 预览定义：只编译不执行（本体预览） */
export function compileOntology(userId: string, id: string, intent: QueryIntent): ReturnType<typeof compileOntologyQuery> {
  const { row, ds } = loadWithDatasource(userId, id);
  return compileOntologyQuery(getDialectOf(ds), getSpec(row), intent);
}

/**
 * 跨本体编译（v1 单跳）：root 本体 + 同数据源已发布本体组 spec 集。
 * intent.join 引用的对方本体必须是 published；root 用当前编辑本体（无论状态，便于预览）。
 */
export function compileOntologyJoin(userId: string, id: string, intent: JoinIntent): ReturnType<typeof compileOntologyJoinQuery> {
  const { row, ds } = loadWithDatasource(userId, id);
  const published = db
    .prepare("SELECT * FROM ontology WHERE user_id = ? AND datasource_id = ? AND status = 'published'")
    .all(userId, row.datasource_id) as OntologyRow[];
  const specs: OntologySpecWithCode[] = [{ code: row.code, ...getSpec(row), relations: parseJsonList<OntologyRelation>(row.relations_json) }];
  for (const r of published) {
    if (r.id === row.id) continue;
    specs.push({ code: r.code, ...getSpec(r), relations: parseJsonList<OntologyRelation>(r.relations_json) });
  }
  return compileOntologyJoinQuery(getDialectOf(ds), specs, { ...intent, root: row.code });
}

/** 语义摘要组装：默认直拼 + 非默认按问题召回（P4.2 第一版，喂大模型前调用） */
export function digestOntologies(
  userId: string,
  opts: { datasourceId?: string; question?: string },
): string {
  const rows = (
    opts.datasourceId
      ? db.prepare('SELECT * FROM ontology WHERE user_id = ? AND datasource_id = ?').all(userId, opts.datasourceId)
      : db.prepare('SELECT * FROM ontology WHERE user_id = ?').all(userId)
  ) as OntologyRow[];
  return buildOntologyDigest(rows.map(toInfo), opts.question || '', recallConfigFromEnv());
}

/** 数据预览：裸跑 source_sql 前 N 行（不套任何选择器/过滤器） */
export async function previewOntologyData(userId: string, id: string, limit = 50) {
  const { row, ds } = loadWithDatasource(userId, id);
  const aliased = checkSourceSqlAliases(row.source_sql);
  if (!aliased.ok) throw new Error(`source_sql 别名校验不通过：${aliased.errors[0]?.message}`);
  const dialect = getDialectOf(ds);
  const { paginate: pag } = await import('./dialect.js');
  const sql = `SELECT * FROM (${row.source_sql}) _ont ${pag(dialect, { limit: Math.min(limit, 200) })}`;
  return getConnector(ds).query(sql, { maxRows: Math.min(limit, 200) });
}

/** 试跑查询：编译 + 真实执行（本体数据预览） */
export async function tryRunOntology(userId: string, id: string, intent: QueryIntent) {
  const { row, ds } = loadWithDatasource(userId, id);
  const compiled = compileOntologyQuery(getDialectOf(ds), getSpec(row), intent);
  const result = await getConnector(ds).query(compiled.sql, {
    maxRows: Math.min(intent.limit ?? 200, 1000),
  });
  return { ...result, compiledSql: compiled.sql, warnings: compiled.warnings };
}

/**
 * 智能体取数通道（P4.1）：按 id 或 code 定位本体 → 编译意图 → 只读执行。
 * 与 tryRunOntology 的区别：这里允许用 code 引用（LLM 从 api_ontology_search 拿到的是 code），
 * 且优先命中 published 版本（草稿对智能体不可见）。
 */
export async function queryOntologyByRef(
  userId: string,
  ref: string,
  intent: QueryIntent,
  maxRows = 200,
  timeoutMs = 15_000,
) {
  const refText = (ref || '').trim();
  if (!refText) throw new Error('本体引用（id 或 code）不能为空');
  const rows = db
    .prepare('SELECT * FROM ontology WHERE user_id = ? AND (id = ? OR code = ?)')
    .all(userId, refText, refText) as OntologyRow[];
  if (!rows.length) throw new Error(`本体不存在: ${refText}（先用 api_ontology_search / api_ontology_list 查可用本体）`);
  const row = rows.find((r) => r.status === 'published') || rows[0];
  const { ds } = loadWithDatasource(userId, row.id);
  const compiled = compileOntologyQuery(getDialectOf(ds), getSpec(row), intent);
  const result = await getConnector(ds).query(compiled.sql, {
    maxRows: Math.min(maxRows, 1000),
    timeoutMs,
  });
  return {
    ...result,
    mode: 'ontology' as const,
    ontology: row.code,
    ontologyId: row.id,
    datasourceId: row.datasource_id,
    sql: compiled.sql,
    warnings: compiled.warnings,
  };
}

// ===== YAML 导入导出（源文件态；喂 LLM 的裁剪片段在 P4.2） =====

interface OntologyYaml {
  version?: number;
  datasource?: string;
  code: string;
  name: string;
  domain?: string;
  description?: string;
  synonyms?: string[];
  source_sql?: string;
  entities?: OntologyEntity[];
  time_dimensions?: OntologyTimeDimension[];
  dimensions?: OntologyDimension[];
  measures?: OntologyMeasure[];
  filters?: OntologyFilter[];
  relations?: OntologyRelation[];
  selections?: OntologySelection[];
  policies?: string[];
}

export function exportYaml(userId: string, id: string): string {
  const o = toInfo(getRow(userId, id)!);
  const doc: OntologyYaml = {
    version: 1,
    code: o.code,
    name: o.name,
    domain: o.domain || undefined,
    description: o.description || undefined,
    synonyms: o.synonyms.length ? o.synonyms : undefined,
    source_sql: o.sourceSql,
    entities: o.entities.length ? o.entities : undefined,
    time_dimensions: o.timeDimensions.length ? o.timeDimensions : undefined,
    dimensions: o.dimensions.length ? o.dimensions : undefined,
    measures: o.measures.length ? o.measures : undefined,
    filters: o.filters.length ? o.filters : undefined,
    relations: o.relations.length ? o.relations : undefined,
    selections: o.selections.length ? o.selections : undefined,
    policies: o.policies.length ? o.policies : undefined,
  };
  return stringifyYaml(doc);
}

export function importYaml(userId: string, text: string): OntologyInfo {
  let doc: OntologyYaml;
  try {
    doc = parseYaml(text) as OntologyYaml;
  } catch (e) {
    throw new Error(`YAML 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!doc?.code || !doc?.name || !doc?.source_sql) {
    throw new Error('YAML 缺少必填字段：code / name / source_sql');
  }
  // datasource 字段填代码或数据源 id；缺省落项目库
  let datasourceId = doc.datasource || '';
  if (datasourceId && !datasourceId.startsWith('ds_')) {
    const byCode = db.prepare('SELECT id FROM data_source WHERE user_id = ? AND name = ?').get(userId, datasourceId) as
      | { id: string }
      | undefined;
    datasourceId = byCode?.id || '';
  }
  if (!datasourceId) {
    const project = db.prepare("SELECT id FROM data_source WHERE user_id = ? AND type = 'project'").get(userId) as
      | { id: string }
      | undefined;
    if (!project) throw new Error('YAML 未指定数据源，且项目库数据源未就绪');
    datasourceId = project.id;
  }
  return createOntology(userId, {
    datasourceId,
    code: doc.code,
    name: doc.name,
    domain: doc.domain,
    description: doc.description,
    synonyms: doc.synonyms,
    sourceSql: doc.source_sql,
    entities: doc.entities,
    timeDimensions: doc.time_dimensions,
    dimensions: doc.dimensions,
    measures: doc.measures,
    filters: doc.filters,
    relations: doc.relations,
    selections: doc.selections,
    policies: doc.policies,
  });
}

// ===== 手写 SQL 向导（P4.4）：执行用户 SQL → 按采样值自动推断属性 → 创建草稿 =====

export interface CreateFromSqlInput {
  datasourceId: string;
  sourceSql: string;
  code: string;
  name: string;
  description?: string;
  domain?: string;
  groupId?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/;

/** 采样值类型启发：数值→度量(sum)，ISO 日期→时间维度，其余→维度 */
function inferRole(col: string, samples: unknown[]): 'measure' | 'time' | 'dimension' {
  const vals = samples.filter((v) => v !== null && v !== undefined && v !== '');
  if (!vals.length) return 'dimension';
  const allNum = vals.every((v) => typeof v === 'number' || (typeof v === 'string' && !Number.isNaN(Number(v))));
  if (allNum) return 'measure';
  const allDate = vals.every((v) => typeof v === 'string' && ISO_DATE_RE.test(String(v).trim()));
  if (allDate) return 'time';
  return 'dimension';
}

/**
 * 从手写 SQL 创建本体（向导第三步提交）：
 * 1. 只读执行 `SELECT * FROM (用户SQL) LIMIT 20` 采样；
 * 2. 输出列（即别名）自动生成属性：数值→度量(sum)、ISO 日期→时间维度、其余→维度；
 *    并生成一个「全部字段」选择列组（fields = 全部列）；
 * 3. 创建为草稿（用户预览/补口径后手动发布）。
 * 要求 SELECT 列全部带 AS 别名（本体物理 SQL 的统一契约，编译器依赖别名拼装）。
 */
export async function createOntologyFromSql(userId: string, input: CreateFromSqlInput): Promise<OntologyInfo> {
  const ds = db
    .prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?')
    .get(input.datasourceId, userId) as DataSourceRow | undefined;
  if (!ds) throw new Error('数据源不存在');
  const sourceSql = (input.sourceSql || '').trim().replace(/;\s*$/, '');
  if (!sourceSql) throw new Error('来源 SQL 不能为空');

  // 别名契约前置校验：给出可读错误（编译器拼 SELECT 依赖别名）
  const aliased = checkSourceSqlAliases(sourceSql);
  if (!aliased.ok) {
    throw new Error(`SQL 输出列必须有 AS 别名：${aliased.errors[0]?.message || '请为每个输出列加别名'}`);
  }
  if (new Set(aliased.aliases).size !== aliased.aliases.length) {
    throw new Error(`SQL 输出列别名重复: ${aliased.aliases.join(', ')}`);
  }

  // 只读采样（向导预览阶段前端已跑过一次；此处再跑一次拿类型样本）
  const sampleSql = `SELECT * FROM (${sourceSql}) _wiz LIMIT 20`;
  const result = await getConnector(ds).query(sampleSql, { maxRows: 20, timeoutMs: 15_000 });
  if (!result.columns.length) throw new Error('SQL 结果集没有输出列');

  const dimensions: { name: string; expr: string; description?: string }[] = [];
  const timeDimensions: { name: string; expr: string; description?: string }[] = [];
  const measures: { name: string; expr: string; agg: 'sum'; description?: string }[] = [];
  for (const col of result.columns) {
    const samples = result.rows.map((r) => (r as Record<string, unknown>)[col]);
    const role = inferRole(col, samples);
    if (role === 'measure') measures.push({ name: col, expr: col, agg: 'sum' });
    else if (role === 'time') timeDimensions.push({ name: col, expr: col });
    else dimensions.push({ name: col, expr: col });
  }
  if (!dimensions.length && !measures.length && !timeDimensions.length) {
    throw new Error('未能从 SQL 结果推断出任何属性');
  }

  // 选择列：一个「全部字段」组（fields = 全部输出列），用户可在编辑区再拆分/命名
  const allFields = [...dimensions.map((d) => d.name), ...timeDimensions.map((t) => t.name), ...measures.map((m) => m.name)];

  return createOntology(userId, {
    datasourceId: input.datasourceId,
    code: input.code,
    name: input.name,
    description: input.description,
    domain: input.domain,
    groupId: input.groupId,
    sourceSql,
    dimensions,
    timeDimensions,
    measures,
    selections: [{ name: '全部字段', fields: allFields }],
  });
}

// ===== 内置项目库自动本体（P2.5.4 的轻量版：每表一个，含列结构，语义留白待富化） =====

/** 同一用户内置本体生成节流（毫秒）：避免智能体高频调用时反复扫 schema */
const BUILTIN_GEN_THROTTLE_MS = 5_000;
const lastBuiltinGenAt = new Map<string, number>();

/**
 * 为项目库每张表生成 builtin 本体（幂等：按 code 判存在）。
 * 返回 true 表示本次真的跑了生成（被节流跳过时返回 false）。
 */
async function generateBuiltinOntologies(userId: string, opts?: { force?: boolean }): Promise<boolean> {
  const last = lastBuiltinGenAt.get(userId) || 0;
  if (!opts?.force && Date.now() - last < BUILTIN_GEN_THROTTLE_MS) return false;
  lastBuiltinGenAt.set(userId, Date.now());

  const project = db
    .prepare("SELECT * FROM data_source WHERE user_id = ? AND type = 'project'")
    .get(userId) as DataSourceRow | undefined;
  if (!project) return false;
  const existingRows = db
    .prepare('SELECT id, code, name, description FROM ontology WHERE user_id = ? AND datasource_id = ?')
    .all(userId, project.id) as Array<{ id: string; code: string; name: string; description: string | null }>;
  const existing = new Set(existingRows.map((r) => r.code));
  const conn = getConnector(project);
  const schema = await conn.schemaInfo();
  console.log(`[ensureBuiltin] ds=${project.name} tables=${schema.length}`);
  const newBuiltInIds: string[] = []; // 本次新生成/首次归包的内置本体 id（自动追加进数据智能体挂载）
  for (const t of schema) {
    if (existing.has(t.name)) continue; // 已存在（含结构漂移刷新）由 generateTableOntology 的幂等逻辑兜底，避免列表期频繁写
    if (!t.columns.length) continue;
    try {
      const created = await generateTableOntology(userId, project, t as TableSchemaLite, { builtin: true, silentConflict: true });
      newBuiltInIds.push(created.id);
    } catch (e) {
      console.error(`[ensureBuiltin] per-table fail: ds=${project.name} table=${t.name}`, e);
    }
  }

  // 旧库补齐：早期生成的内置本体停在 draft（草稿对智能体不可见，等于「查不到任何本体」）。
  // 只发布「从未发布过」（published_at IS NULL）的内置本体，用户编辑后主动留草稿的（published_at 非空）不动。
  const draftBuiltin = db
    .prepare("SELECT id FROM ontology WHERE user_id = ? AND datasource_id = ? AND builtin = 1 AND status <> 'published' AND published_at IS NULL")
    .all(userId, project.id) as { id: string }[];
  if (draftBuiltin.length) {
    const now = Date.now();
    const upd = db.prepare("UPDATE ontology SET status='published', published_at=?, updated_at=? WHERE id=?");
    for (const r of draftBuiltin) upd.run(now, now, r.id);
    console.log(`[ensureBuiltin] 补齐发布 ${draftBuiltin.length} 个内置本体`);
  }

  // 存量迁移：内置本体默认归入「应用本体包」（只处理 group_id 为空的；用户手动移过包的不动）
  const ungroupedBuiltin = db
    .prepare('SELECT id FROM ontology WHERE user_id = ? AND datasource_id = ? AND builtin = 1 AND group_id IS NULL')
    .all(userId, project.id) as { id: string }[];
  if (ungroupedBuiltin.length) {
    const appGroupId = ensureAppGroup(userId);
    const upd = db.prepare('UPDATE ontology SET group_id = ? WHERE id = ?');
    for (const r of ungroupedBuiltin) upd.run(appGroupId, r.id);
    newBuiltInIds.push(...ungroupedBuiltin.map((r) => r.id));
    console.log(`[ensureBuiltin] ${ungroupedBuiltin.length} 个内置本体已归入「${APP_GROUP_NAME}」`);
  }

  // 数据查询分析助理默认挂载：首次（挂载为空）挂上「应用本体包」全部本体；
  // 之后新生成/首次归包的内置本体自动追加（不复活用户手动移除的旧本体）。
  syncDataAgentMounts(userId, newBuiltInIds);

  // 词典驱动刷新：为内置本体补/刷业务描述（表描述 + 字段描述），内容来自 ontology-docs.ts 词典。
  // 只在词典内容与库中不同才写（幂等）；用户手动改过的 description 若与词典不同不覆盖——
  // 判定方式：旧值等于「自动生成模板」或与词典旧版本一致才刷，这里以「与词典当前值不一致且旧值含『自动生成』或为词典刷新产物」为准。
  const docsChanged: string[] = [];
  for (const r of existingRows) {
    const doc = BUILTIN_TABLE_DOCS[r.code];
    if (!doc?.description) continue;
    if (r.description === doc.description) continue;
    const isTemplate = !r.description || r.description.includes('自动生成') || r.description.includes('业务口径待补充');
    if (!isTemplate && r.description) continue; // 用户手写的描述不覆盖
    db.prepare('UPDATE ontology SET description = ?, name = ?, updated_at = ? WHERE id = ?').run(
      doc.description, doc.name || r.name, Date.now(), r.id,
    );
    docsChanged.push(r.code);
    // 字段描述刷新（维度/度量/时间维度按 expr=列名 挂词典描述）
    for (const [jsonCol, role] of [['dimensions_json', 'dim'], ['measures_json', 'mea'], ['time_dimensions_json', 'time']] as const) {
      const raw = db.prepare(`SELECT ${jsonCol} AS v FROM ontology WHERE id = ?`).get(r.id) as { v: string | null } | undefined;
      if (!raw?.v) continue;
      try {
        const items = JSON.parse(raw.v) as Array<{ name: string; expr: string; description?: string }>;
        let changed = false;
        for (const it of items) {
          const col = it.expr;
          const desc = doc.fields?.[col] || COMMON_FIELD_DOCS[col];
          if (desc && it.description !== desc) { it.description = desc; changed = true; }
          void role;
        }
        if (changed) {
          db.prepare(`UPDATE ontology SET ${jsonCol} = ? WHERE id = ?`).run(JSON.stringify(items), r.id);
        }
      } catch { /* JSON 解析失败忽略 */ }
    }
  }
  if (docsChanged.length) console.log(`[ensureBuiltin] 已刷新 ${docsChanged.length} 个内置本体的业务描述: ${docsChanged.slice(0, 5).join(', ')}${docsChanged.length > 5 ? '…' : ''}`);

  // 旧库补齐：早期生成的内置本体只有 *_sum 度量，没有行计数，
  // 「有多少条/多少个」这种最常见问法没有可用度量 → 模型只能拿 SUM 凑数或退化写裸 SQL。
  const needCount = db
    .prepare('SELECT id, measures_json FROM ontology WHERE user_id = ? AND datasource_id = ? AND builtin = 1')
    .all(userId, project.id) as { id: string; measures_json: string }[];
  if (needCount.length) {
    const updCount = db.prepare('UPDATE ontology SET measures_json = ?, updated_at = ? WHERE id = ?');
    const now = Date.now();
    let n = 0;
    for (const r of needCount) {
      let ms: unknown[] = [];
      try { ms = JSON.parse(r.measures_json || '[]'); } catch { ms = []; }
      if (!Array.isArray(ms) || ms.some((m: any) => m?.name === 'row_count')) continue;
      ms.unshift({
        name: 'row_count', expr: '*', agg: 'count', additive: 'additive',
        description: '行数（记录条数）：回答「有多少/多少个/多少条」时用它',
      });
      updCount.run(JSON.stringify(ms), now, r.id);
      n++;
    }
    if (n) console.log(`[ensureBuiltin] 补齐行计数度量（row_count）${n} 个内置本体`);
  }
  return true;
}

/**
 * 数据查询分析助理默认挂载「应用本体包」本体：
 * - 挂载为空（首次）→ 挂上应用包全部本体
 * - 之后新生成/首次归包的内置本体（newIds）自动追加进挂载
 * - 不复活用户手动移除的旧本体（只追加 newIds / 首次初始化）
 */
function syncDataAgentMounts(userId: string, newIds: string[]): void {
  const DATA_AGENT_ID = 'a_builtin_data_agent';
  const agent = db
    .prepare("SELECT ontology_ids FROM agent WHERE id = ? AND user_id = 'guest'")
    .get(DATA_AGENT_ID) as { ontology_ids: string | null } | undefined;
  if (!agent) return;
  let ids: string[] = [];
  try { ids = JSON.parse(agent.ontology_ids || '[]'); } catch { ids = []; }
  if (!Array.isArray(ids)) ids = [];

  if (!ids.length) {
    // 首次初始化：挂上应用包全部本体
    const appGroup = db
      .prepare("SELECT id FROM ontology_group WHERE user_id = ? AND name = ? AND parent_id IS NULL")
      .get(userId, APP_GROUP_NAME) as { id: string } | undefined;
    if (!appGroup) return;
    ids = (db.prepare('SELECT id FROM ontology WHERE user_id = ? AND group_id = ?').all(userId, appGroup.id) as { id: string }[])
      .map((r) => r.id);
    if (!ids.length) return;
  } else {
    // 后续：仅追加本次新生成的内置本体
    const add = newIds.filter((id) => !ids.includes(id));
    if (!add.length) return;
    ids = [...ids, ...add];
  }
  db.prepare('UPDATE agent SET ontology_ids = ? WHERE id = ?').run(JSON.stringify(ids), DATA_AGENT_ID);
  console.log(`[ensureBuiltin] 数据查询分析助理已挂载 ${ids.length} 个本体`);
}

/** 列表接口用：不阻塞当前请求，生成完成后下次列表可见；项目库不可用时静默，下次列表重试 */
export function ensureBuiltinOntologies(userId: string): void {
  void generateBuiltinOntologies(userId).catch((e) => {
    console.error(`[ensureBuiltin] async body failed: user=${userId}`, e);
  });
}

/**
 * 智能体通道用（api_ontology_search / api_data_query 等）：同步等待内置本体生成完毕，
 * 否则首次取数会「看不到任何本体」，智能体只能退化成瞎写 SQL。
 */
export async function ensureBuiltinOntologiesSync(userId: string): Promise<void> {
  await generateBuiltinOntologies(userId);
}

function quoteCol(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * 从数据源的表直接生成本体（用户主动触发；项目库自动生成也走这里）。
 * - 名称/描述默认取表备注（无备注用库.表兜底）
 * - 数值列 → sum 度量、日期时间列 → 时间维度、其余列 → 维度、主键 → 主实体
 * - 同 code 已存在：builtin（自动生成）→ 用最新结构+备注刷新（保留人工补的同义词/描述见 refresh 策略）；
 *   用户自建（builtin=0）→ 报错提示，避免误覆盖
 */
export async function generateTableOntology(
  userId: string,
  ds: DataSourceRow,
  table: TableSchemaLite,
  opts?: { builtin?: boolean; silentConflict?: boolean },
): Promise<OntologyInfo> {
  const gen = buildTableOntologySpec(table, ds.name);
  const existing = db
    .prepare('SELECT * FROM ontology WHERE user_id = ? AND code = ?')
    .get(userId, gen.code) as OntologyRow | undefined;

  if (existing) {
    if (opts?.silentConflict && existing.builtin) {
      // 自动生成重放：仅当表结构漂移（列变了导致 source_sql 不同）才刷新结构字段；
      // 不动 name/description/同义词——用户改过的语义不能被列表加载踩掉
      if (existing.source_sql === gen.sourceSql) return toInfo(existing);
      db.prepare(
        `UPDATE ontology SET source_sql=?, entities_json=?, time_dimensions_json=?,
           dimensions_json=?, measures_json=?, updated_at=?
         WHERE id=? AND user_id=?`,
      ).run(
        gen.sourceSql, JSON.stringify(gen.entities), JSON.stringify(gen.timeDimensions),
        JSON.stringify(gen.dimensions), JSON.stringify(gen.measures),
        Date.now(), existing.id, userId,
      );
      return toInfo(getRow(userId, existing.id)!);
    }
    if (opts?.silentConflict) return toInfo(existing);
    throw new Error(`本体 code 已存在: ${gen.code}（${existing.builtin ? '内置本体，可直接编辑' : '可直接编辑或删除后重新生成'}）`);
  }

  const created = createOntology(userId, {
    datasourceId: ds.id,
    code: gen.code,
    name: gen.name,
    description: gen.description,
    sourceSql: gen.sourceSql,
    entities: gen.entities,
    dimensions: gen.dimensions,
    timeDimensions: gen.timeDimensions,
    measures: gen.measures,
    selections: gen.selections,
    // 项目库自动生成的内置本体默认归入「应用本体包」
    groupId: opts?.builtin ? ensureAppGroup(userId) : undefined,
    builtin: !!opts?.builtin,
  });
  // 内置（项目库自动生成）本体直接发布：结构由表元数据确定性生成、随时可取数，
  // 不发布则智能体侧「看不到任何本体」（草稿对智能体不可见）。
  // 用户后续编辑内置本体仍会回落为 draft，需重新发布——与其它本体口径一致。
  if (opts?.builtin) {
    db.prepare("UPDATE ontology SET status='published', published_at=?, updated_at=? WHERE id=? AND user_id=?").run(
      Date.now(), Date.now(), created.id, userId,
    );
    return toInfo(getRow(userId, created.id)!);
  }
  return created;
}

/** 用户从 UI 选表生成：校验表存在性后复用 generateTableOntology */
export async function generateFromTable(userId: string, datasourceId: string, tableName: string): Promise<OntologyInfo> {
  const ds = db.prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?').get(datasourceId, userId) as
    | DataSourceRow
    | undefined;
  if (!ds) throw new Error('数据源不存在');
  const schema = await getConnector(ds).schemaInfo();
  const table = schema.find((t) => t.name === tableName) || schema.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
  if (!table) throw new Error(`数据源 ${ds.name} 中找不到表「${tableName}」，请先同步结构`);
  return generateTableOntology(userId, ds, table, { builtin: false });
}

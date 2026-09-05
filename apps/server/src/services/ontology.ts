// 本体管理服务（P3.2~3.5）：
// CRUD（保存走 ontology-validator 别名校验）+ YAML 导入导出 + 编译/试跑/发布 +
// 内置项目库自动本体（每表一个，builtin=1，AI 富化在 P3.5 补描述/同义词）。
import { v4 as uuid } from 'uuid';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { db } from '../db.js';
import { getConnector, type DataSourceRow } from './connector.js';
import { validateOntology, checkSourceSqlAliases } from './ontology-validator.js';
import {
  compileOntologyQuery,
  type OntologySpec,
  type QueryIntent,
  type OntologyDimension,
  type OntologyTimeDimension,
  type OntologyMeasure,
} from './ontology-compiler.js';
import type { DialectType } from './dialect.js';

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
  relations_json: string | null;
  policies_json: string | null;
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
  relations: { left: string; right: string; cardinality: string; on: string; status?: string }[];
  policies: string[];
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
  relations?: OntologyInfo['relations'];
  policies?: string[];
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
    relations: parseJsonList<OntologyInfo['relations'][number]>(row.relations_json),
    policies: parseJsonList<string>(row.policies_json),
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

  const exprs = [
    ...(input.dimensions || []).map((d) => d.expr),
    ...(input.timeDimensions || []).map((d) => d.expr),
    ...(input.measures || []).filter((m) => m.expr && m.expr !== '*').map((m) => m.expr),
    ...(input.entities || []).map((e) => e.expr),
    ...(input.policies || []),
  ];
  const errors = validateOntology({
    sourceSql: input.sourceSql,
    selectorExprs: exprs,
    filterExprs: [],
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
          entities_json, time_dimensions_json, dimensions_json, measures_json, relations_json, policies_json,
          status, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)`,
    ).run(
      id, userId, input.datasourceId, input.code.trim(), input.name.trim(),
      input.domain?.trim() || null, input.description?.trim() || null,
      JSON.stringify(input.synonyms || []), input.sourceSql.trim(),
      JSON.stringify(input.entities || []), JSON.stringify(input.timeDimensions || []),
      JSON.stringify(input.dimensions || []), JSON.stringify(input.measures || []),
      JSON.stringify(input.relations || []), JSON.stringify(input.policies || []),
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
         time_dimensions_json=?, dimensions_json=?, measures_json=?, policies_json=?, status='draft', updated_at=?
       WHERE id=? AND user_id=?`,
    ).run(
      input.name?.trim() || row.name, input.domain?.trim() || row.domain,
      input.description?.trim() || row.description, JSON.stringify(input.synonyms || parseJsonList(row.synonyms_json)),
      JSON.stringify(input.timeDimensions || parseJsonList(row.time_dimensions_json)),
      JSON.stringify(input.dimensions || parseJsonList(row.dimensions_json)),
      JSON.stringify(input.measures || parseJsonList(row.measures_json)),
      JSON.stringify(input.policies || parseJsonList(row.policies_json)),
      Date.now(), id, userId,
    );
    return toInfo(getRow(userId, id)!);
  }
  validateSave(input);
  db.prepare(
    `UPDATE ontology SET datasource_id=?, code=?, name=?, domain=?, description=?, synonyms_json=?,
       source_sql=?, entities_json=?, time_dimensions_json=?, dimensions_json=?, measures_json=?,
       relations_json=?, policies_json=?, status='draft', updated_at=?
     WHERE id=? AND user_id=?`,
  ).run(
    input.datasourceId, input.code.trim(), input.name.trim(),
    input.domain?.trim() || null, input.description?.trim() || null,
    JSON.stringify(input.synonyms || []), input.sourceSql.trim(),
    JSON.stringify(input.entities || []), JSON.stringify(input.timeDimensions || []),
    JSON.stringify(input.dimensions || []), JSON.stringify(input.measures || []),
    JSON.stringify(input.relations || []), JSON.stringify(input.policies || []),
    Date.now(), id, userId,
  );
  return toInfo(getRow(userId, id)!);
}

export function deleteOntology(userId: string, id: string): void {
  const row = getRow(userId, id);
  if (!row) throw new Error('本体不存在');
  if (row.builtin) throw new Error('内置本体不可删除（可编辑语义后发布）');
  db.prepare('DELETE FROM ontology WHERE id = ? AND user_id = ?').run(id, userId);
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
  relations?: OntologyInfo['relations'];
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
    relations: o.relations.length ? o.relations : undefined,
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
    relations: doc.relations,
    policies: doc.policies,
  });
}

// ===== 内置项目库自动本体（P2.5.4 的轻量版：每表一个，含列结构，语义留白待富化） =====

/** 为项目库每张表生成 builtin 本体（幂等：按 code 判存在） */
export function ensureBuiltinOntologies(userId: string): void {
  const project = db
    .prepare("SELECT * FROM data_source WHERE user_id = ? AND type = 'project'")
    .get(userId) as DataSourceRow | undefined;
  if (!project) return;
  const existing = new Set(
    (db.prepare('SELECT code FROM ontology WHERE user_id = ? AND datasource_id = ?').all(userId, project.id) as {
      code: string;
    }[]).map((r) => r.code),
  );

  // 异步生成：列表接口不阻塞，生成完成后下次列表可见；项目库不可用时静默，下次列表重试
  void (async () => {
    try {
      const conn = getConnector(project);
      const schema = await conn.schemaInfo();
      const now = Date.now();
      for (const t of schema) {
        if (existing.has(t.name)) continue;
        if (!t.columns.length) continue;
        const colList = t.columns.map((c) => `  ${quoteCol(c.name)} AS ${quoteCol(c.name)}`).join(',\n');
        const sourceSql = `SELECT\n${colList}\nFROM ${quoteCol(t.name)}`;
        const aliasCheck = checkSourceSqlAliases(sourceSql);
        if (!aliasCheck.ok) continue;
        try {
          db.prepare(
            `INSERT INTO ontology
               (id, user_id, datasource_id, code, name, description, synonyms_json, source_sql,
                entities_json, time_dimensions_json, dimensions_json, measures_json, relations_json, policies_json,
                status, version, builtin, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, '[]', ?, '[]', '[]', '[]', '[]', '[]', '[]', 'draft', 1, 1, ?, ?)`,
          ).run(
            `ont_b_${uuid().slice(0, 12)}`, userId, project.id, t.name,
            t.comment || t.name,
            `项目库内置本体：${t.kind === 'view' ? '视图' : '表'} ${t.name}（${t.columns.length} 列）。业务口径待 AI 富化补充。`,
            sourceSql, now, now,
          );
        } catch {
          // code 唯一索引冲突（并发/重放）跳过
        }
      }
    } catch {
      // 项目库不可用时静默，下次列表重试
    }
  })();
}

function quoteCol(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

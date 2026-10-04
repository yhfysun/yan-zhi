// ontology-contract.ts — 本体语义层 × QueryContract 融合的**契约装配器**（P1，2026-10-03 定案）
//
// 拍板（docs/数据查询-本体语义层与QueryContract融合-方案.md）：查询以本体为语义底座
//（表/关联/字段映射由本体声明），执行走 QueryContract 受控通道。本模块是两者的**唯一接缝**：
//
//   buildOntologyContract()  → 给模型看的"菜单"：能选哪些维度/度量/过滤器/选择列（全是名字，不是 SQL）
//   runOntologyContract()    → 严格校验意图 → 编译（SQL 只出自编译器）→ 受控执行 → 列业务名映射
//
// ★ 与既有 queryOntologyByRef 的区别（为什么不是直接调它）：
//   编译器对 intent.filters 的口径是"裸 SQL 条件原样放行（试跑/高级用法）"——
//   对**人**是灵活，对**模型**是注入面。契约模式下过滤器**只准按名引用**，
//   自由 SQL 片段一律拒绝并给出可行动提示。维度/度量/选择列本就按名校验（编译器拦幻觉）。
import {
  listOntologies,
  queryOntologyByRef,
  type OntologyInfo,
} from './ontology.js';
import type { QueryIntent } from './ontology-compiler.js';

/** 给模型看的契约元数据：全是"可以从本体里选什么"，没有一个 SQL 片段 */
export interface OntologyContract {
  ontology: { id: string; code: string; name: string; description: string | null; status: string };
  datasourceId: string;
  dimensions: Array<{ name: string; description?: string }>;
  timeDimensions: Array<{ name: string; description?: string }>;
  measures: Array<{ name: string; description?: string }>;
  /** 过滤器：**只能按名引用**（intent.filters 元素 = 这里的 name）；自由 SQL 条件在契约模式下被拒 */
  filters: Array<{ name: string; description?: string }>;
  selections: Array<{ name: string; description?: string }>;
  /** 跨本体关联（供 JoinIntent 的 join 引用；不存在已声明关联的本体之间无法 JOIN） */
  relations: Array<{ source: string; type: string; target: string }>;
  /** 本体声明的查询策略（原样透出给模型，如"仅统计已生效订单"） */
  policies: string[];
  limits: { maxRows: number; timeoutMs: number };
  /** 模型可直接照做的两阶段工作流说明 */
  usage: string;
}

export interface OntologyContractResult {
  mode: 'ontology-contract';
  contract: OntologyContract;
  sql: string;
  columns: Array<{ name: string; label: string }>;
  rows: unknown[];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  datasourceId: string;
}

function brief(items: Array<{ name: string; description?: string | null }> | undefined): Array<{ name: string; description?: string }> {
  return (items || []).map((d) => ({ name: d.name, description: d.description || undefined }));
}

/** 定位**已发布**本体（契约模式硬性要求：草稿对智能体不可见——与 data-query 现有口径一致） */
function resolvePublishedOntology(userId: string, ref: string, allowed?: string[]): OntologyInfo {
  const refText = (ref || '').trim();
  if (!refText) throw new Error('本体引用（id 或 code）不能为空');
  const all = listOntologies(userId);
  const pool = (allowed && allowed.length ? all.filter((o) => allowed.includes(o.id)) : all);
  const hits = pool.filter((o) => o.id === refText || o.code === refText);
  const published = hits.filter((o) => o.status === 'published');
  const row = published[0] || hits.find((o) => o.status === 'published');
  if (!row) {
    const draft = hits.length ? '（命中了草稿态本体——契约模式只查已发布本体）' : '（先用 api_ontology_list / api_ontology_search 查可用本体）';
    throw new Error(`已发布本体不存在: ${refText} ${draft}`);
  }
  return row;
}

/** 给模型的契约"菜单" + 用法说明。与执行共用同一份解析逻辑，杜绝菜单与实现漂移。 */
export function buildOntologyContract(userId: string, ref: string, allowed?: string[], opts?: { maxRows?: number; timeoutMs?: number }): OntologyContract {
  const row = resolvePublishedOntology(userId, ref, allowed);
  const limits = { maxRows: Math.min(opts?.maxRows ?? 200, 1000), timeoutMs: opts?.timeoutMs ?? 15_000 };
  return {
    ontology: { id: row.id, code: row.code, name: row.name, description: row.description, status: row.status },
    datasourceId: row.datasourceId,
    dimensions: brief(row.dimensions as any),
    timeDimensions: brief(row.timeDimensions as any),
    measures: brief(row.measures as any),
    filters: brief(row.filters as any),
    selections: brief(row.selections as any),
    relations: (row.relations || []).map((r) => ({ source: r.source, type: r.type, target: r.target })),
    policies: row.policies || [],
    limits,
    usage: [
      `两阶段取数：① 用本契约了解可选字段（dimensions/measures/filters/selections 的 name）；`,
      `② 调 api_data_query（contract=true，ontology="${row.code}"），intent 里**只填上面列出的 name**。`,
      `filters 只能按名引用（如 filters: ["近30天"]），自由 SQL 条件会被拒绝；`,
      `measures 可带聚合（sum/count/count_distinct/avg/min/max）；orderBy 的 name 同样取自上面。`,
    ].join('\n'),
  };
}

/**
 * 严格意图校验：契约模式下 intent.filters **只准按名引用**。
 * 编译器对裸 SQL 条件放行（人用的灵活性），这里在模型链路上关掉它。
 */
export function validateStrictIntent(info: OntologyInfo, intent: QueryIntent): void {
  const named = new Set((info.filters || []).map((f) => f.name));
  const bad: string[] = [];
  for (const f of intent.filters || []) {
    const name = String(f).replace(/^@/, '').trim();
    if (!named.has(name)) bad.push(String(f));
  }
  if (bad.length) {
    throw new Error(
      '契约模式下 filters 只能按名引用本体声明的过滤器，以下不是已声明的过滤器名: '
      + bad.join(', ')
      + '。可用过滤器: ' + [...named].join(', ') + '。'
      + '如需新的过滤条件，请先在本体里声明过滤器（或换用已声明的等价过滤器）。',
    );
  }
}

/** 从编译产物的 selectItems 里取列别名，并映射回本体声明的业务名（看板列不暴露物理字段） */
function columnsOf(info: OntologyInfo, selectItems: string[]): Array<{ name: string; label: string }> {
  const labelByName = new Map<string, string>();
  for (const group of [info.dimensions, info.timeDimensions, info.measures, info.selections] as Array<Array<{ name: string; description?: string | null } | undefined>>) {
    for (const d of group || []) {
      if (d?.name && d.description) labelByName.set(d.name, d.description);
    }
  }
  return (selectItems || [])
    .map((item) => {
      const m = item.match(/AS\s+"?([^"\s)]+)"?\s*$/i);
      const name = m ? m[1] : item.trim();
      return { name, label: labelByName.get(name) || name };
    });
}

/**
 * 契约模式执行：严格校验 → 编译（SQL 只出自编译器）→ 受控执行 → 业务名列映射。
 * 内部复用 queryOntologyByRef（同一编译/执行通道），本模块只加"契约"这层约束与产出。
 */
export async function runOntologyContract(
  userId: string,
  input: { ontology: string; intent?: QueryIntent; allowed?: string[]; limit?: number },
): Promise<OntologyContractResult> {
  const row = resolvePublishedOntology(userId, input.ontology, input.allowed);
  const intent: QueryIntent = { ...(input.intent || {}) };
  if (!intent.limit && input.limit) intent.limit = input.limit;
  validateStrictIntent(row, intent);

  const maxRows = Math.min(Math.max(Math.floor(input.limit ?? 200), 1), 1000);
  const r = await queryOntologyByRef(userId, row.id, intent, maxRows);
  return {
    mode: 'ontology-contract',
    contract: buildOntologyContract(userId, row.id),
    sql: r.sql,
    columns: columnsOf(row, (r as unknown as { selectItems?: string[] }).selectItems || parseSelectItems(r.sql)),
    rows: (r as { rows?: unknown[] }).rows || [],
    rowCount: Number((r as { rowCount?: number }).rowCount ?? (r as { rows?: unknown[] }).rows?.length ?? 0),
    truncated: Boolean((r as { truncated?: boolean }).truncated),
    warnings: r.warnings || [],
    datasourceId: r.datasourceId,
  };
}

/** 从编译 SQL 提取 SELECT 列别名（queryOntologyByRef 未透出 selectItems 时的兜底解析） */
function parseSelectItems(sql: string): string[] {
  const m = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s/i);
  if (!m) return [];
  return m[1]
    .split(/,(?![^(]*\))/)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

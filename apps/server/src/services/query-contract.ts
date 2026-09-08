// 数据查询契约执行服务（data-query-contract，Q1）：
// 三端 chat「动态看板/明细浏览」的后端收敛点——纯参数化执行，不走大模型、不经本体语义层。
//
// 分工（已与用户对齐）：
//   - 初始 SQL/脚本 = 大模型一次性生成（本服务只消费它产出的「base 源」）
//   - 过滤 / 分页 / 排序 = 后端在本服务里确定性拼接 + 驱动参数绑定，此后不再调 LLM
//
// 安全立场：
//   - base 源先过只读护栏（sql-guard），只放行单条 SELECT/WITH 读
//   - 过滤列名 / 排序列名只允许「白名单 = base 实际输出列别名」，拒绝对列名的任意字符串拼接
//   - 过滤值一律走占位符参数绑定（sqlite/mysql `?`、pg `$n`），绝不字符串拼值
//   - 行数由尾部显式 LIMIT + 结果集截断双保险
import { db } from '../db.js';
import { getConnector, type DataSourceRow, type RunParam } from './connector.js';
import { guardSqlConsole } from './sql-guard.js';
import { quoteIdent, type DialectType } from './dialect.js';
import { ensureProjectDataSource } from './datasource.js';

const MAX_PAGE_SIZE = 200;
const MAX_TIMEOUT_MS = 30_000;

interface Loaded {
  row: DataSourceRow;
  placeholders: '?' | 'pg'; // postgres 用 $n，其余用 ?
}

function loadDs(userId: string, dataSourceId?: string): Loaded {
  const dsId = (dataSourceId || '').trim() || `ds_project_${userId}`;
  // 幂等确保内置项目库存在
  if (dsId.startsWith('ds_project_')) ensureProjectDataSource(userId);
  const row = db
    .prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?')
    .get(dsId, userId) as DataSourceRow | undefined;
  if (!row) throw new Error(`数据源不存在: ${dsId}`);
  if (row.type === 'dm' || row.type === 'oracle') {
    throw new Error(`${row.type} 暂不支持参数化明细浏览（Q1 覆盖 project/sqlite/mysql/postgres）`);
  }
  return { row, placeholders: row.type === 'postgres' ? 'pg' : '?' };
}

export type FilterOp =
  | 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'in' | 'notIn' | 'like';

export interface FilterDef {
  col: string;
  op?: FilterOp;         // 缺省 eq
  value?: unknown;
}

export interface QueryContractReq {
  dataSourceId?: string;
  /** 物理表/视图名 */
  table?: string;
  /** 大模型产出的初始只读 SQL（table 与 base 二选一） */
  base?: string;
  filters?: FilterDef[];
  sort?: { col: string; dir?: 'asc' | 'desc' }[];
  page?: number;          // 1 起
  pageSize?: number;
  /** 前端动态生成过滤器需要的候选值：对这些列做顶 N 采样（上限 SAMPLE_CAP）。 */
  sampleFilters?: string[];
}

export interface ContractRunResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  total: number;           // 命中总数（用于分页器；取不到用 -1 由前端隐藏）
  truncated: boolean;
  page: number;
  pageSize: number;
  latencyMs: number;
  sql: string;             // 最终执行 SQL（审计用）
  /** 请求了 sampleFilters 时才返回：按列的控制类型 + 低基数候选 */
  filterSamples?: FilterSample[];
}

// ===== 参数化 SQL 编译 =====
// 统一用一个游标计数器 + 分段文字，输出 { parts[], values[] }；再针对 ?/pg 生成文本。

const OP_TABLE: Record<FilterOp, string> = {
  eq: '=', ne: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=', like: 'LIKE', in: 'IN', notIn: 'NOT IN',
};

/** 单值 / 多值统一转 RunParam 数组 */
function toParams(v: unknown): RunParam[] {
  return (Array.isArray(v) ? v : [v]).map(norm);
}

function norm(v: unknown): RunParam {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (s === '') return null;
  return s;
}

/**
 * 组装一次性翻页查询：
 *   SELECT * FROM ( <base> ) __qc
 *     [WHERE a = ?, b IN (?, ?)]
 *     [ORDER BY c DESC]
 *     LIMIT ? OFFSET ?
 *
 * 说明：
 *  - base 由大模型产出，保持原样作为派生表源；过滤/排序只作用在 __qc 输出列的别名外层，
 *    不侵入 base 内部字符串，避免对产成文本做不可控改写。
 *  - 所有“值”走占位符；占位符编号用 params 长度顺序递增；in/notIn 多值展开为多个槽位。
 *  - COUNT 用同一 parms（剔分页尾两个），保证命中数与主查询过滤一致。
 */
async function compileAndRun(
  loaded: Loaded,
  srcSql: string,
  cols: Set<string> | null,
  filters: FilterDef[],
  sort: QueryContractReq['sort'],
  page: number,
  pageSize: number,
): Promise<ContractRunResult> {
  const values: RunParam[] = [];

  const whereSegs: { sql: string; vals: RunParam[] }[] = [];
  for (const f of filters || []) {
    const low = String(f.col || '').toLowerCase();
    if (!cols) throw new Error('无法探测该数据源的输出列，禁用列过滤/排序；请先接入带 schema 的数据源');
    if (!cols.has(low)) {
      throw new Error(`过滤列「${f.col}」不在 base 输出列内，已拒绝（可用: ${[...cols].slice(0, 30).join(', ')}）`);
    }
    const op: FilterOp = f.op || 'eq';
    const opWord = OP_TABLE[op];
    if (!opWord) throw new Error(`不支持的过滤操作符: ${op}`);
    const params = toParams(f.value);
    if (params.length === 0) throw new Error(`过滤器「${f.col}」值不能为空`);
    const ident = quoteIdent(dialectOf(loaded), f.col);
    const fromValIdx = values.length;
    let segment: string;
    if (op === 'in' || op === 'notIn') {
      segment = `${ident} ${opWord} (${Array.from({ length: params.length }, (_, k) =>
        ph(loaded.placeholders, fromValIdx + k)).join(', ')})`;
    } else {
      segment = `${ident} ${opWord} ${ph(loaded.placeholders, fromValIdx)}`;
    }
    whereSegs.push({ sql: segment, vals: params });
    values.push(...params);
  }

  // 排序（同样白名单 + 方向白名单）
  const orderSegs: string[] = [];
  for (const s of sort || []) {
    const low = String(s.col || '').toLowerCase();
    if (!cols || !cols.has(low)) {
      throw new Error(`排序列「${s.col}」不在 base 输出列内，已拒绝（过滤/排序需可探测输出列）`);
    }
    const dir = String(s.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    orderSegs.push(`${quoteIdent(dialectOf(loaded), s.col)} ${dir}`);
  }
  const whereSql = whereSegs.length ? `WHERE ${whereSegs.map((w) => w.sql).join(' AND ')}` : '';
  const orderSql = orderSegs.length ? `ORDER BY ${orderSegs.join(', ')}` : '';

  // 分页（尾部两参）
  const limitPh = ph(loaded.placeholders, values.length);
  const offsetPh = ph(loaded.placeholders, values.length + 1);
  const sql = [
    `SELECT * FROM (${srcSql}) __qc`,
    whereSql,
    orderSql,
    `LIMIT ${limitPh} OFFSET ${offsetPh}`,
  ].filter(Boolean).join(' ');
  values.push(pageSize, (page - 1) * pageSize);

  const start = Date.now();
  const r = await getConnector(loaded.row).queryParam(sql, values, {
    maxRows: pageSize,
    timeoutMs: MAX_TIMEOUT_MS,
  });

  // 命中总数：同一批 where 参数（含 in 展开），不含分页两参数
  const countVals = values.slice(0, values.length - 2);
  const total = await countRows(loaded, srcSql, whereSql, countVals);

  const outColumns = r.columns?.length ? r.columns : (r.rows?.[0] ? Object.keys(r.rows[0]) : []);
  return {
    columns: outColumns,
    rows: r.rows,
    rowCount: r.rows.length,
    total,
    truncated: r.truncated,
    page,
    pageSize,
    latencyMs: Date.now() - start,
    sql,
  };
}

function ph(style: '?' | 'pg', idx: number): string {
  return style === 'pg' ? `$${idx + 1}` : '?';
}

function dialectOf(loaded: Loaded): DialectType {
  return (loaded.row.type === 'project' ? 'sqlite' : loaded.row.type) as DialectType;
}

/** 命中总数（复用 where 文字与值）；失败返回 -1 */
async function countRows(
  loaded: Loaded,
  srcSql: string,
  whereSql: string,
  countVals: RunParam[],
): Promise<number> {
  const sql = `SELECT COUNT(*) AS _c FROM (${srcSql}) __qc${whereSql ? ` ${whereSql}` : ''}`;
  try {
    const r = await getConnector(loaded.row).queryParam(sql, countVals, { maxRows: 1, timeoutMs: MAX_TIMEOUT_MS });
    const first = r.rows[0] as Record<string, unknown> | undefined;
    return first ? Number(first._c) : 0;
  } catch {
    return -1;
  }
}

/** 探测 base 输出列白名单：`SELECT * FROM (<base>) __qc WHERE 1=0` 只取 schema 不取数据 */
async function probeColumns(loaded: Loaded, srcSql: string): Promise<Set<string> | null> {
  try {
    const q = `SELECT * FROM (${srcSql}) __qc WHERE 1=0`;
    const r = await getConnector(loaded.row).query(q, { maxRows: 0, timeoutMs: MAX_TIMEOUT_MS });
    const s = new Set<string>();
    for (const c of (r.columns || [])) s.add(String(c).toLowerCase());
    if (s.size === 0) return null;
    return s;
  } catch {
    return null;
  }
}

/** Q1 明细浏览主入口 */
export async function runContractQuery(userId: string, req: QueryContractReq): Promise<ContractRunResult> {
  const pageSize = Math.min(Math.max(Math.trunc(Number(req.pageSize) || 50), 1), MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(Number(req.page) || 1), 1);

  const loaded = loadDs(userId, req.dataSourceId);
  const { srcSql, cols } = await resolveSource(loaded, req);

  const result = await compileAndRun(
    loaded, srcSql, cols, req.filters || [], req.sort || [], page, pageSize,
  );

  // 一次请求顺便带回「要展示为动态过滤器的列」候选画像，前端据此渲染控件类型 + 下拉选项
  if (req.sampleFilters?.length) {
    const samples = await sampleColumns(loaded, srcSql, cols, req.sampleFilters);
    return { ...result, filterSamples: samples };
  }
  return result;
}

export type AggAgg = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface AggregateReq {
  dataSourceId?: string;
  table?: string;
  base?: string;
  filters?: FilterDef[];
  sort?: { col: string; dir?: 'asc' | 'desc' }[];
  /** 分组列（白名单内） */
  dim: string;
  /** 度量列 + 聚合；xName/label 可选展示名 */
  measureCol: string;
  agg?: AggAgg;
  /** 结果数上限（默认与 cap 对齐），null 展示用 */
  measureName?: string;
  limit?: number;
}

export interface AggregatePoint {
  key: string;
  value: number;
}

/**
 * Q2 视图(折线/柱/饼)取数：同一 base 同一过滤，做 GROUP BY 分组聚合系列。
 * 与明细走同一套：列白名单 + 过滤值参数绑定。
 */
export async function runAggregate(userId: string, req: AggregateReq): Promise<{
  points: AggregatePoint[];
  dim: string; agg: AggAgg; measure: string; total: number; sql: string;
}> {
  const loaded = loadDs(userId, req.dataSourceId);
  const { srcSql, cols } = await resolveSource(loaded, req);

  // 校验列白名单
  if (!cols || !cols.has(String(req.dim).toLowerCase())) {
    throw new Error(`分组列「${req.dim}」不在输出列内或无法探测 schema，已拒绝`);
  }
  if (!cols.has(String(req.measureCol).toLowerCase())) {
    throw new Error(`度量列「${req.measureCol}」不在输出列内，已拒绝`);
  }
  const agg = (String(req.agg || 'count').toLowerCase() || 'count') as AggAgg;
  if (!['count', 'sum', 'avg', 'min', 'max'].includes(agg)) throw new Error(`不支持聚合: ${agg}`);

  const dIdent = quoteIdent(dialectOf(loaded), req.dim);
  const mIdent = quoteIdent(dialectOf(loaded), req.measureCol);
  const limit = Math.min(Math.max(Math.trunc(Number(req.limit) || 200), 1), 500);

  // 编译过滤（与 run 同一套占位游标）
  const { whereSql, vals } = buildWhere(loaded, cols, req.filters || []);

  const aggExpr = agg === 'count' ? 'COUNT(*)' : `${agg.toUpperCase()}(${mIdent})`;
  const sql = [
    `SELECT ${dIdent} AS __k, ${aggExpr} AS __m`,
    `FROM (${srcSql}) __qc`,
    whereSql || '',
    `GROUP BY ${dIdent}`,
    `ORDER BY __m DESC`,
    `LIMIT ${limit}`,
  ].filter(Boolean).join(' ');

  const r = await getConnector(loaded.row).queryParam(sql, vals, { maxRows: limit, timeoutMs: MAX_TIMEOUT_MS });
  const points: AggregatePoint[] = (r.rows || []).map((row) => {
    const rr = row as Record<string, unknown>;
    return { key: rr.__k == null ? '(空)' : String(rr.__k), value: Number(rr.__m) || 0 };
  });
  const total = points.reduce((s, p) => s + p.value, 0);
  return { points, dim: req.dim, agg, measure: req.measureCol, total, sql };
}

/**
 * 编译过滤器 → WHERE 段 + 按 ?/$n 顺序绑定的参数数组。
 * 与 compileAndRun 内的构建保持一致（同一游标），供明细/聚合/总数三路复用，避免占位错位。
 */
function buildWhere(
  loaded: Loaded,
  cols: Set<string>,
  filters: FilterDef[],
): { whereSql: string; vals: RunParam[] } {
  const vals: RunParam[] = [];
  const segs: string[] = [];
  for (const f of filters || []) {
    const low = String(f.col || '').toLowerCase();
    if (!cols.has(low)) throw new Error(`过滤列「${f.col}」不在 base 输出列内，已拒绝`);
    const op: FilterOp = f.op || 'eq';
    const opWord = OP_TABLE[op];
    if (!opWord) throw new Error(`不支持的过滤操作符: ${op}`);
    const ps = toParams(f.value);
    if (!ps.length) throw new Error(`过滤器「${f.col}」值不能为空`);
    const ident = quoteIdent(dialectOf(loaded), f.col);
    const idx = vals.length;
    const parts = ps.map((_, k) => ph(loaded.placeholders, idx + k)).join(', ');
    segs.push(op === 'in' || op === 'notIn'
      ? `${ident} ${opWord} (${parts})`
      : `${ident} ${opWord} ${ph(loaded.placeholders, idx)}`);
    vals.push(...ps);
  }
  return { whereSql: segs.length ? `WHERE ${segs.join(' AND ')}` : '', vals };
}

/** 解析数据源内 base 输出列白名单（table/base 共用） */
async function resolveSource(
  loaded: Loaded,
  req: { table?: string; base?: string },
): Promise<{ srcSql: string; cols: Set<string> | null }> {
  let srcSql: string;
  if (req.table?.trim()) {
    const t = req.table.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_$.]*$/.test(t)) throw new Error(`表名非法: ${t}`);
    const q = (dialectOf(loaded) === 'mysql' ? '`' : '"') + t.replace(/[`"]/g, '') + (dialectOf(loaded) === 'mysql' ? '`' : '"');
    srcSql = `SELECT * FROM ${q}`;
  } else if (req.base?.trim()) {
    const guard = guardSqlConsole(req.base, false);
    if (guard.blocked.length) throw new Error(`base 被只读护栏拦截: ${guard.blocked[0]?.reason || '仅允许只读'}`);
    if (guard.statements.length !== 1) throw new Error('base 只能是单条只读 SQL');
    srcSql = guard.statements[0].text;
  } else {
    throw new Error('缺少源：请传 table（表名）或 base（只读 SQL）其一');
  }
  const cols = await probeColumns(loaded, srcSql);
  return { srcSql, cols };
}

const SAMPLE_CAP = 50;

export interface FilterSample {
  col: string;
  kind: 'text' | 'number' | 'bool' | 'date';
  /** 低基数列给的候选值（≤ SAMPLE_CAP） */
  values?: Array<{ label: string; raw: unknown }>;
  /** values 为空时提示该列停用下拉，改用文本/区间输入 */
  controllable: boolean;
}

/** 采样：对给定列 DISTINCT —— kind 粗判 + 低基数给候选（值经 SQL 值绑定，不拼接） */
async function sampleColumns(
  loaded: Loaded,
  srcSql: string,
  cols: Set<string> | null,
  filterCols: string[],
): Promise<FilterSample[]> {
  const out: FilterSample[] = [];
  const dialect = dialectOf(loaded);
  for (const name of filterCols) {
    const rawName = String(name || '');
    if (!cols?.has(rawName.toLowerCase())) {
      throw new Error(`候选列「${rawName}」不在 base 输出列内，已拒绝`);
    }
    const ident = quoteIdent(dialect, rawName);
    // 复用探列的一条样例行做类型粗判：非 values 空即候选
    const kind = await guessKind(loaded, srcSql, ident, rawName);
    const q = `SELECT DISTINCT ${ident} AS __v FROM (${srcSql}) __qc ORDER BY __v LIMIT ${SAMPLE_CAP}`;
    try {
      const r = await getConnector(loaded.row).query(q, { maxRows: SAMPLE_CAP, timeoutMs: MAX_TIMEOUT_MS });
      const vals = (r.rows || [])
        .filter((row) => row && row.__v !== null && row.__v !== undefined)
        .map((row) => ({ label: String(row.__v), raw: row.__v }));
      out.push({ col: rawName, kind, controllable: vals.length > 0, values: vals.length ? vals : undefined });
    } catch {
      out.push({ col: rawName, kind, controllable: false });
    }
  }
  return out;
}

/** 用采样到的首个非空值粗判类型：能当数值用即 number，raw 为 0/1 可 bool，含 yyyy- 视为 date，否则 text */
async function guessKind(loaded: Loaded, srcSql: string, ident: string, name: string): Promise<'text' | 'number' | 'bool' | 'date'> {
  try {
    const q = `SELECT ${ident} AS __v FROM (${srcSql}) __qc WHERE ${ident} IS NOT NULL LIMIT 5`;
    const r = await getConnector(loaded.row).query(q, { maxRows: 5, timeoutMs: MAX_TIMEOUT_MS });
    for (const row of r.rows || []) {
      const raw = (row as Record<string, unknown>).__v;
      if (typeof raw === 'number') return Number.isInteger(raw) && (raw === 0 || raw === 1) ? 'bool' : 'number';
      if (typeof raw === 'string') {
        if (/^\d{4}-\d{2}/.test(raw)) return 'date';
        if (raw !== '' && !Number.isNaN(Number(raw))) return 'number';
        if (raw === '0' || raw === '1' || raw === 'true' || raw === 'false') return 'bool';
        return 'text';
      }
      if (typeof raw === 'boolean') return 'bool';
    }
    // 列名启发式兜底（name 已过白名单，作 fallback 展示）
    if (/(type|status|state|flag|_at|date|time)/i.test(name)) {
      return /(_at|date|time)|\bat\b/i.test(name) ? 'date' : 'text';
    }
    return name.toLowerCase().includes('amount') || name.toLowerCase().includes('count') || name.toLowerCase().includes('price') ? 'number' : 'text';
  } catch {
    return 'text';
  }
}

// 确定性画像采集（P2.5.1）：表行数 + 逐列空值率/基数/极值/高频样本值。
//
// ★ 为什么先做确定性画像：AI 富化（P3.5）需要"事实底座" —— 低基数列才值得做枚举，
//   高基数列给样本值没有意义。先用 SQL 把事实采出来，模型只负责命名与解释，不负责猜数。
// ★ 只读：全部是 SELECT；表名/列名必须来自 schemaInfo（不接受任意标识符），再按方言 quote。
// ★ 容错：单列查询失败（类型不支持 MIN/MAX、权限不足等）只跳过该列字段，不拖垮整表画像。
import { quoteIdent, type DialectType } from './dialect.js';

export interface ColumnProfile {
  column: string;
  type: string;
  /** 总行数 / 非空行数 / 空值数 / 空值率（0~1） */
  total: number;
  nonNull: number;
  nullCount: number;
  nullRate: number;
  /** 去重值个数（基数）；查询失败时缺省 */
  distinctCount?: number;
  /** 数值/日期列的极值（以字符串返回，避免大整数精度问题） */
  min?: string;
  max?: string;
  /** 数值列均值（非数值列由数据库返回 NULL） */
  avg?: string;
  /** 高频样本值（最多 5 个，单值截断 120 字符） */
  samples: string[];
}

export interface TableProfile {
  table: string;
  rowCount: number;
  columns: ColumnProfile[];
  /** 画像过程中的非致命错误（列级跳过原因） */
  warnings: string[];
}

export interface ProfileColumnInput {
  name: string;
  type: string;
}

export interface ProfileRunner {
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
}

const MAX_COLUMNS = 80;
const SAMPLE_LIMIT = 5;
const MAX_SAMPLE_LEN = 120;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 统计 SQL：一次拿到总行/非空/基数/极值（部分方言对 text 求 MIN/MAX 也可用） */
export function buildStatsSql(dialect: DialectType, table: string, column: string): string {
  const t = quoteIdent(dialect, table);
  const c = quoteIdent(dialect, column);
  return `SELECT COUNT(*) AS total, COUNT(${c}) AS nonnull, COUNT(DISTINCT ${c}) AS dist, MIN(${c}) AS mn, MAX(${c}) AS mx, AVG(${c}) AS av FROM ${t}`;
}

/** 高频样本 SQL：按出现次数降序取前 N 个非空值 */
export function buildSamplesSql(dialect: DialectType, table: string, column: string, limit = SAMPLE_LIMIT): string {
  const t = quoteIdent(dialect, table);
  const c = quoteIdent(dialect, column);
  return `SELECT ${c} AS v, COUNT(*) AS n FROM ${t} WHERE ${c} IS NOT NULL GROUP BY ${c} ORDER BY n DESC LIMIT ${Math.max(1, Math.min(limit, 20))}`;
}

function sampleText(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return s.length > MAX_SAMPLE_LEN ? `${s.slice(0, MAX_SAMPLE_LEN)}…` : s;
}

function extremeText(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}

/**
 * 纯执行器版本（便于单测）：runner 只负责跑 SQL，本函数负责拼 SQL、容错与整形。
 */
export async function profileTableWith(
  runner: ProfileRunner,
  dialect: DialectType,
  table: string,
  columns: ProfileColumnInput[],
): Promise<TableProfile> {
  const warnings: string[] = [];
  const cols = columns.filter((c) => c && c.name).slice(0, MAX_COLUMNS);
  if (columns.length > MAX_COLUMNS) warnings.push(`列数超过 ${MAX_COLUMNS}，只画像前 ${MAX_COLUMNS} 列`);
  if (!cols.length) throw new Error(`表 ${table} 没有可用列`);

  // 行数直接取第一列的统计行（COUNT(*) 与列无关，省一次查询）
  let rowCount = 0;
  const out: ColumnProfile[] = [];
  for (const col of cols) {
    let stats: Record<string, unknown> | undefined;
    try {
      const r = await runner.query(buildStatsSql(dialect, table, col.name));
      stats = r.rows[0] || {};
    } catch (e) {
      warnings.push(`列 ${col.name} 统计失败：${(e as Error).message}`);
    }
    if (stats) rowCount = Math.max(rowCount, num(stats.total));

    let samples: string[] = [];
    try {
      const r = await runner.query(buildSamplesSql(dialect, table, col.name));
      samples = r.rows.map((x) => sampleText(x.v)).filter((s) => s !== '');
    } catch (e) {
      warnings.push(`列 ${col.name} 样本失败：${(e as Error).message}`);
    }

    const total = num(stats?.total);
    const nonNull = num(stats?.nonnull);
    out.push({
      column: col.name,
      type: col.type || '',
      total,
      nonNull,
      nullCount: Math.max(0, total - nonNull),
      nullRate: total ? Math.max(0, Math.min(1, (total - nonNull) / total)) : 0,
      distinctCount: stats && stats.dist !== undefined ? num(stats.dist) : undefined,
      min: extremeText(stats?.mn),
      max: extremeText(stats?.mx),
      avg: extremeText(stats?.av),
      samples,
    });
  }
  return { table, rowCount, columns: out, warnings };
}

/** 只接受来自 schemaInfo 的表与列 —— 调用方先做存在性校验，再交给本函数拼 SQL。 */
export function isLikelyNumericType(type: string): boolean {
  return /int|decimal|numeric|float|double|real|money|number/i.test(type || '');
}

export function isLikelyTimeType(type: string): boolean {
  return /date|time|year/i.test(type || '');
}

/** 低基数列（候选枚举）：去重值 ≤ 30 且非空行占比 > 0 */
export function isLowCardinality(p: ColumnProfile, maxDistinct = 30): boolean {
  return p.distinctCount !== undefined && p.distinctCount > 0 && p.distinctCount <= maxDistinct && p.nonNull > 0;
}

/**
 * 把画像里的高频样本值挂到同名维度上（只挂低基数列，高基数列的样本值没有业务意义）。
 * 返回新数组，不修改入参（生成本体时用）。
 */
export function withSampleValues<T extends { name: string; sampleValues?: string[] }>(
  dimensions: T[],
  profile: TableProfile,
  maxDistinct = 30,
): T[] {
  const byColumn = new Map(profile.columns.map((c) => [c.column, c]));
  return dimensions.map((d) => {
    const p = byColumn.get(d.name);
    if (!p || !p.samples.length || !isLowCardinality(p, maxDistinct)) return d;
    return { ...d, sampleValues: p.samples.slice(0, SAMPLE_LIMIT) };
  });
}

/**
 * 数据源 + 表名 → 画像（唯一对外入口）。
 * 表与列都取自 connector.schemaInfo()，用户传的表名只做匹配，不直接拼进 SQL。
 */
export async function profileTable(userId: string, datasourceId: string, tableName: string): Promise<TableProfile> {
  const { db } = await import('../db.js');
  const { getConnector } = await import('./connector.js');
  const ds = db.prepare('SELECT * FROM data_source WHERE id = ? AND user_id = ?').get(datasourceId, userId) as any;
  if (!ds) throw new Error('数据源不存在');
  const connector = getConnector(ds);
  const schema = await connector.schemaInfo();
  const wanted = String(tableName || '').trim().toLowerCase();
  const table = schema.find((t) => t.name.toLowerCase() === wanted);
  if (!table) throw new Error(`表 ${tableName} 不存在（先同步数据源 schema）`);
  const dialect = (ds.type === 'project' ? 'sqlite' : String(ds.type)) as DialectType;
  const runner: ProfileRunner = {
    query: async (sql: string) => {
      const r = await connector.query(sql, { maxRows: 200, timeoutMs: 20000 });
      return { rows: r.rows };
    },
  };
  return profileTableWith(runner, dialect, table.name, table.columns.map((c) => ({ name: c.name, type: c.type })));
}

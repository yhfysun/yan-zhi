// SQL 方言适配层（H3）：
// 覆盖「标识符引号 / 时间粒度截断 / 分页(offset+keyset) / TOP-N / 随机采样」五类语法差异，
// 按 mysql | postgres | dm | oracle | sqlite 分派；其余语法统一走 ANSI 通用。
// 消费方：SQL 控制台（只读护栏）、本体翻译引擎（P4）、schema 富化采样流水线。

export type DialectType = 'mysql' | 'postgres' | 'dm' | 'oracle' | 'sqlite';

export type TimeGrain = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute';

const DIALECTS: readonly DialectType[] = ['mysql', 'postgres', 'dm', 'oracle', 'sqlite'];

export function isDialect(type: string): type is DialectType {
  return (DIALECTS as readonly string[]).includes(type);
}

function assertDialect(type: string): asserts type is DialectType {
  if (!isDialect(type)) {
    throw new Error(`不支持的方言类型: ${type}，可选 ${DIALECTS.join('|')}`);
  }
}

/** 标识符引号：MySQL 反引号，其余双引号。转义内部同款引号。 */
export function quoteIdent(type: DialectType, ident: string): string {
  assertDialect(type);
  const q = type === 'mysql' ? '`' : '"';
  return q + ident.replaceAll(q, q + q) + q;
}

/** 时间粒度截断/格式化：返回用于 GROUP BY 的时间桶表达式。 */
export function dateTrunc(type: DialectType, expr: string, grain: TimeGrain): string {
  assertDialect(type);
  switch (type) {
    case 'mysql':
      return mysqlDateTrunc(expr, grain);
    case 'postgres':
      return `date_trunc('${grain}', ${expr})`;
    case 'sqlite':
      return sqliteDateTrunc(expr, grain);
    case 'oracle':
    case 'dm':
      return oracleDateTrunc(expr, grain);
  }
}

function mysqlDateTrunc(expr: string, grain: TimeGrain): string {
  switch (grain) {
    case 'year':
      return `DATE_FORMAT(${expr}, '%Y')`;
    case 'quarter':
      return `CONCAT(YEAR(${expr}), '-Q', QUARTER(${expr}))`;
    case 'month':
      return `DATE_FORMAT(${expr}, '%Y-%m')`;
    case 'week':
      return `DATE_FORMAT(${expr}, '%x-W%v')`;
    case 'day':
      return `DATE_FORMAT(${expr}, '%Y-%m-%d')`;
    case 'hour':
      return `DATE_FORMAT(${expr}, '%Y-%m-%d %H:00:00')`;
    case 'minute':
      return `DATE_FORMAT(${expr}, '%Y-%m-%d %H:%i:00')`;
  }
}

function sqliteDateTrunc(expr: string, grain: TimeGrain): string {
  switch (grain) {
    case 'year':
      return `strftime('%Y', ${expr})`;
    case 'quarter':
      return `(strftime('%Y', ${expr}) || '-Q' || ((CAST(strftime('%m', ${expr}) AS INTEGER) + 2) / 3))`;
    case 'month':
      return `strftime('%Y-%m', ${expr})`;
    case 'week':
      return `strftime('%Y-W%W', ${expr})`;
    case 'day':
      return `strftime('%Y-%m-%d', ${expr})`;
    case 'hour':
      return `strftime('%Y-%m-%d %H', ${expr})`;
    case 'minute':
      return `strftime('%Y-%m-%d %H:%M', ${expr})`;
  }
}

function oracleDateTrunc(expr: string, grain: TimeGrain): string {
  switch (grain) {
    case 'year':
      return `TO_CHAR(${expr}, 'YYYY')`;
    case 'quarter':
      return `TO_CHAR(${expr}, 'YYYY') || '-Q' || TO_CHAR(${expr}, 'Q')`;
    case 'month':
      return `TO_CHAR(${expr}, 'YYYY-MM')`;
    case 'week':
      return `TO_CHAR(${expr}, 'IYYY-"W"IW')`;
    case 'day':
      return `TO_CHAR(${expr}, 'YYYY-MM-DD')`;
    case 'hour':
      return `TO_CHAR(${expr}, 'YYYY-MM-DD HH24')`;
    case 'minute':
      return `TO_CHAR(${expr}, 'YYYY-MM-DD HH24:MI')`;
  }
}

/** TOP-N 限制：Oracle/DM 用 FETCH FIRST（12c+ / DM8+），其余用 LIMIT。 */
export function limitTop(type: DialectType, n: number): string {
  assertDialect(type);
  if (type === 'oracle' || type === 'dm') {
    return `FETCH FIRST ${n} ROWS ONLY`;
  }
  return `LIMIT ${n}`;
}

/** 分页（offset）：Oracle/DM 用 OFFSET..FETCH，其余用 LIMIT..OFFSET。 */
export function paginate(type: DialectType, input: { offset?: number; limit?: number }): string {
  assertDialect(type);
  const limit = input.limit ?? 1000;
  const offset = input.offset ?? 0;
  if (type === 'oracle' || type === 'dm') {
    return offset > 0 ? `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY` : `FETCH FIRST ${limit} ROWS ONLY`;
  }
  return offset > 0 ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`;
}

/**
 * keyset 翻页条件（M8：翻页必须有唯一键兜底排序，避免重复/漏行）。
 * 返回 WHERE 谓词片段；ORDER BY 列由调用方负责（须与 columns 一致）。
 * 多列行值比较：MySQL/PG/SQLite 用元组比较；Oracle/DM 展开为 a>v OR (a=v AND b>v)。
 */
export function keysetCondition(
  type: DialectType,
  columns: string[],
  values: unknown[],
  direction: 'asc' | 'desc' = 'asc',
): string {
  assertDialect(type);
  if (!columns.length || columns.length !== values.length) {
    throw new Error('keyset 列数与值数不一致');
  }
  const cmp = direction === 'desc' ? '<' : '>';
  const idents = columns.map((c) => quoteIdent(type, c));
  const lits = values.map((v) => sqlLiteral(v));

  if (columns.length === 1) {
    return `${idents[0]} ${cmp} ${lits[0]}`;
  }

  if (type === 'oracle' || type === 'dm') {
    // 展开：(a > v1) OR (a = v1 AND b > v2) OR ...
    const parts: string[] = [];
    for (let i = 0; i < columns.length; i++) {
      const eq = idents.slice(0, i).map((c, j) => `${c} = ${lits[j]}`);
      const last = `${idents[i]} ${cmp} ${lits[i]}`;
      parts.push(eq.length ? `(${eq.join(' AND ')} AND ${last})` : last);
    }
    return parts.join(' OR ');
  }

  return `(${idents.join(', ')}) ${cmp} (${lits.join(', ')})`;
}

/** 随机采样 N 行（结果顺序随机，仅作样本展示 / 枚举候选，不保证均匀）。 */
export function sampleRows(type: DialectType, sql: string, n: number): string {
  assertDialect(type);
  switch (type) {
    case 'mysql':
      return `SELECT * FROM (${sql}) AS _sample ORDER BY RAND() LIMIT ${n}`;
    case 'postgres':
    case 'sqlite':
      return `SELECT * FROM (${sql}) AS _sample ORDER BY RANDOM() LIMIT ${n}`;
    case 'dm':
      return `SELECT * FROM (SELECT * FROM (${sql}) _sample ORDER BY RAND()) WHERE ROWNUM <= ${n}`;
    case 'oracle':
      return `SELECT * FROM (SELECT * FROM (${sql}) _sample ORDER BY DBMS_RANDOM.VALUE) WHERE ROWNUM <= ${n}`;
  }
}

/** 值转 SQL 字面量：null → NULL，number/boolean → 原样，其余 → 单引号字符串。 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

// SQL 文本工具：语句切分（保留位置区间）。
// 两端共用：server sql-guard 按语句逐条执行/校验，前端控制台定位「光标所在语句」。
// 限制：不解析 PG dollar-quoting 与 BEGIN...END 存储过程体（控制台场景为短查询，够用）。

export interface SqlStatement {
  /** 原文中该语句的起始偏移（含前导空白） */
  start: number;
  /** 原文中该语句的结束偏移（不含分号） */
  end: number;
  /** 语句文本（trim 后） */
  text: string;
}

/**
 * 按顶层分号切分 SQL 文本为语句列表。
 * 跳过：单引号/双引号/反引号字符串、`--` 行注释、C 风格块注释、括号内分号。
 * 空语句（纯注释/空白）不产出。
 */
export function splitSqlStatements(sql: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let stmtStart = 0;
  let i = 0;
  let lastSignificant = -1; // 当前语句最后一个非空白字符位置

  const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\r' || c === '\n';

  while (i < sql.length) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote && quote !== '`') i += 2; // SQL 双写转义；反引号无此约定
          else {
            i++;
            break;
          }
        } else i++;
      }
      lastSignificant = i - 1;
      continue;
    }
    if (ch === '(') {
      // 括号内分号不切分（极少见但防御）
      let depth = 1;
      i++;
      while (i < sql.length && depth > 0) {
        const c2 = sql[i];
        const t2 = sql.slice(i, i + 2);
        if (t2 === '--') {
          while (i < sql.length && sql[i] !== '\n') i++;
          continue;
        }
        if (t2 === '/*') {
          const e = sql.indexOf('*/', i + 2);
          i = e === -1 ? sql.length : e + 2;
          continue;
        }
        if (c2 === "'" || c2 === '"' || c2 === '`') {
          const q = c2;
          i++;
          while (i < sql.length) {
            if (sql[i] === q) {
              if (sql[i + 1] === q && q !== '`') i += 2;
              else {
                i++;
                break;
              }
            } else i++;
          }
          continue;
        }
        if (c2 === '(') depth++;
        else if (c2 === ')') depth--;
        i++;
      }
      lastSignificant = Math.min(i - 1, sql.length - 1);
      continue;
    }
    if (ch === ';') {
      if (lastSignificant >= stmtStart) {
        const text = sql.slice(stmtStart, lastSignificant + 1).trim();
        if (text) out.push({ start: stmtStart, end: lastSignificant + 1, text });
      }
      i++;
      stmtStart = i;
      lastSignificant = -1;
      continue;
    }
    if (!isSpace(ch)) lastSignificant = i;
    i++;
  }

  if (lastSignificant >= stmtStart) {
    const text = sql.slice(stmtStart, lastSignificant + 1).trim();
    if (text) out.push({ start: stmtStart, end: lastSignificant + 1, text });
  }
  return out;
}

/** 光标所在语句：返回包含 offset 的语句；offset 在语句间隙时返回下一条；超出末尾返回最后一条 */
export function statementAt(sql: string, offset: number): SqlStatement | null {
  const list = splitSqlStatements(sql);
  if (!list.length) return null;
  for (const s of list) {
    if (offset >= s.start && offset <= s.end) return s;
    if (offset < s.start) return s;
  }
  return list[list.length - 1];
}

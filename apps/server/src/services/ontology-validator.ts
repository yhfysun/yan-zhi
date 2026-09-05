// 本体保存校验器（P0.2，修复 addendum H2 别名 Bug）：
// source_sql 输出列必须显式 AS 别名（子查询输出列名不可预测，Oracle 还会大写化），
// 选择器/过滤器 expr 只允许引用别名集合内的标识符。保存时校验，不通过拒绝落库。
// 纯函数、零依赖，可独立单测。

export interface AliasCheckError {
  code: 'EMPTY_SELECT' | 'BARE_STAR' | 'ALIAS_REQUIRED' | 'UNKNOWN_IDENTIFIER' | 'UNBALANCED' | 'EMPTY_EXPR';
  message: string;
  location?: string;
}

export interface AliasCheckOk {
  ok: true;
  aliases: string[];
}

export interface AliasCheckFail {
  ok: false;
  aliases: string[];
  errors: AliasCheckError[];
}

export type AliasCheckResult = AliasCheckOk | AliasCheckFail;

const IDENT_RE = /^[A-Za-z_][\w$]*$/;

/** 去注释（-- 与块注释）、字符串 / 引号字面量处理：保留结构 + identifier token
 *  - 单引号块 ('…') → 字面量，内容吞掉（避免字符串内的伪 identifier 干扰 expr 引用识别）
 *  - 双引号块 ("…") → PG / SQLite 标识符别名（如 `"id" AS "id"`），原内容保留
 *  - 反引号块 (`…`) → MySQL 标识符别名，原内容保留
 *  处理完的 stripped 仍保留 token 边界（每段前后空格分隔），下游 splitTopLevelAs /
 *  implicit-alias 提取能把 AS 后的别名正确识别。 */
function stripLiterals(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ' ';
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            out += ' ';
            i += 2;
            continue;
          }
          i++;
          out += ' ';
          break;
        }
        // 字面量内容：单引号吞空；双引号 / 反引号 identifier 原样保留
        out += quote === "'" ? ' ' : /[A-Za-z0-9_$.]/.test(sql[i]) ? sql[i] : ' ';
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** 括号深度归零后按顶层逗号切分 SELECT 列表 */
function splitTopLevel(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of expr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** 提取输出列别名；无别名返回 null（调用方报 ALIAS_REQUIRED） */
function extractAlias(colExpr: string): { alias: string | null; expr: string } {
  const trimmed = colExpr.trim();
  // 星号：必须报错（BARE_STAR / ALIAS_REQUIRED 按形态区分）
  if (/^\*$/.test(trimmed) || /^\w+\.\*$/.test(trimmed)) {
    return { alias: null, expr: trimmed };
  }
  // 显式 AS（顶层，不在括号内）：取 AS 后最后一个合法标识符
  const topLevel = splitTopLevelAs(trimmed);
  if (topLevel) {
    const alias = topLevel.alias;
    if (IDENT_RE.test(alias)) return { alias, expr: topLevel.expr };
  }
  // 隐式别名 `expr alias`（无 AS）：仅当结尾是裸标识符且前段是完整表达式
  const implicit = trimmed.match(/([\w$]+)\s*$/);
  if (implicit) {
    // 前段必须是完整表达式而非列点号链：`t.col` 结尾的 col 是列名不是别名 → 判为缺别名
    const head = trimmed.slice(0, implicit.index).trim();
    if (head && !head.endsWith('.')) {
      const alias = implicit[1];
      if (IDENT_RE.test(alias) && !isReserved(alias.toUpperCase())) {
        return { alias, expr: head };
      }
    }
  }
  return { alias: null, expr: trimmed };
}

/** 定位顶层（括号深度 0）的 AS 关键字并取其后别名 */
function splitTopLevelAs(expr: string): { alias: string; expr: string } | null {
  // 只匹配顶层结尾的 `AS alias`：若 AS alias 被包在括号里（如 CAST(x AS INT)），
  // 结尾是 ')' 不满足 \s*$，天然不会误配。
  const m = expr.match(/\s+AS\s+([A-Za-z_][\w$]*)\s*$/i);
  if (!m) return null;
  return { alias: m[1], expr: expr.slice(0, m.index).trim() };
}

const RESERVED = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT',
  'INNER', 'OUTER', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IN', 'IS', 'LIKE', 'BETWEEN', 'EXISTS', 'DISTINCT',
]);

function isReserved(word: string): boolean {
  return RESERVED.has(word);
}

/**
 * 校验 source_sql 输出列别名。返回别名集合（含成功与失败场景，供第二步复用）。
 * 规则：
 *  - 空列表 / 裸星号 / 无别名表达式 → 报错（别名是选择器引用的唯一稳定锚点）
 *  - 别名重复 → 报错
 */
export function checkSourceSqlAliases(sourceSql: string): AliasCheckResult {
  const stripped = stripLiterals(sourceSql);
  const errors: AliasCheckError[] = [];

  // 截取最外层 SELECT ... FROM 之间的列清单
  const selectMatch = stripped.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM\b/i);
  if (!selectMatch) {
    return {
      ok: false,
      aliases: [],
      errors: [{ code: 'EMPTY_SELECT', message: 'source_sql 必须是 SELECT ... FROM 形式的查询' }],
    };
  }
  const selectList = selectMatch[1];
  // DISTINCT/GROUP 后接列清单：剥掉开头修饰词
  const list = selectList.replace(/^\s*(DISTINCT|ALL|TOP\s+\d+)\s+/i, '');
  const cols = splitTopLevel(list);
  if (!cols.length) {
    return { ok: false, aliases: [], errors: [{ code: 'EMPTY_SELECT', message: 'SELECT 列表为空' }] };
  }

  const aliases: string[] = [];
  const seen = new Set<string>();
  for (let idx = 0; idx < cols.length; idx++) {
    const col = cols[idx];
    const { alias, expr } = extractAlias(col);
    const loc = `输出列 #${idx + 1}: ${expr.slice(0, 40)}${expr.length > 40 ? '…' : ''}`;
    if (!alias) {
      if (/^\*$/.test(expr) || /^\w+\.\*$/.test(expr)) {
        errors.push({ code: 'BARE_STAR', message: '不允许 SELECT *，输出列必须逐列显式声明', location: loc });
      } else {
        errors.push({
          code: 'ALIAS_REQUIRED',
          message: '输出列必须显式 AS 别名（子查询输出列名不可预测，选择器只能引用别名）',
          location: loc,
        });
      }
      continue;
    }
    if (seen.has(alias.toLowerCase())) {
      errors.push({ code: 'ALIAS_REQUIRED', message: `别名重复: ${alias}`, location: loc });
      continue;
    }
    seen.add(alias.toLowerCase());
    aliases.push(alias);
  }

  if (errors.length) return { ok: false, aliases, errors };
  return { ok: true, aliases };
}

/**
 * 校验选择器/过滤器 expr：其中引用的裸标识符（列引用）必须全部落在别名集合内。
 * 字符串字面量 / 数字 / 函数名不在校验范围；括号不平衡报 UNBALANCED。
 */
export function checkExprReferences(
  expr: string,
  aliases: string[],
  label = '表达式',
): AliasCheckError[] {
  const errors: AliasCheckError[] = [];
  const stripped = stripLiterals(expr);
  let depth = 0;
  for (const ch of stripped) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth < 0) {
      errors.push({ code: 'UNBALANCED', message: `${label}括号不平衡` });
      return errors;
    }
  }
  if (depth !== 0) {
    errors.push({ code: 'UNBALANCED', message: `${label}括号不平衡` });
    return errors;
  }
  if (!stripped.trim()) {
    errors.push({ code: 'EMPTY_EXPR', message: `${label}为空` });
    return errors;
  }
  const aliasSet = new Set(aliases.map((a) => a.toLowerCase()));
  // 带位置分词：标识符后紧跟 '(' 视为函数名，不参与列引用校验
  const tokens = [...stripped.matchAll(/[A-Za-z_][\w$]*/g)];
  for (const m of tokens) {
    const tok = m[0];
    const after = stripped.slice(m.index! + tok.length);
    if (/^\s*\(/.test(after)) continue; // 函数名
    if (isReserved(tok.toUpperCase())) continue; // 关键字
    if (!aliasSet.has(tok.toLowerCase())) {
      errors.push({
        code: 'UNKNOWN_IDENTIFIER',
        message: `${label}引用了未定义的标识符「${tok}」，只能引用 source_sql 输出列别名（${aliases.join(', ')}）`,
      });
    }
  }
  return errors;
}

/** 保存时一站式校验：source_sql 别名 + 选择器/过滤器 expr 引用 */
export function validateOntology(input: {
  sourceSql: string;
  selectorExprs?: string[];
  filterExprs?: string[];
}): AliasCheckResult {
  const aliasResult = checkSourceSqlAliases(input.sourceSql);
  if (aliasResult.ok && !input.selectorExprs?.length && !input.filterExprs?.length) {
    return aliasResult;
  }
  const { aliases } = aliasResult;
  const errors = aliasResult.ok ? [] : [...aliasResult.errors];
  for (const expr of input.selectorExprs || []) {
    errors.push(...checkExprReferences(expr, aliases, '选择器'));
  }
  for (const expr of input.filterExprs || []) {
    errors.push(...checkExprReferences(expr, aliases, '过滤器'));
  }
  if (errors.length) return { ok: false, aliases, errors };
  return { ok: true, aliases };
}

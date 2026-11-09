// SQL 控制台护栏（P2.1）：只读校验 + 语句切分 + 写操作开关检查。
// 纵深防御的一层：sqlite/project 由连接器 readonly 连接兜底，PG 由会话 default_transaction_read_only 兜底，
// MySQL 无会话级只读，靠账号权限建议 + 本层文本校验。DDL 无论开关一律拒绝（P2.3 数据编辑也不放行 DDL）。
import { splitSqlStatements, type SqlStatement } from '@yan-zhi/shared';

export type SqlAction = 'read' | 'write' | 'ddl' | 'admin';

export interface GuardIssue {
  index: number; // 语句序号（0 起）
  text: string;
  reason: string;
}

export interface GuardResult {
  statements: SqlStatement[];
  reads: SqlStatement[];
  /** 被拦下的语句（原因在 reason） */
  blocked: GuardIssue[];
  /** 只要含非 read 且 writeAllowed=false，或含 ddl/admin → 整体拒绝 */
  ok: boolean;
}

const READ_HEADS = new Set(['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'DESC', 'DESCRIBE', 'PRAGMA', 'VALUES', 'TABLE']);

const DDL_WORDS = new Set([
  'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME', 'COMMENT', 'GRANT', 'REVOKE',
  'ATTACH', 'DETACH', 'VACUUM', 'REINDEX', 'ANALYZE',
]);

const WRITE_WORDS = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'MERGE', 'UPSERT', 'LOAD', 'CALL', 'EXEC', 'EXECUTE']);

const ADMIN_WORDS = new Set(['SET', 'USE', 'LOCK', 'UNLOCK', 'KILL', 'SHUTDOWN', 'RESET', 'LISTEN', 'NOTIFY', 'PREPARE', 'DEALLOCATE']);

/** 去注释与字符串字面量，保留单词边界，供关键字判断 */
function stripForScan(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
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
      const q = ch;
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
      out += ' ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function headWord(stripped: string): string {
  const m = stripped.match(/\s*([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : '';
}

/**
 * WITH ... INSERT/UPDATE/DELETE 检测：CTE 定界的右括号后接的动作词是否为写。
 * 简化实现：从首个顶级 '(' 起做括号配平，取配平后的第一个词。
 */
function tailActionWord(stripped: string): string {
  const start = stripped.indexOf('(');
  if (start === -1) return headWord(stripped);
  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '(') depth++;
    else if (stripped[i] === ')') {
      depth--;
      if (depth === 0) {
        const rest = stripped.slice(i + 1);
        // CTE 之间是逗号继续下一个定义；否则是主查询动作
        const m = rest.match(/\s*([A-Za-z]+)/);
        return m ? m[1].toUpperCase() : '';
      }
    }
  }
  return '';
}

function classify(text: string): { action: SqlAction; reason?: string } {
  const stripped = stripForScan(text);
  const head = headWord(stripped);
  if (!head) return { action: 'read' };
  if (head === 'WITH') {
    const tail = tailActionWord(stripped);
    if (WRITE_WORDS.has(tail)) return { action: 'write', reason: `WITH ... ${tail} 属于写操作` };
    if (DDL_WORDS.has(tail)) return { action: 'ddl', reason: `WITH ... ${tail} 属于 DDL，一律拒绝` };
    return { action: 'read' };
  }
  if (READ_HEADS.has(head)) {
    // MySQL SELECT ... INTO OUTFILE/DUMPFILE 会在服务端写文件（需要 FILE 权限），按写操作拦截
    if (/\bINTO\s+(OUTFILE|DUMPFILE)\b/i.test(stripped)) {
      return { action: 'write', reason: 'SELECT ... INTO OUTFILE/DUMPFILE 属于服务端文件写入，拒绝' };
    }
    // EXPLAIN ANALYZE 会真实执行（PG 语义），后面跟写语句按写拦截
    if (/^EXPLAIN\b/i.test(text)) {
      const rest = stripped.replace(/^\s*EXPLAIN(\s+(ANALYZE|VERBOSE|FORMAT\s+\w+|COSTS\s+\w+|SETTINGS))+\s*/i, ' ');
      const inner = headWord(rest.trim());
      if (WRITE_WORDS.has(inner)) return { action: 'write', reason: 'EXPLAIN ANALYZE 会真实执行写语句，按写操作拦截' };
    }
    return { action: 'read' };
  }
  if (DDL_WORDS.has(head)) return { action: 'ddl', reason: `${head} 属于 DDL，控制台一律拒绝` };
  if (WRITE_WORDS.has(head)) return { action: 'write' };
  if (ADMIN_WORDS.has(head)) return { action: 'admin', reason: `${head} 属于会话/管理语句，控制台不支持` };
  return { action: 'admin', reason: `无法识别的语句类型「${head}」，按最保守策略拒绝` };
}

function hasTopLevelKeyword(stripped: string, keyword: string): boolean {
  let depth = 0;
  for (let i = 0; i < stripped.length;) {
    const ch = stripped[i];
    if (ch === '(') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (depth !== 0 || !/[A-Za-z_]/.test(ch)) {
      i++;
      continue;
    }
    const prev = i > 0 ? stripped[i - 1] : '';
    if (/[A-Za-z0-9_]/.test(prev)) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < stripped.length && /[A-Za-z0-9_]/.test(stripped[end])) end++;
    if (stripped.slice(i, end).toUpperCase() === keyword) return true;
    i = end;
  }
  return false;
}

/** 与 stripForScan 同语义，但输出与输入**等长**（注释/字符串内容逐字符换成空格，引号保留）——用于原文切片定位与 ? 计数 */
function stripKeepLength(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      while (i < stop) { out += ' '; i++; }
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      out += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === q) {
          if (sql[i + 1] === q && q !== '`') { out += '  '; i += 2; continue; }
          out += ch;
          i++;
          break;
        }
        out += ' ';
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** stripped 中第一个顶层（depth=0）关键字的原文区间；找不到返回 null */
function locateTopLevelKeyword(stripped: string, keyword: string): { start: number; end: number } | null {
  let depth = 0;
  for (let i = 0; i < stripped.length;) {
    const ch = stripped[i];
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); i++; continue; }
    if (depth !== 0 || !/[A-Za-z_]/.test(ch)) { i++; continue; }
    const prev = i > 0 ? stripped[i - 1] : '';
    if (/[A-Za-z0-9_]/.test(prev)) { i++; continue; }
    let end = i + 1;
    while (end < stripped.length && /[A-Za-z0-9_]/.test(stripped[end])) end++;
    if (stripped.slice(i, end).toUpperCase() === keyword) return { start: i, end };
    i = end;
  }
  return null;
}

export type SnapshotPlan =
  | { kind: 'insert' }
  | { kind: 'select'; sql: string; params: unknown[]; paramOffset: number }
  | { kind: 'unavailable'; reason: string };

/**
 * 数据编辑「变更前快照」计划（2.3b）：由原 DML 构造同 WHERE 的 SELECT，参数沿用。
 * - DELETE：头部 `DELETE` → `SELECT *`，其余（alias/WHERE/ORDER/LIMIT）原样，参数序列不变
 * - UPDATE：只支持单表（无顶层 JOIN/FROM/逗号多表）——取表名构 `SELECT * FROM t WHERE ...`，
 *   参数从 WHERE 段起取（SET 段参数数按等长 strip 计数）
 * - INSERT：变更前无行，kind='insert'
 * - 解析不出安全形态时返回 unavailable（快照缺失，不阻塞预检）
 * 纯函数：不触碰数据库，单测直接钉行为。
 */
export function buildSnapshotQuery(statement: string, params: unknown[]): SnapshotPlan {
  const stripped = stripKeepLength(statement);
  const head = headWord(stripped);
  if (head === 'INSERT') return { kind: 'insert' };
  if (head !== 'UPDATE' && head !== 'DELETE') {
    return { kind: 'unavailable', reason: `仅支持 UPDATE/DELETE 快照（收到 ${head || '空'}）` };
  }
  const where = locateTopLevelKeyword(stripped, 'WHERE');
  if (!where) return { kind: 'unavailable', reason: '无顶层 WHERE（护栏本应拒绝）' };

  if (head === 'DELETE') {
    // `DELETE FROM <t> ...` → `SELECT * FROM <t> ...`：只替换 DELETE 一词，其余原样。
    // 多表删除形态（`DELETE t FROM t JOIN ...`）FROM 不紧跟 DELETE 头 → unavailable
    const headEnd = locateTopLevelKeyword(stripped, 'DELETE');
    if (!headEnd) return { kind: 'unavailable', reason: '无法定位 DELETE 头' };
    if (!/^\s*FROM\b/i.test(stripped.slice(headEnd.end))) {
      return { kind: 'unavailable', reason: 'DELETE 多表形态暂不支持快照' };
    }
    const sql = `SELECT *${statement.slice(headEnd.end)}`;
    return { kind: 'select', sql, params, paramOffset: 0 };
  }

  // UPDATE：只支持单表 —— 表名段（head..SET）含逗号或 JOIN，或 SET..WHERE 间有顶层 FROM/JOIN（PG 更新）都算多表
  const setLoc = locateTopLevelKeyword(stripped, 'SET');
  if (!setLoc) return { kind: 'unavailable', reason: '无法定位 SET 段' };
  const tableSeg = stripped.slice(head.length, setLoc.start).trim();
  if (!tableSeg || /,/.test(tableSeg) || /\b(JOIN|FROM)\b/i.test(tableSeg)) {
    return { kind: 'unavailable', reason: 'UPDATE 多表/表名无法解析' };
  }
  const setSeg = stripped.slice(setLoc.end, where.start);
  if (/\b(FROM|JOIN)\b/i.test(setSeg)) return { kind: 'unavailable', reason: 'UPDATE 多表形态暂不支持快照' };
  // SET 段参数占 params 前缀；WHERE 段参数从 offset 起
  const paramOffset = (stripped.slice(0, where.start).match(/\?/g) || []).length;
  const sql = `SELECT * FROM ${statement.slice(head.length, setLoc.start).trim()} ${statement.slice(where.start)}`;
  return { kind: 'select', sql, params: params.slice(paramOffset), paramOffset };
}

export interface DataEditGuardResult {
  ok: boolean;
  action: 'insert' | 'update' | 'delete' | null;
  statement: string | null;
  reason?: string;
}

/**
 * 数据编辑通道的 SQL 白名单。控制台仍保持只读；只有这里放行单条
 * INSERT/UPDATE/DELETE，并要求 UPDATE/DELETE 带顶层 WHERE，避免误改全表。
 */
export function guardDataEditSql(sql: string): DataEditGuardResult {
  const statements = splitSqlStatements(sql);
  if (statements.length !== 1) {
    return {
      ok: false,
      action: null,
      statement: null,
      reason: statements.length === 0 ? '没有可编辑的 SQL 语句' : '数据编辑只允许单条语句',
    };
  }

  const statement = statements[0].text;
  const stripped = stripForScan(statement);
  const head = headWord(stripped);
  if (head === 'WITH') {
    return { ok: false, action: null, statement, reason: '数据编辑暂不支持 WITH/CTE，请改写为单条 DML' };
  }
  if (head !== 'INSERT' && head !== 'UPDATE' && head !== 'DELETE') {
    return {
      ok: false,
      action: null,
      statement,
      reason: '数据编辑只允许 INSERT / UPDATE / DELETE；查询请走 SQL 控制台，DDL 一律拒绝',
    };
  }
  if ((head === 'UPDATE' || head === 'DELETE') && !hasTopLevelKeyword(stripped, 'WHERE')) {
    return {
      ok: false,
      action: null,
      statement,
      reason: `${head} 必须包含顶层 WHERE，禁止无过滤条件修改或删除整表`,
    };
  }

  return {
    ok: true,
    action: head.toLowerCase() as 'insert' | 'update' | 'delete',
    statement,
  };
}

/**
 * 控制台执行前校验。
 * @param sql 原始文本（可含多语句）
 * @param writeAllowed 数据源是否允许写（data_source.allow_write）
 */
export function guardSqlConsole(sql: string, writeAllowed: boolean): GuardResult {
  const statements = splitSqlStatements(sql);
  const reads: SqlStatement[] = [];
  const blocked: GuardIssue[] = [];

  statements.forEach((s, index) => {
    const { action, reason } = classify(s.text);
    if (action === 'read') {
      reads.push(s);
      return;
    }
    if (action === 'ddl') {
      blocked.push({ index, text: s.text, reason: reason || 'DDL 一律拒绝' });
      return;
    }
    if (action === 'admin') {
      blocked.push({ index, text: s.text, reason: reason || '管理/会话语句不支持' });
      return;
    }
    // write
    if (!writeAllowed) {
      blocked.push({
        index,
        text: s.text,
        reason:
          reason ||
          '该数据源未开启写操作（在数据源管理中开启「允许写操作」后重试；DDL 仍会被拒绝）',
      });
      return;
    }
    blocked.push({
      index,
      text: s.text,
      reason:
        reason ||
        '写语句请走「数据编辑」通道（预检影响行数 → 二次确认 → 事务 + 审计），控制台不放行',
    });
  });

  return { statements, reads, blocked, ok: blocked.length === 0 };
}

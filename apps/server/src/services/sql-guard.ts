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

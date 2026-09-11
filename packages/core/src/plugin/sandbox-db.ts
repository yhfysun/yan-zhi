// 插件 DB 沙箱：声明 db 权限的插件仅可操作 plugin_<插件id>__ 前缀的私有表。
// 系统表（conversation/message/agent/plugin 等）增删改查 + DDL 一律拒绝；
// 硬禁多语句、PRAGMA、ATTACH/DETACH、VACUUM、事务控制、sqlite_ 系统表、schema 限定名。
import type { DatabaseAdapter } from '../platform/types';

export class SandboxDbError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SandboxDbError';
  }
}

/** 插件私有表前缀：plugin_<sanitized-id>__（id 中非字母数字统一替换为 _，__ 分隔符防前缀混淆） */
export function pluginTablePrefix(pluginId: string): string {
  if (!pluginId || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(pluginId)) {
    throw new SandboxDbError(`非法插件 id: ${JSON.stringify(pluginId)}`);
  }
  return `plugin_${pluginId.toLowerCase().replace(/[^a-z0-9]/g, '_')}__`;
}

/**
 * 归一化 SQL：去注释、字符串字面量替换为 ''、引号标识符还原为裸名。
 * 归一化后的文本中不存在字符串内容与注释，关键字/表名提取不再被字面量欺骗；
 * 引号标识符内容若非简单标识符（含 . ; 空格等）直接拒绝。
 */
function normalizeSql(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    // 行注释
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // 块注释
    if (c === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      if (i >= n) throw new SandboxDbError('SQL 注释未闭合');
      i += 2;
      out += ' ';
      continue;
    }
    // 字符串字面量（'' 转义）
    if (c === "'") {
      out += "''";
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; closed = true; break; }
        i++;
      }
      if (!closed) throw new SandboxDbError('SQL 字符串未闭合');
      continue;
    }
    // 引号标识符 "..." / `...` / [...]
    if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      i++;
      let name = '';
      let closed = false;
      while (i < n) {
        if (c === '"' && sql[i] === '"' && sql[i + 1] === '"') { name += '""'; i += 2; continue; }
        if (sql[i] === close) { i++; closed = true; break; }
        name += sql[i];
        i++;
      }
      if (!closed) throw new SandboxDbError('SQL 标识符引号未闭合');
      if (!/^[A-Za-z_]\w*$/.test(name)) {
        throw new SandboxDbError(`不支持的标识符: ${JSON.stringify(name)}（插件 DB 沙箱仅允许简单标识符，禁止 schema 限定名）`);
      }
      out += name;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 语句类型白名单（首关键字） */
const STMT_START_RE = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH|VALUES)\b/i;

/** 硬禁关键字：PRAGMA/ATTACH 等元操作与事务控制（触发器体含 BEGIN，故 CREATE TRIGGER 一并被拒，属预期保守行为） */
const FORBIDDEN_RE = /\b(PRAGMA|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

/** CTE 名：ident [ (col,...) ] AS ( —— AS 后紧跟 ( 是 CTE 的强特征，普通列别名不会出现该形态 */
function collectCteNames(clean: string): Set<string> {
  const names = new Set<string>();
  const re = /\bWITH\b|\b([A-Za-z_]\w*)\s*(?:\([^()]*\))?\s+AS\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    if (m[0] === 'WITH' || m[0] === 'with') continue; // WITH 关键字本身
    if (m[1]) names.add(m[1].toLowerCase());
  }
  return names;
}

/** 提取表/索引引用： introducer 关键字后的标识符 + 逗号列表 + CREATE INDEX ... ON + DROP INDEX + RENAME TO */
function extractTableRefs(clean: string): string[] {
  const refs: string[] = [];
  let m: RegExpExecArray | null;
  const re1 = /\b(FROM|JOIN|INTO|UPDATE|TABLE|VIEW|TRIGGER)\b\s+(IF\s+(NOT\s+)?EXISTS\s+)?([A-Za-z_]\w*)/gi;
  while ((m = re1.exec(clean))) {
    refs.push(m[4]);
    // 本表的可选别名（AS x 或裸别名 x），仅用于逗号列表定位，不做校验
    let rest = clean.slice(re1.lastIndex).replace(/^\s+(?:AS\s+)?[A-Za-z_]\w*/i, '');
    // 逗号列表：, 后的标识符是下一张表（可带别名）
    let cm: RegExpExecArray | null;
    while ((cm = /^\s*,\s*([A-Za-z_]\w*)/.exec(rest))) {
      refs.push(cm[1]);
      rest = rest.slice(cm[0].length).replace(/^\s+(?:AS\s+)?[A-Za-z_]\w*/i, '');
    }
  }
  const reIdx = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+([A-Za-z_]\w*)\s+ON\s+([A-Za-z_]\w*)/gi;
  while ((m = reIdx.exec(clean))) { refs.push(m[1], m[2]); }
  const reDropIdx = /\bDROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?([A-Za-z_]\w*)/gi;
  while ((m = reDropIdx.exec(clean))) refs.push(m[1]);
  const reRename = /\bRENAME\s+TO\s+([A-Za-z_]\w*)/gi;
  while ((m = reRename.exec(clean))) refs.push(m[1]);
  return refs;
}

/** 校验一条 SQL：通过则放行，否则抛 SandboxDbError */
export function assertSqlAllowed(sql: string, pluginId: string): void {
  if (!sql || !sql.trim()) throw new SandboxDbError('SQL 为空');
  const clean = normalizeSql(sql);
  const noTrailing = clean.trim().replace(/;\s*$/, '');
  if (noTrailing.includes(';')) throw new SandboxDbError('禁止多语句执行');
  if (!STMT_START_RE.test(noTrailing)) {
    throw new SandboxDbError(`不支持的 SQL 语句类型（仅允许 SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/WITH/VALUES）`);
  }
  if (FORBIDDEN_RE.test(noTrailing)) {
    throw new SandboxDbError('禁止 PRAGMA/ATTACH/DETACH/VACUUM/REINDEX/ANALYZE/事务控制等语句');
  }
  const prefix = pluginTablePrefix(pluginId);
  const ownRe = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[A-Za-z_]\\w*$`, 'i');
  const cteNames = collectCteNames(noTrailing);
  for (const ref of extractTableRefs(noTrailing)) {
    const name = ref.toLowerCase();
    if (cteNames.has(name)) continue; // CTE 局部名
    if (name.startsWith('sqlite_')) throw new SandboxDbError(`禁止访问系统表: ${ref}`);
    if (!ownRe.test(ref)) {
      throw new SandboxDbError(`表 ${ref} 不属于插件 ${pluginId}（仅允许操作 ${prefix}* 前缀的私有表）`);
    }
  }
}

/** 构造插件专属 DB 视图：exec/query 全量过沙箱校验，其余行为与宿主一致 */
export function createSandboxedDb(db: DatabaseAdapter, pluginId: string): DatabaseAdapter {
  return {
    async exec(sql: string, params?: unknown[]) {
      assertSqlAllowed(sql, pluginId);
      return db.exec(sql, params);
    },
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      assertSqlAllowed(sql, pluginId);
      return db.query<T>(sql, params);
    },
    // 事务体内语句仍经 exec/query 跑沙箱校验；此处仅透传事务边界
    transaction: <T>(fn: () => Promise<T>): Promise<T> => db.transaction(fn),
  };
}

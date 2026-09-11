import { describe, it, expect } from 'vitest';
import { assertSqlAllowed, createSandboxedDb, pluginTablePrefix, SandboxDbError } from './sandbox-db';

const PID = 'ops-shell';
const T = 'plugin_ops_shell__conn'; // ops-shell 的私有表

describe('pluginTablePrefix', () => {
  it('连字符 id 归一化为下划线', () => {
    expect(pluginTablePrefix('ops-shell')).toBe('plugin_ops_shell__');
    expect(pluginTablePrefix('git-explorer')).toBe('plugin_git_explorer__');
  });

  it('非法 id 直接拒绝', () => {
    expect(() => pluginTablePrefix('')).toThrow(SandboxDbError);
    expect(() => pluginTablePrefix('1abc')).toThrow(SandboxDbError);
    expect(() => pluginTablePrefix('a b')).toThrow(SandboxDbError);
  });
});

describe('assertSqlAllowed 私有表 CRUD 放行', () => {
  const ok = (sql: string) => expect(() => assertSqlAllowed(sql, PID)).not.toThrow();

  it('CREATE TABLE / INSERT / UPDATE / DELETE / SELECT', () => {
    ok(`CREATE TABLE IF NOT EXISTS ${T} (id TEXT PRIMARY KEY, host TEXT)`);
    ok(`INSERT INTO ${T} (id, host) VALUES (?, ?)`);
    ok(`INSERT OR REPLACE INTO ${T} (id) VALUES (?)`);
    ok(`UPDATE ${T} SET host = ? WHERE id = ?`);
    ok(`DELETE FROM ${T} WHERE id = ?`);
    ok(`SELECT id, host FROM ${T} WHERE id = ?`);
  });

  it('JOIN / 逗号多表 / 别名 / 子查询', () => {
    ok(`SELECT a.id FROM ${T} AS a JOIN ${T} b ON a.id = b.id`);
    ok(`SELECT id FROM ${T} a, ${T} b WHERE a.id = b.id`);
    ok(`SELECT * FROM (SELECT id FROM ${T} WHERE host = ?) LIMIT 1`);
    ok(`SELECT COUNT(*) AS total FROM ${T}`);
  });

  it('CTE（含 RECURSIVE、列清单、同名遮蔽）', () => {
    ok(`WITH recent AS (SELECT id FROM ${T} WHERE host = ?) SELECT * FROM recent`);
    ok(`WITH RECURSIVE cnt(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM cnt WHERE i < 10) SELECT * FROM cnt`);
    ok(`WITH conversation AS (SELECT id FROM ${T}) SELECT * FROM conversation`); // CTE 遮蔽系统表名：数据源仍是插件私有表
  });

  it('插件私有索引 / ALTER / DROP', () => {
    ok(`CREATE INDEX ${T}_idx ON ${T} (host)`);
    ok(`CREATE UNIQUE INDEX ${T}_uq ON ${T} (id)`);
    ok(`DROP INDEX IF EXISTS ${T}_idx`);
    ok(`ALTER TABLE ${T} ADD COLUMN note TEXT`);
    ok(`ALTER TABLE ${T} RENAME TO plugin_ops_shell__conn2`);
    ok(`DROP TABLE IF EXISTS ${T}`);
  });

  it('VALUES 语句 / 字符串与注释中的关键字不误伤', () => {
    ok(`INSERT INTO ${T} (id) VALUES ('from conversation')`);
    ok(`SELECT id FROM ${T} -- FROM conversation 注释`);
    ok(`SELECT id /* FROM conversation */ FROM ${T}`);
    ok(`SELECT id FROM ${T} WHERE host LIKE '%begin%'`);
  });
});

describe('assertSqlAllowed 系统表全拒（增删改查 + DDL）', () => {
  const denied = ['conversation', 'message', 'agent', 'model', 'memory', 'skill', 'plugin', 'plugin_storage'];

  it.each(denied)('SELECT 系统表 %s 拒绝', (t) => {
    expect(() => assertSqlAllowed(`SELECT * FROM ${t}`, PID)).toThrow(SandboxDbError);
  });

  it.each(denied)('INSERT/UPDATE/DELETE 系统表 %s 拒绝', (t) => {
    expect(() => assertSqlAllowed(`INSERT INTO ${t} (id) VALUES (?)`, PID)).toThrow(SandboxDbError);
    expect(() => assertSqlAllowed(`UPDATE ${t} SET id = ?`, PID)).toThrow(SandboxDbError);
    expect(() => assertSqlAllowed(`DELETE FROM ${t}`, PID)).toThrow(SandboxDbError);
  });

  it.each(denied)('DROP 系统表 %s 拒绝', (t) => {
    expect(() => assertSqlAllowed(`DROP TABLE ${t}`, PID)).toThrow(SandboxDbError);
  });

  it('其他插件的前缀表拒绝（含前缀相似表）', () => {
    expect(() => assertSqlAllowed('SELECT * FROM plugin_git_explorer__repo', PID)).toThrow(SandboxDbError);
    expect(() => assertSqlAllowed('SELECT * FROM plugin_ops_shell2__x', PID)).toThrow(SandboxDbError);
    expect(() => assertSqlAllowed('SELECT * FROM plugin_ops_shell__x', 'ops-shell2')).toThrow(SandboxDbError);
    // 自有命名空间内任意层级命名放行（前缀后的内容属于插件自己）
    expect(() => assertSqlAllowed('SELECT * FROM plugin_ops_shell__extra__deep', PID)).not.toThrow();
  });

  it('sqlite 系统表拒绝', () => {
    expect(() => assertSqlAllowed('SELECT name FROM sqlite_master', PID)).toThrow(SandboxDbError);
    expect(() => assertSqlAllowed('SELECT * FROM main.sqlite_schema', PID)).toThrow(SandboxDbError);
  });

  it('schema 限定名拒绝', () => {
    expect(() => assertSqlAllowed('SELECT * FROM main.conversation', PID)).toThrow(SandboxDbError);
  });

  it('CREATE TABLE AS SELECT 夹带系统表拒绝', () => {
    expect(() => assertSqlAllowed(`CREATE TABLE ${T} AS SELECT * FROM conversation`, PID)).toThrow(SandboxDbError);
  });

  it('INSERT INTO ... SELECT 夹带系统表拒绝', () => {
    expect(() => assertSqlAllowed(`INSERT INTO ${T} SELECT * FROM conversation`, PID)).toThrow(SandboxDbError);
  });

  it('引号标识符伪装拒绝', () => {
    expect(() => assertSqlAllowed('SELECT * FROM "conversation"', PID)).toThrow(SandboxDbError);
    expect(() => assertSqlAllowed('SELECT * FROM [conversation]', PID)).toThrow(SandboxDbError);
  });
});

describe('assertSqlAllowed 危险语句硬禁', () => {
  const denied = (sql: string) => expect(() => assertSqlAllowed(sql, PID)).toThrow(SandboxDbError);

  it('多语句（含分号夹带 DROP）', () => {
    denied(`SELECT * FROM ${T}; DROP TABLE conversation`);
    denied(`SELECT 1; SELECT 2`);
  });

  it('PRAGMA / ATTACH / VACUUM / REINDEX / ANALYZE', () => {
    denied('PRAGMA table_info(conversation)');
    denied(`PRAGMA table_info(${T})`);
    denied("ATTACH DATABASE 'x.db' AS aux");
    denied('DETACH aux');
    denied(`VACUUM INTO '/tmp/steal.db'`);
    denied(`REINDEX ${T}`);
    denied(`ANALYZE ${T}`);
  });

  it('事务控制拒绝', () => {
    denied('BEGIN');
    denied('COMMIT');
    denied('ROLLBACK');
    denied('SAVEPOINT s1');
  });

  it('不支持的语句类型', () => {
    denied('EXPLAIN SELECT * FROM conversation');
    denied('');
    denied('   ');
  });

  it('注释未闭合 / 字符串未闭合拒绝', () => {
    denied(`SELECT * FROM ${T} /* 未闭合`);
    denied(`SELECT '未闭合 FROM ${T}`);
  });
});

describe('createSandboxedDb 端到端', () => {
  type Row = Record<string, unknown>;
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const hostDb = {
    exec: async (sql: string, params?: unknown[]) => { calls.push({ sql, params }); },
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => { calls.push({ sql, params }); return [] as T[]; },
    transaction: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  };

  it('私有表 SQL 原样透传宿主', async () => {
    calls.length = 0;
    const db = createSandboxedDb(hostDb, PID);
    await db.exec(`CREATE TABLE IF NOT EXISTS ${T} (id TEXT PRIMARY KEY)`);
    await db.query<Row>(`SELECT * FROM ${T}`, ['a']);
    expect(calls).toHaveLength(2);
    expect(calls[1].params).toEqual(['a']);
  });

  it('系统表 SQL 抛 SandboxDbError 且不触达宿主', async () => {
    calls.length = 0;
    const db = createSandboxedDb(hostDb, PID);
    await expect(db.query('SELECT * FROM conversation')).rejects.toThrow(SandboxDbError);
    await expect(db.exec('DELETE FROM message')).rejects.toThrow(SandboxDbError);
    expect(calls).toHaveLength(0);
  });

  it('事务透传，事务体内语句仍受沙箱约束', async () => {
    calls.length = 0;
    const db = createSandboxedDb(hostDb, PID);
    const r = await db.transaction(async () => {
      await db.exec(`INSERT INTO ${T} (id) VALUES (?)`, ['a']);
      return 'ok';
    });
    expect(r).toBe('ok');
    expect(calls).toHaveLength(1);
    await expect(db.transaction(async () => { await db.exec('DELETE FROM agent'); })).rejects.toThrow(SandboxDbError);
    expect(calls).toHaveLength(1);
  });
});

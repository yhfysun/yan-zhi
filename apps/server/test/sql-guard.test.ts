/**
 * SQL 控制台护栏（P2.1）单元测试
 *
 * 覆盖两层：
 *  1. @yan-zhi/shared sql-text：语句切分（字符串/注释/括号内分号不切）+ statementAt 光标定位
 *  2. sql-guard：read/write/ddl/admin 分类拦截
 *
 * 安全红线：DDL 一律拒；写语句即使 allow_write=1 也拦（引导走数据编辑通道）；
 * EXPLAIN ANALYZE + 写语句拦（PG 会真执行）；SELECT ... INTO OUTFILE 拦（MySQL 服务端写文件）。
 */
import { describe, it, expect } from 'vitest';
import { splitSqlStatements, statementAt } from '@yan-zhi/shared';
import { buildSnapshotQuery, guardDataEditSql, guardSqlConsole } from '../src/services/sql-guard.js';

describe('splitSqlStatements（@yan-zhi/shared）', () => {
  const SQL = `SELECT 1; -- 注释; 里的分号
SELECT 'a;b' AS s;
/* 块;注释 */ UPDATE t SET a = 1;
`;

  it('切出 3 条语句', () => {
    expect(splitSqlStatements(SQL)).toHaveLength(3);
  });

  it('字符串里的分号不切分', () => {
    expect(splitSqlStatements(SQL)[1].text).toContain("'a;b'");
  });

  it('注释里的分号不切分，注释归属下一条语句', () => {
    expect(splitSqlStatements(SQL)[0].text).toBe('SELECT 1');
  });

  it('start/end 区间落在原文对应位置', () => {
    const parts = splitSqlStatements(SQL);
    for (const p of parts) {
      expect(SQL.slice(p.start, p.end).trim()).toBe(p.text);
    }
  });

  it('纯注释 / 空文本产出 0 条', () => {
    expect(splitSqlStatements('-- only comment\n')).toHaveLength(0);
    expect(splitSqlStatements('')).toHaveLength(0);
  });

  it('语句间无分号也按结尾收口', () => {
    expect(splitSqlStatements('SELECT 1')).toHaveLength(1);
  });

  it('statementAt 定位光标所在语句', () => {
    const at = statementAt(SQL, SQL.indexOf("'a;b'"));
    expect(at?.text).toContain('a;b');
    expect(statementAt(SQL, 0)?.text).toBe('SELECT 1');
    // 超出末尾回退到最后一条
    expect(statementAt(SQL, SQL.length + 100)?.text).toContain('UPDATE');
  });

  it('括号内分号不切分（函数参数包裹场景）', () => {
    expect(splitSqlStatements("SELECT f(a, ';') AS x")).toHaveLength(1);
  });
});

describe('guardSqlConsole · 只读模式', () => {
  const g = (sql: string, writeAllowed = false) => guardSqlConsole(sql, writeAllowed);

  it('SELECT 通过', () => {
    expect(g('SELECT * FROM t WHERE id = 1').ok).toBe(true);
  });

  it('WITH ... SELECT 通过', () => {
    expect(g('WITH x AS (SELECT 1 AS a) SELECT a FROM x').ok).toBe(true);
  });

  it('PRAGMA / SHOW / DESCRIBE 作为读通过', () => {
    expect(g('PRAGMA table_info(t)').ok).toBe(true);
    expect(g('SHOW TABLES').ok).toBe(true);
    expect(g('DESCRIBE t').ok).toBe(true);
  });

  it('INSERT / UPDATE 被拦为写', () => {
    const r1 = g('INSERT INTO t VALUES (1)');
    expect(r1.ok).toBe(false);
    expect(r1.blocked[0].reason).toContain('未开启写操作');
    expect(g('UPDATE t SET a = 1 WHERE id = 1').ok).toBe(false);
  });

  it('DDL 一律拒绝（写开关打开也一样）', () => {
    expect(g('DROP TABLE t').ok).toBe(false);
    expect(g('CREATE TABLE t (id INT)').ok).toBe(false);
    expect(g('CREATE INDEX idx ON t(a)', true).ok).toBe(false);
    expect(g('TRUNCATE TABLE t', true).ok).toBe(false);
  });

  it('SET / USE / KILL 等管理语句拒绝', () => {
    const r = g('SET statement_timeout = 0');
    expect(r.ok).toBe(false);
    expect(r.blocked[0].reason).toContain('管理');
  });

  it('WITH ... INSERT 被拦（CTE 尾动作检测）', () => {
    expect(g('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x').ok).toBe(false);
  });

  it('EXPLAIN ANALYZE DELETE 被拦且带具体原因', () => {
    const r = g('EXPLAIN ANALYZE DELETE FROM t');
    expect(r.ok).toBe(false);
    expect(r.blocked[0].reason).toContain('EXPLAIN');
  });

  it('SELECT ... INTO OUTFILE/DUMPFILE 被拦（MySQL 服务端写文件）', () => {
    expect(g("SELECT * FROM t INTO OUTFILE '/tmp/x'").ok).toBe(false);
    expect(g('SELECT * FROM t INTO DUMPFILE 1').ok).toBe(false);
  });

  it('字符串与注释里的危险词不误伤', () => {
    expect(g("SELECT 'DROP TABLE t' AS x").ok).toBe(true);
    expect(g('-- DROP TABLE t\nSELECT 1').ok).toBe(true);
  });

  it('无法识别的语句按最保守策略拒绝', () => {
    expect(g('COPY t TO STDOUT').ok).toBe(false);
  });
});

describe('guardSqlConsole · 多语句混合', () => {
  it('混合文本：整体不 ok，reads 与 blocked 按语句序号分开', () => {
    const mix = guardSqlConsole('SELECT 1; DROP TABLE t; SELECT 2', false);
    expect(mix.ok).toBe(false);
    expect(mix.reads).toHaveLength(2);
    expect(mix.blocked).toHaveLength(1);
    expect(mix.blocked[0].index).toBe(1);
    expect(mix.statements).toHaveLength(3);
  });

  it('全部为读时 ok', () => {
    const r = guardSqlConsole('SELECT 1; SELECT 2', false);
    expect(r.ok).toBe(true);
    expect(r.reads).toHaveLength(2);
    expect(r.blocked).toHaveLength(0);
  });
});

describe('guardSqlConsole · allow_write=1（写开关打开）', () => {
  it('INSERT 仍被拦并引导走数据编辑通道', () => {
    const r = guardSqlConsole('INSERT INTO t VALUES (1)', true);
    expect(r.ok).toBe(false);
    expect(r.blocked[0].reason).toContain('数据编辑');
  });

  it('DDL 无豁免', () => {
    const r = guardSqlConsole('CREATE INDEX idx ON t(a)', true);
    expect(r.ok).toBe(false);
    expect(r.blocked[0].reason).toContain('DDL');
  });
});

describe('guardDataEditSql · 数据编辑通道', () => {
  it('允许单条带 WHERE 的 UPDATE / DELETE 和无 WHERE 的 INSERT', () => {
    expect(guardDataEditSql('UPDATE account SET name = ? WHERE id = ?')).toMatchObject({
      ok: true,
      action: 'update',
      statement: 'UPDATE account SET name = ? WHERE id = ?',
    });
    expect(guardDataEditSql('DELETE FROM account WHERE id = 7')).toMatchObject({
      ok: true,
      action: 'delete',
    });
    expect(guardDataEditSql('INSERT INTO account (id, name) VALUES (?, ?)')).toMatchObject({
      ok: true,
      action: 'insert',
    });
  });

  it('UPDATE / DELETE 缺少顶层 WHERE 时拒绝', () => {
    expect(guardDataEditSql('UPDATE account SET name = ?')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('WHERE'),
    });
    expect(guardDataEditSql('DELETE FROM account')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('WHERE'),
    });
    // 子查询里的 WHERE 不能冒充主语句的过滤条件
    expect(guardDataEditSql('UPDATE account SET name = (SELECT name FROM x WHERE id = 1)')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('WHERE'),
    });
  });

  it('多语句、只读语句、DDL、管理语句和 CTE 写入全部拒绝', () => {
    expect(guardDataEditSql('UPDATE account SET name = ? WHERE id = ?; DELETE FROM account WHERE id = ?').ok).toBe(false);
    expect(guardDataEditSql('SELECT * FROM account').ok).toBe(false);
    expect(guardDataEditSql('DROP TABLE account').ok).toBe(false);
    expect(guardDataEditSql('SET statement_timeout = 0').ok).toBe(false);
    expect(guardDataEditSql('WITH x AS (SELECT 1) DELETE FROM account WHERE id = 1').ok).toBe(false);
  });
});

// ===== buildSnapshotQuery（2.3b 变更前快照计划）=====
describe('buildSnapshotQuery · 数据编辑变更前快照计划', () => {
  const build = buildSnapshotQuery;

  it('DELETE：DELETE → SELECT *，其余原文照搬，参数全量沿用', () => {
    const plan = build('DELETE FROM account WHERE status = ? ORDER BY id', ['x']);
    expect(plan).toMatchObject({ kind: 'select', params: ['x'], paramOffset: 0 });
    expect((plan as { sql: string }).sql).toBe('SELECT * FROM account WHERE status = ? ORDER BY id');
  });

  it('DELETE 带别名：SELECT * FROM t AS a WHERE ...', () => {
    const plan = build('DELETE FROM "account" AS a WHERE a.id = 1', []);
    expect((plan as { sql: string }).sql).toBe('SELECT * FROM "account" AS a WHERE a.id = 1');
  });

  it('UPDATE 单表：参数从 WHERE 段起取（SET 段参数数作偏移）', () => {
    const plan = build('UPDATE account SET name = ?, status = ? WHERE id = ?', ['n', 's', 42]);
    expect(plan).toMatchObject({ kind: 'select', params: [42], paramOffset: 2 });
    expect((plan as { sql: string }).sql).toBe('SELECT * FROM account WHERE id = ?');
  });

  it('UPDATE WHERE 段含子查询参数：子查询 ? 同样归 WHERE 段序号', () => {
    const plan = build(
      'UPDATE t SET name = ? WHERE id = (SELECT id FROM u WHERE k = ?) AND flag = ?',
      ['a', 'b', 'c'],
    );
    // offset = SET 段 1 个 ?；快照 SQL 的 ? 都在 WHERE 文本里，参数 [b, c] 一一对应
    expect(plan).toMatchObject({ kind: 'select', params: ['b', 'c'], paramOffset: 1 });
  });

  it('UPDATE 多表（MySQL 逗号 / PG FROM / JOIN）→ unavailable', () => {
    expect(build('UPDATE a, b SET a.x = 1 WHERE a.id = b.id', []).kind).toBe('unavailable');
    expect(build('UPDATE a SET x = 1 FROM b WHERE a.id = b.id', []).kind).toBe('unavailable');
    expect(build('UPDATE a JOIN b ON a.id = b.id SET a.x = 1 WHERE a.id = 1', []).kind).toBe('unavailable');
  });

  it('INSERT → kind=insert（变更前无行）', () => {
    expect(build("INSERT INTO account (id) VALUES (1)", [])).toEqual({ kind: 'insert' });
  });

  it('字符串里的 where 关键字与 ? 不参与定位/计数', () => {
    // WHERE 前的 SET 段里字符串含 ? 与 'where'：不应干扰 offset 与切片
    const plan = build("UPDATE t SET note = 'a?b where c' WHERE id = ?", [7]);
    expect(plan).toMatchObject({ kind: 'select', params: [7], paramOffset: 0 });
    expect((plan as { sql: string }).sql).toBe("SELECT * FROM t WHERE id = ?");
  });

  it('注释里的 WHERE 不误定位', () => {
    const plan = build('DELETE FROM t -- where 注释\nWHERE id = 1', []);
    expect((plan as { sql: string }).sql).toBe('SELECT * FROM t -- where 注释\nWHERE id = 1');
  });
});

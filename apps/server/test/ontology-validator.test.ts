/**
 * 本体保存校验器（P0.2）单元测试
 *
 * 对应 design-addendum.md H2 别名 Bug 修复：
 * source_sql 输出列必须显式 AS 别名（子查询输出列名不可预测，Oracle 还会大写化），
 * 选择器/过滤器 expr 只允许引用别名集合内的标识符。
 */
import { describe, it, expect } from 'vitest';
import {
  checkSourceSqlAliases,
  checkExprReferences,
  validateOntology,
} from '../src/services/ontology-validator.js';

const GOOD_SQL = `SELECT o.id AS order_id, u.name AS user_name, o.pay_amount AS pay_amount
FROM t_order o LEFT JOIN t_user u ON u.id = o.user_id WHERE o.is_deleted = 0`;

describe('checkSourceSqlAliases', () => {
  it('全别名通过并返回别名集合', () => {
    const r = checkSourceSqlAliases(GOOD_SQL);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['order_id', 'user_name', 'pay_amount']);
  });

  it('缺别名报 ALIAS_REQUIRED', () => {
    const r = checkSourceSqlAliases('SELECT o.id, u.name AS user_name FROM t_order o');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].code).toBe('ALIAS_REQUIRED');
      // 已解析出的别名仍然返回，供前端标定位
      expect(r.aliases).toContain('user_name');
    }
  });

  it('裸星号报 BARE_STAR', () => {
    const r = checkSourceSqlAliases('SELECT * FROM t_order');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('BARE_STAR');
  });

  it('t.* 报 BARE_STAR', () => {
    const r = checkSourceSqlAliases('SELECT o.* FROM t_order o');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('BARE_STAR');
  });

  it('聚合无别名报错', () => {
    const r = checkSourceSqlAliases('SELECT COUNT(*) FROM t_order');
    expect(r.ok).toBe(false);
  });

  it('聚合带别名通过', () => {
    const r = checkSourceSqlAliases('SELECT COUNT(*) AS cnt, SUM(o.pay_amount) AS amt FROM t_order o');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['cnt', 'amt']);
  });

  it('注释与字符串里的 AS/分号不干扰解析', () => {
    const r = checkSourceSqlAliases(
      "SELECT o.id AS id, u.id AS id2, -- 注释\n CASE WHEN o.status = 1 THEN 'x' ELSE 'y' END AS st FROM t o",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['id', 'id2', 'st']);
  });

  it('别名重复报错', () => {
    const r = checkSourceSqlAliases('SELECT o.id AS order_id, o.pay_amount AS order_id FROM t_order o');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.message.includes('重复'))).toBe(true);
  });

  it('隐式别名 t.col 判为缺别名（col 是列名不是别名）', () => {
    const r = checkSourceSqlAliases('SELECT o.id FROM t_order o');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('ALIAS_REQUIRED');
  });

  it('非 SELECT 语句拒绝', () => {
    const r = checkSourceSqlAliases('UPDATE t SET a = 1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('EMPTY_SELECT');
  });

  it('DISTINCT 修饰词剥离', () => {
    const r = checkSourceSqlAliases('SELECT DISTINCT o.region AS region FROM t_order o');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.aliases).toEqual(['region']);
  });

  it('大小写混合 AS 也能识别', () => {
    const r = checkSourceSqlAliases('select o.id as order_id from t_order o');
    expect(r.ok).toBe(true);
  });
});

describe('checkExprReferences', () => {
  const aliases = ['order_id', 'user_name', 'pay_amount', 'status'];

  it('合法引用通过', () => {
    expect(checkExprReferences('status = 1', aliases)).toHaveLength(0);
  });

  it('函数包裹 + 字符串字面量通过', () => {
    expect(checkExprReferences("pay_amount > 100 AND UPPER(user_name) LIKE '%a%'", aliases)).toHaveLength(0);
  });

  it('IN 列表通过', () => {
    expect(checkExprReferences('status IN (1, 2, 3)', aliases)).toHaveLength(0);
  });

  it('未知标识符报 UNKNOWN_IDENTIFIER', () => {
    const errs = checkExprReferences('order_status = 1', aliases);
    expect(errs[0].code).toBe('UNKNOWN_IDENTIFIER');
    expect(errs[0].message).toContain('order_status');
  });

  it('字符串字面量里的词不算引用', () => {
    expect(checkExprReferences("status = 'AND'", aliases)).toHaveLength(0);
  });

  it('括号不平衡报 UNBALANCED', () => {
    expect(checkExprReferences('(status = 1', aliases)[0].code).toBe('UNBALANCED');
  });

  it('空表达式报 EMPTY_EXPR', () => {
    expect(checkExprReferences('   ', aliases)[0].code).toBe('EMPTY_EXPR');
  });

  it('关键字（AND/OR/NOT）不作标识符校验', () => {
    expect(checkExprReferences('status = 1 AND pay_amount IS NOT NULL', aliases)).toHaveLength(0);
  });
});

describe('validateOntology（一站式）', () => {
  it('源头 + 选择器 + 过滤器全部合法', () => {
    const v = validateOntology({
      sourceSql: GOOD_SQL,
      selectorExprs: ['pay_amount', 'user_name'],
      filterExprs: ['pay_amount > 100'],
    });
    expect(v.ok).toBe(true);
  });

  it('过滤器引用未知列报错', () => {
    const v = validateOntology({ sourceSql: GOOD_SQL, filterExprs: ['bad_col = 1'] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0].code).toBe('UNKNOWN_IDENTIFIER');
  });

  it('源头缺别名时选择器不校验但错误聚合返回', () => {
    const v = validateOntology({
      sourceSql: 'SELECT o.id FROM t o',
      selectorExprs: ['whatever'],
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.length).toBeGreaterThanOrEqual(1);
  });
});

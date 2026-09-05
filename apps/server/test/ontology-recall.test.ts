/**
 * 语义召回 + 组装 & 过滤器白名单解析 & 跨本体单跳 JOIN 单测
 */
import { describe, it, expect } from 'vitest';
import {
  scoreKeywords,
  recallByKeywords,
  buildOntologyDigest,
  type RecallConfig,
} from '../src/services/ontology-recall.js';
import {
  compileOntologyJoinQuery,
  type OntologySpecWithCode,
} from '../src/services/ontology-compiler.js';

const CFG: RecallConfig = { threshold: 0.6, maxItems: 8 };

describe('scoreKeywords · 规则评分', () => {
  it('整段相等 1.0', () => {
    expect(scoreKeywords(['近30天'], '统计 近30天 的订单')).toBe(1.0);
  });
  it('子串包含 0.8', () => {
    expect(scoreKeywords(['近30天'], '看看近30天的销量')).toBe(0.8);
  });
  it('未命中 0', () => {
    expect(scoreKeywords(['近30天'], '上个月怎么样')).toBe(0);
  });
  it('无关键词 0', () => {
    expect(scoreKeywords(undefined, '随便看看')).toBe(0);
  });
  it('多关键词取最高分', () => {
    expect(scoreKeywords(['不存在词', '销量'], '查销量')).toBe(0.8);
  });
});

describe('recallByKeywords · 阈值与 topK', () => {
  const items = [
    { name: 'a', keywords: ['甲'] },
    { name: 'b', keywords: ['乙'] },
    { name: 'c', keywords: [] },
    { name: 'd', keywords: ['订单'] },
  ];
  it('低于阈值丢弃、按分数降序', () => {
    const hits = recallByKeywords(items, '查订单 甲', CFG);
    expect(hits.map((h) => h.item.name)).toEqual(['a', 'd']); // a=1.0, d=0.8; b/c 未达 0.6
  });
  it('topK 截断', () => {
    const many = ['k1', 'k2', 'k3', 'k4', 'k5'].map((k, i) => ({ name: `x${i}`, keywords: [k] }));
    const hits = recallByKeywords(many, 'k1 k2 k3 k4 k5', { threshold: 0.6, maxItems: 3 });
    expect(hits.length).toBe(3);
  });
});

describe('buildOntologyDigest · 默认直拼 + 非默认召回', () => {
  const ont = {
    id: 'o1', datasourceId: 'ds', code: 'order', name: '订单', domain: null,
    description: null, synonyms: [], sourceSql: 'SELECT id AS id FROM t_order',
    dimensions: [
      { name: 'region', expr: 'region', isDefault: true, description: '区域' },
      { name: 'channel', expr: 'channel', keywords: ['渠道', '来源'] },
    ],
    timeDimensions: [],
    measures: [{ name: 'amount_sum', expr: 'amount', agg: 'sum' as const, isDefault: true }],
    filters: [
      { name: '近30天', expr: "created_at >= DATE('now','-30 day')", isDefault: true },
      { name: '已删除', expr: 'is_deleted = 1', keywords: ['删除'] },
    ],
    relations: [],
    policies: ['is_deleted = 0'],
    status: 'published', version: 1, builtin: false, enrichedBy: null,
    createdAt: 0, updatedAt: 0, publishedAt: 0,
  };

  it('默认项无条件出现；非默认命中才出现', () => {
    const digest = buildOntologyDigest([ont], '看下渠道销量', CFG);
    expect(digest).toContain('选择列(默认)');
    expect(digest).toContain('region');
    expect(digest).toContain('channel'); // 「渠道」子串命中 0.8
    expect(digest).toContain('过滤器(默认)');
    expect(digest).toContain("created_at >= DATE('now','-30 day')");
    expect(digest).not.toContain('已删除'); // 未命中
  });

  it('无默认且无命中的本体整条省略', () => {
    const sparse = {
      ...ont,
      code: 'empty',
      dimensions: [{ name: 'x', expr: 'x', keywords: ['不存在词'] }],
      measures: [], filters: [], policies: [],
    };
    const digest = buildOntologyDigest([sparse], '随便问问', CFG);
    expect(digest).not.toContain('empty');
  });

  it('draft 本体不进摘要', () => {
    const digest = buildOntologyDigest([{ ...ont, status: 'draft' }], '订单', CFG);
    expect(digest).toBe('');
  });
});

// ===== 跨本体编译 =====

const ORDER: OntologySpecWithCode = {
  code: 'order',
  sourceSql: 'SELECT o.id AS order_id, o.user_id AS user_id, o.amount AS amount FROM t_order o',
  aliases: ['order_id', 'user_id', 'amount'],
  dimensions: [{ name: 'user_id', expr: 'user_id' }],
  timeDimensions: [],
  measures: [{ name: 'amount_sum', expr: 'amount', agg: 'sum' }],
  filters: [{ name: '大额', expr: 'amount > 1000' }],
  relations: [
    { type: 'N:1', target: 'user', sourceAttr: 'user_id', targetAttr: 'user_id' },
    {
      type: 'N:N', target: 'tag', sourceAttr: 'order_id', targetAttr: 'tag_id',
      via: { table: 't_order_tag', sourceColumn: 'order_id', targetColumn: 'tag_id' },
    },
  ],
};

const USER: OntologySpecWithCode = {
  code: 'user',
  sourceSql: 'SELECT u.id AS user_id, u.name AS user_name, u.region AS region FROM t_user u',
  aliases: ['user_id', 'user_name', 'region'],
  dimensions: [{ name: 'user_name', expr: 'user_name' }, { name: 'region', expr: 'region' }],
  timeDimensions: [],
  measures: [],
  filters: [],
  relations: [],
};

const TAG: OntologySpecWithCode = {
  code: 'tag',
  sourceSql: 'SELECT t.id AS tag_id, t.name AS tag_name FROM t_tag t',
  aliases: ['tag_id', 'tag_name'],
  dimensions: [{ name: 'tag_name', expr: 'tag_name' }],
  timeDimensions: [],
  measures: [],
  filters: [],
  relations: [],
};

describe('compileOntologyJoinQuery · 单跳与 via', () => {
  it('直连 N:1：INNER JOIN ON 双方属性', () => {
    const r = compileOntologyJoinQuery('sqlite', [ORDER, USER], {
      root: 'order', join: ['user'],
      dimensions: ['user_name'],
      measures: [{ name: 'amount_sum' }],
    });
    expect(r.sql).toContain('FROM (SELECT o.id AS order_id');
    expect(r.sql).toContain('INNER JOIN (SELECT u.id AS user_id');
    expect(r.sql).toContain('ON _ont."user_id" = t_user."user_id"');
    expect(r.sql).toContain('user_name AS "user_name"');
    expect(r.sql).toContain('GROUP BY user_name');
  });

  it('N:N via 中间表展开两跳', () => {
    const r = compileOntologyJoinQuery('sqlite', [ORDER, TAG], {
      root: 'order', join: ['tag'],
      dimensions: ['tag.tag_name'],
      measures: [{ name: 'amount_sum' }],
    });
    expect(r.sql).toContain('INNER JOIN "t_order_tag" _via_0');
    expect(r.sql).toContain('ON _via_0."order_id" = _ont."order_id"');
    expect(r.sql).toContain('ON _via_0."tag_id" = t_tag."tag_id"');
    expect(r.sql).toContain('tag_name AS "tag.tag_name"');
  });

  it('过滤器名白名单解析 + 裸条件放行', () => {
    const r = compileOntologyJoinQuery('sqlite', [ORDER, USER], {
      root: 'order', join: ['user'],
      measures: [{ name: 'amount_sum' }],
      filters: ['大额', "user_id = 'u1'"],
    });
    expect(r.sql).toContain('WHERE (amount > 1000)\n  AND (user_id = \'u1\')');
  });

  it('幻觉过滤器名报错（裸单词查不到即拦）', () => {
    expect(() =>
      compileOntologyJoinQuery('sqlite', [ORDER, USER], {
        root: 'order', join: ['user'], measures: [{ name: 'amount_sum' }], filters: ['大额x'],
      }),
    ).toThrow(/过滤器「大额x」不存在/);
  });

  it('无关联关系的 join 拒绝', () => {
    expect(() =>
      compileOntologyJoinQuery('sqlite', [ORDER, USER, TAG], {
        root: 'user', join: ['tag'], dimensions: ['tag_name'],
      }),
    ).toThrow(/没有已声明的关联关系/);
  });

  it('N:N 缺 via 定义拒绝', () => {
    const noVia: OntologySpecWithCode = {
      ...ORDER,
      relations: [{ type: 'N:N', target: 'tag', sourceAttr: 'order_id', targetAttr: 'tag_id' }],
    };
    expect(() =>
      compileOntologyJoinQuery('sqlite', [noVia, TAG], {
        root: 'order', join: ['tag'], dimensions: ['tag_name'],
      }),
    ).toThrow(/缺少中间表 via/);
  });

  it('裸字段名跨本体重名（expr 不同）要求消歧', () => {
    const userDup: OntologySpecWithCode = {
      ...USER,
      dimensions: [{ name: 'user_name', expr: 'user_name' }, { name: 'region', expr: 'region' }, { name: 'user_id', expr: 'user_name' }],
    };
    expect(() =>
      compileOntologyJoinQuery('sqlite', [ORDER, userDup], {
        root: 'order', join: ['user'], dimensions: ['user_id'],
      }),
    ).toThrow(/重名/);
  });
});

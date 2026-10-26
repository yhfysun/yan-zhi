// 本体接入工作台：意图白名单 + 本体定位口径。
// 守住「全链路无自由 SQL」——前端只能提交字段名，任何 SQL / 未知键必须被丢弃。
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

process.env.DATA_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-ont-workbench-'));

type Svc = typeof import('../src/services/ontology.js');
let svc: Svc;

beforeAll(async () => {
  svc = await import('../src/services/ontology.js');
});

describe('sanitizeOntologyIntent', () => {
  it('丢弃 SQL 与未知键，只保留白名单字段', () => {
    const intent = svc.sanitizeOntologyIntent({
      dimensions: ['日期'],
      measures: [{ name: '销售额', agg: 'sum' }],
      sql: 'SELECT * FROM sqlite_master',
      table: 'conversation',
      where: '1=1',
    });
    expect(intent.dimensions).toEqual(['日期']);
    expect(intent.measures).toEqual([{ name: '销售额', agg: 'sum' }]);
    expect(intent).not.toHaveProperty('sql');
    expect(intent).not.toHaveProperty('table');
    expect(intent).not.toHaveProperty('where');
  });

  it('limit 裁剪到 1..1000，缺省 200', () => {
    expect(svc.sanitizeOntologyIntent({}).limit).toBe(200);
    expect(svc.sanitizeOntologyIntent({ limit: 0 }).limit).toBe(1);
    expect(svc.sanitizeOntologyIntent({ limit: 99999 }).limit).toBe(1000);
    expect(svc.sanitizeOntologyIntent({ limit: '250' }).limit).toBe(250);
  });

  it('非对象输入按空意图处理', () => {
    expect(svc.sanitizeOntologyIntent(null).limit).toBe(200);
    expect(svc.sanitizeOntologyIntent('SELECT 1').limit).toBe(200);
  });
});

describe('findOntologyByRef', () => {
  it('未知引用给出明确错误（提示先查可用本体）', () => {
    expect(() => svc.findOntologyByRef('u-none', 'no_such_ontology')).toThrow(/本体不存在/);
  });
});

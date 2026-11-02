/**
 * 敏感列脱敏（P5.5）：只遮 sensitive 字段；null 保持；按本体 id/code 解析字段。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-onto-mask-'));

import { db } from '../src/db.js';
import { maskRowsByFields, maskOntologyResult, MASKED_VALUE } from '../src/services/ontology.js';

const UID = 'u_mask_test';
const OID = 'onto_mask_test';

beforeAll(() => {
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, 'mask_u', NULL, 'x', ?)")
    .run(UID, Date.now());
  db.prepare(
    `INSERT OR REPLACE INTO ontology (id, user_id, datasource_id, code, name, source_sql,
       dimensions_json, time_dimensions_json, measures_json, status, version, created_at, updated_at)
     VALUES (?, ?, 'ds_m', 'mask_test', '脱敏测试', 'SELECT 1 AS x', ?, '[]', '[]', 'published', 1, ?, ?)`,
  ).run(OID, UID, JSON.stringify([
    { name: 'phone', expr: 'phone', sensitive: true },
    { name: 'region', expr: 'region' },
  ]), Date.now(), Date.now());
});

describe('maskRowsByFields', () => {
  it('只遮敏感列；null 保持；非敏感列不动', () => {
    const r = maskRowsByFields(
      [{ name: 'phone', sensitive: true }, { name: 'region' }],
      ['phone', 'region'],
      [{ phone: '13800000000', region: '华东' }, { phone: null, region: '华南' }],
    );
    expect(r.masked).toEqual(['phone']);
    expect(r.rows[0].phone).toBe(MASKED_VALUE);
    expect(r.rows[0].region).toBe('华东');
    expect(r.rows[1].phone).toBeNull();
  });

  it('没有敏感列时原样返回（同一个数组引用）', () => {
    const rows = [{ region: '华东' }];
    const r = maskRowsByFields([{ name: 'region' }], ['region'], rows);
    expect(r.masked).toEqual([]);
    expect(r.rows).toBe(rows);
  });
});

describe('maskOntologyResult', () => {
  it('按 id 或 code 解析敏感字段', () => {
    const byId = maskOntologyResult(UID, OID, ['phone', 'region'], [{ phone: '1', region: 'x' }]);
    expect(byId.masked).toEqual(['phone']);
    expect(byId.rows[0].phone).toBe(MASKED_VALUE);

    const byCode = maskOntologyResult(UID, 'mask_test', ['phone'], [{ phone: '1' }]);
    expect(byCode.rows[0].phone).toBe(MASKED_VALUE);
  });

  it('本体不存在时原样返回', () => {
    const rows = [{ phone: '1' }];
    const r = maskOntologyResult(UID, 'nope', ['phone'], rows);
    expect(r.masked).toEqual([]);
    expect(r.rows[0].phone).toBe('1');
  });
});

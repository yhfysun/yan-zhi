/**
 * 本体健康度（P5.5）：描述覆盖率 / 缺样本值 / 缺同义词 / 低置信度。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-onto-health-'));

import { db } from '../src/db.js';
import { ontologyHealth } from '../src/services/ontology.js';

const UID = 'u_health_test';

function insert(id: string, dims: unknown[], measures: unknown[] = []): void {
  db.prepare(
    `INSERT OR REPLACE INTO ontology (id, user_id, datasource_id, code, name, source_sql,
       dimensions_json, time_dimensions_json, measures_json, status, version, created_at, updated_at)
     VALUES (?, ?, 'ds_h', ?, ?, 'SELECT 1 AS a', ?, '[]', ?, 'published', 1, ?, ?)`,
  ).run(id, UID, id, `本体-${id}`, JSON.stringify(dims), JSON.stringify(measures), Date.now(), Date.now());
}

beforeAll(() => {
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, 'health_u', NULL, 'x', ?)")
    .run(UID, Date.now());
  insert('o_good', [
    { name: 'region', expr: 'region', description: '销售区域', synonyms: ['大区'], sampleValues: ['华东'] },
    { name: 'city', expr: 'city', description: '城市', synonyms: ['市'], sampleValues: ['上海'] },
  ], [{ name: 'amount', expr: 'amount', agg: 'sum', description: '金额', confidence: 0.9 }]);
  insert('o_bad', [
    { name: 'status', expr: 'status' }, // 无描述/无同义词/无样本值
  ], [{ name: 'qty', expr: 'qty', agg: 'sum', confidence: 0.4 }]);
});

describe('ontologyHealth', () => {
  it('逐本体统计：覆盖率、缺样本、缺同义词、低置信度', () => {
    const r = ontologyHealth(UID);
    expect(r.summary.count).toBe(2);
    expect(r.summary.fields).toBe(5);
    expect(r.summary.described).toBe(3);
    expect(r.summary.descriptionRate).toBeCloseTo(3 / 5);

    const good = r.rows.find((x) => x.code === 'o_good')!;
    expect(good).toMatchObject({ fields: 3, described: 3, missingSamples: 1, missingSynonyms: 1, lowConfidence: 0 });

    const bad = r.rows.find((x) => x.code === 'o_bad')!;
    expect(bad).toMatchObject({ fields: 2, described: 0 });
    expect(bad.missingSamples).toBe(2);
    expect(bad.missingSynonyms).toBe(2);
    expect(bad.lowConfidence).toBe(1);
  });

  it('按描述覆盖率升序排序（问题最多的排前面）', () => {
    const r = ontologyHealth(UID);
    expect(r.rows[0].code).toBe('o_bad');
  });
});

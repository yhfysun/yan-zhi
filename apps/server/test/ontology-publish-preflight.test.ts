/**
 * 发布预检（P6.8）：发布快照、口径 diff、受影响智能体、24h 回滚窗口。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-onto-impact-'));

import { db } from '../src/db.js';
import { publishOntology, impactOntology, rollbackOntology } from '../src/services/ontology.js';

const UID = 'u_impact_test';
const OID = 'onto_impact_test';

function insertOntology(description: string, dims: Array<{ name: string; expr: string; description?: string }>): void {
  db.prepare(
    `INSERT OR REPLACE INTO ontology (id, user_id, datasource_id, code, name, description, source_sql,
       dimensions_json, time_dimensions_json, measures_json, status, version, created_at, updated_at, published_at, published_json)
     VALUES (?, ?, 'ds_x', 'impact_test', '影响面测试', ?, 'SELECT 1 AS a', ?, '[]', '[]', 'draft', 1, ?, ?, NULL, NULL)`,
  ).run(OID, UID, description, JSON.stringify(dims), Date.now(), Date.now());
}

beforeAll(() => {
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, 'impact_u', NULL, 'x', ?)")
    .run(UID, Date.now());
  const insAgent = db.prepare(
    'INSERT INTO agent (id, user_id, name, ontology_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  insAgent.run('agent_all', UID, '全量挂载', '[]', Date.now(), Date.now());
  insAgent.run('agent_one', UID, '指定挂载', JSON.stringify([OID]), Date.now(), Date.now());
  insAgent.run('agent_other', UID, '挂别人', JSON.stringify(['other']), Date.now(), Date.now());
});

describe('发布预检与回滚', () => {
  it('首次发布前：全部字段视为新增；只列引用本体的智能体', () => {
    insertOntology('旧描述', [{ name: 'region', expr: 'region', description: '区域' }]);
    const r = impactOntology(UID, OID);
    expect(r.baselineExists).toBe(false);
    expect(r.diff.map((d) => `${d.change}:${d.name}`)).toContain('added:region');
    expect(r.agents.map((a) => a.id).sort()).toEqual(['agent_all', 'agent_one']);
  });

  it('发布后快照生效：diff 反映新增/移除/修改', () => {
    publishOntology(UID, OID);
    const pub = db.prepare('SELECT version, published_json FROM ontology WHERE id = ?').get(OID) as any;
    expect(pub.version).toBe(2);
    expect(pub.published_json).toContain('region');

    // 修改口径：region 描述变、加 city、删 region 以外没有可删的
    db.prepare('UPDATE ontology SET dimensions_json = ?, description = ? WHERE id = ?').run(
      JSON.stringify([
        { name: 'region', expr: 'region', description: '销售大区' },
        { name: 'city', expr: 'city' },
      ]),
      '新描述', OID,
    );
    const r = impactOntology(UID, OID);
    expect(r.baselineExists).toBe(true);
    expect(r.diff.find((d) => d.name === 'region')?.change).toBe('changed');
    expect(r.diff.find((d) => d.name === 'city')?.change).toBe('added');
    expect(r.diff.find((d) => d.kind === 'description')?.change).toBe('changed');
    expect(r.rollbackUntil).toBeGreaterThan(Date.now());
  });

  it('24h 内回滚：恢复快照字段与版本 +1', () => {
    const info = rollbackOntology(UID, OID);
    expect(info.version).toBe(3);
    const row = db.prepare('SELECT dimensions_json, description, status FROM ontology WHERE id = ?').get(OID) as any;
    const dims = JSON.parse(row.dimensions_json) as any[];
    expect(dims.map((d) => d.name)).toEqual(['region']);
    expect(dims[0].description).toBe('区域');
    expect(row.description).toBe('旧描述');
    expect(row.status).toBe('published');
  });

  it('超过 24h 拒绝回滚', () => {
    db.prepare('UPDATE ontology SET published_at = ? WHERE id = ?').run(Date.now() - 25 * 3600 * 1000, OID);
    expect(() => rollbackOntology(UID, OID)).toThrow(/24 小时/);
  });

  it('没有快照时拒绝回滚', () => {
    db.prepare('UPDATE ontology SET published_json = NULL WHERE id = ?').run(OID);
    expect(() => rollbackOntology(UID, OID)).toThrow(/没有可回滚/);
  });
});

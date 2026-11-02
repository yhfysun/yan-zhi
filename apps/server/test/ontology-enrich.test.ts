/**
 * AI 富化（P3.5）测试：
 *  ① 只富化未填描述的字段（有描述 = 人工已确认 locked）；
 *  ② 结果整形只接受目标字段，术语表覆盖 AI；
 *  ③ 采纳时 locked 字段跳过、未锁定字段写回；丢弃只动 pending。
 * 生成器与知识库都注入，测试不打模型。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-enrich-'));

import { db } from '../src/db.js';
import {
  collectTargets, normalizeSuggestions, runEnrichment, acceptDrafts, discardDrafts,
  getJob, listJobs, isLocked,
} from '../src/services/ontology-enrich.js';

const UID = 'u_enrich_test';
const DS = 'ds_enrich_test';
const OID = 'onto_enrich_test';

function insertOntology(dims: unknown[], times: unknown[], measures: unknown[], description: string | null = null): void {
  db.prepare(
    `INSERT OR REPLACE INTO ontology (id, user_id, datasource_id, code, name, description, source_sql,
       dimensions_json, time_dimensions_json, measures_json, created_at, updated_at)
     VALUES (?, ?, ?, 'enrich_test', '富化测试本体', ?, 'SELECT 1 AS x', ?, ?, ?, ?, ?)`,
  ).run(OID, UID, DS, description, JSON.stringify(dims), JSON.stringify(times), JSON.stringify(measures), Date.now(), Date.now());
}

beforeAll(() => {
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, 'enrich_u', NULL, 'x', ?)")
    .run(UID, Date.now());
});

describe('collectTargets / isLocked', () => {
  it('有描述的字段视为已确认，不再富化；本体描述为空才算目标', () => {
    const row = {
      name: '富化测试本体',
      description: null,
      dimensions_json: JSON.stringify([
        { name: 'region', expr: 'region' },
        { name: 'status', expr: 'status', description: '人工写好的状态口径' },
      ]),
      time_dimensions_json: JSON.stringify([{ name: 'created_at', expr: 'created_at' }]),
      measures_json: JSON.stringify([{ name: 'amount', expr: 'amount', agg: 'sum' }]),
    };
    const targets = collectTargets(row);
    expect(targets.map((t) => `${t.kind}:${t.name}`)).toEqual([
      'ontology:富化测试本体', 'dimension:region', 'time:created_at', 'measure:amount',
    ]);
    expect(isLocked({ description: 'x' })).toBe(true);
    expect(isLocked({ description: '  ' })).toBe(false);
  });

  it('本体已有描述则本体不是目标', () => {
    expect(collectTargets({ name: 'n', description: '已写', dimensions_json: '[]', time_dimensions_json: '[]', measures_json: '[]' })).toEqual([]);
  });
});

describe('normalizeSuggestions', () => {
  const targets = [
    { kind: 'dimension' as const, name: 'region' },
    { kind: 'measure' as const, name: 'amount', refAttr: 'amount_key' },
  ];

  it('只接受目标字段；置信度收敛；无内容丢弃', () => {
    const out = normalizeSuggestions({
      suggestions: [
        { kind: 'dimension', field: 'region', description: '销售区域', confidence: 2 },
        { kind: 'dimension', field: 'nope', description: '不存在的字段', confidence: 0.9 },
        { kind: 'measure', field: 'amount', confidence: 0.9 },
      ],
    }, targets, new Map());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'dimension', field: 'region', description: '销售区域', confidence: 1 });
  });

  it('术语表优先：命中 refAttr 时描述/同义词/置信度都取术语表', () => {
    const glossary = new Map([['amount_key', { key: 'amount_key', name: '成交金额', description: '用户口径：含税成交额', synonyms: ['GMV'], enums: [] }]]);
    const out = normalizeSuggestions({
      suggestions: [{ kind: 'measure', field: 'amount', description: 'AI 猜的金额', synonyms: ['金额'], confidence: 0.4 }],
    }, targets, glossary);
    expect(out[0]).toMatchObject({ description: '用户口径：含税成交额', synonyms: ['GMV'], confidence: 1, source: 'glossary' });
  });
});

describe('runEnrichment（注入生成器）', () => {
  it('拼装提示并返回整形结果；知识库证据进入 prompt', async () => {
    const row = {
      code: 'enrich_test', name: '富化测试本体', description: null,
      dimensions_json: JSON.stringify([{ name: 'region', expr: 'region', sampleValues: ['华东', '华南'] }]),
      time_dimensions_json: '[]',
      measures_json: JSON.stringify([{ name: 'amount', expr: 'amount', agg: 'sum', description: '已有描述' }]),
    };
    let seen = '';
    const out = await runEnrichment(UID, row, {
      searchKb: async () => [{ baseName: '业务库', docName: '口径文档', text: 'region 指销售大区' }],
      generate: async ({ user }) => {
        seen = user;
        return { suggestions: [{ kind: 'dimension', field: 'region', description: '销售大区', confidence: 0.8 }] };
      },
    });
    expect(out).toHaveLength(1);
    expect(seen).toContain('样本值=华东/华南');
    expect(seen).toContain('region 指销售大区');
    // 已有描述的 amount 不在目标里
    expect(seen).not.toContain('[measure] amount');
  });

  it('无待富化字段时不调用生成器', async () => {
    let called = false;
    const out = await runEnrichment(UID, {
      code: 'c', name: 'n', description: '已有',
      dimensions_json: '[]', time_dimensions_json: '[]', measures_json: '[]',
    }, { generate: async () => { called = true; return null; } });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('采纳 / 丢弃', () => {
  function addJobWithDrafts(): { jobId: string; unlockedId: string; lockedId: string } {
    insertOntology(
      [{ name: 'region', expr: 'region' }, { name: 'status', expr: 'status', description: '人工口径' }],
      [],
      [],
      null,
    );
    const jobId = 'job_enrich_test';
    const unlockedId = 'draft_unlocked';
    const lockedId = 'draft_locked';
    db.prepare(
      `INSERT OR REPLACE INTO ontology_enrich_job (id, user_id, ontology_id, status, model, total, done, created_at, updated_at)
       VALUES (?, ?, ?, 'done', 'test-model', 2, 2, ?, ?)`,
    ).run(jobId, UID, OID, Date.now(), Date.now());
    const ins = db.prepare(
      `INSERT OR REPLACE INTO ontology_enrich_draft (id, job_id, user_id, ontology_id, kind, field_name, payload_json, confidence, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'dimension', ?, ?, 0.8, 'pending', ?, ?)`,
    );
    ins.run(unlockedId, jobId, UID, OID, 'region', JSON.stringify({ description: '销售大区', synonyms: ['大区'] }), Date.now(), Date.now());
    ins.run(lockedId, jobId, UID, OID, 'status', JSON.stringify({ description: 'AI 想覆盖' }), Date.now(), Date.now());
    return { jobId, unlockedId, lockedId };
  }

  it('采纳：未锁定字段写回，已有描述字段跳过', () => {
    const { jobId, unlockedId, lockedId } = addJobWithDrafts();
    const r = acceptDrafts(UID, OID, [unlockedId, lockedId]);
    expect(r).toEqual({ accepted: 1, skipped: 1 });

    const row = db.prepare('SELECT dimensions_json FROM ontology WHERE id = ?').get(OID) as any;
    const dims = JSON.parse(row.dimensions_json) as any[];
    expect(dims.find((d) => d.name === 'region')).toMatchObject({ description: '销售大区', synonyms: ['大区'], confidence: 0.8, locked: true });
    expect(dims.find((d) => d.name === 'status').description).toBe('人工口径');

    const drafts = getJob(UID, OID, jobId).drafts;
    expect(drafts.find((d) => d.id === unlockedId)?.status).toBe('accepted');
    expect(drafts.find((d) => d.id === lockedId)?.status).toBe('pending');
    expect(listJobs(UID, OID).length).toBeGreaterThan(0);
  });

  it('丢弃只改 pending', () => {
    const { unlockedId } = addJobWithDrafts();
    expect(discardDrafts(UID, OID, [unlockedId])).toBe(1);
    expect(discardDrafts(UID, OID, [unlockedId])).toBe(0);
  });
});

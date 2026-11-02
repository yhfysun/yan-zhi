/**
 * 已验证问答沉淀（P4.7）：保存去重、字面相似度召回、few-shot 格式化。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.YZ_TEST_FORCE_SQLJS = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'yz-onto-example-'));

import { db } from '../src/db.js';
import {
  normalizeQuestion, similarity, saveExample, searchExamples, formatExamplesForPrompt, markExamplesUsed,
} from '../src/services/ontology-example.js';

const UID = 'u_example_test';

beforeAll(() => {
  db.prepare("INSERT OR IGNORE INTO user (id, username, email, password_hash, created_at) VALUES (?, 'example_u', NULL, 'x', ?)")
    .run(UID, Date.now());
});

describe('相似度', () => {
  it('归一化去标点空白；中文 bigram 命中', () => {
    expect(normalizeQuestion('近 30 天 的订单？')).toBe('近30天的订单');
    expect(similarity('近30天订单金额', '近30天的订单金额是多少')).toBeGreaterThan(0.5);
    expect(similarity('近30天订单金额', '各区域用户数')).toBe(0);
  });
});

describe('保存与召回', () => {
  it('同问题重复保存 → 更新而不是新增', () => {
    const a = saveExample(UID, { ontologyId: 'o1', question: '近30天订单金额', intent: { measures: [{ name: 'amount' }] }, rowCount: 1 });
    const b = saveExample(UID, { ontologyId: 'o1', question: '近30天 订单金额？', intent: { measures: [{ name: 'amount' }] }, rowCount: 12 });
    expect(b.id).toBe(a.id);
    expect(b.row_count).toBe(12);
    const n = (db.prepare('SELECT COUNT(*) AS n FROM ontology_example WHERE user_id = ?').get(UID) as any).n;
    expect(n).toBe(1);
  });

  it('按相似度召回，且可限定本体', () => {
    saveExample(UID, { ontologyId: 'o1', question: '各区域用户数', intent: { dimensions: ['region'] }, rowCount: 5 });
    saveExample(UID, { ontologyId: 'o2', question: '近30天订单金额', intent: { measures: [{ name: 'amount' }] }, rowCount: 3 });

    const hit = searchExamples(UID, '最近30天订单的金额', { ontologyId: 'o1' });
    expect(hit[0].question).toContain('订单金额');
    // o1 过滤掉 o2 的同名问题
    expect(hit.every((e) => e.ontology_id === 'o1')).toBe(true);

    const none = searchExamples(UID, '完全无关的话题', { minScore: 0.5 });
    expect(none).toEqual([]);
  });

  it('used_count 可累加；few-shot 只给问题与 DSL，不含物理 SQL', () => {
    const rows = searchExamples(UID, '订单金额');
    markExamplesUsed([rows[0].id]);
    const again = searchExamples(UID, '订单金额');
    expect(again[0].used_count).toBeGreaterThanOrEqual(1);

    const text = formatExamplesForPrompt(again);
    expect(text).toContain('已验证问答');
    expect(text).toContain('答（DSL）');
    expect(text).not.toContain('SELECT');
  });
});

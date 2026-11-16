import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  healthStateAt,
  loadModelHealthMap,
  modelHealthScoreAt,
  recordModelFailure,
  recordModelSuccess,
  stableHealthOrder,
  type ModelHealthRow,
} from '../src/services/model-health.js';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';

const NOW = 1_800_000_000_000;

function row(overrides: Partial<ModelHealthRow> = {}): ModelHealthRow {
  return {
    modelId: 'm1',
    platformId: 'p1',
    failCount: 0,
    lastFailAt: null,
    lastSuccessAt: NOW - 60_000,
    cooldownUntil: 0,
    lastError: null,
    ...overrides,
  };
}

describe('model-health', () => {
  it('没有记录时为 unknown，不会把新模型误判成故障', () => {
    expect(healthStateAt(undefined, NOW)).toBe('unknown');
    expect(modelHealthScoreAt(undefined, NOW)).toBe(0.75);
  });

  it('冷却中的模型排到最后，但不会被永久禁用', () => {
    const cooling = row({ failCount: 2, lastFailAt: NOW - 30_000, cooldownUntil: NOW + 60_000 });
    expect(healthStateAt(cooling, NOW)).toBe('cooling');
    expect(modelHealthScoreAt(cooling, NOW)).toBe(0);
    expect(healthStateAt(cooling, NOW + 120_000)).toBe('degraded');
  });

  it('近期失败会降低分数，超过失败窗口后恢复', () => {
    const degraded = row({
      failCount: 1,
      lastFailAt: NOW - 60_000,
      lastSuccessAt: NOW - 120_000,
      cooldownUntil: NOW - 1_000,
    });
    expect(healthStateAt(degraded, NOW)).toBe('degraded');
    expect(modelHealthScoreAt(degraded, NOW)).toBeLessThan(1);
    expect(healthStateAt(degraded, NOW + 31 * 60_000)).toBe('healthy');
  });

  it('健康优先排序稳定：健康在前、未知居中、冷却在后，同分保持用户顺序', () => {
    const items = [
      { id: 'cool', score: 0 },
      { id: 'unknown', score: 0.75 },
      { id: 'healthy-a', score: 1 },
      { id: 'healthy-b', score: 1 },
    ];
    expect(stableHealthOrder(items, (item) => item.score).map((item) => item.id))
      .toEqual(['healthy-a', 'healthy-b', 'unknown', 'cool']);
  });
});

describe('model-health persistence', () => {
  let db: YzSqliteDb;
  beforeEach(async () => {
    const opened = await openSqlite(':memory:');
    db = opened.db;
    db.exec(`
      CREATE TABLE model_health (
        user_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        fail_count INTEGER NOT NULL DEFAULT 0,
        last_fail_at INTEGER,
        last_success_at INTEGER,
        cooldown_until INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, model_id)
      );
    `);
  });
  afterEach(() => db.close());

  it('失败累计并进入冷却，成功清零并恢复健康', () => {
    recordModelFailure(db, 'u1', 'p1', 'm1', '429 rate limit', NOW);
    recordModelFailure(db, 'u1', 'p1', 'm1', '502 bad gateway', NOW + 1_000);
    let row = loadModelHealthMap(db, 'u1', ['m1']).get('m1');
    expect(row?.failCount).toBe(2);
    expect(row?.lastError).toBe('502 bad gateway');
    expect(healthStateAt(row, NOW + 2_000)).toBe('cooling');

    recordModelSuccess(db, 'u1', 'p1', 'm1', NOW + 3_000);
    row = loadModelHealthMap(db, 'u1', ['m1']).get('m1');
    expect(row?.failCount).toBe(0);
    expect(healthStateAt(row, NOW + 4_000)).toBe('healthy');
  });

  it('健康状态按用户隔离', () => {
    recordModelFailure(db, 'u1', 'p1', 'm1', '429', NOW);
    expect(loadModelHealthMap(db, 'u1', ['m1']).has('m1')).toBe(true);
    expect(loadModelHealthMap(db, 'u2', ['m1']).has('m1')).toBe(false);
  });
});

// model 表去重（2026-10-14）——启动自愈守门测试。
// 场景：跨库合并只按主键 id 去重，而同一平台模型有多种 id 形态（旧拼写 / 新前缀 / uuid）
// → 同一 (platform_id, model_id) 出现多行。去重要保留确定性 id 并把引用重指过去。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';
import { dedupeDuplicateModelRows, ensureModelDedupeIndex } from '../src/services/model-dedupe.js';

async function mkDb() {
  const { db } = await openSqlite(':memory:');
  db.exec(`
    CREATE TABLE model (id TEXT PRIMARY KEY, platform_id TEXT NOT NULL, model_id TEXT NOT NULL, user_id TEXT, created_at INTEGER);
    CREATE TABLE conversation (id TEXT PRIMARY KEY, model_id TEXT);
    CREATE TABLE agent (id TEXT PRIMARY KEY, model_id TEXT);
    CREATE TABLE task_plan_item (id TEXT PRIMARY KEY, model_id TEXT);
  `);
  return db;
}

let db: YzSqliteDb;
beforeEach(async () => { db = await mkDb(); });
afterEach(() => { db.close(); });

const insModel = (id: string, pid: string, mid: string, created = 1) =>
  db.prepare('INSERT INTO model (id, platform_id, model_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, pid, mid, 'u1', created);

describe('dedupeDuplicateModelRows', () => {
  it('保留确定性 id，删除旧拼写前缀行', () => {
    insModel('agnes-guest-agnes-3.0-flash', 'agens-guest', 'agnes-3.0-flash', 100); // 旧拼写，较早
    insModel('agens-guest-agnes-3.0-flash', 'agens-guest', 'agnes-3.0-flash', 200); // 确定性，较晚
    const removed = dedupeDuplicateModelRows(db);
    expect(removed).toBe(1);
    const ids = db.prepare('SELECT id FROM model WHERE platform_id = ? AND model_id = ?').all('agens-guest', 'agnes-3.0-flash');
    expect(ids).toEqual([{ id: 'agens-guest-agnes-3.0-flash' }]);
  });

  it('无确定性 id 时保留最早创建的一条；其引用被重指', () => {
    insModel('uuid-old', 'p1', 'm', 100);
    insModel('uuid-new', 'p1', 'm', 300);
    db.prepare('INSERT INTO conversation (id, model_id) VALUES (?, ?)').run('c1', 'uuid-new');
    db.prepare('INSERT INTO agent (id, model_id) VALUES (?, ?)').run('a1', 'uuid-new');
    db.prepare('INSERT INTO task_plan_item (id, model_id) VALUES (?, ?)').run('t1', 'uuid-new');
    expect(dedupeDuplicateModelRows(db)).toBe(1);
    expect(db.prepare('SELECT id FROM model WHERE platform_id = ? AND model_id = ?').all('p1', 'm')).toEqual([{ id: 'uuid-old' }]);
    expect(db.prepare('SELECT model_id FROM conversation WHERE id = ?').get('c1')).toEqual({ model_id: 'uuid-old' });
    expect(db.prepare('SELECT model_id FROM agent WHERE id = ?').get('a1')).toEqual({ model_id: 'uuid-old' });
    expect(db.prepare('SELECT model_id FROM task_plan_item WHERE id = ?').get('t1')).toEqual({ model_id: 'uuid-old' });
  });

  it('幂等：无重复时返回 0；二次调用仍为 0', () => {
    insModel('p1-m', 'p1', 'm', 1);
    expect(dedupeDuplicateModelRows(db)).toBe(0);
    insModel('p1-m2', 'p1', 'm2', 1);
    insModel('dup-m2', 'p1', 'm2', 2);
    expect(dedupeDuplicateModelRows(db)).toBe(1);
    expect(dedupeDuplicateModelRows(db)).toBe(0);
  });
});

describe('ensureModelDedupeIndex', () => {
  it('去重后建唯一索引；再次插入同 (platform_id, model_id) 会失败', () => {
    insModel('p1-m', 'p1', 'm', 1);
    ensureModelDedupeIndex(db);
    expect(() => insModel('p1-m-again', 'p1', 'm', 2)).toThrow();
  });
});
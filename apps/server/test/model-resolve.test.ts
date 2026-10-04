// 模型标识解析测试 —— 钉住「一个模型两个标识」的兼容契约。
//
// 真实故障背景：短剧流水线点运行报「模型不存在: agnes-3.0-flash」，
// 而画布上明明选着这个模型。根因是 model 表有主键 id（agens-guest-agnes-3.0-flash）
// 与 API 名 model_id（agnes-3.0-flash）两个标识，运行时按主键查、seed 回填写的是 API 名，
// 于是永远查不到；更糟的是预检只收 model_id 集合，恰好命中脏值而**放行**，
// 把错误推迟到跑到那个节点才爆。
//
// 本测试钉住的契约：
//   1) 主键命中（正确路径，不应打 warn）
//   2) API 名回退命中（存量兼容）
//   3) 两处都不存在 → undefined（不得模糊匹配到别的模型）
//   4) 带 platformId 时同名模型跨平台不串用（★ 这是最隐蔽的错法）
//   5) normalizeModelId 把 API 名规范成主键（写库口径）
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
// 2026-10-03 修复：better-sqlite3 已重编为 Electron ABI，测试走统一驱动入口（自动回退 sql.js）
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';
import { findModelRow, normalizeModelId, rowToModel } from '../src/services/model-resolve.js';

/** 建一个最小 model 表：字段与真实库一致（只保留解析用到的列） */
async function mkDb() {
  const { db } = await openSqlite(':memory:');
  db.exec(`
    CREATE TABLE model (
      id TEXT PRIMARY KEY,
      platform_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      alias TEXT,
      type TEXT,
      context_window INTEGER,
      capabilities_json TEXT
    );
  `);
  const ins = db.prepare(
    'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // 主键 = <平台>-<API名>，与真实库 agens-guest-agnes-3.0-flash 同构
  ins.run('agens-guest-agnes-3.0-flash', 'agens-guest', 'guest', 'agnes-3.0-flash', 'agnes 3.0 Flash', 'llm', 256000, '["tool_use"]');
  ins.run('agens-guest-agnes-2.5-flash', 'agens-guest', 'guest', 'agnes-2.5-flash', 'agnes 2.5 Flash', 'llm', 128000, '[]');
  // ★ 同名 API 名存在于第二个平台：模糊匹配会串用的场景
  ins.run('bailian-agnes-3.0-flash', 'bailian', 'guest', 'agnes-3.0-flash', 'AGNES 3FLASH(百炼)', 'llm', 64000, '[]');
  // 另一个用户也有同名模型：userId 隔离必须生效
  ins.run('agens-other-agnes-3.0-flash', 'agens-guest', 'other', 'agnes-3.0-flash', '别人的模型', 'llm', 32000, '[]');
  return db;
}

describe('findModelRow · 模型标识解析', () => {
  let db: YzSqliteDb;

  beforeEach(async () => {
    db = await mkDb();
    // 回退命中会打 warn，这里静音以免污染测试输出（用例本身断言行为，不依赖日志）
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it('主键命中（正确路径）', () => {
    const row = findModelRow(db, 'agens-guest-agnes-3.0-flash', 'guest');
    expect(row?.id).toBe('agens-guest-agnes-3.0-flash');
    expect(row?.model_id).toBe('agnes-3.0-flash');
    // 主键命中不该走回退，也就没有 warn —— 有 warn 说明解析路径退化了
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('★ 存量裸名（API 名）回退命中 —— 这正是「模型不存在」的直接原因', () => {
    const row = findModelRow(db, 'agnes-3.0-flash', 'guest', 'agens-guest');
    expect(row?.id).toBe('agens-guest-agnes-3.0-flash');
    // 回退要留下痕迹，否则脏数据会一直存在且无人察觉
    expect(console.warn).toHaveBeenCalled();
  });

  it('带平台时同名模型不跨平台串用（最隐蔽的错法）', () => {
    const agens = findModelRow(db, 'agnes-3.0-flash', 'guest', 'agens-guest');
    const bailian = findModelRow(db, 'agnes-3.0-flash', 'guest', 'bailian');
    expect(agens?.platform_id).toBe('agens-guest');
    expect(bailian?.platform_id).toBe('bailian');
    expect(agens?.id).not.toBe(bailian?.id);
  });

  it('不带平台时按 API 名命中第一个，但绝不会命中别的用户', () => {
    const row = findModelRow(db, 'agnes-3.0-flash', 'guest');
    expect(row).toBeDefined();
    expect(row?.user_id).toBe('guest');
  });

  it('user 隔离：别人的同名模型拿不到', () => {
    // other 用户自己的主键仍可取到
    expect(findModelRow(db, 'agens-other-agnes-3.0-flash', 'other')?.user_id).toBe('other');
    // 但 guest 用主键取 other 的模型 → 拒绝
    expect(findModelRow(db, 'agens-other-agnes-3.0-flash', 'guest')).toBeUndefined();
  });

  it('不存在 → undefined，不得模糊匹配到相近模型', () => {
    // 已下线模型：不能因为「长得像」就命中 agnes-2.5-flash
    expect(findModelRow(db, 'agnes-9.9-flash', 'guest', 'agens-guest')).toBeUndefined();
    expect(findModelRow(db, 'agnes', 'guest')).toBeUndefined();
    expect(findModelRow(db, 'flash', 'guest')).toBeUndefined();
  });

  it('空标识 → undefined（不查库）', () => {
    expect(findModelRow(db, '', 'guest')).toBeUndefined();
  });
});

describe('normalizeModelId · 写库口径', () => {
  let db: YzSqliteDb;

  beforeEach(async () => {
    db = await mkDb();
  });
  afterEach(() => db.close());

  it('API 名 → 主键（seed 回填必须写主键）', () => {
    expect(normalizeModelId(db, 'agnes-3.0-flash', 'agens-guest')).toBe('agens-guest-agnes-3.0-flash');
  });

  it('已是主键 → 原样返回（幂等）', () => {
    const pk = 'agens-guest-agnes-3.0-flash';
    expect(normalizeModelId(db, pk, 'agens-guest')).toBe(pk);
  });

  it('未命中 → null（调用方据此决定是否回填默认模型）', () => {
    expect(normalizeModelId(db, 'agnes-9.9-flash', 'agens-guest')).toBeNull();
    expect(normalizeModelId(db, '', 'agens-guest')).toBeNull();
  });

  it('平台限定生效：同名 API 名在指定平台下解析到该平台的主键', () => {
    expect(normalizeModelId(db, 'agnes-3.0-flash', 'bailian')).toBe('bailian-agnes-3.0-flash');
  });
});

describe('rowToModel · 行映射', () => {
  it('字段映射与 workflow-runner / llm-task-manager 一致', () => {
    const m = rowToModel(
      {
        id: 'agens-guest-agnes-3.0-flash',
        platform_id: 'agens-guest',
        model_id: 'agnes-3.0-flash',
        alias: 'agnes 3.0 Flash',
        type: null, // 库里可为空 → 回落 llm
        context_window: null, // 空 → 用默认
        capabilities_json: '["tool_use"]',
      },
      256000,
    );
    expect(m.id).toBe('agens-guest-agnes-3.0-flash');
    expect(m.platformId).toBe('agens-guest');
    expect(m.modelId).toBe('agnes-3.0-flash');
    expect(m.alias).toBe('agnes 3.0 Flash');
    expect(m.type).toBe('llm');
    expect(m.contextWindow).toBe(256000);
    expect(m.capabilities).toEqual(['tool_use']);
  });

  it('capabilities_json 坏数据不抛错，退化为空数组', () => {
    const m = rowToModel(
      {
        id: 'x', platform_id: 'p', model_id: 'm', alias: null, type: 'llm',
        context_window: 1000, capabilities_json: '{不是 JSON',
      },
      256000,
    );
    expect(m.capabilities).toEqual([]);
  });
});
// 候选池故障转移测试（model-candidate-pools P3）。
//
// 场景：长任务几十轮连打同一个模型 → 上游 429/5xx → 任务整体失败。修法是沿候选链换下一个模型重试。
// 这里钉住两处判据（都抽成了可测的纯/近纯函数）：
//   1) `isPoolFailoverable`：什么错误**该**换模型（限流/鉴权配额/服务端错误/网络超时），
//      什么错误**不该**换（400 参数错、404 模型不存在 —— 换了也一样错，换只会掩盖真因）
//   2) `resolveFailoverChain`：当前模型必须排**最前**（上下文已按它建立，只有它真失败才换），
//      当前模型不在池里（用户手选池外模型）时整池作后备，不"纠正"用户选择
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';
import { resolveFailoverChain } from '../src/services/model-pools.js';
import { isPoolFailoverable } from '../src/llm-task-manager.js';

async function mkDb() {
  const { db } = await openSqlite(':memory:');
  db.exec(`
    CREATE TABLE platform (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, llm_enabled INTEGER DEFAULT 1, model_pools_json TEXT);
    CREATE TABLE model (
      id TEXT PRIMARY KEY, platform_id TEXT NOT NULL, user_id TEXT NOT NULL, model_id TEXT NOT NULL,
      alias TEXT, type TEXT, context_window INTEGER, capabilities_json TEXT, description TEXT,
      enabled INTEGER DEFAULT 1, visible INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0, created_at INTEGER
    );
    CREATE TABLE agent (id TEXT PRIMARY KEY, user_id TEXT, is_public INTEGER DEFAULT 0, platform_id TEXT, model_pools_json TEXT);
    CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT);
  `);
  db.prepare('INSERT INTO platform (id, user_id, name) VALUES (?, ?, ?)').run('p1', 'u1', '平台A');
  const insM = db.prepare(
    'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, capabilities_json, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  insM.run('m-flash', 'p1', 'u1', 'flash', 'Flash', 'llm', '[]', 1, 100);
  insM.run('m-pro', 'p1', 'u1', 'pro', 'Pro', 'llm', '[]', 0, 200);
  insM.run('m-max', 'p1', 'u1', 'max', 'Max', 'llm', '[]', 0, 300);
  return db;
}

let db: YzSqliteDb;
beforeEach(async () => { db = await mkDb(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); db.close(); });

describe('isPoolFailoverable · 什么错才该换模型', () => {
  it('限流 / 鉴权配额 / 服务端错误 → 换（正是长任务 429 的场景）', () => {
    expect(isPoolFailoverable({ status: 429 })).toBe(true);
    expect(isPoolFailoverable({ status: 500 })).toBe(true);
    expect(isPoolFailoverable({ status: 502 })).toBe(true);
    expect(isPoolFailoverable({ status: 401 })).toBe(true);
    expect(isPoolFailoverable({ status: 403 })).toBe(true);
  });

  it('★ 客户端错误不换：400/404 换个模型也一样错（换只会掩盖真因）', () => {
    expect(isPoolFailoverable({ status: 400 })).toBe(false);
    expect(isPoolFailoverable({ status: 404 })).toBe(false);
    expect(isPoolFailoverable({ status: 422 })).toBe(false);
  });

  it('网络 / 超时类错误 → 换（无 status，按报文匹配）', () => {
    expect(isPoolFailoverable(new Error('request timeout'))).toBe(true);
    expect(isPoolFailoverable(new Error('connect ECONNREFUSED 127.0.0.1:3000'))).toBe(true);
    expect(isPoolFailoverable(new Error('fetch failed: network error'))).toBe(true);
    expect(isPoolFailoverable(new Error('rate limit exceeded'))).toBe(true);
  });

  it('业务性报错不换（模型能力/参数问题）', () => {
    expect(isPoolFailoverable(new Error('messages 参数非法'))).toBe(false);
    expect(isPoolFailoverable(new Error('model does not support tools'))).toBe(false);
  });

  it('异常输入不抛错', () => {
    expect(() => isPoolFailoverable(undefined)).not.toThrow();
    expect(() => isPoolFailoverable('')).not.toThrow();
    expect(isPoolFailoverable(undefined)).toBe(false);
  });
});

describe('resolveFailoverChain · 候选链顺序', () => {
  const opts = { userId: 'u1' };

  it('未配置池：链 = 自动兜底（当前模型在首位）', () => {
    const chain = resolveFailoverChain(db, opts, 'm-flash', 'llm');
    expect(chain.map((e) => e.model.id)).toEqual(['m-flash', 'm-max', 'm-pro']);
  });

  it('★ 配了池：当前模型提到首位，池中其余按池序接在后面', () => {
    db.prepare('INSERT INTO agent (id, user_id, platform_id, model_pools_json) VALUES (?, ?, ?, ?)').run(
      'a1', 'u1', 'p1', JSON.stringify({ llm: ['m-max', 'm-pro', 'm-flash'] }),
    );
    const chain = resolveFailoverChain(db, { userId: 'u1', agentId: 'a1' }, 'm-flash', 'llm');
    expect(chain.map((e) => e.model.id)).toEqual(['m-flash', 'm-max', 'm-pro']);
  });

  it('当前模型不在池里（用户手选池外模型）→ 整池作后备，不越界"纠正"用户选择', () => {
    db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run(
      'model_pools', JSON.stringify({ llm: ['m-pro'] }),
    );
    const chain = resolveFailoverChain(db, opts, 'some-other-model', 'llm');
    expect(chain.map((e) => e.model.id)).toEqual(['m-pro']);
  });

  it('链内不含重复项', () => {
    db.prepare('INSERT INTO agent (id, user_id, platform_id, model_pools_json) VALUES (?, ?, ?, ?)').run(
      'a1', 'u1', 'p1', JSON.stringify({ llm: ['m-pro', 'm-pro', 'm-flash'] }),
    );
    const chain = resolveFailoverChain(db, { userId: 'u1', agentId: 'a1' }, 'm-pro', 'llm');
    expect(new Set(chain.map((e) => e.model.id)).size).toBe(chain.length);
  });
});

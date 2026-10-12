// 模型候选池解析测试（model-candidate-pools P0）。
//
// 钉住的契约（都是真实会踩的错法，不是凑数）：
//   1) 三层回退顺序：agent → platform → global → autoPool，按**槽位粒度**回退
//      （agent 只配 llm 没配 vision 时，vision 必须落到下一层，而不是整池放弃）
//   2) 槽位匹配：媒体模型（image/video cap）不能进 llm 池；vision 池只收带 vision 能力的 llm
//   3) 生效过滤：停用 / 隐藏（visible=0）/ 平台关闭（llm_enabled=0）的模型不进池，
//      且失效项**不阻断回退**（该层视为空，继续往下走）
//   4) 平台层条目限定本平台模型（跨平台条目剔除）——与 UI 平台池选择器口径一致
//   5) 兜底 autoPool：三层全空 = 全部生效模型按类型筛，is_default 优先（等价现状行为）
//   6) 去重保序 + 损坏 JSON 宽容 + user_id 隔离
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { openSqlite, type YzSqliteDb } from '../src/services/sqlite-driver.js';
import {
  matchesSlot,
  parsePoolsJson,
  sanitizeIds,
  resolvePool,
  readGlobalPools,
  validateModelPools,
  type Slot,
} from '../src/services/model-pools.js';

async function mkDb() {
  const { db } = await openSqlite(':memory:');
  db.exec(`
    CREATE TABLE platform (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      llm_enabled INTEGER DEFAULT 1,
      model_pools_json TEXT
    );
    CREATE TABLE model (
      id TEXT PRIMARY KEY,
      platform_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      alias TEXT,
      type TEXT,
      context_window INTEGER,
      capabilities_json TEXT,
      description TEXT,
      enabled INTEGER DEFAULT 1,
      visible INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER
    );
    CREATE TABLE agent (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      is_public INTEGER DEFAULT 0,
      model_pools_json TEXT
    );
    CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT);
  `);
  const insP = db.prepare('INSERT INTO platform (id, user_id, name, llm_enabled) VALUES (?, ?, ?, ?)');
  insP.run('agens-guest', 'guest', 'agnes', 1);
  insP.run('bailian', 'guest', '百炼', 1);
  insP.run('closed', 'guest', '已关平台', 0); // llm_enabled=0：整平台模型不可用
  const insM = db.prepare(
    'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, capabilities_json, enabled, visible, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // agnes 平台：2 个对话模型（flash 为默认）+ 1 个 vision + 1 个生图
  insM.run('agens-guest-agnes-3.0-flash', 'agens-guest', 'guest', 'agnes-3.0-flash', 'agnes 3.0 Flash', 'llm', '[]', 1, 1, 1, 100);
  insM.run('agens-guest-agnes-2.5-pro', 'agens-guest', 'guest', 'agnes-2.5-pro', 'agnes 2.5 Pro', 'llm', '[]', 1, 1, 0, 200);
  insM.run('agens-guest-agnes-vision', 'agens-guest', 'guest', 'agnes-vision', 'agnes Vision', 'llm', '["vision"]', 1, 1, 0, 300);
  insM.run('agens-guest-agnes-image-2.5', 'agens-guest', 'guest', 'agnes-image-2.5-flash', 'agnes Image', 'image', '["image"]', 1, 1, 0, 400);
  // 百炼平台：1 个对话模型（可与 agnes 的同 API 名，主键不同）
  insM.run('bailian-qwen-max', 'bailian', 'guest', 'qwen-max', 'Qwen Max', 'llm', '[]', 1, 1, 0, 500);
  // 失效样例：停用 / 隐藏 / 平台已关 / 别的用户
  insM.run('agens-guest-agnes-disabled', 'agens-guest', 'guest', 'agnes-disabled', '已停用', 'llm', '[]', 0, 1, 0, 600);
  insM.run('agens-guest-agnes-hidden', 'agens-guest', 'guest', 'agnes-hidden', '已隐藏', 'llm', '[]', 1, 0, 0, 700);
  insM.run('closed-ghost', 'closed', 'guest', 'ghost', '平台关闭', 'llm', '[]', 1, 1, 0, 800);
  insM.run('other-model', 'agens-guest', 'other', 'other', '别人的', 'llm', '[]', 1, 1, 0, 900);
  return db;
}

function setAgentPools(db: YzSqliteDb, id: string, pools: Record<Slot, string[]>, userId = 'guest') {
  db.prepare('INSERT OR REPLACE INTO agent (id, user_id, is_public, model_pools_json) VALUES (?, ?, 0, ?)').run(
    id, userId, JSON.stringify(pools),
  );
}

function setPlatformPools(db: YzSqliteDb, id: string, pools: Record<Slot, string[]>) {
  db.prepare('UPDATE platform SET model_pools_json = ? WHERE id = ?').run(JSON.stringify(pools), id);
}

function setGlobalPools(db: YzSqliteDb, pools: Record<Slot, string[]>) {
  db.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES ('model_pools', ?)").run(JSON.stringify(pools));
}

describe('matchesSlot · 槽位匹配判据', () => {
  it('llm：type=llm 且不带媒体能力', () => {
    expect(matchesSlot('llm', [], 'llm')).toBe(true);
    // 视觉对话模型（vision cap）也是对话模型，可进 llm 池（带图任务才需要切 vision 池）
    expect(matchesSlot('llm', ['vision', 'reasoning'], 'llm')).toBe(true);
    expect(matchesSlot('llm', ['image'], 'llm')).toBe(false);   // 带生图能力 → 专用模型，不进 llm 池
    expect(matchesSlot('llm', ['video'], 'llm')).toBe(false);
    expect(matchesSlot('image', ['image'], 'llm')).toBe(false);
  });

  it('vision：只收带 vision 能力的 llm', () => {
    expect(matchesSlot('llm', ['vision'], 'vision')).toBe(true);
    expect(matchesSlot('llm', [], 'vision')).toBe(false);
    expect(matchesSlot('image', ['image', 'vision'], 'vision')).toBe(false); // 生图模型不算视觉理解
  });

  it('image / video：type 命中或能力命中任一即可', () => {
    expect(matchesSlot('image', [], 'image')).toBe(true);
    expect(matchesSlot('llm', ['image'], 'image')).toBe(true);
    expect(matchesSlot('video', [], 'video')).toBe(true);
    expect(matchesSlot('llm', ['video'], 'video')).toBe(true);
    expect(matchesSlot('llm', [], 'image')).toBe(false);
    expect(matchesSlot('image', ['image'], 'video')).toBe(false);
  });

  it('type 为空按 llm 处理（存量数据宽容）', () => {
    expect(matchesSlot(null, [], 'llm')).toBe(true);
    expect(matchesSlot(null, ['image'], 'llm')).toBe(false);
  });
});

describe('parsePoolsJson / sanitizeIds · 容错与清洗', () => {
  it('损坏 JSON → {}，绝不抛错', () => {
    expect(parsePoolsJson('{不是 JSON')).toEqual({});
    expect(parsePoolsJson(null)).toEqual({});
    expect(parsePoolsJson('[]')).toEqual({}); // 数组不是合法池结构
  });

  it('去重保序，非字符串项丢弃', () => {
    expect(sanitizeIds(['b', 'a', 'b', '', 123, 'a ', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('未知槽位字段忽略，已知槽位保留', () => {
    const pools = parsePoolsJson('{"llm":["m1"],"bogus":["x"],"vision":["m2"]}');
    expect(pools.llm).toEqual(['m1']);
    expect(pools.vision).toEqual(['m2']);
    expect((pools as Record<string, unknown>).bogus).toBeUndefined();
  });
});

describe('resolvePool · 三层回退', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); db.close(); });

  const ctx = { userId: 'guest', agentId: 'a1', platformId: 'agens-guest' };

  it('三层全空 → autoPool 兜底：llm 池 = 全部生效对话模型，is_default 优先', () => {
    const pool = resolvePool(db, ctx, 'llm');
    // closed 平台 / 停用 / 隐藏 / 别人的 全部被生效过滤挡住；
    // vision 对话模型也是 llm（matchesSlot llm 只排除媒体能力），按 created_at DESC 排在后面
    expect(pool.map((e) => e.model.id)).toEqual([
      'agens-guest-agnes-3.0-flash', // is_default=1 优先
      'bailian-qwen-max',
      'agens-guest-agnes-vision',
      'agens-guest-agnes-2.5-pro',
    ]);
    expect(pool[0].source).toBe('auto');
  });

  it('autoPool vision 槽位只含 vision 模型；image 槽位只含生图模型', () => {
    expect(resolvePool(db, ctx, 'vision').map((e) => e.model.id)).toEqual(['agens-guest-agnes-vision']);
    expect(resolvePool(db, ctx, 'image').map((e) => e.model.id)).toEqual(['agens-guest-agnes-image-2.5']);
  });

  it('agent 层命中 → 直接用，保池内顺序', () => {
    setAgentPools(db, 'a1', { llm: ['bailian-qwen-max', 'agens-guest-agnes-3.0-flash'] });
    const pool = resolvePool(db, ctx, 'llm');
    expect(pool.map((e) => e.model.id)).toEqual(['bailian-qwen-max', 'agens-guest-agnes-3.0-flash']);
    expect(pool.every((e) => e.source === 'agent')).toBe(true);
  });

  it('★ 按槽位粒度回退：agent 只配 llm，vision 落到 autoPool（不整池放弃）', () => {
    setAgentPools(db, 'a1', { llm: ['bailian-qwen-max'] });
    const llmPool = resolvePool(db, ctx, 'llm');
    expect(llmPool.map((e) => e.model.id)).toEqual(['bailian-qwen-max']);
    const visionPool = resolvePool(db, ctx, 'vision');
    expect(visionPool.map((e) => e.model.id)).toEqual(['agens-guest-agnes-vision']);
    expect(visionPool[0].source).toBe('auto');
  });

  it('agent 层全失效（引用已停用模型）→ 回落平台层', () => {
    setAgentPools(db, 'a1', { llm: ['agens-guest-agnes-disabled'] });
    setPlatformPools(db, 'agens-guest', { llm: ['agens-guest-agnes-2.5-pro'] });
    const pool = resolvePool(db, ctx, 'llm');
    expect(pool.map((e) => e.model.id)).toEqual(['agens-guest-agnes-2.5-pro']);
    expect(pool[0].source).toBe('platform');
  });

  it('平台层命中且限定本平台：跨平台条目被剔除', () => {
    setPlatformPools(db, 'agens-guest', { llm: ['bailian-qwen-max', 'agens-guest-agnes-2.5-pro'] });
    const pool = resolvePool(db, ctx, 'llm');
    expect(pool.map((e) => e.model.id)).toEqual(['agens-guest-agnes-2.5-pro']);
    expect(pool[0].source).toBe('platform');
  });

  it('agent 与平台都空 → 落全局层', () => {
    setGlobalPools(db, { llm: ['agens-guest-agnes-2.5-pro', 'bailian-qwen-max'] });
    const pool = resolvePool(db, ctx, 'llm');
    expect(pool.map((e) => e.model.id)).toEqual(['agens-guest-agnes-2.5-pro', 'bailian-qwen-max']);
    expect(pool[0].source).toBe('global');
  });

  it('平台层配置了但该槽位为空 → 跳过平台层落全局（槽位粒度）', () => {
    setPlatformPools(db, 'agens-guest', { image: ['agens-guest-agnes-image-2.5'] }); // 只配了 image
    setGlobalPools(db, { llm: ['bailian-qwen-max'] });
    const pool = resolvePool(db, ctx, 'llm');
    expect(pool.map((e) => e.model.id)).toEqual(['bailian-qwen-max']);
    expect(pool[0].source).toBe('global');
  });

  it('agent 配了错槽位模型（image 进 llm 池）→ 剔除后该层视为空，继续回退', () => {
    setAgentPools(db, 'a1', { llm: ['agens-guest-agnes-image-2.5'] });
    const pool = resolvePool(db, ctx, 'llm');
    expect(pool[0].source).toBe('auto');
  });

  it('去重保序：agent 池里同一模型出现两次只留首个', () => {
    setAgentPools(db, 'a1', { llm: ['bailian-qwen-max', 'bailian-qwen-max', 'agens-guest-agnes-3.0-flash'] });
    expect(resolvePool(db, ctx, 'llm').map((e) => e.model.id)).toEqual(['bailian-qwen-max', 'agens-guest-agnes-3.0-flash']);
  });

  it('user_id 隔离：池里引用别的用户的模型被剔除', () => {
    setAgentPools(db, 'a1', { llm: ['other-model'] });
    const pool = resolvePool(db, ctx, 'llm');
    expect(pool.map((e) => e.model.id)).not.toContain('other-model');
    expect(pool[0].source).toBe('auto');
  });

  it('agentId 指向不存在的智能体 → 跳过 L1（不报错）', () => {
    const pool = resolvePool(db, { userId: 'guest', agentId: 'ghost-agent' }, 'llm');
    expect(pool[0].source).toBe('auto');
  });

  it('无 agentId / platformId 上下文时跳过对应层（媒体生成等无 agent 场景）', () => {
    setAgentPools(db, 'a1', { llm: ['bailian-qwen-max'] });
    const pool = resolvePool(db, { userId: 'guest' }, 'llm');
    expect(pool[0].source).toBe('auto');
  });

  it('公开智能体（is_public=1）的池对其他用户生效', () => {
    db.prepare('INSERT INTO agent (id, user_id, is_public, model_pools_json) VALUES (?, ?, 1, ?)').run(
      'pub-agent', 'other', JSON.stringify({ llm: ['bailian-qwen-max'] }),
    );
    const pool = resolvePool(db, { userId: 'guest', agentId: 'pub-agent' }, 'llm');
    expect(pool.map((e) => e.model.id)).toEqual(['bailian-qwen-max']);
  });
});

describe('readGlobalPools · 全局层读取', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); });
  afterEach(() => db.close());

  it('未配置 → {}；损坏 → {}', () => {
    expect(readGlobalPools(db)).toEqual({});
    db.prepare("INSERT INTO app_config (key, value) VALUES ('model_pools', '垃圾')").run();
    expect(readGlobalPools(db)).toEqual({});
  });
});

describe('validateModelPools · 写入口校验（读宽容、写必须挡住错配）', () => {
  let db: YzSqliteDb;
  beforeEach(async () => { db = await mkDb(); });
  afterEach(() => db.close());

  it('合法池通过并规范化（去空项/非字符串项）', () => {
    const v = validateModelPools(db, 'guest', {
      llm: ['bailian-qwen-max', '', 'agens-guest-agnes-3.0-flash'],
      image: ['agens-guest-agnes-image-2.5'],
    });
    expect(v.ok).toBe(true);
    expect(v.pools!.llm).toEqual(['bailian-qwen-max', 'agens-guest-agnes-3.0-flash']);
  });

  it('★ 错槽位拒绝：image 模型进 llm 池 → 明确错误（不能到运行时才爆）', () => {
    const v = validateModelPools(db, 'guest', { llm: ['agens-guest-agnes-image-2.5'] });
    expect(v.ok).toBe(false);
    expect(v.error).toContain('agnes Image');
    expect(v.error).toContain('llm');
  });

  it('vision 池收普通 llm → 拒绝（缺 vision 能力）', () => {
    const v = validateModelPools(db, 'guest', { vision: ['bailian-qwen-max'] });
    expect(v.ok).toBe(false);
  });

  it('越权引用（别的用户的模型）拒绝', () => {
    const v = validateModelPools(db, 'guest', { llm: ['other-model'] });
    expect(v.ok).toBe(false);
    expect(v.error).toContain('不存在或不属于当前用户');
  });

  it('不存在的模型 id 拒绝', () => {
    expect(validateModelPools(db, 'guest', { llm: ['ghost-id'] }).ok).toBe(false);
  });

  it('非对象 / 槽位值非数组拒绝；未知槽位字段忽略', () => {
    expect(validateModelPools(db, 'guest', []).ok).toBe(false);
    expect(validateModelPools(db, 'guest', 'llm').ok).toBe(false);
    expect(validateModelPools(db, 'guest', { llm: 'not-array' }).ok).toBe(false);
    const v = validateModelPools(db, 'guest', { llm: ['bailian-qwen-max'], bogus: ['x'] });
    expect(v.ok).toBe(true);
    expect((v.pools as Record<string, unknown>).bogus).toBeUndefined();
  });

  it('空对象通过（清空池 = 合法操作）', () => {
    const v = validateModelPools(db, 'guest', {});
    expect(v.ok).toBe(true);
    expect(v.pools).toEqual({});
  });
});
